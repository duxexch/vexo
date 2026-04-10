import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, sql, desc, gte } from "drizzle-orm";
import {
  advertisements,
  freePlayAdEvents,
  gameplaySettings,
  dailyRewards, adWatchLog,
  projectCurrencyWallets, projectCurrencyLedger,
} from "@shared/schema";
import { sendNotification } from "../../websocket";
import { logger } from "../../lib/logger";
import { createRewardReference } from "../../lib/reward-reference";

export function registerRewardClaimRoutes(app: Express): void {

  // ==================== REWARD CLAIMS ====================

  app.post("/api/free/claim-daily", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      // Check settings
      const enabledSetting = await db.select().from(gameplaySettings)
        .where(eq(gameplaySettings.key, 'daily_bonus_enabled')).limit(1);
      if (enabledSetting.length > 0 && enabledSetting[0].value === 'false') {
        return res.status(400).json({ error: "Daily bonus is currently disabled" });
      }

      // Get last claim
      const [lastClaim] = await db.select().from(dailyRewards)
        .where(eq(dailyRewards.userId, userId))
        .orderBy(desc(dailyRewards.claimedAt))
        .limit(1);

      // Check if already claimed today
      if (lastClaim && new Date(lastClaim.claimedAt) >= todayStart) {
        return res.status(400).json({ error: "Already claimed today" });
      }

      // Calculate streak and day
      let currentStreak = 1;
      let currentDay = 1;
      if (lastClaim) {
        const claimDate = new Date(lastClaim.claimedAt);
        claimDate.setHours(0, 0, 0, 0);
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        if (claimDate >= yesterdayStart) {
          currentStreak = lastClaim.streakCount + 1;
          currentDay = (lastClaim.day % 7) + 1;
        }
      }

      const REWARD_SCHEDULE = ["0.50", "0.75", "1.00", "1.50", "2.00", "3.00", "5.00"];
      const rewardAmount = REWARD_SCHEDULE[currentDay - 1] || "0.50";
      const rewardReferenceId = createRewardReference("daily");

      // Insert reward and credit project-currency wallet atomically.
      await db.transaction(async (tx) => {
        await tx.insert(dailyRewards).values({
          userId,
          day: currentDay,
          amount: rewardAmount,
          streakCount: currentStreak,
        });

        await tx.execute(sql`
          INSERT INTO project_currency_wallets (user_id)
          VALUES (${userId})
          ON CONFLICT (user_id) DO NOTHING
        `);

        const [wallet] = await tx.select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, userId))
          .for("update");

        if (!wallet) {
          throw new Error("Project currency wallet not found");
        }

        const rewardValue = parseFloat(rewardAmount);
        const balanceBefore = parseFloat(wallet.totalBalance || "0");
        const earnedBefore = parseFloat(wallet.earnedBalance || "0");
        const totalEarnedBefore = parseFloat(wallet.totalEarned || "0");
        const balanceAfter = (balanceBefore + rewardValue).toFixed(2);

        await tx.update(projectCurrencyWallets)
          .set({
            earnedBalance: (earnedBefore + rewardValue).toFixed(2),
            totalBalance: balanceAfter,
            totalEarned: (totalEarnedBefore + rewardValue).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(projectCurrencyWallets.id, wallet.id));

        await tx.insert(projectCurrencyLedger).values({
          userId,
          walletId: wallet.id,
          type: "bonus",
          amount: rewardValue.toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter,
          referenceId: rewardReferenceId,
          referenceType: "daily_reward",
          description: `Free page daily reward day ${currentDay}`,
        });
      });

      res.json({
        success: true,
        amount: parseFloat(rewardAmount),
        day: currentDay,
        streakCount: currentStreak,
        referenceId: rewardReferenceId,
        message: `Claimed ${rewardAmount} project coins for day ${currentDay}!`,
      });

      // Notify user about daily bonus (async, non-blocking)
      sendNotification(userId, {
        type: 'promotion',
        priority: 'normal',
        title: `Daily Bonus: Day ${currentDay}!`,
        titleAr: `المكافأة اليومية: اليوم ${currentDay}!`,
        message: `You claimed ${rewardAmount} project coins. Ref: ${rewardReferenceId}`,
        messageAr: `حصلت على ${rewardAmount} من عملة المشروع. المرجع: ${rewardReferenceId}`,
        link: '/free',
        metadata: JSON.stringify({ day: currentDay, streak: currentStreak, amount: rewardAmount, referenceId: rewardReferenceId }),
      }).catch(() => { });
    } catch (error: unknown) {
      logger.error('Error claiming daily bonus', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/free/watch-ad", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const adIdRaw = req.body?.adId;
      const adId = typeof adIdRaw === "string" && adIdRaw.trim() ? adIdRaw.trim() : null;
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      if (adId) {
        const [ad] = await db.select({ id: advertisements.id, isActive: advertisements.isActive })
          .from(advertisements)
          .where(eq(advertisements.id, adId))
          .limit(1);

        if (!ad || !ad.isActive) {
          return res.status(400).json({ error: "Invalid or inactive ad campaign" });
        }
      }

      // Check settings
      const enabledSetting = await db.select().from(gameplaySettings)
        .where(eq(gameplaySettings.key, 'ad_reward_enabled')).limit(1);
      if (enabledSetting.length > 0 && enabledSetting[0].value === 'false') {
        return res.status(400).json({ error: "Ad rewards are currently disabled" });
      }

      // Get max ads per day and reward amount
      const settingsRows = await db.select().from(gameplaySettings)
        .where(or(
          eq(gameplaySettings.key, 'max_ads_per_day'),
          eq(gameplaySettings.key, 'ad_reward_amount')
        ));
      const cfg: Record<string, string> = {};
      for (const r of settingsRows) { cfg[r.key] = r.value; }
      const maxAds = parseInt(cfg['max_ads_per_day'] || '10');
      const rewardAmt = cfg['ad_reward_amount'] || '0.10';
      const rewardReferenceId = createRewardReference("ad");

      // Count today's watches
      const [todayCount] = await db.select({ count: sql<number>`count(*)` })
        .from(adWatchLog)
        .where(and(eq(adWatchLog.userId, userId), gte(adWatchLog.watchedAt, todayStart)));

      if (Number(todayCount?.count || 0) >= maxAds) {
        return res.status(400).json({ error: "Daily ad watch limit reached" });
      }

      // Record ad watch and credit project-currency wallet atomically.
      await db.transaction(async (tx) => {
        await tx.insert(adWatchLog).values({
          userId,
          rewardAmount: rewardAmt,
        });

        await tx.insert(freePlayAdEvents).values({
          advertisementId: adId,
          userId,
          eventType: "reward_claim",
          rewardAmount: rewardAmt,
          source: "free_watch_ad",
          ipAddress: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null,
          userAgent: String(req.headers["user-agent"] || "").slice(0, 512),
          metadata: adId ? JSON.stringify({ adId }) : null,
        });

        await tx.execute(sql`
          INSERT INTO project_currency_wallets (user_id)
          VALUES (${userId})
          ON CONFLICT (user_id) DO NOTHING
        `);

        const [wallet] = await tx.select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, userId))
          .for("update");

        if (!wallet) {
          throw new Error("Project currency wallet not found");
        }

        const rewardValue = parseFloat(rewardAmt);
        const balanceBefore = parseFloat(wallet.totalBalance || "0");
        const earnedBefore = parseFloat(wallet.earnedBalance || "0");
        const totalEarnedBefore = parseFloat(wallet.totalEarned || "0");
        const balanceAfter = (balanceBefore + rewardValue).toFixed(2);

        await tx.update(projectCurrencyWallets)
          .set({
            earnedBalance: (earnedBefore + rewardValue).toFixed(2),
            totalBalance: balanceAfter,
            totalEarned: (totalEarnedBefore + rewardValue).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(projectCurrencyWallets.id, wallet.id));

        await tx.insert(projectCurrencyLedger).values({
          userId,
          walletId: wallet.id,
          type: "bonus",
          amount: rewardValue.toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter,
          referenceId: rewardReferenceId,
          referenceType: "ad_reward",
          description: "Ad watch reward",
        });
      });

      res.json({
        success: true,
        amount: parseFloat(rewardAmt),
        adsWatched: Number(todayCount?.count || 0) + 1,
        maxAdsPerDay: maxAds,
        referenceId: rewardReferenceId,
      });

      // Notify user about ad reward (async, non-blocking)
      sendNotification(userId, {
        type: 'promotion',
        priority: 'low',
        title: 'Ad Reward Earned!',
        titleAr: 'مكافأة إعلانية!',
        message: `You earned ${rewardAmt} project coins. Ref: ${rewardReferenceId}`,
        messageAr: `حصلت على ${rewardAmt} من عملة المشروع. المرجع: ${rewardReferenceId}`,
        link: '/free',
        metadata: JSON.stringify({ type: 'ad_reward', amount: rewardAmt, referenceId: rewardReferenceId }),
      }).catch(() => { });
    } catch (error: unknown) {
      logger.error('Error watching ad', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
