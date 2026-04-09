import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { computeFreezeUntilDate, createP2PTradeAuditLog, getErrorMessage, getP2PEscrowFreezeHours } from "./helpers";

function calculateCompletionRate(totalTrades: number, completedTrades: number): string {
  if (totalTrades <= 0) {
    return "0.00";
  }

  return ((completedTrades / totalTrades) * 100).toFixed(2);
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
      const freezeHours = await getP2PEscrowFreezeHours();
      const frozenUntil = computeFreezeUntilDate(tradeCompletedAt, freezeHours);
      const frozenUntilIso = frozenUntil.toISOString();

      await createP2PTradeAuditLog({
        tradeId: trade.id,
        userId: req.user!.id,
        action: "trade_completed",
        description: `Trade completed by seller. Buyer amount is frozen until ${frozenUntilIso}.`,
        descriptionAr: `تم إكمال الصفقة بواسطة البائع. رصيد المشتري مجمد حتى ${frozenUntilIso}.`,
        metadata: {
          freezeHours,
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
        description: `Escrow released to buyer and locked for ${freezeHours} hour(s) until ${frozenUntilIso}.`,
        descriptionAr: `تم تحرير الضمان للمشتري مع تجميده لمدة ${freezeHours} ساعة حتى ${frozenUntilIso}.`,
        metadata: {
          freezeHours,
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
        message: `Trade completed, funds released. Buyer balance is frozen until ${frozenUntilIso}.`,
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
        metadata: JSON.stringify({ tradeId: trade.id, action: 'completed', freezeHours, frozenUntil: frozenUntilIso }),
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

  app.post("/api/p2p/trades/:id/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { reason } = req.body;

      const existingTrade = await storage.getP2PTrade(req.params.id);
      if (!existingTrade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (existingTrade.buyerId !== req.user!.id && existingTrade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to access this trade" });
      }

      let result;
      if (existingTrade.currencyType === 'project') {
        result = await storage.cancelP2PTradeProjectCurrencyAtomic(req.params.id, req.user!.id, reason);
      } else {
        result = await storage.cancelP2PTradeAtomic(req.params.id, req.user!.id, reason);
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
        description: `Trade cancelled by user ${req.user!.id}. Reason: ${reason || "n/a"}`,
        descriptionAr: `تم إلغاء الصفقة بواسطة المستخدم ${req.user!.id}. السبب: ${reason || "غير محدد"}`,
        metadata: {
          reason: reason || null,
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
        },
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      await storage.createP2PTradeMessage({
        tradeId: trade.id,
        senderId: req.user!.id,
        message: `Trade cancelled: ${reason || "No reason provided"}`,
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
        message: `Trade #${trade.id.slice(0, 8)} was cancelled by ${cancelledByUser?.username || 'the other party'}.${reason ? ' Reason: ' + reason : ''}`,
        messageAr: `تم إلغاء الصفقة #${trade.id.slice(0, 8)} بواسطة ${cancelledByUser?.username || 'الطرف الآخر'}.${reason ? ' السبب: ' + reason : ''}`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'cancelled' }),
      }, "trade-cancel:counterparty");

      res.json(trade);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
