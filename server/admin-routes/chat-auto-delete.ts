import type { Express, Response } from "express";
import { chatAutoDeletePermissions, systemConfig, users } from "@shared/schema";
import { db } from "../db";
import { eq, sql, count } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "./helpers";

export function registerAdminChatAutoDeleteRoutes(app: Express) {

  const resolveTargetUserId = (req: AdminRequest): string => {
    return String(req.params.userId || req.body?.userId || "").trim();
  };

  const assertUserExists = async (userId: string): Promise<boolean> => {
    if (!userId) return false;
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    return Boolean(existingUser);
  };

  const getAutoDeleteStatsPayload = async () => {
    const [totalEnabled] = await db.select({ count: count() }).from(chatAutoDeletePermissions)
      .where(eq(chatAutoDeletePermissions.autoDeleteEnabled, true));

    const totalRevenue = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(price_paid AS DECIMAL)), 0) as total
      FROM chat_auto_delete_permissions WHERE auto_delete_enabled = true
    `);

    const enabledUsersRes = await db.execute(sql`
      SELECT cad.user_id, cad.granted_by, u.username
      FROM chat_auto_delete_permissions cad
      INNER JOIN users u ON cad.user_id = u.id
      WHERE cad.auto_delete_enabled = true
      ORDER BY cad.granted_at DESC
      LIMIT 100
    `);

    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, "chat_auto_delete_price"));

    return {
      totalEnabledUsers: totalEnabled.count,
      totalEnabled: totalEnabled.count,
      totalRevenue: parseFloat((totalRevenue.rows[0] as Record<string, unknown>)?.total as string || "0"),
      currentPrice: parseFloat(config?.value || "50"),
      users: (enabledUsersRes.rows as Array<{ user_id: string; granted_by: string | null; username: string | null }>).map((row) => ({
        userId: row.user_id,
        username: row.username || undefined,
        grantedBy: row.granted_by || undefined,
      })),
    };
  };

  // Auto-Delete stats
  app.get("/api/admin/chat-auto-delete/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json(await getAutoDeleteStatsPayload());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Compatibility alias used by current admin chat page
  app.get("/api/admin/chat/auto-delete/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json(await getAutoDeleteStatsPayload());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update auto-delete pricing
  app.put("/api/admin/chat-auto-delete/pricing", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { price } = req.body;
      if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: "Invalid price" });
      }

      await db.insert(systemConfig).values({
        key: "chat_auto_delete_price",
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

  // Compatibility alias used by current admin chat page
  app.put("/api/admin/chat/auto-delete/pricing", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { price } = req.body;
      if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: "Invalid price" });
      }

      await db.insert(systemConfig).values({
        key: "chat_auto_delete_price",
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

  // Grant auto-delete permission (admin)
  app.post("/api/admin/chat-auto-delete/grant/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      const [existing] = await db.select().from(chatAutoDeletePermissions)
        .where(eq(chatAutoDeletePermissions.userId, userId));

      if (existing) {
        await db.update(chatAutoDeletePermissions).set({
          autoDeleteEnabled: true,
          grantedBy: "admin",
          grantedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
        }).where(eq(chatAutoDeletePermissions.userId, userId));
      } else {
        await db.insert(chatAutoDeletePermissions).values({
          userId,
          autoDeleteEnabled: true,
          grantedBy: "admin",
          pricePaid: "0",
        });
      }

      await logAdminAction(req.admin!.id, "update", "chat_auto_delete_permission", userId, { metadata: "grant_auto_delete" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/auto-delete/grant", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      const [existing] = await db.select().from(chatAutoDeletePermissions)
        .where(eq(chatAutoDeletePermissions.userId, userId));

      if (existing) {
        await db.update(chatAutoDeletePermissions).set({
          autoDeleteEnabled: true,
          grantedBy: "admin",
          grantedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
        }).where(eq(chatAutoDeletePermissions.userId, userId));
      } else {
        await db.insert(chatAutoDeletePermissions).values({
          userId,
          autoDeleteEnabled: true,
          grantedBy: "admin",
          pricePaid: "0",
        });
      }

      await logAdminAction(req.admin!.id, "update", "chat_auto_delete_permission", userId, { metadata: "grant_auto_delete" }, req);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Revoke auto-delete permission (admin)
  app.post("/api/admin/chat-auto-delete/revoke/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      await db.update(chatAutoDeletePermissions).set({
        autoDeleteEnabled: false,
        revokedAt: new Date(),
        revokedBy: req.admin!.id,
      }).where(eq(chatAutoDeletePermissions.userId, userId));

      await logAdminAction(req.admin!.id, "update", "chat_auto_delete_permission", userId, { metadata: "revoke_auto_delete" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/auto-delete/revoke", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      await db.update(chatAutoDeletePermissions).set({
        autoDeleteEnabled: false,
        revokedAt: new Date(),
        revokedBy: req.admin!.id,
      }).where(eq(chatAutoDeletePermissions.userId, userId));

      await logAdminAction(req.admin!.id, "update", "chat_auto_delete_permission", userId, { metadata: "revoke_auto_delete" }, req);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
