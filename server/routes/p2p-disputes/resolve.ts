import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pTransactionLogs,
  p2pTrades,
} from "@shared/schema";
import { and, eq, or } from "drizzle-orm";
import { sendNotification } from "../../websocket";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

/** POST /api/p2p/disputes/:id/resolve + GET /api/p2p/trades/:tradeId/logs */
export function registerResolveRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[P2P Disputes] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

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

      const resolutionMessage = resolution || `Resolved by admin. Action: ${action}`;

      const outcome = await db.transaction(async (tx) => {
        const [dispute] = await tx
          .select()
          .from(p2pDisputes)
          .where(eq(p2pDisputes.id, disputeId))
          .limit(1)
          .for("update");

        if (!dispute) {
          return { success: false as const, statusCode: 404, error: "Dispute not found" };
        }

        if (dispute.status === "resolved" || dispute.status === "closed") {
          return { success: false as const, statusCode: 400, error: "Dispute is already resolved" };
        }

        if (!winnerUserId || (winnerUserId !== dispute.initiatorId && winnerUserId !== dispute.respondentId)) {
          return { success: false as const, statusCode: 400, error: "winnerUserId must be dispute initiator or respondent" };
        }

        const [trade] = await tx
          .select({ id: p2pTrades.id, currencyType: p2pTrades.currencyType })
          .from(p2pTrades)
          .where(eq(p2pTrades.id, dispute.tradeId))
          .limit(1);

        if (!trade) {
          return { success: false as const, statusCode: 404, error: "Related trade not found" };
        }

        const settlementResult = trade.currencyType === 'project'
          ? await storage.resolveP2PDisputedTradeProjectCurrencyAtomic(dispute.tradeId, winnerUserId, resolutionMessage)
          : await storage.resolveP2PDisputedTradeAtomic(dispute.tradeId, winnerUserId, resolutionMessage);

        if (!settlementResult.success) {
          return { success: false as const, statusCode: 400, error: settlementResult.error || "Failed to settle disputed trade" };
        }

        const [updatedDispute] = await tx
          .update(p2pDisputes)
          .set({
            status: "resolved",
            resolution: resolutionMessage,
            resolvedBy: userId,
            winnerUserId,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(p2pDisputes.id, disputeId),
              or(eq(p2pDisputes.status, "open"), eq(p2pDisputes.status, "investigating")),
            )
          )
          .returning({ id: p2pDisputes.id });

        if (!updatedDispute) {
          return { success: false as const, statusCode: 409, error: "Dispute was updated by another moderator. Please refresh." };
        }

        await tx.insert(p2pTransactionLogs).values({
          tradeId: dispute.tradeId,
          disputeId,
          userId,
          action: "dispute_resolved",
          description: `Dispute resolved by admin ${req.user!.username}: ${resolutionMessage}`,
          descriptionAr: `تم حل النزاع بواسطة المشرف ${req.user!.username}: ${resolutionMessage}`,
          ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
          userAgent: req.headers["user-agent"] || "",
        });

        return {
          success: true as const,
          dispute,
          resolutionMessage,
        };
      });

      if (!outcome.success) {
        return res.status(outcome.statusCode).json({ error: outcome.error });
      }

      const dispute = outcome.dispute;
      const resolvedMessage = outcome.resolutionMessage;

      // Notify both parties about admin resolution
      await notifyWithLog(dispute.initiatorId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${disputeId.slice(0, 8)} has been resolved. ${resolvedMessage}`,
        messageAr: `تم حل النزاع #${disputeId.slice(0, 8)}. ${resolvedMessage}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId, action: 'dispute_admin_resolved', winnerId: winnerUserId }),
      }, "resolve:initiator");
      await notifyWithLog(dispute.respondentId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${disputeId.slice(0, 8)} has been resolved. ${resolvedMessage}`,
        messageAr: `تم حل النزاع #${disputeId.slice(0, 8)}. ${resolvedMessage}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId, action: 'dispute_admin_resolved', winnerId: winnerUserId }),
      }, "resolve:respondent");

      res.json({ success: true, resolution: resolvedMessage, action });
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
