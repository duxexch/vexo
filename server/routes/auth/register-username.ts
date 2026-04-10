import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, gameplaySettings, referralRewardsLog, projectCurrencyWallets, projectCurrencyLedger } from "@shared/schema";
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
import { isSafeEmailAddress, sanitizePlainText } from "../../lib/input-security";
import { createRewardReference } from "../../lib/reward-reference";

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
      if (email && (typeof email !== 'string' || email.length > 254 || !isSafeEmailAddress(email))) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      if (firstName && (typeof firstName !== 'string' || firstName.length > 50)) {
        return res.status(400).json({ error: "First name must be under 50 characters" });
      }
      if (lastName && (typeof lastName !== 'string' || lastName.length > 50)) {
        return res.status(400).json({ error: "Last name must be under 50 characters" });
      }

      // Normalize text inputs to safe plain text
      const sanitize = (s: string | undefined) => (s ? sanitizePlainText(s, { maxLength: 255 }) : s);

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
          const [rateSetting] = await db.select().from(gameplaySettings)
            .where(eq(gameplaySettings.key, 'referral_reward_rate_percent')).limit(1);
          const rewardAmount = rewardSetting ? rewardSetting.value : '5.00';
          const rewardRatePercent = rateSetting ? rateSetting.value : '100.00';
          const [enabledSetting] = await db.select().from(gameplaySettings)
            .where(eq(gameplaySettings.key, 'referral_reward_enabled')).limit(1);
          const isEnabled = !enabledSetting || enabledSetting.value !== 'false';
          const baseRewardValue = Number.parseFloat(rewardAmount);
          const rewardRateValue = Number.parseFloat(rewardRatePercent);
          const effectiveRewardValue = Number.isFinite(baseRewardValue) && Number.isFinite(rewardRateValue)
            ? (baseRewardValue * (rewardRateValue / 100))
            : 0;

          if (isEnabled && effectiveRewardValue > 0) {
            const referralReferenceId = createRewardReference("referral");
            await db.transaction(async (tx) => {
              await tx.insert(referralRewardsLog).values({
                referrerId: referredBy!,
                referredId: user.id,
                rewardAmount: effectiveRewardValue.toFixed(2),
              });

              await tx.execute(sql`
                INSERT INTO project_currency_wallets (user_id)
                VALUES (${referredBy!})
                ON CONFLICT (user_id) DO NOTHING
              `);

              const [wallet] = await tx.select()
                .from(projectCurrencyWallets)
                .where(eq(projectCurrencyWallets.userId, referredBy!))
                .for('update');

              if (!wallet) {
                throw new Error('Referrer wallet not found');
              }

              const rewardValue = effectiveRewardValue;
              const balanceBefore = parseFloat(wallet.totalBalance || '0');
              const earnedBefore = parseFloat(wallet.earnedBalance || '0');
              const balanceAfter = (balanceBefore + rewardValue).toFixed(2);

              await tx.update(projectCurrencyWallets)
                .set({
                  earnedBalance: (earnedBefore + rewardValue).toFixed(2),
                  totalBalance: balanceAfter,
                  totalEarned: (parseFloat(wallet.totalEarned || '0') + rewardValue).toFixed(2),
                  updatedAt: new Date(),
                })
                .where(eq(projectCurrencyWallets.id, wallet.id));

              await tx.insert(projectCurrencyLedger).values({
                userId: referredBy!,
                walletId: wallet.id,
                type: 'bonus',
                amount: rewardValue.toFixed(2),
                balanceBefore: balanceBefore.toFixed(2),
                balanceAfter,
                referenceId: referralReferenceId,
                referenceType: 'referral_reward',
                description: `Referral reward for inviting ${username.trim()}`,
              });
            });

            // Notify referrer about their bonus
            sendNotification(referredBy!, {
              type: 'transaction',
              priority: 'normal',
              title: 'Referral Bonus Earned!',
              titleAr: 'مكافأة إحالة!',
              message: `You earned ${effectiveRewardValue.toFixed(2)} project coins because your referral "${username.trim()}" joined!`,
              messageAr: `حصلت على ${effectiveRewardValue.toFixed(2)} من عملات المشروع لأن المُحال "${username.trim()}" انضم!`,
              link: '/wallet',
              metadata: JSON.stringify({ action: 'referral_bonus', amount: effectiveRewardValue.toFixed(2), referredUsername: username.trim(), referenceId: referralReferenceId }),
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
