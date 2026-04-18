import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import {
  AuthVerificationError,
  getAdminTokenFromRequest,
  getUserTokenFromRequest,
  verifyAdminAccessToken,
  verifyUserAccessToken,
} from "../lib/auth-verification";
import { redisStoreOpts } from "./helpers";
import {
  getClientIpFromRequest,
  getResetIdentifierHashFromBody,
  logResetSecurityEvent,
  type ResetSecurityFlow,
} from "./auth/reset-security";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    username: string;
    tokenFingerprint?: string;
    token?: string;
  };
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

const AUTH_RESET_REQUEST_MAX_PER_15M = readIntEnv("AUTH_RESET_REQUEST_MAX_PER_15M", 6, 2, 200);
const AUTH_RESET_IDENTIFIER_MAX_PER_HOUR = readIntEnv("AUTH_RESET_IDENTIFIER_MAX_PER_HOUR", 4, 1, 100);
const AUTH_RESET_CONFIRM_MAX_PER_15M = readIntEnv("AUTH_RESET_CONFIRM_MAX_PER_15M", 8, 2, 200);
const AUTH_RECOVERY_CONFIRM_MAX_PER_15M = readIntEnv("AUTH_RECOVERY_CONFIRM_MAX_PER_15M", 8, 2, 200);
const AUTH_AUTO_REGISTER_MAX_PER_24H = readIntEnv("AUTH_AUTO_REGISTER_MAX_PER_24H", 4, 1, 20);

function resolveResetFlowFromPath(path: string): ResetSecurityFlow {
  return path.includes("/account/recovery") ? "account-recovery-request" : "password-reset-request";
}

function handleResetRateLimit(req: Request, res: Response, options: {
  flow: ResetSecurityFlow;
  event: string;
  reason: string;
  severity: "warning" | "critical";
  message: string;
}) {
  void logResetSecurityEvent({
    req,
    flow: options.flow,
    event: options.event,
    reason: options.reason,
    result: "blocked",
    severity: options.severity,
    includeLiveAlert: true,
  });

  return res.status(429).json({ error: options.message });
}

