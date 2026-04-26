import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { countryPaymentMethods, p2pOffers, p2pSettings, p2pTraderPaymentMethods, p2pTraderProfiles, p2pTrades, users } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { sanitizePlainText } from "../../lib/input-security";
import { ensureP2PUsername, getP2PUsernameMap } from "../../lib/p2p-username";
import { isCurrencyAllowedForOfferType, normalizeCurrencyCode, resolveP2PCurrencyControls } from "../../lib/p2p-currency-controls";
import { getEffectiveAllowedCurrencies, getWalletBalance } from "../../lib/wallet-balances";
import { and, eq, inArray } from "drizzle-orm";
import { getBadgeEntitlementForUser, resolveEffectiveP2PMonthlyLimit } from "../../lib/user-badge-entitlements";
import { isEitherUserBlocked, getBlockedUserIds } from "../../lib/user-blocking";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import {
  computeFreezeUntilDate,
  evaluateP2PVerificationRequirements,
  getErrorMessage,
  getEffectiveP2PVerificationLevel,
  getP2PEscrowFreezeHours,
  getP2PVerificationRequirementsErrorMessage,
  getUserCurrentMonthP2PTradeVolume,
  resolveP2PVerificationRequirements,
} from "./helpers";

const ALLOWED_PAYMENT_TIME_LIMITS = new Set([15, 30, 45, 60]);
const MAX_NEGOTIATION_FIELD_LENGTH = 2000;
const MAX_NEGOTIATED_TERMS_LENGTH = 4000;
const MAX_NEGOTIATED_ADMIN_FEE_RATE = 0.2;

interface OfferOwnedPaymentMethod {
  id: string;
  type: string;
  name: string;
  displayLabel: string | null;
  isVerified: boolean;
}

function normalizePaymentSelector(raw: string): string {
  return raw.trim().toLowerCase();
}

function mapOwnedPaymentMethodsForClient(methods: OfferOwnedPaymentMethod[]) {
  return methods.map((method) => ({
    id: method.id,
    type: method.type,
    name: method.name,
    displayLabel: method.displayLabel,
    isVerified: method.isVerified,
  }));
}

function mapOfferForClient(offer: Record<string, unknown>, username: string, country?: string | null) {
  const availableAmount = String(offer.availableAmount ?? offer.amount ?? '0');
  const visibility = String(offer.visibility || "public");
  const dealKind = String(offer.dealKind || "standard_asset");

  return {
    id: String(offer.id),
    userId: String(offer.userId),
    username,
    country: country ?? null,
    type: offer.type,
    amount: availableAmount,
    price: String(offer.price ?? '0'),
    currency: String(offer.cryptoCurrency ?? offer.currency ?? 'USD'),
    minLimit: String(offer.minLimit ?? '0'),
    maxLimit: String(offer.maxLimit ?? '0'),
    paymentMethods: (offer.paymentMethods as string[] | null) || [],
    paymentTimeLimit: Number(offer.paymentTimeLimit ?? 15),
    terms: offer.terms ? String(offer.terms) : null,
    autoReply: offer.autoReply ? String(offer.autoReply) : null,
    rating: 5,
    completedTrades: Number(offer.completedTrades || 0),
    status: offer.status,
    visibility,
    dealKind,
    digitalProductType: offer.digitalProductType ? String(offer.digitalProductType) : null,
    exchangeOffered: offer.exchangeOffered ? String(offer.exchangeOffered) : null,
    exchangeRequested: offer.exchangeRequested ? String(offer.exchangeRequested) : null,
    supportMediationRequested: Boolean(offer.supportMediationRequested),
    requestedAdminFeePercentage: offer.requestedAdminFeePercentage !== undefined && offer.requestedAdminFeePercentage !== null
      ? String(offer.requestedAdminFeePercentage)
      : null,
    targetUserId: offer.targetUserId ? String(offer.targetUserId) : null,
    targetUsername: offer.targetUsername ? String(offer.targetUsername) : null,
    moderationReason: offer.moderationReason ? String(offer.moderationReason) : null,
    counterResponse: offer.counterResponse ? String(offer.counterResponse) : null,
    submittedForReviewAt: offer.submittedForReviewAt ?? null,
    reviewedAt: offer.reviewedAt ?? null,
    approvedAt: offer.approvedAt ?? null,
    rejectedAt: offer.rejectedAt ?? null,
    createdAt: offer.createdAt,
  };
}

async function areUsersMutualFriends(userId: string, targetUserId: string): Promise<boolean> {
  const [following, followedBy] = await Promise.all([
    storage.getUserRelationship(userId, targetUserId, "follow"),
    storage.getUserRelationship(targetUserId, userId, "follow"),
  ]);

  return Boolean(following && followedBy && following.status === "active" && followedBy.status === "active");
}

function normalizeDealKind(rawValue: unknown): "standard_asset" | "digital_product" {
  return rawValue === "digital_product" ? "digital_product" : "standard_asset";
}

function parseNegotiatedAdminFeeRate(rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_NEGOTIATED_ADMIN_FEE_RATE) {
    return null;
  }

  return parsed.toFixed(4);
}

function resolveConfiguredTradeBound(rawValue: unknown, fallbackValue: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
}

async function getFrozenIncomingSellBalance(userId: string, currencyCode: string): Promise<number> {
  const normalizedCurrency = normalizeCurrencyCode(currencyCode);
  if (!normalizedCurrency) {
    return 0;
  }

  const freezeHours = await getP2PEscrowFreezeHours();
  const now = new Date();

  const completedIncomingTrades = await db
    .select({
      amount: p2pTrades.amount,
      completedAt: p2pTrades.completedAt,
      freezeUntil: p2pTrades.freezeUntil,
      freezeHoursApplied: p2pTrades.freezeHoursApplied,
    })
    .from(p2pTrades)
    .innerJoin(p2pOffers, eq(p2pTrades.offerId, p2pOffers.id))
    .where(and(
      eq(p2pTrades.buyerId, userId),
      eq(p2pTrades.status, "completed"),
      eq(p2pOffers.cryptoCurrency, normalizedCurrency),
    ));

  let frozenBalance = 0;
  for (const trade of completedIncomingTrades) {
    const freezeUntil = trade.freezeUntil
      ? new Date(trade.freezeUntil)
      : (trade.completedAt
        ? computeFreezeUntilDate(new Date(trade.completedAt), Number(trade.freezeHoursApplied || freezeHours))
        : null);

    if (!freezeUntil) {
      continue;
    }

    if (freezeUntil <= now) {
      continue;
    }

    const amount = Number(trade.amount || 0);
    if (Number.isFinite(amount) && amount > 0) {
      frozenBalance += amount;
    }
  }

  return frozenBalance;
}

