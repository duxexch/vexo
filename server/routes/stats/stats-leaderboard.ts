import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, desc, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { cacheGet } from "../../lib/redis";

export function registerLeaderboardRoutes(app: Express): void {

  app.get("/api/leaderboard", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const sortBy = (req.query.sortBy as string) || 'wins';
      const gameType = req.query.gameType as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      const cacheKey = `leaderboard:${sortBy}:${gameType || 'all'}:${limit}`;
      
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
        
        const leaderboard = await db.select(selectFields as Record<string, typeof users.id>)
          .from(users).where(sql`${users.gamesPlayed} > 0`).orderBy(desc(orderByColumn)).limit(limit);
        
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
        gamesWon: users.gamesWon, totalEarnings: users.totalEarnings, longestWinStreak: users.longestWinStreak,
      }).from(users).where(eq(users.id, userId));
      
      if (!user) return res.status(404).json({ error: "User not found" });
      
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
