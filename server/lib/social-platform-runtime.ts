import type { SocialPlatform } from "@shared/schema";
import {
  getCapabilityReason,
  getOAuthEnvMapping,
  getSocialProviderDefinition,
} from "@shared/social-providers.config";
import { getProvider } from "./oauth-engine";
import "./oauth-providers";

type OtpAdapter = "whatsapp" | "telegram" | "generic-webhook" | "system-email" | "system-sms" | "none";

export type OAuthCredentialResolutionMode = "env-first" | "admin-first";
export type OAuthCredentialSource = "env" | "admin-db" | "missing";

export interface OAuthCredentialConflict {
  code: "oauth_credentials_mismatch";
  message: string;
  reason: string;
}

export interface SocialPlatformCapability {
  oauth: boolean;
  otp: boolean;
  reason: string;
}

export interface ResolvedOAuthCredentials {
  resolutionMode: OAuthCredentialResolutionMode;
  effectiveSource: OAuthCredentialSource;
  selectedReason: string;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  envFields: string[];
  adminConfigured: boolean;
  envConfigured: boolean;
  adminMissingFields: string[];
  envMissingFields: string[];
  effectiveMissingFields: string[];
  conflicts: OAuthCredentialConflict[];
}

type OtpAdapterResolution = {
  adapter: OtpAdapter;
  requiredFields: Array<keyof SocialPlatform>;
  issues: string[];
};

type RuntimeModeStatus = {
  enabled: boolean;
  ready: boolean;
  issues: string[];
};

