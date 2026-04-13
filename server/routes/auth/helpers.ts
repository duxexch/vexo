import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { storage } from "../../storage";
import { activeSessions } from "@shared/schema";
import type { User } from "@shared/schema";
import { sendNotification } from "../../websocket";

// Explicit dev mode flag — never depends on NODE_ENV alone
export const IS_DEV_MODE = process.env.VEX_DEV_MODE === 'true';

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Session fingerprint — short hash of user-agent for device binding */
export function getSessionFingerprint(req: Request): string {
  const ua = req.headers['user-agent'] || 'unknown';
  return crypto.createHash('sha256').update(ua).digest('hex').substring(0, 16);
}

/** SECURITY: In-memory store for 2FA challenge tokens (expires after 5 minutes) */
const twoFactorChallenges = new Map<string, { userId: string; expiresAt: number }>();

// Cleanup expired 2FA challenges every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of twoFactorChallenges) {
    if (val.expiresAt < now) twoFactorChallenges.delete(key);
  }
}, 300_000);

/** Generate a 2FA challenge token after password verification succeeds */
export function generate2FAChallenge(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  twoFactorChallenges.set(token, { userId, expiresAt });
  return token;
}

/** Verify and consume a 2FA challenge token. Returns userId if valid, null otherwise */
export function verify2FAChallenge(token: string): string | null {
  const challenge = twoFactorChallenges.get(token);
  if (!challenge) return null;
  twoFactorChallenges.delete(token); // one-time use
  if (Date.now() > challenge.expiresAt) return null;
  return challenge.userId;
}

/** TOTP verification — RFC 6238 compatible (30-second window, ±1 step tolerance) */
export function verifyTOTP(base32Secret: string, code: string, window: number = 1): boolean {
  // Decode base32 secret
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
  const period = 30;

  for (let i = -window; i <= window; i++) {
    const counter = Math.floor(now / period) + i;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter & 0xFFFFFFFF, 4);

    const hmac = crypto.createHmac('sha1', secretBytes).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0F;
    const otpValue = (
      ((hmac[offset] & 0x7F) << 24) |
      ((hmac[offset + 1] & 0xFF) << 16) |
      ((hmac[offset + 2] & 0xFF) << 8) |
      (hmac[offset + 3] & 0xFF)
    ) % 1000000;

    const expected = otpValue.toString().padStart(6, '0');
    // SECURITY: Use timing-safe comparison to prevent timing side-channel attack
    const expectedBuf = Buffer.from(expected);
    const codeBuf = Buffer.from(code.trim().padStart(6, '0'));
    if (expectedBuf.length === codeBuf.length && crypto.timingSafeEqual(expectedBuf, codeBuf)) {
      return true;
    }
  }
  return false;
}

/** Send security notification to user (non-blocking) */
export function sendSecurityNotification(userId: string, title: string, titleAr: string, message: string, messageAr: string) {
  sendNotification(userId, {
    type: "security",
    priority: "high",
    title,
    titleAr,
    message,
    messageAr,
    link: '/settings',
  }).catch(() => { }); // non-blocking, don't fail login on notification error
}

