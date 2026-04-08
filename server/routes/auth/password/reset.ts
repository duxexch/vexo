import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "../../../storage";
import { sendEmail, sendSms, buildResetPasswordEmailHtml, buildResetSmsMessage } from "../../../lib/messaging";
import {
  passwordResetRateLimiter,
  passwordResetIdentifierRateLimiter,
  passwordResetConfirmRateLimiter,
} from "../../middleware";
import {
  getErrorMessage,
  sendSecurityNotification,
  validatePasswordStrength,
} from "../helpers";
import {
  clearResetBruteForceFailures,
  getResetBruteForceBlockState,
  registerResetBruteForceFailure,
} from "../reset-security";

const RESET_CODE_EXPIRY_MINUTES = 60;
const RESET_CODE_EXPIRY_MS = RESET_CODE_EXPIRY_MINUTES * 60 * 1000;
const RECOVERY_RESPONSE_MIN_DELAY_MS = 250;
const RECOVERY_RESPONSE_JITTER_MS = 150;

type ResetDeliveryChannel = "email" | "phone";

type ResetDeliverySelection = {
  channel: ResetDeliveryChannel;
  target: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.trim();
}

function hashResetToken(token: string, channel?: ResetDeliveryChannel): string {
  const normalized = token.trim();
  const scopedToken = channel ? `${channel}:${normalized}` : normalized;
  return crypto.createHash("sha256").update(scopedToken).digest("hex");
}

async function applyNondisclosureDelay(startedAt: number): Promise<void> {
  const targetDelay = RECOVERY_RESPONSE_MIN_DELAY_MS + crypto.randomInt(0, RECOVERY_RESPONSE_JITTER_MS + 1);
  const elapsed = Date.now() - startedAt;
  if (elapsed >= targetDelay) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, targetDelay - elapsed));
}

function resolveResetDeliveryChannel(
  user: {
    email: string | null;
    phone: string | null;
    emailVerified: boolean | null;
    phoneVerified: boolean | null;
  },
  input: {
    email?: unknown;
    phone?: unknown;
  },
): ResetDeliverySelection | null {
  const requestedEmail = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const requestedPhone = typeof input.phone === "string" ? normalizePhone(input.phone) : "";

  const userEmail = typeof user.email === "string" ? normalizeEmail(user.email) : "";
  const userPhone = typeof user.phone === "string" ? normalizePhone(user.phone) : "";

  if (requestedEmail) {
    if (userEmail && requestedEmail === userEmail && Boolean(user.emailVerified)) {
      return { channel: "email", target: userEmail };
    }
    return null;
  }

  if (requestedPhone) {
    if (userPhone && requestedPhone === userPhone && Boolean(user.phoneVerified)) {
      return { channel: "phone", target: userPhone };
    }
    return null;
  }

  if (userEmail && Boolean(user.emailVerified)) {
    return { channel: "email", target: userEmail };
  }

  if (userPhone && Boolean(user.phoneVerified)) {
    return { channel: "phone", target: userPhone };
  }

  return null;
}

