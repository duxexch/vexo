import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, desc, sql, and } from "drizzle-orm";
import { gameMatches, users } from "@shared/schema";
import { cacheGet } from "../../lib/redis";

type Period = "day" | "week" | "month" | "all";
function normalizePeriod(p: unknown): Period {
  const s = String(p || "all").toLowerCase();
  if (s === "day" || s === "daily") return "day";
  if (s === "week" || s === "weekly") return "week";
  if (s === "month" || s === "monthly") return "month";
  return "all";
}
function periodSinceDate(p: Period): Date | null {
  const now = new Date();
  switch (p) {
    case "day": now.setHours(0, 0, 0, 0); return now;
    case "week": { const d = new Date(); d.setDate(d.getDate() - 7); return d; }
    case "month": { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; }
    default: return null;
  }
}

export function registerLeaderboardRoutes(app: Express): void {

  app.get("/api/leaderboard", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const sortBy = (req.query.sortBy as string) || 'wins';
      const gameType = req.query.gameType as string;
      const region = (req.query.region as string)?.trim() || undefined;
      const period = normalizePeriod(req.query.period);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const cacheKey = `leaderboard:${sortBy}:${gameType || 'all'}:${period}:${region || 'world'}:${limit}`;
      const since = periodSinceDate(period);

      // Period-scoped path: aggregate from gameMatches in window.
      if (since) {
        const rankedLeaderboard = await cacheGet(cacheKey, 60, async () => {
          // Wins per user from completed matches in window (optionally per game).
          // CRITICAL: region filter must be applied BEFORE the LIMIT, otherwise
          // global top-N truncation can hide regional leaders. We join the
          // sender's country_code from user_preferences and filter inline.
          const winsRows = await db.execute<{ user_id: string; wins_in_period: string }>(sql`
            SELECT gm.winner_id AS user_id, COUNT(*)::text AS wins_in_period
            FROM game_matches gm
            ${region ? sql`INNER JOIN user_preferences up ON up.user_id = gm.winner_id AND up.country_code = ${region}` : sql``}
            WHERE gm.status = 'completed'
              AND gm.winner_id IS NOT NULL
              AND gm.completed_at >= ${since}
              ${gameType ? sql`AND gm.game_id = ${gameType}` : sql``}
            GROUP BY gm.winner_id
            ORDER BY COUNT(*) DESC
            LIMIT ${limit * 3}
          `);
          const winsRowsArr = Array.isArray(winsRows)
            ? winsRows
            : ((winsRows as { rows?: Array<{ user_id: string; wins_in_period: string }> }).rows || []);
          const userIds = winsRowsArr.map(r => r.user_id);
          if (userIds.length === 0) return [];

          const userRows = await db.execute<Record<string, unknown>>(sql`
            SELECT u.id, u.username, u.nickname, u.profile_picture, u.vip_level,
                   u.games_played, u.games_won, u.games_lost, u.total_earnings,
                   u.current_win_streak, u.longest_win_streak,
                   up.country_code AS country
            FROM users u
            LEFT JOIN user_preferences up ON up.user_id = u.id
            WHERE u.id = ANY(${userIds})
              ${region ? sql`AND up.country_code = ${region}` : sql``}
          `);
          const userRowsArr = Array.isArray(userRows)
            ? userRows
            : ((userRows as { rows?: Array<Record<string, unknown>> }).rows || []);
          const winsByUser = new Map(winsRowsArr.map(r => [r.user_id, Number(r.wins_in_period)]));
          const userById = new Map(userRowsArr.map(r => [String(r.id), r]));

          // Sort by sortBy within the period window
          const enriched = userIds
            .filter(id => userById.has(id))
            .map(id => {
              const u = userById.get(id)!;
              const wins = winsByUser.get(id) || 0;
              return {
                id,
                username: u.username, nickname: u.nickname, profilePicture: u.profile_picture,
                vipLevel: Number(u.vip_level || 0),
                gamesPlayed: Number(u.games_played || 0),
                gamesWon: Number(u.games_won || 0),
                gamesLost: Number(u.games_lost || 0),
                totalEarnings: u.total_earnings,
                currentWinStreak: Number(u.current_win_streak || 0),
                longestWinStreak: Number(u.longest_win_streak || 0),
                country: u.country,
                gameWon: wins,
                gamePlayed: undefined as number | undefined,
              };
            });

          enriched.sort((a, b) => {
            if (sortBy === 'earnings') return Number(b.totalEarnings || 0) - Number(a.totalEarnings || 0);
            if (sortBy === 'streak') return b.longestWinStreak - a.longestWinStreak;
            return (b.gameWon || 0) - (a.gameWon || 0);
          });

          return enriched.slice(0, limit).map((player, index) => ({
            rank: index + 1,
            ...player,
            winRate: player.gamesPlayed > 0 ? Math.round((player.gamesWon / player.gamesPlayed) * 100) : 0,
          }));
        });
        return res.json(rankedLeaderboard);
      }
      // All-time path (legacy below). Add region filter if present.

      const rankedLeaderboard = await cacheGet(cacheKey, 60, async () => {
        let orderByColumn;
        let selectFields: Record<string, unknown> = {
          id: users.id, username: users.username, nickname: users.nickname,
          profilePicture: users.profilePicture, vipLevel: users.vipLevel,
          gamesPlayed: users.gamesPlayed, gamesWon: users.gamesWon, gamesLost: users.gamesLost,
          totalEarnings: users.totalEarnings, currentWinStreak: users.currentWinStreak, longestWinStreak: users.longestWinStreak,
        };

        if (gameType) {
          switch (gameType) {
            case 'chess':
              selectFields.gamePlayed = users.chessPlayed; selectFields.gameWon = users.chessWon;
              orderByColumn = sortBy === 'earnings' ? users.totalEarnings : users.chessWon; break;
            case 'backgammon':
              selectFields.gamePlayed = users.backgammonPlayed; selectFields.gameWon = users.backgammonWon;
              orderByColumn = sortBy === 'earnings' ? users.totalEarnings : users.backgammonWon; break;
            case 'domino':
              selectFields.gamePlayed = users.dominoPlayed; selectFields.gameWon = users.dominoWon;
              orderByColumn = sortBy === 'earnings' ? users.totalEarnings : users.dominoWon; break;
            case 'tarneeb':
              selectFields.gamePlayed = users.tarneebPlayed; selectFields.gameWon = users.tarneebWon;
              orderByColumn = sortBy === 'earnings' ? users.totalEarnings : users.tarneebWon; break;
            case 'baloot':
              selectFields.gamePlayed = users.balootPlayed; selectFields.gameWon = users.balootWon;
              orderByColumn = sortBy === 'earnings' ? users.totalEarnings : users.balootWon; break;
            default:
              orderByColumn = sortBy === 'earnings' ? users.totalEarnings : users.gamesWon;
          }
        } else {
          switch (sortBy) {
            case 'earnings': orderByColumn = users.totalEarnings; break;
            case 'streak': orderByColumn = users.longestWinStreak; break;
            case 'wins': default: orderByColumn = users.gamesWon;
          }
        }

        // Region filter (all-time path): users.country is not on users table; use user_preferences.country_code via subquery.
        const baseWhere = region
          ? and(
              sql`${users.gamesPlayed} > 0`,
              sql`${users.id} IN (SELECT user_id FROM user_preferences WHERE country_code = ${region})`,
            )
          : sql`${users.gamesPlayed} > 0`;
        const leaderboard = await db.select(selectFields as Record<string, typeof users.id>)
          .from(users).where(baseWhere).orderBy(desc(orderByColumn)).limit(limit);

        return leaderboard.map((player, index) => ({
          rank: index + 1,
          ...player,
          winRate: Number(player.gamesPlayed) > 0 ? Math.round((Number(player.gamesWon) / Number(player.gamesPlayed)) * 100) : 0,
        }));
      });

      res.json(rankedLeaderboard);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/rank", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const sortBy = (req.query.sortBy as string) || 'wins';

      const [user] = await db.select({
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
        totalEarnings: users.totalEarnings,
        longestWinStreak: users.longestWinStreak,
      }).from(users).where(eq(users.id, userId));

      if (!user) return res.status(404).json({ error: "User not found" });

      // A user with no completed games should not appear as ranked #1.
      if ((user.gamesPlayed || 0) <= 0) {
        return res.json({ rank: 0, sortBy });
      }

      let rankQuery;
      switch (sortBy) {
        case 'earnings':
          rankQuery = sql`SELECT COUNT(*) + 1 as rank FROM users WHERE total_earnings > ${user.totalEarnings} AND games_played > 0`; break;
        case 'streak':
          rankQuery = sql`SELECT COUNT(*) + 1 as rank FROM users WHERE longest_win_streak > ${user.longestWinStreak} AND games_played > 0`; break;
        case 'wins': default:
          rankQuery = sql`SELECT COUNT(*) + 1 as rank FROM users WHERE games_won > ${user.gamesWon} AND games_played > 0`;
      }

      const rankResults = await db.execute(rankQuery);
      const rows = Array.isArray(rankResults) ? rankResults : (rankResults as { rows?: Record<string, unknown>[] }).rows || [];
      const firstRow = rows[0];

      res.json({ rank: firstRow ? Number(firstRow.rank) || 1 : 1, sortBy });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
