import type { Express, Request, Response } from "express";
import { AuthRequest, authMiddleware, adminTokenMiddleware } from "./middleware";
import { getErrorMessage, isValidUUID, notificationRateLimiter } from "./helpers";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { users, games } from "@shared/schema";
import { getOnlineUsersCount, getActiveGameRoomsCount } from "../websocket";
import { logger } from "../lib/logger";
import { getWebPushPublicKey, isWebPushEnabled } from "../lib/web-push";
import { z } from "zod";

export function registerNotificationRoutes(app: Express): void {

  const pushSubscriptionSchema = z.object({
    endpoint: z.string().url().max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1).max(1024),
      auth: z.string().min(1).max(1024),
    }),
  });

  const pushUnsubscribeSchema = z.object({
    endpoint: z.string().url().max(2048),
  });

  // ==================== NOTIFICATIONS ====================

  app.get("/api/notifications", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const notifications = await storage.getUserNotifications(req.user!.id, limit, offset);
      res.json(notifications);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/notifications/unread-count", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/notifications/:id/read", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: "Invalid notification ID format" });
      }
      const updated = await storage.markNotificationAsRead(req.params.id, req.user!.id);
      if (!updated) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/notifications/read-all", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      await storage.markAllNotificationsAsRead(req.user!.id);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/notifications/:id", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      return res.status(403).json({ error: "Notification deletion is disabled" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/notifications", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      return res.status(403).json({ error: "Notification deletion is disabled" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get unread notification counts grouped by section
  app.get("/api/notifications/section-counts", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const counts = await storage.getUnreadSectionCounts(req.user!.id);
      res.json({ counts });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Mark all notifications for a section as read
  app.post("/api/notifications/read-section", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { section } = z.object({ section: z.string().min(1).max(50) }).parse(req.body);
      const marked = await storage.markSectionNotificationsAsRead(req.user!.id, section);
      // Invalidate caches
      res.json({ success: true, marked });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/notifications/push/public-key", authMiddleware, notificationRateLimiter, async (_req: AuthRequest, res: Response) => {
    try {
      const vapidPublicKey = getWebPushPublicKey();
      res.json({
        enabled: isWebPushEnabled(),
        vapidPublicKey,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/notifications/push/subscribe", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const subscription = pushSubscriptionSchema.parse(req.body);
      await storage.upsertWebPushSubscription(
        req.user!.id,
        subscription,
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      );
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/notifications/push/unsubscribe", authMiddleware, notificationRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { endpoint } = pushUnsubscribeSchema.parse(req.body);
      await storage.deactivateWebPushSubscription(req.user!.id, endpoint);
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== PLATFORM STATS (public) ====================

  app.get("/api/platform/stats", async (_req: Request, res: Response) => {
    try {
      const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
      const [totalGamesResult] = await db.select({ count: sql<number>`count(*)` }).from(games);

      res.json({
        onlinePlayers: getOnlineUsersCount(),
        activeGames: getActiveGameRoomsCount(),
        totalUsers: Number(totalUsersResult?.count || 0),
        totalGamesPlayed: Number(totalGamesResult?.count || 0),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to get platform stats" });
    }
  });

  // ==================== ANNOUNCEMENTS ====================

  const announcementCreateSchema = z.object({
    title: z.string().min(1).max(200),
    titleAr: z.string().max(200).optional().nullable(),
    content: z.string().min(1).max(5000),
    contentAr: z.string().max(5000).optional().nullable(),
    type: z.enum(["general", "promotion", "maintenance", "update"]).default("general"),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    target: z.enum(["all", "players", "agents", "affiliates"]).default("all"),
    isPinned: z.boolean().default(false),
    expiresAt: z.string().datetime().optional().nullable(),
  });

  app.get("/api/announcements", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const announcements = await storage.getPublishedAnnouncements();
      const viewedIds = await storage.getViewedAnnouncementIds(req.user!.id);

      const withViewStatus = announcements.map(a => ({
        ...a,
        isViewed: viewedIds.includes(a.id),
      }));

      res.json(withViewStatus);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/announcements/:id/view", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.markAnnouncementViewed(req.params.id, req.user!.id);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/announcements", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const validated = announcementCreateSchema.parse(req.body);
      const announcement = await storage.createAnnouncement({
        ...validated,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
        createdBy: req.user!.id,
      });
      res.json(announcement);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/announcements", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.query;
      const announcements = await storage.listAnnouncements(status as string);
      res.json(announcements);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/announcements/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Validate update fields against the same schema as creation
      const updateSchema = announcementCreateSchema.partial();
      const parsed = updateSchema.parse(req.body);
      const validated: Record<string, any> = { ...parsed };
      if (parsed.expiresAt) validated.expiresAt = new Date(parsed.expiresAt);
      const announcement = await storage.updateAnnouncement(req.params.id, validated);
      if (!announcement) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.json(announcement);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/announcements/:id/publish", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const announcement = await storage.updateAnnouncement(req.params.id, {
        status: "published",
        publishedAt: new Date(),
      });

      if (!announcement) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      res.json(announcement);

      // Create notifications in background (fire-and-forget)
      (async () => {
        try {
          const allUsers = await storage.listUsers();
          const batchSize = 50;
          for (let i = 0; i < allUsers.length; i += batchSize) {
            const batch = allUsers.slice(i, i + batchSize);
            await Promise.all(batch.map(user =>
              storage.createNotification({
                userId: user.id,
                type: "announcement",
                priority: announcement.priority,
                title: announcement.title,
                titleAr: announcement.titleAr,
                message: announcement.content.substring(0, 200),
                messageAr: announcement.contentAr?.substring(0, 200),
                link: `/announcements/${announcement.id}`,
              }).catch(err => logger.error(`Failed to create notification for user: ${user.id}`, err instanceof Error ? err : new Error(String(err))))
            ));
          }
        } catch (err) {
          logger.error('Failed to create announcement notifications', err instanceof Error ? err : new Error(String(err)));
        }
      })();
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
