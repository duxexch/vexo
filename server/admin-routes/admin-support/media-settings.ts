import type { Express, Response } from "express";
import { storage } from "../../storage";
import { users, systemConfig } from "@shared/schema";
import { db } from "../../db";
import { eq, like } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "../helpers";

export function registerMediaSettingsRoutes(app: Express) {

  // ==================== SUPPORT MEDIA MANAGEMENT ====================

  app.get("/api/admin/support-chat/media-settings", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const globalSetting = await storage.getSystemConfig("support_media_enabled");
      const allConfigs = await db.select().from(systemConfig)
        .where(like(systemConfig.key, "support_media_blocked_%"));
      const blockedUsers = allConfigs
        .filter(c => c.value === "true")
        .map(c => c.key.replace("support_media_blocked_", ""));

      const blockedWithDetails = await Promise.all(blockedUsers.map(async (userId) => {
        const [user] = await db.select({ id: users.id, username: users.username, nickname: users.nickname })
          .from(users).where(eq(users.id, userId)).limit(1);
        return user || { id: userId, username: userId, nickname: null };
      }));

      res.json({
        globalEnabled: globalSetting?.value !== "false",
        blockedUsers: blockedWithDetails,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/support-chat/media-settings/global", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { enabled } = req.body;
      await storage.setSystemConfig("support_media_enabled", enabled ? "true" : "false", req.admin?.id);
      res.json({ success: true, enabled });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/support-chat/media-settings/block-user", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const [user] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });
      await storage.setSystemConfig(`support_media_blocked_${userId}`, "true", req.admin?.id);
      res.json({ success: true, userId, username: user.username });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/support-chat/media-settings/unblock-user", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      await storage.setSystemConfig(`support_media_blocked_${userId}`, "false", req.admin?.id);
      res.json({ success: true, userId });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
