import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../../storage";
import { db } from "../../db";
import { twoFactorBackupCodes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest, strictRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import {
  getErrorMessage,
  getSessionFingerprint,
  verifyTOTP,
  sendSecurityNotification,
  setAuthCookie,
  createSession,
  handleSuccessfulLogin,
  verify2FAChallenge,
} from "./helpers";

async function logTwoFactorFailure(userId: string, req: Request, reason: string): Promise<void> {
  try {
    await storage.createAuditLog({
      userId,
      action: "login_failed",
      entityType: "user",
      entityId: userId,
      details: `2FA verification failed: ${reason}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch {
    // non-blocking
  }
}

export function registerTwoFactorAuthRoutes(app: Express) {

  // SECURITY: Rate limit 2FA verification to prevent TOTP brute-force (6-digit = 1M combinations)
  app.post("/api/auth/2fa/verify", strictRateLimiter, async (req: Request, res: Response) => {
    try {
      const { challengeToken, code, isBackupCode } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Verification code is required" });
      }

      if (!challengeToken || typeof challengeToken !== "string") {
        return res.status(400).json({ error: "Challenge token is required" });
      }

      // SECURITY: Derive userId only from challenge token (never trust client userId)
      const userId = verify2FAChallenge(challengeToken);
      if (!userId) {
        return res.status(400).json({ error: "Invalid or expired challenge token. Please login again." });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return res.status(400).json({ error: "Invalid request" });
      }

      let verified = false;

      if (isBackupCode) {
        // SECURITY: Verify against backup codes using bcrypt (one-time use)
        // Fetch all unused codes for this user and compare with bcrypt
        const unusedBackupCodes = await db.select()
          .from(twoFactorBackupCodes)
          .where(and(
            eq(twoFactorBackupCodes.userId, user.id),
            sql`${twoFactorBackupCodes.usedAt} IS NULL`,
          ));

        for (const backupCode of unusedBackupCodes) {
          const isMatch = await bcrypt.compare(code.toUpperCase(), backupCode.codeHash);
          if (isMatch) {
            verified = true;
            await db.update(twoFactorBackupCodes)
              .set({ usedAt: new Date() })
              .where(eq(twoFactorBackupCodes.id, backupCode.id));
            break;
          }
        }
      } else {
        verified = verifyTOTP(user.twoFactorSecret, code);
      }

      if (!verified) {
        await logTwoFactorFailure(user.id, req, "invalid_code_or_backup_code");
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Issue full JWT
      const token = jwt.sign(
        { id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) },
        JWT_USER_SECRET,
        { expiresIn: JWT_USER_EXPIRY }
      );

      await handleSuccessfulLogin(user);
      setAuthCookie(res, token);
      await createSession(user.id, token, req);

      try {
        await storage.createAuditLog({
          userId: user.id,
          action: "login",
          entityType: "user",
          entityId: user.id,
          details: "User logged in after 2FA verification",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      } catch {
        // non-blocking
      }

      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Disable 2FA (requires password confirmation)
  app.post("/api/auth/2fa/disable", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password is required to disable 2FA" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (!user.twoFactorEnabled) {
        return res.status(400).json({ error: "2FA is not enabled" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid password" });
      }

      // Disable 2FA and delete backup codes
      await storage.updateUser(user.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorVerifiedAt: null,
      });

      await db.delete(twoFactorBackupCodes)
        .where(eq(twoFactorBackupCodes.userId, user.id));

      sendSecurityNotification(
        user.id,
        "Two-Factor Authentication Disabled",
        "تم تعطيل المصادقة الثنائية",
        "Two-factor authentication has been disabled on your account.",
        "تم تعطيل المصادقة الثنائية من حسابك."
      );

      res.json({ success: true, message: "2FA disabled" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get 2FA status
  app.get("/api/auth/2fa/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Count remaining backup codes
      const unusedCodes = await db.select({ id: twoFactorBackupCodes.id })
        .from(twoFactorBackupCodes)
        .where(and(
          eq(twoFactorBackupCodes.userId, user.id),
          sql`${twoFactorBackupCodes.usedAt} IS NULL`,
        ));

      res.json({
        enabled: user.twoFactorEnabled,
        verifiedAt: user.twoFactorVerifiedAt,
        backupCodesRemaining: unusedCodes.length,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
