import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, desc } from "drizzle-orm";
import { chatMessages, chatSettings } from "@shared/schema";
import { chatRateLimiter } from "../../lib/rate-limiter";
import { sanitizePlainText } from "../../lib/input-security";
import { isUserBlocked } from "../../lib/user-blocking";

export function registerChatMessagingRoutes(app: Express): void {

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
      const { content, messageType = "text", attachmentUrl } = req.body;
      const isMediaMessage = messageType && messageType !== "text";

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

      // SECURITY: Limit attachmentUrl
      const safeAttachmentUrl = attachmentUrl ? String(attachmentUrl).slice(0, 2048) : undefined;
      if (isMediaMessage && !safeAttachmentUrl) {
        return res.status(400).json({ error: "Attachment is required for media messages" });
      }

      const [message] = await db.insert(chatMessages).values({
        senderId,
        receiverId,
        content: sanitizedContent,
        messageType: String(messageType).slice(0, 20),
        attachmentUrl: safeAttachmentUrl,
      }).returning();

      res.status(201).json(message);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
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
