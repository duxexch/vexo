/**
 * OAuth Flow — Handles social login initiation and callback
 */
import { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../../storage";
import { logger } from "../../lib/logger";
import {
  createOAuthState,
  verifyAndConsumeState,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserProfile,
  findOrCreateUser,
} from "../../lib/oauth-engine";
// Register all providers on import
import "../../lib/oauth-providers";
import { authRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { getErrorMessage } from "../helpers";
import { createSession, getSessionFingerprint, setAuthCookie } from "../auth/helpers";
import {
  evaluateSocialPlatformRuntime,
  resolveEffectiveOAuthCredentials,
} from "../../lib/social-platform-runtime";
import {
  getSocialProviderDefinition,
  resolveGoogleAndroidLoginMode,
} from "@shared/social-providers.config";

interface OAuthExchangeRecord {
  userId: string;
  redirect: string;
  isNew: boolean;
  expiresAt: number;
  userAgent?: string;
  clientBindingHash?: string;
}

interface OAuthInitiationRecord {
  authUrl: string;
  state: string;
  expiresAt: number;
}

interface OAuthStateReplayRecord {
  redirectPath: string;
  userAgent?: string;
  expiresAt: number;
}

interface OAuthStatePopupHintRecord {
  isPopup: boolean;
  expiresAt: number;
}

function classifyUserAgent(userAgent?: string): "android" | "ios" | "windows" | "macos" | "linux" | "unknown" {
  if (!userAgent) return "unknown";

  const normalized = userAgent.toLowerCase();
  if (normalized.includes("android")) return "android";
  if (normalized.includes("iphone") || normalized.includes("ipad") || normalized.includes("ios")) return "ios";
  if (normalized.includes("windows")) return "windows";
  if (normalized.includes("mac os x") || normalized.includes("macintosh")) return "macos";
  if (normalized.includes("linux")) return "linux";
  return "unknown";
}

function normalizeIpAddress(ip?: string): string {
  if (!ip) {
    return "unknown";
  }

  const trimmed = ip.trim();
  if (!trimmed) {
    return "unknown";
  }

  return trimmed.replace(/^::ffff:/, "");
}

function toIpPrefix(ip: string): string {
  if (!ip || ip === "unknown") {
    return "unknown";
  }

  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }
  }

  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":");
  }

  return ip;
}

function buildOAuthClientBinding(req: Request, sessionFingerprint: string): string {
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";
  const userAgentClass = classifyUserAgent(userAgent);
  const ipPrefix = toIpPrefix(normalizeIpAddress(req.ip));
  const language = typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : "";
  const host = typeof req.headers.host === "string" ? req.headers.host : "";

  const raw = `${sessionFingerprint}:${userAgentClass}:${ipPrefix}:${language}:${host}`;
  return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 48);
}

function logOAuthSecurityEvent(req: Request, platform: string, event: string, metadata?: Record<string, unknown>) {
  logger.warn(`[OAuth] ${event}`, {
    platform,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    path: req.path,
    ...(metadata || {}),
  });
}

function logOAuthRuntimeEvent(req: Request, platform: string, event: string, metadata?: Record<string, unknown>) {
  logger.warn(`[OAuth Trace] ${event}`, {
    platform,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    path: req.path,
    ...(metadata || {}),
  });
}

const oauthExchangeStore = new Map<string, OAuthExchangeRecord>();
const oauthInitiationStore = new Map<string, OAuthInitiationRecord>();
const oauthInitiationStateToKey = new Map<string, string>();
const oauthStateReplayStore = new Map<string, OAuthStateReplayRecord>();
const oauthStatePopupHintStore = new Map<string, OAuthStatePopupHintRecord>();

