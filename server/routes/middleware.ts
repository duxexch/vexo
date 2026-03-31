import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import {
  AuthVerificationError,
  getAdminTokenFromRequest,
  getUserTokenFromRequest,
  verifyAdminAccessToken,
  verifyUserAccessToken,
} from "../lib/auth-verification";
import { redisStoreOpts } from "./helpers";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    username: string;
    tokenFingerprint?: string;
    token?: string;
  };
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
  ...redisStoreOpts("pwreset"),
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "تم طلب عدد كبير من طلبات استعادة كلمة المرور. حاول لاحقاً" },
  standardHeaders: true,
  legacyHeaders: false,
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
    const verified = await verifyAdminAccessToken(token);
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
