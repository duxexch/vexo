import type { Express, Request, Response } from "express";
import { p2pSettings } from "@shared/schema";
import { broadcastSystemEvent } from "../../websocket";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";

const currencyCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());

const updateP2pSettingsSchema = z.object({
  feeType: z.enum(["percentage", "fixed", "hybrid"]).optional(),
  platformFeePercentage: z.string().optional(),
  platformFeeFixed: z.string().optional(),
  minFee: z.string().optional(),
  maxFee: z.string().nullable().optional(),
  minTradeAmount: z.string().optional(),
  maxTradeAmount: z.string().optional(),
  escrowTimeoutHours: z.number().int().positive().optional(),
  paymentTimeoutMinutes: z.number().int().positive().optional(),
  autoExpireEnabled: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  requireIdentityVerification: z.boolean().optional(),
  requirePhoneVerification: z.boolean().optional(),
  requireEmailVerification: z.boolean().optional(),
  p2pBuyCurrencies: z.array(currencyCodeSchema).max(100).optional(),
  p2pSellCurrencies: z.array(currencyCodeSchema).max(100).optional(),
  depositEnabledCurrencies: z.array(currencyCodeSchema).max(100).optional(),
});

function parsePositiveDecimal(input: string | null | undefined): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  const normalized = String(input).trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeCurrencyArray(currencies: string[]): string[] {
  const uniqueCurrencies = new Set<string>();

  for (const currency of currencies) {
    const normalized = normalizeCurrencyCode(currency);
    if (normalized) {
      uniqueCurrencies.add(normalized);
    }
  }

  return Array.from(uniqueCurrencies);
}

export function registerP2pSettingsRoutes(app: Express) {

  // Get P2P settings
  app.get("/api/admin/p2p/settings", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [settings] = await db.select().from(p2pSettings).limit(1);
      if (!settings) {
        // Create default settings if none exist
        const [newSettings] = await db.insert(p2pSettings).values({}).returning();
        return res.json(newSettings);
      }
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update P2P settings
  app.put("/api/admin/p2p/settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = updateP2pSettingsSchema.parse(req.body);

      const normalizedData = {
        ...data,
        p2pBuyCurrencies: data.p2pBuyCurrencies !== undefined
          ? normalizeCurrencyArray(data.p2pBuyCurrencies)
          : undefined,
        p2pSellCurrencies: data.p2pSellCurrencies !== undefined
          ? normalizeCurrencyArray(data.p2pSellCurrencies)
          : undefined,
        depositEnabledCurrencies: data.depositEnabledCurrencies !== undefined
          ? normalizeCurrencyArray(data.depositEnabledCurrencies)
          : undefined,
      };

      // Get current settings or create if not exists
      let [existing] = await db.select().from(p2pSettings).limit(1);
      if (!existing) {
        [existing] = await db.insert(p2pSettings).values({}).returning();
      }

      const resolvedMinTradeAmountRaw = data.minTradeAmount ?? String(existing.minTradeAmount);
      const resolvedMaxTradeAmountRaw = data.maxTradeAmount ?? String(existing.maxTradeAmount);

      const resolvedMinTradeAmount = parsePositiveDecimal(resolvedMinTradeAmountRaw);
      const resolvedMaxTradeAmount = parsePositiveDecimal(resolvedMaxTradeAmountRaw);

      if (resolvedMinTradeAmount === null) {
        return res.status(400).json({ error: "minTradeAmount must be a positive number" });
      }

      if (resolvedMaxTradeAmount === null) {
        return res.status(400).json({ error: "maxTradeAmount must be a positive number" });
      }

      if (resolvedMaxTradeAmount < resolvedMinTradeAmount) {
        return res.status(400).json({ error: "maxTradeAmount must be greater than or equal to minTradeAmount" });
      }

      normalizedData.minTradeAmount = resolvedMinTradeAmount.toFixed(2);
      normalizedData.maxTradeAmount = resolvedMaxTradeAmount.toFixed(2);

      const previousValue = JSON.stringify(existing);

      // Update settings
      const [updated] = await db.update(p2pSettings)
        .set({ ...normalizedData, updatedAt: new Date() })
        .where(eq(p2pSettings.id, existing.id))
        .returning();

      // Log admin action
      await logAdminAction(
        req.admin!.id,
        "update",
        "p2p_settings",
        existing.id,
        { previousValue, newValue: JSON.stringify(updated) },
        req
      );

      // Broadcast settings change
      broadcastSystemEvent({
        type: "p2p_settings_changed",
        data: updated,
      });

      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Calculate P2P fee for a given amount (utility endpoint)
  app.post("/api/admin/p2p/calculate-fee", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      if (!amount || isNaN(parseFloat(amount))) {
        return res.status(400).json({ error: "Valid amount required" });
      }

      const [settings] = await db.select().from(p2pSettings).limit(1);
      if (!settings) {
        return res.json({ fee: "0.00", feeType: "none" });
      }

      const tradeAmount = parseFloat(amount);
      let fee = 0;

      switch (settings.feeType) {
        case "percentage":
          fee = tradeAmount * parseFloat(settings.platformFeePercentage);
          break;
        case "fixed":
          fee = parseFloat(settings.platformFeeFixed);
          break;
        case "hybrid":
          fee = (tradeAmount * parseFloat(settings.platformFeePercentage)) + parseFloat(settings.platformFeeFixed);
          break;
      }

      // Apply min/max bounds
      const minFee = parseFloat(settings.minFee);
      const maxFee = settings.maxFee ? parseFloat(settings.maxFee) : null;

      if (fee < minFee) fee = minFee;
      if (maxFee !== null && fee > maxFee) fee = maxFee;

      res.json({
        fee: fee.toFixed(2),
        feeType: settings.feeType,
        breakdown: {
          percentageFee: (tradeAmount * parseFloat(settings.platformFeePercentage)).toFixed(2),
          fixedFee: settings.platformFeeFixed,
          minFee: settings.minFee,
          maxFee: settings.maxFee,
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
