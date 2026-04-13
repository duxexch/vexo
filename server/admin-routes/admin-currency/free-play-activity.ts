import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  dailyRewards, adWatchLog, referralRewardsLog,
} from "@shared/schema";
import { db } from "../../db";
import { desc, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "../helpers";

export function registerFreePlayActivityRoutes(app: Express) {

  app.get("/api/admin/free-play/activity", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const type = req.query.type as string;

      let activities: { type: string; details: string; date: string | Date; userId?: string; username?: string; amount?: number | string | null;[key: string]: unknown }[] = [];

      if (!type || type === 'daily') {
        const dailyClaims = await db.select({
          id: dailyRewards.id,
          userId: dailyRewards.userId,
          amount: dailyRewards.amount,
          day: dailyRewards.day,
          streak: dailyRewards.streakCount,
          date: dailyRewards.claimedAt,
        }).from(dailyRewards).orderBy(desc(dailyRewards.claimedAt)).limit(limit);

        for (const c of dailyClaims) {
          const u = await storage.getUser(c.userId);
          activities.push({
            type: 'daily_bonus',
            userId: c.userId,
            username: u?.username || 'Unknown',
            amount: c.amount,
            details: `Day ${c.day}, Streak ${c.streak}`,
            date: c.date,
          });
        }
      }

      if (!type || type === 'ads') {
        const adWatches = await db.select({
          id: adWatchLog.id,
          userId: adWatchLog.userId,
          amount: adWatchLog.rewardAmount,
          date: adWatchLog.watchedAt,
        }).from(adWatchLog).orderBy(desc(adWatchLog.watchedAt)).limit(limit);

        for (const a of adWatches) {
          const u = await storage.getUser(a.userId);
          activities.push({
            type: 'ad_watch',
            userId: a.userId,
            username: u?.username || 'Unknown',
            amount: a.amount,
            details: 'Watched ad',
            date: a.date,
          });
        }
      }

      if (!type || type === 'referrals') {
        const refRewards = await db.select({
          id: referralRewardsLog.id,
          referrerId: referralRewardsLog.referrerId,
          referredId: referralRewardsLog.referredId,
          amount: referralRewardsLog.rewardAmount,
          rewardType: referralRewardsLog.rewardType,
          rewardStatus: referralRewardsLog.rewardStatus,
          date: referralRewardsLog.createdAt,
        }).from(referralRewardsLog).orderBy(desc(referralRewardsLog.createdAt)).limit(limit);

        for (const r of refRewards) {
          const referrer = await storage.getUser(r.referrerId);
          const referred = await storage.getUser(r.referredId);
          activities.push({
            type: 'referral_reward',
            userId: r.referrerId,
            username: referrer?.username || 'Unknown',
            amount: r.amount,
            details: `${String(r.rewardType).toUpperCase()} (${r.rewardStatus}) - ${referred?.username || 'Unknown'}`,
            date: r.date,
          });
        }
      }

      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      activities = activities.slice(0, limit);

      res.json(activities);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/free-play/top-referrers", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const topReferrers = await db.select({
        referrerId: referralRewardsLog.referrerId,
        totalRewards: sql<string>`SUM(CASE WHEN ${referralRewardsLog.rewardStatus} IN ('released', 'paid') THEN ${referralRewardsLog.rewardAmount}::numeric ELSE 0 END)`,
        referralCount: sql<number>`count(*)`,
      })
        .from(referralRewardsLog)
        .groupBy(referralRewardsLog.referrerId)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

      const result = [];
      for (const r of topReferrers) {
        const u = await storage.getUser(r.referrerId);
        result.push({
          userId: r.referrerId,
          username: u?.username || 'Unknown',
          nickname: u?.nickname,
          referralCount: Number(r.referralCount),
          totalRewards: parseFloat(r.totalRewards || '0'),
        });
      }

      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
