export type SocialProviderAuthType = "oauth" | "otp" | "both";

export type SocialProviderName =
    | "google"
    | "facebook"
    | "telegram"
    | "whatsapp"
    | "twitter"
    | "apple"
    | "discord"
    | "linkedin"
    | "github"
    | "tiktok"
    | "instagram"
    | "sms"
    | "phone"
    | "email";

export type SocialProviderCapability = "oauth-only" | "otp-only" | "hybrid";

export type GoogleAndroidLoginMode = "sdk-only" | "browser-oauth";

export interface SocialOAuthEnvMapping {
    clientId: string;
    clientSecret: string;
}

export interface SocialOAuthProviderDefinition {
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
    supportsPKCE?: boolean;
    credentialsInBody?: boolean;
    tokenHeaders?: Record<string, string>;
    defaultAuthorizationParams?: Record<string, string>;
    popupAuthorizationParams?: Record<string, string>;
    callbackResponseMode?: "query" | "form_post";
    supportsRefreshToken?: boolean;
}

export interface SocialProviderDefinition {
    name: SocialProviderName;
    displayName: string;
    displayNameAr: string;
    icon: string;
    type: SocialProviderAuthType;
    sortOrder: number;
    isEnabledByDefault: boolean;
    capability: SocialProviderCapability;
    oauth?: SocialOAuthProviderDefinition;
    oauthEnv?: SocialOAuthEnvMapping;
    otpAdapter?: "whatsapp" | "telegram" | "generic-webhook" | "system-email" | "system-sms" | "none";
    mobile?: {
        googleAndroidLoginMode?: GoogleAndroidLoginMode;
    };
}

