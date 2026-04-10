import type { Express, Request, Response } from "express";
import { AuthRequest, authMiddleware, sensitiveRateLimiter } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { gameplaySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { paymentIpGuard, paymentOperationTokenGuard } from "../../lib/payment-security";
import { convertDepositAmountToUsd, convertUsdAmountToCurrency, getDepositFxSnapshot } from "../../lib/deposit-fx";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";

export function registerProjectCurrencyRoutes(app: Express): void {

  const ensureProjectCurrencySettings = async () => {
    let settings = await storage.getProjectCurrencySettings();
    if (!settings) {
      settings = await storage.updateProjectCurrencySettings({
        currencyName: "VEX Coin",
        currencySymbol: "VXC",
        exchangeRate: "100",
        isActive: true,
        useInGames: true,
        useInP2P: true,
        approvalMode: "automatic",
      });
    }
    return settings;
  };

  app.get("/api/project-currency/play-gift-policy", async (_req: Request, res: Response) => {
    try {
      const [setting] = await db.select({ value: gameplaySettings.value })
        .from(gameplaySettings)
        .where(eq(gameplaySettings.key, "play_gift_currency_mode"))
        .limit(1);

      const mode = setting?.value === "mixed" ? "mixed" : "project_only";
      res.json({
        mode,
        projectOnly: mode === "project_only",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/project-currency/settings", async (req: Request, res: Response) => {
    try {
      const settings = await ensureProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return res.status(404).json({ error: "Project currency is not enabled" });
      }
      res.json({
        currencyName: settings.currencyName,
        currencySymbol: settings.currencySymbol,
        exchangeRate: settings.exchangeRate,
        minConversionAmount: settings.minConversionAmount,
        maxConversionAmount: settings.maxConversionAmount,
        conversionCommissionRate: settings.conversionCommissionRate,
        useInGames: settings.useInGames,
        useInP2P: settings.useInP2P,
        isActive: settings.isActive,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/project-currency/wallet", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await ensureProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return res.status(404).json({ error: "Project currency is not enabled" });
      }
      const wallet = await storage.getOrCreateProjectCurrencyWallet(req.user!.id);
      res.json({
        id: wallet.id,
        purchasedBalance: wallet.purchasedBalance,
        earnedBalance: wallet.earnedBalance,
        totalBalance: (parseFloat(wallet.purchasedBalance) + parseFloat(wallet.earnedBalance)).toFixed(2),
        currencyName: settings.currencyName,
        currencySymbol: settings.currencySymbol,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post(
    "/api/project-currency/convert",
    authMiddleware,
    paymentIpGuard("convert"),
    paymentOperationTokenGuard("convert"),
    sensitiveRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount } = req.body;
        const amountInWalletCurrency = parseFloat(amount);
        if (isNaN(amountInWalletCurrency) || amountInWalletCurrency <= 0) {
          return res.status(400).json({ error: "Invalid amount" });
        }

        const settings = await ensureProjectCurrencySettings();
        if (!settings || !settings.isActive) {
          return res.status(400).json({ error: "Project currency is not enabled" });
        }

        const user = await storage.getUser(req.user!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const walletCurrency = normalizeCurrencyCode(user.balanceCurrency) || "USD";
        const fxSnapshot = await getDepositFxSnapshot([walletCurrency]);
        const walletToUsdQuote = convertDepositAmountToUsd(
          amountInWalletCurrency,
          walletCurrency,
          fxSnapshot.usdRateByCurrency,
        );
        if (!walletToUsdQuote) {
          return res.status(400).json({ error: `Exchange rate for ${walletCurrency} is unavailable` });
        }

        const amountUsd = walletToUsdQuote.creditedAmountUsd;
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
          return res.status(400).json({ error: "Converted amount is invalid" });
        }

        const minAmount = parseFloat(settings.minConversionAmount);
        const maxAmount = parseFloat(settings.maxConversionAmount);
        if (amountUsd < minAmount || amountUsd > maxAmount) {
          const minInWallet = convertUsdAmountToCurrency(minAmount, walletCurrency, fxSnapshot.usdRateByCurrency);
          const maxInWallet = convertUsdAmountToCurrency(maxAmount, walletCurrency, fxSnapshot.usdRateByCurrency);

          const minLabel = minInWallet
            ? `${minInWallet.convertedAmount.toFixed(2)} ${walletCurrency}`
            : `${minAmount.toFixed(2)} USD`;
          const maxLabel = maxInWallet
            ? `${maxInWallet.convertedAmount.toFixed(2)} ${walletCurrency}`
            : `${maxAmount.toFixed(2)} USD`;

          return res.status(400).json({
            error: `Amount must be between ${minLabel} and ${maxLabel}`,
          });
        }

        if (parseFloat(user.balance) < amountUsd) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        const dailyUserLimit = parseFloat(settings.dailyConversionLimitPerUser);
        const userDailyTotal = parseFloat(await storage.getUserDailyConversionTotal(req.user!.id));
        if (userDailyTotal + amountUsd > dailyUserLimit) {
          const dailyLimitInWallet = convertUsdAmountToCurrency(dailyUserLimit, walletCurrency, fxSnapshot.usdRateByCurrency);
          const dailyLimitLabel = dailyLimitInWallet
            ? `${dailyLimitInWallet.convertedAmount.toFixed(2)} ${walletCurrency}`
            : `${dailyUserLimit.toFixed(2)} USD`;

          return res.status(400).json({
            error: `Daily conversion limit of ${dailyLimitLabel} exceeded`,
          });
        }

        const dailyPlatformLimit = parseFloat(settings.totalPlatformDailyLimit);
        const platformDailyTotal = parseFloat(await storage.getPlatformDailyConversionTotal());
        if (platformDailyTotal + amountUsd > dailyPlatformLimit) {
          return res.status(400).json({ error: "Platform daily conversion limit reached. Try again tomorrow." });
        }

        const result = await storage.convertToProjectCurrencyAtomic(req.user!.id, String(amountUsd));
        if (!result.success) return res.status(400).json({ error: result.error });

        const conversion = result.conversion!;

        await sendNotification(req.user!.id, {
          type: 'transaction',
          priority: 'normal',
          title: conversion.status === 'pending' ? 'Conversion Pending Approval' : 'Conversion Completed ✅',
          titleAr: conversion.status === 'pending' ? 'التحويل بانتظار الموافقة' : 'تم التحويل بنجاح ✅',
          message: `${amountInWalletCurrency.toFixed(2)} ${walletCurrency} conversion ${conversion.status === 'pending' ? 'submitted for review' : 'completed'}. Net: ${conversion.netAmount} coins.`,
          messageAr: `تحويل ${amountInWalletCurrency.toFixed(2)} ${walletCurrency} ${conversion.status === 'pending' ? 'مقدم للمراجعة' : 'مكتمل'}. الصافي: ${conversion.netAmount} عملة.`,
          link: '/wallet',
          metadata: JSON.stringify({
            conversionId: conversion.id,
            amountWalletCurrency: amountInWalletCurrency,
            walletCurrency,
            amountUsd,
            status: conversion.status,
          }),
        }).catch(() => { });

        res.json({
          message: conversion.status === "pending"
            ? "Conversion submitted for admin approval"
            : "Conversion completed successfully",
          status: conversion.status,
          conversionId: conversion.id,
          debitedAmount: amountInWalletCurrency.toFixed(2),
          debitedCurrency: walletCurrency,
          debitedAmountUsd: amountUsd.toFixed(2),
          creditedAmount: conversion.netAmount,
          commissionAmount: conversion.commissionAmount,
        });
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );

  app.get("/api/project-currency/conversions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await ensureProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return res.status(404).json({ error: "Project currency is not enabled" });
      }
      const limit = parseInt(req.query.limit as string) || 20;
      const conversions = await storage.listProjectCurrencyConversions({ userId: req.user!.id, limit });
      res.json(conversions.map(c => ({
        id: c.id, baseCurrencyAmount: c.baseCurrencyAmount, projectCurrencyAmount: c.projectCurrencyAmount,
        netAmount: c.netAmount, commissionAmount: c.commissionAmount, status: c.status,
        rejectionReason: c.rejectionReason, createdAt: c.createdAt, completedAt: c.completedAt,
      })));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/project-currency/ledger", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await ensureProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return res.status(404).json({ error: "Project currency is not enabled" });
      }
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const ledger = await storage.getProjectCurrencyLedger({ userId: req.user!.id, limit, offset });
      res.json(ledger.map(entry => ({
        id: entry.id, type: entry.type, amount: entry.amount,
        balanceAfter: entry.balanceAfter, description: entry.description, createdAt: entry.createdAt,
      })));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
