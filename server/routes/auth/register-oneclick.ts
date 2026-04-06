import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, gameplaySettings, referralRewardsLog, affiliates, projectCurrencyWallets, projectCurrencyLedger } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { registrationRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { toSafeUser } from "../../lib/safe-user";
import {
  getErrorMessage,
  getSessionFingerprint,
  setAuthCookie,
  createSession,
} from "./helpers";
import { createRewardReference } from "../../lib/reward-reference";

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
            // Increment affiliate referrals inline
            await db.update(affiliates).set({ totalReferrals: sql`${affiliates.totalReferrals} + 1` }).where(eq(affiliates.id, affiliate.id));
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
            // Give referral reward
            const [rewardSetting] = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "referral_reward_amount"));
            const [enabledSetting] = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "referral_reward_enabled"));
            const rewardAmount = rewardSetting ? parseFloat(rewardSetting.value) : 5;
            const isEnabled = enabledSetting ? enabledSetting.value === "true" : true;
            if (isEnabled && rewardAmount > 0) {
              const referralReferenceId = createRewardReference("referral");
              // SECURITY: Atomic referral reward with transaction
              await db.transaction(async (tx) => {
                await tx.insert(referralRewardsLog).values({
                  referrerId,
                  referredId: user.id,
                  rewardAmount: rewardAmount.toFixed(2),
                });

                await tx.execute(sql`
                  INSERT INTO project_currency_wallets (user_id)
                  VALUES (${referrerId})
                  ON CONFLICT (user_id) DO NOTHING
                `);

                const [wallet] = await tx.select()
                  .from(projectCurrencyWallets)
                  .where(eq(projectCurrencyWallets.userId, referrerId))
                  .for('update');

                if (!wallet) {
                  throw new Error('Referrer wallet not found');
                }

                const balanceBefore = parseFloat(wallet.totalBalance || '0');
                const earnedBefore = parseFloat(wallet.earnedBalance || '0');
                const balanceAfter = (balanceBefore + rewardAmount).toFixed(2);

                await tx.update(projectCurrencyWallets)
                  .set({
                    earnedBalance: (earnedBefore + rewardAmount).toFixed(2),
                    totalBalance: balanceAfter,
                    totalEarned: (parseFloat(wallet.totalEarned || '0') + rewardAmount).toFixed(2),
                    updatedAt: new Date(),
                  })
                  .where(eq(projectCurrencyWallets.id, wallet.id));

                await tx.insert(projectCurrencyLedger).values({
                  userId: referrerId,
                  walletId: wallet.id,
                  type: 'bonus',
                  amount: rewardAmount.toFixed(2),
                  balanceBefore: balanceBefore.toFixed(2),
                  balanceAfter,
                  referenceId: referralReferenceId,
                  referenceType: 'referral_reward',
                  description: `Referral reward for inviting account ${accountId}`,
                });
              });
            }
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
