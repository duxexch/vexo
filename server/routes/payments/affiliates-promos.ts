import type { Express, Request, Response } from "express";
import { AuthRequest, authMiddleware, adminMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import crypto from "crypto";

export function registerAffiliateAndPromoRoutes(app: Express): void {

  // ==================== AFFILIATES ROUTES ====================

  app.get("/api/affiliates", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const affiliates = await storage.listAffiliates();
      res.json(affiliates);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/affiliates", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const affiliateCode = `AFF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      // SECURITY: Whitelist allowed fields — prevent mass assignment of commissionRate, status, userId
      const affiliate = await storage.createAffiliate({
        userId: req.user!.id,
        affiliateCode,
        referralLink: `/ref/${affiliateCode}`,
      });
      res.status(201).json(affiliate);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/affiliates/me", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const affiliate = await storage.getAffiliateByCode(req.user!.id);
      res.json(affiliate);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== PROMO CODES ROUTES ====================

  app.get("/api/promo-codes", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const promoCodes = await storage.listPromoCodes();
      res.json(promoCodes);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/promo-codes", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const promoCode = await storage.createPromoCode(req.body);
      res.status(201).json(promoCode);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/promo-codes/validate/:code", async (req: Request, res: Response) => {
    try {
      const promo = await storage.getPromoCodeByCode(req.params.code);
      if (!promo) return res.status(404).json({ valid: false, error: "Promo code not found" });
      if (!promo.isActive) return res.json({ valid: false, error: "Promo code is not active" });
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.json({ valid: false, error: "Promo code has expired" });
      if (promo.usageLimit && promo.usageCount >= promo.usageLimit) return res.json({ valid: false, error: "Promo code usage limit reached" });
      res.json({ valid: true, promo });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
