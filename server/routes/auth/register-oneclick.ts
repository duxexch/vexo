import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../../storage";
import { db } from "../../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { registrationRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { toSafeUser } from "../../lib/safe-user";
import { processReferralRegistrationCommission } from "../../lib/affiliate-commissions";
import {
  getErrorMessage,
  getSessionFingerprint,
  setAuthCookie,
  createSession,
} from "./helpers";

export function registerOneClickRoutes(app: Express) {
  // One-click registration - generates account ID and password automatically
  app.post("/api/auth/one-click-register", registrationRateLimiter, async (req: Request, res: Response) => {
    try {
      const { referralCode } = req.body || {};
      const accountId = await storage.generateUniqueAccountId();
      const plainPassword = crypto.randomBytes(8).toString("hex");
      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      const user = await storage.createUser({
        accountId,
        username: `player_${accountId}`,
        password: hashedPassword,
        role: "player",
        status: "active",
        registrationType: "account",
      });

      // Handle referral code if provided
      if (referralCode) {
        try {
          let referrerId: string | null = null;
          // Try affiliate code first
          const affiliate = await storage.getAffiliateByCode(referralCode);
          if (affiliate) {
            referrerId = affiliate.userId;
          } else {
            // Try accountId match
            const [byAccountId] = await db.select().from(users).where(eq(users.accountId, referralCode.trim())).limit(1);
            if (byAccountId) {
              referrerId = byAccountId.id;
            } else {
              // Try username match
              const [byUsername] = await db.select().from(users).where(eq(users.username, referralCode.trim())).limit(1);
              if (byUsername) {
                referrerId = byUsername.id;
              }
            }
          }
          if (referrerId && referrerId !== user.id) {
            await db.update(users).set({ referredBy: referrerId }).where(eq(users.id, user.id));
            await processReferralRegistrationCommission({
              referrerId,
              referredId: user.id,
              referredUsername: `player_${accountId}`,
              legacyDescription: `Referral reward for inviting account ${accountId}`,
            });
          }
        } catch (refErr) {
          // Don't fail registration if referral processing fails
          console.error("One-click referral processing error:", refErr);
        }
      }

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) }, JWT_USER_SECRET, { expiresIn: JWT_USER_EXPIRY });

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: "One-click registration",
        ipAddress: req.ip,
      });

      // Notify admin about new user registration
      emitSystemAlert({
        title: 'New User Registered',
        titleAr: 'مستخدم جديد مسجل',
        message: `New one-click registration: ${accountId} (ID: ${user.id}) from IP ${req.ip || 'unknown'}`,
        messageAr: `تسجيل سريع جديد: ${accountId} (رقم: ${user.id})`,
        severity: 'info',
        deepLink: '/admin/users',
        entityType: 'user',
        entityId: String(user.id),
      }).catch(() => { });

      setAuthCookie(res, token);
      await createSession(user.id, token, req);
      res.json({
        user: toSafeUser(user),
        token,
        credentials: {
          accountId,
          password: plainPassword,
        },
        message: "Save your login credentials! You will need them to access your account."
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
