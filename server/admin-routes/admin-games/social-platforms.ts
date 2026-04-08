import type { Express, Response } from "express";
import { insertSocialPlatformSchema, type SocialPlatform } from "@shared/schema";
import { storage } from "../../storage";
import { maskPlatformSecrets, filterMaskedValues, SENSITIVE_FIELDS } from "../../lib/crypto-utils";
import {
  evaluateSocialPlatformRuntime,
  getSocialPlatformCapability,
  type OAuthCredentialResolutionMode,
  type SocialPlatformRuntimeStatus,
} from "../../lib/social-platform-runtime";
import { sensitiveRateLimiter } from "../../routes/middleware";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

const VALID_PLATFORM_NAME = /^[a-z][a-z0-9_]{1,30}$/;
const VALID_URL = /^https?:\/\/.{3,500}$/;

type RuntimeConfigSource = "admin-db" | "env" | "missing";

type PlatformConfigMetadata = {
  configSource: RuntimeConfigSource;
  oauthResolutionMode: OAuthCredentialResolutionMode;
  effectiveCredentialSource: RuntimeConfigSource;
  conflicts: Array<{ code: string; message: string; reason: string }>;
  envFallback: {
    configured: boolean;
    fields: string[];
    missing: string[];
  };
  callbackCompliance: {
    expectedPath: string;
    configuredUrl: string | null;
    usesHttps: boolean;
    pathMatches: boolean | null;
  };
  warnings: string[];
};

type SettingsObject = Record<string, unknown>;

function hasFieldValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function parseSettingsObject(settings: string | null | undefined): SettingsObject {
  if (!settings || typeof settings !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(settings);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SettingsObject;
    }
  } catch {
    // Ignore invalid stored settings payload and start from an empty object.
  }

  return {};
}

function mergeOAuthResolutionMode(
  settings: string | null | undefined,
  mode: OAuthCredentialResolutionMode,
): string {
  const settingsObject = parseSettingsObject(settings);
  settingsObject.oauthResolutionMode = mode;
  return JSON.stringify(settingsObject);
}

function parseOAuthResolutionModeFromRequest(payload: unknown): OAuthCredentialResolutionMode | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const value = (payload as Record<string, unknown>).oauthResolutionMode;
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "env-first" || value === "admin-first") {
    return value;
  }

  throw new Error("oauthResolutionMode must be env-first or admin-first");
}

function getCapabilityIssues(platform: SocialPlatform): string[] {
  const capability = getSocialPlatformCapability(platform.name);
  const wantsOAuth = platform.type === "oauth" || platform.type === "both";
  const wantsOtp = platform.type === "otp" || platform.type === "both" || platform.otpEnabled;
  const issues: string[] = [];

  if (wantsOAuth && !capability.oauth) {
    issues.push(`OAuth mode is not supported for ${platform.name}. ${capability.reason}.`);
  }

  if (wantsOtp && !capability.otp) {
    issues.push(`OTP mode is not supported for ${platform.name}. ${capability.reason}.`);
  }

  if (!capability.otp && platform.otpEnabled) {
    issues.push(`otpEnabled must be false for ${platform.name}.`);
  }

  return issues;
}

function buildCallbackCompliance(platform: SocialPlatform): PlatformConfigMetadata["callbackCompliance"] {
  const expectedPath = `/api/auth/social/${platform.name}/callback`;
  const callbackUrl = typeof platform.callbackUrl === "string" ? platform.callbackUrl.trim() : "";

  if (!callbackUrl) {
    return {
      expectedPath,
      configuredUrl: null,
      usesHttps: true,
      pathMatches: null,
    };
  }

  try {
    const parsed = new URL(callbackUrl);
    return {
      expectedPath,
      configuredUrl: parsed.toString(),
      usesHttps: parsed.protocol === "https:",
      pathMatches: parsed.pathname === expectedPath,
    };
  } catch {
    return {
      expectedPath,
      configuredUrl: callbackUrl,
      usesHttps: false,
      pathMatches: false,
    };
  }
}

