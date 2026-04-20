import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { p2pOffers, p2pSettings, p2pTrades } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import {
  computeFreezeUntilDate,
  checkUserP2PTradingPermission,
  createP2PTradeAuditLog,
  evaluateP2PVerificationRequirements,
  getErrorMessage,
  getP2PEscrowFreezeHours,
  calculateP2PFee,
  getP2PVerificationRequirementsErrorMessage,
  resolveP2PVerificationRequirements,
} from "./helpers";
import { isCurrencyAllowedForOfferType, normalizeCurrencyCode, resolveP2PCurrencyControls } from "../../lib/p2p-currency-controls";
import { paymentIpGuard, paymentOperationTokenGuard } from "../../lib/payment-security";
import { getP2PUsernameMap } from "../../lib/p2p-username";
import { isEitherUserBlocked } from "../../lib/user-blocking";
import { and, eq, ne, or } from "drizzle-orm";

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

  app.get("/api/p2p/wallet-balances", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const freezeHours = await getP2PEscrowFreezeHours();
      const now = new Date();

      const tradeRows = await db
        .select({
          id: p2pTrades.id,
          buyerId: p2pTrades.buyerId,
          sellerId: p2pTrades.sellerId,
          amount: p2pTrades.amount,
          status: p2pTrades.status,
          completedAt: p2pTrades.completedAt,
          freezeUntil: p2pTrades.freezeUntil,
          freezeHoursApplied: p2pTrades.freezeHoursApplied,
          confirmedAt: p2pTrades.confirmedAt,
          offerCurrency: p2pOffers.cryptoCurrency,
        })
        .from(p2pTrades)
        .innerJoin(p2pOffers, eq(p2pTrades.offerId, p2pOffers.id))
        .where(and(
          or(eq(p2pTrades.buyerId, userId), eq(p2pTrades.sellerId, userId)),
          ne(p2pTrades.status, "cancelled"),
        ));

      type CurrencyBalanceState = {
        currency: string;
        available: number;
        frozen: number;
        pendingIncoming: number;
        reservedOutgoing: number;
        nextReleaseAt: Date | null;
      };

      const balances = new Map<string, CurrencyBalanceState>();

      const getState = (currencyCode: string): CurrencyBalanceState => {
        const normalized = normalizeCurrencyCode(currencyCode) || "USD";
        const existing = balances.get(normalized);
        if (existing) {
          return existing;
        }

        const created: CurrencyBalanceState = {
          currency: normalized,
          available: 0,
          frozen: 0,
          pendingIncoming: 0,
          reservedOutgoing: 0,
          nextReleaseAt: null,
        };
        balances.set(normalized, created);
        return created;
      };

      for (const trade of tradeRows) {
        const amount = Number(trade.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          continue;
        }

        const state = getState(String(trade.offerCurrency || "USD"));
        const isBuyer = trade.buyerId === userId;
        const isSeller = trade.sellerId === userId;

        if (isBuyer) {
          if (trade.status === "completed") {
            const freezeUntil = trade.freezeUntil
              ? new Date(trade.freezeUntil)
              : computeFreezeUntilDate(
                trade.completedAt ? new Date(trade.completedAt) : now,
                Number(trade.freezeHoursApplied || freezeHours),
              );

            if (freezeUntil > now) {
              state.frozen += amount;
              if (!state.nextReleaseAt || freezeUntil > state.nextReleaseAt) {
                state.nextReleaseAt = freezeUntil;
              }
            } else {
              state.available += amount;
            }
          } else if (trade.status === "confirmed") {
            state.pendingIncoming += amount;
          }
        }

        if (isSeller) {
          if (trade.status === "completed") {
            state.available -= amount;
          } else if (trade.status === "pending" || trade.status === "paid" || trade.status === "confirmed") {
            state.reservedOutgoing += amount;
          }
        }
      }

      const response = Array.from(balances.values())
        .map((state) => {
          const available = Math.max(0, state.available);
          const frozen = Math.max(0, state.frozen + state.pendingIncoming);
          const reservedOutgoing = Math.max(0, state.reservedOutgoing);

          return {
            currency: state.currency,
            available: available.toFixed(8),
            frozen: frozen.toFixed(8),
            reservedOutgoing: reservedOutgoing.toFixed(8),
            total: (available + frozen).toFixed(8),
            nextReleaseAt: state.nextReleaseAt ? state.nextReleaseAt.toISOString() : null,
            freezeHours,
          };
        })
        .filter((entry) => {
          return Number(entry.available) > 0 || Number(entry.frozen) > 0 || Number(entry.reservedOutgoing) > 0;
        })
        .sort((a, b) => a.currency.localeCompare(b.currency));

      res.json(response);
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

        const [settings] = await db.select().from(p2pSettings).limit(1);
        const currencyControls = resolveP2PCurrencyControls(settings);
        const verificationRequirements = resolveP2PVerificationRequirements(settings);

        if (settings) {
          if (!settings.isEnabled) {
            return res.status(403).json({ error: "P2P trading is currently disabled" });
          }
        }

        const requesterVerificationCheck = evaluateP2PVerificationRequirements(requestingUser, verificationRequirements);
        if (!requesterVerificationCheck.passed) {
          return res.status(403).json({
            error: getP2PVerificationRequirementsErrorMessage(verificationRequirements, requesterVerificationCheck.missingRequirements),
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
          if (offer.status === "pending_approval") {
            return res.status(400).json({ error: "Offer is pending admin approval" });
          }

          if (offer.status === "rejected") {
            return res.status(400).json({ error: "Offer has been rejected and is unavailable" });
          }

          return res.status(400).json({ error: "Offer is no longer active" });
        }

        if (offer.visibility === "private_friend") {
          if (!offer.targetUserId || offer.targetUserId !== req.user!.id) {
            return res.status(403).json({ error: "This private offer is not available to your account" });
          }
        }

        const offerCurrencyCode = String(offer.cryptoCurrency ?? offer.fiatCurrency ?? "").toUpperCase();
        if (!isCurrencyAllowedForOfferType(offer.type, offerCurrencyCode, currencyControls)) {
          return res.status(400).json({ error: "Offer currency is currently disabled by admin settings" });
        }

        const offerOwner = await storage.getUser(offer.userId);
        if (!offerOwner) {
          return res.status(404).json({ error: "Offer owner not found" });
        }

        if (offerOwner.p2pBanned) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

        const ownerVerificationCheck = evaluateP2PVerificationRequirements(offerOwner, verificationRequirements);
        if (!ownerVerificationCheck.passed) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

        const ownerTradingPermission = await checkUserP2PTradingPermission(offer.userId);
        if (!ownerTradingPermission.allowed) {
          return res.status(400).json({ error: "Offer is no longer available" });
        }

        if (offer.userId === req.user!.id) {
          return res.status(400).json({ error: "Cannot trade with your own offer" });
        }

        const isBlockedEitherWay = await isEitherUserBlocked(req.user!.id, offer.userId);
        if (isBlockedEitherWay) {
          return res.status(403).json({ error: "Cannot trade with this user due to blocking restrictions" });
        }

        const activeCatalogMethodNames = new Set(
          (await storage.listCountryPaymentMethods())
            .filter((method) => method.isActive && method.isAvailable)
            .map((method) => method.name.trim().toLowerCase())
            .filter((methodName) => methodName.length > 0),
        );

        const offerPaymentMethods = (offer.paymentMethods || [])
          .map((method) => method.trim())
          .filter((method) => method.length > 0)
          .filter((method) => activeCatalogMethodNames.has(method.toLowerCase()));

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

        await createP2PTradeAuditLog({
          tradeId: trade.id,
          userId: req.user!.id,
          action: "trade_created",
          description: `Trade created by user ${req.user!.id}`,
          descriptionAr: `تم إنشاء الصفقة بواسطة المستخدم ${req.user!.id}`,
          metadata: {
            offerId,
            amount,
            fiatAmount: fiatAmount.toFixed(2),
            paymentMethod: matchedPaymentMethod,
          },
          ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
          userAgent: req.headers["user-agent"] || "",
        });

        await createP2PTradeAuditLog({
          tradeId: trade.id,
          userId: trade.sellerId,
          action: "escrow_held",
          description: `Escrow hold activated for seller balance on trade ${trade.id}`,
          descriptionAr: `تم حجز الضمان من رصيد البائع في الصفقة ${trade.id}`,
          metadata: {
            escrowAmount: trade.escrowAmount,
            expiresAt: trade.expiresAt,
            offerCurrency: offer.cryptoCurrency,
          },
          ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
          userAgent: req.headers["user-agent"] || "",
        });

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

      const [buyer, seller, offer, usernamesByUserId] = await Promise.all([
        storage.getUser(trade.buyerId),
        storage.getUser(trade.sellerId),
        storage.getP2POffer(trade.offerId),
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
        offerCurrency: offer?.cryptoCurrency || null,
        offerFiatCurrency: offer?.fiatCurrency || null,
        offerTerms: offer?.terms || null,
        offerAutoReply: offer?.autoReply || null,
        offerPaymentTimeLimit: offer?.paymentTimeLimit || null,
        buyer: buyer ? { id: buyer.id, username: buyerP2PUsername, nickname: buyer.nickname } : null,
        seller: seller ? { id: seller.id, username: sellerP2PUsername, nickname: seller.nickname } : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
