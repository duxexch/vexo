import type { Express, Response } from "express";
import { WebSocket } from "ws";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { chatAutoDeletePermissions, chatMediaPermissions, chatMessages, projectCurrencyLedger, projectCurrencyWallets, systemConfig, users } from "@shared/schema";
import { chatRateLimiter } from "../../lib/rate-limiter";
import { sanitizePlainText } from "../../lib/input-security";
import { isUserBlocked } from "../../lib/user-blocking";
import { applyStrangerUnlockFee } from "../../lib/chat-pricing";
import { getRedisClient, isChatEnabled } from "../../lib/redis";
import { resolveChatEnabledFlagFromDb } from "../../lib/chat-settings";
import { isPinUnlocked } from "../chat-features/pin-lock";
import { clients } from "../../websocket/shared";
import { sendNotification } from "../../websocket/notifications";

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

export function registerChatMessagingRoutes(app: Express): void {
  const toMoney = (value: number): number => Number(value.toFixed(2));

  const getConfigDecimal = async (key: string, fallback: number): Promise<number> => {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
    const parsed = Number.parseFloat(config?.value || "");
    return Number.isFinite(parsed) ? parsed : fallback;
  };


  // Get message history with a specific user
  app.get("/api/chat/:userId/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const otherUserId = req.params.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const messages = await db.select()
        .from(chatMessages)
        .where(or(
          and(eq(chatMessages.senderId, userId), eq(chatMessages.receiverId, otherUserId)),
          and(eq(chatMessages.senderId, otherUserId), eq(chatMessages.receiverId, userId))
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(messages.reverse());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Send a message (fallback if WebSocket not available)
  app.post("/api/chat/:userId/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const senderId = req.user!.id;
      const receiverId = req.params.userId;
      const {
        content,
        messageType = "text",
        attachmentUrl,
        isDisappearing = false,
        disappearAfterRead = false,
        replyToId,
        clientMessageId: rawClientMessageId,
      } = req.body;
      const normalizedMessageType = String(messageType || "text").trim().toLowerCase();
      const isVoiceMessage = normalizedMessageType === "voice" || normalizedMessageType === "audio";
      const isImageMessage = normalizedMessageType === "image";
      const isVideoMessage = normalizedMessageType === "video";
      const isMediaMessage = isVoiceMessage || isImageMessage || isVideoMessage;
      const storedMessageType = isVoiceMessage ? "voice" : normalizedMessageType;
      const clientMessageId = normalizeClientMessageId(rawClientMessageId);
      const dedupeKey = clientMessageId ? `chat:msg:dedupe:${senderId}:${clientMessageId}` : null;
      const releaseDedupeLock = async () => {
        if (dedupeKey) {
          await getRedisClient().del(dedupeKey).catch(() => { });
        }
      };

      if (dedupeKey) {
        const lockSetResult = await getRedisClient().set(
          dedupeKey,
          "pending",
          "PX",
          CHAT_MESSAGE_DEDUPE_PENDING_TTL_MS,
          "NX",
        ).catch(() => null);

        if (lockSetResult && lockSetResult !== "OK") {
          const existingMarker = await getRedisClient().get(dedupeKey).catch(() => null);

          if (existingMarker && existingMarker !== "pending") {
            const [existingMessage] = await db
              .select()
              .from(chatMessages)
              .where(and(
                eq(chatMessages.id, existingMarker),
                eq(chatMessages.senderId, senderId),
              ))
              .limit(1);

            if (existingMessage) {
              return res.status(200).json(existingMessage);
            }
          }

          return res.status(409).json({
            error: "Message is already being processed",
            code: "message_in_flight",
            clientMessageId,
          });
        }
      }

      // SECURITY: Validate receiverId
      if (!receiverId || receiverId.length > 100) {
        await releaseDedupeLock();
        return res.status(400).json({ error: "Invalid receiver" });
      }

      // SECURITY: Rate limit
      const rateLimitResult = chatRateLimiter.check(senderId);
      if (!rateLimitResult.allowed) {
        await releaseDedupeLock();
        return res.status(429).json({ error: "Too many messages, please wait" });
      }

      const chatEnabled = await isChatEnabled(resolveChatEnabledFlagFromDb);
      if (!chatEnabled) {
        await releaseDedupeLock();
        return res.status(403).json({ error: "Chat is currently disabled" });
      }

      const [senderPinState] = await db.select({
        chatPinEnabled: users.chatPinEnabled,
      }).from(users).where(eq(users.id, senderId)).limit(1);
      if (senderPinState?.chatPinEnabled && !isPinUnlocked(senderId)) {
        await releaseDedupeLock();
        return res.status(423).json({
          error: "Chat PIN is locked. Unlock chat first.",
          code: "chat_pin_locked",
        });
      }

      if (!isMediaMessage && storedMessageType !== "text") {
        await releaseDedupeLock();
        return res.status(400).json({ error: "Invalid message type" });
      }

      if (!isMediaMessage && (!content || typeof content !== 'string')) {
        await releaseDedupeLock();
        return res.status(400).json({ error: "Message content is required" });
      }

      // SECURITY: Normalize incoming user text into safe plain text
      const sanitizedContent = content ? sanitizePlainText(content, { maxLength: 2000 }) : "";
      if (!sanitizedContent && !isMediaMessage) {
        await releaseDedupeLock();
        return res.status(400).json({ error: "Message content is required" });
      }

      // SECURITY: Check block/mute
      const [senderBlockedRecipient, recipientBlockedSender] = await Promise.all([
        isUserBlocked(senderId, receiverId),
        isUserBlocked(receiverId, senderId),
      ]);

      if (senderBlockedRecipient) {
        await releaseDedupeLock();
        return res.status(403).json({ error: "You have blocked this user" });
      }
      if (recipientBlockedSender) {
        await releaseDedupeLock();
        return res.status(403).json({ error: "Cannot send message to this user" });
      }

      // PRICING: Stranger DM unlock — first message to a non-friend may require a one-time fee.
      // Friends (mutual follow) and any conversation with prior history are always free.
      const confirmUnlock = req.body?.confirmUnlock === true;
      const unlockResult = await applyStrangerUnlockFee({ senderId, receiverId, confirm: confirmUnlock });
      if (unlockResult.kind === "needs_unlock") {
        await releaseDedupeLock();
        return res.status(402).json({
          error: "Conversation is locked",
          code: "chat_unlock_required",
          unlock: { fee: unlockResult.amount, balance: unlockResult.balance, currency: "VXC" },
        });
      }
      if (unlockResult.kind === "insufficient_balance") {
        await releaseDedupeLock();
        return res.status(402).json({
          error: "Insufficient balance to unlock conversation",
          code: "chat_unlock_insufficient",
          unlock: { fee: unlockResult.required, balance: unlockResult.balance, currency: "VXC" },
        });
      }

      // PRIVACY: No word filtering on private messages - user privacy first

      const now = new Date();
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
          .where(eq(chatAutoDeletePermissions.userId, senderId))
          .limit(1);

        const hasAutoDeletePermission = Boolean(
          autoDeletePermission
          && autoDeletePermission.autoDeleteEnabled
          && !autoDeletePermission.revokedAt
          && (!autoDeletePermission.expiresAt || autoDeletePermission.expiresAt > now)
        );

        if (!hasAutoDeletePermission) {
          await releaseDedupeLock();
          return res.status(403).json({ error: "Auto-delete permission required" });
        }

        resolvedDeleteAfterMinutes = Math.max(1, Number(autoDeletePermission?.deleteAfterMinutes || 60));
      }

      // SECURITY: Limit attachmentUrl
      const safeAttachmentUrl = attachmentUrl ? String(attachmentUrl).slice(0, 2048) : undefined;
      if (isMediaMessage && !safeAttachmentUrl) {
        await releaseDedupeLock();
        return res.status(400).json({ error: "Attachment is required for media messages" });
      }

      if ((isImageMessage || isVideoMessage) && safeAttachmentUrl) {
        const [mediaPermission] = await db.select({
          mediaEnabled: chatMediaPermissions.mediaEnabled,
          revokedAt: chatMediaPermissions.revokedAt,
          expiresAt: chatMediaPermissions.expiresAt,
        }).from(chatMediaPermissions)
          .where(eq(chatMediaPermissions.userId, senderId))
          .limit(1);

        const mediaAllowed = Boolean(
          mediaPermission
          && mediaPermission.mediaEnabled
          && !mediaPermission.revokedAt
          && (!mediaPermission.expiresAt || mediaPermission.expiresAt > now)
        );

        if (!mediaAllowed) {
          await releaseDedupeLock();
          return res.status(403).json({ error: "Media permission required. Purchase to unlock." });
        }
      }

      const [message] = await db.transaction(async (tx) => {
        if (voiceMessagePrice > 0) {
          await tx.execute(sql`
            INSERT INTO project_currency_wallets (user_id)
            VALUES (${senderId})
            ON CONFLICT (user_id) DO NOTHING
          `);

          const [wallet] = await tx.select()
            .from(projectCurrencyWallets)
            .where(eq(projectCurrencyWallets.userId, senderId))
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
            userId: senderId,
            walletId: wallet.id,
            type: "admin_adjustment",
            amount: (-voiceMessagePrice).toFixed(2),
            balanceBefore: toMoney(balanceBefore).toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            referenceId: `chat_voice_message_rest:${senderId}:${clientMessageId || Date.now()}`,
            referenceType: "chat_voice_message_charge",
            description: "Voice message send charge",
          });
        }

        return tx.insert(chatMessages).values({
          senderId,
          receiverId,
          content: sanitizedContent,
          messageType: storedMessageType.slice(0, 20),
          attachmentUrl: safeAttachmentUrl,
          isDisappearing: Boolean(isDisappearing),
          disappearAfterRead: Boolean(disappearAfterRead),
          autoDeleteAt: Boolean(isDisappearing) ? new Date(now.getTime() + (resolvedDeleteAfterMinutes * 60 * 1000)) : null,
          replyToId: replyToId ? String(replyToId).slice(0, 100) : undefined,
        }).returning();
      });

      if (dedupeKey) {
        await getRedisClient().set(dedupeKey, message.id, "PX", CHAT_MESSAGE_DEDUPE_TTL_MS).catch(() => { });
      }

      const [sender, recipientVisibility] = await Promise.all([
        db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.profilePicture,
        }).from(users).where(eq(users.id, senderId)).limit(1),
        db.select({
          mutedUsers: users.mutedUsers,
        }).from(users).where(eq(users.id, receiverId)).limit(1),
      ]);

      const senderRow = sender[0];
      const recipientMutedUsers = recipientVisibility[0]?.mutedUsers || [];
      const isMutedByRecipient = Array.isArray(recipientMutedUsers) && recipientMutedUsers.includes(senderId);

      if (!isMutedByRecipient) {
        const recipientSockets = clients.get(receiverId);
        if (recipientSockets) {
          const outgoing = JSON.stringify({
            type: "new_chat_message",
            data: {
              ...message,
              sender: senderRow,
            },
            clientMessageId,
          });

          recipientSockets.forEach((socket) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(outgoing);
            }
          });
        }
      }

      const senderDisplayName = senderRow?.firstName || senderRow?.username || "User";
      const preview = buildChatNotificationPreview(storedMessageType, sanitizedContent);
      const chatLinkUserId = encodeURIComponent(senderId);

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
          senderId,
          messageType: storedMessageType,
          messageId: message.id,
        }),
      }).catch(() => {
        // Notification failures should not break the REST fallback send flow.
      });

      res.status(201).json(message);
    } catch (error: unknown) {
      const clientMessageId = normalizeClientMessageId(req.body?.clientMessageId);
      const dedupeKey = clientMessageId ? `chat:msg:dedupe:${req.user!.id}:${clientMessageId}` : null;
      if (dedupeKey) {
        await getRedisClient().del(dedupeKey).catch(() => { });
      }

      const message = getErrorMessage(error);
      if (message.includes("Insufficient")) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  // Mark a message as read
  app.put("/api/chat/messages/:messageId/read", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageId = req.params.messageId;

      const [updated] = await db.update(chatMessages)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(chatMessages.id, messageId),
          eq(chatMessages.receiverId, userId)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Message not found or not authorized" });
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Mark all messages from a user as read
  app.put("/api/chat/:userId/read", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const otherUserId = req.params.userId;

      await db.update(chatMessages)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(chatMessages.senderId, otherUserId),
          eq(chatMessages.receiverId, userId),
          eq(chatMessages.isRead, false)
        ));

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
