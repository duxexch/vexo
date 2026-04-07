import type { SocialPlatform } from "@shared/schema";
import { getProvider } from "./oauth-engine";
import "./oauth-providers";

type OtpAdapter = "whatsapp" | "telegram" | "generic-webhook" | "none";

type RuntimeModeStatus = {
  enabled: boolean;
  ready: boolean;
  issues: string[];
};

export interface SocialPlatformRuntimeStatus {
  oauth: RuntimeModeStatus & {
    providerRegistered: boolean;
    configured: boolean;
  };
  otp: RuntimeModeStatus & {
    adapter: OtpAdapter;
    adapterConfigured: boolean;
    requiredFields: string[];
  };
  runtimeReady: boolean;
  oauthLoginEnabled: boolean;
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
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

function resolveOtpAdapter(platform: SocialPlatform): { adapter: OtpAdapter; requiredFields: Array<keyof SocialPlatform> } {
  if (platform.name === "whatsapp") {
    return { adapter: "whatsapp", requiredFields: ["accessToken", "phoneNumberId"] };
  }

  if (platform.name === "telegram") {
    return { adapter: "telegram", requiredFields: ["botToken"] };
  }

  if (hasValue(platform.webhookUrl)) {
    return { adapter: "generic-webhook", requiredFields: ["webhookUrl"] };
  }

  return { adapter: "none", requiredFields: ["webhookUrl"] };
}

export function evaluateSocialPlatformRuntime(platform: SocialPlatform): SocialPlatformRuntimeStatus {
  const oauthEnabled = hasOAuthMode(platform);
  const otpEnabled = hasOtpMode(platform) && isOtpActive(platform);

  const oauthIssues: string[] = [];
  const otpIssues: string[] = [];

  const providerRegistered = oauthEnabled ? Boolean(getProvider(platform.name)) : true;
  const oauthConfigured = oauthEnabled ? hasValue(platform.clientId) && hasValue(platform.clientSecret) : true;

  if (oauthEnabled) {
    if (!providerRegistered) {
      oauthIssues.push("OAuth provider is not registered in backend runtime");
    }
    if (!hasValue(platform.clientId)) {
      oauthIssues.push("Missing Client ID");
    }
    if (!hasValue(platform.clientSecret)) {
      oauthIssues.push("Missing Client Secret");
    }
  }

  const otpAdapterInfo = resolveOtpAdapter(platform);
  const otpAdapterConfigured = !otpEnabled
    ? true
    : otpAdapterInfo.requiredFields.every((field) => hasValue(platform[field]));

  if (otpEnabled) {
    if (otpAdapterInfo.adapter === "none") {
      otpIssues.push("No OTP adapter configured. Add webhook URL or use supported provider config");
    }

    for (const field of otpAdapterInfo.requiredFields) {
      if (!hasValue(platform[field])) {
        otpIssues.push(`Missing ${String(field)}`);
      }
    }
  }

  const oauthReady = !oauthEnabled || (providerRegistered && oauthConfigured);
  const otpReady = !otpEnabled || (otpAdapterInfo.adapter !== "none" && otpAdapterConfigured);
  const runtimeReady = oauthReady && otpReady;

  return {
    oauth: {
      enabled: oauthEnabled,
      ready: oauthReady,
      issues: oauthIssues,
      providerRegistered,
      configured: oauthConfigured,
    },
    otp: {
      enabled: otpEnabled,
      ready: otpReady,
      issues: otpIssues,
      adapter: otpAdapterInfo.adapter,
      adapterConfigured: otpAdapterConfigured,
      requiredFields: otpAdapterInfo.requiredFields.map((field) => String(field)),
    },
    runtimeReady,
    oauthLoginEnabled: platform.isEnabled && oauthEnabled && oauthReady,
  };
}
