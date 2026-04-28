import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { challenges as challengesTable } from "@shared/schema";
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from "../middleware";
import { getChallengeReadAccess, getErrorMessage } from "./helpers";

export function registerDetailsRoutes(app: Express) {
  app.get("/api/challenges/:id", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const challengeId = req.params.id;

      // Fetch challenge from database
      const [dbChallenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, challengeId)).limit(1);

      if (!dbChallenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      // Anonymous spectators may view PUBLIC challenges read-only.
      // Private challenges still require a participant or authenticated check.
      const visibility = String(dbChallenge.visibility || "public").toLowerCase();
      const isAnonymous = !req.user;
      if (isAnonymous) {
        if (visibility === "private") {
          return res.status(403).json({ error: "Sign in to view this private challenge" });
        }
      } else {
        const access = getChallengeReadAccess(dbChallenge, req.user!.id);
        if (!access.allowed) {
          return res.status(access.status).json({ error: access.error });
        }
      }

      // Fetch player details
      const player1 = await storage.getUser(dbChallenge.player1Id);
      const player2 = dbChallenge.player2Id ? await storage.getUser(dbChallenge.player2Id) : null;
      const player3 = dbChallenge.player3Id ? await storage.getUser(dbChallenge.player3Id) : null;
      const player4 = dbChallenge.player4Id ? await storage.getUser(dbChallenge.player4Id) : null;

      // Calculate player 1 stats
      const p1Won = player1?.gamesWon || 0;
      const p1Lost = player1?.gamesLost || 0;
      const p1Total = p1Won + p1Lost;
      const p1WinRate = p1Total > 0 ? Math.round((p1Won / p1Total) * 100) : 50;
      const p1Rank = p1WinRate >= 80 ? "diamond" : p1WinRate >= 60 ? "gold" : p1WinRate >= 40 ? "silver" : "bronze";

      const result: Record<string, unknown> = {
        id: dbChallenge.id,
        gameType: dbChallenge.gameType,
        betAmount: parseFloat(dbChallenge.betAmount || "0"),
        currencyType: dbChallenge.currencyType === "project" ? "project" : "usd",
        status: dbChallenge.status,
        visibility: dbChallenge.visibility,
        requiredPlayers: Number(dbChallenge.requiredPlayers || 2),
        player1Id: dbChallenge.player1Id,
        player1Name: player1?.nickname || player1?.username || "Unknown",
        player1Rating: { wins: p1Won, losses: p1Lost, winRate: p1WinRate, rank: p1Rank },
        player1Score: dbChallenge.player1Score || 0,
        timeLimit: dbChallenge.timeLimit,
        spectatorCount: 0,
        totalBets: 0,
        createdAt: dbChallenge.createdAt?.toISOString() || new Date().toISOString(),
        startedAt: dbChallenge.startedAt?.toISOString() || new Date().toISOString(),
        player1: {
          id: dbChallenge.player1Id,
          username: player1?.nickname || player1?.username || "Unknown",
          avatarUrl: player1?.profilePicture,
          vipLevel: player1?.vipLevel || 0,
        },
      };

      // Add player 2 details if exists
      if (player2) {
        const p2Won = player2?.gamesWon || 0;
        const p2Lost = player2?.gamesLost || 0;
        const p2Total = p2Won + p2Lost;
        const p2WinRate = p2Total > 0 ? Math.round((p2Won / p2Total) * 100) : 50;
        const p2Rank = p2WinRate >= 80 ? "diamond" : p2WinRate >= 60 ? "gold" : p2WinRate >= 40 ? "silver" : "bronze";
        const player2DisplayName = dbChallenge.opponentType === 'sam9'
          ? 'SAM9'
          : (player2?.nickname || player2?.username || "Unknown");

        result.player2Id = dbChallenge.player2Id;
        result.player2Name = player2DisplayName;
        result.player2Rating = { wins: p2Won, losses: p2Lost, winRate: p2WinRate, rank: p2Rank };
        result.player2Score = dbChallenge.player2Score || 0;
        result.player2 = {
          id: dbChallenge.player2Id,
          username: player2DisplayName,
          avatarUrl: player2?.profilePicture,
          vipLevel: player2?.vipLevel || 0,
        };
      }

      if (player3) {
        const p3Won = player3?.gamesWon || 0;
        const p3Lost = player3?.gamesLost || 0;
        const p3Total = p3Won + p3Lost;
        const p3WinRate = p3Total > 0 ? Math.round((p3Won / p3Total) * 100) : 50;
        const p3Rank = p3WinRate >= 80 ? "diamond" : p3WinRate >= 60 ? "gold" : p3WinRate >= 40 ? "silver" : "bronze";

        result.player3Id = dbChallenge.player3Id;
        result.player3Name = player3?.nickname || player3?.username || "Unknown";
        result.player3Rating = { wins: p3Won, losses: p3Lost, winRate: p3WinRate, rank: p3Rank };
        result.player3Score = dbChallenge.player3Score || 0;
        result.player3 = {
          id: dbChallenge.player3Id,
          username: player3?.nickname || player3?.username || "Unknown",
          avatarUrl: player3?.profilePicture,
          vipLevel: player3?.vipLevel || 0,
        };
      }

      if (player4) {
        const p4Won = player4?.gamesWon || 0;
        const p4Lost = player4?.gamesLost || 0;
        const p4Total = p4Won + p4Lost;
        const p4WinRate = p4Total > 0 ? Math.round((p4Won / p4Total) * 100) : 50;
        const p4Rank = p4WinRate >= 80 ? "diamond" : p4WinRate >= 60 ? "gold" : p4WinRate >= 40 ? "silver" : "bronze";

        result.player4Id = dbChallenge.player4Id;
        result.player4Name = player4?.nickname || player4?.username || "Unknown";
        result.player4Rating = { wins: p4Won, losses: p4Lost, winRate: p4WinRate, rank: p4Rank };
        result.player4Score = dbChallenge.player4Score || 0;
        result.player4 = {
          id: dbChallenge.player4Id,
          username: player4?.nickname || player4?.username || "Unknown",
          avatarUrl: player4?.profilePicture,
          vipLevel: player4?.vipLevel || 0,
        };
      }

      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/challenges/:id/stake", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // Redirect to the proper spectator support system
      // This is a legacy endpoint — use POST /api/supports instead
      const { backedPlayerId, stakeAmount } = req.body;
      res.status(301).json({
        error: "This endpoint is deprecated. Use POST /api/supports with challengeId, playerId, amount, and mode instead.",
        redirect: "/api/supports"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/challenges/:id/stakes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [challenge] = await db.select()
        .from(challengesTable)
        .where(eq(challengesTable.id, req.params.id))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, req.user!.id);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      // Return actual spectator supports from DB instead of in-memory array
      const supports = await storage.getSpectatorSupportsByChallenge(req.params.id);
      res.json(supports);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