/** Set JWT as httpOnly secure cookie alongside JSON response */
export function setAuthCookie(res: Response, token: string) {
  res.cookie('vex_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/** Create an active session record for tracking */
export async function createSession(userId: string, token: string, req: Request) {
  try {
    const tokenFp = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
    const ua = req.headers['user-agent'] || 'unknown';
    let deviceInfo = 'Unknown Device';
    if (/mobile|android|iphone|ipad/i.test(ua)) deviceInfo = 'Mobile';
    else if (/tablet/i.test(ua)) deviceInfo = 'Tablet';
    else if (/windows|mac|linux/i.test(ua)) deviceInfo = 'Desktop';

    await db.insert(activeSessions).values({
      userId,
      tokenFingerprint: tokenFp,
      userAgent: ua.substring(0, 500),
      ipAddress: req.ip || null,
      deviceInfo,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Send login notification (non-blocking)
    const ipStr = req.ip || 'unknown';
    sendNotification(userId, {
      type: "security",
      priority: "low",
      title: "New Login",
      titleAr: "تسجيل دخول جديد",
      message: `Logged in from ${deviceInfo} (IP: ${ipStr}).`,
      messageAr: `تم تسجيل الدخول من ${deviceInfo === 'Mobile' ? 'الهاتف' : deviceInfo === 'Tablet' ? 'التابلت' : deviceInfo === 'Desktop' ? 'الكمبيوتر' : 'جهاز غير معروف'} (IP: ${ipStr}).`,
      link: '/settings',
    }).catch(() => { });
  } catch { } // non-blocking
}

/** Password strength validator */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: "كلمة المرور مطلوبة" };
  }
  if (password.length < 8) {
    return { valid: false, error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" };
  }
  if (password.length > 72) {
    return { valid: false, error: "كلمة المرور يجب أن تكون أقل من 72 حرف" };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, error: "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل" };
  }
  return { valid: true };
}

// Account lockout constants
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("vex_dummy_password_for_timing_equalization", 12);

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

const ONE_CLICK_RECOVERY_GRACE_HOURS = readIntEnv("ONE_CLICK_RECOVERY_GRACE_HOURS", 24, 1, 24 * 30);

export function hasVerifiedRecoveryChannel(user: Pick<User, "email" | "phone" | "emailVerified" | "phoneVerified">): boolean {
  const emailReady = Boolean(user.email && user.email.trim().length > 0 && user.emailVerified);
  const phoneReady = Boolean(user.phone && user.phone.trim().length > 0 && user.phoneVerified);
  return emailReady || phoneReady;
}

export function requiresOneClickRecoveryBootstrap(user: Pick<User, "registrationType" | "createdAt" | "email" | "phone" | "emailVerified" | "phoneVerified">): boolean {
  if (user.registrationType !== "account") {
    return false;
  }

  if (hasVerifiedRecoveryChannel(user)) {
    return false;
  }

  const hasAnyRecoveryContact = Boolean(
    (user.email && user.email.trim().length > 0)
    || (user.phone && user.phone.trim().length > 0),
  );

  // If a contact exists, login OTP flows can still verify ownership.
  if (hasAnyRecoveryContact) {
    return false;
  }

  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
  return accountAgeMs >= ONE_CLICK_RECOVERY_GRACE_HOURS * 60 * 60 * 1000;
}

/**
 * Equalize login timing for unknown accounts to reduce username/account enumeration via timing.
 */
export async function consumeInvalidLoginDelay(password: string): Promise<void> {
  try {
    await bcrypt.compare(password || "", DUMMY_PASSWORD_HASH);
  } catch {
    // non-blocking
  }
}

/** Check if account is locked and handle failed login attempts */
export async function checkAccountLockout(user: Pick<User, 'id' | 'lockedUntil' | 'failedLoginAttempts'>, res: Response): Promise<boolean> {
  if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
    res.status(401).json({
      error: "Invalid credentials",
      errorCode: "INVALID_CREDENTIALS",
    });
    return true;
  }
  if (user.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
    await storage.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null });
  }
  return false;
}

/** Handle a failed login attempt — increment counter, lock if threshold reached */
export async function handleFailedLogin(user: Pick<User, 'id' | 'failedLoginAttempts'>, res: Response, req?: Request): Promise<void> {
  const attempts = (user.failedLoginAttempts || 0) + 1;
  const updateData: Partial<Pick<User, 'failedLoginAttempts' | 'lockedUntil'>> = { failedLoginAttempts: attempts };

  try {
    await storage.createAuditLog({
      userId: user.id,
      action: "login_failed",
      entityType: "user",
      entityId: user.id,
      details: `Failed login attempt #${attempts}`,
      ipAddress: req?.ip || null,
    });
  } catch { }

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await storage.updateUser(user.id, updateData);

    try {
      await storage.createAuditLog({
        userId: user.id,
        action: "account_locked",
        entityType: "user",
        entityId: user.id,
        details: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Locked for 15 minutes.`,
        ipAddress: req?.ip || null,
      });
    } catch { }

    res.status(401).json({
      error: "Invalid credentials",
      errorCode: "INVALID_CREDENTIALS",
    });

    sendSecurityNotification(
      user.id,
      "Account Locked",
      "تم قفل الحساب",
      `Your account has been temporarily locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts. It will be unlocked automatically after 15 minutes.`,
      `تم قفل حسابك مؤقتاً بسبب ${MAX_FAILED_ATTEMPTS} محاولات دخول فاشلة. سيتم فتحه تلقائياً بعد 15 دقيقة.`
    );
    return;
  }

  await storage.updateUser(user.id, updateData);
  res.status(401).json({
    error: "Invalid credentials",
    errorCode: "INVALID_CREDENTIALS",
  });
}

/** Handle successful login — reset failed attempts */
export async function handleSuccessfulLogin(user: Pick<User, 'id' | 'failedLoginAttempts'>): Promise<void> {
  if (user.failedLoginAttempts > 0) {
    await storage.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null });
  }
  await storage.updateUser(user.id, { lastLoginAt: new Date() });
}
