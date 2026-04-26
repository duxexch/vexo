/**
 * Player + admin endpoints for converting between a user's own currency
 * sub-wallets (Task #104).
 *
 *   GET  /api/wallet/convert/settings       — public-ish (auth) info: enabled,
 *                                             feePct, allowed wallets, balances
 *   GET  /api/wallet/convert/quote          — preview gross / fee / net
 *   POST /api/wallet/convert                — execute the conversion
 *   GET  /api/admin/wallet-conversion/settings   — admin read of global toggles
 *   PATCH /api/admin/wallet-conversion/settings  — admin write of global toggles
 *   PATCH /api/admin/users/:id/currency-conversion-disabled — per-user kill switch
 *
 * The global toggle and fee live in `app_settings` under
 *   - wallet_conversion.enabled  ("true" / "false", default "true")
 *   - wallet_conversion.fee_pct  (decimal string, default "0")
 * The per-user kill switch is `users.currencyConversionDisabled`.
 */

import type { Express, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { authMiddleware, sensitiveRateLimiter, type AuthRequest } from "../middleware";
import { adminAuthMiddleware, logAdminAction, type AdminRequest } from "../../admin-routes/helpers";
import { paymentIpGuard, paymentOperationTokenGuard } from "../../lib/payment-security";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { appSettings, users } from "@shared/schema";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";
import {
  getEffectiveAllowedCurrencies,
  getUserWalletSummary,
} from "../../lib/wallet-balances";
import { getDepositFxSnapshot } from "../../lib/deposit-fx";
import {
  WALLET_CONVERSION_ENABLED_KEY,
  WALLET_CONVERSION_FEE_PCT_KEY,
  executeWalletConversion,
  quoteWalletConversion,
} from "../../lib/currency-conversion";

const APP_SETTING_CATEGORY = "wallet";

interface WalletConversionGlobalSettings {
  enabled: boolean;
  feePct: number;
}

async function loadGlobalSettings(): Promise<WalletConversionGlobalSettings> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, [WALLET_CONVERSION_ENABLED_KEY, WALLET_CONVERSION_FEE_PCT_KEY]));

  const map = new Map<string, string | null>();
  for (const row of rows) map.set(row.key, row.value);

  // Default ENABLED=true so the feature ships on (admin opts out, not in).
  const enabledRaw = map.get(WALLET_CONVERSION_ENABLED_KEY);
  const enabled = enabledRaw === null || enabledRaw === undefined ? true : enabledRaw === "true";

  const feeRaw = map.get(WALLET_CONVERSION_FEE_PCT_KEY);
  const feeParsed = Number.parseFloat(feeRaw ?? "0");
  const feePct = Number.isFinite(feeParsed) && feeParsed >= 0 ? Math.min(feeParsed, 100) : 0;

  return { enabled, feePct };
}

async function upsertSetting(key: string, value: string, adminId: string | null): Promise<void> {
  const [existing] = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  if (existing) {
    await db
      .update(appSettings)
      .set({ value, category: APP_SETTING_CATEGORY, updatedBy: adminId, updatedAt: new Date() })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({
      key,
      value,
      category: APP_SETTING_CATEGORY,
      updatedBy: adminId,
    });
  }
}

