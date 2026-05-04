import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pTransactionLogs,
  p2pTrades,
} from "@shared/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { emitDisputeAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage, formatDispute } from "./helpers";
import { P2P_DISPUTE_MINIMUM_REASONS } from "../p2p-trading/offer-validation";
import { sanitizePlainText } from "../../lib/input-security";
import { ensureP2PUsername, getP2PUsernameMap } from "../../lib/p2p-username";

const MAX_ACTIVE_DISPUTES_PER_USER = 10;
const AUTO_DISPUTE_CHECK_DELAY_MS = 15_000;
const AUTO_DISPUTE_CHECK_TIMEOUT_MS = 120_000;
const AUTO_DISPUTE_CHECK_REASON = P2P_DISPUTE_MINIMUM_REASONS[0];

export function scheduleAutoDisputeCheck(input: {
  tradeId: string;
  initiatorId: string;
  respondentId: string;
  reason?: string;
  description?: string;
}): void {
  setTimeout(async () => {
    try {
      const [trade] = await db
        .select({
          id: p2pTrades.id,
          buyerId: p2pTrades.buyerId,
          sellerId: p2pTrades.sellerId,
          status: p2pTrades.status,
        })
        .from(p2pTrades)
        .where(eq(p2pTrades.id, input.tradeId))
        .limit(1);

      if (!trade || trade.status === "completed" || trade.status === "cancelled") {
        return;
      }

      const [existingDispute] = await db
        .select({ id: p2pDisputes.id })
        .from(p2pDisputes)
        .where(and(
          eq(p2pDisputes.tradeId, input.tradeId),
          or(
            eq(p2pDisputes.status, "open"),
            eq(p2pDisputes.status, "investigating"),
          ),
        ))
        .limit(1);

      if (existingDispute) {
        return;
      }

      const safeReason = P2P_DISPUTE_MINIMUM_REASONS.includes(input.reason as typeof AUTO_DISPUTE_CHECK_REASON)
        ? (input.reason as typeof AUTO_DISPUTE_CHECK_REASON)
        : AUTO_DISPUTE_CHECK_REASON;
      const safeDescription = sanitizePlainText(
        input.description || `Auto dispute check triggered for instant trade ${input.tradeId}.`,
        { maxLength: 2000 },
      ).trim();

      const [dispute] = await db
        .insert(p2pDisputes)
        .values({
          tradeId: input.tradeId,
          initiatorId: input.initiatorId,
          respondentId: input.respondentId,
          reason: safeReason,
          description: safeDescription,
          status: "open",
        })
        .returning();

      await db
        .update(p2pTrades)
        .set({ status: "disputed", updatedAt: new Date() })
        .where(eq(p2pTrades.id, input.tradeId));

      await db.insert(p2pTransactionLogs).values({
        tradeId: input.tradeId,
        disputeId: dispute.id,
        userId: input.initiatorId,
        action: "dispute_opened",
        description: `Auto-dispute check opened dispute on trade ${input.tradeId}`,
        descriptionAr: `فحص النزاع التلقائي فتح نزاعًا على الصفقة ${input.tradeId}`,
        ipAddress: "",
        userAgent: "",
      });
    } catch (error) {
      console.warn("[P2P Disputes] Auto-dispute check failed", {
        tradeId: input.tradeId,
        error: getErrorMessage(error),
      });
    }
  }, Math.min(AUTO_DISPUTE_CHECK_DELAY_MS, AUTO_DISPUTE_CHECK_TIMEOUT_MS));
}

/** POST /api/p2p/disputes — Create a new dispute on a trade */
export function registerCreateRoutes(app: Express) {

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

  const emitDisputeAlertWithLog = async (
    payload: Parameters<typeof emitDisputeAlert>[0],
    context: string,
  ) => {
    await emitDisputeAlert(payload).catch((error: unknown) => {
      console.warn(`[P2P Disputes] Admin alert emission failure (${context})`, {
        error: getErrorMessage(error),
      });
    });
  };

  app.post("/api/p2p/disputes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { tradeId, reason, description } = req.body;
      const initiatorP2PUsername = await ensureP2PUsername(userId, req.user!.username);

      if (!tradeId || !reason) {
        return res.status(400).json({ error: "tradeId and reason are required" });
      }

      if (req.headers["x-auto-dispute-check"] === "true" && !P2P_DISPUTE_MINIMUM_REASONS.includes(reason)) {
        return res.status(400).json({ error: "Invalid auto-dispute reason" });
      }

      // SECURITY: Sanitize text inputs to prevent stored XSS
      const safeReason = sanitizePlainText(reason, { maxLength: 500 });
      const safeDescription = sanitizePlainText(description, { maxLength: 2000 });

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

      // 3.1 Guardrail: cap active disputes per user to reduce abuse/spam load
      const [activeDisputesCountRow] = await db
        .select({ count: sql<string>`count(*)` })
        .from(p2pDisputes)
        .where(
          and(
            or(
              eq(p2pDisputes.initiatorId, userId),
              eq(p2pDisputes.respondentId, userId),
            ),
            or(
              eq(p2pDisputes.status, "open"),
              eq(p2pDisputes.status, "investigating"),
            )
          )
        );

      const activeDisputesCount = Number(activeDisputesCountRow?.count || 0);
      if (activeDisputesCount >= MAX_ACTIVE_DISPUTES_PER_USER) {
        return res.status(429).json({
          error: `Too many active disputes. Please resolve existing disputes before opening new ones (max ${MAX_ACTIVE_DISPUTES_PER_USER}).`,
        });
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
        description: `Dispute opened by ${initiatorP2PUsername}. Reason: ${reason}`,
        descriptionAr: `تم فتح نزاع بواسطة ${initiatorP2PUsername}. السبب: ${reason}`,
        ipAddress,
        userAgent,
      });

      // 8. Emit admin alert for new dispute
      await emitDisputeAlertWithLog({
        disputeId: dispute.id,
        tradeId,
        isNew: true,
        severity: 'warning',
        message: `New dispute opened by ${initiatorP2PUsername} on trade #${tradeId.slice(0, 8)}. Reason: ${reason}`,
        messageAr: `تم فتح نزاع جديد بواسطة ${initiatorP2PUsername} على الصفقة #${tradeId.slice(0, 8)}. السبب: ${reason}`,
      }, "create-dispute");

      // Notify respondent about new dispute
      await notifyWithLog(respondentId, {
        type: 'warning',
        priority: 'urgent',
        title: 'Dispute Opened Against You ⚠️',
        titleAr: 'تم فتح نزاع ضدك ⚠️',
        message: `${initiatorP2PUsername} opened a dispute on trade #${tradeId.slice(0, 8)}. Reason: ${safeReason}`,
        messageAr: `قام ${initiatorP2PUsername} بفتح نزاع على الصفقة #${tradeId.slice(0, 8)}. السبب: ${safeReason}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: dispute.id, tradeId, action: 'dispute_opened' }),
      }, "create-dispute:respondent");

      const usernamesByUserId = await getP2PUsernameMap([userId, respondentId]);

      res.status(201).json(formatDispute({
        dispute_id: dispute.id,
        trade_id: dispute.tradeId,
        initiator_id: dispute.initiatorId,
        initiator_name: usernamesByUserId.get(userId) || initiatorP2PUsername,
        respondent_id: dispute.respondentId,
        respondent_name: usernamesByUserId.get(respondentId) ?? "trader_user",
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
