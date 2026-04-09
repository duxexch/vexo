import type { Express, Request, Response } from "express";
import { AuthRequest, authMiddleware, adminMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { cancelPaymentOperationToken } from "../../lib/payment-security";
import { evaluateSocialPlatformRuntime } from "../../lib/social-platform-runtime";

export function registerFinancialAndAuthRoutes(app: Express): void {

  // ==================== FINANCIAL LIMITS & AUDIT LOG ROUTES ====================

  app.get("/api/financial-limits", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const limits = await storage.getFinancialLimits();
      res.json(limits);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/financial-limits", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const limit = await storage.createFinancialLimit(req.body);
      res.status(201).json(limit);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/audit-logs", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId, action } = req.query;
      const logs = await storage.getAuditLogs(userId as string, action as string);
      res.json(logs);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/financial/operation-token/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      if (!token) {
        return res.status(400).json({ error: "token is required" });
      }

      const cancelled = await cancelPaymentOperationToken(req.user!.id, token, "USER_CANCELLED");
      return res.json({ cancelled });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUTH SETTINGS ROUTES ====================

  app.get("/api/auth/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettingsByCategory("auth");
      const authConfig: Record<string, boolean> = {
        oneClickEnabled: true, phoneLoginEnabled: true, emailLoginEnabled: true,
        googleLoginEnabled: false, facebookLoginEnabled: false, telegramLoginEnabled: false, twitterLoginEnabled: false,
      };
      settings.forEach(s => { if (s.key in authConfig) authConfig[s.key] = s.value === "true"; });

      // Keep social visibility aligned with the social-platform runtime source of truth.
      const socialSettingToPlatform: Record<string, string> = {
        googleLoginEnabled: "google",
        facebookLoginEnabled: "facebook",
        telegramLoginEnabled: "telegram",
        twitterLoginEnabled: "twitter",
      };

      const enabledSocialPlatforms = await storage.getEnabledSocialPlatforms();
      const runtimeByPlatformName = new Map(
        enabledSocialPlatforms.map((platform) => [platform.name, evaluateSocialPlatformRuntime(platform)]),
      );

      for (const [settingKey, platformName] of Object.entries(socialSettingToPlatform)) {
        const runtime = runtimeByPlatformName.get(platformName);
        authConfig[settingKey] = Boolean(runtime?.oauthLoginEnabled);
      }

      res.json(authConfig);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/auth/settings", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        await storage.setSetting(key, String(value), "auth");
      }
      await storage.createAuditLog({
        userId: req.user!.id, action: "settings_change", entityType: "system",
        entityId: "auth_settings", details: JSON.stringify(updates),
      });
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
