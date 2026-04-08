import type { SocialPlatform } from "@shared/schema";
import { getProvider } from "./oauth-engine";
import "./oauth-providers";

type OtpAdapter = "whatsapp" | "telegram" | "generic-webhook" | "system-email" | "system-sms" | "none";

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

function envValue(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasEnv(name: string): boolean {
  return envValue(name).length > 0;
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

  if (provider === "custom") {
    if (hasEnv("SMS_WEBHOOK_URL")) {
      return { adapter: "system-sms", requiredFields: [], issues: [] };
    }

    return {
      adapter: "none",
      requiredFields: ["webhookUrl"],
      issues: ["SMS provider is custom but SMS_WEBHOOK_URL is missing"],
    };
  }

  if (provider === "console") {
    return {
      adapter: "none",
      requiredFields: ["webhookUrl"],
      issues: ["SMS OTP provider is not configured. Set SMS_PROVIDER to twilio or custom."],
    };
  }

  return {
    adapter: "none",
    requiredFields: ["webhookUrl"],
    issues: [`Unsupported SMS_PROVIDER value \"${provider}\". Expected twilio or custom.`],
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
  const otpRequiredFields = otpEnabled ? otpAdapterInfo.requiredFields : [];
  const otpAdapterConfigured = !otpEnabled
    ? true
    : otpRequiredFields.every((field) => hasValue(platform[field]));

  if (otpEnabled) {
    otpIssues.push(...otpAdapterInfo.issues);

    for (const field of otpRequiredFields) {
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
      requiredFields: otpRequiredFields.map((field) => String(field)),
    },
    runtimeReady,
    oauthLoginEnabled: platform.isEnabled && oauthEnabled && oauthReady,
  };
}
