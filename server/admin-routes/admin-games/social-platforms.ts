import type { Express, Response } from "express";
import { insertSocialPlatformSchema, type SocialPlatform } from "@shared/schema";
import { storage } from "../../storage";
import { maskPlatformSecrets, filterMaskedValues, SENSITIVE_FIELDS } from "../../lib/crypto-utils";
import { evaluateSocialPlatformRuntime } from "../../lib/social-platform-runtime";
import { sensitiveRateLimiter } from "../../routes/middleware";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

const VALID_PLATFORM_NAME = /^[a-z][a-z0-9_]{1,30}$/;
const VALID_URL = /^https?:\/\/.{3,500}$/;

function hasFieldValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function toSocialPlatformPreview(nextData: Partial<SocialPlatform>, current?: SocialPlatform): SocialPlatform {
  const now = new Date();
  return {
    id: current?.id ?? "preview",
    name: nextData.name ?? current?.name ?? "preview",
    displayName: nextData.displayName ?? current?.displayName ?? "Preview",
    displayNameAr: nextData.displayNameAr ?? current?.displayNameAr ?? null,
    icon: nextData.icon ?? current?.icon ?? "Globe",
    type: (nextData.type ?? current?.type ?? "oauth") as "oauth" | "otp" | "both",
    isEnabled: nextData.isEnabled ?? current?.isEnabled ?? false,
    clientId: nextData.clientId ?? current?.clientId ?? null,
    clientSecret: nextData.clientSecret ?? current?.clientSecret ?? null,
    apiKey: nextData.apiKey ?? current?.apiKey ?? null,
    apiSecret: nextData.apiSecret ?? current?.apiSecret ?? null,
    webhookUrl: nextData.webhookUrl ?? current?.webhookUrl ?? null,
    callbackUrl: nextData.callbackUrl ?? current?.callbackUrl ?? null,
    botToken: nextData.botToken ?? current?.botToken ?? null,
    phoneNumberId: nextData.phoneNumberId ?? current?.phoneNumberId ?? null,
    businessAccountId: nextData.businessAccountId ?? current?.businessAccountId ?? null,
    accessToken: nextData.accessToken ?? current?.accessToken ?? null,
    refreshToken: nextData.refreshToken ?? current?.refreshToken ?? null,
    otpEnabled: nextData.otpEnabled ?? current?.otpEnabled ?? false,
    otpTemplate: nextData.otpTemplate ?? current?.otpTemplate ?? null,
    otpExpiry: nextData.otpExpiry ?? current?.otpExpiry ?? 300,
    sortOrder: nextData.sortOrder ?? current?.sortOrder ?? 0,
    settings: nextData.settings ?? current?.settings ?? null,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

function serializePlatform(platform: SocialPlatform) {
  return {
    ...maskPlatformSecrets(platform),
    runtime: evaluateSocialPlatformRuntime(platform),
  };
}

function assertEnableReadiness(platform: SocialPlatform, res: Response): boolean {
  const runtime = evaluateSocialPlatformRuntime(platform);
  if (!platform.isEnabled || runtime.runtimeReady) {
    return true;
  }

  const issues = [...runtime.oauth.issues, ...runtime.otp.issues];
  res.status(400).json({
    error: "Platform cannot be enabled until runtime requirements are met",
    issues,
    runtime,
  });
  return false;
}

export function registerSocialPlatformsRoutes(app: Express) {
  // ==================== SOCIAL PLATFORMS MANAGEMENT ====================

  app.get("/api/admin/social-platforms", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const platforms = await storage.listSocialPlatforms();
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(platforms.map((platform) => serializePlatform(platform)));
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

      const candidate = toSocialPlatformPreview(validatedData as Partial<SocialPlatform>);
      if (!assertEnableReadiness(candidate, res)) {
        return;
      }

      const platform = await storage.createSocialPlatform(validatedData);

      await logAdminAction(req.admin!.id, "settings_change", "social_platform", platform.id, {
        newValue: JSON.stringify({ name: platform.name, displayName: platform.displayName, type: platform.type }),
      }, req);

      res.json(serializePlatform(platform));
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

      if (validatedData.name && validatedData.name !== existing.name) {
        const duplicateByName = await storage.getSocialPlatformByName(validatedData.name);
        if (duplicateByName && duplicateByName.id !== id) {
          return res.status(409).json({ error: "A platform with this name already exists" });
        }
      }

      const candidate = toSocialPlatformPreview(validatedData as Partial<SocialPlatform>, existing);
      if (!assertEnableReadiness(candidate, res)) {
        return;
      }

      const platform = await storage.updateSocialPlatform(id, validatedData);
      if (!platform) {
        return res.status(404).json({ error: "Platform not found" });
      }

      const changedFields = Object.keys(validatedData).filter((key) => !(SENSITIVE_FIELDS as readonly string[]).includes(key));
      const sensitiveChanged = Object.keys(validatedData).filter((key) => (SENSITIVE_FIELDS as readonly string[]).includes(key));
      await logAdminAction(req.admin!.id, "settings_change", "social_platform", id, {
        metadata: JSON.stringify({
          fields_updated: changedFields,
          secrets_updated: sensitiveChanged.length > 0 ? sensitiveChanged.map((field) => `${field} [updated]`) : undefined,
        }),
      }, req);

      res.json(serializePlatform(platform));
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
        reason: "Platform deleted",
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

      const shouldEnable = !platform.isEnabled;
      if (shouldEnable) {
        const candidate = toSocialPlatformPreview({ isEnabled: true }, platform);
        if (!assertEnableReadiness(candidate, res)) {
          return;
        }
      }

      const updated = await storage.updateSocialPlatform(id, { isEnabled: shouldEnable });

      await logAdminAction(req.admin!.id, "settings_change", "social_platform", id, {
        previousValue: JSON.stringify({ isEnabled: platform.isEnabled }),
        newValue: JSON.stringify({ isEnabled: updated?.isEnabled }),
      }, req);

      res.json(serializePlatform(updated!));
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

      const runtime = evaluateSocialPlatformRuntime(platform);
      const checks: Array<{ name: string; status: "pass" | "fail" | "skip"; detail?: string }> = [];

      if (runtime.oauth.enabled) {
        checks.push({
          name: "OAuth Provider",
          status: runtime.oauth.providerRegistered ? "pass" : "fail",
          detail: runtime.oauth.providerRegistered ? "Registered in backend runtime" : "Not registered",
        });
        checks.push({
          name: "Client ID",
          status: hasFieldValue(platform.clientId) ? "pass" : "fail",
          detail: hasFieldValue(platform.clientId) ? "Configured" : "Missing",
        });
        checks.push({
          name: "Client Secret",
          status: hasFieldValue(platform.clientSecret) ? "pass" : "fail",
          detail: hasFieldValue(platform.clientSecret) ? "Configured" : "Missing",
        });
        checks.push({
          name: "Callback URL",
          status: hasFieldValue(platform.callbackUrl) ? "pass" : "skip",
          detail: hasFieldValue(platform.callbackUrl) ? String(platform.callbackUrl) : "Using dynamic default callback URL",
        });
      }

      if (runtime.otp.enabled) {
        checks.push({
          name: "OTP Adapter",
          status: runtime.otp.adapter === "none" ? "fail" : "pass",
          detail: runtime.otp.adapter,
        });

        for (const field of runtime.otp.requiredFields) {
          const value = (platform as Record<string, unknown>)[field];
          checks.push({
            name: field,
            status: hasFieldValue(value) ? "pass" : "fail",
            detail: hasFieldValue(value) ? "Configured" : "Missing",
          });
        }
      }

      const issues = [...runtime.oauth.issues, ...runtime.otp.issues];

      res.json({
        platform: platform.name,
        status: runtime.runtimeReady ? "ready" : "incomplete",
        issues,
        checks,
        runtime,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
