import type { Express, Response } from "express";
import { insertSocialPlatformSchema } from "@shared/schema";
import { storage } from "../../storage";
import { maskPlatformSecrets, filterMaskedValues, SENSITIVE_FIELDS } from "../../lib/crypto-utils";
import { sensitiveRateLimiter } from "../../routes/middleware";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

const VALID_PLATFORM_NAME = /^[a-z][a-z0-9_]{1,30}$/;
const VALID_URL = /^https?:\/\/.{3,500}$/;

export function registerSocialPlatformsRoutes(app: Express) {

  // ==================== SOCIAL PLATFORMS MANAGEMENT ====================

  app.get("/api/admin/social-platforms", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const platforms = await storage.listSocialPlatforms();
      const masked = platforms.map(p => maskPlatformSecrets(p));
      res.json(masked);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/social-platforms", adminAuthMiddleware, sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const validatedData = insertSocialPlatformSchema.parse(req.body);
      
      if (!VALID_PLATFORM_NAME.test(validatedData.name)) {
        return res.status(400).json({ error: "Platform name must be lowercase alphanumeric with underscores, 2-31 chars" });
      }
      if (validatedData.webhookUrl && !VALID_URL.test(validatedData.webhookUrl)) {
        return res.status(400).json({ error: "Invalid webhook URL format" });
      }
      if (validatedData.callbackUrl && !VALID_URL.test(validatedData.callbackUrl)) {
        return res.status(400).json({ error: "Invalid callback URL format" });
      }
      if (validatedData.otpExpiry !== undefined && (validatedData.otpExpiry < 60 || validatedData.otpExpiry > 600)) {
        return res.status(400).json({ error: "OTP expiry must be between 60 and 600 seconds" });
      }
      const existingByName = await storage.getSocialPlatformByName(validatedData.name);
      if (existingByName) {
        return res.status(409).json({ error: "A platform with this name already exists" });
      }
      
      const platform = await storage.createSocialPlatform(validatedData);
      
      await logAdminAction(req.admin!.id, "settings_change", "social_platform", platform.id, {
        newValue: JSON.stringify({ name: platform.name, displayName: platform.displayName, type: platform.type })
      }, req);
      
      res.json(maskPlatformSecrets(platform));
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/social-platforms/:id", adminAuthMiddleware, sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updateSchema = insertSocialPlatformSchema.partial();
      let validatedData = updateSchema.parse(req.body);
      
      validatedData = filterMaskedValues(validatedData) as typeof validatedData;
      
      if (validatedData.name && !VALID_PLATFORM_NAME.test(validatedData.name)) {
        return res.status(400).json({ error: "Platform name must be lowercase alphanumeric with underscores" });
      }
      if (validatedData.webhookUrl && !VALID_URL.test(validatedData.webhookUrl)) {
        return res.status(400).json({ error: "Invalid webhook URL format" });
      }
      if (validatedData.callbackUrl && !VALID_URL.test(validatedData.callbackUrl)) {
        return res.status(400).json({ error: "Invalid callback URL format" });
      }
      if (validatedData.otpExpiry !== undefined && (validatedData.otpExpiry < 60 || validatedData.otpExpiry > 600)) {
        return res.status(400).json({ error: "OTP expiry must be between 60 and 600 seconds" });
      }
      
      const existing = await storage.getSocialPlatform(id);
      if (!existing) {
        return res.status(404).json({ error: "Platform not found" });
      }
      
      const platform = await storage.updateSocialPlatform(id, validatedData);
      if (!platform) {
        return res.status(404).json({ error: "Platform not found" });
      }
      
      const changedFields = Object.keys(validatedData).filter(k => !(SENSITIVE_FIELDS as readonly string[]).includes(k));
      const sensitiveChanged = Object.keys(validatedData).filter(k => (SENSITIVE_FIELDS as readonly string[]).includes(k));
      await logAdminAction(req.admin!.id, "settings_change", "social_platform", id, {
        metadata: JSON.stringify({
          fields_updated: changedFields,
          secrets_updated: sensitiveChanged.length > 0 ? sensitiveChanged.map(f => `${f} [updated]`) : undefined,
        })
      }, req);
      
      res.json(maskPlatformSecrets(platform));
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/social-platforms/:id", adminAuthMiddleware, sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const existing = await storage.getSocialPlatform(id);
      if (!existing) {
        return res.status(404).json({ error: "Platform not found" });
      }
      
      const deleted = await storage.deleteSocialPlatform(id);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete platform" });
      }
      
      await logAdminAction(req.admin!.id, "settings_change", "social_platform", id, {
        previousValue: JSON.stringify({ name: existing.name }),
        reason: "Platform deleted"
      }, req);
      
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/social-platforms/:id/toggle", adminAuthMiddleware, sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const platform = await storage.getSocialPlatform(id);
      if (!platform) {
        return res.status(404).json({ error: "Platform not found" });
      }
      const updated = await storage.updateSocialPlatform(id, { isEnabled: !platform.isEnabled });
      
      await logAdminAction(req.admin!.id, "settings_change", "social_platform", id, {
        previousValue: JSON.stringify({ isEnabled: platform.isEnabled }),
        newValue: JSON.stringify({ isEnabled: updated?.isEnabled })
      }, req);
      
      res.json(maskPlatformSecrets(updated!));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/social-platforms/:id/test", adminAuthMiddleware, sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const platform = await storage.getSocialPlatform(id);
      if (!platform) {
        return res.status(404).json({ error: "Platform not found" });
      }

      const issues: string[] = [];
      const checks: { name: string; status: "pass" | "fail" | "skip"; detail?: string }[] = [];

      if (platform.type === "oauth" || platform.type === "both") {
        if (!platform.clientId) {
          issues.push("Missing Client ID");
          checks.push({ name: "Client ID", status: "fail", detail: "Not set" });
        } else {
          checks.push({ name: "Client ID", status: "pass" });
        }
        if (!platform.clientSecret) {
          issues.push("Missing Client Secret");
          checks.push({ name: "Client Secret", status: "fail", detail: "Not set" });
        } else {
          checks.push({ name: "Client Secret", status: "pass" });
        }
        if (!platform.callbackUrl) {
          checks.push({ name: "Callback URL", status: "fail", detail: "Not set — will use default" });
        } else {
          checks.push({ name: "Callback URL", status: "pass", detail: platform.callbackUrl });
        }
      }

      if (platform.type === "otp" || platform.type === "both") {
        if (platform.name === "whatsapp") {
          if (!platform.accessToken) issues.push("Missing WhatsApp Access Token");
          if (!platform.phoneNumberId) issues.push("Missing Phone Number ID");
          checks.push({ name: "WhatsApp Token", status: platform.accessToken ? "pass" : "fail" });
          checks.push({ name: "Phone Number ID", status: platform.phoneNumberId ? "pass" : "fail" });
        } else if (platform.name === "telegram") {
          if (!platform.botToken) issues.push("Missing Telegram Bot Token");
          checks.push({ name: "Bot Token", status: platform.botToken ? "pass" : "fail" });
        } else if (platform.name === "sms") {
          if (!platform.apiKey) issues.push("Missing SMS API Key");
          checks.push({ name: "API Key", status: platform.apiKey ? "pass" : "fail" });
        }
      }

      res.json({
        platform: platform.name,
        status: issues.length === 0 ? "ready" : "incomplete",
        issues,
        checks,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
