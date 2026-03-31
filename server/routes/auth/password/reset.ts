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
  IS_DEV_MODE,
} from "../helpers";

export function registerPasswordResetRoutes(app: Express) {
  // Request password reset
  app.post("/api/auth/forgot-password", passwordResetRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, phone, accountId } = req.body;
      
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
        // Return generic message to prevent account enumeration
        return res.json({ message: "If an account exists with this identifier, reset instructions have been sent" });
      }
      
      const resetToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 3600000);
      
      // Invalidate any previous reset tokens for this user
      await storage.invalidateUserResetTokens(user.id);
      
      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      
      // In production, send token via email/SMS only — never expose in API response
      const responseData: Record<string, unknown> = { 
        success: true, 
        message: "Password reset instructions sent. Check your email/phone.",
      };
      
      // Deliver reset token via email or SMS
      const resetUrl = `${process.env.APP_URL || 'https://vixo.click'}/reset-password?token=${resetToken}`;
      
      if (email && user.email) {
        sendEmail({
          to: user.email,
          subject: "VEX - استعادة كلمة المرور",
          text: `رمز استعادة كلمة المرور: ${resetToken}\nأو استخدم الرابط: ${resetUrl}\nصالح لمدة 60 دقيقة`,
          html: buildResetPasswordEmailHtml(resetToken.substring(0, 8).toUpperCase(), 60),
        }).catch(err => console.error("Reset email delivery error:", err));
      } else if (phone && user.phone) {
        sendSms({
          to: user.phone,
          message: buildResetSmsMessage(resetToken.substring(0, 8).toUpperCase(), 60),
        }).catch(err => console.error("Reset SMS delivery error:", err));
      }
      
      // Only expose token in explicit dev mode (VEX_DEV_MODE=true)
      if (IS_DEV_MODE) {
        responseData.token = resetToken;
        responseData.devNote = "Token exposed only in development mode (VEX_DEV_MODE)";
      }
      
      res.json(responseData);
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

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const resetToken = await storage.getPasswordResetTokenByHash(tokenHash);
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
      await storage.updateUser(resetToken.userId, { 
        password: hashedPassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
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
