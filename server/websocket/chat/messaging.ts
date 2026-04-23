import { WebSocket } from "ws";
import { db } from "../../db";
import { chatAutoDeletePermissions, chatMediaPermissions, chatMessages, projectCurrencyLedger, projectCurrencyWallets, systemConfig, users } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { chatRateLimiter } from "../../lib/rate-limiter";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";
import { getCachedUserBlockLists, getRedisClient, isChatEnabled } from "../../lib/redis";
import { sanitizePlainText } from "../../lib/input-security";
import { sendNotification } from "../notifications";
import { resolveChatEnabledFlagFromDb } from "../../lib/chat-settings";
import { isPinUnlocked } from "../../routes/chat-features/pin-lock";
import { applyStrangerUnlockFee } from "../../lib/chat-pricing";

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

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

async function getConfigDecimal(key: string, fallback: number): Promise<number> {
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  const parsed = Number.parseFloat(config?.value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Handle sending a new chat message.
 * Optimized: reduced from 5 DB queries to 1-2 (cached block lists + async write)
 */
export async function handleChatMessage(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { receiverId, content, messageType = "text", attachmentUrl, isDisappearing = false, disappearAfterRead = false, replyToId } = data;
  const normalizedMessageType = String(messageType || "text").trim().toLowerCase();
  const isVoiceMessage = normalizedMessageType === "voice" || normalizedMessageType === "audio";
  const isImageMessage = normalizedMessageType === "image";
  const isVideoMessage = normalizedMessageType === "video";
  const isMediaMessage = isVoiceMessage || isImageMessage || isVideoMessage;
  const storedMessageType = isVoiceMessage ? "voice" : normalizedMessageType;
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
  const chatEnabled = await isChatEnabled(resolveChatEnabledFlagFromDb);
  if (!chatEnabled) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({ type: "chat_error", error: "Chat is currently disabled" }));
    return;
  }

  const [senderPinState] = await db.select({
    chatPinEnabled: users.chatPinEnabled,
  }).from(users).where(eq(users.id, senderUserId)).limit(1);
  if (senderPinState?.chatPinEnabled && !isPinUnlocked(senderUserId)) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({
      type: "chat_error",
      error: "Chat PIN is locked. Unlock chat first.",
      code: "chat_pin_locked",
      clientMessageId,
    }));
    return;
  }

  if (!isMediaMessage && storedMessageType !== "text") {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({
      type: "chat_error",
      error: "Invalid message type",
      code: "invalid_message_type",
      clientMessageId,
    }));
    return;
  }

  // SECURITY: Validate content - allow empty content only for supported media messages
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
  if (isMediaMessage && !safeAttachmentUrl) {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    ws.send(JSON.stringify({
      type: "chat_error",
      error: "Attachment is required for media messages",
      code: "attachment_required",
      clientMessageId,
    }));
    return;
  }

  const now = new Date();

  if ((isImageMessage || isVideoMessage) && safeAttachmentUrl) {
    const [mediaPermission] = await db.select({
      mediaEnabled: chatMediaPermissions.mediaEnabled,
      revokedAt: chatMediaPermissions.revokedAt,
      expiresAt: chatMediaPermissions.expiresAt,
    }).from(chatMediaPermissions)
      .where(eq(chatMediaPermissions.userId, senderUserId))
      .limit(1);

    const mediaAllowed = Boolean(
      mediaPermission
      && mediaPermission.mediaEnabled
      && !mediaPermission.revokedAt
      && (!mediaPermission.expiresAt || mediaPermission.expiresAt > now)
    );

    if (!mediaAllowed) {
      if (dedupeKey) {
        await getRedisClient().del(dedupeKey).catch(() => { });
      }
      ws.send(JSON.stringify({
        type: "chat_error",
        error: "Media permission required. Purchase to unlock.",
        code: "media_permission_required",
        clientMessageId,
      }));
      return;
    }
  }

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

  // PRICING: Stranger DM unlock — friends-free / pay-once-per-pair model.
  // Mirrors the REST endpoint enforcement so the WS path cannot bypass it.
  {
    const confirmUnlock = data?.confirmUnlock === true;
    const unlockResult = await applyStrangerUnlockFee({
      senderId: senderUserId,
      receiverId,
      confirm: confirmUnlock,
    });
    if (unlockResult.kind === "needs_unlock") {
      if (dedupeKey) await getRedisClient().del(dedupeKey).catch(() => {});
      ws.send(JSON.stringify({
        type: "chat_error",
        error: "Conversation is locked",
        code: "chat_unlock_required",
        unlock: { fee: unlockResult.amount, balance: unlockResult.balance, currency: "VXC", receiverId },
        clientMessageId,
      }));
      return;
    }
    if (unlockResult.kind === "insufficient_balance") {
      if (dedupeKey) await getRedisClient().del(dedupeKey).catch(() => {});
      ws.send(JSON.stringify({
        type: "chat_error",
        error: "Insufficient balance to unlock conversation",
        code: "chat_unlock_insufficient",
        unlock: { fee: unlockResult.required, balance: unlockResult.balance, currency: "VXC", receiverId },
        clientMessageId,
      }));
      return;
    }
  }

  // PRIVACY: No word filtering on private messages - user privacy first

  const wantsDisappearing = Boolean(isDisappearing || disappearAfterRead);
  let resolvedDeleteAfterMinutes = 60;
  const voiceMessagePrice = isVoiceMessage ? toMoney(await getConfigDecimal("chat_voice_message_price", 0)) : 0;

  if (wantsDisappearing) {
    const [autoDeletePermission] = await db.select({
      autoDeleteEnabled: chatAutoDeletePermissions.autoDeleteEnabled,
      deleteAfterMinutes: chatAutoDeletePermissions.deleteAfterMinutes,
      revokedAt: chatAutoDeletePermissions.revokedAt,
      expiresAt: chatAutoDeletePermissions.expiresAt,
    }).from(chatAutoDeletePermissions)
      .where(eq(chatAutoDeletePermissions.userId, senderUserId))
      .limit(1);

    const hasAutoDeletePermission = Boolean(
      autoDeletePermission
      && autoDeletePermission.autoDeleteEnabled
      && !autoDeletePermission.revokedAt
      && (!autoDeletePermission.expiresAt || autoDeletePermission.expiresAt > now)
    );

    if (!hasAutoDeletePermission) {
      if (dedupeKey) {
        await getRedisClient().del(dedupeKey).catch(() => { });
      }
      ws.send(JSON.stringify({
        type: "chat_error",
        error: "Auto-delete permission required",
        code: "auto_delete_permission_required",
        clientMessageId,
      }));
      return;
    }

    resolvedDeleteAfterMinutes = Math.max(1, Number(autoDeletePermission?.deleteAfterMinutes || 60));
  }

  const insertedMessage = await db.transaction(async (tx) => {
    if (voiceMessagePrice > 0) {
      await tx.execute(sql`
        INSERT INTO project_currency_wallets (user_id)
        VALUES (${senderUserId})
        ON CONFLICT (user_id) DO NOTHING
      `);

      const [wallet] = await tx.select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, senderUserId))
        .for('update');

      if (!wallet) {
        throw new Error("Project currency wallet not found");
      }

      let earnedBalance = parseFloat(wallet.earnedBalance || "0");
      let purchasedBalance = parseFloat(wallet.purchasedBalance || "0");
      const totalBalance = earnedBalance + purchasedBalance;
      if (totalBalance < voiceMessagePrice) {
        throw new Error("Insufficient project currency balance for voice message");
      }

      let remaining = voiceMessagePrice;
      if (earnedBalance >= remaining) {
        earnedBalance = toMoney(earnedBalance - remaining);
        remaining = 0;
      } else {
        remaining = toMoney(remaining - earnedBalance);
        earnedBalance = 0;
        purchasedBalance = toMoney(Math.max(0, purchasedBalance - remaining));
      }

      const balanceBefore = parseFloat(wallet.totalBalance || "0");
      const balanceAfter = toMoney(earnedBalance + purchasedBalance);

      await tx.update(projectCurrencyWallets)
        .set({
          earnedBalance: earnedBalance.toFixed(2),
          purchasedBalance: purchasedBalance.toFixed(2),
          totalBalance: balanceAfter.toFixed(2),
          totalSpent: toMoney(parseFloat(wallet.totalSpent || "0") + voiceMessagePrice).toFixed(2),
          updatedAt: now,
        })
        .where(eq(projectCurrencyWallets.id, wallet.id));

      await tx.insert(projectCurrencyLedger).values({
        userId: senderUserId,
        walletId: wallet.id,
        type: "admin_adjustment",
        amount: (-voiceMessagePrice).toFixed(2),
        balanceBefore: toMoney(balanceBefore).toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        referenceId: `chat_voice_message:${senderUserId}:${clientMessageId || Date.now()}`,
        referenceType: "chat_voice_message_charge",
        description: "Voice message send charge",
      });
    }

    const [message] = await tx.insert(chatMessages).values({
      senderId: senderUserId,
      receiverId,
      content: sanitizedContent,
      messageType: storedMessageType.slice(0, 20),
      attachmentUrl: safeAttachmentUrl,
      isDisappearing: Boolean(isDisappearing),
      disappearAfterRead: Boolean(disappearAfterRead),
      autoDeleteAt: Boolean(isDisappearing) ? new Date(now.getTime() + (resolvedDeleteAfterMinutes * 60 * 1000)) : null,
      replyToId: replyToId ? String(replyToId).slice(0, 100) : undefined,
    }).returning();

    return message;
  }).catch(async (error: unknown) => {
    if (dedupeKey) {
      await getRedisClient().del(dedupeKey).catch(() => { });
    }
    const message = error instanceof Error ? error.message : String(error);
    ws.send(JSON.stringify({
      type: "chat_error",
      error: message,
      code: message.includes("Insufficient") ? "insufficient_voice_message_balance" : "chat_message_send_failed",
      clientMessageId,
    }));
    return null;
  });

  if (!insertedMessage) {
    return;
  }

  const message = insertedMessage;
  const [sender] = await db.select({
    id: users.id,
    username: users.username,
    firstName: users.firstName,
    lastName: users.lastName,
    avatarUrl: users.profilePicture,
  }).from(users).where(eq(users.id, senderUserId));

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
  const preview = buildChatNotificationPreview(storedMessageType, sanitizedContent);
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
      messageType: storedMessageType,
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

  const receiverId = typeof data?.receiverId === "string" ? data.receiverId.trim() : "";
  if (!receiverId || receiverId.length > 100 || receiverId === ws.userId) {
    return;
  }

  const typingState = Boolean(data?.isTyping);

  const [senderLists, recipientLists] = await Promise.all([
    getCachedUserBlockLists(ws.userId, async (id) => {
      const [user] = await db
        .select({ blockedUsers: users.blockedUsers, mutedUsers: users.mutedUsers })
        .from(users)
        .where(eq(users.id, id));
      return user || null;
    }),
    getCachedUserBlockLists(receiverId, async (id) => {
      const [user] = await db
        .select({ blockedUsers: users.blockedUsers, mutedUsers: users.mutedUsers })
        .from(users)
        .where(eq(users.id, id));
      return user || null;
    }),
  ]);

  if (senderLists.blockedUsers.includes(receiverId)) {
    return;
  }

  if (recipientLists.blockedUsers.includes(ws.userId)) {
    return;
  }

  if (recipientLists.mutedUsers.includes(ws.userId)) {
    return;
  }

  const recipientSockets = clients.get(receiverId);
  if (recipientSockets) {
    const outgoing = JSON.stringify({
      type: "typing_indicator",
      data: { senderId: ws.userId, isTyping: typingState }
    });
    recipientSockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(outgoing);
      }
    });
  }
}
