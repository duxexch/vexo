import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { p2pSettings } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import { getErrorMessage, calculateP2PFee } from "./helpers";

/** GET /api/p2p/my-trades, POST /api/p2p/trades, GET /api/p2p/trades/:id */
export function registerTradeRoutes(app: Express) {

  app.get("/api/p2p/my-trades", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myTrades = await storage.getUserP2PTrades(req.user!.id);
      const enriched = await Promise.all(myTrades.map(async (trade) => {
        const counterpartyId = trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId;
        const counterparty = await storage.getUser(counterpartyId);
        return {
          ...trade,
          counterpartyUsername: counterparty?.username || "Unknown",
        };
      }));
      res.json(enriched);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/trades", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { offerId, amount, paymentMethod, currencyType = 'usd' } = req.body;

      if (!offerId || typeof offerId !== 'string') {
        return res.status(400).json({ error: "Valid offer ID is required" });
      }

      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid positive amount is required" });
      }

      if (!paymentMethod || typeof paymentMethod !== 'string') {
        return res.status(400).json({ error: "Payment method is required" });
      }

      const [settings] = await db.select().from(p2pSettings).limit(1);
      if (settings) {
        if (!settings.isEnabled) {
          return res.status(403).json({ error: "P2P trading is currently disabled" });
        }

        const minTradeAmount = parseFloat(settings.minTradeAmount);
        const maxTradeAmount = parseFloat(settings.maxTradeAmount);
        const requestedAmount = parseFloat(amount);

        if (requestedAmount < minTradeAmount || requestedAmount > maxTradeAmount) {
          return res.status(400).json({ error: `Trade amount must be between ${minTradeAmount} and ${maxTradeAmount}` });
        }
      }

      if (currencyType === 'project') {
        const settings = await storage.getProjectCurrencySettings();
        if (!settings?.isActive || !settings?.useInP2P) {
          return res.status(400).json({ error: "Project currency is not available for P2P trading" });
        }
      }

      const offer = await storage.getP2POffer(offerId);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (offer.status !== 'active') {
        return res.status(400).json({ error: "Offer is no longer active" });
      }

      if (offer.userId === req.user!.id) {
        return res.status(400).json({ error: "Cannot trade with your own offer" });
      }

      const tradeAmount = parseFloat(amount);
      const minLimit = parseFloat(offer.minLimit);
      const maxLimit = parseFloat(offer.maxLimit);

      if (tradeAmount < minLimit || tradeAmount > maxLimit) {
        return res.status(400).json({ error: `Amount must be between ${minLimit} and ${maxLimit}` });
      }

      const price = parseFloat(offer.price);
      const fiatAmount = tradeAmount * price;
      const platformFee = await calculateP2PFee(tradeAmount);

      const isBuyer = offer.type === "sell";
      const buyerId = isBuyer ? req.user!.id : offer.userId;
      const sellerId = isBuyer ? offer.userId : req.user!.id;

      let result;
      if (currencyType === 'project') {
        result = await storage.createP2PTradeProjectCurrencyAtomic({
          offerId,
          buyerId,
          sellerId,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toFixed(2),
          price: offer.price,
          paymentMethod,
          platformFee: platformFee.toFixed(8),
          expiresAt: new Date(Date.now() + (offer.paymentTimeLimit * 60 * 1000)),
        });
      } else {
        result = await storage.createP2PTradeAtomic({
          offerId,
          buyerId,
          sellerId,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toFixed(2),
          price: offer.price,
          paymentMethod,
          platformFee: platformFee.toFixed(8),
          expiresAt: new Date(Date.now() + (offer.paymentTimeLimit * 60 * 1000)),
        });
      }

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const trade = result.trade!;

      await storage.createP2PTradeMessage({
        tradeId: trade.id,
        senderId: req.user!.id,
        message: "Trade started",
        isSystemMessage: true,
      });

      // Notify the offer owner that someone started a trade on their offer
      sendNotification(offer.userId, {
        type: 'p2p',
        priority: 'high',
        title: `New Trade on Your Offer`,
        titleAr: `صفقة جديدة على عرضك`,
        message: `Someone initiated a $${tradeAmount} trade on your ${offer.type} offer via ${paymentMethod}.`,
        messageAr: `شخص بدأ صفقة بقيمة $${tradeAmount} على عرض ${offer.type === 'sell' ? 'البيع' : 'الشراء'} الخاص بك عبر ${paymentMethod}.`,
        link: `/p2p/trade/${trade.id}`,
        metadata: JSON.stringify({ tradeId: trade.id, offerId: offer.id, amount: tradeAmount }),
      }).catch(() => { });

      // Emit admin alert for new P2P trade
      emitSystemAlert({
        title: 'New P2P Trade',
        titleAr: 'صفقة P2P جديدة',
        message: `New P2P trade #${trade.id.slice(0, 8)} created - Amount: $${tradeAmount} via ${paymentMethod}`,
        messageAr: `صفقة P2P جديدة #${trade.id.slice(0, 8)} - المبلغ: $${tradeAmount}`,
        severity: 'info',
        deepLink: '/admin/p2p',
        entityType: 'p2p_trade',
        entityId: trade.id,
      }).catch(() => { });

      res.status(201).json(trade);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/trades/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const trade = await storage.getP2PTrade(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (trade.buyerId !== req.user!.id && trade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to view this trade" });
      }

      const buyer = await storage.getUser(trade.buyerId);
      const seller = await storage.getUser(trade.sellerId);

      res.json({
        ...trade,
        buyer: buyer ? { id: buyer.id, username: buyer.username, nickname: buyer.nickname } : null,
        seller: seller ? { id: seller.id, username: seller.username, nickname: seller.nickname } : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