export const SOCIAL_PROVIDER_DEFINITIONS: ReadonlyArray<SocialProviderDefinition> = [
    {
        name: "google",
        displayName: "Google",
        displayNameAr: "جوجل",
        icon: "SiGoogle",
        type: "oauth",
        sortOrder: 1,
        isEnabledByDefault: true,
        capability: "oauth-only",
        oauthEnv: { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET" },
        mobile: { googleAndroidLoginMode: "sdk-only" },
        oauth: {
            authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenUrl: "https://oauth2.googleapis.com/token",
            userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
            scopes: ["openid", "email", "profile"],
            supportsPKCE: true,
            credentialsInBody: true,
            supportsRefreshToken: true,
            defaultAuthorizationParams: {
                prompt: "select_account",
                include_granted_scopes: "true",
            },
        },
    },
    {
        name: "facebook",
        displayName: "Facebook",
        displayNameAr: "فيسبوك",
        icon: "SiFacebook",
        type: "oauth",
        sortOrder: 2,
        isEnabledByDefault: true,
        capability: "oauth-only",
        oauthEnv: { clientId: "FACEBOOK_APP_ID", clientSecret: "FACEBOOK_APP_SECRET" },
        oauth: {
            authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
            tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
            userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email,picture.type(large)",
            scopes: ["email", "public_profile"],
            supportsPKCE: false,
            credentialsInBody: true,
            popupAuthorizationParams: {
                display: "popup",
            },
        },
    },
    {
        name: "telegram",
        displayName: "Telegram",
        displayNameAr: "تيليجرام",
        icon: "SiTelegram",
        type: "both",
        sortOrder: 3,
        isEnabledByDefault: true,
        capability: "otp-only",
        otpAdapter: "telegram",
    },
    {
        name: "whatsapp",
        displayName: "WhatsApp",
        displayNameAr: "واتساب",
        icon: "SiWhatsapp",
        type: "otp",
        sortOrder: 4,
        isEnabledByDefault: true,
        capability: "otp-only",
        otpAdapter: "whatsapp",
    },
    {
        name: "twitter",
        displayName: "X (Twitter)",
        displayNameAr: "إكس (تويتر)",
        icon: "SiX",
        type: "oauth",
        sortOrder: 5,
        isEnabledByDefault: true,
        capability: "oauth-only",
        oauthEnv: { clientId: "TWITTER_API_KEY", clientSecret: "TWITTER_API_SECRET" },
        oauth: {
            authorizationUrl: "https://twitter.com/i/oauth2/authorize",
            tokenUrl: "https://api.twitter.com/2/oauth2/token",
            userInfoUrl: "https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username",
            scopes: ["users.read", "tweet.read"],
            supportsPKCE: true,
            credentialsInBody: false,
            supportsRefreshToken: true,
        },
    },
    {
        name: "apple",
        displayName: "Apple",
        displayNameAr: "آبل",
        icon: "SiApple",
        type: "oauth",
        sortOrder: 6,
        isEnabledByDefault: true,
        capability: "oauth-only",
        oauthEnv: { clientId: "APPLE_CLIENT_ID", clientSecret: "APPLE_CLIENT_SECRET" },
        oauth: {
            authorizationUrl: "https://appleid.apple.com/auth/authorize",
            tokenUrl: "https://appleid.apple.com/auth/token",
            userInfoUrl: "",
            scopes: ["name", "email"],
            supportsPKCE: true,
            credentialsInBody: true,
            callbackResponseMode: "form_post",
            defaultAuthorizationParams: {
                response_mode: "form_post",
            },
        },
    },
    {
        name: "discord",
        displayName: "Discord",
        displayNameAr: "ديسكورد",
        icon: "SiDiscord",
        type: "oauth",
        sortOrder: 7,
        isEnabledByDefault: false,
        capability: "oauth-only",
        oauthEnv: { clientId: "DISCORD_CLIENT_ID", clientSecret: "DISCORD_CLIENT_SECRET" },
        oauth: {
            authorizationUrl: "https://discord.com/oauth2/authorize",
            tokenUrl: "https://discord.com/api/oauth2/token",
            userInfoUrl: "https://discord.com/api/users/@me",
            scopes: ["identify", "email"],
            supportsPKCE: false,
            credentialsInBody: true,
        },
    },
    {
        name: "linkedin",
        displayName: "LinkedIn",
        displayNameAr: "لينكدإن",
        icon: "SiLinkedin",
        type: "oauth",
        sortOrder: 8,
        isEnabledByDefault: false,
        capability: "oauth-only",
        oauthEnv: { clientId: "LINKEDIN_CLIENT_ID", clientSecret: "LINKEDIN_CLIENT_SECRET" },
        oauth: {
            authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
            tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
            userInfoUrl: "https://api.linkedin.com/v2/userinfo",
            scopes: ["openid", "profile", "email"],
            supportsPKCE: false,
            credentialsInBody: true,
        },
    },
    {
        name: "github",
        displayName: "GitHub",
        displayNameAr: "جيت هاب",
        icon: "SiGithub",
        type: "oauth",
        sortOrder: 9,
        isEnabledByDefault: false,
        capability: "oauth-only",
        oauthEnv: { clientId: "GITHUB_CLIENT_ID", clientSecret: "GITHUB_CLIENT_SECRET" },
        oauth: {
            authorizationUrl: "https://github.com/login/oauth/authorize",
            tokenUrl: "https://github.com/login/oauth/access_token",
            userInfoUrl: "https://api.github.com/user",
            scopes: ["read:user", "user:email"],
            supportsPKCE: false,
            credentialsInBody: true,
            tokenHeaders: { Accept: "application/json" },
            defaultAuthorizationParams: {
                allow_signup: "true",
            },
        },
    },
    {
        name: "tiktok",
        displayName: "TikTok",
        displayNameAr: "تيك توك",
        icon: "SiTiktok",
        type: "oauth",
        sortOrder: 10,
        isEnabledByDefault: false,
        capability: "oauth-only",
    },
    {
        name: "instagram",
        displayName: "Instagram",
        displayNameAr: "إنستجرام",
        icon: "SiInstagram",
        type: "oauth",
        sortOrder: 11,
        isEnabledByDefault: false,
        capability: "oauth-only",
    },
    {
        name: "sms",
        displayName: "SMS",
        displayNameAr: "رسائل SMS",
        icon: "Phone",
        type: "otp",
        sortOrder: 12,
        isEnabledByDefault: false,
        capability: "otp-only",
        otpAdapter: "system-sms",
    },
    {
        name: "phone",
        displayName: "Phone",
        displayNameAr: "هاتف",
        icon: "Phone",
        type: "otp",
        sortOrder: 13,
        isEnabledByDefault: false,
        capability: "otp-only",
        otpAdapter: "system-sms",
    },
    {
        name: "email",
        displayName: "Email",
        displayNameAr: "البريد الإلكتروني",
        icon: "Mail",
        type: "otp",
        sortOrder: 14,
        isEnabledByDefault: false,
        capability: "otp-only",
        otpAdapter: "system-email",
    },
] as const;

const socialProviderByName = new Map<string, SocialProviderDefinition>(
    SOCIAL_PROVIDER_DEFINITIONS.map((provider) => [provider.name, provider]),
);

export function getSocialProviderDefinition(name: string): SocialProviderDefinition | undefined {
    return socialProviderByName.get(name.trim().toLowerCase());
}

export function listSocialProviderDefinitions(): ReadonlyArray<SocialProviderDefinition> {
    return SOCIAL_PROVIDER_DEFINITIONS;
}

export function listOAuthProviderDefinitions(): ReadonlyArray<SocialProviderDefinition> {
    return SOCIAL_PROVIDER_DEFINITIONS.filter((provider) => Boolean(provider.oauth));
}

export function getOAuthEnvMapping(name: string): SocialOAuthEnvMapping | undefined {
    return getSocialProviderDefinition(name)?.oauthEnv;
}

export function getCapabilityReason(name: string): string | undefined {
    const provider = getSocialProviderDefinition(name);
    if (!provider) {
        return undefined;
    }

    if (provider.capability === "oauth-only") {
        return `${provider.displayName} currently supports OAuth login only in runtime`;
    }

    if (provider.capability === "otp-only") {
        return `${provider.displayName} platform is OTP only`;
    }

    return "Custom platform can support both OAuth and OTP when configured";
}

export function getSeedSocialPlatforms(): Array<{
    name: string;
    displayName: string;
    displayNameAr: string;
    icon: string;
    type: SocialProviderAuthType;
    sortOrder: number;
    isEnabled: boolean;
}> {
    return SOCIAL_PROVIDER_DEFINITIONS
        .filter((provider) => provider.name !== "phone" && provider.name !== "email")
        .map((provider) => ({
            name: provider.name,
            displayName: provider.displayName,
            displayNameAr: provider.displayNameAr,
            icon: provider.icon,
            type: provider.type,
            sortOrder: provider.sortOrder,
            isEnabled: provider.isEnabledByDefault,
        }));
}

export function resolveGoogleAndroidLoginMode(): GoogleAndroidLoginMode {
    const explicitMode = typeof process.env.GOOGLE_ANDROID_LOGIN_MODE === "string"
        ? process.env.GOOGLE_ANDROID_LOGIN_MODE.trim().toLowerCase()
        : "";

    if (explicitMode === "browser-oauth") {
        return "browser-oauth";
    }

    if (explicitMode === "sdk-only") {
        return "sdk-only";
    }

    return getSocialProviderDefinition("google")?.mobile?.googleAndroidLoginMode || "sdk-only";
}
