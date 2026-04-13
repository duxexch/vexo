import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, desc, count } from "drizzle-orm";
import { supportTickets, supportMessages, supportAutoReplies } from "@shared/schema";

function buildSam9IntakeGreeting(): string {
  return "مرحباً، أنا sam9 من دعم VEX. أرسل لي وصف المشكلة بالتفصيل (الجهاز/النظام، آخر خطوة قبل المشكلة، ورسالة الخطأ إن وجدت) وسأقترح لك حلولاً مباشرة. ويمكنك في أي وقت الضغط على زر التحويل للدعم البشري.";
}

export function registerSupportTicketRoutes(app: Express): void {

  // Get or create support ticket for current user
  app.get("/api/support-chat/ticket", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Find existing open/active ticket
      let [ticket] = await db.select().from(supportTickets)
        .where(and(
          eq(supportTickets.userId, userId),
          or(
            eq(supportTickets.status, "open"),
            eq(supportTickets.status, "active"),
            eq(supportTickets.status, "waiting")
          )
        ))
        .orderBy(desc(supportTickets.createdAt))
        .limit(1);

      if (!ticket) {
        // Create new ticket
        [ticket] = await db.insert(supportTickets).values({
          userId,
          subject: "دعم عام",
          status: "open",
        }).returning();

        // Send auto welcome message
        const welcomeMsg = await getAutoReply("welcome");
        if (welcomeMsg) {
          await db.insert(supportMessages).values({
            ticketId: ticket.id,
            senderId: "system",
            senderType: "system",
            content: welcomeMsg,
            isAutoReply: true,
            isRead: false,
          });
        }

        // Force a deterministic SAM9 onboarding flow for every new support ticket.
        await db.insert(supportMessages).values({
          ticketId: ticket.id,
          senderId: "sam9",
          senderType: "system",
          content: buildSam9IntakeGreeting(),
          isAutoReply: true,
          isRead: false,
        });
      }

      res.json(ticket);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get unread support message count
  app.get("/api/support-chat/unread", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const [result] = await db.select({ count: count() })
        .from(supportMessages)
        .innerJoin(supportTickets, eq(supportMessages.ticketId, supportTickets.id))
        .where(and(
          eq(supportTickets.userId, userId),
          eq(supportMessages.isRead, false),
          or(
            eq(supportMessages.senderType, "admin"),
            eq(supportMessages.senderType, "system")
          )
        ));
      res.json({ unread: result?.count || 0 });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Check if support media is enabled for current user
  app.get("/api/support-chat/media-enabled", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const globalSetting = await storage.getSystemConfig("support_media_enabled");
      if (globalSetting?.value === "false") {
        return res.json({ enabled: false, reason: "global" });
      }
      const userBlock = await storage.getSystemConfig(`support_media_blocked_${userId}`);
      if (userBlock?.value === "true") {
        return res.json({ enabled: false, reason: "user" });
      }
      res.json({ enabled: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}

// Helper: get auto-reply for keyword (shared with support-messages)
export async function getAutoReply(input: string): Promise<string | null> {
  try {
    const replies = await db.select().from(supportAutoReplies)
      .where(eq(supportAutoReplies.isEnabled, true))
      .orderBy(desc(supportAutoReplies.priority));

    if (input === "welcome") {
      const welcome = replies.find(r => r.trigger === "welcome");
      return welcome?.response || "مرحباً بك في دعم VEX. أنا sam9 وسأجمع تفاصيل مشكلتك وأقترح لك الحلول خطوة بخطوة.";
    }

    for (const reply of replies) {
      if (reply.trigger !== "welcome" && input.includes(reply.trigger.toLowerCase())) {
        return reply.response;
      }
    }
    return null;
  } catch {
    return null;
  }
}
