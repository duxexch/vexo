import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { insertCountryPaymentMethodSchema } from "@shared/schema";
import { evaluateSocialPlatformRuntime } from "../../lib/social-platform-runtime";
import { z } from "zod";

const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
  action: z.enum(["activate", "deactivate", "enable_withdrawal", "disable_withdrawal", "delete"]),
});

export function registerPaymentMethodRoutes(app: Express): void {

  app.get("/api/payment-methods", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const methods = await storage.listCountryPaymentMethods();
      const purpose = typeof req.query?.purpose === "string"
        ? req.query.purpose.trim().toLowerCase()
        : "";
      const countryCode = typeof req.query?.country === "string"
        ? req.query.country.trim().toUpperCase()
        : "";

      const activeMethods = methods.filter((method) => {
        if (!method.isActive || !method.isAvailable) {
          return false;
        }

        if (purpose === "withdrawal") {
          return method.isWithdrawalEnabled;
        }

        return true;
      });
      if (!countryCode) {
        return res.json(activeMethods);
      }

      res.json(activeMethods.filter((method) => {
        const methodCountryCode = String(method.countryCode || "").toUpperCase();
        return methodCountryCode === "ALL" || methodCountryCode === countryCode;
      }));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/payment-methods", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const methods = await storage.listCountryPaymentMethods();
      res.json(methods);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/integrations/status", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const hasEnvValue = (value: string | undefined): boolean => typeof value === "string" && value.trim().length > 0;

      const socialPlatforms = await storage.listSocialPlatforms();
      const socialPlatformMap = new Map(
        socialPlatforms.map((platform) => [platform.name.toLowerCase(), platform]),
      );

      const isSocialOAuthConfigured = (platformName: string, envConfigured: boolean): boolean => {
        const platform = socialPlatformMap.get(platformName.toLowerCase());
        if (!platform) {
          return envConfigured;
        }

        const runtime = evaluateSocialPlatformRuntime(platform);
        return runtime.oauth.ready || envConfigured;
      };

      const telegramPlatform = socialPlatformMap.get("telegram");
      const telegramDbConfigured = Boolean(
        telegramPlatform && typeof telegramPlatform.botToken === "string" && telegramPlatform.botToken.trim().length > 0,
      );

      const sendgridFrom = process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM;

      const integrations: Record<string, boolean> = {
        twilio: hasEnvValue(process.env.TWILIO_ACCOUNT_SID)
          && hasEnvValue(process.env.TWILIO_AUTH_TOKEN)
          && hasEnvValue(process.env.TWILIO_PHONE_NUMBER),
        sendgrid: hasEnvValue(process.env.SENDGRID_API_KEY)
          && hasEnvValue(sendgridFrom),
        google_oauth: isSocialOAuthConfigured(
          "google",
          hasEnvValue(process.env.GOOGLE_CLIENT_ID) && hasEnvValue(process.env.GOOGLE_CLIENT_SECRET),
        ),
        facebook_oauth: isSocialOAuthConfigured(
          "facebook",
          hasEnvValue(process.env.FACEBOOK_APP_ID) && hasEnvValue(process.env.FACEBOOK_APP_SECRET),
        ),
        telegram_oauth: telegramDbConfigured || hasEnvValue(process.env.TELEGRAM_BOT_TOKEN),
        twitter_oauth: isSocialOAuthConfigured(
          "twitter",
          hasEnvValue(process.env.TWITTER_API_KEY) && hasEnvValue(process.env.TWITTER_API_SECRET),
        ),
        stripe: hasEnvValue(process.env.STRIPE_SECRET_KEY)
          && hasEnvValue(process.env.STRIPE_PUBLISHABLE_KEY)
          && hasEnvValue(process.env.STRIPE_WEBHOOK_SECRET),
        firebase_push: hasEnvValue(process.env.FIREBASE_PROJECT_ID)
          && hasEnvValue(process.env.FIREBASE_PRIVATE_KEY)
          && hasEnvValue(process.env.FIREBASE_CLIENT_EMAIL),
      };
      res.json(integrations);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/payment-methods", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertCountryPaymentMethodSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payment method data", details: parsed.error.errors });
      }
      const method = await storage.createCountryPaymentMethod(parsed.data);
      res.json(method);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/payment-methods/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = insertCountryPaymentMethodSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payment method data", details: parsed.error.errors });
      }
      const method = await storage.updateCountryPaymentMethod(id, parsed.data);
      if (!method) {
        return res.status(404).json({ error: "Payment method not found" });
      }
      res.json(method);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/payment-methods/bulk-action", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = bulkActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid bulk action payload",
          details: parsed.error.errors,
        });
      }

      const ids = Array.from(new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean)));
      if (ids.length === 0) {
        return res.status(400).json({ error: "No valid payment method IDs provided" });
      }

      const action = parsed.data.action;

      if (action === "delete") {
        const deletedCount = await storage.deleteCountryPaymentMethodsBulk(ids);
        return res.json({ success: true, action, affectedCount: deletedCount });
      }

      const updateData = action === "activate"
        ? { isActive: true }
        : action === "deactivate"
          ? { isActive: false }
          : action === "enable_withdrawal"
            ? { isWithdrawalEnabled: true }
            : { isWithdrawalEnabled: false };

      const updatedRows = await storage.updateCountryPaymentMethodsBulk(ids, updateData);
      return res.json({ success: true, action, affectedCount: updatedRows.length });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/payment-methods/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteCountryPaymentMethod(id);
      if (!deleted) {
        return res.status(404).json({ error: "Payment method not found" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
