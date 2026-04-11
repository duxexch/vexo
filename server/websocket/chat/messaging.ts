import { WebSocket } from "ws";
import { db } from "../../db";
import { chatMessages, chatSettings, users } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { chatRateLimiter } from "../../lib/rate-limiter";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";
import { getCachedUserBlockLists, getRedisClient, isChatEnabled } from "../../lib/redis";
import { sanitizePlainText } from "../../lib/input-security";
import { sendNotification } from "../notifications";

const CHAT_MESSAGE_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const CHAT_MESSAGE_DEDUPE_PENDING_TTL_MS = 60 * 1000;

function normalizeClientMessageId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  return normalized.slice(0, 128);
}

function buildChatNotificationPreview(messageType: string, content: string): { en: string; ar: string } {
  if (content && content.trim().length > 0) {
    const preview = content.trim().slice(0, 120);
    return { en: preview, ar: preview };
  }

  if (messageType === "image") {
    return { en: "Sent a photo", ar: "أرسل صورة" };
  }
  if (messageType === "video") {
    return { en: "Sent a video", ar: "أرسل فيديو" };
  }
  if (messageType === "voice") {
    return { en: "Sent a voice message", ar: "أرسل رسالة صوتية" };
  }

  return { en: "Sent a message", ar: "أرسل رسالة" };
}

/**
 * Handle sending a new chat message.
 * Optimized: reduced from 5 DB queries to 1-2 (cached block lists + async write)
 */
