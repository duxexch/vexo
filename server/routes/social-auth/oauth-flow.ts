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

setInterval(() => {
  const now = Date.now();
  for (const [code, record] of oauthExchangeStore.entries()) {
    if (record.expiresAt <= now) {
      oauthExchangeStore.delete(code);
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
  if (!record) {
    return null;
  }

  oauthExchangeStore.delete(code);
  if (record.expiresAt <= Date.now()) {
    return null;
  }

  if (record.userAgent && userAgent && record.userAgent !== userAgent) {
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

  // ==================== Initiate OAuth ====================
  app.get("/api/auth/social/:platform", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { platform } = req.params;
      const requestedRedirectUrl = typeof req.query.redirect === "string" ? req.query.redirect : undefined;
      const redirectUrl = sanitizePostLoginRedirect(requestedRedirectUrl);

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

      // Verify and consume state (CSRF protection)
      const stateRecord = await verifyAndConsumeState(state);
      if (!stateRecord) {
        logOAuthSecurityEvent(req, platform, "oauth_invalid_or_replayed_state");
        return res.redirect(`/login?error=invalid_state&platform=${safePlatform}`);
      }

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
      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
      const exchangeCode = createOAuthExchangeCode({ userId: user.id, redirect, isNew, userAgent });

      // Redirect to frontend with one-time code (never expose JWT in URL query).
      res.redirect(`/auth/callback?code=${encodeURIComponent(exchangeCode)}`);
    } catch (error: unknown) {
      logger.error(`OAuth callback error for ${req.params.platform}`, new Error(getErrorMessage(error)));
      const safePlatform = encodeURIComponent((req.params.platform || '').replace(/[^a-zA-Z0-9_-]/g, ''));
      res.redirect(`/login?error=oauth_failed&platform=${safePlatform}`);
    }
  }
}