function generateResetCode(): string {
  // 12-char hexadecimal code (48-bit entropy), easier to type than long URL tokens.
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export function registerPasswordResetRoutes(app: Express) {
  // Request password reset
  app.post("/api/auth/forgot-password", passwordResetRateLimiter, passwordResetIdentifierRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, phone, accountId } = req.body;
      const requestStartedAt = Date.now();
      const genericResponse = {
        success: true,
        message: "If an account exists with this identifier, reset instructions have been sent",
      };

      const sendGenericResponse = async () => {
        await applyNondisclosureDelay(requestStartedAt);
        return res.json(genericResponse);
      };

      // Don't reveal whether an account exists — always return success-like response
      if (!email && !phone && !accountId) {
        return res.status(400).json({ error: "Please provide email, phone, or account ID" });
      }

      let user;
      if (email && typeof email === 'string') {
        user = await storage.getUserByEmail(normalizeEmail(email));
      } else if (phone && typeof phone === 'string') {
        user = await storage.getUserByPhone(normalizePhone(phone));
      } else if (accountId && typeof accountId === 'string') {
        user = await storage.getUserByAccountId(accountId.trim());
      }

      if (!user) {
        return sendGenericResponse();
      }

      if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
        return sendGenericResponse();
      }

      const delivery = resolveResetDeliveryChannel(user, { email, phone });
      if (!delivery) {
        return sendGenericResponse();
      }

      const resetCode = generateResetCode();
      const tokenHash = hashResetToken(resetCode, delivery.channel);
      const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MS);

      // Invalidate any previous reset tokens for this user
      await storage.invalidateUserResetTokens(user.id);

      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      if (delivery.channel === "email") {
        void sendEmail({
          to: delivery.target,
          subject: "VEX - استعادة كلمة المرور",
          text: `رمز استعادة كلمة المرور: ${resetCode}\nصالح لمدة ${RESET_CODE_EXPIRY_MINUTES} دقيقة`,
          html: buildResetPasswordEmailHtml(resetCode, RESET_CODE_EXPIRY_MINUTES),
        }).then((delivered) => {
          if (!delivered) {
            void storage.invalidateUserResetTokens(user.id);
          }
        }).catch(() => {
          void storage.invalidateUserResetTokens(user.id);
        });
      } else {
        void sendSms({
          to: delivery.target,
          message: buildResetSmsMessage(resetCode, RESET_CODE_EXPIRY_MINUTES),
        }).then((delivered) => {
          if (!delivered) {
            void storage.invalidateUserResetTokens(user.id);
          }
        }).catch(() => {
          void storage.invalidateUserResetTokens(user.id);
        });
      }

      return sendGenericResponse();
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", passwordResetConfirmRateLimiter, async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      const bruteForceState = await getResetBruteForceBlockState(req, "password-reset-confirm");
      if (bruteForceState.blocked) {
        if (bruteForceState.retryAfterSeconds > 0) {
          res.setHeader("Retry-After", String(bruteForceState.retryAfterSeconds));
        }
        return res.status(429).json({ error: "Too many attempts, please try again later" });
      }

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: "Reset token is required" });
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
        return res.status(400).json({ error: "Password must be 8-72 characters" });
      }
      const pwCheck = validatePasswordStrength(newPassword);
      if (!pwCheck.valid) {
        return res.status(400).json({ error: pwCheck.error });
      }

      const normalizedToken = token.trim();
      const tokenCandidates = Array.from(new Set([normalizedToken, normalizedToken.toUpperCase()])).filter(Boolean);

      let resetToken = null;
      let matchedChannel: ResetDeliveryChannel | null = null;
      for (const candidate of tokenCandidates) {
        const hashCandidates: Array<{ tokenHash: string; channel: ResetDeliveryChannel | null }> = [
          { tokenHash: hashResetToken(candidate, "email"), channel: "email" },
          { tokenHash: hashResetToken(candidate, "phone"), channel: "phone" },
          { tokenHash: hashResetToken(candidate), channel: null },
        ];

        for (const hashCandidate of hashCandidates) {
          const found = await storage.getPasswordResetTokenByHash(hashCandidate.tokenHash);
          if (found) {
            resetToken = found;
            matchedChannel = hashCandidate.channel;
            break;
          }
        }

        if (resetToken) {
          break;
        }
      }

      if (!resetToken) {
        await registerResetBruteForceFailure(req, "password-reset-confirm", "invalid_or_expired_token");
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      if (resetToken.usedAt || new Date() > resetToken.expiresAt) {
        await registerResetBruteForceFailure(req, "password-reset-confirm", "used_or_expired_token");
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      const existingUser = await storage.getUser(resetToken.userId);
      if (!existingUser || existingUser.status !== "active" || Boolean(existingUser.accountDeletedAt)) {
        await registerResetBruteForceFailure(req, "password-reset-confirm", "token_user_not_eligible");
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      const consumedToken = await storage.consumePasswordResetToken(resetToken.id);
      if (!consumedToken) {
        await registerResetBruteForceFailure(req, "password-reset-confirm", "token_already_consumed");
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      const shouldSwitchFromSocial = Boolean(existingUser?.registrationType && existingUser.registrationType.startsWith("social_"));
      const verifiedChannelPatch = matchedChannel === "email"
        ? { emailVerified: true }
        : matchedChannel === "phone"
          ? { phoneVerified: true }
          : {};

      await storage.updateUser(resetToken.userId, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...verifiedChannelPatch,
        ...(shouldSwitchFromSocial
          ? {
            registrationType: matchedChannel === "email"
              ? "email"
              : matchedChannel === "phone"
                ? "phone"
                : existingUser?.email
                  ? "email"
                  : existingUser?.phone
                    ? "phone"
                    : existingUser?.accountId
                      ? "account"
                      : "username",
          }
          : {}),
      });

      // Invalidate active sessions immediately after credential reset.
      await storage.revokeAllUserSessions(resetToken.userId);
      await storage.revokeAllActiveSessions(resetToken.userId);

      // Invalidate all other reset tokens for this user
      await storage.invalidateUserResetTokens(resetToken.userId);

      await clearResetBruteForceFailures(req, "password-reset-confirm");

      await storage.createAuditLog({
        userId: resetToken.userId,
        action: "password_changed",
        entityType: "user",
        entityId: resetToken.userId,
        details: "Password reset via recovery token",
        ipAddress: req.ip,
      });

      // Notify user of password change
      sendSecurityNotification(
        resetToken.userId,
        "Password Changed",
        "تم تغيير كلمة المرور",
        "Your password has been successfully changed. If you did not make this change, please contact support immediately.",
        "تم تغيير كلمة المرور بنجاح. إذا لم تقم بهذا التغيير، يرجى التواصل مع الدعم فوراً."
      );

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
