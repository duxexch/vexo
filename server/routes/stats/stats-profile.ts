import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, desc, and, or } from "drizzle-orm";
import { users, liveGameSessions } from "@shared/schema";

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
      
      res.json({ ...user, winRate, gameStats });
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
      
      res.json({ ...user, winRate, gameStats });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/referrals", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const referrals = await db.select({ id: users.id, username: users.username, createdAt: users.createdAt })
        .from(users).where(eq(users.referredBy, userId)).orderBy(desc(users.createdAt)).limit(50);
      res.json({ referralCount: referrals.length, referrals });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
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
