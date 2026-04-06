import { WebSocket } from "ws";
import { db } from "../../db";
import { chatMessages, chatSettings, users } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { chatRateLimiter } from "../../lib/rate-limiter";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";
import { getCachedUserBlockLists, isChatEnabled } from "../../lib/redis";
import { sanitizePlainText } from "../../lib/input-security";

/**
 * Handle sending a new chat message.
 * Optimized: reduced from 5 DB queries to 1-2 (cached block lists + async write)
 */
export async function handleChatMessage(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { receiverId, content, messageType = "text", attachmentUrl, isDisappearing = false, disappearAfterRead = false, replyToId } = data;

  // SECURITY: Validate receiverId
  if (!receiverId || typeof receiverId !== 'string' || receiverId.length > 100) {
    ws.send(JSON.stringify({ type: "chat_error", error: "Invalid receiver" }));
    return;
  }

  // Rate limiting
  const rateLimitResult = chatRateLimiter.check(ws.userId);
  if (!rateLimitResult.allowed) {
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
    ws.send(JSON.stringify({ type: "chat_error", error: "Chat is currently disabled" }));
    return;
  }

  // SECURITY: Validate content - allow empty content for media/voice messages
  const isMediaMessage = messageType && messageType !== "text";
  if (!isMediaMessage) {
    if (!content || typeof content !== 'string') {
      ws.send(JSON.stringify({ type: "chat_error", error: "Message content is required" }));
      return;
    }
  }

  // SECURITY: Sanitize HTML tags and enforce max length
  const maxLen = 2000;
  const sanitizedContent = content ? sanitizePlainText(content, { maxLength: maxLen }) : "";
  if (!sanitizedContent && !isMediaMessage) {
    ws.send(JSON.stringify({ type: "chat_error", error: "Message content is required" }));
    return;
  }

  // SECURITY: Limit attachmentUrl length
  const safeAttachmentUrl = attachmentUrl ? String(attachmentUrl).slice(0, 2048) : undefined;

  // Use cached block/mute lists instead of 2 DB queries per message
  const senderUserId = ws.userId;
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
    ws.send(JSON.stringify({ type: "chat_error", error: "You have blocked this user" }));
    return;
  }

  if (recipientLists.blockedUsers.includes(senderUserId)) {
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

  const messageWithSender = {
    ...message,
    sender,
  };

  // Send to recipient if online (and not muted)
  if (!recipientLists.mutedUsers.includes(senderUserId)) {
    const recipientSockets = clients.get(receiverId);
    if (recipientSockets) {
      const outgoing = JSON.stringify({ type: "new_chat_message", data: messageWithSender });
      recipientSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(outgoing);
        }
      });
    }
  }

  // Confirm to sender
  ws.send(JSON.stringify({ type: "chat_message_sent", data: messageWithSender }));
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
