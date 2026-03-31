import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, desc, or } from "drizzle-orm";
import { challenges as challengesTable } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

/** Helper to compute rank from win/loss */
function computeRating(user: { gamesWon?: number | null; gamesLost?: number | null }) {
  const won = user?.gamesWon || 0;
  const lost = user?.gamesLost || 0;
  const total = won + lost;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 50;
  const rank = winRate >= 80 ? "diamond" : winRate >= 60 ? "gold" : winRate >= 40 ? "silver" : "bronze";
  return { wins: won, losses: lost, winRate, rank };
}

export function registerListingRoutes(app: Express) {
  app.get("/api/challenges/available", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const dbChallenges = await storage.getAvailableChallenges(req.user!.id);
      
      // Batch fetch all participants in one query
      const playerIds = dbChallenges.flatMap(c => [c.player1Id, c.player2Id, c.player3Id, c.player4Id].filter(Boolean) as string[]);
      const usersMap = await storage.getUsersByIds(playerIds);
      
      const enrichedChallenges = dbChallenges.map(c => {
        const player1 = usersMap.get(c.player1Id);
        const player2 = c.player2Id ? usersMap.get(c.player2Id) : null;
        const player3 = c.player3Id ? usersMap.get(c.player3Id) : null;
        const player4 = c.player4Id ? usersMap.get(c.player4Id) : null;
        const rating = computeRating(player1 || {});
        const result: Record<string, unknown> = {
          id: c.id,
          gameType: c.gameType,
          betAmount: parseFloat(c.betAmount || "0"),
          status: c.status,
          visibility: c.visibility,
          player1Id: c.player1Id,
          player1Name: player1?.nickname || player1?.username || "Unknown",
          player1Rating: rating,
          timeLimit: c.timeLimit,
          spectatorCount: 0,
          totalBets: 0,
          createdAt: c.createdAt?.toISOString() || new Date().toISOString(),
        };

        if (player2) {
          result.player2Id = c.player2Id;
          result.player2Name = player2.nickname || player2.username || "Unknown";
          result.player2Rating = computeRating(player2);
          result.player2Score = c.player2Score || 0;
        }
        if (player3) {
          result.player3Id = c.player3Id;
          result.player3Name = player3.nickname || player3.username || "Unknown";
          result.player3Rating = computeRating(player3);
          result.player3Score = c.player3Score || 0;
        }
        if (player4) {
          result.player4Id = c.player4Id;
          result.player4Name = player4.nickname || player4.username || "Unknown";
          result.player4Rating = computeRating(player4);
          result.player4Score = c.player4Score || 0;
        }

        return result;
      });
      res.json(enrichedChallenges);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/challenges/public", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const dbChallenges = await storage.getActiveChallenges();
      const sliced = dbChallenges.slice(0, 10);
      
      // Batch fetch all player IDs in one query
      const allPlayerIds = sliced.flatMap(c => [c.player1Id, c.player2Id, c.player3Id, c.player4Id].filter(Boolean) as string[]);
      const usersMap = await storage.getUsersByIds(allPlayerIds);
      
      const enrichedChallenges = sliced.map(c => {
        const player1 = usersMap.get(c.player1Id);
        const p1Rating = computeRating(player1 || {});
        
        const result: Record<string, unknown> = {
          id: c.id,
          gameType: c.gameType,
          betAmount: parseFloat(c.betAmount || "0"),
          status: c.status,
          visibility: c.visibility,
          player1Id: c.player1Id,
          player1Name: player1?.nickname || player1?.username || "Unknown",
          player1Rating: p1Rating,
          player1Score: c.player1Score || 0,
          timeLimit: c.timeLimit,
          spectatorCount: 0,
          totalBets: 0,
          createdAt: c.createdAt?.toISOString() || new Date().toISOString(),
          startedAt: c.startedAt?.toISOString() || new Date().toISOString(),
        };
        
        if (c.player2Id) {
          const player2 = usersMap.get(c.player2Id);
          if (player2) {
            const p2Rating = computeRating(player2);
            result.player2Id = c.player2Id;
            result.player2Name = player2.nickname || player2.username || "Unknown";
            result.player2Rating = p2Rating;
            result.player2Score = c.player2Score || 0;
          }
        }

        if (c.player3Id) {
          const player3 = usersMap.get(c.player3Id);
          if (player3) {
            const p3Rating = computeRating(player3);
            result.player3Id = c.player3Id;
            result.player3Name = player3.nickname || player3.username || "Unknown";
            result.player3Rating = p3Rating;
            result.player3Score = c.player3Score || 0;
          }
        }

        if (c.player4Id) {
          const player4 = usersMap.get(c.player4Id);
          if (player4) {
            const p4Rating = computeRating(player4);
            result.player4Id = c.player4Id;
            result.player4Name = player4.nickname || player4.username || "Unknown";
            result.player4Rating = p4Rating;
            result.player4Score = c.player4Score || 0;
          }
        }
        
        return result;
      });
      res.json(enrichedChallenges);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/challenges/my", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myChallenges = await db.select().from(challengesTable)
        .where(or(
          eq(challengesTable.player1Id, req.user!.id),
          eq(challengesTable.player2Id, req.user!.id),
          eq(challengesTable.player3Id, req.user!.id),
          eq(challengesTable.player4Id, req.user!.id)
        ))
        .orderBy(desc(challengesTable.createdAt))
        .limit(20);
      
      // Batch fetch all player IDs in one query
      const allPlayerIds = myChallenges.flatMap(c => [c.player1Id, c.player2Id, c.player3Id, c.player4Id].filter(Boolean) as string[]);
      const usersMap = await storage.getUsersByIds(allPlayerIds);
      
      const enriched = myChallenges.map(c => {
        const player1 = usersMap.get(c.player1Id);
        const player2 = c.player2Id ? usersMap.get(c.player2Id) : null;
        const player3 = c.player3Id ? usersMap.get(c.player3Id) : null;
        const player4 = c.player4Id ? usersMap.get(c.player4Id) : null;
        return {
          ...c,
          player1Name: player1?.nickname || player1?.username,
          player2Name: player2?.nickname || player2?.username,
          player3Name: player3?.nickname || player3?.username,
          player4Name: player4?.nickname || player4?.username,
        };
      });
      
      res.json(enriched);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
