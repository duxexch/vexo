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

  const normalizePrice = (rawPrice: unknown): number | null => {
    const parsed = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Number(parsed.toFixed(2));
  };

  const saveAutoDeletePrice = async (price: number, adminId: string) => {
    await db.insert(systemConfig).values({
      key: "chat_auto_delete_price",
      value: String(price),
      updatedBy: adminId,
    }).onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: String(price), updatedAt: new Date(), updatedBy: adminId },
    });
  };

  const setAutoDeletePermission = async (userId: string, enabled: boolean, adminId: string) => {
    const [existing] = await db.select().from(chatAutoDeletePermissions)
      .where(eq(chatAutoDeletePermissions.userId, userId));

    if (existing) {
      await db.update(chatAutoDeletePermissions).set({
        autoDeleteEnabled: enabled,
        grantedBy: enabled ? "admin" : existing.grantedBy,
        grantedAt: enabled ? new Date() : existing.grantedAt,
        revokedAt: enabled ? null : new Date(),
        revokedBy: enabled ? null : adminId,
      }).where(eq(chatAutoDeletePermissions.userId, userId));
      return;
    }

    if (!enabled) {
      return;
    }

    await db.insert(chatAutoDeletePermissions).values({
      userId,
      autoDeleteEnabled: true,
      grantedBy: "admin",
      pricePaid: "0",
    });
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

  const updateAutoDeletePricing = async (req: AdminRequest, res: Response) => {
    try {
      const normalizedPrice = normalizePrice(req.body?.price);
      if (normalizedPrice === null) {
        return res.status(400).json({ error: "Invalid price" });
      }

      await saveAutoDeletePrice(normalizedPrice, req.admin!.id);

      res.json({ success: true, price: normalizedPrice });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  // Update auto-delete pricing
  app.put("/api/admin/chat-auto-delete/pricing", adminAuthMiddleware, updateAutoDeletePricing);

  // Compatibility alias used by current admin chat page
  app.put("/api/admin/chat/auto-delete/pricing", adminAuthMiddleware, updateAutoDeletePricing);

  const grantAutoDeletePermission = async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      await setAutoDeletePermission(userId, true, req.admin!.id);

      await logAdminAction(req.admin!.id, "update", "chat_auto_delete_permission", userId, { metadata: "grant_auto_delete" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  // Grant auto-delete permission (admin)
  app.post("/api/admin/chat-auto-delete/grant/:userId", adminAuthMiddleware, grantAutoDeletePermission);

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/auto-delete/grant", adminAuthMiddleware, grantAutoDeletePermission);

  const revokeAutoDeletePermission = async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      await setAutoDeletePermission(userId, false, req.admin!.id);

      await logAdminAction(req.admin!.id, "update", "chat_auto_delete_permission", userId, { metadata: "revoke_auto_delete" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  // Revoke auto-delete permission (admin)
  app.post("/api/admin/chat-auto-delete/revoke/:userId", adminAuthMiddleware, revokeAutoDeletePermission);

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/auto-delete/revoke", adminAuthMiddleware, revokeAutoDeletePermission);

}
