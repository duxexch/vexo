import type { Request, Response, NextFunction } from "express";
import { adminAuditLogs, type AdminAuditAction } from "@shared/schema";
import { db } from "../db";
import crypto from "crypto";
import { logger } from "../lib/logger";
import {
  AuthVerificationError,
  getAdminTokenFromRequest,
  verifyAdminAccessToken,
} from "../lib/auth-verification";

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// In-memory one-time admin 2FA challenges (5 min TTL)
const adminTwoFactorChallenges = new Map<string, { adminId: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, challenge] of adminTwoFactorChallenges.entries()) {
    if (challenge.expiresAt <= now) {
      adminTwoFactorChallenges.delete(token);
    }
  }
}, 300_000);

export function generateAdmin2FAChallenge(adminId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  adminTwoFactorChallenges.set(token, {
    adminId,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return token;
}

export function verifyAdmin2FAChallenge(challengeToken: string): string | null {
  const challenge = adminTwoFactorChallenges.get(challengeToken);
  if (!challenge) {
    return null;
  }

  adminTwoFactorChallenges.delete(challengeToken);
  if (challenge.expiresAt <= Date.now()) {
    return null;
  }

  return challenge.adminId;
}

// TOTP verification for admin 2FA (RFC 6238 compatible)
export function verifyTOTP(base32Secret: string, code: string, window: number = 1): boolean {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const secretBytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < secretBytes.length; i++) {
    secretBytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8), 2);
  }
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    const counter = Math.floor(now / 30) + i;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter & 0xFFFFFFFF, 4);
    const hmac = crypto.createHmac('sha1', secretBytes).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0F;
    const otpValue = (((hmac[offset] & 0x7F) << 24) | ((hmac[offset + 1] & 0xFF) << 16) | ((hmac[offset + 2] & 0xFF) << 8) | (hmac[offset + 3] & 0xFF)) % 1000000;
    if (otpValue.toString().padStart(6, '0') === code.trim()) return true;
  }
  return false;
}

export interface AdminRequest extends Request {
  admin?: { id: string; role: string; username: string };
}

export const adminAuthMiddleware = async (req: AdminRequest, res: Response, next: NextFunction) => {
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
    req.admin = { id: verified.id, role: verified.role, username: verified.username };
    next();
  } catch (error) {
    if (error instanceof AuthVerificationError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(401).json({ error: "Invalid admin token" });
  }
};

// Keep audit logging resilient across enum drifts between runtime DB and code.
// The DB in some environments still uses a narrower enum set.
const DB_SAFE_AUDIT_ACTIONS = new Set<string>([
  "login",
  "logout",
  "user_update",
  "user_ban",
  "user_suspend",
  "user_balance_adjust",
  "reward_sent",
  "dispute_resolve",
  "theme_change",
  "section_toggle",
  "settings_update",
  "announcement_create",
  "announcement_update",
  "game_update",
  "promo_create",
  "p2p_ban",
  "p2p_unban",
]);

function normalizeAdminAuditAction(action: string): AdminAuditAction {
  const normalized = (action || "").trim().toLowerCase();

  if (DB_SAFE_AUDIT_ACTIONS.has(normalized)) {
    return normalized as AdminAuditAction;
  }

  if (normalized.includes("logout")) return "logout" as AdminAuditAction;
  if (normalized.includes("login") || normalized.includes("auth")) return "login" as AdminAuditAction;

  if (normalized.startsWith("user_")) {
    if (normalized.includes("balance")) return "user_balance_adjust" as AdminAuditAction;
    if (normalized.includes("suspend")) return "user_suspend" as AdminAuditAction;
    if (normalized.includes("ban")) return "user_ban" as AdminAuditAction;
    return "user_update" as AdminAuditAction;
  }

  if (normalized.includes("reward")) return "reward_sent" as AdminAuditAction;
  if (normalized.includes("dispute")) return "dispute_resolve" as AdminAuditAction;
  if (normalized.includes("theme")) return "theme_change" as AdminAuditAction;
  if (normalized.includes("section") || normalized.includes("toggle")) return "section_toggle" as AdminAuditAction;

  if (normalized.includes("announcement")) {
    return normalized.includes("create")
      ? ("announcement_create" as AdminAuditAction)
      : ("announcement_update" as AdminAuditAction);
  }

  if (normalized.includes("game")) return "game_update" as AdminAuditAction;
  if (normalized.includes("promo")) return "promo_create" as AdminAuditAction;

  if (normalized.startsWith("p2p_")) {
    if (normalized.includes("ban")) return "p2p_ban" as AdminAuditAction;
    if (normalized.includes("unban")) return "p2p_unban" as AdminAuditAction;
  }

  return "settings_update" as AdminAuditAction;
}

function mergeOriginalActionMetadata(metadata: string | undefined, originalAction: string): string {
  if (!metadata) {
    return JSON.stringify({ originalAction });
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, originalAction });
    }
  } catch {
    // Fall back to wrapping plain text metadata.
  }

  return JSON.stringify({ originalAction, metadata });
}

export async function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: { previousValue?: string; newValue?: string; reason?: string; metadata?: string },
  req: Request
) {
  try {
    const normalizedAction = normalizeAdminAuditAction(action);
    const normalizedKey = (action || "").trim().toLowerCase();
    const metadata = normalizedAction === normalizedKey
      ? details.metadata
      : mergeOriginalActionMetadata(details.metadata, action);

    await db.insert(adminAuditLogs).values({
      adminId,
      action: normalizedAction,
      entityType,
      entityId,
      previousValue: details.previousValue,
      newValue: details.newValue,
      reason: details.reason,
      metadata,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    // SECURITY: Audit log failure must NEVER break the actual operation
    logger.error(`Audit log failure: action=${action} entity=${entityId}`, error instanceof Error ? error : new Error(String(error)));
  }
}
