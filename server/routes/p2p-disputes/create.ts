import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pTransactionLogs,
  p2pTrades,
  users,
} from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { emitDisputeAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage, formatDispute } from "./helpers";

/** POST /api/p2p/disputes — Create a new dispute on a trade */
export function registerCreateRoutes(app: Express) {

  app.post("/api/p2p/disputes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { tradeId, reason, description } = req.body;

      if (!tradeId || !reason) {
        return res.status(400).json({ error: "tradeId and reason are required" });
      }

      // SECURITY: Sanitize text inputs to prevent stored XSS
      const safeReason = String(reason).replace(/<[^>]*>/g, '').slice(0, 500);
      const safeDescription = description ? String(description).replace(/<[^>]*>/g, '').slice(0, 2000) : "";

      // 1. Validate trade exists and user is a party
      const [trade] = await db
        .select()
        .from(p2pTrades)
        .where(eq(p2pTrades.id, tradeId))
        .limit(1);

      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (trade.buyerId !== userId && trade.sellerId !== userId) {
        return res.status(403).json({ error: "You are not a party to this trade" });
      }

      // 2. Only allow disputes on active trades
      if (trade.status === "completed" || trade.status === "cancelled") {
        return res.status(400).json({ error: "Cannot dispute a completed or cancelled trade" });
      }

      // 3. Check no existing open dispute for this trade
      const [existingDispute] = await db
        .select({ id: p2pDisputes.id })
        .from(p2pDisputes)
        .where(
          and(
            eq(p2pDisputes.tradeId, tradeId),
            or(
              eq(p2pDisputes.status, "open"),
              eq(p2pDisputes.status, "investigating"),
            )
          )
        )
        .limit(1);

      if (existingDispute) {
        return res.status(409).json({ error: "An active dispute already exists for this trade" });
      }

      // 4. Determine respondent (the other party)
      const respondentId = trade.buyerId === userId ? trade.sellerId : trade.buyerId;

      // 5. Insert the dispute
      const [dispute] = await db
        .insert(p2pDisputes)
        .values({
          tradeId,
          initiatorId: userId,
          respondentId,
          reason: safeReason,
          description: safeDescription,
          status: "open",
        })
        .returning();

      // 6. Update trade status to "disputed"
      await db
        .update(p2pTrades)
        .set({ status: "disputed", updatedAt: new Date() })
        .where(eq(p2pTrades.id, tradeId));

      // 7. Create transaction log
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
      const userAgent = req.headers["user-agent"] || "";

      await db.insert(p2pTransactionLogs).values({
        tradeId,
        disputeId: dispute.id,
        userId,
        action: "dispute_opened",
        description: `Dispute opened by ${req.user!.username}. Reason: ${reason}`,
        descriptionAr: `تم فتح نزاع بواسطة ${req.user!.username}. السبب: ${reason}`,
        ipAddress,
        userAgent,
      });

      // 8. Emit admin alert for new dispute
      emitDisputeAlert({
        disputeId: dispute.id,
        tradeId,
        isNew: true,
        severity: 'warning',
        message: `New dispute opened by ${req.user!.username} on trade #${tradeId.slice(0, 8)}. Reason: ${reason}`,
        messageAr: `تم فتح نزاع جديد بواسطة ${req.user!.username} على الصفقة #${tradeId.slice(0, 8)}. السبب: ${reason}`,
      }).catch(() => {});

      // Notify respondent about new dispute
      await sendNotification(respondentId, {
        type: 'warning',
        priority: 'urgent',
        title: 'Dispute Opened Against You ⚠️',
        titleAr: 'تم فتح نزاع ضدك ⚠️',
        message: `${req.user!.username} opened a dispute on trade #${tradeId.slice(0,8)}. Reason: ${safeReason}`,
        messageAr: `قام ${req.user!.username} بفتح نزاع على الصفقة #${tradeId.slice(0,8)}. السبب: ${safeReason}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: dispute.id, tradeId, action: 'dispute_opened' }),
      }).catch(() => {});

      // 9. Get respondent name for response
      const [respondentUser] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, respondentId))
        .limit(1);

      res.status(201).json(formatDispute({
        dispute_id: dispute.id,
        trade_id: dispute.tradeId,
        initiator_id: dispute.initiatorId,
        initiator_name: req.user!.username,
        respondent_id: dispute.respondentId,
        respondent_name: respondentUser?.username ?? "Unknown",
        dispute_status: dispute.status,
        reason: dispute.reason,
        description: dispute.description,
        dispute_created_at: dispute.createdAt,
        trade_amount: trade.amount,
        fiat_amount: trade.fiatAmount,
        currency_type: trade.currencyType,
      }));
    } catch (error: unknown) {
      console.error("[P2P Disputes] POST /disputes error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
