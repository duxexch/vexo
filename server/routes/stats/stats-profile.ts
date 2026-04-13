import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, desc, and, or } from "drizzle-orm";
import { affiliates, users, liveGameSessions, gameplaySettings, referralRewardsLog } from "@shared/schema";
import { sql } from "drizzle-orm";
import { getBadgeEntitlementForUser } from "../../lib/user-badge-entitlements";

export function registerStatsProfileRoutes(app: Express): void {

  app.get("/api/player/:userId/stats", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const [user] = await db.select({
        id: users.id, username: users.username, nickname: users.nickname,
        profilePicture: users.profilePicture, coverPhoto: users.coverPhoto, vipLevel: users.vipLevel,
        gamesPlayed: users.gamesPlayed, gamesWon: users.gamesWon, gamesLost: users.gamesLost, gamesDraw: users.gamesDraw,
        totalEarnings: users.totalEarnings, totalWagered: users.totalWagered, totalWon: users.totalWon,
        chessPlayed: users.chessPlayed, chessWon: users.chessWon,
        backgammonPlayed: users.backgammonPlayed, backgammonWon: users.backgammonWon,
        dominoPlayed: users.dominoPlayed, dominoWon: users.dominoWon,
        tarneebPlayed: users.tarneebPlayed, tarneebWon: users.tarneebWon,
        balootPlayed: users.balootPlayed, balootWon: users.balootWon,
        currentWinStreak: users.currentWinStreak, longestWinStreak: users.longestWinStreak,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId));

      if (!user) return res.status(404).json({ error: "User not found" });

      const gamesPlayed = user.gamesPlayed || 0;
      const gamesWon = user.gamesWon || 0;
      const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

      const gameStats = [
        { game: 'chess', played: user.chessPlayed || 0, won: user.chessWon || 0 },
        { game: 'backgammon', played: user.backgammonPlayed || 0, won: user.backgammonWon || 0 },
        { game: 'domino', played: user.dominoPlayed || 0, won: user.dominoWon || 0 },
        { game: 'tarneeb', played: user.tarneebPlayed || 0, won: user.tarneebWon || 0 },
        { game: 'baloot', played: user.balootPlayed || 0, won: user.balootWon || 0 },
      ].map(g => ({ ...g, winRate: g.played > 0 ? Math.round((g.won / g.played) * 100) : 0 }));

      const badgeEntitlements = await getBadgeEntitlementForUser(userId);

      res.json({ ...user, winRate, gameStats, trustBadge: badgeEntitlements.topBadge });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/stats", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const [user] = await db.select({
        id: users.id, username: users.username, nickname: users.nickname,
        profilePicture: users.profilePicture, coverPhoto: users.coverPhoto, vipLevel: users.vipLevel,
        gamesPlayed: users.gamesPlayed, gamesWon: users.gamesWon, gamesLost: users.gamesLost, gamesDraw: users.gamesDraw,
        totalEarnings: users.totalEarnings, totalWagered: users.totalWagered, totalWon: users.totalWon,
        chessPlayed: users.chessPlayed, chessWon: users.chessWon,
        backgammonPlayed: users.backgammonPlayed, backgammonWon: users.backgammonWon,
        dominoPlayed: users.dominoPlayed, dominoWon: users.dominoWon,
        tarneebPlayed: users.tarneebPlayed, tarneebWon: users.tarneebWon,
        balootPlayed: users.balootPlayed, balootWon: users.balootWon,
        currentWinStreak: users.currentWinStreak, longestWinStreak: users.longestWinStreak,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId));

      if (!user) return res.status(404).json({ error: "User not found" });

      const gamesPlayed = user.gamesPlayed || 0;
      const gamesWon = user.gamesWon || 0;
      const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

      const gameStats = [
        { game: 'chess', played: user.chessPlayed || 0, won: user.chessWon || 0 },
        { game: 'backgammon', played: user.backgammonPlayed || 0, won: user.backgammonWon || 0 },
        { game: 'domino', played: user.dominoPlayed || 0, won: user.dominoWon || 0 },
        { game: 'tarneeb', played: user.tarneebPlayed || 0, won: user.tarneebWon || 0 },
        { game: 'baloot', played: user.balootPlayed || 0, won: user.balootWon || 0 },
      ].map(g => ({ ...g, winRate: g.played > 0 ? Math.round((g.won / g.played) * 100) : 0 }));

      const badgeEntitlements = await getBadgeEntitlementForUser(userId);

      res.json({ ...user, winRate, gameStats, trustBadge: badgeEntitlements.topBadge });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/referrals", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const referrals = await db.select({ id: users.id, username: users.username, createdAt: users.createdAt })
        .from(users).where(eq(users.referredBy, userId)).orderBy(desc(users.createdAt)).limit(50);

      const [settingsRows, referralSummaryRows, affiliateRows] = await Promise.all([
        db.select({ key: gameplaySettings.key, value: gameplaySettings.value })
          .from(gameplaySettings)
          .where(or(
            eq(gameplaySettings.key, "referral_reward_enabled"),
            eq(gameplaySettings.key, "referral_reward_amount"),
            eq(gameplaySettings.key, "referral_reward_rate_percent"),
          )),
        db.select({
          totalRewards: sql<string>`COALESCE(SUM(CASE WHEN ${referralRewardsLog.rewardStatus} IN ('released', 'paid') THEN ${referralRewardsLog.rewardAmount}::numeric ELSE 0 END), '0')`,
          pendingRewards: sql<string>`COALESCE(SUM(CASE WHEN ${referralRewardsLog.rewardStatus} = 'on_hold' THEN ${referralRewardsLog.rewardAmount}::numeric ELSE 0 END), '0')`,
          totalCpa: sql<string>`COALESCE(SUM(CASE WHEN ${referralRewardsLog.rewardType} = 'cpa' THEN ${referralRewardsLog.rewardAmount}::numeric ELSE 0 END), '0')`,
          totalRevshare: sql<string>`COALESCE(SUM(CASE WHEN ${referralRewardsLog.rewardType} = 'revshare' THEN ${referralRewardsLog.rewardAmount}::numeric ELSE 0 END), '0')`,
          rewardEvents: sql<number>`COUNT(*)`,
        })
          .from(referralRewardsLog)
          .where(eq(referralRewardsLog.referrerId, userId)),
        db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1),
      ]);

      const settingsMap = settingsRows.reduce<Record<string, string>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});

      const rewardEnabled = settingsMap.referral_reward_enabled !== "false";
      const rewardAmount = Number.parseFloat(settingsMap.referral_reward_amount || "5");
      const rewardRatePercent = Number.parseFloat(settingsMap.referral_reward_rate_percent || "100");
      const rewardPerReferral = (Number.isFinite(rewardAmount) && Number.isFinite(rewardRatePercent))
        ? (rewardAmount * (rewardRatePercent / 100))
        : 0;
      const referralSummary = referralSummaryRows[0];
      const affiliateProfile = affiliateRows[0];

      res.json({
        referralCount: referrals.length,
        referrals,
        reward: {
          enabled: rewardEnabled,
          baseAmount: Number.isFinite(rewardAmount) ? rewardAmount.toFixed(2) : "0.00",
          ratePercent: Number.isFinite(rewardRatePercent) ? rewardRatePercent.toFixed(2) : "0.00",
          rewardPerReferral: rewardPerReferral.toFixed(2),
          currency: "project_coin",
        },
        earnings: {
          totalRewards: Number(referralSummary?.totalRewards || 0).toFixed(2),
          pendingRewards: Number(referralSummary?.pendingRewards || 0).toFixed(2),
          totalCpa: Number(referralSummary?.totalCpa || 0).toFixed(2),
          totalRevshare: Number(referralSummary?.totalRevshare || 0).toFixed(2),
          rewardEvents: Number(referralSummary?.rewardEvents || 0),
        },
        marketer: affiliateProfile ? {
          marketerStatus: affiliateProfile.marketerStatus,
          isApproved: affiliateProfile.marketerStatus === "approved",
          cpaEnabled: affiliateProfile.cpaEnabled,
          cpaAmount: affiliateProfile.cpaAmount,
          revshareEnabled: affiliateProfile.revshareEnabled,
          revshareRate: affiliateProfile.revshareRate,
          commissionHoldDays: affiliateProfile.commissionHoldDays,
          totalCommissionEarned: affiliateProfile.totalCommissionEarned,
          pendingCommission: affiliateProfile.pendingCommission,
          totalWithdrawableCommission: affiliateProfile.totalWithdrawableCommission,
        } : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/marketer", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);

      if (!affiliate) {
        return res.json({ isMarketer: false, affiliate: null, summary: null, recentEvents: [] });
      }

      const [summary] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_events,
          COALESCE(SUM(reward_amount::numeric), 0)::text AS total_amount,
          COALESCE(SUM(CASE WHEN reward_status = 'on_hold' THEN reward_amount::numeric ELSE 0 END), 0)::text AS on_hold_amount,
          COALESCE(SUM(CASE WHEN reward_status IN ('released', 'paid') THEN reward_amount::numeric ELSE 0 END), 0)::text AS released_amount,
          COALESCE(SUM(CASE WHEN reward_type = 'cpa' THEN reward_amount::numeric ELSE 0 END), 0)::text AS cpa_amount,
          COALESCE(SUM(CASE WHEN reward_type = 'revshare' THEN reward_amount::numeric ELSE 0 END), 0)::text AS revshare_amount
        FROM referral_rewards_log
        WHERE referrer_id = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [invitedSummary] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS invited_total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS invited_active,
          COALESCE(SUM(total_deposited::numeric), 0)::text AS invited_deposits,
          COALESCE(SUM(total_wagered::numeric), 0)::text AS invited_wagered,
          COALESCE(SUM(games_played), 0)::int AS invited_games
        FROM users
        WHERE referred_by = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const recentEvents = await db.execute(sql`
        SELECT
          rr.id,
          rr.referred_id,
          u.username AS referred_username,
          rr.reward_type,
          rr.reward_status,
          rr.reward_amount,
          rr.hold_until,
          rr.released_at,
          rr.source_type,
          rr.source_id,
          rr.created_at
        FROM referral_rewards_log rr
        LEFT JOIN users u ON u.id = rr.referred_id
        WHERE rr.referrer_id = ${userId}
        ORDER BY rr.created_at DESC
        LIMIT 100
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      return res.json({
        isMarketer: true,
        affiliate,
        summary,
        invitedSummary,
        recentEvents,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/player/:userId/matches", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const matches = await db.select({
        id: liveGameSessions.id, gameType: liveGameSessions.gameType, status: liveGameSessions.status,
        player1Id: liveGameSessions.player1Id, player2Id: liveGameSessions.player2Id,
        player1Score: liveGameSessions.player1Score, player2Score: liveGameSessions.player2Score,
        winnerId: liveGameSessions.winnerId, startedAt: liveGameSessions.startedAt, endedAt: liveGameSessions.endedAt,
      }).from(liveGameSessions)
        .where(and(
          or(eq(liveGameSessions.player1Id, userId), eq(liveGameSessions.player2Id, userId)),
          eq(liveGameSessions.status, 'completed')
        ))
        .orderBy(desc(liveGameSessions.endedAt)).limit(limit).offset(offset);

      const matchesWithDetails = matches.map(match => ({
        ...match,
        isWinner: match.winnerId === userId,
        result: match.winnerId === userId ? 'win' : match.winnerId ? 'loss' : 'draw',
      }));

      res.json(matchesWithDetails);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
