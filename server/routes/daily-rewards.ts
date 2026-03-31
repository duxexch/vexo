import type { Express, Response } from "express";
import { db } from "../db";
import { dailyRewards, users } from "../../shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendNotification } from "../websocket";
import type { AuthRequest } from "./middleware";
import { authMiddleware } from "./middleware";

// Daily reward amounts by streak day (1-7, then repeats)
const REWARD_SCHEDULE = [
  { day: 1, amount: "0.50" },
  { day: 2, amount: "0.75" },
  { day: 3, amount: "1.00" },
  { day: 4, amount: "1.50" },
  { day: 5, amount: "2.00" },
  { day: 6, amount: "3.00" },
  { day: 7, amount: "5.00" }, // Weekly bonus
];

function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfYesterday(date: Date): Date {
  const d = getStartOfDay(date);
  d.setDate(d.getDate() - 1);
  return d;
}

export function registerDailyRewardRoutes(app: Express) {
  // Get daily reward status
  app.get("/api/daily-rewards/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const now = new Date();
      const todayStart = getStartOfDay(now);

      // Get the most recent claim
      const [lastClaim] = await db
        .select()
        .from(dailyRewards)
        .where(eq(dailyRewards.userId, userId))
        .orderBy(desc(dailyRewards.claimedAt))
        .limit(1);

      // Check if already claimed today
      const claimedToday = lastClaim && new Date(lastClaim.claimedAt) >= todayStart;

      // Calculate current streak
      let currentStreak = 0;
      let nextDay = 1;

      if (lastClaim) {
        const claimDate = getStartOfDay(new Date(lastClaim.claimedAt));
        const yesterdayStart = getStartOfYesterday(now);

        if (claimDate >= todayStart) {
          // Claimed today - streak continues
          currentStreak = lastClaim.streakCount;
          nextDay = (lastClaim.day % 7) + 1;
        } else if (claimDate >= yesterdayStart) {
          // Claimed yesterday - streak can continue
          currentStreak = lastClaim.streakCount;
          nextDay = (lastClaim.day % 7) + 1;
        } else {
          // Streak broken - start over
          currentStreak = 0;
          nextDay = 1;
        }
      }

      // Get claim history (last 7 days)
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentClaims = await db
        .select()
        .from(dailyRewards)
        .where(
          and(
            eq(dailyRewards.userId, userId),
            gte(dailyRewards.claimedAt, sevenDaysAgo)
          )
        )
        .orderBy(desc(dailyRewards.claimedAt))
        .limit(7);

      // Total earned all time
      const [totalResult] = await db
        .select({ total: sql<string>`COALESCE(SUM(${dailyRewards.amount}), '0')` })
        .from(dailyRewards)
        .where(eq(dailyRewards.userId, userId));

      const nextReward = REWARD_SCHEDULE[nextDay - 1];

      res.json({
        claimedToday,
        currentStreak,
        nextDay,
        nextRewardAmount: claimedToday ? null : nextReward.amount,
        schedule: REWARD_SCHEDULE,
        recentClaims: recentClaims.map(c => ({
          day: c.day,
          amount: c.amount,
          claimedAt: c.claimedAt,
          streakCount: c.streakCount,
        })),
        totalEarned: totalResult?.total || "0",
      });
    } catch (error) {
      logger.error('Error fetching daily reward status', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Claim daily reward
  app.post("/api/daily-rewards/claim", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const now = new Date();
      const todayStart = getStartOfDay(now);

      // Get the most recent claim
      const [lastClaim] = await db
        .select()
        .from(dailyRewards)
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
        const claimDate = getStartOfDay(new Date(lastClaim.claimedAt));
        const yesterdayStart = getStartOfYesterday(now);

        if (claimDate >= yesterdayStart) {
          // Continuing streak
          currentStreak = lastClaim.streakCount + 1;
          currentDay = (lastClaim.day % 7) + 1;
        }
        // else: streak broken, defaults (1, 1) are used
      }

      const reward = REWARD_SCHEDULE[currentDay - 1];
      const rewardAmount = reward.amount;

      // Insert reward record and update user balance in transaction
      await db.transaction(async (tx) => {
        await tx.insert(dailyRewards).values({
          userId,
          day: currentDay,
          amount: rewardAmount,
          streakCount: currentStreak,
        });

        await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${rewardAmount}`,
          })
          .where(eq(users.id, userId));
      });

      res.json({
        success: true,
        day: currentDay,
        amount: rewardAmount,
        streakCount: currentStreak,
        message: `Claimed $${rewardAmount} for day ${currentDay}!`,
      });

      // Send notification for daily reward claim (non-blocking, after response)
      sendNotification(userId, {
        type: 'success',
        priority: 'low',
        title: `Daily Reward — Day ${currentDay}`,
        titleAr: `المكافأة اليومية — اليوم ${currentDay}`,
        message: `You claimed $${rewardAmount}! Streak: ${currentStreak} day${currentStreak > 1 ? 's' : ''}.`,
        messageAr: `حصلت على $${rewardAmount}! السلسلة: ${currentStreak} يوم${currentStreak > 1 ? '' : ''}.`,
        link: '/daily-rewards',
      }).catch(() => {});
    } catch (error) {
      logger.error('Error claiming daily reward', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