/** GET /api/p2p/offers, POST /api/p2p/offers, GET /api/p2p/my-offers, DELETE /api/p2p/offers/:id */
export function registerOfferRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[P2P Offers] Notification failure (${context})`, {
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
      console.warn(`[P2P Offers] System alert emission failure (${context})`, {
        error: getErrorMessage(error),
      });
    });
  };

  const resolveNegotiationCounterpartyUserId = (
    offer: Awaited<ReturnType<typeof storage.getP2POffer>>,
    requesterId: string,
    rawCounterpartyUserId: unknown,
  ): { counterpartyUserId: string; error?: string } => {
    if (!offer) {
      return { counterpartyUserId: "", error: "Offer not found" };
    }

    if (requesterId === offer.userId) {
      const providedCounterpartyUserId = typeof rawCounterpartyUserId === "string"
        ? rawCounterpartyUserId.trim()
        : "";

      const fallbackCounterpartyUserId = typeof offer.targetUserId === "string"
        ? offer.targetUserId.trim()
        : "";

      const resolvedCounterpartyUserId = providedCounterpartyUserId || fallbackCounterpartyUserId;
      if (!resolvedCounterpartyUserId) {
        return {
          counterpartyUserId: "",
          error: "Counterparty user is required when listing or creating negotiation rounds as offer owner",
        };
      }

      if (resolvedCounterpartyUserId === requesterId) {
        return { counterpartyUserId: "", error: "Offer owner cannot negotiate with self" };
      }

      return { counterpartyUserId: resolvedCounterpartyUserId };
    }

    return { counterpartyUserId: requesterId };
  };

  app.get("/api/p2p/offer-eligibility", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const verificationLevel = await getEffectiveP2PVerificationLevel(user);

      const [profileRows, paymentMethods, p2pSettingsRows] = await Promise.all([
        db.select({
          canCreateOffers: p2pTraderProfiles.canCreateOffers,
          canTradeP2P: p2pTraderProfiles.canTradeP2P,
          monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
        })
          .from(p2pTraderProfiles)
          .where(eq(p2pTraderProfiles.userId, req.user!.id))
          .limit(1),
        db.select({
          id: p2pTraderPaymentMethods.id,
          type: p2pTraderPaymentMethods.type,
          name: p2pTraderPaymentMethods.name,
          displayLabel: p2pTraderPaymentMethods.displayLabel,
          isVerified: p2pTraderPaymentMethods.isVerified,
        })
          .from(p2pTraderPaymentMethods)
          .innerJoin(countryPaymentMethods, eq(p2pTraderPaymentMethods.countryPaymentMethodId, countryPaymentMethods.id))
          .where(and(
            eq(p2pTraderPaymentMethods.userId, req.user!.id),
            eq(p2pTraderPaymentMethods.isActive, true),
            eq(countryPaymentMethods.isActive, true),
            eq(countryPaymentMethods.isAvailable, true),
          )),
        db.select({
          isEnabled: p2pSettings.isEnabled,
          minTradeAmount: p2pSettings.minTradeAmount,
          maxTradeAmount: p2pSettings.maxTradeAmount,
          requireIdentityVerification: p2pSettings.requireIdentityVerification,
          requirePhoneVerification: p2pSettings.requirePhoneVerification,
          requireEmailVerification: p2pSettings.requireEmailVerification,
          p2pBuyCurrencies: p2pSettings.p2pBuyCurrencies,
          p2pSellCurrencies: p2pSettings.p2pSellCurrencies,
          depositEnabledCurrencies: p2pSettings.depositEnabledCurrencies,
        })
          .from(p2pSettings)
          .limit(1),
      ]);

      const profile = profileRows[0];
      const globalSettings = p2pSettingsRows[0];
      const currencyControls = resolveP2PCurrencyControls(globalSettings);
      const verificationRequirements = resolveP2PVerificationRequirements(globalSettings);
      const verificationCheck = evaluateP2PVerificationRequirements(user, verificationRequirements);
      const badgeEntitlements = await getBadgeEntitlementForUser(req.user!.id);
      const monthlyUsed = await getUserCurrentMonthP2PTradeVolume(req.user!.id);
      const baseMonthlyLimit = profile?.monthlyTradeLimit !== null && profile?.monthlyTradeLimit !== undefined
        ? Number(profile.monthlyTradeLimit)
        : null;
      const monthlyLimit = resolveEffectiveP2PMonthlyLimit(
        baseMonthlyLimit,
        badgeEntitlements.maxP2PMonthlyLimit,
        Boolean(profile),
      );
      const monthlyLimitAvailable = monthlyLimit === null || monthlyUsed < monthlyLimit;
      const checks = {
        notBanned: !user.p2pBanned,
        verificationPassed: verificationCheck.passed,
        tradingPermissionGranted: true,
        adPermissionGranted: true,
        monthlyLimitAvailable,
        hasActivePaymentMethods: paymentMethods.length > 0,
        p2pEnabled: globalSettings?.isEnabled ?? true,
      };

      const reasons: string[] = [];
      if (!checks.p2pEnabled) {
        reasons.push("P2P trading is currently disabled.");
      }
      if (!checks.notBanned) {
        reasons.push(user.p2pBanReason || "Your P2P access is currently restricted.");
      }
      if (!checks.verificationPassed) {
        reasons.push(getP2PVerificationRequirementsErrorMessage(verificationRequirements, verificationCheck.missingRequirements));
      }
      if (!checks.monthlyLimitAvailable) {
        reasons.push(`Monthly P2P trading limit reached. Limit: ${monthlyLimit?.toFixed(2)}, used: ${monthlyUsed.toFixed(2)}.`);
      }
      if (!checks.hasActivePaymentMethods) {
        reasons.push("Add at least one active payment method in your P2P settings before posting ads.");
      }

      if (currencyControls.allowedP2PCurrencies.length === 0) {
        reasons.push("No P2P currencies are currently enabled by admin settings.");
      }

      const configuredMinTradeAmount = resolveConfiguredTradeBound(globalSettings?.minTradeAmount, 10);
      const configuredMaxTradeAmount = Math.max(
        configuredMinTradeAmount,
        resolveConfiguredTradeBound(globalSettings?.maxTradeAmount, 100000),
      );

      const requiredVerificationLevel = verificationRequirements.requireIdentityVerification
        ? "kyc_basic"
        : verificationRequirements.requirePhoneVerification
          ? "phone"
          : verificationRequirements.requireEmailVerification
            ? "email"
            : "none";

      res.json({
        canCreateOffer: checks.notBanned
          && checks.verificationPassed
          && checks.tradingPermissionGranted
          && checks.adPermissionGranted
          && checks.monthlyLimitAvailable
          && checks.hasActivePaymentMethods
          && checks.p2pEnabled
          && currencyControls.allowedP2PCurrencies.length > 0,
        requiredVerificationLevel,
        currentVerificationLevel: verificationLevel,
        verificationRequirements,
        checks,
        reasons,
        monthlyTradeLimit: monthlyLimit,
        monthlyTradeUsed: monthlyUsed,
        minTradeAmount: configuredMinTradeAmount.toFixed(2),
        maxTradeAmount: configuredMaxTradeAmount.toFixed(2),
        paymentMethods: mapOwnedPaymentMethodsForClient(paymentMethods),
        allowedCurrencies: currencyControls.allowedP2PCurrencies,
        allowedBuyCurrencies: currencyControls.p2pBuyCurrencies,
        allowedSellCurrencies: currencyControls.p2pSellCurrencies,
        depositEnabledCurrencies: currencyControls.depositEnabledCurrencies,
        allowedPaymentTimeLimits: Array.from(ALLOWED_PAYMENT_TIME_LIMITS),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { type, currency, payment, country } = req.query;
      const requesterId = req.user!.id;

      const [settings] = await db.select({
        p2pBuyCurrencies: p2pSettings.p2pBuyCurrencies,
        p2pSellCurrencies: p2pSettings.p2pSellCurrencies,
        depositEnabledCurrencies: p2pSettings.depositEnabledCurrencies,
      }).from(p2pSettings).limit(1);
      const currencyControls = resolveP2PCurrencyControls(settings);

      const offers = await storage.getActiveP2POffers({
        type: type ? String(type) : undefined,
        currency: currency ? String(currency) : undefined,
        payment: payment ? String(payment) : undefined,
      });

      const requesterBlockedIds = new Set(await getBlockedUserIds(requesterId));
      const uniqueOwnerIds = Array.from(new Set(
        offers
          .map((offer) => String(offer.userId || "").trim())
          .filter((userId) => userId.length > 0),
      ));

      const ownerBlockRows = uniqueOwnerIds.length > 0
        ? await db.select({
          id: users.id,
          blockedUsers: users.blockedUsers,
        })
          .from(users)
          .where(inArray(users.id, uniqueOwnerIds))
        : [];

      const ownerBlocksRequester = new Set(
        ownerBlockRows
          .filter((row) => Array.isArray(row.blockedUsers) && row.blockedUsers.includes(requesterId))
          .map((row) => row.id),
      );

      const activeCatalogMethodNames = new Set(
        (await storage.listCountryPaymentMethods())
          .filter((method) => method.isActive && method.isAvailable)
          .map((method) => method.name.trim().toLowerCase())
          .filter((methodName) => methodName.length > 0),
      );

      const visibleOffers = offers.map((offer) => {
        const normalizedPaymentMethods = (offer.paymentMethods || [])
          .map((method) => method.trim())
          .filter((method) => method.length > 0)
          .filter((method) => activeCatalogMethodNames.has(method.toLowerCase()));

        return {
          ...offer,
          paymentMethods: normalizedPaymentMethods,
        };
      }).filter((offer) => {
        const ownerId = String(offer.userId || "").trim();
        if (!ownerId) {
          return false;
        }

        if (requesterBlockedIds.has(ownerId) || ownerBlocksRequester.has(ownerId)) {
          return false;
        }

        const offerVisibility = String(offer.visibility || "public");
        if (offerVisibility === "private_friend") {
          const targetUserId = String(offer.targetUserId || "").trim();
          const canViewPrivate = ownerId === requesterId || (targetUserId.length > 0 && targetUserId === requesterId);
          if (!canViewPrivate) {
            return false;
          }
        }

        const offerCurrency = normalizeCurrencyCode(offer.cryptoCurrency ?? offer.fiatCurrency);
        if (!offerCurrency) {
          return false;
        }

        if (!isCurrencyAllowedForOfferType(offer.type, offerCurrency, currencyControls)) {
          return false;
        }

        return (offer.paymentMethods || []).length > 0;
      });

      const usernamesByUserId = await getP2PUsernameMap(
        visibleOffers.flatMap((offer) => {
          const ids = [String(offer.userId || "")];
          if (offer.targetUserId) {
            ids.push(String(offer.targetUserId));
          }
          return ids.filter((id) => id.trim().length > 0);
        }),
      );
      const uniqueOfferUserIds = Array.from(new Set(
        visibleOffers
          .map((offer) => String(offer.userId || ""))
          .filter((userId) => userId.length > 0),
      ));

      const userCountryRows = uniqueOfferUserIds.length > 0
        ? await db.select({
          userId: p2pTraderPaymentMethods.userId,
          countryCode: p2pTraderPaymentMethods.countryCode,
          catalogCountryCode: countryPaymentMethods.countryCode,
        })
          .from(p2pTraderPaymentMethods)
          .leftJoin(countryPaymentMethods, eq(p2pTraderPaymentMethods.countryPaymentMethodId, countryPaymentMethods.id))
          .where(and(
            inArray(p2pTraderPaymentMethods.userId, uniqueOfferUserIds),
            eq(p2pTraderPaymentMethods.isActive, true),
          ))
        : [];

      const countryByUserId = new Map<string, string>();
      for (const row of userCountryRows) {
        const userId = String(row.userId || "").trim();
        if (!userId || countryByUserId.has(userId)) {
          continue;
        }

        const normalizedCountry = String(row.countryCode || row.catalogCountryCode || "").trim().toUpperCase();
        if (normalizedCountry) {
          countryByUserId.set(userId, normalizedCountry);
        }
      }

      const normalizedCountryFilter = typeof country === "string" ? country.trim().toLowerCase() : "";

      const mapped = visibleOffers
        .map((offer) => mapOfferForClient(
          {
            ...(offer as unknown as Record<string, unknown>),
            targetUsername: offer.targetUserId ? usernamesByUserId.get(String(offer.targetUserId)) || null : null,
          },
          usernamesByUserId.get(offer.userId) || "trader_user",
          countryByUserId.get(String(offer.userId)) || null,
        ))
        .filter((offer) => {
          if (!normalizedCountryFilter || normalizedCountryFilter === "all") {
            return true;
          }

          return String(offer.country || "").trim().toLowerCase() === normalizedCountryFilter;
        });

      res.json(mapped);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/digital-product-types", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const [offerRows, tradeRows] = await Promise.all([
        db
          .select({ digitalProductType: p2pOffers.digitalProductType })
          .from(p2pOffers)
          .where(eq(p2pOffers.dealKind, "digital_product")),
        db
          .select({ digitalProductType: p2pTrades.digitalProductType })
          .from(p2pTrades)
          .where(eq(p2pTrades.dealKind, "digital_product")),
      ]);

      const uniqueTypes = Array.from(new Set(
        [...offerRows, ...tradeRows]
          .map((row) => String(row.digitalProductType || "").trim())
          .filter((value) => value.length > 0),
      )).sort((a, b) => a.localeCompare(b));

      res.json(uniqueTypes);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const {
        type,
        amount,
        price,
        currency,
        fiatCurrency,
        minLimit,
        maxLimit,
        paymentMethods,
        paymentMethodIds,
        paymentTimeLimit,
        terms,
        autoReply,
        dealKind,
        digitalProductType,
        exchangeOffered,
        exchangeRequested,
        supportMediationRequested,
        requestedAdminFeePercentage,
        visibility,
        targetUserId,
      } = req.body;

      const user = await storage.getUser(req.user!.id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [globalSettings] = await db.select().from(p2pSettings).limit(1);
      if (globalSettings && !globalSettings.isEnabled) {
        return res.status(403).json({ error: "P2P trading is currently disabled" });
      }

      if (user.p2pBanned) {
        return res.status(403).json({
          error: user.p2pBanReason || "Your P2P access is currently restricted",
        });
      }

      const verificationRequirements = resolveP2PVerificationRequirements(globalSettings);
      const verificationCheck = evaluateP2PVerificationRequirements(user, verificationRequirements);
      if (!verificationCheck.passed) {
        return res.status(403).json({
          error: getP2PVerificationRequirementsErrorMessage(verificationRequirements, verificationCheck.missingRequirements),
        });
      }

      const [profile] = await db
        .select({
          monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
        })
        .from(p2pTraderProfiles)
        .where(eq(p2pTraderProfiles.userId, req.user!.id))
        .limit(1);

      const badgeEntitlements = await getBadgeEntitlementForUser(req.user!.id);
      const baseMonthlyLimit = profile?.monthlyTradeLimit !== null && profile?.monthlyTradeLimit !== undefined
        ? Number(profile.monthlyTradeLimit)
        : null;
      const monthlyLimit = resolveEffectiveP2PMonthlyLimit(
        baseMonthlyLimit,
        badgeEntitlements.maxP2PMonthlyLimit,
        Boolean(profile),
      );

      if (monthlyLimit !== null) {
        const monthlyUsed = await getUserCurrentMonthP2PTradeVolume(req.user!.id);
        if (monthlyUsed >= monthlyLimit) {
          return res.status(403).json({
            error: `Monthly P2P trading limit reached. Limit: ${monthlyLimit.toFixed(2)}, used: ${monthlyUsed.toFixed(2)}.`,
          });
        }
      }

      const ownedPaymentMethods = await db
        .select({
          id: p2pTraderPaymentMethods.id,
          type: p2pTraderPaymentMethods.type,
          name: p2pTraderPaymentMethods.name,
          displayLabel: p2pTraderPaymentMethods.displayLabel,
          isVerified: p2pTraderPaymentMethods.isVerified,
        })
        .from(p2pTraderPaymentMethods)
        .innerJoin(countryPaymentMethods, eq(p2pTraderPaymentMethods.countryPaymentMethodId, countryPaymentMethods.id))
        .where(and(
          eq(p2pTraderPaymentMethods.userId, req.user!.id),
          eq(p2pTraderPaymentMethods.isActive, true),
          eq(countryPaymentMethods.isActive, true),
          eq(countryPaymentMethods.isAvailable, true),
        ));

      if (ownedPaymentMethods.length === 0) {
        return res.status(400).json({
          error: "Add at least one active payment method before creating an offer",
        });
      }

      // Validate type
      if (!type || !['buy', 'sell'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'buy' or 'sell'" });
      }

      // Validate amounts
      const parsedAmount = parseFloat(amount);
      const parsedPrice = parseFloat(price);
      const parsedMinLimit = parseFloat(minLimit);
      const parsedMaxLimit = parseFloat(maxLimit);

      if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000) {
        return res.status(400).json({ error: "Amount must be a positive number up to 1,000,000" });
      }
      if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 100000) {
        return res.status(400).json({ error: "Price must be a positive number" });
      }
      if (isNaN(parsedMinLimit) || parsedMinLimit <= 0) {
        return res.status(400).json({ error: "Min limit must be a positive number" });
      }
      if (isNaN(parsedMaxLimit) || parsedMaxLimit <= 0 || parsedMaxLimit < parsedMinLimit) {
        return res.status(400).json({ error: "Max limit must be >= min limit" });
      }
      if (parsedMaxLimit > parsedAmount) {
        return res.status(400).json({ error: "Max limit cannot exceed total amount" });
      }

      if (globalSettings) {
        const minTradeAmount = resolveConfiguredTradeBound(globalSettings.minTradeAmount, 10);
        const maxTradeAmount = Math.max(minTradeAmount, resolveConfiguredTradeBound(globalSettings.maxTradeAmount, 100000));
        if (parsedMinLimit < minTradeAmount || parsedMaxLimit > maxTradeAmount) {
          return res.status(400).json({ error: `Trade limits must be between ${minTradeAmount} and ${maxTradeAmount}` });
        }
      }

      const currencyControls = resolveP2PCurrencyControls(globalSettings);
      const allowedCurrenciesForType = type === "buy"
        ? currencyControls.p2pBuyCurrencies
        : currencyControls.p2pSellCurrencies;

      if (allowedCurrenciesForType.length === 0) {
        return res.status(403).json({
          error: `P2P ${type} offers are currently disabled for all currencies by admin settings`,
        });
      }

      // Validate currency
      const normalizedCurrency = normalizeCurrencyCode(currency);
      if (!normalizedCurrency || !isCurrencyAllowedForOfferType(type, normalizedCurrency, currencyControls)) {
        return res.status(400).json({
          error: `Currency must be one of: ${allowedCurrenciesForType.join(', ')}`,
        });
      }

      const allowedQuoteCurrencies = currencyControls.allowedP2PCurrencies;
      const normalizedFiatCurrency = normalizeCurrencyCode(fiatCurrency || normalizedCurrency);
      if (!normalizedFiatCurrency || !allowedQuoteCurrencies.includes(normalizedFiatCurrency)) {
        return res.status(400).json({
          error: `Quote currency must be one of: ${allowedQuoteCurrencies.join(', ')}`,
        });
      }

      if (type === "sell") {
        // Sell offers may use ANY currency on the seller's allow-list. The
        // matching wallet (primary or sub) supplies escrow when a trade opens.
        const allowedForUser = getEffectiveAllowedCurrencies(user);
        if (!allowedForUser.includes(normalizedCurrency)) {
          return res.status(400).json({
            error: `Sell offers must use one of your wallet currencies: ${allowedForUser.join(", ")}`,
          });
        }

        // Read the actual matching wallet balance (primary → users.balance,
        // sub → user_currency_wallets row, 0 if no row yet).
        const rawWalletBalance = (await getWalletBalance(req.user!.id, normalizedCurrency)) ?? 0;
        const frozenIncoming = await getFrozenIncomingSellBalance(req.user!.id, normalizedCurrency);
        const availableToSell = Math.max(0, rawWalletBalance - frozenIncoming);

        if (parsedAmount > availableToSell) {
          return res.status(400).json({
            error: `Insufficient available balance for sell offer. Available: ${availableToSell.toFixed(8)} ${normalizedCurrency}`,
          });
        }
      }

      const requestedPaymentMethodIds = Array.isArray(paymentMethodIds)
        ? paymentMethodIds.filter((methodId: unknown): methodId is string => typeof methodId === "string" && methodId.trim().length > 0)
        : [];

      const legacyPaymentMethodSelectors = Array.isArray(paymentMethods)
        ? paymentMethods.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
        : (typeof paymentMethods === "string" && paymentMethods.trim().length > 0 ? [paymentMethods] : []);

      const methodsById = new Map(ownedPaymentMethods.map((method) => [method.id, method]));
      const methodsByName = new Map(ownedPaymentMethods.map((method) => [normalizePaymentSelector(method.name), method]));
      const methodsByType = new Map(ownedPaymentMethods.map((method) => [normalizePaymentSelector(method.type), method]));

      const selectedMethodsMap = new Map<string, OfferOwnedPaymentMethod>();

      if (requestedPaymentMethodIds.length > 0) {
        const invalidIds: string[] = [];
        for (const methodId of requestedPaymentMethodIds) {
          const method = methodsById.get(methodId);
          if (!method) {
            invalidIds.push(methodId);
            continue;
          }
          selectedMethodsMap.set(method.id, method);
        }

        if (invalidIds.length > 0) {
          return res.status(400).json({ error: "One or more selected payment methods are invalid or inactive" });
        }
      } else {
        for (const selector of legacyPaymentMethodSelectors) {
          const normalizedSelector = normalizePaymentSelector(selector);
          const method = methodsByName.get(normalizedSelector) || methodsByType.get(normalizedSelector);
          if (!method) {
            continue;
          }
          selectedMethodsMap.set(method.id, method);
        }
      }

      const selectedMethods = Array.from(selectedMethodsMap.values());
      if (selectedMethods.length === 0) {
        return res.status(400).json({ error: "Select at least one of your active payment methods" });
      }

      if (selectedMethods.length > 5) {
        return res.status(400).json({ error: "A maximum of 5 payment methods is allowed per offer" });
      }

      const parsedPaymentTimeLimit = Number(paymentTimeLimit ?? 15);
      if (!Number.isInteger(parsedPaymentTimeLimit) || !ALLOWED_PAYMENT_TIME_LIMITS.has(parsedPaymentTimeLimit)) {
        return res.status(400).json({ error: `Payment time limit must be one of: ${Array.from(ALLOWED_PAYMENT_TIME_LIMITS).join(', ')}` });
      }

      const safeTerms = typeof terms === "string"
        ? sanitizePlainText(terms, { maxLength: 1200 })
        : null;

      const safeAutoReply = typeof autoReply === "string"
        ? sanitizePlainText(autoReply, { maxLength: 500 })
        : null;

      if (!safeTerms || safeTerms.trim().length === 0) {
        return res.status(400).json({ error: "Offer terms are required" });
      }

      if (!safeAutoReply || safeAutoReply.trim().length === 0) {
        return res.status(400).json({ error: "Auto reply is required" });
      }

      const normalizedDealKind = normalizeDealKind(dealKind);
      const safeDigitalProductType = typeof digitalProductType === "string"
        ? sanitizePlainText(digitalProductType, { maxLength: 120 }).trim()
        : "";
      const safeExchangeOffered = typeof exchangeOffered === "string"
        ? sanitizePlainText(exchangeOffered, { maxLength: MAX_NEGOTIATION_FIELD_LENGTH }).trim()
        : "";
      const safeExchangeRequested = typeof exchangeRequested === "string"
        ? sanitizePlainText(exchangeRequested, { maxLength: MAX_NEGOTIATION_FIELD_LENGTH }).trim()
        : "";
      const normalizedSupportMediationRequested = supportMediationRequested === true;

      const normalizedRequestedAdminFeePercentage = parseNegotiatedAdminFeeRate(requestedAdminFeePercentage);
      if (requestedAdminFeePercentage !== undefined && requestedAdminFeePercentage !== null && requestedAdminFeePercentage !== "" && !normalizedRequestedAdminFeePercentage) {
        return res.status(400).json({ error: `Requested admin fee must be between 0 and ${MAX_NEGOTIATED_ADMIN_FEE_RATE}` });
      }

      if (normalizedDealKind === "digital_product") {
        if (!safeDigitalProductType) {
          return res.status(400).json({ error: "Digital product type is required" });
        }

        if (!safeExchangeOffered) {
          return res.status(400).json({ error: "Exchange offered description is required" });
        }

        if (!safeExchangeRequested) {
          return res.status(400).json({ error: "Exchange requested description is required" });
        }
      }

      const normalizedVisibility = typeof visibility === "string" ? visibility.trim() : "public";
      if (!["public", "private_friend"].includes(normalizedVisibility)) {
        return res.status(400).json({ error: "Visibility must be either 'public' or 'private_friend'" });
      }

      let normalizedTargetUserId: string | null = null;
      if (normalizedVisibility === "private_friend") {
        if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
          return res.status(400).json({ error: "Target friend is required for private offers" });
        }

        normalizedTargetUserId = targetUserId.trim();
        if (normalizedTargetUserId === req.user!.id) {
          return res.status(400).json({ error: "You cannot target yourself" });
        }

        const [targetUser, isMutualFriend, blockedEitherWay] = await Promise.all([
          storage.getUser(normalizedTargetUserId),
          areUsersMutualFriends(req.user!.id, normalizedTargetUserId),
          isEitherUserBlocked(req.user!.id, normalizedTargetUserId),
        ]);

        if (!targetUser) {
          return res.status(404).json({ error: "Target user not found" });
        }

        if (!isMutualFriend) {
          return res.status(403).json({ error: "Private offers can only target mutual friends" });
        }

        if (blockedEitherWay) {
          return res.status(403).json({ error: "Cannot target a blocked user" });
        }
      }

      const now = new Date();
      const isPublicOffer = normalizedVisibility === "public";
      const initialStatus = isPublicOffer ? "pending_approval" : "active";

      const created = await storage.createP2POffer({
        userId: req.user!.id,
        type,
        status: initialStatus,
        visibility: normalizedVisibility as "public" | "private_friend",
        dealKind: normalizedDealKind,
        digitalProductType: normalizedDealKind === "digital_product" ? safeDigitalProductType : null,
        exchangeOffered: normalizedDealKind === "digital_product" ? safeExchangeOffered : null,
        exchangeRequested: normalizedDealKind === "digital_product" ? safeExchangeRequested : null,
        supportMediationRequested: normalizedSupportMediationRequested,
        requestedAdminFeePercentage: normalizedRequestedAdminFeePercentage,
        targetUserId: normalizedTargetUserId,
        cryptoCurrency: normalizedCurrency,
        fiatCurrency: normalizedFiatCurrency,
        // Persist wallet routing for sell-side escrow & buy-side settlement.
        // Always set to the offer's crypto currency so trades inherit it.
        walletCurrency: normalizedCurrency,
        price: parsedPrice.toFixed(2),
        availableAmount: parsedAmount.toFixed(8),
        minLimit: parsedMinLimit.toFixed(2),
        maxLimit: parsedMaxLimit.toFixed(2),
        paymentMethods: selectedMethods.map((method) => method.name),
        paymentTimeLimit: parsedPaymentTimeLimit,
        terms: safeTerms || null,
        autoReply: safeAutoReply || null,
        submittedForReviewAt: isPublicOffer ? now : null,
        approvedAt: isPublicOffer ? null : now,
        reviewedAt: isPublicOffer ? null : now,
      });

      const ownerP2PUsername = await ensureP2PUsername(req.user!.id, user?.username);
      const targetUsername = normalizedTargetUserId
        ? (await getP2PUsernameMap([normalizedTargetUserId])).get(normalizedTargetUserId) || null
        : null;

      if (isPublicOffer) {
        await emitSystemAlertWithLog({
          title: "New P2P Offer Pending Approval",
          titleAr: "عرض P2P جديد بانتظار الموافقة",
          message: `Offer from ${ownerP2PUsername} is waiting for admin approval.`,
          messageAr: `عرض من ${ownerP2PUsername} بانتظار موافقة الإدارة.`,
          severity: "warning",
          deepLink: "/admin/p2p",
          entityType: "p2p_offer",
          entityId: String(created.id),
        }, "offer-pending-approval");
      } else if (normalizedTargetUserId) {
        await notifyWithLog(normalizedTargetUserId, {
          type: "p2p",
          priority: "normal",
          title: "Private P2P Offer Received",
          titleAr: "تم استلام عرض P2P خاص",
          message: `${ownerP2PUsername} shared a private P2P offer with you.`,
          messageAr: `قام ${ownerP2PUsername} بمشاركة عرض P2P خاص معك.`,
          link: "/p2p",
          metadata: JSON.stringify({ offerId: created.id, visibility: "private_friend" }),
        }, "private-offer-created");
      }

      res.status(201).json(mapOfferForClient({
        ...(created as unknown as Record<string, unknown>),
        targetUsername,
      }, ownerP2PUsername));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/my-offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myOffers = await storage.getUserP2POffers(req.user!.id);
      const targetUserIds = Array.from(new Set(
        myOffers
          .map((offer) => String(offer.targetUserId || "").trim())
          .filter((userId) => userId.length > 0),
      ));
      const targetUsernames = targetUserIds.length > 0
        ? await getP2PUsernameMap(targetUserIds)
        : new Map<string, string>();

      const username = await ensureP2PUsername(req.user!.id, req.user!.username);
      const [ownCountryMethod] = await db.select({
        countryCode: p2pTraderPaymentMethods.countryCode,
        catalogCountryCode: countryPaymentMethods.countryCode,
      })
        .from(p2pTraderPaymentMethods)
        .leftJoin(countryPaymentMethods, eq(p2pTraderPaymentMethods.countryPaymentMethodId, countryPaymentMethods.id))
        .where(and(
          eq(p2pTraderPaymentMethods.userId, req.user!.id),
          eq(p2pTraderPaymentMethods.isActive, true),
        ))
        .limit(1);

      const userCountry = String(ownCountryMethod?.countryCode || ownCountryMethod?.catalogCountryCode || "").trim().toUpperCase() || null;
      res.json(myOffers.map((offer) => mapOfferForClient({
        ...(offer as unknown as Record<string, unknown>),
        targetUsername: offer.targetUserId ? targetUsernames.get(String(offer.targetUserId)) || null : null,
      }, username, userCountry)));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/offers/:id/negotiations", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const offerId = String(req.params.id || "").trim();
      if (!offerId) {
        return res.status(400).json({ error: "Offer ID is required" });
      }

      const offer = await storage.getP2POffer(offerId);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (offer.dealKind !== "digital_product") {
        return res.status(400).json({ error: "Negotiation rounds are available only for digital-product offers" });
      }

      const requesterId = req.user!.id;
      const requesterIsOwner = requesterId === offer.userId;
      const rawCounterpartyUserId = typeof req.query.counterpartyUserId === "string"
        ? req.query.counterpartyUserId
        : "";

      if (requesterIsOwner && offer.visibility !== "private_friend" && !rawCounterpartyUserId.trim()) {
        const rows = await storage.listP2POfferNegotiationsForOffer(offerId, offer.userId);
        const userIds = Array.from(new Set(rows.flatMap((row) => [
          row.offerOwnerId,
          row.counterpartyUserId,
          row.proposerId,
          row.respondedBy || "",
        ]).filter((id) => id.length > 0)));
        const usernamesByUserId = await getP2PUsernameMap(userIds);

        return res.json(rows.map((row) => ({
          ...row,
          offerOwnerUsername: usernamesByUserId.get(row.offerOwnerId) || null,
          counterpartyUsername: usernamesByUserId.get(row.counterpartyUserId) || null,
          proposerUsername: usernamesByUserId.get(row.proposerId) || null,
          respondedByUsername: row.respondedBy ? usernamesByUserId.get(row.respondedBy) || null : null,
          isActionRequired: row.status === "pending" && row.proposerId !== requesterId,
        })));
      }

      const { counterpartyUserId, error } = resolveNegotiationCounterpartyUserId(
        offer,
        requesterId,
        rawCounterpartyUserId,
      );

      if (error) {
        return res.status(400).json({ error });
      }

      if (offer.visibility === "private_friend") {
        if (!offer.targetUserId || counterpartyUserId !== offer.targetUserId) {
          return res.status(403).json({ error: "Private offer negotiations are limited to the selected friend" });
        }

        if (!requesterIsOwner && requesterId !== offer.targetUserId) {
          return res.status(403).json({ error: "You are not authorized for this private negotiation" });
        }
      }

      if (!requesterIsOwner && requesterId !== counterpartyUserId) {
        return res.status(403).json({ error: "Not authorized to access this negotiation thread" });
      }

      const rows = await storage.listP2POfferNegotiations(offerId, offer.userId, counterpartyUserId);
      const userIds = Array.from(new Set(rows.flatMap((row) => [
        row.offerOwnerId,
        row.counterpartyUserId,
        row.proposerId,
        row.respondedBy || "",
      ]).filter((id) => id.length > 0)));
      const usernamesByUserId = await getP2PUsernameMap(userIds);

      res.json(rows.map((row) => ({
        ...row,
        offerOwnerUsername: usernamesByUserId.get(row.offerOwnerId) || null,
        counterpartyUsername: usernamesByUserId.get(row.counterpartyUserId) || null,
        proposerUsername: usernamesByUserId.get(row.proposerId) || null,
        respondedByUsername: row.respondedBy ? usernamesByUserId.get(row.respondedBy) || null : null,
        isActionRequired: row.status === "pending" && row.proposerId !== requesterId,
      })));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/offers/:id/negotiations/propose", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const offerId = String(req.params.id || "").trim();
      if (!offerId) {
        return res.status(400).json({ error: "Offer ID is required" });
      }

      const offer = await storage.getP2POffer(offerId);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (offer.dealKind !== "digital_product") {
        return res.status(400).json({ error: "Negotiation rounds are available only for digital-product offers" });
      }

      if (offer.status !== "active") {
        return res.status(400).json({ error: "Negotiations are available only for active offers" });
      }

      const requesterId = req.user!.id;
      const requesterIsOwner = requesterId === offer.userId;
      const { counterpartyUserId, error } = resolveNegotiationCounterpartyUserId(
        offer,
        requesterId,
        req.body?.counterpartyUserId,
      );

      if (error) {
        return res.status(400).json({ error });
      }

      if (offer.visibility === "private_friend") {
        if (!offer.targetUserId || counterpartyUserId !== offer.targetUserId) {
          return res.status(403).json({ error: "Private offer negotiations are limited to the selected friend" });
        }

        if (!requesterIsOwner && requesterId !== offer.targetUserId) {
          return res.status(403).json({ error: "You are not authorized for this private negotiation" });
        }
      }

      const [counterpartyUser, blockedEitherWay] = await Promise.all([
        storage.getUser(counterpartyUserId),
        isEitherUserBlocked(offer.userId, counterpartyUserId),
      ]);

      if (!counterpartyUser) {
        return res.status(404).json({ error: "Counterparty user not found" });
      }

      if (blockedEitherWay) {
        return res.status(403).json({ error: "Negotiation is blocked between these users" });
      }

      const pendingNegotiation = await storage.getPendingP2POfferNegotiation(offer.id, offer.userId, counterpartyUserId);
      if (pendingNegotiation) {
        return res.status(409).json({ error: "A pending negotiation round already exists for this offer" });
      }

      const rawPreviousNegotiationId = typeof req.body?.previousNegotiationId === "string"
        ? req.body.previousNegotiationId.trim()
        : "";
      let normalizedPreviousNegotiationId: string | null = null;
      if (rawPreviousNegotiationId) {
        const previousRow = await storage.getP2POfferNegotiation(rawPreviousNegotiationId);
        if (!previousRow
          || previousRow.offerId !== offer.id
          || previousRow.offerOwnerId !== offer.userId
          || previousRow.counterpartyUserId !== counterpartyUserId
        ) {
          return res.status(400).json({ error: "Previous negotiation round is invalid" });
        }

        normalizedPreviousNegotiationId = previousRow.id;
      }

      const safeExchangeOffered = sanitizePlainText(
        typeof req.body?.exchangeOffered === "string" && req.body.exchangeOffered.trim().length > 0
          ? req.body.exchangeOffered
          : (offer.exchangeOffered || ""),
        { maxLength: MAX_NEGOTIATION_FIELD_LENGTH },
      ).trim();
      const safeExchangeRequested = sanitizePlainText(
        typeof req.body?.exchangeRequested === "string" && req.body.exchangeRequested.trim().length > 0
          ? req.body.exchangeRequested
          : (offer.exchangeRequested || ""),
        { maxLength: MAX_NEGOTIATION_FIELD_LENGTH },
      ).trim();
      const safeProposedTerms = sanitizePlainText(
        typeof req.body?.proposedTerms === "string" && req.body.proposedTerms.trim().length > 0
          ? req.body.proposedTerms
          : (offer.terms || ""),
        { maxLength: MAX_NEGOTIATED_TERMS_LENGTH },
      ).trim();

      if (!safeExchangeOffered || !safeExchangeRequested || !safeProposedTerms) {
        return res.status(400).json({ error: "Exchange details and terms are required" });
      }

      const negotiatedAdminFeePercentage = parseNegotiatedAdminFeeRate(
        req.body?.adminFeePercentage ?? offer.requestedAdminFeePercentage,
      );

      if (
        req.body?.adminFeePercentage !== undefined
        && req.body?.adminFeePercentage !== null
        && req.body?.adminFeePercentage !== ""
        && !negotiatedAdminFeePercentage
      ) {
        return res.status(400).json({ error: `Admin fee must be between 0 and ${MAX_NEGOTIATED_ADMIN_FEE_RATE}` });
      }

      const negotiation = await storage.createP2POfferNegotiation({
        offerId: offer.id,
        offerOwnerId: offer.userId,
        counterpartyUserId,
        proposerId: requesterId,
        previousNegotiationId: normalizedPreviousNegotiationId,
        status: "pending",
        exchangeOffered: safeExchangeOffered,
        exchangeRequested: safeExchangeRequested,
        proposedTerms: safeProposedTerms,
        supportMediationRequested: req.body?.supportMediationRequested === true || offer.supportMediationRequested === true,
        adminFeePercentage: negotiatedAdminFeePercentage,
        rejectionReason: null,
        respondedBy: null,
        respondedAt: null,
      });

      const recipientId = requesterId === offer.userId ? counterpartyUserId : offer.userId;
      const proposer = await storage.getUser(requesterId);
      const proposerUsername = await ensureP2PUsername(requesterId, proposer?.username || req.user!.username);
      await notifyWithLog(recipientId, {
        type: "p2p",
        priority: "high",
        title: "New Deal Terms Proposal",
        titleAr: "اقتراح شروط صفقة جديد",
        message: `${proposerUsername} proposed new deal terms for your digital-product trade.`,
        messageAr: `قدّم ${proposerUsername} اقتراح شروط جديد لصفقة المنتج الرقمي.`,
        link: "/p2p",
        metadata: JSON.stringify({ offerId: offer.id, negotiationId: negotiation.id }),
      }, "digital-negotiation-proposed");

      if (negotiation.supportMediationRequested) {
        await emitSystemAlertWithLog({
          title: "P2P Mediation Requested",
          titleAr: "طلب وساطة P2P",
          message: `Deal negotiation on offer ${offer.id.slice(0, 8)} requested support mediation before trade opening.`,
          messageAr: `طلب التفاوض على العرض ${offer.id.slice(0, 8)} تدخل الدعم قبل فتح الصفقة.`,
          severity: "warning",
          deepLink: "/admin/p2p",
          entityType: "p2p_offer",
          entityId: offer.id,
        }, "digital-negotiation-mediation-request");
      }

      const usernamesByUserId = await getP2PUsernameMap([
        negotiation.offerOwnerId,
        negotiation.counterpartyUserId,
        negotiation.proposerId,
      ]);
      res.status(201).json({
        ...negotiation,
        offerOwnerUsername: usernamesByUserId.get(negotiation.offerOwnerId) || null,
        counterpartyUsername: usernamesByUserId.get(negotiation.counterpartyUserId) || null,
        proposerUsername: usernamesByUserId.get(negotiation.proposerId) || null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/offers/:id/negotiations/:negotiationId/accept", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const offerId = String(req.params.id || "").trim();
      const negotiationId = String(req.params.negotiationId || "").trim();
      if (!offerId || !negotiationId) {
        return res.status(400).json({ error: "Offer ID and negotiation ID are required" });
      }

      const [offer, negotiation] = await Promise.all([
        storage.getP2POffer(offerId),
        storage.getP2POfferNegotiation(negotiationId),
      ]);

      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (!negotiation || negotiation.offerId !== offer.id) {
        return res.status(404).json({ error: "Negotiation round not found" });
      }

      if (negotiation.status !== "pending") {
        return res.status(400).json({ error: "Only pending negotiation rounds can be accepted" });
      }

      const requesterId = req.user!.id;
      const participants = new Set([negotiation.offerOwnerId, negotiation.counterpartyUserId]);
      if (!participants.has(requesterId)) {
        return res.status(403).json({ error: "Not authorized for this negotiation round" });
      }

      if (negotiation.proposerId === requesterId) {
        return res.status(403).json({ error: "Proposer cannot accept own negotiation round" });
      }

      const updated = await storage.updateP2POfferNegotiation(negotiation.id, {
        status: "accepted",
        respondedBy: requesterId,
        respondedAt: new Date(),
        rejectionReason: null,
      });

      if (!updated) {
        return res.status(404).json({ error: "Negotiation round not found" });
      }

      const responder = await storage.getUser(requesterId);
      const responderUsername = await ensureP2PUsername(requesterId, responder?.username || req.user!.username);
      await notifyWithLog(negotiation.proposerId, {
        type: "success",
        priority: "high",
        title: "Deal Terms Accepted",
        titleAr: "تم قبول شروط الصفقة",
        message: `${responderUsername} accepted your proposed deal terms. You can now open the secured trade.`,
        messageAr: `وافق ${responderUsername} على الشروط المقترحة. يمكنك الآن فتح الصفقة المؤمنة.`,
        link: "/p2p",
        metadata: JSON.stringify({ offerId: offer.id, negotiationId: updated.id }),
      }, "digital-negotiation-accepted");

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/offers/:id/negotiations/:negotiationId/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const offerId = String(req.params.id || "").trim();
      const negotiationId = String(req.params.negotiationId || "").trim();
      if (!offerId || !negotiationId) {
        return res.status(400).json({ error: "Offer ID and negotiation ID are required" });
      }

      const [offer, negotiation] = await Promise.all([
        storage.getP2POffer(offerId),
        storage.getP2POfferNegotiation(negotiationId),
      ]);

      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (!negotiation || negotiation.offerId !== offer.id) {
        return res.status(404).json({ error: "Negotiation round not found" });
      }

      if (negotiation.status !== "pending") {
        return res.status(400).json({ error: "Only pending negotiation rounds can be rejected" });
      }

      const requesterId = req.user!.id;
      const participants = new Set([negotiation.offerOwnerId, negotiation.counterpartyUserId]);
      if (!participants.has(requesterId)) {
        return res.status(403).json({ error: "Not authorized for this negotiation round" });
      }

      if (negotiation.proposerId === requesterId) {
        return res.status(403).json({ error: "Proposer cannot reject own negotiation round" });
      }

      const safeRejectionReason = sanitizePlainText(
        typeof req.body?.reason === "string" ? req.body.reason : "",
        { maxLength: 500 },
      ).trim();

      if (!safeRejectionReason) {
        return res.status(400).json({ error: "Rejection reason is required" });
      }

      const updated = await storage.updateP2POfferNegotiation(negotiation.id, {
        status: "rejected",
        rejectionReason: safeRejectionReason,
        respondedBy: requesterId,
        respondedAt: new Date(),
      });

      if (!updated) {
        return res.status(404).json({ error: "Negotiation round not found" });
      }

      const responder = await storage.getUser(requesterId);
      const responderUsername = await ensureP2PUsername(requesterId, responder?.username || req.user!.username);
      await notifyWithLog(negotiation.proposerId, {
        type: "warning",
        priority: "high",
        title: "Deal Terms Rejected",
        titleAr: "تم رفض شروط الصفقة",
        message: `${responderUsername} rejected your proposed terms. Reason: ${safeRejectionReason}`,
        messageAr: `رفض ${responderUsername} الشروط المقترحة. السبب: ${safeRejectionReason}`,
        link: "/p2p",
        metadata: JSON.stringify({ offerId: offer.id, negotiationId: updated.id, rejectionReason: safeRejectionReason }),
      }, "digital-negotiation-rejected");

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/offers/:id/resubmit", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const offerId = String(req.params.id || "").trim();
      if (!offerId) {
        return res.status(400).json({ error: "Offer ID is required" });
      }

      const rawCounterResponse = typeof req.body?.counterResponse === "string"
        ? req.body.counterResponse
        : "";
      const safeCounterResponse = sanitizePlainText(rawCounterResponse, { maxLength: 1200 }).trim();
      if (!safeCounterResponse) {
        return res.status(400).json({ error: "Counter response is required" });
      }

      const existingOffer = await storage.getP2POffer(offerId);
      if (!existingOffer || existingOffer.userId !== req.user!.id) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (existingOffer.visibility !== "public") {
        return res.status(400).json({ error: "Only public offers can be resubmitted for review" });
      }

      if (existingOffer.status !== "rejected") {
        return res.status(400).json({ error: "Only rejected offers can be resubmitted" });
      }

      const now = new Date();
      const [updated] = await db.update(p2pOffers)
        .set({
          status: "pending_approval",
          counterResponse: safeCounterResponse,
          submittedForReviewAt: now,
          reviewedBy: null,
          reviewedAt: null,
          approvedAt: null,
          rejectedAt: null,
          updatedAt: now,
        })
        .where(and(
          eq(p2pOffers.id, offerId),
          eq(p2pOffers.userId, req.user!.id),
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Offer not found" });
      }

      const owner = await storage.getUser(req.user!.id);
      const ownerP2PUsername = await ensureP2PUsername(req.user!.id, owner?.username);

      await emitSystemAlertWithLog({
        title: "P2P Offer Resubmitted",
        titleAr: "تمت إعادة تقديم عرض P2P",
        message: `${ownerP2PUsername} resubmitted a rejected offer for review.`,
        messageAr: `قام ${ownerP2PUsername} بإعادة تقديم عرض مرفوض للمراجعة.`,
        severity: "warning",
        deepLink: "/admin/p2p",
        entityType: "p2p_offer",
        entityId: offerId,
      }, "offer-resubmitted");

      res.json(mapOfferForClient(updated as unknown as Record<string, unknown>, ownerP2PUsername));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/p2p/offers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const cancelled = await storage.cancelP2POfferByOwner(req.params.id, req.user!.id);
      if (!cancelled) {
        return res.status(404).json({ error: "Offer not found" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
