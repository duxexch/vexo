import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, sql, desc, gte } from "drizzle-orm";
import {
  users, gameplaySettings,
  dailyRewards, adWatchLog,
} from "@shared/schema";
import { sendNotification } from "../../websocket";
import { logger } from "../../lib/logger";

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

      // Insert reward and update balance atomically
      await db.transaction(async (tx) => {
        await tx.insert(dailyRewards).values({
          userId,
          day: currentDay,
          amount: rewardAmount,
          streakCount: currentStreak,
        });
        await tx.update(users)
          .set({ balance: sql`${users.balance} + ${rewardAmount}` })
          .where(eq(users.id, userId));
      });

      res.json({
        success: true,
        amount: parseFloat(rewardAmount),
        day: currentDay,
        streakCount: currentStreak,
        message: `Claimed $${rewardAmount} for day ${currentDay}!`,
      });

      // Notify user about daily bonus (async, non-blocking)
      sendNotification(userId, {
        type: 'promotion',
        priority: 'normal',
        title: `Daily Bonus: Day ${currentDay}! 💰`,
        titleAr: `المكافأة اليومية: اليوم ${currentDay}! 💰`,
        message: `You claimed $${rewardAmount}! Streak: ${currentStreak} day${currentStreak > 1 ? 's' : ''}.`,
        messageAr: `حصلت على $${rewardAmount}! السلسلة: ${currentStreak} يوم.`,
        link: '/free',
        metadata: JSON.stringify({ day: currentDay, streak: currentStreak, amount: rewardAmount }),
      }).catch(() => {});
    } catch (error: unknown) {
      logger.error('Error claiming daily bonus', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/free/watch-ad", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

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

      // Count today's watches
      const [todayCount] = await db.select({ count: sql<number>`count(*)` })
        .from(adWatchLog)
        .where(and(eq(adWatchLog.userId, userId), gte(adWatchLog.watchedAt, todayStart)));

      if (Number(todayCount?.count || 0) >= maxAds) {
        return res.status(400).json({ error: "Daily ad watch limit reached" });
      }

      // Record ad watch and update balance atomically
      await db.transaction(async (tx) => {
        await tx.insert(adWatchLog).values({
          userId,
          rewardAmount: rewardAmt,
        });
        await tx.update(users)
          .set({ balance: sql`${users.balance} + ${rewardAmt}` })
          .where(eq(users.id, userId));
      });

      res.json({
        success: true,
        amount: parseFloat(rewardAmt),
        adsWatched: Number(todayCount?.count || 0) + 1,
        maxAdsPerDay: maxAds,
      });

      // Notify user about ad reward (async, non-blocking)
      sendNotification(userId, {
        type: 'promotion',
        priority: 'low',
        title: 'Ad Reward Earned! 💵',
        titleAr: 'مكافأة إعلانية! 💵',
        message: `You earned $${rewardAmt} from watching an ad.`,
        messageAr: `حصلت على $${rewardAmt} من مشاهدة إعلان.`,
        link: '/free',
        metadata: JSON.stringify({ type: 'ad_reward', amount: rewardAmt }),
      }).catch(() => {});
    } catch (error: unknown) {
      logger.error('Error watching ad', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
