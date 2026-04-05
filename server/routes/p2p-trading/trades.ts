import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { p2pSettings } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import {
  checkUserP2PTradingPermission,
  getErrorMessage,
  calculateP2PFee,
  getEffectiveP2PVerificationLevel,
  getP2PVerificationErrorMessage,
  hasRequiredP2PVerification,
  MIN_P2P_VERIFICATION_LEVEL,
} from "./helpers";
import { paymentIpGuard, paymentOperationTokenGuard } from "../../lib/payment-security";
import { getP2PUsernameMap } from "../../lib/p2p-username";

/** GET /api/p2p/my-trades, POST /api/p2p/trades, GET /api/p2p/trades/:id */
export function registerTradeRoutes(app: Express) {

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

  const emitSystemAlertWithLog = async (
    payload: Parameters<typeof emitSystemAlert>[0],
    context: string,
  ) => {
    await emitSystemAlert(payload).catch((error: unknown) => {
      console.warn(`[P2P Trading] System alert emission failure (${context})`, {
        error: getErrorMessage(error),
      });
    });
  };

  app.get("/api/p2p/my-trades", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myTrades = await storage.getUserP2PTrades(req.user!.id);
      const counterpartyIds = myTrades.map((trade) =>
        trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId,
      );
      const usernamesByUserId = await getP2PUsernameMap(counterpartyIds);

      const enriched = myTrades.map((trade) => {
        const counterpartyId = trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId;
        return {
          ...trade,
          counterpartyUsername: usernamesByUserId.get(counterpartyId) || "trader_user",
          totalPrice: trade.fiatAmount,
          isBuyer: trade.buyerId === req.user!.id,
          isSeller: trade.sellerId === req.user!.id,
        };
      });
      res.json(enriched);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post(
    "/api/p2p/trades",
    authMiddleware,
    paymentIpGuard("p2p_trade_create"),
    paymentOperationTokenGuard("p2p_trade_create"),
    sensitiveRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const { offerId, amount, paymentMethod, currencyType = 'usd' } = req.body;
        const requestingUser = await storage.getUser(req.user!.id);

        if (!requestingUser) {
          return res.status(404).json({ error: "User not found" });
        }

        if (requestingUser.p2pBanned) {
          return res.status(403).json({
            error: requestingUser.p2pBanReason || "Your P2P access is currently restricted",
          });
        }

        const requesterVerificationLevel = await getEffectiveP2PVerificationLevel(requestingUser);
        if (!hasRequiredP2PVerification(requesterVerificationLevel, MIN_P2P_VERIFICATION_LEVEL)) {
          return res.status(403).json({
            error: getP2PVerificationErrorMessage(MIN_P2P_VERIFICATION_LEVEL),
          });
        }

        const requesterTradingPermission = await checkUserP2PTradingPermission(req.user!.id);
        if (!requesterTradingPermission.allowed) {
          return res.status(403).json({ error: requesterTradingPermission.reason });
        }

        if (!offerId || typeof offerId !== 'string') {
          return res.status(400).json({ error: "Valid offer ID is required" });
        }

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          return res.status(400).json({ error: "Valid positive amount is required" });
        }

        if (!paymentMethod || typeof paymentMethod !== 'string' || paymentMethod.trim().length === 0) {
          return res.status(400).json({ error: "Payment method is required" });
        }

        const requestedPaymentMethod = paymentMethod.trim();

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

        const offerOwner = await storage.getUser(offer.userId);
        if (!offerOwner) {
          return res.status(404).json({ error: "Offer owner not found" });
        }

        if (offerOwner.p2pBanned) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

        const ownerVerificationLevel = await getEffectiveP2PVerificationLevel(offerOwner);
        if (!hasRequiredP2PVerification(ownerVerificationLevel, MIN_P2P_VERIFICATION_LEVEL)) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

        const ownerTradingPermission = await checkUserP2PTradingPermission(offer.userId);
        if (!ownerTradingPermission.allowed) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

        if (offer.userId === req.user!.id) {
          return res.status(400).json({ error: "Cannot trade with your own offer" });
        }

        const offerPaymentMethods = (offer.paymentMethods || [])
          .map((method) => method.trim())
          .filter((method) => method.length > 0);

        if (offerPaymentMethods.length === 0) {
          return res.status(400).json({ error: "Offer has no available payment methods" });
        }

        const matchedPaymentMethod = offerPaymentMethods.find(
          (method) => method.toLowerCase() === requestedPaymentMethod.toLowerCase(),
        );

        if (!matchedPaymentMethod) {
          return res.status(400).json({ error: "Selected payment method is not supported by this offer" });
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

        const requesterLimitCheck = await checkUserP2PTradingPermission(req.user!.id, fiatAmount);
        if (!requesterLimitCheck.allowed) {
          return res.status(403).json({ error: requesterLimitCheck.reason });
        }

        const ownerLimitCheck = await checkUserP2PTradingPermission(offer.userId, fiatAmount);
        if (!ownerLimitCheck.allowed) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

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
            paymentMethod: matchedPaymentMethod,
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
            paymentMethod: matchedPaymentMethod,
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
          message: `Trade started via ${matchedPaymentMethod}. Payment window: ${offer.paymentTimeLimit} minutes.`,
          isSystemMessage: true,
        });

        if (offer.autoReply && offer.autoReply.trim().length > 0) {
          await storage.createP2PTradeMessage({
            tradeId: trade.id,
            senderId: offer.userId,
            message: offer.autoReply.trim(),
            isPrewritten: true,
            isSystemMessage: false,
          });
        }

        // Notify the offer owner that someone started a trade on their offer
        await notifyWithLog(offer.userId, {
          type: 'p2p',
          priority: 'high',
          title: `New Trade on Your Offer`,
          titleAr: `صفقة جديدة على عرضك`,
          message: `Someone initiated a $${tradeAmount} trade on your ${offer.type} offer via ${matchedPaymentMethod}.`,
          messageAr: `شخص بدأ صفقة بقيمة $${tradeAmount} على عرض ${offer.type === 'sell' ? 'البيع' : 'الشراء'} الخاص بك عبر ${matchedPaymentMethod}.`,
          link: `/p2p/trade/${trade.id}`,
          metadata: JSON.stringify({ tradeId: trade.id, offerId: offer.id, amount: tradeAmount }),
        }, "trade-create:offer-owner");

        // Emit admin alert for new P2P trade
        await emitSystemAlertWithLog({
          title: 'New P2P Trade',
          titleAr: 'صفقة P2P جديدة',
          message: `New P2P trade #${trade.id.slice(0, 8)} created - Amount: $${tradeAmount} via ${matchedPaymentMethod}`,
          messageAr: `صفقة P2P جديدة #${trade.id.slice(0, 8)} - المبلغ: $${tradeAmount}`,
          severity: 'info',
          deepLink: '/admin/p2p',
          entityType: 'p2p_trade',
          entityId: trade.id,
        }, "trade-create");

        res.status(201).json(trade);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );

  app.get("/api/p2p/trades/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const trade = await storage.getP2PTrade(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }

      if (trade.buyerId !== req.user!.id && trade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to view this trade" });
      }

      const [buyer, seller, usernamesByUserId] = await Promise.all([
        storage.getUser(trade.buyerId),
        storage.getUser(trade.sellerId),
        getP2PUsernameMap([trade.buyerId, trade.sellerId]),
      ]);

      const buyerP2PUsername = usernamesByUserId.get(trade.buyerId) || buyer?.username || "trader_user";
      const sellerP2PUsername = usernamesByUserId.get(trade.sellerId) || seller?.username || "trader_user";
      const isBuyer = trade.buyerId === req.user!.id;

      res.json({
        ...trade,
        totalPrice: trade.fiatAmount,
        isBuyer,
        isSeller: trade.sellerId === req.user!.id,
        counterpartyUsername: isBuyer ? sellerP2PUsername : buyerP2PUsername,
        buyer: buyer ? { id: buyer.id, username: buyerP2PUsername, nickname: buyer.nickname } : null,
        seller: seller ? { id: seller.id, username: sellerP2PUsername, nickname: seller.nickname } : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