export interface SocialPlatformRuntimeStatus {
  capability: SocialPlatformCapability;
  oauth: RuntimeModeStatus & {
    featureFlagEnabled: boolean;
    providerRegistered: boolean;
    configured: boolean;
    credentials: Omit<ResolvedOAuthCredentials, "clientId" | "clientSecret" | "callbackUrl">;
  };
  otp: RuntimeModeStatus & {
    adapter: OtpAdapter;
    adapterConfigured: boolean;
    requiredFields: string[];
  };
  conflicts: OAuthCredentialConflict[];
  runtimeReady: boolean;
  oauthLoginEnabled: boolean;
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function envValue(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasEnv(name: string): boolean {
  return envValue(name).length > 0;
}

function normalizePlatformName(name: string): string {
  return name.trim().toLowerCase();
}

function parseProviderFeatureList(raw: string | undefined): Set<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return new Set<string>();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

function isOAuthFeatureEnabled(platformName: string): boolean {
  const normalized = normalizePlatformName(platformName);
  const disabled = parseProviderFeatureList(process.env.SOCIAL_OAUTH_DISABLED_PROVIDERS);
  const forced = parseProviderFeatureList(process.env.SOCIAL_OAUTH_FORCE_ENABLED_PROVIDERS);

  if (forced.has(normalized)) {
    return true;
  }

  return !disabled.has(normalized);
}

function parsePlatformSettings(platform: SocialPlatform): Record<string, unknown> {
  if (!platform.settings || typeof platform.settings !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(platform.settings);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid JSON and fallback to defaults.
  }

  return {};
}

function getOAuthResolutionMode(platform: SocialPlatform): OAuthCredentialResolutionMode {
  const settings = parsePlatformSettings(platform);
  const candidate = settings.oauthResolutionMode;
  if (candidate === "env-first" || candidate === "admin-first") {
    return candidate;
  }

  // Default to Admin panel first to match production runbook and avoid env/admin drift.
  return "admin-first";
}

export function getOAuthEnvFieldNames(platformName: string): string[] {
  const mapping = getOAuthEnvMapping(normalizePlatformName(platformName));
  if (!mapping) {
    return [];
  }

  return [mapping.clientId, mapping.clientSecret];
}

export function getSocialPlatformCapability(platformName: string): SocialPlatformCapability {
  const normalized = normalizePlatformName(platformName);

  const providerDefinition = getSocialProviderDefinition(normalized);
  const providerReason = getCapabilityReason(normalized);
  if (providerDefinition?.capability === "oauth-only") {
    return {
      oauth: true,
      otp: false,
      reason: providerReason || `${normalized} currently supports OAuth login only in runtime`,
    };
  }

  if (providerDefinition?.capability === "otp-only") {
    return {
      oauth: false,
      otp: true,
      reason: providerReason || `${normalized} platform is OTP only`,
    };
  }

  return {
    oauth: true,
    otp: true,
    reason: "Custom platform can support both OAuth and OTP when configured",
  };
}

function resolveEnvOAuthCredentials(platformName: string): {
  envFields: string[];
  clientId: string;
  clientSecret: string;
  configured: boolean;
  missingFields: string[];
} {
  const envFields = getOAuthEnvFieldNames(platformName);
  if (envFields.length < 2) {
    return {
      envFields,
      clientId: "",
      clientSecret: "",
      configured: false,
      missingFields: [],
    };
  }

  const clientId = envValue(envFields[0]);
  const clientSecret = envValue(envFields[1]);
  const missingFields: string[] = [];
  if (!clientId) missingFields.push("Client ID");
  if (!clientSecret) missingFields.push("Client Secret");

  return {
    envFields,
    clientId,
    clientSecret,
    configured: missingFields.length === 0,
    missingFields,
  };
}

function resolveAdminOAuthCredentials(platform: SocialPlatform): {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  configured: boolean;
  missingFields: string[];
} {
  const clientId = typeof platform.clientId === "string" ? platform.clientId.trim() : "";
  const clientSecret = typeof platform.clientSecret === "string" ? platform.clientSecret.trim() : "";
  const callbackUrl = typeof platform.callbackUrl === "string" ? platform.callbackUrl.trim() : "";

  const missingFields: string[] = [];
  if (!clientId) missingFields.push("Client ID");
  if (!clientSecret) missingFields.push("Client Secret");

  return {
    clientId,
    clientSecret,
    callbackUrl,
    configured: missingFields.length === 0,
    missingFields,
  };
}

function buildOAuthConflict(platformName: string, mode: OAuthCredentialResolutionMode, diffFields: string[]): OAuthCredentialConflict {
  const selectedByMode = mode === "env-first" ? "ENV" : "Admin panel";
  return {
    code: "oauth_credentials_mismatch",
    message: `OAuth credentials conflict detected for ${platformName}`,
    reason: `Different values found in ENV and Admin panel (${diffFields.join(", ")}). Active source follows ${mode} and currently selects ${selectedByMode}.`,
  };
}

export function resolveEffectiveOAuthCredentials(platform: SocialPlatform): ResolvedOAuthCredentials {
  const mode = getOAuthResolutionMode(platform);
  const admin = resolveAdminOAuthCredentials(platform);
  const env = resolveEnvOAuthCredentials(platform.name);

  let effectiveSource: OAuthCredentialSource = "missing";
  if (mode === "env-first") {
    if (env.configured) {
      effectiveSource = "env";
    } else if (admin.configured) {
      effectiveSource = "admin-db";
    }
  } else {
    if (admin.configured) {
      effectiveSource = "admin-db";
    } else if (env.configured) {
      effectiveSource = "env";
    }
  }

  const selectedReason =
    effectiveSource === "env"
      ? mode === "env-first"
        ? "ENV credentials are complete and selected by env-first policy"
        : "Admin credentials are incomplete, ENV fallback was selected"
      : effectiveSource === "admin-db"
        ? mode === "admin-first"
          ? "Admin credentials are complete and selected by admin-first policy"
          : "ENV credentials are incomplete, Admin fallback was selected"
        : "No complete OAuth credentials found in ENV or Admin panel";

  const conflicts: OAuthCredentialConflict[] = [];
  if (admin.configured && env.configured) {
    const diffFields: string[] = [];
    if (admin.clientId !== env.clientId) {
      diffFields.push("Client ID");
    }
    if (admin.clientSecret !== env.clientSecret) {
      diffFields.push("Client Secret");
    }

    if (diffFields.length > 0) {
      conflicts.push(buildOAuthConflict(platform.name, mode, diffFields));
    }
  }

  const effectiveClientId = effectiveSource === "env" ? env.clientId : effectiveSource === "admin-db" ? admin.clientId : "";
  const effectiveClientSecret = effectiveSource === "env" ? env.clientSecret : effectiveSource === "admin-db" ? admin.clientSecret : "";
  const effectiveMissingFields: string[] = [];
  if (!effectiveClientId) effectiveMissingFields.push("Client ID");
  if (!effectiveClientSecret) effectiveMissingFields.push("Client Secret");

  return {
    resolutionMode: mode,
    effectiveSource,
    selectedReason,
    configured: effectiveMissingFields.length === 0,
    clientId: effectiveClientId,
    clientSecret: effectiveClientSecret,
    callbackUrl: admin.callbackUrl,
    envFields: env.envFields,
    adminConfigured: admin.configured,
    envConfigured: env.configured,
    adminMissingFields: admin.missingFields,
    envMissingFields: env.missingFields,
    effectiveMissingFields,
    conflicts,
  };
}

function hasOAuthMode(platform: SocialPlatform): boolean {
  return platform.type === "oauth" || platform.type === "both";
}

function hasOtpMode(platform: SocialPlatform): boolean {
  return platform.type === "otp" || platform.type === "both";
}

function isOtpActive(platform: SocialPlatform): boolean {
  if (platform.type === "otp") return true;
  if (platform.type === "both") return platform.otpEnabled;
  return false;
}

function resolveSmsEnvAdapter(): OtpAdapterResolution | null {
  const provider = envValue("SMS_PROVIDER").toLowerCase() || "console";

  if (provider === "twilio") {
    const missing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"].filter((name) => !hasEnv(name));
    if (missing.length === 0) {
      return { adapter: "system-sms", requiredFields: [], issues: [] };
    }

    return {
      adapter: "none",
      requiredFields: ["webhookUrl"],
      issues: [`SMS provider is twilio but env is incomplete: ${missing.join(", ")}`],
    };
  }

  if (provider === "custom" || provider === "webhook") {
    if (hasEnv("SMS_WEBHOOK_URL")) {
      return { adapter: "system-sms", requiredFields: [], issues: [] };
    }

    return {
      adapter: "none",
      requiredFields: ["webhookUrl"],
      issues: ["SMS provider is custom/webhook but SMS_WEBHOOK_URL is missing"],
    };
  }

  if (provider === "console") {
    return {
      adapter: "none",
      requiredFields: ["webhookUrl"],
      issues: ["SMS OTP provider is not configured. Set SMS_PROVIDER to twilio, custom, or webhook."],
    };
  }

  return {
    adapter: "none",
    requiredFields: ["webhookUrl"],
    issues: [`Unsupported SMS_PROVIDER value \"${provider}\". Expected twilio, custom, or webhook.`],
  };
}

function resolveEmailEnvAdapter(): OtpAdapterResolution | null {
  const provider = envValue("EMAIL_PROVIDER").toLowerCase() || "console";

  if (provider === "smtp") {
    const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].filter((name) => !hasEnv(name));
    if (missing.length === 0) {
      return { adapter: "system-email", requiredFields: [], issues: [] };
    }

    return {
      adapter: "none",
      requiredFields: [],
      issues: [`Email provider is smtp but env is incomplete: ${missing.join(", ")}`],
    };
  }

  if (provider === "sendgrid") {
    if (hasEnv("SENDGRID_API_KEY")) {
      return { adapter: "system-email", requiredFields: [], issues: [] };
    }

    return {
      adapter: "none",
      requiredFields: [],
      issues: ["Email provider is sendgrid but SENDGRID_API_KEY is missing"],
    };
  }

  if (provider === "console") {
    return {
      adapter: "none",
      requiredFields: [],
      issues: ["Email OTP provider is not configured. Set EMAIL_PROVIDER to smtp or sendgrid."],
    };
  }

  return {
    adapter: "none",
    requiredFields: [],
    issues: [`Unsupported EMAIL_PROVIDER value \"${provider}\". Expected smtp or sendgrid.`],
  };
}

function resolveOtpAdapter(platform: SocialPlatform): OtpAdapterResolution {
  if (platform.name === "whatsapp") {
    return { adapter: "whatsapp", requiredFields: ["accessToken", "phoneNumberId"], issues: [] };
  }

  if (platform.name === "telegram") {
    return { adapter: "telegram", requiredFields: ["botToken"], issues: [] };
  }

  if (platform.name === "sms" || platform.name === "phone") {
    const envAdapter = resolveSmsEnvAdapter();
    if (envAdapter && envAdapter.adapter !== "none") {
      return envAdapter;
    }

    if (hasValue(platform.webhookUrl)) {
      return { adapter: "generic-webhook", requiredFields: ["webhookUrl"], issues: [] };
    }

    return envAdapter ?? {
      adapter: "none",
      requiredFields: ["webhookUrl"],
      issues: ["No OTP adapter configured. Add webhook URL or use supported provider config"],
    };
  }

  if (platform.name === "email") {
    const envAdapter = resolveEmailEnvAdapter();
    if (envAdapter) {
      return envAdapter;
    }
  }

  if (hasValue(platform.webhookUrl)) {
    return { adapter: "generic-webhook", requiredFields: ["webhookUrl"], issues: [] };
  }

  return {
    adapter: "none",
    requiredFields: ["webhookUrl"],
    issues: ["No OTP adapter configured. Add webhook URL or use supported provider config"],
  };
}

export function evaluateSocialPlatformRuntime(platform: SocialPlatform): SocialPlatformRuntimeStatus {
  const capability = getSocialPlatformCapability(platform.name);
  const oauthEnabled = hasOAuthMode(platform);
  const otpEnabled = hasOtpMode(platform) && isOtpActive(platform);
  const oauthFeatureEnabled = isOAuthFeatureEnabled(platform.name);

  const oauthIssues: string[] = [];
  const otpIssues: string[] = [];
  const oauthCredentials = resolveEffectiveOAuthCredentials(platform);
  const oauthCredentialDetails: Omit<ResolvedOAuthCredentials, "clientId" | "clientSecret" | "callbackUrl"> = {
    resolutionMode: oauthCredentials.resolutionMode,
    effectiveSource: oauthCredentials.effectiveSource,
    selectedReason: oauthCredentials.selectedReason,
    configured: oauthCredentials.configured,
    envFields: oauthCredentials.envFields,
    adminConfigured: oauthCredentials.adminConfigured,
    envConfigured: oauthCredentials.envConfigured,
    adminMissingFields: oauthCredentials.adminMissingFields,
    envMissingFields: oauthCredentials.envMissingFields,
    effectiveMissingFields: oauthCredentials.effectiveMissingFields,
    conflicts: oauthCredentials.conflicts,
  };

  const providerRegistered = oauthEnabled ? Boolean(getProvider(platform.name)) : true;
  const oauthConfigured = oauthEnabled ? oauthCredentials.configured : true;

  if (oauthEnabled) {
    if (!capability.oauth) {
      oauthIssues.push(`OAuth mode is not supported for ${platform.name}. ${capability.reason}.`);
    } else {
      if (!oauthFeatureEnabled) {
        oauthIssues.push(`OAuth is disabled by SOCIAL_OAUTH_DISABLED_PROVIDERS for ${platform.name}`);
      }
      if (!providerRegistered) {
        oauthIssues.push("OAuth provider is not registered in backend runtime");
      }
      if (!oauthConfigured) {
        const sourceLabel = oauthCredentials.effectiveSource === "env"
          ? "ENV"
          : oauthCredentials.effectiveSource === "admin-db"
            ? "Admin panel"
            : "ENV and Admin panel";
        const missing = oauthCredentials.effectiveMissingFields.length > 0
          ? oauthCredentials.effectiveMissingFields.join(", ")
          : "Client ID, Client Secret";
        oauthIssues.push(`Missing OAuth credentials from ${sourceLabel}: ${missing}`);
      }
    }
  }

  const otpAdapterInfo = otpEnabled && capability.otp
    ? resolveOtpAdapter(platform)
    : {
      adapter: "none" as OtpAdapter,
      requiredFields: [] as Array<keyof SocialPlatform>,
      issues: capability.otp
        ? []
        : [`OTP mode is not supported for ${platform.name}. ${capability.reason}.`],
    };

  const otpRequiredFields = otpEnabled ? otpAdapterInfo.requiredFields : [];
  const otpAdapterConfigured = !otpEnabled
    ? true
    : otpRequiredFields.every((field) => hasValue(platform[field]));

  if (otpEnabled) {
    if (!capability.otp) {
      otpIssues.push(`OTP mode is not supported for ${platform.name}. ${capability.reason}.`);
    }
    otpIssues.push(...otpAdapterInfo.issues);

    for (const field of otpRequiredFields) {
      if (!hasValue(platform[field])) {
        otpIssues.push(`Missing ${String(field)}`);
      }
    }
  }

  const oauthReady = !oauthEnabled || (capability.oauth && oauthFeatureEnabled && providerRegistered && oauthConfigured);
  const otpReady = !otpEnabled || (capability.otp && otpAdapterInfo.adapter !== "none" && otpAdapterConfigured);
  const runtimeReady = oauthReady && otpReady;

  return {
    capability,
    oauth: {
      enabled: oauthEnabled,
      ready: oauthReady,
      issues: oauthIssues,
      featureFlagEnabled: oauthFeatureEnabled,
      providerRegistered,
      configured: oauthConfigured,
      credentials: oauthCredentialDetails,
    },
    otp: {
      enabled: otpEnabled,
      ready: otpReady,
      issues: otpIssues,
      adapter: otpAdapterInfo.adapter,
      adapterConfigured: otpAdapterConfigured,
      requiredFields: otpRequiredFields.map((field) => String(field)),
    },
    conflicts: oauthCredentialDetails.conflicts,
    runtimeReady,
    oauthLoginEnabled: platform.isEnabled && oauthEnabled && oauthReady,
  };
}
