import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";

/** POST complete, cancel — Trade resolution actions */
export function registerTradeLifecycleRoutes(app: Express) {

  app.post("/api/p2p/trades/:id/complete", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const existingTrade = await storage.getP2PTrade(req.params.id);
      if (!existingTrade) {
        return res.status(404).json({ error: "Trade not found" });
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
      
      await storage.createP2PTradeMessage({
        tradeId: trade.id,
        senderId: req.user!.id,
        message: "Trade completed, funds released",
        isSystemMessage: true,
      });
      
      const metrics = await storage.getP2PTraderMetrics(trade.buyerId);
      await storage.updateP2PTraderMetrics(trade.buyerId, {
        totalTrades: (metrics?.totalTrades || 0) + 1,
        completedTrades: (metrics?.completedTrades || 0) + 1,
        totalBuyTrades: (metrics?.totalBuyTrades || 0) + 1,
        lastTradeAt: new Date(),
      });
      
      const sellerMetrics = await storage.getP2PTraderMetrics(trade.sellerId);
      await storage.updateP2PTraderMetrics(trade.sellerId, {
        totalTrades: (sellerMetrics?.totalTrades || 0) + 1,
        completedTrades: (sellerMetrics?.completedTrades || 0) + 1,
        totalSellTrades: (sellerMetrics?.totalSellTrades || 0) + 1,
        lastTradeAt: new Date(),
      });

      // Notify both parties about trade completion
      await sendNotification(trade.buyerId, {
        type: 'success',
        priority: 'high',
        title: 'Trade Completed! ✅',
        titleAr: 'اكتملت الصفقة! ✅',
        message: `Trade #${trade.id.slice(0,8)} completed. Funds have been released to your account.`,
        messageAr: `اكتملت الصفقة #${trade.id.slice(0,8)}. تم تحويل الأموال إلى حسابك.`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'completed' }),
      }).catch(() => {});
      await sendNotification(trade.sellerId, {
        type: 'success',
        priority: 'high',
        title: 'Trade Completed! ✅',
        titleAr: 'اكتملت الصفقة! ✅',
        message: `Trade #${trade.id.slice(0,8)} completed. Funds have been released.`,
        messageAr: `اكتملت الصفقة #${trade.id.slice(0,8)}. تم تحويل الأموال.`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'completed' }),
      }).catch(() => {});
      
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
      
      await storage.createP2PTradeMessage({
        tradeId: trade.id,
        senderId: req.user!.id,
        message: `Trade cancelled: ${reason || "No reason provided"}`,
        isSystemMessage: true,
      });
      
      const buyerMetrics = await storage.getP2PTraderMetrics(trade.buyerId);
      await storage.updateP2PTraderMetrics(trade.buyerId, {
        totalTrades: (buyerMetrics?.totalTrades || 0) + 1,
        cancelledTrades: (buyerMetrics?.cancelledTrades || 0) + 1,
      });
      
      const sellerMetrics = await storage.getP2PTraderMetrics(trade.sellerId);
      await storage.updateP2PTraderMetrics(trade.sellerId, {
        totalTrades: (sellerMetrics?.totalTrades || 0) + 1,
        cancelledTrades: (sellerMetrics?.cancelledTrades || 0) + 1,
      });

      // Notify counterparty about cancellation
      const cancelledByUser = await storage.getUser(req.user!.id);
      const counterpartyId = trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId;
      await sendNotification(counterpartyId, {
        type: 'warning',
        priority: 'high',
        title: 'Trade Cancelled',
        titleAr: 'تم إلغاء الصفقة',
        message: `Trade #${trade.id.slice(0,8)} was cancelled by ${cancelledByUser?.username || 'the other party'}.${reason ? ' Reason: ' + reason : ''}`,
        messageAr: `تم إلغاء الصفقة #${trade.id.slice(0,8)} بواسطة ${cancelledByUser?.username || 'الطرف الآخر'}.${reason ? ' السبب: ' + reason : ''}`,
        link: '/p2p',
        metadata: JSON.stringify({ tradeId: trade.id, action: 'cancelled' }),
      }).catch(() => {});
      
      res.json(trade);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
