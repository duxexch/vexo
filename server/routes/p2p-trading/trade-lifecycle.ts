import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { createP2PTradeAuditLog, getErrorMessage, getP2PEscrowFreezeHours } from "./helpers";
import { applyP2PFreezeBenefitForCompletedTrade } from "../../lib/p2p-freeze-program";
import { db } from "../../db";
import { p2pOffers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function calculateCompletionRate(totalTrades: number, completedTrades: number): string {
  if (totalTrades <= 0) {
    return "0.00";
  }

  return ((completedTrades / totalTrades) * 100).toFixed(2);
}

const CANCEL_HANDSHAKE_PREFIX = "[[P2P_CANCEL_HANDSHAKE_V1]]";

type CancelHandshakeKind = "request" | "approval";

interface CancelHandshakePayload {
  version: 1;
  kind: CancelHandshakeKind;
  requestId: string;
  tradeId: string;
  requesterId: string;
  approverId?: string;
  reason: string | null;
  attestNoFundsMoved: boolean;
  attestConsequencesAccepted: boolean;
  createdAt: string;
}

function encodeCancelHandshakePayload(payload: CancelHandshakePayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `${CANCEL_HANDSHAKE_PREFIX}${encodedPayload}`;
}

function decodeCancelHandshakePayload(rawMessage: string): CancelHandshakePayload | null {
  if (typeof rawMessage !== "string" || !rawMessage.startsWith(CANCEL_HANDSHAKE_PREFIX)) {
    return null;
  }

  const encodedPayload = rawMessage.slice(CANCEL_HANDSHAKE_PREFIX.length);
  if (!encodedPayload) {
    return null;
  }

  try {
    const decodedPayload = Buffer.from(encodedPayload, "base64").toString("utf8");
    const parsedPayload = JSON.parse(decodedPayload) as Partial<CancelHandshakePayload>;

    if (
      parsedPayload.version !== 1
      || (parsedPayload.kind !== "request" && parsedPayload.kind !== "approval")
      || typeof parsedPayload.requestId !== "string"
      || parsedPayload.requestId.trim().length === 0
      || typeof parsedPayload.tradeId !== "string"
      || parsedPayload.tradeId.trim().length === 0
      || typeof parsedPayload.requesterId !== "string"
      || parsedPayload.requesterId.trim().length === 0
      || typeof parsedPayload.attestNoFundsMoved !== "boolean"
      || typeof parsedPayload.attestConsequencesAccepted !== "boolean"
      || typeof parsedPayload.createdAt !== "string"
    ) {
      return null;
    }

    if (parsedPayload.kind === "approval" && (typeof parsedPayload.approverId !== "string" || parsedPayload.approverId.trim().length === 0)) {
      return null;
    }

    return {
      version: 1,
      kind: parsedPayload.kind,
      requestId: parsedPayload.requestId,
      tradeId: parsedPayload.tradeId,
      requesterId: parsedPayload.requesterId,
      approverId: parsedPayload.approverId,
      reason: typeof parsedPayload.reason === "string" ? parsedPayload.reason : null,
      attestNoFundsMoved: parsedPayload.attestNoFundsMoved,
      attestConsequencesAccepted: parsedPayload.attestConsequencesAccepted,
      createdAt: parsedPayload.createdAt,
    };
  } catch {
    return null;
  }
}

type CancelHandshakeEvent = {
  payload: CancelHandshakePayload;
  createdAt: Date;
};

function parseCancelHandshakeEvents(messages: Array<{ message: string; createdAt: Date }>) {
  return messages.flatMap((messageRow) => {
    const payload = decodeCancelHandshakePayload(messageRow.message);
    if (!payload) {
      return [] as CancelHandshakeEvent[];
    }

    return [{
      payload,
      createdAt: new Date(messageRow.createdAt),
    }];
  });
}

function findLatestCancellationRequest(cancelEvents: CancelHandshakeEvent[]): CancelHandshakeEvent | null {
  return [...cancelEvents].reverse().find((event) => event.payload.kind === "request") || null;
}

function findApprovalForRequest(
  cancelEvents: CancelHandshakeEvent[],
  requestEvent: CancelHandshakeEvent,
): CancelHandshakeEvent | null {
  return [...cancelEvents].reverse().find((event) => {
    return event.payload.kind === "approval"
      && event.payload.requestId === requestEvent.payload.requestId
      && event.createdAt >= requestEvent.createdAt;
  }) || null;
}

function findLatestPendingCancellationRequest(cancelEvents: CancelHandshakeEvent[]): CancelHandshakeEvent | null {
  const latestRequest = findLatestCancellationRequest(cancelEvents);
  if (!latestRequest) {
    return null;
  }

  const approvalEvent = findApprovalForRequest(cancelEvents, latestRequest);
  return approvalEvent ? null : latestRequest;
}

function findLatestApprovedCancellation(cancelEvents: CancelHandshakeEvent[]) {
  const latestRequest = findLatestCancellationRequest(cancelEvents);
  if (!latestRequest) {
    return null;
  }

  const approvalEvent = findApprovalForRequest(cancelEvents, latestRequest);
  if (!approvalEvent) {
    return null;
  }

  return {
    requestEvent: latestRequest,
    approvalEvent,
  };
}

function canUserCancelTradeByStatus(
  trade: { buyerId: string; sellerId: string; status: string },
  userId: string,
): boolean {
  if (trade.buyerId !== userId && trade.sellerId !== userId) {
    return false;
  }

  return trade.status === "pending" || trade.status === "paid";
}

/** POST complete, cancel — Trade resolution actions */
export function registerTradeLifecycleRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[P2P Trading] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

  app.post("/api/p2p/trades/:id/complete", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const existingTrade = await storage.getP2PTrade(req.params.id);
      if (!existingTrade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (existingTrade.buyerId !== req.user!.id && existingTrade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to access this trade" });
      }

      let result;
      if (existingTrade.currencyType === 'project') {
        result = await storage.completeP2PTradeProjectCurrencyAtomic(req.params.id, req.user!.id);
      } else {
        result = await storage.completeP2PTradeAtomic(req.params.id, req.user!.id);
      }

      if (!result.success) {
        const statusCode = result.error?.includes('not found') ? 404 :
          result.error?.includes('Only the seller') ? 403 : 400;
        return res.status(statusCode).json({ error: result.error });
      }

      const trade = result.trade!;

      if (result.transitioned === false) {
        return res.json(trade);
      }

      const tradeCompletedAt = trade.completedAt ? new Date(trade.completedAt) : new Date();
      const [offerRow] = await db
        .select({ cryptoCurrency: p2pOffers.cryptoCurrency })
        .from(p2pOffers)
        .where(eq(p2pOffers.id, trade.offerId))
        .limit(1);

      const freezeHours = await getP2PEscrowFreezeHours();
      const freezeBenefitResult = await applyP2PFreezeBenefitForCompletedTrade({
        tradeId: trade.id,
        buyerId: trade.buyerId,
        currencyCode: String(offerRow?.cryptoCurrency || "USD").toUpperCase(),
        tradeAmount: Number(trade.amount || 0),
        completedAt: tradeCompletedAt,
        baseFreezeHours: freezeHours,
      });
      const frozenUntil = freezeBenefitResult.freezeUntil;
      const frozenUntilIso = frozenUntil.toISOString();
      const appliedFreezeHours = freezeBenefitResult.freezeHoursApplied;
      const appliedReductionPercent = freezeBenefitResult.freezeReductionPercent;

      await createP2PTradeAuditLog({
        tradeId: trade.id,
        userId: req.user!.id,
        action: "trade_completed",
        description: `Trade completed by seller. Buyer amount is frozen until ${frozenUntilIso}.`,
        descriptionAr: `تم إكمال الصفقة بواسطة البائع. رصيد المشتري مجمد حتى ${frozenUntilIso}.`,
        metadata: {
          freezeHours: appliedFreezeHours,
          freezeReductionPercent: appliedReductionPercent,
          frozenUntil: frozenUntilIso,
          currencyType: trade.currencyType,
          amount: trade.amount,
        },
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      await createP2PTradeAuditLog({
        tradeId: trade.id,
        userId: trade.buyerId,
        action: "escrow_released",
        description: `Escrow released to buyer and locked for ${appliedFreezeHours} hour(s) until ${frozenUntilIso}.`,
        descriptionAr: `تم تحرير الضمان للمشتري مع تجميده لمدة ${appliedFreezeHours} ساعة حتى ${frozenUntilIso}.`,
        metadata: {
          freezeHours: appliedFreezeHours,
          freezeReductionPercent: appliedReductionPercent,
          frozenUntil: frozenUntilIso,
          escrowAmount: trade.escrowAmount,
          platformFee: trade.platformFee,
        },
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      await storage.createP2PTradeMessage({
        tradeId: trade.id,
        senderId: req.user!.id,
        message: `Trade completed, funds released. Buyer balance is frozen until ${frozenUntilIso} (${appliedFreezeHours}h${appliedReductionPercent > 0 ? `, ${appliedReductionPercent.toFixed(2)}% faster release` : ""}).`,
        isSystemMessage: true,
      });

      const metrics = await storage.getP2PTraderMetrics(trade.buyerId);
      const buyerTotalTrades = (metrics?.totalTrades || 0) + 1;
      const buyerCompletedTrades = (metrics?.completedTrades || 0) + 1;
      await storage.updateP2PTraderMetrics(trade.buyerId, {
        totalTrades: buyerTotalTrades,
        completedTrades: buyerCompletedTrades,
        completionRate: calculateCompletionRate(buyerTotalTrades, buyerCompletedTrades),
        totalBuyTrades: (metrics?.totalBuyTrades || 0) + 1,
        lastTradeAt: new Date(),
      });

      const sellerMetrics = await storage.getP2PTraderMetrics(trade.sellerId);
      const sellerTotalTrades = (sellerMetrics?.totalTrades || 0) + 1;
      const sellerCompletedTrades = (sellerMetrics?.completedTrades || 0) + 1;
      await storage.updateP2PTraderMetrics(trade.sellerId, {
        totalTrades: sellerTotalTrades,
        completedTrades: sellerCompletedTrades,
        completionRate: calculateCompletionRate(sellerTotalTrades, sellerCompletedTrades),
        totalSellTrades: (sellerMetrics?.totalSellTrades || 0) + 1,
        lastTradeAt: new Date(),
      });

      // Notify both parties about trade completion
      await notifyWithLog(trade.buyerId, {
        type: 'success',
        priority: 'high',
        title: 'Trade Completed! ✅',
        titleAr: 'اكتملت الصفقة! ✅',
        message: `Trade #${trade.id.slice(0, 8)} completed. Funds are credited and frozen until ${frozenUntilIso}.`,
        messageAr: `اكتملت الصفقة #${trade.id.slice(0, 8)}. تم إضافة الرصيد وسيبقى مجمداً حتى ${frozenUntilIso}.`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'completed', freezeHours: appliedFreezeHours, freezeReductionPercent: appliedReductionPercent, frozenUntil: frozenUntilIso }),
      }, "trade-complete:buyer");
      await notifyWithLog(trade.sellerId, {
        type: 'success',
        priority: 'high',
        title: 'Trade Completed! ✅',
        titleAr: 'اكتملت الصفقة! ✅',
        message: `Trade #${trade.id.slice(0, 8)} completed. Funds have been released.`,
        messageAr: `اكتملت الصفقة #${trade.id.slice(0, 8)}. تم تحويل الأموال.`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'completed' }),
      }, "trade-complete:seller");

      res.json(trade);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/trades/:id/cancel/request", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requestBody = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const reason = typeof requestBody.reason === "string"
        ? requestBody.reason.trim().slice(0, 240)
        : "";
      const confirmNoFundsMoved = requestBody.confirmNoFundsMoved === true;
      const acceptCancellationConsequences = requestBody.acceptCancellationConsequences === true;

      if (!confirmNoFundsMoved || !acceptCancellationConsequences) {
        return res.status(400).json({ error: "Cancellation request requires both attestations" });
      }

      const existingTrade = await storage.getP2PTrade(req.params.id);
      if (!existingTrade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (existingTrade.buyerId !== req.user!.id && existingTrade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to access this trade" });
      }

      if (!canUserCancelTradeByStatus(existingTrade, req.user!.id)) {
        return res.status(400).json({ error: "You cannot request cancellation in the current trade state" });
      }

      const tradeMessages = await storage.getP2PTradeMessages(existingTrade.id);
      const cancelEvents = parseCancelHandshakeEvents(tradeMessages);
      const latestPendingRequest = findLatestPendingCancellationRequest(cancelEvents);

      if (latestPendingRequest) {
        return res.status(409).json({ error: "A pending cancellation request already exists" });
      }

      const requestId = randomUUID();
      const handshakePayload: CancelHandshakePayload = {
        version: 1,
        kind: "request",
        requestId,
        tradeId: existingTrade.id,
        requesterId: req.user!.id,
        reason: reason || null,
        attestNoFundsMoved: true,
        attestConsequencesAccepted: true,
        createdAt: new Date().toISOString(),
      };

      await storage.createP2PTradeMessage({
        tradeId: existingTrade.id,
        senderId: req.user!.id,
        message: encodeCancelHandshakePayload(handshakePayload),
        isSystemMessage: true,
      });

      const counterpartyId = existingTrade.buyerId === req.user!.id ? existingTrade.sellerId : existingTrade.buyerId;
      const requesterUser = await storage.getUser(req.user!.id);
      await notifyWithLog(counterpartyId, {
        type: 'warning',
        priority: 'high',
        title: 'Cancellation Approval Needed',
        titleAr: 'موافقة إلغاء مطلوبة',
        message: `${requesterUser?.username || 'Counterparty'} requested cancellation for trade #${existingTrade.id.slice(0, 8)}.`,
        messageAr: `طلب ${requesterUser?.username || 'الطرف الآخر'} إلغاء الصفقة #${existingTrade.id.slice(0, 8)}.`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: existingTrade.id, action: 'cancel_request', requestId }),
      }, "trade-cancel-request:counterparty");

      res.status(201).json({
        success: true,
        requestId,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/trades/:id/cancel/approve", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requestBody = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const requestId = typeof requestBody.requestId === "string"
        ? requestBody.requestId.trim()
        : "";
      const confirmNoFundsMoved = requestBody.confirmNoFundsMoved === true;
      const acceptCancellationConsequences = requestBody.acceptCancellationConsequences === true;

      if (!confirmNoFundsMoved || !acceptCancellationConsequences) {
        return res.status(400).json({ error: "Cancellation approval requires both attestations" });
      }

      const existingTrade = await storage.getP2PTrade(req.params.id);
      if (!existingTrade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (existingTrade.buyerId !== req.user!.id && existingTrade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to access this trade" });
      }

      if (existingTrade.status !== "pending" && existingTrade.status !== "paid") {
        return res.status(400).json({ error: "Trade does not allow cancellation approval in current state" });
      }

      const tradeMessages = await storage.getP2PTradeMessages(existingTrade.id);
      const cancelEvents = parseCancelHandshakeEvents(tradeMessages);
      const latestPendingRequest = findLatestPendingCancellationRequest(cancelEvents);

      if (!latestPendingRequest) {
        const latestApprovedCancellation = findLatestApprovedCancellation(cancelEvents);
        if (latestApprovedCancellation) {
          return res.status(409).json({ error: "Latest cancellation request is already approved" });
        }

        return res.status(404).json({ error: "No pending cancellation request found" });
      }

      if (requestId && latestPendingRequest.payload.requestId !== requestId) {
        return res.status(409).json({ error: "Only the latest pending cancellation request can be approved" });
      }

      if (latestPendingRequest.payload.requesterId === req.user!.id) {
        return res.status(403).json({ error: "Requester cannot approve own cancellation request" });
      }

      const expectedApproverId = latestPendingRequest.payload.requesterId === existingTrade.buyerId
        ? existingTrade.sellerId
        : existingTrade.buyerId;

      if (expectedApproverId !== req.user!.id) {
        return res.status(403).json({ error: "Only the counterparty can approve this cancellation request" });
      }

      const approvalPayload: CancelHandshakePayload = {
        version: 1,
        kind: "approval",
        requestId: latestPendingRequest.payload.requestId,
        tradeId: existingTrade.id,
        requesterId: latestPendingRequest.payload.requesterId,
        approverId: req.user!.id,
        reason: latestPendingRequest.payload.reason,
        attestNoFundsMoved: true,
        attestConsequencesAccepted: true,
        createdAt: new Date().toISOString(),
      };

      await storage.createP2PTradeMessage({
        tradeId: existingTrade.id,
        senderId: req.user!.id,
        message: encodeCancelHandshakePayload(approvalPayload),
        isSystemMessage: true,
      });

      await notifyWithLog(latestPendingRequest.payload.requesterId, {
        type: 'warning',
        priority: 'high',
        title: 'Cancellation Request Approved',
        titleAr: 'تمت الموافقة على طلب الإلغاء',
        message: `Your cancellation request for trade #${existingTrade.id.slice(0, 8)} was approved.`,
        messageAr: `تمت الموافقة على طلبك لإلغاء الصفقة #${existingTrade.id.slice(0, 8)}.`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: existingTrade.id, action: 'cancel_approved', requestId: latestPendingRequest.payload.requestId }),
      }, "trade-cancel-approve:requester");

      res.status(201).json({
        success: true,
        requestId: latestPendingRequest.payload.requestId,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/trades/:id/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requestBody = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const reason = typeof requestBody.reason === "string"
        ? requestBody.reason.trim().slice(0, 240)
        : "";
      const confirmNoFundsMoved = requestBody.confirmNoFundsMoved === true;
      const acceptCancellationConsequences = requestBody.acceptCancellationConsequences === true;

      if (!confirmNoFundsMoved || !acceptCancellationConsequences) {
        return res.status(400).json({ error: "Cancellation requires both attestations" });
      }

      const existingTrade = await storage.getP2PTrade(req.params.id);
      if (!existingTrade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (existingTrade.buyerId !== req.user!.id && existingTrade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to access this trade" });
      }

      if (!canUserCancelTradeByStatus(existingTrade, req.user!.id)) {
        return res.status(400).json({ error: "You cannot cancel this trade in the current state" });
      }

      const tradeMessages = await storage.getP2PTradeMessages(existingTrade.id);
      const cancelEvents = parseCancelHandshakeEvents(tradeMessages);
      const latestPendingRequest = findLatestPendingCancellationRequest(cancelEvents);

      if (latestPendingRequest) {
        return res.status(400).json({ error: "Pending cancellation request requires counterparty approval" });
      }

      const latestApprovedCancellation = findLatestApprovedCancellation(cancelEvents);

      if (!latestApprovedCancellation) {
        return res.status(400).json({ error: "Counterparty approval is required before cancellation" });
      }

      const approvedRequestEvent = latestApprovedCancellation.requestEvent;
      const approvalEvent = latestApprovedCancellation.approvalEvent;

      if (approvedRequestEvent.payload.requesterId !== req.user!.id && approvalEvent.payload.approverId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to finalize this cancellation" });
      }

      const resolvedCancelReason = reason || approvedRequestEvent.payload.reason || undefined;

      let result;
      if (existingTrade.currencyType === 'project') {
        result = await storage.cancelP2PTradeProjectCurrencyAtomic(req.params.id, req.user!.id, resolvedCancelReason);
      } else {
        result = await storage.cancelP2PTradeAtomic(req.params.id, req.user!.id, resolvedCancelReason);
      }

      if (!result.success) {
        const statusCode = result.error?.includes('not found') ? 404 :
          result.error?.includes('Not authorized') ? 403 : 400;
        return res.status(statusCode).json({ error: result.error });
      }

      const trade = result.trade!;

      if (result.transitioned === false) {
        return res.json(trade);
      }

      await createP2PTradeAuditLog({
        tradeId: trade.id,
        userId: req.user!.id,
        action: "trade_cancelled",
        description: `Trade cancelled by user ${req.user!.id}. Reason: ${resolvedCancelReason || "n/a"}`,
        descriptionAr: `تم إلغاء الصفقة بواسطة المستخدم ${req.user!.id}. السبب: ${resolvedCancelReason || "غير محدد"}`,
        metadata: {
          reason: resolvedCancelReason || null,
          cancellationRequestId: approvedRequestEvent.payload.requestId,
          approvedBy: approvalEvent?.payload.approverId || null,
        },
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      await createP2PTradeAuditLog({
        tradeId: trade.id,
        userId: trade.sellerId,
        action: "escrow_returned",
        description: `Escrow returned to seller due to trade cancellation.`,
        descriptionAr: `تم إرجاع الضمان إلى البائع بعد إلغاء الصفقة.`,
        metadata: {
          escrowAmount: trade.escrowAmount,
          cancellationRequestId: approvedRequestEvent.payload.requestId,
        },
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      await storage.createP2PTradeMessage({
        tradeId: trade.id,
        senderId: req.user!.id,
        message: `Trade cancelled: ${resolvedCancelReason || "No reason provided"}`,
        isSystemMessage: true,
      });

      const buyerMetrics = await storage.getP2PTraderMetrics(trade.buyerId);
      const buyerTotalTrades = (buyerMetrics?.totalTrades || 0) + 1;
      const buyerCompletedTrades = buyerMetrics?.completedTrades || 0;
      await storage.updateP2PTraderMetrics(trade.buyerId, {
        totalTrades: buyerTotalTrades,
        cancelledTrades: (buyerMetrics?.cancelledTrades || 0) + 1,
        completionRate: calculateCompletionRate(buyerTotalTrades, buyerCompletedTrades),
        lastTradeAt: new Date(),
      });

      const sellerMetrics = await storage.getP2PTraderMetrics(trade.sellerId);
      const sellerTotalTrades = (sellerMetrics?.totalTrades || 0) + 1;
      const sellerCompletedTrades = sellerMetrics?.completedTrades || 0;
      await storage.updateP2PTraderMetrics(trade.sellerId, {
        totalTrades: sellerTotalTrades,
        cancelledTrades: (sellerMetrics?.cancelledTrades || 0) + 1,
        completionRate: calculateCompletionRate(sellerTotalTrades, sellerCompletedTrades),
        lastTradeAt: new Date(),
      });

      // Notify counterparty about cancellation
      const cancelledByUser = await storage.getUser(req.user!.id);
      const counterpartyId = trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId;
      await notifyWithLog(counterpartyId, {
        type: 'warning',
        priority: 'high',
        title: 'Trade Cancelled',
        titleAr: 'تم إلغاء الصفقة',
        message: `Trade #${trade.id.slice(0, 8)} was cancelled by ${cancelledByUser?.username || 'the other party'}.${resolvedCancelReason ? ' Reason: ' + resolvedCancelReason : ''}`,
        messageAr: `تم إلغاء الصفقة #${trade.id.slice(0, 8)} بواسطة ${cancelledByUser?.username || 'الطرف الآخر'}.${resolvedCancelReason ? ' السبب: ' + resolvedCancelReason : ''}`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'cancelled', cancellationRequestId: approvedRequestEvent.payload.requestId }),
      }, "trade-cancel:counterparty");

      res.json(trade);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
