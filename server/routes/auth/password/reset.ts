import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "../../../storage";
import { sendEmail, sendSms, buildResetPasswordEmailHtml, buildResetSmsMessage } from "../../../lib/messaging";
import { passwordResetRateLimiter, strictRateLimiter } from "../../middleware";
import {
  getErrorMessage,
  sendSecurityNotification,
  validatePasswordStrength,
} from "../helpers";

const RESET_CODE_EXPIRY_MINUTES = 60;
const RESET_CODE_EXPIRY_MS = RESET_CODE_EXPIRY_MINUTES * 60 * 1000;

function generateResetCode(): string {
  // 12-char hexadecimal code (48-bit entropy), easier to type than long URL tokens.
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export function registerPasswordResetRoutes(app: Express) {
  // Request password reset
  app.post("/api/auth/forgot-password", passwordResetRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, phone, accountId } = req.body;
      const genericResponse = {
        success: true,
        message: "If an account exists with this identifier, reset instructions have been sent",
      };

      // Don't reveal whether an account exists — always return success-like response
      if (!email && !phone && !accountId) {
        return res.status(400).json({ error: "Please provide email, phone, or account ID" });
      }

      let user;
      if (email && typeof email === 'string') {
        user = await storage.getUserByEmail(email);
      } else if (phone && typeof phone === 'string') {
        user = await storage.getUserByPhone(phone);
      } else if (accountId && typeof accountId === 'string') {
        user = await storage.getUserByAccountId(accountId);
      }

      if (!user) {
        return res.json(genericResponse);
      }

      if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
        return res.json(genericResponse);
      }

      const resetCode = generateResetCode();
      const tokenHash = crypto.createHash('sha256').update(resetCode).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MS);

      // Invalidate any previous reset tokens for this user
      await storage.invalidateUserResetTokens(user.id);

      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Prefer user-entered channel; fallback to available verified contact for account-id based requests.
      const recoveryEmail =
        email && user.email
          ? user.email
          : !email && !phone && user.email
            ? user.email
            : null;
      const recoveryPhone =
        phone && user.phone
          ? user.phone
          : !email && !phone && !recoveryEmail && user.phone
            ? user.phone
            : null;

      if (recoveryEmail) {
        void sendEmail({
          to: recoveryEmail,
          subject: "VEX - استعادة كلمة المرور",
          text: `رمز استعادة كلمة المرور: ${resetCode}\nصالح لمدة ${RESET_CODE_EXPIRY_MINUTES} دقيقة`,
          html: buildResetPasswordEmailHtml(resetCode, RESET_CODE_EXPIRY_MINUTES),
        }).catch(err => console.error("Reset email delivery error:", err));
      } else if (recoveryPhone) {
        void sendSms({
          to: recoveryPhone,
          message: buildResetSmsMessage(resetCode, RESET_CODE_EXPIRY_MINUTES),
        }).catch(err => console.error("Reset SMS delivery error:", err));
      }

      res.json(genericResponse);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", strictRateLimiter, async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

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
      for (const candidate of tokenCandidates) {
        const tokenHash = crypto.createHash('sha256').update(candidate).digest('hex');
        const found = await storage.getPasswordResetTokenByHash(tokenHash);
        if (found) {
          resetToken = found;
          break;
        }
      }

      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ error: "Token has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "Token has expired" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      const existingUser = await storage.getUser(resetToken.userId);
      if (!existingUser || existingUser.status !== "active" || Boolean(existingUser.accountDeletedAt)) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      const shouldSwitchFromSocial = Boolean(existingUser?.registrationType && existingUser.registrationType.startsWith("social_"));

      await storage.updateUser(resetToken.userId, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(shouldSwitchFromSocial
          ? {
            registrationType: existingUser?.email
              ? "email"
              : existingUser?.phone
                ? "phone"
                : existingUser?.accountId
                  ? "account"
                  : "username",
          }
          : {}),
      });
      await storage.markTokenAsUsed(resetToken.id);
      // Invalidate all other reset tokens for this user
      await storage.invalidateUserResetTokens(resetToken.userId);

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
