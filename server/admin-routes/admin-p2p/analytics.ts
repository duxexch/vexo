import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  p2pOffers,
  p2pTrades,
  p2pTransactionLogs,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, or, sql, gte, lte, inArray } from "drizzle-orm";
import {
  type AdminRequest,
  adminAuthMiddleware,
  logAdminAction,
  getErrorMessage,
} from "../helpers";

function getPeriodStart(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function registerP2pAnalyticsRoutes(app: Express) {
  app.get("/api/admin/p2p/analytics", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const completedTrades = await db
        .select({
          totalTrades: sql<number>`count(*)`,
          totalVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          totalFees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
          totalEscrow: sql<string>`coalesce(sum(cast(${p2pTrades.escrowAmount} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .where(eq(p2pTrades.status, "completed"));

      const tradesByStatus = await db
        .select({
          status: p2pTrades.status,
          count: sql<number>`count(*)`,
          volume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          fees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .groupBy(p2pTrades.status)
        .orderBy(desc(p2pTrades.status));

      const thirtyDaysAgo = getPeriodStart(30);

      const recentStats = await db
        .select({
          totalTrades: sql<number>`count(*)`,
          totalVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          totalFees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
          totalEscrow: sql<string>`coalesce(sum(cast(${p2pTrades.escrowAmount} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .where(and(eq(p2pTrades.status, "completed"), gte(p2pTrades.completedAt, thirtyDaysAgo)));

      const activeTradeRows = await db
        .select({
          status: p2pTrades.status,
          count: sql<number>`count(*)`,
          volume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          escrow: sql<string>`coalesce(sum(cast(${p2pTrades.escrowAmount} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .where(inArray(p2pTrades.status, ["pending", "paid", "confirmed", "disputed"]))
        .groupBy(p2pTrades.status);

      const openEscrowSnapshot = await db
        .select({
          openTrades: sql<number>`count(*)`,
          openVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          openEscrow: sql<string>`coalesce(sum(cast(${p2pTrades.escrowAmount} as decimal)), 0)`,
          openFees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .where(inArray(p2pTrades.status, ["pending", "paid", "confirmed", "disputed"]));

      const [expiredOpenTradesRow] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(p2pTrades)
        .where(and(inArray(p2pTrades.status, ["pending", "paid"]), lte(p2pTrades.expiresAt, new Date())));

      const [disputeStatsRow] = await db
        .select({
          openDisputes: sql<number>`count(*) filter (where ${p2pTrades.status} = 'disputed')`,
        })
        .from(p2pTrades);

      const recentLogs = await db
        .select({
          action: p2pTransactionLogs.action,
          count: sql<number>`count(*)`,
        })
        .from(p2pTransactionLogs)
        .where(gte(p2pTransactionLogs.createdAt, thirtyDaysAgo))
        .groupBy(p2pTransactionLogs.action);

      const expiredOpenTrades = Number(expiredOpenTradesRow?.count ?? 0);
      const openDisputes = Number(disputeStatsRow?.openDisputes ?? 0);

      res.json({
        allTime: completedTrades[0] || { totalTrades: 0, totalVolume: "0", totalFees: "0", totalEscrow: "0" },
        last30Days: recentStats[0] || { totalTrades: 0, totalVolume: "0", totalFees: "0", totalEscrow: "0" },
        byStatus: tradesByStatus,
        openEscrowSnapshot: openEscrowSnapshot[0] || { openTrades: 0, openVolume: "0", openEscrow: "0", openFees: "0" },
        activeTradeRows,
        expiredOpenTrades,
        disputeStats: {
          openDisputes,
        },
        recentLogs,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/p2p/enterprise-snapshot", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [completedTrades] = await db
        .select({
          totalTrades: sql<number>`count(*)`,
          totalVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          totalFees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
          totalEscrow: sql<string>`coalesce(sum(cast(${p2pTrades.escrowAmount} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .where(eq(p2pTrades.status, "completed"));

      const [openEscrowSnapshot] = await db
        .select({
          openTrades: sql<number>`count(*)`,
          openVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
          openEscrow: sql<string>`coalesce(sum(cast(${p2pTrades.escrowAmount} as decimal)), 0)`,
        })
        .from(p2pTrades)
        .where(inArray(p2pTrades.status, ["pending", "paid", "confirmed", "disputed"]));

      const [expiredOpenTradesRow] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(p2pTrades)
        .where(and(inArray(p2pTrades.status, ["pending", "paid"]), lte(p2pTrades.expiresAt, new Date())));

      const [cancelledTrades] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(p2pTrades)
        .where(eq(p2pTrades.status, "cancelled"));

      const [disputedTrades] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(p2pTrades)
        .where(eq(p2pTrades.status, "disputed"));

      const tradeRiskRows = await db
        .select({
          status: p2pTrades.status,
          count: sql<number>`count(*)`,
          score: sql<number>`case when ${p2pTrades.status} = 'disputed' then 40 when ${p2pTrades.status} = 'paid' then 65 when ${p2pTrades.status} = 'confirmed' then 80 else 90 end`,
        })
        .from(p2pTrades)
        .groupBy(p2pTrades.status);

      const [totalOffersCreatedRow] = await db.select({ count: sql<number>`count(*)` }).from(p2pOffers);
      const [totalTradesOpenedRow] = await db.select({ count: sql<number>`count(*)` }).from(p2pTrades);

      const expiredOpenTrades = Number(expiredOpenTradesRow?.count ?? 0);

      const enterpriseSnapshot = {
        reconciliation: {
          id: `p2p_recon_${new Date().toISOString().slice(0, 10)}`,
          businessDate: new Date().toISOString().slice(0, 10),
          totalOffersCreated: Number(totalOffersCreatedRow?.count || 0),
          totalTradesOpened: Number(totalTradesOpenedRow?.count || 0),
          totalEscrowLocked: openEscrowSnapshot?.openEscrow || "0",
          completedTrades: Number(completedTrades?.totalTrades || 0),
          cancelledTrades: Number(cancelledTrades?.count || 0),
          disputedTrades: Number(disputedTrades?.count || 0),
          totalFeesCollected: completedTrades?.totalFees || "0",
          walletBalanceTotal: "0",
          ledgerBalanceTotal: "0",
          mismatchCount: 0,
          status: "warning",
          generatedAt: new Date().toISOString(),
          auditRef: `p2p_audit_${Date.now()}`,
        },
        risk: tradeRiskRows,
      };

      res.json({
        completedTrades: completedTrades || { totalTrades: 0, totalVolume: "0", totalFees: "0", totalEscrow: "0" },
        openEscrowSnapshot: openEscrowSnapshot || { openTrades: 0, openVolume: "0", openEscrow: "0" },
        expiredOpenTrades,
        tradeRiskRows,
        enterpriseSnapshot,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/p2p/expired-trades", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const now = new Date();
      const expiredTrades = await db
        .select()
        .from(p2pTrades)
        .where(and(or(eq(p2pTrades.status, "pending"), eq(p2pTrades.status, "paid")), lte(p2pTrades.expiresAt, now)))
        .orderBy(desc(p2pTrades.expiresAt));

      res.json(expiredTrades);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/p2p/trades/:id/auto-cancel", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [trade] = await db.select().from(p2pTrades).where(eq(p2pTrades.id, id));
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (!trade.expiresAt || new Date(trade.expiresAt) > new Date()) {
        return res.status(400).json({ error: "Trade has not expired" });
      }

      if (trade.status !== "pending" && trade.status !== "paid") {
        return res.status(400).json({ error: "Trade cannot be cancelled" });
      }

      const result = await storage.cancelP2PTradeAtomic(id, trade.sellerId, "Trade expired - auto-cancelled");

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      await logAdminAction(req.admin!.id, "auto_cancel", "p2p_trade", id, { reason: "Trade expired - auto-cancelled" }, req);

      await db.insert(p2pTransactionLogs).values({
        tradeId: id,
        action: "trade_cancelled",
        userId: req.admin!.id,
        description: "Trade expired - auto-cancelled by system",
        metadata: JSON.stringify({ reason: "auto_expire", cancelledBy: "system" }),
      });

      res.json({ success: true, trade: result.trade });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
