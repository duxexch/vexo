import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerAdminProjectCurrencyRoutes(app: Express) {

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
}
