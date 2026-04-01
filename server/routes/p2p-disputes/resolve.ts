import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pTransactionLogs,
  p2pTrades,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendNotification } from "../../websocket";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

/** POST /api/p2p/disputes/:id/resolve + GET /api/p2p/trades/:tradeId/logs */
export function registerResolveRoutes(app: Express) {

  // ==================== POST /api/p2p/disputes/:id/resolve ====================
  // Admin-only: resolve a dispute

  app.post("/api/p2p/disputes/:id/resolve", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeId = req.params.id;
      const { resolution, action, winnerUserId } = req.body;

      // Admin-only
      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      if (!isAdmin) {
        return res.status(403).json({ error: "Only admins can resolve disputes" });
      }

      const [dispute] = await db
        .select()
        .from(p2pDisputes)
        .where(eq(p2pDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (dispute.status === "resolved" || dispute.status === "closed") {
        return res.status(400).json({ error: "Dispute is already resolved" });
      }

      if (!winnerUserId || (winnerUserId !== dispute.initiatorId && winnerUserId !== dispute.respondentId)) {
        return res.status(400).json({ error: "winnerUserId must be dispute initiator or respondent" });
      }

      const [trade] = await db
        .select({ id: p2pTrades.id, currencyType: p2pTrades.currencyType })
        .from(p2pTrades)
        .where(eq(p2pTrades.id, dispute.tradeId))
        .limit(1);

      if (!trade) {
        return res.status(404).json({ error: "Related trade not found" });
      }

      const settlementResult = trade.currencyType === 'project'
        ? await storage.resolveP2PDisputedTradeProjectCurrencyAtomic(dispute.tradeId, winnerUserId, resolution || action)
        : await storage.resolveP2PDisputedTradeAtomic(dispute.tradeId, winnerUserId, resolution || action);

      if (!settlementResult.success) {
        return res.status(400).json({ error: settlementResult.error || "Failed to settle disputed trade" });
      }

      // Update the dispute
      await db
        .update(p2pDisputes)
        .set({
          status: "resolved",
          resolution: resolution || `Resolved by admin. Action: ${action}`,
          resolvedBy: userId,
          winnerUserId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(p2pDisputes.id, disputeId));

      // Log it
      await db.insert(p2pTransactionLogs).values({
        tradeId: dispute.tradeId,
        disputeId,
        userId,
        action: "dispute_resolved",
        description: `Dispute resolved by admin ${req.user!.username}: ${resolution || action}`,
        descriptionAr: `تم حل النزاع بواسطة المشرف ${req.user!.username}: ${resolution || action}`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      // Notify both parties about admin resolution
      const resolutionMsg = resolution || action;
      await sendNotification(dispute.initiatorId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${disputeId.slice(0, 8)} has been resolved. ${resolutionMsg}`,
        messageAr: `تم حل النزاع #${disputeId.slice(0, 8)}. ${resolutionMsg}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId, action: 'dispute_admin_resolved', winnerId: winnerUserId }),
      }).catch(() => { });
      await sendNotification(dispute.respondentId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${disputeId.slice(0, 8)} has been resolved. ${resolutionMsg}`,
        messageAr: `تم حل النزاع #${disputeId.slice(0, 8)}. ${resolutionMsg}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId, action: 'dispute_admin_resolved', winnerId: winnerUserId }),
      }).catch(() => { });

      res.json({ success: true, resolution, action });
    } catch (error: unknown) {
      console.error("[P2P Disputes] POST /disputes/:id/resolve error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== GET /api/p2p/trades/:tradeId/logs ====================
  // Transaction audit log for a trade

  app.get("/api/p2p/trades/:tradeId/logs", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tradeId = req.params.tradeId;

      // Validate user is party to the trade (or admin)
      const [trade] = await db
        .select({ buyerId: p2pTrades.buyerId, sellerId: p2pTrades.sellerId })
        .from(p2pTrades)
        .where(eq(p2pTrades.id, tradeId))
        .limit(1);

      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      if (trade.buyerId !== userId && trade.sellerId !== userId && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const logs = await db
        .select({
          id: p2pTransactionLogs.id,
          tradeId: p2pTransactionLogs.tradeId,
          disputeId: p2pTransactionLogs.disputeId,
          userId: p2pTransactionLogs.userId,
          action: p2pTransactionLogs.action,
          description: p2pTransactionLogs.description,
          descriptionAr: p2pTransactionLogs.descriptionAr,
          createdAt: p2pTransactionLogs.createdAt,
        })
        .from(p2pTransactionLogs)
        .where(eq(p2pTransactionLogs.tradeId, tradeId))
        .orderBy(p2pTransactionLogs.createdAt);

      res.json(logs);
    } catch (error: unknown) {
      console.error("[P2P Disputes] GET /trades/:tradeId/logs error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