export async function handleChatMessage(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { receiverId, content, messageType = "text", attachmentUrl, isDisappearing = false, disappearAfterRead = false, replyToId } = data;
  const clientMessageId = normalizeClientMessageId(data?.clientMessageId);
  const senderUserId = ws.userId;
  const dedupeKey = clientMessageId ? `chat:msg:dedupe:${senderUserId}:${clientMessageId}` : null;

  if (dedupeKey) {
    try {
      const lockSetResult = await getRedisClient().set(
        dedupeKey,
        "pending",
        "PX",
        CHAT_MESSAGE_DEDUPE_PENDING_TTL_MS,
        "NX",
      );

      if (lockSetResult !== "OK") {
        const existingMarker = await getRedisClient().get(dedupeKey);

        if (existingMarker && existingMarker !== "pending") {
          const [existingMessage] = await db
            .select()
            .from(chatMessages)
            .where(and(
              eq(chatMessages.id, existingMarker),
              eq(chatMessages.senderId, senderUserId),
            ))
            .limit(1);

          if (existingMessage) {
            const [sender] = await db.select({
              id: users.id,
              username: users.username,
              firstName: users.firstName,
              lastName: users.lastName,
              avatarUrl: users.profilePicture,
            }).from(users).where(eq(users.id, senderUserId));

            ws.send(JSON.stringify({
              type: "chat_message_sent",
              data: {
                ...existingMessage,
                sender,
              },
              clientMessageId,
              duplicate: true,
              ackVersion: 1,
              acceptedAt: new Date(existingMessage.createdAt).toISOString(),
              messageId: existingMessage.id,
              delivered: false,
            }));
            return;
          }
        }

        ws.send(JSON.stringify({
          type: "chat_error",
          error: "Message is already being processed",
          code: "message_in_flight",
          clientMessageId,
        }));
        return;
      }
    } catch {
      // Redis dedupe is best-effort; message sending still proceeds.
    }
  }

  // SECURITY: Validate receiverId
  if (!receiverId || typeof receiverId !== 'string' || receiverId.length > 100) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({ type: "chat_error", error: "Invalid receiver" }));
    return;
  }

  // Rate limiting
  const rateLimitResult = chatRateLimiter.check(ws.userId);
  if (!rateLimitResult.allowed) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({
      type: "chat_error",
      error: "Too many messages, please wait",
      code: "rate_limit",
      retryAfterMs: rateLimitResult.retryAfterMs
    }));
    return;
  }

  // Check if chat is enabled — cached (was 1 DB query per message)
  const chatEnabled = await isChatEnabled(async () => {
    const settings = await db.select({
      key: chatSettings.key,
      value: chatSettings.value,
    }).from(chatSettings).where(
      or(eq(chatSettings.key, "chat_enabled"), eq(chatSettings.key, "isEnabled"))
    );

    const canonical = settings.find((item) => item.key === "chat_enabled")
      || settings.find((item) => item.key === "isEnabled");

    return !canonical || canonical.value !== "false";
  });
  if (!chatEnabled) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({ type: "chat_error", error: "Chat is currently disabled" }));
    return;
  }

  // SECURITY: Validate content - allow empty content for media/voice messages
  const isMediaMessage = messageType && messageType !== "text";
  if (!isMediaMessage) {
    if (!content || typeof content !== 'string') {
      if (dedupeKey) {
        await getRedisClient().del(dedupeKey).catch(() => { });
      }
      ws.send(JSON.stringify({ type: "chat_error", error: "Message content is required" }));
      return;
    }
  }

  // SECURITY: Sanitize HTML tags and enforce max length
  const maxLen = 2000;
  const sanitizedContent = content ? sanitizePlainText(content, { maxLength: maxLen }) : "";
  if (!sanitizedContent && !isMediaMessage) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({ type: "chat_error", error: "Message content is required" }));
    return;
  }

  // SECURITY: Limit attachmentUrl length
  const safeAttachmentUrl = attachmentUrl ? String(attachmentUrl).slice(0, 2048) : undefined;

  // Use cached block/mute lists instead of 2 DB queries per message
  const [senderLists, recipientLists] = await Promise.all([
    getCachedUserBlockLists(senderUserId, async (id) => {
      const [user] = await db.select({ blockedUsers: users.blockedUsers, mutedUsers: users.mutedUsers })
        .from(users).where(eq(users.id, id));
      return user || null;
    }),
    getCachedUserBlockLists(receiverId, async (id) => {
      const [user] = await db.select({ blockedUsers: users.blockedUsers, mutedUsers: users.mutedUsers })
        .from(users).where(eq(users.id, id));
      return user || null;
    }),
  ]);

  if (senderLists.blockedUsers.includes(receiverId)) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({ type: "chat_error", error: "You have blocked this user" }));
    return;
  }

  if (recipientLists.blockedUsers.includes(senderUserId)) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({ type: "chat_error", error: "Cannot send message to this user" }));
    return;
  }

  // PRIVACY: No word filtering on private messages - user privacy first

  // Save message + get sender info in a single parallel call (was 2 sequential queries)
  const [insertResult, senderResult] = await Promise.all([
    db.insert(chatMessages).values({
      senderId: senderUserId,
      receiverId,
      content: sanitizedContent,
      messageType: String(messageType).slice(0, 20),
      attachmentUrl: safeAttachmentUrl,
      isDisappearing: Boolean(isDisappearing),
      disappearAfterRead: Boolean(disappearAfterRead),
      replyToId: replyToId ? String(replyToId).slice(0, 100) : undefined,
    }).returning(),
    db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.profilePicture,
    }).from(users).where(eq(users.id, senderUserId)),
  ]);

  const message = insertResult[0];
  const sender = senderResult[0];

  if (dedupeKey) {
    await getRedisClient()
      .set(dedupeKey, message.id, "PX", CHAT_MESSAGE_DEDUPE_TTL_MS)
      .catch(() => { });
  }

  const messageWithSender = {
    ...message,
    sender,
  };

  // Send to recipient if online (and not muted)
  let deliveredToRecipient = false;
  if (!recipientLists.mutedUsers.includes(senderUserId)) {
    const recipientSockets = clients.get(receiverId);
    if (recipientSockets) {
      const outgoing = JSON.stringify({ type: "new_chat_message", data: messageWithSender, clientMessageId });
      recipientSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(outgoing);
          deliveredToRecipient = true;
        }
      });
    }
  }

  // Confirm to sender
  ws.send(JSON.stringify({
    type: "chat_message_sent",
    data: messageWithSender,
    clientMessageId,
    duplicate: false,
    ackVersion: 1,
    acceptedAt: new Date(message.createdAt).toISOString(),
    messageId: message.id,
    delivered: deliveredToRecipient,
  }));

  const senderDisplayName = sender?.firstName || sender?.username || "User";
  const preview = buildChatNotificationPreview(String(messageType), sanitizedContent);
  const chatLinkUserId = encodeURIComponent(senderUserId);

  // Durable notification record + web push fallback for offline recipients.
  // This improves reliability when websocket delivery is missed or app is backgrounded.
  void sendNotification(receiverId, {
    type: "system",
    priority: "normal",
    title: `${senderDisplayName} sent you a message`,
    titleAr: `رسالة جديدة من ${senderDisplayName}`,
    message: preview.en,
    messageAr: preview.ar,
    link: `/chat?user=${chatLinkUserId}`,
    metadata: JSON.stringify({
      event: "chat_message",
      senderId: senderUserId,
      messageType: String(messageType || "text"),
      messageId: message.id,
    }),
  }).catch(() => {
    // Notification failures should not break the chat send flow.
  });
}

/**
 * Handle typing indicator forwarding.
 */
export async function handleTyping(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { receiverId, isTyping } = data;
  const recipientSockets = clients.get(receiverId);
  if (recipientSockets) {
    const outgoing = JSON.stringify({
      type: "typing_indicator",
      data: { senderId: ws.userId, isTyping }
    });
    recipientSockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(outgoing);
      }
    });
  }
}
