import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { emitSystemAlert } from "../../lib/admin-alerts";

export function registerAdminProjectCurrencyRoutes(app: Express) {

  const shouldEmitSystemAlert = async (entityType: string, entityId: string, cooldownMinutes = 10): Promise<boolean> => {
    const [row] = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM admin_alerts
      WHERE type = 'system_alert'
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
        AND created_at >= NOW() - (${cooldownMinutes} * INTERVAL '1 minute')
    `).then((r) => r.rows as Array<{ count: number }>);

    return Number(row?.count || 0) === 0;
  };

  app.get("/api/admin/project-currency/play-gift-policy", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [setting] = await db.execute(sql`
        SELECT value
        FROM gameplay_settings
        WHERE key = 'play_gift_currency_mode'
        LIMIT 1
      `).then((r) => r.rows as Array<{ value: string }>);

      const mode = setting?.value === "mixed" ? "mixed" : "project_only";
      res.json({
        mode,
        projectOnly: mode === "project_only",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/project-currency/play-gift-policy", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const requestedMode = req.body?.mode === "mixed" ? "mixed" : "project_only";

      await db.execute(sql`
        INSERT INTO gameplay_settings (key, value, description, description_ar, updated_by, updated_at)
        VALUES (
          'play_gift_currency_mode',
          ${requestedMode},
          'Currency mode for games and gift purchases (project_only|mixed)',
          'وضع العملة للعب وشراء الهدايا (project_only|mixed)',
          ${req.admin!.id},
          NOW()
        )
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          description = EXCLUDED.description,
          description_ar = EXCLUDED.description_ar,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `);

      await logAdminAction(
        req.admin!.id,
        "update",
        "play_gift_currency_mode",
        "play_gift_currency_mode",
        { newValue: requestedMode },
        req,
      );

      res.json({
        success: true,
        mode: requestedMode,
        projectOnly: requestedMode === "project_only",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/project-currency/settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      let settings = await storage.getProjectCurrencySettings();
      if (!settings) {
        settings = await storage.updateProjectCurrencySettings({
          currencyName: "VEX Coin",
          currencySymbol: "VXC",
          exchangeRate: "100",
        });
      }
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/project-currency/settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = req.body;
      const previousSettings = await storage.getProjectCurrencySettings();

      const updated = await storage.updateProjectCurrencySettings(data);

      await logAdminAction(
        req.admin!.id,
        "update",
        "project_currency_settings",
        updated.id,
        {
          previousValue: JSON.stringify(previousSettings),
          newValue: JSON.stringify(updated)
        },
        req
      );

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/project-currency/conversions", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { status, limit } = req.query;
      const conversions = await storage.listProjectCurrencyConversions({
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });

      const conversionsWithUsers = await Promise.all(
        conversions.map(async (conv) => {
          const user = await storage.getUser(conv.userId);
          const approver = conv.approvedById ? await storage.getUser(conv.approvedById) : null;
          return {
            ...conv,
            user: user ? { id: user.id, username: user.username, nickname: user.nickname } : null,
            approver: approver ? { id: approver.id, username: approver.username } : null,
          };
        })
      );

      res.json(conversionsWithUsers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/project-currency/conversions/:id/approve", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await storage.approveProjectCurrencyConversion(id, req.admin!.id);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      await logAdminAction(
        req.admin!.id,
        "approve",
        "project_currency_conversion",
        id,
        { reason: "Conversion approved" },
        req
      );

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/project-currency/conversions/:id/reject", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const result = await storage.rejectProjectCurrencyConversion(id, req.admin!.id, reason || "Rejected by admin");

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      await logAdminAction(
        req.admin!.id,
        "reject",
        "project_currency_conversion",
        id,
        { reason: reason || "Rejected by admin" },
        req
      );

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/project-currency/stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const totalWalletsRes = await db.execute(sql`
        SELECT COUNT(*) as count FROM project_currency_wallets
      `);
      const totalWallets = (totalWalletsRes.rows as Record<string, unknown>[])?.[0];

      const totalConvertedRes = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(net_amount AS DECIMAL)), 0) as total
        FROM project_currency_conversions
        WHERE status = 'completed'
      `);
      const totalConverted = (totalConvertedRes.rows as Record<string, unknown>[])?.[0];

      const pendingConversionsRes = await db.execute(sql`
        SELECT COUNT(*) as count FROM project_currency_conversions
        WHERE status = 'pending'
      `);
      const pendingConversions = (pendingConversionsRes.rows as Record<string, unknown>[])?.[0];

      const totalCirculatingRes = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(total_balance AS DECIMAL)), 0) as total
        FROM project_currency_wallets
      `);
      const totalCirculating = (totalCirculatingRes.rows as Record<string, unknown>[])?.[0];

      const totalCommissionsRes = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(commission_amount AS DECIMAL)), 0) as total
        FROM project_currency_conversions
        WHERE status = 'completed'
      `);
      const totalCommissions = (totalCommissionsRes.rows as Record<string, unknown>[])?.[0];

      const baseCurrencyConvertedRes = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(base_currency_amount AS DECIMAL)), 0) as total
        FROM project_currency_conversions
        WHERE status = 'completed'
      `);
      const baseCurrencyConverted = (baseCurrencyConvertedRes.rows as Record<string, unknown>[])?.[0];

      const totalConversionsCountRes = await db.execute(sql`
        SELECT COUNT(*) as count FROM project_currency_conversions
        WHERE status = 'completed'
      `);
      const totalConversionsCount = (totalConversionsCountRes.rows as Record<string, unknown>[])?.[0];

      const dailyTotal = await storage.getPlatformDailyConversionTotal();

      res.json({
        totalWallets: Number(totalWallets?.count || 0),
        totalConverted: totalConverted?.total?.toString() || "0",
        pendingConversions: Number(pendingConversions?.count || 0),
        totalCirculating: totalCirculating?.total?.toString() || "0",
        totalCommissions: totalCommissions?.total?.toString() || "0",
        baseCurrencyConverted: baseCurrencyConverted?.total?.toString() || "0",
        totalConversionsCount: Number(totalConversionsCount?.count || 0),
        dailyConversionTotal: dailyTotal,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/project-currency/ledger", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId, type, limit, offset } = req.query;
      const entries = await storage.getProjectCurrencyLedger({
        userId: userId as string | undefined,
        type: type as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });

      const entriesWithUsers = await Promise.all(
        entries.map(async (entry) => {
          const user = await storage.getUser(entry.userId);
          return {
            ...entry,
            user: user ? { id: user.id, username: user.username, nickname: user.nickname } : null,
          };
        })
      );

      res.json(entriesWithUsers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/project-currency/gifts/integrity", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const windowHours = Math.max(1, Math.min(24 * 30, Number(req.query.windowHours || 24)));

      const [totalsResult] = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'gift_sent' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0) AS total_sent,
          COALESCE(SUM(CASE WHEN type = 'gift_received' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0) AS total_received,
          COALESCE(SUM(CASE WHEN type = 'platform_fee' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0) AS total_platform_fee
        FROM transactions
        WHERE status = 'completed'
          AND created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
          AND (
            reference_id LIKE 'challenge_live_gift:%'
            OR reference_id LIKE 'live_game_gift:%'
            OR reference_id LIKE 'live_game_gift_idem:%'
          )
      `) as unknown as Array<{ total_sent: string; total_received: string; total_platform_fee: string }>;

      const [orphanResult] = await db.execute(sql`
        SELECT COUNT(*)::int AS orphan_received_count
        FROM transactions t
        WHERE t.status = 'completed'
          AND t.type = 'gift_received'
          AND t.created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
          AND (
            t.reference_id LIKE 'challenge_live_gift:%'
            OR t.reference_id LIKE 'live_game_gift:%'
            OR t.reference_id LIKE 'live_game_gift_idem:%'
          )
          AND NOT EXISTS (
            SELECT 1 FROM transactions s
            WHERE s.reference_id = t.reference_id
              AND s.type = 'gift_sent'
              AND s.status = 'completed'
          )
      `) as unknown as Array<{ orphan_received_count: number }>;

      const totalSent = Number(totalsResult?.total_sent || 0);
      const totalReceived = Number(totalsResult?.total_received || 0);
      const totalPlatformFee = Number(totalsResult?.total_platform_fee || 0);
      const orphanReceivedCount = Number(orphanResult?.orphan_received_count || 0);
      const imbalance = Number((totalSent - totalReceived - totalPlatformFee).toFixed(2));
      const hasAnomaly = Math.abs(imbalance) > 0.01 || orphanReceivedCount > 0;

      const integrityEntityType = "gift_ledger_integrity";
      const integrityEntityId = `gift-integrity-${windowHours}h`;
      if (hasAnomaly && await shouldEmitSystemAlert(integrityEntityType, integrityEntityId)) {
        await emitSystemAlert({
          severity: "critical",
          title: "Gift Ledger Integrity Alert",
          titleAr: "تنبيه سلامة دفتر الهدايا",
          message: `Gift flow mismatch detected in last ${windowHours}h. imbalance=${imbalance}, orphanReceived=${orphanReceivedCount}`,
          messageAr: `تم اكتشاف عدم اتساق في حركة الهدايا خلال آخر ${windowHours} ساعة. الفرق=${imbalance} وعدد القيود اليتيمة=${orphanReceivedCount}`,
          deepLink: "/admin/currency",
          entityType: integrityEntityType,
          entityId: integrityEntityId,
        });
      }

      res.json({
        windowHours,
        totalSent: totalSent.toFixed(2),
        totalReceived: totalReceived.toFixed(2),
        totalPlatformFee: totalPlatformFee.toFixed(2),
        imbalance: imbalance.toFixed(2),
        orphanReceivedCount,
        hasAnomaly,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/project-currency/gifts/anti-cheat", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const windowHours = Math.max(1, Math.min(24 * 30, Number(req.query.windowHours || 24)));

      const velocityResult = await db.execute(sql`
        SELECT user_id, COUNT(*)::int AS sends
        FROM transactions
        WHERE status = 'completed'
          AND type = 'gift_sent'
          AND created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
        GROUP BY user_id
        HAVING COUNT(*) >= 25
        ORDER BY sends DESC
        LIMIT 20
      `);

      const valueResult = await db.execute(sql`
        SELECT user_id, COALESCE(SUM(CAST(amount AS DECIMAL)), 0) AS total_amount
        FROM transactions
        WHERE status = 'completed'
          AND type = 'gift_sent'
          AND created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
        GROUP BY user_id
        HAVING COALESCE(SUM(CAST(amount AS DECIMAL)), 0) >= 1000
        ORDER BY total_amount DESC
        LIMIT 20
      `);

      const duplicateRefResult = await db.execute(sql`
        SELECT reference_id, COUNT(*)::int AS entries
        FROM transactions
        WHERE status = 'completed'
          AND type = 'gift_sent'
          AND reference_id IS NOT NULL
          AND created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
          AND (
            reference_id LIKE 'challenge_live_gift_idem:%'
            OR reference_id LIKE 'live_game_gift_idem:%'
            OR reference_id LIKE 'gift_purchase:%'
            OR reference_id LIKE 'challenge_inventory_gift:%'
          )
        GROUP BY reference_id
        HAVING COUNT(*) > 1
        ORDER BY entries DESC
        LIMIT 50
      `);

      const orphanResult = await db.execute(sql`
        SELECT COUNT(*)::int AS orphan_received_count
        FROM transactions t
        WHERE t.status = 'completed'
          AND t.type = 'gift_received'
          AND t.created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
          AND NOT EXISTS (
            SELECT 1 FROM transactions s
            WHERE s.reference_id = t.reference_id
              AND s.type = 'gift_sent'
              AND s.status = 'completed'
          )
      `);

      const recentResult = await db.execute(sql`
        SELECT user_id, type, amount, reference_id, created_at
        FROM transactions
        WHERE status = 'completed'
          AND created_at >= NOW() - (${windowHours} * INTERVAL '1 hour')
          AND type IN ('gift_sent', 'gift_received', 'platform_fee')
        ORDER BY CAST(amount AS DECIMAL) DESC, created_at DESC
        LIMIT 30
      `);

      const velocityRows = velocityResult.rows as Array<{ user_id: string; sends: number }>;
      const valueRows = valueResult.rows as Array<{ user_id: string; total_amount: string }>;
      const duplicateRefRows = duplicateRefResult.rows as Array<{ reference_id: string; entries: number }>;
      const orphanRows = orphanResult.rows as Array<{ orphan_received_count: number }>;
      const recentRows = recentResult.rows as Array<{
        user_id: string;
        type: string;
        amount: string;
        reference_id: string | null;
        created_at: string;
      }>;

      const highVelocitySenders = (velocityRows || []).map((r) => ({ userId: r.user_id, sends: Number(r.sends) }));
      const highValueSenders = (valueRows || []).map((r) => ({ userId: r.user_id, totalAmount: Number(r.total_amount || 0).toFixed(2) }));
      const duplicateReferences = (duplicateRefRows || []).map((r) => ({ referenceId: r.reference_id, entries: Number(r.entries) }));
      const orphanReceivedCount = Number(orphanRows?.[0]?.orphan_received_count || 0);

      const riskScore = Math.min(100,
        highVelocitySenders.length * 12
        + highValueSenders.length * 14
        + duplicateReferences.length * 16
        + Math.min(30, orphanReceivedCount * 4)
      );

      const hasCriticalSignal = duplicateReferences.length > 0 || orphanReceivedCount > 0 || riskScore >= 70;
      const antiCheatEntityType = "gift_anti_cheat";
      const antiCheatEntityId = `gift-anti-cheat-${windowHours}h`;
      if (hasCriticalSignal && await shouldEmitSystemAlert(antiCheatEntityType, antiCheatEntityId)) {
        await emitSystemAlert({
          severity: "critical",
          title: "Gift Anti-Cheat Signal",
          titleAr: "إشارة مكافحة غش للهدايا",
          message: `riskScore=${riskScore}, duplicates=${duplicateReferences.length}, orphanReceived=${orphanReceivedCount}, highVelocity=${highVelocitySenders.length}`,
          messageAr: `درجة المخاطر=${riskScore}، تكرارات المراجع=${duplicateReferences.length}، القيود اليتيمة=${orphanReceivedCount}، نشاط سريع=${highVelocitySenders.length}`,
          deepLink: "/admin/anti-cheat",
          entityType: antiCheatEntityType,
          entityId: antiCheatEntityId,
        });
      }

      res.json({
        windowHours,
        riskScore,
        hasCriticalSignal,
        metrics: {
          highVelocitySenderCount: highVelocitySenders.length,
          highValueSenderCount: highValueSenders.length,
          duplicateReferenceCount: duplicateReferences.length,
          orphanReceivedCount,
        },
        highVelocitySenders,
        highValueSenders,
        duplicateReferences,
        recentLargeGiftEvents: recentRows || [],
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