export function registerWalletConversionRoutes(app: Express): void {
  // ---------- PLAYER ENDPOINTS ----------

  app.get("/api/wallet/convert/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [global, summary] = await Promise.all([
        loadGlobalSettings(),
        getUserWalletSummary(req.user!.id),
      ]);
      if (!summary) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = await storage.getUser(req.user!.id);
      const userDisabled = Boolean(user?.currencyConversionDisabled);
      const multiCurrencyEnabled = Boolean(summary.multiCurrencyEnabled);

      // Only currencies the user is allowed to hold AND that have an active
      // FX rate are eligible. We need the FX snapshot to compute previews.
      const fxSnapshot = await getDepositFxSnapshot(summary.allowedCurrencies);
      const eligibleCurrencies = summary.allowedCurrencies.filter((code) =>
        fxSnapshot.operationalCurrencies.includes(code),
      );

      const balances: Record<string, string> = {};
      for (const wallet of summary.wallets) {
        balances[wallet.currency] = wallet.balance;
      }

      res.json({
        enabled: global.enabled,
        feePct: global.feePct,
        userDisabled,
        multiCurrencyEnabled,
        primaryCurrency: summary.primaryCurrency,
        eligibleCurrencies,
        missingRateCurrencies: fxSnapshot.missingRateCurrencies,
        usdRateByCurrency: fxSnapshot.usdRateByCurrency,
        currencySymbolByCode: fxSnapshot.currencySymbolByCode,
        balances,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/wallet/convert/quote", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const fromCurrency = normalizeCurrencyCode(req.query.from);
      const toCurrency = normalizeCurrencyCode(req.query.to);
      const amount = Number.parseFloat((req.query.amount as string) ?? "");

      if (!fromCurrency || !toCurrency) {
        return res.status(400).json({ error: "from and to currency codes are required" });
      }
      if (fromCurrency === toCurrency) {
        return res.status(400).json({ error: "Source and target currencies must differ" });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }

      const [global, fxSnapshot] = await Promise.all([
        loadGlobalSettings(),
        getDepositFxSnapshot([fromCurrency, toCurrency]),
      ]);

      const quote = quoteWalletConversion(
        fromCurrency,
        toCurrency,
        amount,
        global.feePct,
        fxSnapshot.usdRateByCurrency,
      );
      if (!quote) {
        return res.status(400).json({
          error: `Conversion rate is unavailable for ${fromCurrency} → ${toCurrency}`,
        });
      }

      res.json(quote);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post(
    "/api/wallet/convert",
    authMiddleware,
    paymentIpGuard("convert"),
    paymentOperationTokenGuard("convert"),
    sensitiveRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const { fromCurrency, toCurrency, amount } = req.body ?? {};
        const from = normalizeCurrencyCode(fromCurrency);
        const to = normalizeCurrencyCode(toCurrency);
        const fromAmount = Number.parseFloat(typeof amount === "number" ? String(amount) : amount ?? "");

        if (!from || !to) {
          return res.status(400).json({ error: "fromCurrency and toCurrency are required" });
        }
        if (from === to) {
          return res.status(400).json({ error: "Source and target currencies must differ" });
        }
        if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
          return res.status(400).json({ error: "amount must be a positive number" });
        }

        const user = await storage.getUser(req.user!.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        if (user.currencyConversionDisabled) {
          return res.status(403).json({
            error: "Wallet conversion is disabled for your account",
            code: "CONVERSION_USER_DISABLED",
          });
        }
        if (!user.multiCurrencyEnabled) {
          return res.status(403).json({
            error: "Multi-currency wallets are not enabled for your account",
            code: "MULTI_CURRENCY_DISABLED",
          });
        }

        const allowed = new Set(getEffectiveAllowedCurrencies(user));
        if (!allowed.has(from) || !allowed.has(to)) {
          return res.status(400).json({
            error: `Both currencies must be on your allow-list (have: ${[...allowed].join(", ")})`,
            code: "WALLET_NOT_ALLOWED",
          });
        }

        const global = await loadGlobalSettings();
        if (!global.enabled) {
          return res.status(403).json({
            error: "Wallet conversion is currently disabled",
            code: "CONVERSION_GLOBALLY_DISABLED",
          });
        }

        const fxSnapshot = await getDepositFxSnapshot([from, to]);
        if (
          !fxSnapshot.operationalCurrencies.includes(from) ||
          !fxSnapshot.operationalCurrencies.includes(to)
        ) {
          return res.status(400).json({
            error: `Conversion rate is unavailable for ${from} → ${to}`,
            code: "RATE_UNAVAILABLE",
          });
        }

        const result = await executeWalletConversion({
          userId: req.user!.id,
          fromCurrency: from,
          toCurrency: to,
          fromAmount,
          feePct: global.feePct,
          usdRateByCurrency: fxSnapshot.usdRateByCurrency,
        });

        await sendNotification(req.user!.id, {
          type: "transaction",
          priority: "normal",
          title: "Wallet conversion completed",
          titleAr: "تم تحويل المحفظة",
          message: `Converted ${result.quote.fromAmount.toFixed(2)} ${result.quote.fromCurrency} → ${result.quote.netToAmount.toFixed(2)} ${result.quote.toCurrency}.`,
          messageAr: `تم تحويل ${result.quote.fromAmount.toFixed(2)} ${result.quote.fromCurrency} إلى ${result.quote.netToAmount.toFixed(2)} ${result.quote.toCurrency}.`,
          link: "/wallet",
          metadata: JSON.stringify({
            fromTransactionId: result.fromTransactionId,
            toTransactionId: result.toTransactionId,
            quote: result.quote,
          }),
        }).catch(() => {});

        res.json({
          message: "Conversion completed successfully",
          fromTransactionId: result.fromTransactionId,
          toTransactionId: result.toTransactionId,
          quote: result.quote,
          fromBalanceAfter: result.fromBalanceAfter.toFixed(2),
          toBalanceAfter: result.toBalanceAfter.toFixed(2),
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        // adjustUserCurrencyBalance throws "Insufficient X balance" — surface
        // that as a 400 instead of a generic 500 so the client can show it.
        if (/^Insufficient/.test(message)) {
          return res.status(400).json({ error: message, code: "INSUFFICIENT_BALANCE" });
        }
        res.status(500).json({ error: message });
      }
    },
  );

  // ---------- ADMIN ENDPOINTS ----------

  app.get("/api/admin/wallet-conversion/settings", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const settings = await loadGlobalSettings();
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/wallet-conversion/settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { enabled, feePct } = req.body ?? {};
      const adminId = req.admin?.id ?? null;

      if (enabled !== undefined) {
        if (typeof enabled !== "boolean") {
          return res.status(400).json({ error: "`enabled` must be a boolean" });
        }
        await upsertSetting(WALLET_CONVERSION_ENABLED_KEY, enabled ? "true" : "false", adminId);
      }
      if (feePct !== undefined) {
        const parsed = Number(feePct);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          return res.status(400).json({ error: "`feePct` must be a number between 0 and 100" });
        }
        await upsertSetting(WALLET_CONVERSION_FEE_PCT_KEY, parsed.toString(), adminId);
      }

      await logAdminAction(
        adminId ?? "",
        "wallet_conversion_settings_update",
        "app_settings",
        WALLET_CONVERSION_ENABLED_KEY,
        { metadata: JSON.stringify({ enabled, feePct }) },
        req,
      );

      const updated = await loadGlobalSettings();
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch(
    "/api/admin/users/:id/currency-conversion-disabled",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { disabled } = req.body ?? {};
        if (typeof disabled !== "boolean") {
          return res.status(400).json({ error: "`disabled` (boolean) is required" });
        }

        const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
        if (!target) {
          return res.status(404).json({ error: "User not found" });
        }

        await db.update(users)
          .set({ currencyConversionDisabled: disabled, updatedAt: new Date() })
          .where(eq(users.id, id));

        await logAdminAction(
          req.admin?.id ?? "",
          "user_currency_conversion_toggle",
          "user",
          id,
          { newValue: disabled ? "disabled" : "enabled" },
          req,
        );

        res.json({ id, currencyConversionDisabled: disabled });
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );
}
