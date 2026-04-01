import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, desc, count } from "drizzle-orm";
import { supportTickets, supportMessages } from "@shared/schema";
import { emitAdminAlert } from "../../lib/admin-alerts";
import { broadcastAdminAlert } from "../../websocket";
import { logger } from "../../lib/logger";
import crypto from "crypto";
import { getAutoReply } from "./support-ticket";
import { sanitizeNullablePlainText, sanitizePlainText } from "../../lib/input-security";
import { chatWithAiAgentSupport } from "../../lib/ai-agent-client";

function shouldEscalateToLiveChat(
  aiReply: string,
  userInput: string,
  userTurns: number,
  aiMeta?: { resolved?: boolean; escalateToLiveChat?: boolean; confidence?: number },
): boolean {
  const normalizedInput = userInput.trim().toLowerCase();
  const explicitTransfer = /\b(live chat|human|agent|transfer|escalate)\b/i.test(normalizedInput)
    || /محادثة حية|موظف|بشري|تحويل|تصعيد/.test(normalizedInput);

  if (explicitTransfer) return true;
  if (aiMeta?.escalateToLiveChat) return true;
  if (aiMeta?.resolved === false) return true;
  if (typeof aiMeta?.confidence === "number" && aiMeta.confidence < 0.4) return true;

  const normalized = aiReply.trim().toLowerCase();
  if (!normalized) return true;

  const escalationPhrases = [
    "i can't", "i cannot", "not sure", "unable to", "contact support", "human agent",
    "لا أستطيع", "غير متأكد", "تعذر", "يرجى التواصل", "موظف دعم", "تحويل",
  ];
  if (userTurns < 3) {
    return false;
  }

  return escalationPhrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function buildLiveChatOfferMessage(input: string): string {
  const looksArabic = /[\u0600-\u06FF]/.test(input);
  if (looksArabic) {
    return "حاول sam9 مساعدتك لكن يحتاج تدخل بشري الآن. إذا أردت التحويل لمحادثة حية مع فريق الدعم، اكتب: (محادثة حية).";
  }
  return "sam9 tried to help, but this case needs a human specialist. If you want to transfer to live chat with support, reply with: (live chat).";
}

function buildDataCollectionMessage(input: string): string {
  const looksArabic = /[\u0600-\u06FF]/.test(input);
  if (looksArabic) {
    return "تمام، هساعدك خطوة بخطوة. عشان أحلها أسرع: اكتب الجهاز/النظام، آخر خطوة قبل المشكلة، ورسالة الخطأ إن وجدت.";
  }
  return "Got it, I can help step by step. To diagnose faster, share your device/platform, last action before the issue, and any error message/code.";
}

function buildSam9Reply(aiReply: string, sourceMessage: string): string {
  const looksArabic = /[\u0600-\u06FF]/.test(sourceMessage);
  const prefix = looksArabic ? "sam9:" : "sam9:";
  return `${prefix} ${aiReply.trim()}`;
}

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

      const [userTurnRow] = await db.select({ count: count() })
        .from(supportMessages)
        .where(and(
          eq(supportMessages.ticketId, ticketId),
          eq(supportMessages.senderType, "user"),
        ));
      const userTurns = Number(userTurnRow?.count || 1);

      // sam9 tries first. If unresolved, offer live chat handoff.
      const autoReplyInput = (content || "").trim().toLowerCase();
      const aiSupport = autoReplyInput
        ? await chatWithAiAgentSupport({ ticketId, userId, message: safeContent })
        : null;

      const aiReply = sanitizePlainText(aiSupport?.reply, { maxLength: 1600, fallback: "" });
      const hasAiReply = aiReply.trim().length > 0;
      const escalateToLiveChat = shouldEscalateToLiveChat(aiReply, safeContent, userTurns, {
        resolved: aiSupport?.resolved,
        escalateToLiveChat: aiSupport?.escalateToLiveChat,
        confidence: aiSupport?.confidence,
      });

      if (hasAiReply && !escalateToLiveChat) {
        await db.insert(supportMessages).values({
          ticketId,
          senderId: "sam9",
          senderType: "system",
          content: buildSam9Reply(aiReply, safeContent),
          isAutoReply: true,
          isRead: false,
        });
      } else {
        const keywordReply = autoReplyInput ? await getAutoReply(autoReplyInput) : null;

        if (keywordReply) {
          await db.insert(supportMessages).values({
            ticketId,
            senderId: "sam9",
            senderType: "system",
            content: buildSam9Reply(keywordReply, safeContent),
            isAutoReply: true,
            isRead: false,
          });
        }

        if (escalateToLiveChat) {
          await db.insert(supportMessages).values({
            ticketId,
            senderId: "sam9",
            senderType: "system",
            content: buildLiveChatOfferMessage(safeContent),
            isAutoReply: true,
            isRead: false,
          });
        } else {
          await db.insert(supportMessages).values({
            ticketId,
            senderId: "sam9",
            senderType: "system",
            content: buildDataCollectionMessage(safeContent),
            isAutoReply: true,
            isRead: false,
          });
        }
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
