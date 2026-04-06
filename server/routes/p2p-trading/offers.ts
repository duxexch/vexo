import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { countryPaymentMethods, p2pSettings, p2pTraderPaymentMethods, p2pTraderProfiles } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { sanitizePlainText } from "../../lib/input-security";
import { ensureP2PUsername, getP2PUsernameMap } from "../../lib/p2p-username";
import { isCurrencyAllowedForOfferType, normalizeCurrencyCode, resolveP2PCurrencyControls } from "../../lib/p2p-currency-controls";
import { and, eq, inArray } from "drizzle-orm";
import {
  getErrorMessage,
  getEffectiveP2PVerificationLevel,
  getP2PVerificationErrorMessage,
  getUserCurrentMonthP2PTradeVolume,
  hasRequiredP2PVerification,
  MIN_P2P_VERIFICATION_LEVEL,
} from "./helpers";

const ALLOWED_PAYMENT_TIME_LIMITS = new Set([15, 30, 45, 60]);

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
    createdAt: offer.createdAt,
  };
}

/** GET /api/p2p/offers, POST /api/p2p/offers, GET /api/p2p/my-offers, DELETE /api/p2p/offers/:id */
export function registerOfferRoutes(app: Express) {

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
      const monthlyUsed = await getUserCurrentMonthP2PTradeVolume(req.user!.id);
      const monthlyLimit = profile?.monthlyTradeLimit !== null && profile?.monthlyTradeLimit !== undefined
        ? Number(profile.monthlyTradeLimit)
        : null;
      const monthlyLimitAvailable = monthlyLimit === null || monthlyUsed < monthlyLimit;

      const checks = {
        notBanned: !user.p2pBanned,
        verificationPassed: hasRequiredP2PVerification(verificationLevel, MIN_P2P_VERIFICATION_LEVEL),
        tradingPermissionGranted: Boolean(profile?.canTradeP2P),
        adPermissionGranted: Boolean(profile?.canCreateOffers),
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
        reasons.push(getP2PVerificationErrorMessage(MIN_P2P_VERIFICATION_LEVEL));
      }
      if (!checks.tradingPermissionGranted) {
        reasons.push("Your account is not approved for P2P trading. Contact support or an administrator.");
      }
      if (!checks.adPermissionGranted) {
        reasons.push("Your account is not approved to publish P2P ads. Contact support or an administrator.");
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

      res.json({
        canCreateOffer: checks.notBanned
          && checks.verificationPassed
          && checks.tradingPermissionGranted
          && checks.adPermissionGranted
          && checks.monthlyLimitAvailable
          && checks.hasActivePaymentMethods
          && checks.p2pEnabled
          && currencyControls.allowedP2PCurrencies.length > 0,
        requiredVerificationLevel: MIN_P2P_VERIFICATION_LEVEL,
        currentVerificationLevel: verificationLevel,
        checks,
        reasons,
        monthlyTradeLimit: monthlyLimit,
        monthlyTradeUsed: monthlyUsed,
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
        const offerCurrency = normalizeCurrencyCode(offer.cryptoCurrency ?? offer.fiatCurrency);
        if (!offerCurrency) {
          return false;
        }

        if (!isCurrencyAllowedForOfferType(offer.type, offerCurrency, currencyControls)) {
          return false;
        }

        return (offer.paymentMethods || []).length > 0;
      });

      const usernamesByUserId = await getP2PUsernameMap(visibleOffers.map((offer) => offer.userId));
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
          offer as unknown as Record<string, unknown>,
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

  app.post("/api/p2p/offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const {
        type,
        amount,
        price,
        currency,
        minLimit,
        maxLimit,
        paymentMethods,
        paymentMethodIds,
        paymentTimeLimit,
        terms,
        autoReply,
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

      const verificationLevel = await getEffectiveP2PVerificationLevel(user);
      if (!hasRequiredP2PVerification(verificationLevel, MIN_P2P_VERIFICATION_LEVEL)) {
        return res.status(403).json({
          error: getP2PVerificationErrorMessage(MIN_P2P_VERIFICATION_LEVEL),
        });
      }

      const [profile] = await db
        .select({
          canCreateOffers: p2pTraderProfiles.canCreateOffers,
          canTradeP2P: p2pTraderProfiles.canTradeP2P,
          monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
        })
        .from(p2pTraderProfiles)
        .where(eq(p2pTraderProfiles.userId, req.user!.id))
        .limit(1);

      if (!profile?.canTradeP2P) {
        return res.status(403).json({
          error: "Your account is not approved for P2P trading. Contact support or an administrator.",
        });
      }

      if (!profile?.canCreateOffers) {
        return res.status(403).json({
          error: "Your account is not authorized to publish P2P offers. Contact support or an administrator.",
        });
      }

      const monthlyLimit = profile.monthlyTradeLimit !== null && profile.monthlyTradeLimit !== undefined
        ? Number(profile.monthlyTradeLimit)
        : null;

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
        const minTradeAmount = parseFloat(globalSettings.minTradeAmount);
        const maxTradeAmount = parseFloat(globalSettings.maxTradeAmount);
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

      const created = await storage.createP2POffer({
        userId: req.user!.id,
        type,
        status: 'active',
        cryptoCurrency: normalizedCurrency,
        fiatCurrency: normalizedCurrency,
        price: parsedPrice.toFixed(2),
        availableAmount: parsedAmount.toFixed(8),
        minLimit: parsedMinLimit.toFixed(2),
        maxLimit: parsedMaxLimit.toFixed(2),
        paymentMethods: selectedMethods.map((method) => method.name),
        paymentTimeLimit: parsedPaymentTimeLimit,
        terms: safeTerms || null,
        autoReply: safeAutoReply || null,
      });

      const ownerP2PUsername = await ensureP2PUsername(req.user!.id, user?.username);
      res.status(201).json(mapOfferForClient(created as unknown as Record<string, unknown>, ownerP2PUsername));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/my-offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myOffers = await storage.getUserP2POffers(req.user!.id);
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
      res.json(myOffers.map((offer) => mapOfferForClient(offer as unknown as Record<string, unknown>, username, userCountry)));
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
