import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, gameplaySettings, referralRewardsLog } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { registrationRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { sendNotification } from "../../websocket";
import { toSafeUser } from "../../lib/safe-user";
import {
  getErrorMessage,
  getSessionFingerprint,
  setAuthCookie,
  createSession,
  validatePasswordStrength,
} from "./helpers";

export function registerUsernameRegistrationRoutes(app: Express) {
  app.post("/api/auth/register", registrationRateLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password, email, firstName, lastName, referralCode } = req.body;

      // Input validation
      if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 30) {
        return res.status(400).json({ error: "Username must be 3-30 characters" });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
        return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
      }
      if (!password || typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return res.status(400).json({ error: "Password must be 8-72 characters" });
      }
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ error: pwCheck.error });
      }
      if (email && (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      if (firstName && (typeof firstName !== 'string' || firstName.length > 50)) {
        return res.status(400).json({ error: "First name must be under 50 characters" });
      }
      if (lastName && (typeof lastName !== 'string' || lastName.length > 50)) {
        return res.status(400).json({ error: "Last name must be under 50 characters" });
      }

      // Strip HTML tags from string inputs
      const sanitize = (s: string | undefined) => s ? s.replace(/<[^>]*>/g, '').trim() : s;

      const existing = await storage.getUserByUsername(username.trim());
      if (existing) {
        return res.status(400).json({ error: "Registration failed. Please try a different username." });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      let referredBy = null;

      if (referralCode) {
        const affiliate = await storage.getAffiliateByCode(referralCode);
        if (affiliate) {
          referredBy = affiliate.userId;
          await storage.updateAffiliate(affiliate.id, {
            totalReferrals: affiliate.totalReferrals + 1,
            totalRegistrations: affiliate.totalRegistrations + 1,
          });
        } else {
          // Also support referral by accountId or username
          const [referrer] = await db.select({ id: users.id })
            .from(users)
            .where(eq(users.accountId, referralCode.trim()))
            .limit(1);
          if (referrer) {
            referredBy = referrer.id;
          } else {
            const [referrerByUsername] = await db.select({ id: users.id })
              .from(users)
              .where(eq(users.username, referralCode.trim()))
              .limit(1);
            if (referrerByUsername) {
              referredBy = referrerByUsername.id;
            }
          }
        }
      }

      const user = await storage.createUser({
        username: username.trim(),
        password: hashedPassword,
        email: sanitize(email),
        firstName: sanitize(firstName),
        lastName: sanitize(lastName),
        referredBy,
        role: "player",
        status: "active",
        registrationType: "username",
      });

      // Give referral reward to the referrer
      if (referredBy) {
        try {
          const [rewardSetting] = await db.select().from(gameplaySettings)
            .where(eq(gameplaySettings.key, 'referral_reward_amount')).limit(1);
          const rewardAmount = rewardSetting ? rewardSetting.value : '5.00';
          const [enabledSetting] = await db.select().from(gameplaySettings)
            .where(eq(gameplaySettings.key, 'referral_reward_enabled')).limit(1);
          const isEnabled = !enabledSetting || enabledSetting.value !== 'false';

          if (isEnabled && parseFloat(rewardAmount) > 0) {
            await db.transaction(async (tx) => {
              await tx.insert(referralRewardsLog).values({
                referrerId: referredBy!,
                referredId: user.id,
                rewardAmount: rewardAmount,
              });
              await tx.update(users)
                .set({ balance: sql`${users.balance} + ${rewardAmount}` })
                .where(eq(users.id, referredBy!));
            });

            // Notify referrer about their bonus
            sendNotification(referredBy!, {
              type: 'transaction',
              priority: 'normal',
              title: 'Referral Bonus Earned!',
              titleAr: 'مكافأة إحالة!',
              message: `You earned $${rewardAmount} because your referral "${username.trim()}" joined!`,
              messageAr: `حصلت على $${rewardAmount} لأن المُحال "${username.trim()}" انضم!`,
              link: '/wallet',
              metadata: JSON.stringify({ action: 'referral_bonus', amount: rewardAmount, referredUsername: username.trim() }),
            }).catch(() => { });
          }
        } catch (rewardError) {
          console.error("Error giving referral reward:", rewardError);
        }
      }

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) }, JWT_USER_SECRET, { expiresIn: JWT_USER_EXPIRY });

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: "User registered",
      });

      // Notify admin about new user registration
      emitSystemAlert({
        title: 'New User Registered',
        titleAr: 'مستخدم جديد مسجل',
        message: `New registration: ${user.username} (ID: ${user.id})${email ? ` email: ${email}` : ''}`,
        messageAr: `تسجيل جديد: ${user.username} (رقم: ${user.id})`,
        severity: 'info',
        deepLink: '/admin/users',
        entityType: 'user',
        entityId: String(user.id),
      }).catch(() => { });

      setAuthCookie(res, token);
      await createSession(user.id, token, req);
      res.json({ user: toSafeUser(user), token });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
