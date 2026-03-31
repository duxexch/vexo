import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  p2pOffers, p2pTrades, p2pTransactionLogs,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, or, sql, gte, lte } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerP2pAnalyticsRoutes(app: Express) {

  // P2P Analytics - Revenue summary
  app.get("/api/admin/p2p/analytics", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const completedTrades = await db.select({
        totalTrades: sql<number>`count(*)`,
        totalVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
        totalFees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
      })
      .from(p2pTrades)
      .where(eq(p2pTrades.status, "completed"));
      
      const tradesByStatus = await db.select({
        status: p2pTrades.status,
        count: sql<number>`count(*)`,
      })
      .from(p2pTrades)
      .groupBy(p2pTrades.status);
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentStats = await db.select({
        totalTrades: sql<number>`count(*)`,
        totalVolume: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as decimal)), 0)`,
        totalFees: sql<string>`coalesce(sum(cast(${p2pTrades.platformFee} as decimal)), 0)`,
      })
      .from(p2pTrades)
      .where(and(
        eq(p2pTrades.status, "completed"),
        gte(p2pTrades.completedAt, thirtyDaysAgo)
      ));
      
      res.json({
        allTime: completedTrades[0],
        last30Days: recentStats[0],
        byStatus: tradesByStatus,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get expired trades (for auto-cancel processing)
  app.get("/api/admin/p2p/expired-trades", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const now = new Date();
      const expiredTrades = await db.select()
        .from(p2pTrades)
        .where(and(
          or(eq(p2pTrades.status, "pending"), eq(p2pTrades.status, "paid")),
          lte(p2pTrades.expiresAt, now)
        ))
        .orderBy(desc(p2pTrades.expiresAt));
      
      res.json(expiredTrades);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Auto-cancel expired trade
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
      
      // Use atomic cancel operation
      const result = await storage.cancelP2PTradeAtomic(id, trade.sellerId, "Trade expired - auto-cancelled");
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      await logAdminAction(
        req.admin!.id,
        "auto_cancel",
        "p2p_trade",
        id,
        { reason: "Trade expired - auto-cancelled" },
        req
      );
      
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