function buildPlatformConfigMetadata(platform: SocialPlatform, runtime: SocialPlatformRuntimeStatus): PlatformConfigMetadata {
  const oauthCredentials = runtime.oauth.credentials;
  const envFields = oauthCredentials.envFields;
  const missingEnvFields = oauthCredentials.envMissingFields;
  const envConfigured = oauthCredentials.envConfigured;
  const effectiveSource = oauthCredentials.effectiveSource;

  let configSource: RuntimeConfigSource = "admin-db";
  if (runtime.oauth.enabled) {
    configSource = effectiveSource;
  }

  const callbackCompliance = buildCallbackCompliance(platform);
  const warnings: string[] = [];
  const conflicts = [...oauthCredentials.conflicts];

  if (runtime.oauth.enabled) {
    if (oauthCredentials.adminConfigured && oauthCredentials.envConfigured && conflicts.length === 0) {
      warnings.push("Both Admin panel and .env OAuth credentials are set and currently synchronized.");
    }

    if (oauthCredentials.effectiveSource === "env") {
      warnings.push("OAuth credentials are currently resolved from project ENV files.");
    }

    if (oauthCredentials.effectiveSource === "admin-db" && oauthCredentials.envConfigured) {
      warnings.push("ENV credentials are configured but Admin panel source is active for this platform.");
    }

    if (oauthCredentials.effectiveSource === "missing") {
      warnings.push("Neither ENV nor Admin panel contains complete OAuth credentials for this provider.");
    }

    for (const conflict of conflicts) {
      warnings.push(`${conflict.message}: ${conflict.reason}`);
    }

    if (!hasFieldValue(platform.callbackUrl)) {
      warnings.push("Callback URL is empty in Admin panel. Dynamic callback URL will be derived from current host.");
    } else {
      if (!callbackCompliance.usesHttps) {
        warnings.push("Callback URL should use HTTPS in production.");
      }
      if (callbackCompliance.pathMatches === false) {
        warnings.push(`Callback path should be ${callbackCompliance.expectedPath}.`);
      }
    }
  }

  if (runtime.otp.enabled) {
    if (!hasFieldValue(platform.otpTemplate)) {
      warnings.push("OTP template is empty. Define a template that includes the verification code placeholder.");
    }

    if (platform.otpExpiry < 60 || platform.otpExpiry > 600) {
      warnings.push("OTP expiry should stay between 60 and 600 seconds.");
    }
  }

  return {
    configSource,
    oauthResolutionMode: oauthCredentials.resolutionMode,
    effectiveCredentialSource: effectiveSource,
    conflicts,
    envFallback: {
      configured: envConfigured,
      fields: envFields,
      missing: missingEnvFields,
    },
    callbackCompliance,
    warnings,
  };
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
  const runtime = evaluateSocialPlatformRuntime(platform);
  const metadata = buildPlatformConfigMetadata(platform, runtime);

  return {
    ...maskPlatformSecrets(platform),
    runtime: {
      ...runtime,
      ...metadata,
    },
  };
}

