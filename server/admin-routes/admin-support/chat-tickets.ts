import type { Express, Response } from "express";
import { supportTickets, supportMessages, users, type SupportTicketStatus } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "../helpers";

export function registerChatTicketsRoutes(app: Express) {

  // ==================== SUPPORT CHAT ADMIN ====================

  app.get("/api/admin/support-chat/tickets", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { status } = req.query;
      let query = db.select({
        ticket: supportTickets,
        user: {
          id: users.id,
          username: users.username,
          nickname: users.nickname,
          profilePicture: users.profilePicture,
        },
        unreadCount: sql<number>`(SELECT COUNT(*) FROM support_messages WHERE ticket_id = ${supportTickets.id} AND sender_type = 'user' AND is_read = false)`,
      })
        .from(supportTickets)
        .leftJoin(users, eq(supportTickets.userId, users.id))
        .orderBy(desc(supportTickets.lastMessageAt))
        .$dynamic();

      if (status && status !== "all") {
        query = query.where(eq(supportTickets.status, status as SupportTicketStatus));
      }

      const raw = await query;
      // Flatten nested Drizzle result for client compatibility
      const tickets = raw.map(r => ({
        id: r.ticket.id,
        userId: r.ticket.userId,
        status: r.ticket.status,
        lastMessageAt: r.ticket.lastMessageAt,
        updatedAt: r.ticket.updatedAt,
        createdAt: r.ticket.createdAt,
        username: r.user?.username,
        nickname: r.user?.nickname,
        profilePicture: r.user?.profilePicture,
        unreadCount: Number(r.unreadCount) || 0,
      }));
      res.json(tickets);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/support-chat/tickets/:ticketId/messages", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;

      const [ticket] = await db.select({
        ticket: supportTickets,
        user: {
          id: users.id,
          username: users.username,
          nickname: users.nickname,
          profilePicture: users.profilePicture,
        },
      })
        .from(supportTickets)
        .leftJoin(users, eq(supportTickets.userId, users.id))
        .where(eq(supportTickets.id, ticketId))
        .limit(1);

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const messages = await db.select().from(supportMessages)
        .where(eq(supportMessages.ticketId, ticketId))
        .orderBy(supportMessages.createdAt);

      await db.update(supportMessages)
        .set({ isRead: true })
        .where(and(
          eq(supportMessages.ticketId, ticketId),
          eq(supportMessages.senderType, "user"),
          eq(supportMessages.isRead, false),
        ));

      // Flatten nested Drizzle result: { ticket: ticketData, user: userData, messages }
      res.json({ ticket: ticket.ticket, user: ticket.user, messages });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/support-chat/tickets/:ticketId/reply", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;
      const { content, mediaUrl, mediaType, mediaName } = req.body;

      if (!content?.trim() && !mediaUrl) {
        return res.status(400).json({ error: "Message content or media required" });
      }

      const [ticket] = await db.select().from(supportTickets)
        .where(eq(supportTickets.id, ticketId)).limit(1);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      // SECURITY: Sanitize admin content to prevent XSS
      const safeContent = (content || "").trim().replace(/<[^>]*>/g, '').slice(0, 2000) || (mediaName ? String(mediaName).replace(/<[^>]*>/g, '').slice(0, 200) : "📎 مرفق");
      const safeMediaName = mediaName ? String(mediaName).replace(/<[^>]*>/g, '').slice(0, 200) : null;

      const [message] = await db.insert(supportMessages).values({
        ticketId,
        senderId: req.admin?.id || "admin",
        senderType: "admin",
        content: safeContent,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: safeMediaName,
        isAutoReply: false,
        isRead: false,
      }).returning();

      await db.update(supportTickets)
        .set({ 
          lastMessageAt: new Date(), 
          status: "active", 
          assignedAdminId: req.admin?.id,
          updatedAt: new Date() 
        })
        .where(eq(supportTickets.id, ticketId));

      const { broadcastToUser } = await import("../../websocket");
      broadcastToUser(ticket.userId, {
        type: "support_message",
        data: message,
      });

      try {
        await sendNotification(ticket.userId, {
          type: "system",
          priority: "high",
          title: "Support Reply",
          titleAr: "رد من الدعم الفني",
          message: safeContent.substring(0, 200),
          messageAr: safeContent.substring(0, 200),
          link: "/support",
        });
      } catch (notifErr: unknown) {
        logger.error('Support notification delivery failed', notifErr instanceof Error ? notifErr : new Error(String(notifErr)));
      }

      res.json(message);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/support-chat/tickets/:ticketId/close", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;

      const [ticket] = await db.update(supportTickets)
        .set({ status: "closed", closedAt: new Date(), closedBy: req.admin?.id, updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId))
        .returning();

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      res.json(ticket);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/support-chat/tickets/:ticketId/reopen", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { ticketId } = req.params;

      const [ticket] = await db.update(supportTickets)
        .set({ status: "open", closedAt: null, closedBy: null, updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId))
        .returning();

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      res.json(ticket);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/support-chat/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      // Single query for all ticket stats (replaces 7 individual count queries)
      const today = new Date(); today.setHours(0,0,0,0);
      const statsResult = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open_count,
          COUNT(*) FILTER (WHERE status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE status = 'waiting') AS waiting_count,
          COUNT(*) FILTER (WHERE status = 'closed') AS closed_count,
          COUNT(*) FILTER (WHERE created_at >= ${today}) AS today_count
        FROM support_tickets
      `);
      
      // Parallel: total messages + unread from users
      const [totalMsgsResult, unreadResult] = await Promise.all([
        db.select({ count: count() }).from(supportMessages),
        db.select({ count: count() }).from(supportMessages)
          .where(and(
            eq(supportMessages.isRead, false),
            eq(supportMessages.senderType, "user")
          )),
      ]);

      const stats = statsResult.rows[0] as Record<string, unknown>;
      res.json({
        open: Number(stats.open_count || 0),
        active: Number(stats.active_count || 0),
        waiting: Number(stats.waiting_count || 0),
        closed: Number(stats.closed_count || 0),
        totalMessages: totalMsgsResult[0]?.count || 0,
        todayTickets: Number(stats.today_count || 0),
        unreadFromUsers: unreadResult[0]?.count || 0,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
