import type { Express, Response } from "express";
import { chatMediaPermissions, systemConfig, users } from "@shared/schema";
import { db } from "../db";
import { eq, sql, count } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "./helpers";

export function registerAdminChatMediaRoutes(app: Express) {

  // Get media permission pricing and stats  
  app.get("/api/admin/chat-media/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [totalEnabled] = await db.select({ count: count() }).from(chatMediaPermissions)
        .where(eq(chatMediaPermissions.mediaEnabled, true));
      
      const totalRevenue = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(price_paid AS DECIMAL)), 0) as total
        FROM chat_media_permissions WHERE media_enabled = true
      `);

      const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, "chat_media_price"));
      
      res.json({
        totalEnabledUsers: totalEnabled.count,
        totalRevenue: parseFloat((totalRevenue.rows[0] as Record<string, unknown>)?.total as string || "0"),
        currentPrice: parseFloat(config?.value || "100"),
        systemEnabled: true,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update media pricing
  app.put("/api/admin/chat-media/pricing", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { price } = req.body;
      if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: "Invalid price" });
      }

      await db.insert(systemConfig).values({
        key: "chat_media_price",
        value: String(price),
        updatedBy: req.admin!.id,
      }).onConflictDoUpdate({
        target: systemConfig.key,
        set: { value: String(price), updatedAt: new Date(), updatedBy: req.admin!.id },
      });

      res.json({ success: true, price });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // List users with media permissions
  app.get("/api/admin/chat-media/users", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { search, status } = req.query;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await db.execute(sql`
        SELECT cmp.*, u.username, u.account_id, u.avatar_url
        FROM chat_media_permissions cmp
        INNER JOIN users u ON cmp.user_id = u.id
        ${search ? sql`WHERE u.username ILIKE ${'%' + search + '%'} OR u.account_id ILIKE ${'%' + search + '%'}` : sql``}
        ORDER BY cmp.granted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      res.json({ users: result.rows, total: result.rows.length });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Grant media permission to user (free)
  app.post("/api/admin/chat-media/grant/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const [existing] = await db.select().from(chatMediaPermissions)
        .where(eq(chatMediaPermissions.userId, userId));

      if (existing) {
        await db.update(chatMediaPermissions).set({
          mediaEnabled: true,
          grantedBy: "admin",
          grantedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
        }).where(eq(chatMediaPermissions.userId, userId));
      } else {
        await db.insert(chatMediaPermissions).values({
          userId,
          mediaEnabled: true,
          grantedBy: "admin",
          pricePaid: "0",
        });
      }

      await logAdminAction(req.admin!.id, "update", "chat_media_permission", userId, { metadata: "grant_media" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Revoke media permission from user
  app.post("/api/admin/chat-media/revoke/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      await db.update(chatMediaPermissions).set({
        mediaEnabled: false,
        revokedAt: new Date(),
        revokedBy: req.admin!.id,
      }).where(eq(chatMediaPermissions.userId, userId));

      await logAdminAction(req.admin!.id, "update", "chat_media_permission", userId, { metadata: "revoke_media" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
