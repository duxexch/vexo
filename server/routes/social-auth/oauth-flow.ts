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
import { evaluateSocialPlatformRuntime } from "../../lib/social-platform-runtime";

interface OAuthExchangeRecord {
  userId: string;
  redirect: string;
  isNew: boolean;
  expiresAt: number;
  userAgent?: string;
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

function logOAuthSecurityEvent(req: Request, platform: string, event: string, metadata?: Record<string, unknown>) {
  logger.warn(`[OAuth] ${event}`, {
    platform,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    path: req.path,
    ...(metadata || {}),
  });
}

const oauthExchangeStore = new Map<string, OAuthExchangeRecord>();
const oauthExchangeReplayStore = new Map<string, OAuthExchangeRecord>();
const oauthInitiationStore = new Map<string, OAuthInitiationRecord>();
const oauthInitiationStateToKey = new Map<string, string>();
const oauthStateReplayStore = new Map<string, OAuthStateReplayRecord>();

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

setInterval(() => {
  const now = Date.now();
  for (const [code, record] of oauthExchangeStore.entries()) {
    if (record.expiresAt <= now) {
      oauthExchangeStore.delete(code);
    }
  }

  for (const [code, record] of oauthExchangeReplayStore.entries()) {
    if (record.expiresAt <= now) {
      oauthExchangeReplayStore.delete(code);
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
}, 60_000);

function createOAuthExchangeCode(record: Omit<OAuthExchangeRecord, "expiresAt">): string {
  const code = crypto.randomBytes(32).toString("hex");
  oauthExchangeStore.set(code, {
    ...record,
    expiresAt: Date.now() + 2 * 60 * 1000,
  });
  return code;
}

function consumeOAuthExchangeCode(code: string, userAgent?: string): OAuthExchangeRecord | null {
  const record = oauthExchangeStore.get(code);
  if (record) {
    oauthExchangeStore.delete(code);
    if (record.expiresAt <= Date.now()) {
      return null;
    }

    if (!isUserAgentCompatible(record.userAgent, userAgent)) {
      return null;
    }

    // Keep short replay window to make exchange idempotent for same callback code.
    oauthExchangeReplayStore.set(code, record);
    return record;
  }

  const replayRecord = oauthExchangeReplayStore.get(code);
  if (!replayRecord) {
    return null;
  }

  if (replayRecord.expiresAt <= Date.now()) {
    oauthExchangeReplayStore.delete(code);
    return null;
  }

  if (!isUserAgentCompatible(replayRecord.userAgent, userAgent)) {
    return null;
  }

  return replayRecord;
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

export function registerOAuthFlowRoutes(app: Express) {
  app.post("/api/auth/social/exchange", authRateLimiter, async (req: Request, res: Response) => {
    const { code } = req.body || {};
    if (!code || typeof code !== "string") {
      logOAuthSecurityEvent(req, "exchange", "exchange_code_missing");
      return res.status(400).json({ error: "Exchange code is required" });
    }

    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
    const exchange = consumeOAuthExchangeCode(code, userAgent);
    if (!exchange) {
      logOAuthSecurityEvent(req, "exchange", "exchange_code_invalid_or_expired");
      return res.status(400).json({ error: "Invalid or expired exchange code" });
    }

    const user = await storage.getUser(exchange.userId);
    if (!user || user.status !== "active") {
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
      const platformRecord = await storage.getSocialPlatformByName("google");
      if (!platformRecord || !platformRecord.isEnabled) {
        return res.status(404).json({ error: "Platform not available" });
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      if (!runtime.oauth.enabled) {
        return res.status(400).json({ error: "This platform only supports OTP, not OAuth login" });
      }

      if (!runtime.oauth.ready || !platformRecord.clientId) {
        const issues = runtime.oauth.issues.join("; ");
        return res.status(503).json({ error: issues || "Platform OAuth runtime is not ready" });
      }

      return res.json({
        clientId: platformRecord.clientId,
        scope: "openid email profile",
      });
    } catch (error: unknown) {
      logger.error("Native Google config error", new Error(getErrorMessage(error)));
      return res.status(500).json({ error: "Failed to initialize native authentication" });
    }
  });

  app.post("/api/auth/social/google/native/exchange", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body || {};
      if (typeof accessToken !== "string" || accessToken.trim().length < 20) {
        logOAuthSecurityEvent(req, "google", "native_access_token_missing_or_invalid");
        return res.status(400).json({ error: "Access token is required" });
      }

      const platformRecord = await storage.getSocialPlatformByName("google");
      if (!platformRecord || !platformRecord.isEnabled) {
        return res.status(404).json({ error: "Platform not available" });
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      if (!runtime.oauth.enabled) {
        return res.status(400).json({ error: "This platform only supports OTP, not OAuth login" });
      }

      if (!runtime.oauth.ready) {
        const issues = runtime.oauth.issues.join("; ");
        return res.status(503).json({ error: issues || "Platform OAuth runtime is not ready" });
      }

      let profile;
      try {
        profile = await fetchUserProfile("google", accessToken);
      } catch {
        logOAuthSecurityEvent(req, "google", "native_access_token_rejected");
        return res.status(401).json({ error: "Invalid Google access token" });
      }

      if (!profile.id) {
        logOAuthSecurityEvent(req, "google", "native_profile_missing_id");
        return res.status(401).json({ error: "Unable to read Google profile" });
      }

      const { user, isNew } = await findOrCreateUser("google", profile, {
        access_token: accessToken,
        token_type: "Bearer",
      });

      if (user.status === "banned" || user.status === "suspended") {
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

      return res.json({ token, redirect: "/", isNew });
    } catch (error: unknown) {
      logger.error("Native Google exchange error", new Error(getErrorMessage(error)));
      return res.status(500).json({ error: "Failed to complete native authentication" });
    }
  });

  // ==================== Initiate OAuth ====================
  app.get("/api/auth/social/:platform", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { platform } = req.params;
      const requestedRedirectUrl = typeof req.query.redirect === "string" ? req.query.redirect : undefined;
      const redirectUrl = sanitizePostLoginRedirect(requestedRedirectUrl);

      const reusableAuthUrl = getReusableOAuthInitiationUrl(req, platform);
      if (reusableAuthUrl) {
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
      if (!runtime.oauth.enabled) {
        return res.status(400).json({ error: "This platform only supports OTP, not OAuth login" });
      }

      if (!runtime.oauth.ready) {
        const issues = runtime.oauth.issues.join("; ");
        return res.status(503).json({ error: issues || "Platform OAuth runtime is not ready" });
      }

      const callbackUrl = platformRecord.callbackUrl || `${req.protocol}://${req.get("host")}/api/auth/social/${platform}/callback`;
      const clientId = platformRecord.clientId || "";

      // Create state (with PKCE if supported)
      const { state, codeVerifier } = await createOAuthState(platform, redirectUrl);

      // Build authorization URL
      const extraParams: Record<string, string> = {};
      if (platform === "google") {
        extraParams.access_type = "offline";
        extraParams.prompt = "consent";
      }
      if (platform === "apple") {
        extraParams.response_mode = "form_post";
      }

      const authUrl = await buildAuthorizationUrl(
        platform,
        clientId,
        callbackUrl,
        state,
        codeVerifier,
        extraParams,
      );

      rememberOAuthInitiation(req, platform, state, authUrl);

      res.json({ url: authUrl });
    } catch (error: unknown) {
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
    try {
      const { platform } = req.params;
      // SECURITY: Sanitize platform parameter to prevent URL injection
      const safePlatform = encodeURIComponent(platform.replace(/[^a-zA-Z0-9_-]/g, ''));
      const code = (req.query.code || req.body?.code) as string;
      const state = (req.query.state || req.body?.state) as string;
      const error = (req.query.error || req.body?.error) as string;
      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;

      if (error) {
        logOAuthSecurityEvent(req, platform, "oauth_denied_by_provider", { providerError: error });
        return res.redirect(`/login?error=oauth_denied&platform=${safePlatform}`);
      }

      if (!code || !state) {
        logOAuthSecurityEvent(req, platform, "oauth_callback_missing_params", {
          hasCode: Boolean(code),
          hasState: Boolean(state),
        });
        return res.redirect(`/login?error=missing_params&platform=${safePlatform}`);
      }

      const replayRedirect = getOAuthStateReplayRedirect(state, userAgent);
      if (replayRedirect) {
        logOAuthSecurityEvent(req, platform, "oauth_state_replay_served_from_cache");
        return res.redirect(replayRedirect);
      }

      // Verify and consume state (CSRF protection)
      const stateRecord = await verifyAndConsumeState(state);
      if (!stateRecord) {
        logOAuthSecurityEvent(req, platform, "oauth_invalid_or_replayed_state");
        return res.redirect(`/login?error=invalid_state&platform=${safePlatform}`);
      }

      clearOAuthInitiationByState(state);

      if (stateRecord.platformName !== platform) {
        logOAuthSecurityEvent(req, platform, "oauth_state_platform_mismatch", {
          expectedPlatform: stateRecord.platformName,
        });
        return res.redirect(`/login?error=state_mismatch&platform=${safePlatform}`);
      }

      // Look up platform credentials
      const platformRecord = await storage.getSocialPlatformByName(platform);
      if (!platformRecord || !platformRecord.isEnabled) {
        logOAuthSecurityEvent(req, platform, "oauth_platform_not_found");
        return res.redirect(`/login?error=platform_not_found`);
      }

      const runtime = evaluateSocialPlatformRuntime(platformRecord);
      if (!runtime.oauth.enabled || !runtime.oauth.ready) {
        logOAuthSecurityEvent(req, platform, "oauth_platform_not_ready", {
          issues: runtime.oauth.issues,
        });
        return res.redirect(`/login?error=platform_not_ready&platform=${safePlatform}`);
      }

      const callbackUrl = platformRecord.callbackUrl || `${req.protocol}://${req.get("host")}/api/auth/social/${platform}/callback`;
      const clientSecret = platformRecord.clientSecret || "";

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(
        platform,
        code,
        platformRecord.clientId || "",
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
          name: appleUser?.name,
        };
        const provider = await import("../../lib/oauth-engine");
        const p = provider.getProvider("apple");
        profile = p?.normalizer ? p.normalizer(profileData) : { id: String(profileData.sub || ''), email: profileData.email as string | undefined, raw: profileData as Record<string, unknown> };
      } else {
        profile = await fetchUserProfile(platform, tokens.access_token);
      }

      // Find or create user, link social account
      const { user, isNew } = await findOrCreateUser(platform, profile, tokens);

      // Check if user is banned
      if (user.status === "banned" || user.status === "suspended") {
        return res.redirect(`/login?error=account_suspended`);
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
      const exchangeCode = createOAuthExchangeCode({ userId: user.id, redirect, isNew, userAgent });
      const callbackRedirectPath = `/auth/callback?code=${encodeURIComponent(exchangeCode)}`;
      rememberOAuthStateReplay(state, callbackRedirectPath, userAgent);

      // Redirect to frontend with one-time code (never expose JWT in URL query).
      res.redirect(callbackRedirectPath);
    } catch (error: unknown) {
      logger.error(`OAuth callback error for ${req.params.platform}`, new Error(getErrorMessage(error)));
      const safePlatform = encodeURIComponent((req.params.platform || '').replace(/[^a-zA-Z0-9_-]/g, ''));
      res.redirect(`/login?error=oauth_failed&platform=${safePlatform}`);
    }
  }
}