function buildOAuthInitiationKey(req: Request, platform: string): string {
  const ip = req.ip || "unknown";
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "unknown";
  const rawKey = `${platform}:${ip}:${ua}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex").substring(0, 24);
}

function isUserAgentCompatible(recordUserAgent?: string, requestUserAgent?: string): boolean {
  if (!recordUserAgent || !requestUserAgent) {
    return true;
  }

  const exactMatch = recordUserAgent === requestUserAgent;
  const sourceClass = classifyUserAgent(recordUserAgent);
  const targetClass = classifyUserAgent(requestUserAgent);
  const samePlatformClass = sourceClass !== "unknown" && sourceClass === targetClass;

  // Allow native app flows where callback and exchange may run in different browser engines.
  return exactMatch || samePlatformClass;
}

function getReusableOAuthInitiationUrl(req: Request, platform: string): string | null {
  const key = buildOAuthInitiationKey(req, platform);
  const record = oauthInitiationStore.get(key);

  if (!record) {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    oauthInitiationStore.delete(key);
    oauthInitiationStateToKey.delete(record.state);
    return null;
  }

  return record.authUrl;
}

function rememberOAuthInitiation(req: Request, platform: string, state: string, authUrl: string) {
  const key = buildOAuthInitiationKey(req, platform);
  const expiresAt = Date.now() + 45_000;
  oauthInitiationStore.set(key, { authUrl, state, expiresAt });
  oauthInitiationStateToKey.set(state, key);
}

function clearOAuthInitiationByState(state: string | undefined) {
  if (!state) {
    return;
  }

  const key = oauthInitiationStateToKey.get(state);
  if (!key) {
    return;
  }

  oauthInitiationStore.delete(key);
  oauthInitiationStateToKey.delete(state);
}

function getOAuthStateReplayRedirect(state: string, userAgent?: string): string | null {
  const record = oauthStateReplayStore.get(state);
  if (!record) {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    oauthStateReplayStore.delete(state);
    return null;
  }

  if (!isUserAgentCompatible(record.userAgent, userAgent)) {
    return null;
  }

  return record.redirectPath;
}

function rememberOAuthStateReplay(state: string, redirectPath: string, userAgent?: string) {
  oauthStateReplayStore.set(state, {
    redirectPath,
    userAgent,
    expiresAt: Date.now() + 2 * 60 * 1000,
  });
}

function rememberOAuthStatePopupHint(state: string, isPopup: boolean) {
  oauthStatePopupHintStore.set(state, {
    isPopup,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

function consumeOAuthStatePopupHint(state: string): boolean {
  const record = oauthStatePopupHintStore.get(state);
  if (!record) {
    return false;
  }

  oauthStatePopupHintStore.delete(state);
  if (record.expiresAt <= Date.now()) {
    return false;
  }

  return record.isPopup;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, record] of oauthExchangeStore.entries()) {
    if (record.expiresAt <= now) {
      oauthExchangeStore.delete(code);
    }
  }

  for (const [key, record] of oauthInitiationStore.entries()) {
    if (record.expiresAt <= now) {
      oauthInitiationStore.delete(key);
      oauthInitiationStateToKey.delete(record.state);
    }
  }

  for (const [state, record] of oauthStateReplayStore.entries()) {
    if (record.expiresAt <= now) {
      oauthStateReplayStore.delete(state);
    }
  }

  for (const [state, record] of oauthStatePopupHintStore.entries()) {
    if (record.expiresAt <= now) {
      oauthStatePopupHintStore.delete(state);
    }
  }
}, 60_000);

function createOAuthExchangeCode(record: Omit<OAuthExchangeRecord, "expiresAt">): string {
  const code = crypto.randomBytes(32).toString("hex");
  oauthExchangeStore.set(code, {
    ...record,
    expiresAt: Date.now() + 2 * 60 * 1000,
  });
  return code;
}

function consumeOAuthExchangeCode(code: string, userAgent?: string, clientBindingHash?: string): OAuthExchangeRecord | null {
  const record = oauthExchangeStore.get(code);
  if (!record) {
    return null;
  }

  oauthExchangeStore.delete(code);
  if (record.expiresAt <= Date.now()) {
    return null;
  }

  // Exchange codes are strictly single-use and bound to the initiating client context.
  if (record.userAgent && userAgent && record.userAgent !== userAgent) {
    return null;
  }

  if (record.clientBindingHash && clientBindingHash && record.clientBindingHash !== clientBindingHash) {
    return null;
  }

  return record;
}

// Decode Apple id_token for profile data
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function sanitizePostLoginRedirect(redirect?: string): string | undefined {
  if (!redirect) return undefined;

  const trimmed = redirect.trim();
  if (!trimmed || trimmed.length > 2048) {
    return undefined;
  }

  // Accept only same-origin relative paths.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return undefined;
  }

  if (/[\r\n]/.test(trimmed)) {
    return undefined;
  }

  try {
    const normalized = new URL(trimmed, "https://vixo.click");
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return undefined;
  }
}

const DEFAULT_GOOGLE_SCOPES = ["openid", "email", "profile"] as const;

function resolveGoogleNativeScope(): string {
  const rawScopes = typeof process.env.GOOGLE_SCOPES === "string"
    ? process.env.GOOGLE_SCOPES
    : "";

  const providedScopes = rawScopes
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  const merged = new Set<string>([...DEFAULT_GOOGLE_SCOPES, ...providedScopes]);
  return Array.from(merged).join(" ");
}

function normalizeGoogleScope(scope: string): string {
  const normalized = scope.trim().toLowerCase();

  if (normalized === "https://www.googleapis.com/auth/userinfo.email") {
    return "email";
  }

  if (normalized === "https://www.googleapis.com/auth/userinfo.profile") {
    return "profile";
  }

  return normalized;
}

function resolveGoogleNativeClientId(fallbackClientId?: string): string {
  const androidClientId = typeof process.env.GOOGLE_ANDROID_CLIENT_ID === "string"
    ? process.env.GOOGLE_ANDROID_CLIENT_ID.trim()
    : "";
  const androidAliasClientId = typeof process.env.GOOGLE_CLIENT_ID_ANDROID === "string"
    ? process.env.GOOGLE_CLIENT_ID_ANDROID.trim()
    : "";
  const fallback = typeof fallbackClientId === "string"
    ? fallbackClientId.trim()
    : "";

  // Capgo/Google Android SDK expects the server (web) OAuth client id here.
  if (fallback) {
    return fallback;
  }

  if (androidClientId) {
    return androidClientId;
  }

  if (androidAliasClientId) {
    return androidAliasClientId;
  }

  if (isTruthyEnvFlag(process.env.GOOGLE_ANDROID_ALLOW_WEB_CLIENT_FALLBACK)) {
    return fallback;
  }

  return "";
}

function resolveGoogleAllowedAudiences(fallbackClientId?: string): string[] {
  const audienceSet = new Set<string>();
  const maybeAdd = (value?: string) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (normalized.length > 0) {
      audienceSet.add(normalized);
    }
  };

  maybeAdd(process.env.GOOGLE_ANDROID_CLIENT_ID);
  maybeAdd(process.env.GOOGLE_CLIENT_ID_ANDROID);
  maybeAdd(process.env.GOOGLE_CLIENT_ID);
  maybeAdd(fallbackClientId);

  const extraAudiences = typeof process.env.GOOGLE_ALLOWED_AUDIENCES === "string"
    ? process.env.GOOGLE_ALLOWED_AUDIENCES
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    : [];
  for (const audience of extraAudiences) {
    maybeAdd(audience);
  }

  return Array.from(audienceSet);
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldRequestGoogleOfflineAccess(): boolean {
  if (isTruthyEnvFlag(process.env.GOOGLE_REQUEST_OFFLINE_ACCESS)) {
    return true;
  }

  const strategy = typeof process.env.OAUTH_REFRESH_TOKEN_STRATEGY === "string"
    ? process.env.OAUTH_REFRESH_TOKEN_STRATEGY.trim().toLowerCase()
    : "";

  return strategy === "always" || strategy === "google";
}

function buildProviderAuthorizationParams(
  platform: string,
  isPopupRequest: boolean,
  forceConsent: boolean,
): Record<string, string> {
  const normalizedPlatform = platform.trim().toLowerCase();
  const providerDefinition = getSocialProviderDefinition(normalizedPlatform);
  const params: Record<string, string> = {
    ...(providerDefinition?.oauth?.defaultAuthorizationParams || {}),
  };

  if (isPopupRequest && providerDefinition?.oauth?.popupAuthorizationParams) {
    Object.assign(params, providerDefinition.oauth.popupAuthorizationParams);
  }

  if (normalizedPlatform === "google") {
    if (shouldRequestGoogleOfflineAccess()) {
      params.access_type = "offline";
    }

    // When social login fails بسبب نقص صلاحيات/توكن, force a real Google consent screen.
    if (forceConsent) {
      params.include_granted_scopes = "true";
    }

    if (shouldRequestGoogleOfflineAccess() || forceConsent) {
      const promptTokens = new Set(
        (params.prompt || "select_account")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 0),
      );
      promptTokens.add("consent");
      promptTokens.add("select_account");
      params.prompt = Array.from(promptTokens).join(" ");
    }
  }

  return params;
}

async function validateGoogleNativeAccessToken(
  accessToken: string,
  allowedAudiences: string[],
  requiredScope: string,
): Promise<{ ok: boolean; reason?: string; details?: Record<string, unknown> }> {
  if (!allowedAudiences.length) {
    return { ok: true };
  }

  const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  if (!tokenInfoResponse.ok) {
    return {
      ok: false,
      reason: "tokeninfo_unavailable",
      details: { status: tokenInfoResponse.status },
    };
  }

  const tokenInfo = await tokenInfoResponse.json() as {
    audience?: string;
    issued_to?: string;
    aud?: string;
    scope?: string;
  };

  const audience = [tokenInfo.audience, tokenInfo.issued_to, tokenInfo.aud]
    .find((value) => typeof value === "string" && value.trim().length > 0)
    ?.trim();

  if (!audience) {
    return {
      ok: false,
      reason: "tokeninfo_missing_audience",
    };
  }

  if (!allowedAudiences.includes(audience)) {
    return {
      ok: false,
      reason: "token_audience_mismatch",
      details: {
        audience,
        allowedAudiences,
      },
    };
  }

  const requiredScopes = new Set(
    requiredScope
      .split(/[\s,]+/)
      .map((scope) => normalizeGoogleScope(scope))
      .filter((scope) => scope.length > 0),
  );

  const grantedScopes = new Set(
    (typeof tokenInfo.scope === "string" ? tokenInfo.scope : "")
      .split(/[\s,]+/)
      .map((scope) => normalizeGoogleScope(scope))
      .filter((scope) => scope.length > 0),
  );

  const missingScopes = Array.from(requiredScopes).filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length > 0) {
    return {
      ok: false,
      reason: "token_scope_mismatch",
      details: {
        missingScopes,
        grantedScopes: Array.from(grantedScopes),
      },
    };
  }

  return { ok: true };
}

async function validateGoogleNativeIdToken(
  idToken: string,
  allowedAudiences: string[],
): Promise<{
  ok: boolean;
  reason?: string;
  details?: Record<string, unknown>;
  profile?: Record<string, unknown>;
}> {
  if (!allowedAudiences.length) {
    return {
      ok: false,
      reason: "id_token_missing_allowed_audience",
    };
  }

  const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!tokenInfoResponse.ok) {
    return {
      ok: false,
      reason: "id_tokeninfo_unavailable",
      details: { status: tokenInfoResponse.status },
    };
  }

  const tokenInfo = await tokenInfoResponse.json() as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
  };

  const audience = typeof tokenInfo.aud === "string" ? tokenInfo.aud.trim() : "";
  if (!audience) {
    return {
      ok: false,
      reason: "id_token_missing_audience",
    };
  }

  if (!allowedAudiences.includes(audience)) {
    return {
      ok: false,
      reason: "id_token_audience_mismatch",
      details: {
        audience,
        allowedAudiences,
      },
    };
  }

  const providerUserId = typeof tokenInfo.sub === "string" ? tokenInfo.sub.trim() : "";
  if (!providerUserId) {
    return {
      ok: false,
      reason: "id_token_missing_subject",
    };
  }

  return {
    ok: true,
    profile: {
      id: providerUserId,
      sub: providerUserId,
      email: tokenInfo.email,
      verified_email: tokenInfo.email_verified === "true",
      name: tokenInfo.name,
      picture: tokenInfo.picture,
    },
  };
}

export function registerOAuthFlowRoutes(app: Express) {
  app.post("/api/auth/social/exchange", authRateLimiter, async (req: Request, res: Response) => {
    const { code } = req.body || {};
    if (!code || typeof code !== "string") {
      logOAuthSecurityEvent(req, "exchange", "exchange_code_missing");
      return res.status(400).json({ error: "Exchange code is required" });
    }

    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
    const sessionFingerprint = getSessionFingerprint(req);
    const clientBindingHash = buildOAuthClientBinding(req, sessionFingerprint);
    const exchange = consumeOAuthExchangeCode(code, userAgent, clientBindingHash);
    if (!exchange) {
      logOAuthSecurityEvent(req, "exchange", "exchange_code_invalid_or_expired");
      return res.status(400).json({ error: "Invalid or expired exchange code" });
    }

    const user = await storage.getUser(exchange.userId);
    if (!user || user.status !== "active" || Boolean(user.accountDeletedAt)) {
      logOAuthSecurityEvent(req, "exchange", "exchange_user_not_active", {
        hasUser: Boolean(user),
      });
      return res.status(401).json({ error: "User session is not available" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, fp: getSessionFingerprint(req) },
      JWT_USER_SECRET,
      { expiresIn: JWT_USER_EXPIRY },
    );

    setAuthCookie(res, token);
    await storage.updateUser(user.id, {
      lastLoginAt: new Date(),
      isOnline: true,
    });
    await createSession(user.id, token, req);

    return res.json({
      token,
      redirect: exchange.redirect,
      isNew: exchange.isNew,
    });
  });

  app.get("/api/auth/social/google/native/config", authRateLimiter, async (req: Request, res: Response) => {
    try {
      logOAuthRuntimeEvent(req, "google", "google_native_config_requested");

      const googleAndroidMode = resolveGoogleAndroidLoginMode();
      if (googleAndroidMode !== "sdk-only") {
        return res.status(409).json({
          error: "Google Android SDK login mode is disabled",
          loginMode: googleAndroidMode,
        });
      }

      const platformRecord = await storage.getSocialPlatformByName("google");
      if (!platformRecord || !platformRecord.isEnabled) {
        return res.status(404).json({ error: "Platform not available" });
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      const oauthCredentials = resolveEffectiveOAuthCredentials(platformRecord);
      if (!runtime.oauth.enabled) {
        return res.status(400).json({ error: "This platform only supports OTP, not OAuth login" });
      }

      const nativeClientId = resolveGoogleNativeClientId(oauthCredentials.clientId);
      if (!nativeClientId) {
        return res.status(503).json({
          error: "Google SDK client id is missing. Configure GOOGLE_CLIENT_ID (web OAuth client id).",
        });
      }

      const androidPackageName = typeof process.env.GOOGLE_ANDROID_PACKAGE_NAME === "string"
        ? process.env.GOOGLE_ANDROID_PACKAGE_NAME.trim()
        : "";
      const androidSha1 = typeof process.env.GOOGLE_ANDROID_SHA1 === "string"
        ? process.env.GOOGLE_ANDROID_SHA1.trim()
        : "";

      logOAuthRuntimeEvent(req, "google", "google_native_config_served", {
        packageConfigured: androidPackageName.length > 0,
        sha1Configured: androidSha1.length > 0,
      });

      return res.json({
        clientId: nativeClientId,
        scope: resolveGoogleNativeScope(),
        loginMode: googleAndroidMode,
        android: {
          packageName: androidPackageName || null,
          packageConfigured: androidPackageName.length > 0,
          sha1Configured: androidSha1.length > 0,
        },
      });
    } catch (error: unknown) {
      logger.error("Native Google config error", new Error(getErrorMessage(error)));
      return res.status(500).json({ error: "Failed to initialize native authentication" });
    }
  });

  app.post("/api/auth/social/google/native/exchange", authRateLimiter, async (req: Request, res: Response) => {
    try {
      logOAuthRuntimeEvent(req, "google", "google_native_exchange_requested");

      if (resolveGoogleAndroidLoginMode() !== "sdk-only") {
        return res.status(409).json({
          error: "Google Android SDK login mode is disabled",
        });
      }

      const { accessToken, idToken } = req.body || {};
      const normalizedAccessToken = typeof accessToken === "string" ? accessToken.trim() : "";
      const normalizedIdToken = typeof idToken === "string" ? idToken.trim() : "";
      if (!normalizedAccessToken && !normalizedIdToken) {
        logOAuthSecurityEvent(req, "google", "native_google_tokens_missing");
        return res.status(400).json({ error: "Google token is required" });
      }

      const platformRecord = await storage.getSocialPlatformByName("google");
      if (!platformRecord || !platformRecord.isEnabled) {
        return res.status(404).json({ error: "Platform not available" });
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      if (!runtime.oauth.enabled) {
        return res.status(400).json({ error: "This platform only supports OTP, not OAuth login" });
      }

      const oauthCredentials = resolveEffectiveOAuthCredentials(platformRecord);
      const requiredScope = resolveGoogleNativeScope();
      const allowedAudiences = resolveGoogleAllowedAudiences(oauthCredentials.clientId);

      let profile;
      if (normalizedIdToken) {
        const idTokenValidation = await validateGoogleNativeIdToken(normalizedIdToken, allowedAudiences);
        if (idTokenValidation.ok && idTokenValidation.profile) {
          profile = {
            id: String(idTokenValidation.profile.id || idTokenValidation.profile.sub || ""),
            email: idTokenValidation.profile.email as string | undefined,
            emailVerified: idTokenValidation.profile.verified_email === true,
            displayName: idTokenValidation.profile.name as string | undefined,
            avatar: idTokenValidation.profile.picture as string | undefined,
            raw: idTokenValidation.profile,
          };
        } else if (!normalizedAccessToken) {
          const reason = idTokenValidation.reason || "google_id_token_validation_failed";
          logOAuthSecurityEvent(req, "google", reason, idTokenValidation.details);
          const statusCode = reason === "id_tokeninfo_unavailable" ? 503 : 401;
          const errorMessage = statusCode === 503
            ? "Google token validation is temporarily unavailable"
            : "Invalid Google id token";
          return res.status(statusCode).json({ error: errorMessage });
        }
      }

      if (!profile && normalizedAccessToken) {
        const validation = await validateGoogleNativeAccessToken(
          normalizedAccessToken,
          allowedAudiences,
          requiredScope,
        );

        if (!validation.ok) {
          const reason = validation.reason || "google_access_token_validation_failed";
          logOAuthSecurityEvent(req, "google", reason, validation.details);
          const statusCode = reason === "tokeninfo_unavailable" ? 503 : 401;
          const errorMessage = statusCode === 503
            ? "Google token validation is temporarily unavailable"
            : "Invalid Google access token";
          return res.status(statusCode).json({ error: errorMessage });
        }

        try {
          profile = await fetchUserProfile("google", normalizedAccessToken);
        } catch {
          logOAuthSecurityEvent(req, "google", "native_access_token_rejected");
          return res.status(401).json({ error: "Invalid Google access token" });
        }
      }

      if (!profile) {
        logOAuthSecurityEvent(req, "google", "native_profile_unavailable_after_validation");
        return res.status(401).json({ error: "Unable to validate Google profile" });
      }

      if (!profile.id) {
        logOAuthSecurityEvent(req, "google", "native_profile_missing_id");
        return res.status(401).json({ error: "Unable to read Google profile" });
      }

      let nativeUserResult;
      try {
        nativeUserResult = await findOrCreateUser("google", profile, {
          access_token: normalizedAccessToken,
          token_type: "Bearer",
          id_token: normalizedIdToken || undefined,
        });
      } catch (linkError: unknown) {
        if (getErrorMessage(linkError) === "social_email_linking_blocked_by_policy") {
          return res.status(409).json({
            error: "Email is already in use and automatic social linking is disabled by policy",
          });
        }
        throw linkError;
      }

      const { user, isNew } = nativeUserResult;

      if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
        logOAuthSecurityEvent(req, "google", "native_user_suspended", { userId: user.id });
        return res.status(403).json({ error: "User account is suspended" });
      }

      if (isNew) {
        emitSystemAlert({
          title: "New User Registered",
          titleAr: "مستخدم جديد مسجل",
          message: `New social registration (google): ${user.username} (ID: ${user.id})`,
          messageAr: `تسجيل اجتماعي جديد (google): ${user.username} (رقم: ${user.id})`,
          severity: "info",
          deepLink: "/admin/users",
          entityType: "user",
          entityId: String(user.id),
        }).catch(() => { });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, fp: getSessionFingerprint(req) },
        JWT_USER_SECRET,
        { expiresIn: JWT_USER_EXPIRY },
      );

      setAuthCookie(res, token);
      await storage.updateUser(user.id, {
        lastLoginAt: new Date(),
        isOnline: true,
      });
      await createSession(user.id, token, req);

      logOAuthRuntimeEvent(req, "google", "google_native_exchange_success", {
        userId: user.id,
        isNew,
      });

      return res.json({ token, redirect: "/", isNew });
    } catch (error: unknown) {
      logger.error("Native Google exchange error", new Error(getErrorMessage(error)));
      return res.status(500).json({ error: "Failed to complete native authentication" });
    }
  });

  // ==================== Initiate OAuth ====================
  app.get("/api/auth/social/:platform", authRateLimiter, async (req: Request, res: Response) => {
    const platform = req.params.platform;
    const traceId = crypto.randomBytes(8).toString("hex");
    const startedAt = Date.now();

    logOAuthRuntimeEvent(req, platform, "oauth_initiation_started", {
      traceId,
      popup: req.query.popup === "1" || req.query.popup === "true",
    });

    try {
      const requestedRedirectUrl = typeof req.query.redirect === "string" ? req.query.redirect : undefined;
      const redirectUrl = sanitizePostLoginRedirect(requestedRedirectUrl);
      const isPopupRequest = req.query.popup === "1" || req.query.popup === "true";
      const forceConsent = req.query.force_consent === "1" || req.query.force_consent === "true";

      const reusableAuthUrl = getReusableOAuthInitiationUrl(req, platform);
      if (reusableAuthUrl) {
        logOAuthRuntimeEvent(req, platform, "oauth_initiation_reused", {
          traceId,
          durationMs: Date.now() - startedAt,
        });
        return res.json({ url: reusableAuthUrl, reused: true });
      }

      if (requestedRedirectUrl && !redirectUrl) {
        logOAuthSecurityEvent(req, platform, "oauth_invalid_redirect_param", {
          redirectLength: requestedRedirectUrl.length,
        });
      }

      // Look up platform in DB
      const platformRecord = await storage.getSocialPlatformByName(platform);
      if (!platformRecord || !platformRecord.isEnabled) {
        return res.status(404).json({ error: "Platform not available" });
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      const oauthCredentials = resolveEffectiveOAuthCredentials(platformRecord);
      if (!runtime.oauth.enabled) {
        return res.status(400).json({ error: "This platform only supports OTP, not OAuth login" });
      }

      if (!runtime.oauth.ready) {
        const issues = runtime.oauth.issues.join("; ");
        return res.status(503).json({ error: issues || "Platform OAuth runtime is not ready" });
      }

      const callbackUrl = oauthCredentials.callbackUrl || `${req.protocol}://${req.get("host")}/api/auth/social/${platform}/callback`;
      const clientId = oauthCredentials.clientId;
      const sessionFingerprint = getSessionFingerprint(req);
      const clientBindingHash = buildOAuthClientBinding(req, sessionFingerprint);

      // Create state (with PKCE if supported)
      const { state, codeVerifier } = await createOAuthState(platform, redirectUrl, {
        sessionFingerprint,
        clientBindingHash,
      });
      rememberOAuthStatePopupHint(state, isPopupRequest);

      // Build authorization URL
      const extraParams = buildProviderAuthorizationParams(platform, isPopupRequest, forceConsent);

      const authUrl = await buildAuthorizationUrl(
        platform,
        clientId,
        callbackUrl,
        state,
        codeVerifier,
        extraParams,
      );

      rememberOAuthInitiation(req, platform, state, authUrl);

      logOAuthRuntimeEvent(req, platform, "oauth_initiation_success", {
        traceId,
        durationMs: Date.now() - startedAt,
      });

      res.json({ url: authUrl });
    } catch (error: unknown) {
      logOAuthRuntimeEvent(req, platform, "oauth_initiation_failed", {
        traceId,
        durationMs: Date.now() - startedAt,
        error: getErrorMessage(error),
      });
      logger.error(`OAuth initiation error for ${req.params.platform}`, new Error(getErrorMessage(error)));
      res.status(500).json({ error: "Failed to initiate authentication" });
    }
  });

  // ==================== OAuth Callback ====================
  app.get("/api/auth/social/:platform/callback", async (req: Request, res: Response) => {
    await handleOAuthCallback(req, res);
  });

  // Apple uses POST for callback (form_post response mode)
  app.post("/api/auth/social/apple/callback", async (req: Request, res: Response) => {
    await handleOAuthCallback(req, res);
  });

  async function handleOAuthCallback(req: Request, res: Response) {
    const platform = req.params.platform;
    const traceId = crypto.randomBytes(8).toString("hex");
    const startedAt = Date.now();

    try {
      logOAuthRuntimeEvent(req, platform, "oauth_callback_started", {
        traceId,
      });

      // SECURITY: Sanitize platform parameter to prevent URL injection
      const safePlatform = encodeURIComponent(platform.replace(/[^a-zA-Z0-9_-]/g, ''));
      const code = (req.query.code || req.body?.code) as string;
      const state = (req.query.state || req.body?.state) as string;
      const error = (req.query.error || req.body?.error) as string;
      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
      const popupHintFromState = state ? consumeOAuthStatePopupHint(state) : false;

      const buildErrorRedirectPath = (reason: string) => {
        if (popupHintFromState) {
          return `/auth/callback?error=${encodeURIComponent(reason)}&platform=${safePlatform}&popup=1`;
        }

        return `/login?error=${encodeURIComponent(reason)}&platform=${safePlatform}`;
      };

      if (error) {
        logOAuthSecurityEvent(req, platform, "oauth_denied_by_provider", { providerError: error });
        return res.redirect(buildErrorRedirectPath("oauth_denied"));
      }

      if (!code || !state) {
        logOAuthSecurityEvent(req, platform, "oauth_callback_missing_params", {
          hasCode: Boolean(code),
          hasState: Boolean(state),
        });
        return res.redirect(buildErrorRedirectPath("missing_params"));
      }

      const replayRedirect = getOAuthStateReplayRedirect(state, userAgent);
      if (replayRedirect) {
        logOAuthSecurityEvent(req, platform, "oauth_state_replay_served_from_cache");
        return res.redirect(replayRedirect);
      }

      // Verify and consume state (CSRF protection)
      const expectedSessionFingerprint = getSessionFingerprint(req);
      const expectedClientBindingHash = buildOAuthClientBinding(req, expectedSessionFingerprint);
      const stateRecord = await verifyAndConsumeState(state, {
        sessionFingerprint: expectedSessionFingerprint,
        clientBindingHash: expectedClientBindingHash,
      });
      if (!stateRecord) {
        logOAuthSecurityEvent(req, platform, "oauth_invalid_or_replayed_state");
        return res.redirect(buildErrorRedirectPath("invalid_state"));
      }

      if (!stateRecord.bindingValid) {
        logOAuthSecurityEvent(req, platform, "oauth_state_binding_failed", {
          reason: stateRecord.bindingReason || "binding_verification_failed",
          traceId,
        });
        return res.redirect(buildErrorRedirectPath("invalid_state_binding"));
      }

      const isPopupFlow = popupHintFromState;

      clearOAuthInitiationByState(state);

      if (stateRecord.platformName !== platform) {
        logOAuthSecurityEvent(req, platform, "oauth_state_platform_mismatch", {
          expectedPlatform: stateRecord.platformName,
        });
        return res.redirect(buildErrorRedirectPath("state_mismatch"));
      }

      // Look up platform credentials
      const platformRecord = await storage.getSocialPlatformByName(platform);
      if (!platformRecord || !platformRecord.isEnabled) {
        logOAuthSecurityEvent(req, platform, "oauth_platform_not_found");
        return res.redirect(buildErrorRedirectPath("platform_not_found"));
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      if (!runtime.oauth.enabled || !runtime.oauth.ready) {
        logOAuthSecurityEvent(req, platform, "oauth_platform_not_ready", {
          issues: runtime.oauth.issues,
        });
        return res.redirect(buildErrorRedirectPath("platform_not_ready"));
      }

      const oauthCredentials = resolveEffectiveOAuthCredentials(platformRecord);
      if (!oauthCredentials.configured || !oauthCredentials.clientId || !oauthCredentials.clientSecret) {
        logOAuthSecurityEvent(req, platform, "oauth_platform_missing_effective_credentials", {
          source: oauthCredentials.effectiveSource,
          missing: oauthCredentials.effectiveMissingFields,
        });
        return res.redirect(buildErrorRedirectPath("platform_not_ready"));
      }

      const callbackUrl = oauthCredentials.callbackUrl || `${req.protocol}://${req.get("host")}/api/auth/social/${platform}/callback`;
      const clientSecret = oauthCredentials.clientSecret;

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(
        platform,
        code,
        oauthCredentials.clientId,
        clientSecret,
        callbackUrl,
        stateRecord.codeVerifier,
      );

      // Fetch user profile
      let profile;
      if (platform === "apple") {
        // Apple: decode id_token instead of calling userinfo
        const idTokenPayload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
        const appleUser = req.body?.user ? JSON.parse(req.body.user) : null;
        const profileData = {
          sub: idTokenPayload?.sub || "",
          email: idTokenPayload?.email,
          email_verified: idTokenPayload?.email_verified,
          name: appleUser?.name,
        };
        const provider = await import("../../lib/oauth-engine");
        const p = provider.getProvider("apple");
        profile = p?.normalizer ? p.normalizer(profileData) : { id: String(profileData.sub || ''), email: profileData.email as string | undefined, raw: profileData as Record<string, unknown> };
      } else {
        profile = await fetchUserProfile(platform, tokens.access_token);
      }

      // Find or create user, link social account
      let oauthUserResult;
      try {
        oauthUserResult = await findOrCreateUser(platform, profile, tokens);
      } catch (linkError: unknown) {
        if (getErrorMessage(linkError) === "social_email_linking_blocked_by_policy") {
          logOAuthSecurityEvent(req, platform, "oauth_email_linking_blocked_by_policy", { traceId });
          return res.redirect(buildErrorRedirectPath("email_linking_policy_blocked"));
        }
        throw linkError;
      }

      const { user, isNew } = oauthUserResult;

      // Check if user is banned
      if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
        return res.redirect(buildErrorRedirectPath("account_suspended"));
      }

      // Notify admin if this is a brand new registration via OAuth
      if (isNew) {
        emitSystemAlert({
          title: 'New User Registered',
          titleAr: 'مستخدم جديد مسجل',
          message: `New social registration (${platform}): ${user.username} (ID: ${user.id})`,
          messageAr: `تسجيل اجتماعي جديد (${platform}): ${user.username} (رقم: ${user.id})`,
          severity: 'info',
          deepLink: '/admin/users',
          entityType: 'user',
          entityId: String(user.id),
        }).catch(() => { });
      }

      const redirect = sanitizePostLoginRedirect(stateRecord.redirectUrl) || "/";
      const exchangeCode = createOAuthExchangeCode({
        userId: user.id,
        redirect,
        isNew,
        userAgent,
        clientBindingHash: expectedClientBindingHash,
      });
      const callbackPlatformParam = `&platform=${safePlatform}`;
      const callbackRedirectPath = isPopupFlow
        ? `/auth/callback?code=${encodeURIComponent(exchangeCode)}&popup=1${callbackPlatformParam}`
        : `/auth/callback?code=${encodeURIComponent(exchangeCode)}${callbackPlatformParam}`;
      rememberOAuthStateReplay(state, callbackRedirectPath, userAgent);

      logOAuthRuntimeEvent(req, platform, "oauth_callback_success", {
        traceId,
        durationMs: Date.now() - startedAt,
        userId: user.id,
        isNew,
      });

      // Redirect to frontend with one-time code (never expose JWT in URL query).
      res.redirect(callbackRedirectPath);
    } catch (error: unknown) {
      logOAuthRuntimeEvent(req, platform, "oauth_callback_failed", {
        traceId,
        durationMs: Date.now() - startedAt,
        error: getErrorMessage(error),
      });
      logger.error(`OAuth callback error for ${req.params.platform}`, new Error(getErrorMessage(error)));
      const safePlatform = encodeURIComponent((req.params.platform || '').replace(/[^a-zA-Z0-9_-]/g, ''));
      const state = (req.query.state || req.body?.state) as string;
      const isPopupFlow = state ? consumeOAuthStatePopupHint(state) : false;
      if (isPopupFlow) {
        res.redirect(`/auth/callback?error=oauth_failed&platform=${safePlatform}&popup=1`);
        return;
      }
      res.redirect(`/login?error=oauth_failed&platform=${safePlatform}`);
    }
  }
}
