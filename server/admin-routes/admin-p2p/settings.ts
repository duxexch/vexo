import type { Express, Request, Response } from "express";
import { p2pSettings } from "@shared/schema";
import { broadcastSystemEvent } from "../../websocket";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

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
});

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
      
      // Get current settings or create if not exists
      let [existing] = await db.select().from(p2pSettings).limit(1);
      if (!existing) {
        [existing] = await db.insert(p2pSettings).values({}).returning();
      }
      
      const previousValue = JSON.stringify(existing);
      
      // Update settings
      const [updated] = await db.update(p2pSettings)
        .set({ ...data, updatedAt: new Date() })
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
