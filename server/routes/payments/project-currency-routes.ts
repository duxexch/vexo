import type { Express, Request, Response } from "express";
import { AuthRequest, authMiddleware, sensitiveRateLimiter } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { sendNotification } from "../../websocket";

export function registerProjectCurrencyRoutes(app: Express): void {

  app.get("/api/project-currency/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getProjectCurrencySettings();
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
      const settings = await storage.getProjectCurrencySettings();
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

  app.post("/api/project-currency/convert", authMiddleware, sensitiveRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { amount } = req.body;
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const settings = await storage.getProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return res.status(400).json({ error: "Project currency is not enabled" });
      }

      const minAmount = parseFloat(settings.minConversionAmount);
      const maxAmount = parseFloat(settings.maxConversionAmount);
      if (parsedAmount < minAmount || parsedAmount > maxAmount) {
        return res.status(400).json({
          error: `Amount must be between $${minAmount.toFixed(2)} and $${maxAmount.toFixed(2)}`
        });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (parseFloat(user.balance) < parsedAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      const dailyUserLimit = parseFloat(settings.dailyConversionLimitPerUser);
      const userDailyTotal = parseFloat(await storage.getUserDailyConversionTotal(req.user!.id));
      if (userDailyTotal + parsedAmount > dailyUserLimit) {
        return res.status(400).json({
          error: `Daily conversion limit of $${dailyUserLimit.toFixed(2)} exceeded`
        });
      }

      const dailyPlatformLimit = parseFloat(settings.totalPlatformDailyLimit);
      const platformDailyTotal = parseFloat(await storage.getPlatformDailyConversionTotal());
      if (platformDailyTotal + parsedAmount > dailyPlatformLimit) {
        return res.status(400).json({ error: "Platform daily conversion limit reached. Try again tomorrow." });
      }

      const result = await storage.convertToProjectCurrencyAtomic(req.user!.id, String(parsedAmount));
      if (!result.success) return res.status(400).json({ error: result.error });

      const conversion = result.conversion!;

      await sendNotification(req.user!.id, {
        type: 'transaction',
        priority: 'normal',
        title: conversion.status === 'pending' ? 'Conversion Pending Approval' : 'Conversion Completed ✅',
        titleAr: conversion.status === 'pending' ? 'التحويل بانتظار الموافقة' : 'تم التحويل بنجاح ✅',
        message: `$${parsedAmount.toFixed(2)} conversion ${conversion.status === 'pending' ? 'submitted for review' : 'completed'}. Net: ${conversion.netAmount} coins.`,
        messageAr: `تحويل $${parsedAmount.toFixed(2)} ${conversion.status === 'pending' ? 'مقدم للمراجعة' : 'مكتمل'}. الصافي: ${conversion.netAmount} عملة.`,
        link: '/wallet',
        metadata: JSON.stringify({ conversionId: conversion.id, amount: parsedAmount, status: conversion.status }),
      }).catch(() => {});

      res.json({
        message: conversion.status === "pending"
          ? "Conversion submitted for admin approval"
          : "Conversion completed successfully",
        status: conversion.status,
        conversionId: conversion.id,
        creditedAmount: conversion.netAmount,
        commissionAmount: conversion.commissionAmount,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/project-currency/conversions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getProjectCurrencySettings();
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
      const settings = await storage.getProjectCurrencySettings();
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