export const authRateLimiter = rateLimit({
  ...redisStoreOpts("auth"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

export const registrationRateLimiter = rateLimit({
  ...redisStoreOpts("reg"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many registration attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

function getAutoRegistrationClientKey(req: Request): string {
  const ip = getClientIpFromRequest(req);
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "unknown";

  // Keep server-side abuse protection tied to network/device fingerprint,
  // not user-controlled identifiers that can be regenerated client-side.
  const stableClientSignature = `${ip}|${userAgent.substring(0, 160)}`;
  return crypto.createHash("sha256").update(stableClientSignature).digest("hex").substring(0, 48);
}

export const identifierAutoRegistrationLimiter = rateLimit({
  ...redisStoreOpts("identifier-autoreg"),
  windowMs: 24 * 60 * 60 * 1000,
  max: AUTH_AUTO_REGISTER_MAX_PER_24H,
  keyGenerator: (req) => getAutoRegistrationClientKey(req),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (_req: Request, res: Response) => {
    return res.status(429).json({
      error: "تم تعطيل ميزة إنشاء الحساب من بيانات تسجيل الدخول لهذا العميل مؤقتًا",
      errorCode: "AUTO_CREATE_BLOCKED",
    });
  },
});

export const strictRateLimiter = rateLimit({
  ...redisStoreOpts("strict"),
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  ...redisStoreOpts("api"),
  windowMs: 60 * 1000,
  max: 300,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP-specific: max 3 OTP requests per 10 minutes per IP
export const otpRateLimiter = rateLimit({
  ...redisStoreOpts("otp"),
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { error: "تم طلب عدد كبير من رموز التحقق. حاول لاحقاً" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset: max 3 per hour per IP
export const passwordResetRateLimiter = rateLimit({
  ...redisStoreOpts("pwreset-ip"),
  windowMs: 15 * 60 * 1000,
  max: AUTH_RESET_REQUEST_MAX_PER_15M,
  keyGenerator: (req) => getClientIpFromRequest(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => handleResetRateLimit(req, res, {
    flow: resolveResetFlowFromPath(req.path),
    event: "reset_request_rate_limited_ip",
    reason: "too_many_requests_from_ip",
    severity: "warning",
    message: "تم طلب عدد كبير من طلبات استعادة كلمة المرور. حاول لاحقاً",
  }),
});

export const passwordResetIdentifierRateLimiter = rateLimit({
  ...redisStoreOpts("pwreset-id"),
  windowMs: 60 * 60 * 1000,
  max: AUTH_RESET_IDENTIFIER_MAX_PER_HOUR,
  keyGenerator: (req) => {
    const identifierHash = getResetIdentifierHashFromBody(req.body);
    return identifierHash || getClientIpFromRequest(req);
  },
  skip: (req) => !getResetIdentifierHashFromBody(req.body),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => handleResetRateLimit(req, res, {
    flow: resolveResetFlowFromPath(req.path),
    event: "reset_request_rate_limited_identifier",
    reason: "too_many_requests_for_same_identifier",
    severity: "critical",
    message: "تم طلب عدد كبير من طلبات استعادة كلمة المرور. حاول لاحقاً",
  }),
});

export const passwordResetConfirmRateLimiter = rateLimit({
  ...redisStoreOpts("pwreset-confirm"),
  windowMs: 15 * 60 * 1000,
  max: AUTH_RESET_CONFIRM_MAX_PER_15M,
  keyGenerator: (req) => getClientIpFromRequest(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => handleResetRateLimit(req, res, {
    flow: "password-reset-confirm",
    event: "reset_confirm_rate_limited",
    reason: "too_many_reset_confirm_attempts",
    severity: "critical",
    message: "Too many attempts, please try again later",
  }),
});

export const accountRecoveryConfirmRateLimiter = rateLimit({
  ...redisStoreOpts("recovery-confirm"),
  windowMs: 15 * 60 * 1000,
  max: AUTH_RECOVERY_CONFIRM_MAX_PER_15M,
  keyGenerator: (req) => getClientIpFromRequest(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => handleResetRateLimit(req, res, {
    flow: "account-recovery-confirm",
    event: "recovery_confirm_rate_limited",
    reason: "too_many_recovery_confirm_attempts",
    severity: "critical",
    message: "Too many attempts, please try again later",
  }),
});

export const sensitiveRateLimiter = rateLimit({
  ...redisStoreOpts("sensitive"),
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many sensitive operations, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const attackProtectionLimiter = rateLimit({
  ...redisStoreOpts("attack"),
  windowMs: 1000,
  max: 100,
  message: { error: "Request rate too high" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getUserTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const verified = await verifyUserAccessToken(token, {
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      requireActiveSession: true,
      updateSessionActivity: true,
    });

    req.user = {
      id: verified.id,
      role: verified.role,
      username: verified.username,
      tokenFingerprint: verified.tokenFingerprint,
      token,
    };

    next();
  } catch (error) {
    if (error instanceof AuthVerificationError) {
      const payload: Record<string, string> = { error: error.message };
      if (error.code) {
        payload.errorCode = error.code;
      }
      return res.status(error.status).json(payload);
    }

    return res.status(401).json({ error: "Invalid token" });
  }
};

export const optionalAuthMiddleware = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = getUserTokenFromRequest(req);

  if (!token) {
    return next();
  }

  try {
    const verified = await verifyUserAccessToken(token, {
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      requireActiveSession: true,
      updateSessionActivity: true,
    });

    req.user = {
      id: verified.id,
      role: verified.role,
      username: verified.username,
      tokenFingerprint: verified.tokenFingerprint,
      token,
    };
  } catch {
    // Optional auth should not block public endpoints.
  }

  next();
};

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

export const adminTokenMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  try {
    const verified = await verifyAdminAccessToken(token, {
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      requireActiveSession: true,
      updateSessionActivity: true,
    });
    req.user = {
      id: verified.id,
      role: verified.role,
      username: verified.username,
      token,
    };
    next();
  } catch (error) {
    if (error instanceof AuthVerificationError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(401).json({ error: "Invalid admin token" });
  }
};

export const agentMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== "agent" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Agent access required" });
  }
  next();
};
