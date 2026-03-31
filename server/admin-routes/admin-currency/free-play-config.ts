import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  gameplaySettings, dailyRewards, adWatchLog,
  referralRewardsLog, gameMatches, users,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, sql, gte } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerFreePlayConfigRoutes(app: Express) {

  app.get("/api/admin/free-play/settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const freePlayKeys = [
        'free_play_enabled', 'daily_bonus_enabled', 'ad_reward_enabled',
        'referral_reward_enabled', 'ad_reward_amount', 'max_ads_per_day',
        'referral_reward_amount', 'freePlayLimit', 'free_play_limit'
      ];
      const allSettings = await db.select().from(gameplaySettings);
      const freePlaySettings: Record<string, any> = {};
      for (const row of allSettings) {
        if (freePlayKeys.includes(row.key)) {
          freePlaySettings[row.key] = {
            id: row.id,
            key: row.key,
            value: row.value,
            description: row.description,
            descriptionAr: row.descriptionAr,
          };
        }
      }
      res.json(freePlaySettings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/free-play/settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: "settings object required" });
      }

      for (const [key, value] of Object.entries(settings)) {
        const [existing] = await db.select().from(gameplaySettings)
          .where(eq(gameplaySettings.key, key)).limit(1);
        if (existing) {
          await db.update(gameplaySettings)
            .set({ value: String(value), updatedBy: req.admin!.id, updatedAt: new Date() })
            .where(eq(gameplaySettings.key, key));
        } else {
          await db.insert(gameplaySettings).values({
            key,
            value: String(value),
            description: `Free play setting: ${key}`,
            updatedBy: req.admin!.id,
          });
        }
      }

      await logAdminAction(req.admin!.id, "settings_change", "free_play", "settings", {
        newValue: JSON.stringify(settings),
        reason: "Updated free play settings",
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/free-play/stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      // Daily rewards stats
      const [dailyClaimsToday] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${dailyRewards.amount}), '0')` })
        .from(dailyRewards).where(gte(dailyRewards.claimedAt, todayStart));
      const [dailyClaimsWeek] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${dailyRewards.amount}), '0')` })
        .from(dailyRewards).where(gte(dailyRewards.claimedAt, weekStart));
      const [dailyClaimsAll] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${dailyRewards.amount}), '0')` })
        .from(dailyRewards);

      // Ad watch stats
      const [adWatchesToday] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${adWatchLog.rewardAmount}), '0')` })
        .from(adWatchLog).where(gte(adWatchLog.watchedAt, todayStart));
      const [adWatchesWeek] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${adWatchLog.rewardAmount}), '0')` })
        .from(adWatchLog).where(gte(adWatchLog.watchedAt, weekStart));
      const [adWatchesAll] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${adWatchLog.rewardAmount}), '0')` })
        .from(adWatchLog);

      // Referral stats
      const [referralsToday] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${referralRewardsLog.rewardAmount}), '0')` })
        .from(referralRewardsLog).where(gte(referralRewardsLog.createdAt, todayStart));
      const [referralsWeek] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${referralRewardsLog.rewardAmount}), '0')` })
        .from(referralRewardsLog).where(gte(referralRewardsLog.createdAt, weekStart));
      const [referralsAll] = await db.select({ count: sql<number>`count(*)`, total: sql<string>`COALESCE(SUM(${referralRewardsLog.rewardAmount}), '0')` })
        .from(referralRewardsLog);

      const dailyTotal = parseFloat(dailyClaimsAll?.total || '0');
      const adTotal = parseFloat(adWatchesAll?.total || '0');
      const referralTotal = parseFloat(referralsAll?.total || '0');

      const [gamesToday] = await db.select({ count: sql<number>`count(*)` })
        .from(gameMatches).where(gte(gameMatches.createdAt, todayStart));

      const [usersWithReferrals] = await db.select({ count: sql<number>`count(DISTINCT ${users.referredBy})` })
        .from(users).where(sql`${users.referredBy} IS NOT NULL`);

      res.json({
        dailyBonus: {
          today: { claims: Number(dailyClaimsToday?.count || 0), total: parseFloat(dailyClaimsToday?.total || '0') },
          week: { claims: Number(dailyClaimsWeek?.count || 0), total: parseFloat(dailyClaimsWeek?.total || '0') },
          allTime: { claims: Number(dailyClaimsAll?.count || 0), total: dailyTotal },
        },
        adWatches: {
          today: { watches: Number(adWatchesToday?.count || 0), total: parseFloat(adWatchesToday?.total || '0') },
          week: { watches: Number(adWatchesWeek?.count || 0), total: parseFloat(adWatchesWeek?.total || '0') },
          allTime: { watches: Number(adWatchesAll?.count || 0), total: adTotal },
        },
        referrals: {
          today: { count: Number(referralsToday?.count || 0), total: parseFloat(referralsToday?.total || '0') },
          week: { count: Number(referralsWeek?.count || 0), total: parseFloat(referralsWeek?.total || '0') },
          allTime: { count: Number(referralsAll?.count || 0), total: referralTotal },
        },
        totals: {
          allRewardsDistributed: (dailyTotal + adTotal + referralTotal).toFixed(2),
          gamesToday: Number(gamesToday?.count || 0),
          activeReferrers: Number(usersWithReferrals?.count || 0),
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