function assertEnableReadiness(platform: SocialPlatform, res: Response): boolean {
  const capabilityIssues = getCapabilityIssues(platform);
  if (capabilityIssues.length > 0) {
    res.status(400).json({
      error: "Platform configuration conflicts with provider capability matrix",
      issues: capabilityIssues,
      capability: getSocialPlatformCapability(platform.name),
    });
    return false;
  }

  const runtime = evaluateSocialPlatformRuntime(platform);
  if (!platform.isEnabled) {
    return true;
  }

  // Enabling should always require OAuth readiness when OAuth mode is active.
  const oauthBlocking = runtime.oauth.enabled && !runtime.oauth.ready;

  // OTP readiness is a hard blocker only for OTP-only usage.
  // In "both" mode, OAuth login can stay enabled while OTP remains optional/non-ready.
  const otpOnlyMode = platform.type === "otp";
  const otpBlocking = otpOnlyMode && runtime.otp.enabled && !runtime.otp.ready;

  if (!oauthBlocking && !otpBlocking) {
    return true;
  }

  const issues = [
    ...(oauthBlocking ? runtime.oauth.issues : []),
    ...(otpBlocking ? runtime.otp.issues : []),
  ];

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
      let validatedData = insertSocialPlatformSchema.parse(req.body);
      const oauthResolutionMode = parseOAuthResolutionModeFromRequest(req.body);
      if (oauthResolutionMode) {
        validatedData = {
          ...validatedData,
          settings: mergeOAuthResolutionMode(validatedData.settings ?? null, oauthResolutionMode),
        };
      }

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
      if (error instanceof Error && error.message.includes("oauthResolutionMode")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/social-platforms/:id", adminAuthMiddleware, sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updateSchema = insertSocialPlatformSchema.partial();
      let validatedData = updateSchema.parse(req.body);
      const oauthResolutionMode = parseOAuthResolutionModeFromRequest(req.body);

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

      if (oauthResolutionMode) {
        validatedData = {
          ...validatedData,
          settings: mergeOAuthResolutionMode(existing.settings ?? null, oauthResolutionMode),
        };
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
      if (error instanceof Error && error.message.includes("oauthResolutionMode")) {
        return res.status(400).json({ error: error.message });
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
      const metadata = buildPlatformConfigMetadata(platform, runtime);
      const checks: Array<{ name: string; status: "pass" | "fail" | "skip"; detail?: string }> = [];
      const capabilityIssues = getCapabilityIssues(platform);

      checks.push({
        name: "Capability Matrix",
        status: capabilityIssues.length === 0 ? "pass" : "fail",
        detail: capabilityIssues.length === 0
          ? runtime.capability.reason
          : capabilityIssues.join("; "),
      });

      if (runtime.oauth.enabled) {
        checks.push({
          name: "OAuth Resolution Mode",
          status: "pass",
          detail: runtime.oauth.credentials.resolutionMode,
        });
        checks.push({
          name: "Effective OAuth Source",
          status: runtime.oauth.credentials.effectiveSource === "missing" ? "fail" : "pass",
          detail: `${runtime.oauth.credentials.effectiveSource} (${runtime.oauth.credentials.selectedReason})`,
        });
        checks.push({
          name: "OAuth Provider",
          status: runtime.oauth.providerRegistered ? "pass" : "fail",
          detail: runtime.oauth.providerRegistered ? "Registered in backend runtime" : "Not registered",
        });
        checks.push({
          name: "Client ID",
          status: runtime.oauth.credentials.effectiveMissingFields.includes("Client ID") ? "fail" : "pass",
          detail: runtime.oauth.credentials.effectiveMissingFields.includes("Client ID")
            ? `Missing in ${runtime.oauth.credentials.effectiveSource}`
            : `Resolved from ${runtime.oauth.credentials.effectiveSource}`,
        });
        checks.push({
          name: "Client Secret",
          status: runtime.oauth.credentials.effectiveMissingFields.includes("Client Secret") ? "fail" : "pass",
          detail: runtime.oauth.credentials.effectiveMissingFields.includes("Client Secret")
            ? `Missing in ${runtime.oauth.credentials.effectiveSource}`
            : `Resolved from ${runtime.oauth.credentials.effectiveSource}`,
        });
        checks.push({
          name: "Callback URL",
          status: hasFieldValue(platform.callbackUrl) ? "pass" : "skip",
          detail: hasFieldValue(platform.callbackUrl) ? String(platform.callbackUrl) : "Using dynamic default callback URL",
        });
        checks.push({
          name: "Callback HTTPS",
          status: !hasFieldValue(platform.callbackUrl)
            ? "skip"
            : metadata.callbackCompliance.usesHttps
              ? "pass"
              : "fail",
          detail: !hasFieldValue(platform.callbackUrl)
            ? "Dynamic callback URL (host-derived)"
            : metadata.callbackCompliance.usesHttps
              ? "HTTPS"
              : "Non-HTTPS callback URL",
        });
        checks.push({
          name: "Callback Path",
          status: !hasFieldValue(platform.callbackUrl)
            ? "skip"
            : metadata.callbackCompliance.pathMatches === true
              ? "pass"
              : "fail",
          detail: !hasFieldValue(platform.callbackUrl)
            ? `Expected ${metadata.callbackCompliance.expectedPath}`
            : metadata.callbackCompliance.pathMatches === true
              ? metadata.callbackCompliance.expectedPath
              : `Expected ${metadata.callbackCompliance.expectedPath}`,
        });

        if (metadata.envFallback.fields.length > 0) {
          checks.push({
            name: "ENV Source",
            status: metadata.envFallback.configured ? "pass" : "skip",
            detail: metadata.envFallback.configured
              ? "Configured in .env"
              : `Missing ${metadata.envFallback.missing.join(", ")}`,
          });
        }

        checks.push({
          name: "Source Conflicts",
          status: runtime.oauth.credentials.conflicts.length === 0 ? "pass" : "fail",
          detail: runtime.oauth.credentials.conflicts.length === 0
            ? "No source conflicts detected"
            : runtime.oauth.credentials.conflicts.map((conflict) => `${conflict.code}: ${conflict.reason}`).join("; "),
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

        checks.push({
          name: "OTP Template",
          status: hasFieldValue(platform.otpTemplate) ? "pass" : "fail",
          detail: hasFieldValue(platform.otpTemplate) ? "Configured" : "Missing",
        });
        checks.push({
          name: "OTP Expiry",
          status: platform.otpExpiry >= 60 && platform.otpExpiry <= 600 ? "pass" : "fail",
          detail: `${platform.otpExpiry}s (recommended 60-600s)`,
        });
      }

      const issues = [
        ...runtime.oauth.issues,
        ...runtime.otp.issues,
        ...capabilityIssues,
        ...metadata.warnings,
      ];

      res.json({
        platform: platform.name,
        status: runtime.runtimeReady ? "ready" : "incomplete",
        issues,
        checks,
        runtime: {
          ...runtime,
          ...metadata,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
