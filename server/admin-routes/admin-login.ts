import type { Express, Request, Response } from "express";
import { users, twoFactorBackupCodes } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_ADMIN_SECRET, JWT_ADMIN_EXPIRY } from "../lib/auth-config";
import { logger } from "../lib/logger";
import { authRateLimiter, sensitiveRateLimiter } from "../routes/middleware";
import {
  type AdminRequest,
  adminAuthMiddleware,
  logAdminAction,
  getErrorMessage,
  verifyTOTP,
  generateAdmin2FAChallenge,
  verifyAdmin2FAChallenge,
} from "./helpers";

export function registerAdminLoginRoutes(app: Express) {

  // ==================== ADMIN LOGIN ====================

  app.post("/api/admin/login", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password, totpCode } = req.body;

      // Find admin user
      const [admin] = await db.select().from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!admin || admin.role !== "admin") {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check lockout
      if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(admin.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({
          error: `Account locked. Try again in ${remainingMinutes} minutes.`,
          lockedUntil: admin.lockedUntil
        });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, admin.password);
      if (!isValid) {
        // Increment failed attempts
        const attempts = (admin.failedLoginAttempts || 0) + 1;
        const lockout = attempts >= 3 ? new Date(Date.now() + 30 * 60000) : null; // Lock for 30 min after 3 fails
        await db.update(users).set({
          failedLoginAttempts: attempts,
          lockedUntil: lockout,
        }).where(eq(users.id, admin.id));

        await logAdminAction(admin.id, "login_failed", "admin", admin.id, {
          reason: "Invalid admin password",
          metadata: JSON.stringify({ attempts }),
        }, req);

        if (lockout) {
          await logAdminAction(admin.id, "account_locked", "admin", admin.id, {
            reason: "Admin account locked after repeated failed logins",
            metadata: JSON.stringify({ attempts }),
          }, req);
        }

        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check 2FA if enabled
      if (admin.twoFactorEnabled && admin.twoFactorSecret) {
        if (!totpCode) {
          const challengeToken = generateAdmin2FAChallenge(admin.id);
          return res.status(200).json({ requires2FA: true, challengeToken, message: "2FA code required" });
        }

        // Check backup codes first
        let isBackupCode = false;
        if (totpCode.length === 8) {
          const allCodes = await db.select().from(twoFactorBackupCodes)
            .where(eq(twoFactorBackupCodes.userId, admin.id));
          for (const bc of allCodes) {
            if (bc.usedAt) {
              continue;
            }

            const isMatch = await bcrypt.compare(totpCode.toUpperCase(), bc.codeHash);
            if (isMatch) {
              isBackupCode = true;
              await db.update(twoFactorBackupCodes)
                .set({ usedAt: new Date() })
                .where(eq(twoFactorBackupCodes.id, bc.id));
              break;
            }
          }
        }

        if (!isBackupCode && !verifyTOTP(admin.twoFactorSecret, totpCode)) {
          await logAdminAction(admin.id, "login_failed", "admin", admin.id, {
            reason: "Invalid admin 2FA code during login",
          }, req);
          return res.status(401).json({ error: "Invalid 2FA code" });
        }
      }

      // Reset failed attempts on success
      await db.update(users).set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      }).where(eq(users.id, admin.id));

      const token = jwt.sign(
        { id: admin.id, role: admin.role, username: admin.username },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_ADMIN_EXPIRY }
      );

      await logAdminAction(admin.id, "admin_login", "admin", admin.id, {
        metadata: JSON.stringify({ ip: req.ip })
      }, req);

      res.json({
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
          email: admin.email,
          twoFactorEnabled: admin.twoFactorEnabled,
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // 2FA verification for existing session
  app.post("/api/admin/verify-2fa", sensitiveRateLimiter, async (req: AdminRequest, res: Response) => {
    try {
      const { code, challengeToken } = req.body;
      if (!code || !challengeToken) {
        return res.status(400).json({ error: "Code and challenge token are required" });
      }

      const adminId = verifyAdmin2FAChallenge(challengeToken);
      if (!adminId) {
        logger.warn("[AdminAuth] Invalid or expired admin 2FA challenge token", {
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });
        return res.status(400).json({ error: "Invalid or expired challenge token. Please login again." });
      }

      const [admin] = await db.select().from(users)
        .where(eq(users.id, adminId))
        .limit(1);

      if (!admin || admin.role !== "admin" || !admin.twoFactorSecret) {
        return res.status(400).json({ error: "2FA not configured" });
      }

      // Verify TOTP code
      if (!verifyTOTP(admin.twoFactorSecret, code)) {
        await logAdminAction(admin.id, "login_failed", "admin", admin.id, {
          reason: "Invalid admin 2FA code during challenge verification",
        }, req);
        return res.status(401).json({ error: "Invalid 2FA code" });
      }

      // Generate token
      const token = jwt.sign(
        { id: admin.id, role: admin.role, username: admin.username },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_ADMIN_EXPIRY }
      );

      res.json({
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
          email: admin.email,
          twoFactorEnabled: true,
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get current admin info
  app.get("/api/admin/me", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      if (!req.admin) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [admin] = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        twoFactorEnabled: users.twoFactorEnabled,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, req.admin.id)).limit(1);

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      res.json(admin);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
