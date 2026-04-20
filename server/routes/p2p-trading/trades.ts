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

const MAX_NEGOTIATED_ADMIN_FEE_RATE = 0.2;

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
        const { offerId, amount, paymentMethod, currencyType = 'usd', negotiationId } = req.body;
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

        let tradeCounterpartyUserId = req.user!.id;
        let negotiatedDealContext: {
          id: string;
          exchangeOffered: string | null;
          exchangeRequested: string | null;
          proposedTerms: string;
          supportMediationRequested: boolean;
          adminFeePercentage: string | null;
        } | null = null;
        let autoAcceptedNegotiationProposerId: string | null = null;
        const normalizedNegotiationId = typeof negotiationId === "string" ? negotiationId.trim() : "";

        if (offer.dealKind === "digital_product") {
          if (!normalizedNegotiationId) {
            return res.status(400).json({ error: "Accepted negotiation ID is required for digital product deals" });
          }

          const negotiation = await storage.getP2POfferNegotiation(normalizedNegotiationId);
          if (!negotiation || negotiation.offerId !== offer.id) {
            return res.status(404).json({ error: "Negotiation round not found" });
          }

          if (negotiation.offerOwnerId !== offer.userId) {
            return res.status(400).json({ error: "Negotiation round does not match offer owner" });
          }

          if (!negotiation.counterpartyUserId || negotiation.counterpartyUserId === offer.userId) {
            return res.status(400).json({ error: "Negotiation round has invalid counterparty" });
          }

          const requesterIsParticipant = req.user!.id === offer.userId || req.user!.id === negotiation.counterpartyUserId;
          if (!requesterIsParticipant) {
            return res.status(403).json({ error: "Only negotiation participants can open this secured trade" });
          }

          let activeNegotiation = negotiation;
          if (activeNegotiation.status === "pending") {
            if (activeNegotiation.proposerId === req.user!.id) {
              return res.status(403).json({ error: "Proposer cannot open secured trade from own pending negotiation" });
            }

            const acceptedNegotiation = await storage.updateP2POfferNegotiation(activeNegotiation.id, {
              status: "accepted",
              respondedBy: req.user!.id,
              respondedAt: new Date(),
              rejectionReason: null,
            });

            if (!acceptedNegotiation) {
              return res.status(409).json({ error: "Negotiation state changed, please retry" });
            }

            autoAcceptedNegotiationProposerId = activeNegotiation.proposerId;
            activeNegotiation = acceptedNegotiation;
          }

          if (activeNegotiation.status !== "accepted") {
            return res.status(400).json({ error: "Only accepted negotiation rounds can open a secured trade" });
          }

          tradeCounterpartyUserId = activeNegotiation.counterpartyUserId;
          negotiatedDealContext = {
            id: activeNegotiation.id,
            exchangeOffered: activeNegotiation.exchangeOffered,
            exchangeRequested: activeNegotiation.exchangeRequested,
            proposedTerms: activeNegotiation.proposedTerms,
            supportMediationRequested: activeNegotiation.supportMediationRequested,
            adminFeePercentage: activeNegotiation.adminFeePercentage,
          };

          if (autoAcceptedNegotiationProposerId) {
            const usernamesByUserId = await getP2PUsernameMap([req.user!.id]);
            const responderUsername = usernamesByUserId.get(req.user!.id) || req.user!.username;

            await notifyWithLog(autoAcceptedNegotiationProposerId, {
              type: "success",
              priority: "high",
              title: "Deal Terms Accepted",
              titleAr: "تم قبول شروط الصفقة",
              message: `${responderUsername} accepted your proposed terms and opened the secured trade.`,
              messageAr: `وافق ${responderUsername} على الشروط المقترحة وفتح الصفقة المؤمنة.`,
              link: "/p2p",
              metadata: JSON.stringify({ offerId: offer.id, negotiationId: negotiatedDealContext.id }),
            }, "trade-create:auto-accept-negotiation");
          }
        }

        if (offer.visibility === "private_friend") {
          if (!offer.targetUserId || offer.targetUserId !== tradeCounterpartyUserId) {
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

        if (tradeCounterpartyUserId !== req.user!.id) {
          const counterpartyUser = await storage.getUser(tradeCounterpartyUserId);
          if (!counterpartyUser || counterpartyUser.p2pBanned) {
            return res.status(400).json({ error: "Offer is no longer available" });
          }

          const counterpartyVerificationCheck = evaluateP2PVerificationRequirements(counterpartyUser, verificationRequirements);
          if (!counterpartyVerificationCheck.passed) {
            return res.status(400).json({ error: "Offer is no longer available" });
          }
        }

        if (tradeCounterpartyUserId === offer.userId) {
          return res.status(400).json({ error: "Cannot trade with your own offer" });
        }

        const isBlockedEitherWay = await isEitherUserBlocked(tradeCounterpartyUserId, offer.userId);
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
        let platformFee = await calculateP2PFee(tradeAmount);

        if (negotiatedDealContext?.adminFeePercentage) {
          const negotiatedFeeRate = Number(negotiatedDealContext.adminFeePercentage);
          if (
            Number.isFinite(negotiatedFeeRate)
            && negotiatedFeeRate >= 0
            && negotiatedFeeRate <= MAX_NEGOTIATED_ADMIN_FEE_RATE
          ) {
            platformFee = Math.min(tradeAmount * negotiatedFeeRate, tradeAmount);
          }
        }

        const participantIds = Array.from(new Set([offer.userId, tradeCounterpartyUserId]));
        for (const participantId of participantIds) {
          const limitCheck = await checkUserP2PTradingPermission(participantId, fiatAmount);
          if (!limitCheck.allowed) {
            if (participantId === req.user!.id) {
              return res.status(403).json({ error: limitCheck.reason });
            }

            return res.status(400).json({ error: "Offer is no longer available" });
          }
        }

        const isBuyer = offer.type === "sell";
        const buyerId = isBuyer ? tradeCounterpartyUserId : offer.userId;
        const sellerId = isBuyer ? offer.userId : tradeCounterpartyUserId;

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
            dealKind: offer.dealKind,
            digitalProductType: offer.digitalProductType ?? null,
            exchangeOffered: negotiatedDealContext?.exchangeOffered ?? offer.exchangeOffered ?? null,
            exchangeRequested: negotiatedDealContext?.exchangeRequested ?? offer.exchangeRequested ?? null,
            negotiatedTerms: negotiatedDealContext?.proposedTerms ?? offer.terms,
            supportMediationRequested:
              negotiatedDealContext?.supportMediationRequested ?? offer.supportMediationRequested ?? false,
            negotiatedAdminFeePercentage: negotiatedDealContext?.adminFeePercentage ?? null,
            negotiationId: negotiatedDealContext?.id ?? null,
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
            dealKind: offer.dealKind,
            digitalProductType: offer.digitalProductType ?? null,
            exchangeOffered: negotiatedDealContext?.exchangeOffered ?? offer.exchangeOffered ?? null,
            exchangeRequested: negotiatedDealContext?.exchangeRequested ?? offer.exchangeRequested ?? null,
            negotiatedTerms: negotiatedDealContext?.proposedTerms ?? offer.terms,
            supportMediationRequested:
              negotiatedDealContext?.supportMediationRequested ?? offer.supportMediationRequested ?? false,
            negotiatedAdminFeePercentage: negotiatedDealContext?.adminFeePercentage ?? null,
            negotiationId: negotiatedDealContext?.id ?? null,
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
