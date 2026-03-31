/**
 * OAuth Provider Definitions — Google, Facebook, Apple, X/Twitter, Discord
 * Each provider registers itself with the OAuth engine
 */
import { registerProvider, type NormalizedProfile } from "./oauth-engine";

// ==================== Google OAuth 2.0 ====================
registerProvider(
  {
    name: "google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
    supportsPKCE: true,
    credentialsInBody: true,
  },
  (data: Record<string, unknown>): NormalizedProfile => ({
    id: String(data.id || data.sub || ""),
    email: data.email as string | undefined,
    displayName: (data.name || data.given_name) as string | undefined,
    avatar: data.picture as string | undefined,
    raw: data,
  }),
);

// ==================== Facebook OAuth 2.0 ====================
registerProvider(
  {
    name: "facebook",
    authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email,picture.type(large)",
    scopes: ["email", "public_profile"],
    supportsPKCE: false,
    credentialsInBody: true,
  },
  (data: Record<string, unknown>): NormalizedProfile => ({
    id: String(data.id || ""),
    email: data.email as string | undefined,
    displayName: data.name as string | undefined,
    avatar: ((data.picture as Record<string, unknown>)?.data as Record<string, unknown>)?.url as string | undefined,
    raw: data,
  }),
);

// ==================== Apple Sign-in ====================
registerProvider(
  {
    name: "apple",
    authorizationUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    userInfoUrl: "", // Apple doesn't have userinfo — data comes from id_token
    scopes: ["name", "email"],
    supportsPKCE: true,
    credentialsInBody: true,
  },
  (data: Record<string, unknown>): NormalizedProfile => {
    // Apple profile comes from id_token claims, not userinfo endpoint
    const nameObj = data.name as Record<string, unknown> | undefined;
    return {
      id: String(data.sub || data.id || ""),
      email: data.email as string | undefined,
      displayName: nameObj
        ? `${(nameObj.firstName as string) || ""} ${(nameObj.lastName as string) || ""}`.trim()
        : undefined,
      avatar: undefined, // Apple doesn't provide avatar
      raw: data,
    };
  },
);

// ==================== X (Twitter) OAuth 2.0 ====================
registerProvider(
  {
    name: "twitter",
    authorizationUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    userInfoUrl: "https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username",
    scopes: ["users.read", "tweet.read"],
    supportsPKCE: true,
    credentialsInBody: false, // Twitter uses Basic Auth for token exchange
  },
  (data: Record<string, unknown>): NormalizedProfile => {
    const user = (data.data || data) as Record<string, unknown>;
    return {
      id: String(user.id || ""),
      email: undefined, // Twitter doesn't provide email via this scope
      displayName: (user.name || user.username) as string | undefined,
      avatar: ((user.profile_image_url as string) || "").replace("_normal", "") || undefined,
      raw: data,
    };
  },
);

// ==================== Discord OAuth 2.0 ====================
registerProvider(
  {
    name: "discord",
    authorizationUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
    supportsPKCE: false,
    credentialsInBody: true,
  },
  (data: Record<string, unknown>): NormalizedProfile => ({
    id: String(data.id || ""),
    email: data.email as string | undefined,
    displayName: (data.global_name || data.username) as string | undefined,
    avatar: data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
      : undefined,
    raw: data,
  }),
);

// ==================== GitHub OAuth 2.0 ====================
registerProvider(
  {
    name: "github",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
    supportsPKCE: false,
    credentialsInBody: true,
    tokenHeaders: { Accept: "application/json" },
  },
  (data: Record<string, unknown>): NormalizedProfile => ({
    id: String(data.id || ""),
    email: data.email as string | undefined,
    displayName: (data.name || data.login) as string | undefined,
    avatar: data.avatar_url as string | undefined,
    raw: data,
  }),
);

// ==================== LinkedIn OAuth 2.0 ====================
registerProvider(
  {
    name: "linkedin",
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scopes: ["openid", "profile", "email"],
    supportsPKCE: false,
    credentialsInBody: true,
  },
  (data: Record<string, unknown>): NormalizedProfile => ({
    id: String(data.sub || data.id || ""),
    email: data.email as string | undefined,
    displayName: (data.name as string) || `${(data.given_name as string) || ""} ${(data.family_name as string) || ""}`.trim() || undefined,
    avatar: data.picture as string | undefined,
    raw: data,
  }),
);
