import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, sql, desc, gte } from "drizzle-orm";
import {
  users, games, gameMatches, gameplaySettings,
  dailyRewards, adWatchLog, referralRewardsLog,
} from "@shared/schema";
import { logger } from "../../lib/logger";

export function registerRewardStatusRoutes(app: Express): void {

  // ==================== FREE REWARD STATUS ====================

  app.get("/api/free/rewards", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      // --- Daily Bonus (reuse daily-rewards logic) ---
      const [lastClaim] = await db.select().from(dailyRewards)
        .where(eq(dailyRewards.userId, userId))
        .orderBy(desc(dailyRewards.claimedAt))
        .limit(1);

      const claimedToday = lastClaim && new Date(lastClaim.claimedAt) >= todayStart;
      let currentStreak = 0;
      if (lastClaim) {
        const claimDate = new Date(lastClaim.claimedAt);
        claimDate.setHours(0, 0, 0, 0);
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        if (claimDate >= todayStart || claimDate >= yesterdayStart) {
          currentStreak = lastClaim.streakCount;
        }
      }
      const dailyBonusSchedule = [0.50, 0.75, 1.00, 1.50, 2.00, 3.00, 5.00];
      const nextDay = lastClaim ? (lastClaim.day % 7) + 1 : 1;
      const nextAmount = dailyBonusSchedule[(nextDay - 1)] || 0.50;

      // --- Ad watches today ---
      const adWatchesToday = await db.select({ count: sql<number>`count(*)` })
        .from(adWatchLog)
        .where(and(eq(adWatchLog.userId, userId), gte(adWatchLog.watchedAt, todayStart)));
      const adsWatchedCount = Number(adWatchesToday[0]?.count || 0);

      // Total ad earnings
      const [adEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(${adWatchLog.rewardAmount}), '0')` })
        .from(adWatchLog).where(eq(adWatchLog.userId, userId));

      // --- Settings from gameplaySettings ---
      const settingsRows = await db.select().from(gameplaySettings);
      const settings: Record<string, string> = {};
      for (const row of settingsRows) { settings[row.key] = row.value; }

      const maxAdsPerDay = parseInt(settings['max_ads_per_day'] || '10');
      const adRewardAmount = parseFloat(settings['ad_reward_amount'] || '0.10');
      const referralRewardAmount = parseFloat(settings['referral_reward_amount'] || '5.00');
      const referralRewardRatePercent = parseFloat(settings['referral_reward_rate_percent'] || '100.00');
      const freePlayEnabled = settings['free_play_enabled'] !== 'false';

      // --- Referral count ---
      const [refCount] = await db.select({ count: sql<number>`count(*)` })
        .from(users).where(eq(users.referredBy, userId));

      // --- Referral earnings ---
      const [refEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(${referralRewardsLog.rewardAmount}), '0')` })
        .from(referralRewardsLog).where(eq(referralRewardsLog.referrerId, userId));

      // --- Daily bonus total earned ---
      const [dailyEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(${dailyRewards.amount}), '0')` })
        .from(dailyRewards).where(eq(dailyRewards.userId, userId));

      // --- Free play games (isFreeToPlay games) ---
      const freeGames = await db.select({ id: games.id, name: games.name, imageUrl: games.imageUrl })
        .from(games).where(eq(games.isFreeToPlay, true)).limit(10);

      // --- Free play limit ---
      const freePlayLimit = parseInt(settings['freePlayLimit'] || settings['free_play_limit'] || '0');
      let todayGamesPlayed = 0;
      if (freePlayLimit > 0) {
        const [matchCount] = await db.select({ count: sql<number>`count(*)` })
          .from(gameMatches)
          .where(and(
            or(eq(gameMatches.player1Id, userId), eq(gameMatches.player2Id, userId)),
            gte(gameMatches.createdAt, todayStart)
          ));
        todayGamesPlayed = Number(matchCount?.count || 0);
      }

      res.json({
        enabled: freePlayEnabled,
        dailyBonus: {
          available: !claimedToday,
          claimed: !!claimedToday,
          amount: nextAmount,
          streak: currentStreak,
          nextDay,
          nextClaim: claimedToday ? new Date(todayStart.getTime() + 86400000).toISOString() : null,
        },
        adsWatched: adsWatchedCount,
        maxAdsPerDay,
        adReward: adRewardAmount,
        totalAdEarnings: parseFloat(adEarnings?.total || '0'),
        referrals: Number(refCount?.count || 0),
        referralReward: referralRewardAmount,
        referralRewardRatePercent,
        referralRewardPerInvite: Number.isFinite(referralRewardAmount) && Number.isFinite(referralRewardRatePercent)
          ? Number((referralRewardAmount * (referralRewardRatePercent / 100)).toFixed(2))
          : 0,
        totalReferralEarnings: parseFloat(refEarnings?.total || '0'),
        totalDailyEarnings: parseFloat(dailyEarnings?.total || '0'),
        freeGames,
        freePlayLimit,
        todayGamesPlayed,
        referralCode: req.user!.username,
      });
    } catch (error: unknown) {
      logger.error('Error fetching free rewards', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
