import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { chatAutoDeletePermissions, chatMessages, chatSettings, projectCurrencyLedger, projectCurrencyWallets, systemConfig } from "@shared/schema";
import { chatRateLimiter } from "../../lib/rate-limiter";
import { sanitizePlainText } from "../../lib/input-security";
import { isUserBlocked } from "../../lib/user-blocking";

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
      } = req.body;
      const isMediaMessage = messageType && messageType !== "text";
      const isVoiceMessage = String(messageType || "").toLowerCase() === "voice";

      // SECURITY: Validate receiverId
      if (!receiverId || receiverId.length > 100) {
        return res.status(400).json({ error: "Invalid receiver" });
      }

      // SECURITY: Rate limit
      const rateLimitResult = chatRateLimiter.check(senderId);
      if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: "Too many messages, please wait" });
      }

      // Check if chat is enabled (support both key names)
      const chatEnabledSettings = await db.select({
        key: chatSettings.key,
        value: chatSettings.value,
      }).from(chatSettings).where(
        or(eq(chatSettings.key, "chat_enabled"), eq(chatSettings.key, "isEnabled"))
      );

      const canonicalSetting = chatEnabledSettings.find((item) => item.key === "chat_enabled")
        || chatEnabledSettings.find((item) => item.key === "isEnabled");

      if (canonicalSetting && canonicalSetting.value === "false") {
        return res.status(403).json({ error: "Chat is currently disabled" });
      }

      if (!isMediaMessage && (!content || typeof content !== 'string')) {
        return res.status(400).json({ error: "Message content is required" });
      }

      // SECURITY: Normalize incoming user text into safe plain text
      const sanitizedContent = content ? sanitizePlainText(content, { maxLength: 2000 }) : "";
      if (!sanitizedContent && !isMediaMessage) {
        return res.status(400).json({ error: "Message content is required" });
      }

      // SECURITY: Check block/mute
      const [senderBlockedRecipient, recipientBlockedSender] = await Promise.all([
        isUserBlocked(senderId, receiverId),
        isUserBlocked(receiverId, senderId),
      ]);

      if (senderBlockedRecipient) {
        return res.status(403).json({ error: "You have blocked this user" });
      }
      if (recipientBlockedSender) {
        return res.status(403).json({ error: "Cannot send message to this user" });
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
          return res.status(403).json({ error: "Auto-delete permission required" });
        }

        resolvedDeleteAfterMinutes = Math.max(1, Number(autoDeletePermission?.deleteAfterMinutes || 60));
      }

      // SECURITY: Limit attachmentUrl
      const safeAttachmentUrl = attachmentUrl ? String(attachmentUrl).slice(0, 2048) : undefined;
      if (isMediaMessage && !safeAttachmentUrl) {
        return res.status(400).json({ error: "Attachment is required for media messages" });
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
            referenceId: `chat_voice_message_rest:${senderId}:${Date.now()}`,
            referenceType: "chat_voice_message_charge",
            description: "Voice message send charge",
          });
        }

        return tx.insert(chatMessages).values({
          senderId,
          receiverId,
          content: sanitizedContent,
          messageType: String(messageType).slice(0, 20),
          attachmentUrl: safeAttachmentUrl,
          isDisappearing: Boolean(isDisappearing),
          disappearAfterRead: Boolean(disappearAfterRead),
          autoDeleteAt: Boolean(isDisappearing) ? new Date(now.getTime() + (resolvedDeleteAfterMinutes * 60 * 1000)) : null,
          replyToId: replyToId ? String(replyToId).slice(0, 100) : undefined,
        }).returning();
      });

      res.status(201).json(message);
    } catch (error: unknown) {
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
