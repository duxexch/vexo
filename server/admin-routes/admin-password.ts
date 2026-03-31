import type { Express, Request, Response } from "express";
import { users, passwordResetTokens } from "@shared/schema";
import { db } from "../db";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authRateLimiter } from "../routes/middleware";
import { sendEmail, buildResetPasswordEmailHtml } from "../lib/messaging";
import { logAdminAction, getErrorMessage } from "./helpers";

export function registerAdminPasswordRoutes(app: Express) {

  // ==================== PASSWORD RECOVERY ====================

  // Step 1: Request password reset (send code to email)
  app.post("/api/admin/forgot-password", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Find admin user by email
      const [admin] = await db.select().from(users)
        .where(eq(users.email, email))
        .limit(1);

      // Always return success to prevent email enumeration
      if (!admin || admin.role !== "admin") {
        return res.json({ success: true, message: "If an admin account with this email exists, a reset code has been sent." });
      }

      // Generate 6-digit reset code
      const resetCode = crypto.randomInt(100000, 999999).toString();
      const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

      // Store reset token in passwordResetTokens table
      const tokenHash = crypto.createHash('sha256').update(resetCode).digest('hex');
      await db.insert(passwordResetTokens).values({
        userId: admin.id,
        tokenHash,
        expiresAt: resetExpiry,
      });

      // Send email with reset code
      try {
        const html = buildResetPasswordEmailHtml(resetCode, 15);
        await sendEmail({ to: email, subject: "VEX Admin Password Reset", text: `Your reset code: ${resetCode}`, html });
      } catch (emailErr) {
        // Log but don't expose email delivery failures
        console.error("Failed to send reset email:", emailErr);
      }

      await logAdminAction(admin.id, "settings_change", "admin", admin.id, {
        metadata: JSON.stringify({ action: "password_reset_requested", ip: req.ip })
      }, req);

      res.json({ success: true, message: "If an admin account with this email exists, a reset code has been sent." });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Step 2: Verify code and reset password
  app.post("/api/admin/reset-password", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, code, and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const [admin] = await db.select().from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!admin || admin.role !== "admin") {
        return res.status(400).json({ error: "Invalid reset code" });
      }

      // Verify code against passwordResetTokens table
      const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
      const [resetToken] = await db.select().from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.userId, admin.id),
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
        ))
        .limit(1);

      if (!resetToken) {
        return res.status(400).json({ error: "Invalid reset code" });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Reset code has expired. Please request a new one." });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await db.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));
      await db.update(users).set({
        password: hashedPassword,
        failedLoginAttempts: 0,
        lockedUntil: null,
      }).where(eq(users.id, admin.id));

      await logAdminAction(admin.id, "settings_change", "admin", admin.id, {
        metadata: JSON.stringify({ action: "password_reset_completed", ip: req.ip })
      }, req);

      res.json({ success: true, message: "Password has been reset successfully." });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
