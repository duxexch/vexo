import type { Express, Response } from "express";
import { chatMediaPermissions, systemConfig, users } from "@shared/schema";
import { db } from "../db";
import { eq, sql, count } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "./helpers";

export function registerAdminChatMediaRoutes(app: Express) {

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

  const saveMediaPrice = async (price: number, adminId: string) => {
    await db.insert(systemConfig).values({
      key: "chat_media_price",
      value: String(price),
      updatedBy: adminId,
    }).onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: String(price), updatedAt: new Date(), updatedBy: adminId },
    });
  };

  const setMediaPermission = async (userId: string, enabled: boolean, adminId: string) => {
    const [existing] = await db.select().from(chatMediaPermissions)
      .where(eq(chatMediaPermissions.userId, userId));

    if (existing) {
      await db.update(chatMediaPermissions).set({
        mediaEnabled: enabled,
        grantedBy: enabled ? "admin" : existing.grantedBy,
        grantedAt: enabled ? new Date() : existing.grantedAt,
        revokedAt: enabled ? null : new Date(),
        revokedBy: enabled ? null : adminId,
      }).where(eq(chatMediaPermissions.userId, userId));
      return;
    }

    if (!enabled) {
      return;
    }

    await db.insert(chatMediaPermissions).values({
      userId,
      mediaEnabled: true,
      grantedBy: "admin",
      pricePaid: "0",
    });
  };

  const getMediaStatsPayload = async () => {
    const [totalEnabled] = await db.select({ count: count() }).from(chatMediaPermissions)
      .where(eq(chatMediaPermissions.mediaEnabled, true));

    const totalRevenue = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(price_paid AS DECIMAL)), 0) as total
      FROM chat_media_permissions WHERE media_enabled = true
    `);

    const enabledUsersRes = await db.execute(sql`
      SELECT cmp.user_id, cmp.granted_by, u.username
      FROM chat_media_permissions cmp
      INNER JOIN users u ON cmp.user_id = u.id
      WHERE cmp.media_enabled = true
      ORDER BY cmp.granted_at DESC
      LIMIT 100
    `);

    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, "chat_media_price"));

    return {
      totalEnabledUsers: totalEnabled.count,
      totalEnabled: totalEnabled.count,
      totalRevenue: parseFloat((totalRevenue.rows[0] as Record<string, unknown>)?.total as string || "0"),
      currentPrice: parseFloat(config?.value || "100"),
      systemEnabled: true,
      users: (enabledUsersRes.rows as Array<{ user_id: string; granted_by: string | null; username: string | null }>).map((row) => ({
        userId: row.user_id,
        username: row.username || undefined,
        grantedBy: row.granted_by || undefined,
      })),
    };
  };

  // Get media permission pricing and stats  
  app.get("/api/admin/chat-media/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json(await getMediaStatsPayload());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Compatibility alias used by current admin chat page
  app.get("/api/admin/chat/media/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json(await getMediaStatsPayload());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  const updateMediaPricing = async (req: AdminRequest, res: Response) => {
    try {
      const normalizedPrice = normalizePrice(req.body?.price);
      if (normalizedPrice === null) {
        return res.status(400).json({ error: "Invalid price" });
      }

      await saveMediaPrice(normalizedPrice, req.admin!.id);

      res.json({ success: true, price: normalizedPrice });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  // Update media pricing
  app.put("/api/admin/chat-media/pricing", adminAuthMiddleware, updateMediaPricing);

  // Compatibility alias used by current admin chat page
  app.put("/api/admin/chat/media/pricing", adminAuthMiddleware, updateMediaPricing);

  // List users with media permissions
  app.get("/api/admin/chat-media/users", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { search } = req.query;
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

  const grantMediaPermission = async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      await setMediaPermission(userId, true, req.admin!.id);

      await logAdminAction(req.admin!.id, "update", "chat_media_permission", userId, { metadata: "grant_media" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  // Grant media permission to user (free)
  app.post("/api/admin/chat-media/grant/:userId", adminAuthMiddleware, grantMediaPermission);

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/media/grant", adminAuthMiddleware, grantMediaPermission);

  const revokeMediaPermission = async (req: AdminRequest, res: Response) => {
    try {
      const userId = resolveTargetUserId(req);
      if (!await assertUserExists(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      await setMediaPermission(userId, false, req.admin!.id);

      await logAdminAction(req.admin!.id, "update", "chat_media_permission", userId, { metadata: "revoke_media" }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  // Revoke media permission from user
  app.post("/api/admin/chat-media/revoke/:userId", adminAuthMiddleware, revokeMediaPermission);

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/media/revoke", adminAuthMiddleware, revokeMediaPermission);

}
