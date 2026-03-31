import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, desc } from "drizzle-orm";
import { supportTickets, supportMessages } from "@shared/schema";
import { emitAdminAlert } from "../../lib/admin-alerts";
import { broadcastAdminAlert } from "../../websocket";
import { logger } from "../../lib/logger";
import crypto from "crypto";
import { getAutoReply } from "./support-ticket";
import { sanitizeNullablePlainText, sanitizePlainText } from "../../lib/input-security";

export function registerSupportMessageRoutes(app: Express): void {

  // Get messages for a ticket
  app.get("/api/support-chat/messages/:ticketId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { ticketId } = req.params;

      // Verify ticket belongs to user
      const [ticket] = await db.select().from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
        .limit(1);

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const messages = await db.select().from(supportMessages)
        .where(eq(supportMessages.ticketId, ticketId))
        .orderBy(supportMessages.createdAt)
        .limit(200);

      // Mark admin messages as read
      await db.update(supportMessages)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(supportMessages.ticketId, ticketId),
          eq(supportMessages.isRead, false),
          or(
            eq(supportMessages.senderType, "admin"),
            eq(supportMessages.senderType, "system")
          )
        ));

      res.json({ messages, ticket });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Send support message
  app.post("/api/support-chat/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { ticketId, content, mediaUrl, mediaType, mediaName } = req.body;

      if ((!content || content.trim().length === 0) && !mediaUrl) {
        return res.status(400).json({ error: "Message content or media required" });
      }
      if (content && content.length > 2000) {
        return res.status(400).json({ error: "Message too long" });
      }

      // If media, check global support media setting
      if (mediaUrl) {
        const globalSetting = await storage.getSystemConfig("support_media_enabled");
        if (globalSetting?.value === "false") {
          return res.status(403).json({ error: "Media sending is disabled" });
        }
        // Check per-user block
        const userBlock = await storage.getSystemConfig(`support_media_blocked_${userId}`);
        if (userBlock?.value === "true") {
          return res.status(403).json({ error: "Media sending is disabled for your account" });
        }
      }

      // Verify ticket ownership
      const [ticket] = await db.select().from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
        .limit(1);

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.status === "closed") return res.status(400).json({ error: "Ticket is closed" });

      // Insert message — SECURITY: normalize to safe plain text before persistence
      const safeContent = sanitizePlainText(content, { maxLength: 2000 })
        || sanitizePlainText(mediaName, { maxLength: 200, fallback: "Attachment" });
      const safeMediaName = sanitizeNullablePlainText(mediaName, 200);
      const [message] = await db.insert(supportMessages).values({
        ticketId,
        senderId: userId,
        senderType: "user",
        content: safeContent,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: safeMediaName,
        isAutoReply: false,
        isRead: false,
      }).returning();

      // Update ticket
      await db.update(supportTickets)
        .set({ lastMessageAt: new Date(), status: "waiting", updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId));

      // Check for auto-reply
      const autoReplyInput = (content || "").trim().toLowerCase();
      const autoReply = autoReplyInput ? await getAutoReply(autoReplyInput) : null;
      if (autoReply) {
        await db.insert(supportMessages).values({
          ticketId,
          senderId: "system",
          senderType: "system",
          content: autoReply,
          isAutoReply: true,
          isRead: false,
        });
      }

      // Notify admin (persist to DB + broadcast via websocket)
      const supportPreview = safeContent.substring(0, 100);
      emitAdminAlert({
        type: "support_message",
        title: "New Support Message",
        titleAr: "رسالة دعم جديدة",
        message: supportPreview,
        messageAr: supportPreview,
        severity: "info",
        entityType: "support_ticket",
        entityId: ticketId,
        deepLink: "/admin/chat-management",
      }).catch((err) => {
        // Fallback: if DB insert fails, still broadcast via WebSocket so admin sees it in real-time
        logger.error('[Support] emitAdminAlert failed, using fallback broadcast', new Error(err.message));
        broadcastAdminAlert({
          id: crypto.randomUUID(),
          type: "support_message",
          title: "New Support Message",
          titleAr: "رسالة دعم جديدة",
          message: supportPreview,
          messageAr: supportPreview,
          severity: "info",
          entityType: "support_ticket",
          entityId: ticketId,
          deepLink: "/admin/chat-management",
          createdAt: new Date(),
        });
      });

      res.json(message);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
