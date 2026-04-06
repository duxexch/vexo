import type { Express, Response } from "express";
import { db } from "../db";
import { dailyRewards, projectCurrencyLedger, projectCurrencyWallets } from "../../shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendNotification } from "../websocket";
import { createRewardReference } from "../lib/reward-reference";
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
      const rewardReferenceId = createRewardReference("daily");

      // Insert reward record and credit project-currency wallet atomically.
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
          description: `Daily reward day ${currentDay}`,
        });
      });

      res.json({
        success: true,
        day: currentDay,
        amount: rewardAmount,
        streakCount: currentStreak,
        referenceId: rewardReferenceId,
        message: `Claimed ${rewardAmount} project coins for day ${currentDay}!`,
      });

      // Send notification for daily reward claim (non-blocking, after response)
      sendNotification(userId, {
        type: 'success',
        priority: 'low',
        title: `Daily Reward — Day ${currentDay}`,
        titleAr: `المكافأة اليومية — اليوم ${currentDay}`,
        message: `You claimed ${rewardAmount} project coins. Ref: ${rewardReferenceId}`,
        messageAr: `حصلت على ${rewardAmount} من عملة المشروع. المرجع: ${rewardReferenceId}`,
        link: '/daily-rewards',
        metadata: JSON.stringify({
          type: 'daily_reward',
          amount: rewardAmount,
          day: currentDay,
          streakCount: currentStreak,
          referenceId: rewardReferenceId,
        }),
      }).catch(() => { });
    } catch (error) {
      logger.error('Error claiming daily reward', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
