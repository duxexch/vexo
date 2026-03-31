import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, desc } from "drizzle-orm";
import { users, games, gameMatches, matchmakingQueue } from "@shared/schema";
import { getGameEngine } from "../../game-engines";
import {
  ensureAdaptiveBotUsers,
  generateAdaptiveAiReport,
  registerAdaptiveAiSession,
  resolveAdaptiveDifficultyForUser,
  resolveCurrentPlayerFromState,
  toAdaptiveAiReportCsv,
} from "../../lib/adaptive-ai";

export function registerMatchRoutes(app: Express): void {

  // Accept match invitation
  app.post("/api/games/matches/:matchId/accept", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { matchId } = req.params;

      const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.player2Id !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (match.status !== "pending") {
        return res.status(400).json({ error: "Match already started or cancelled" });
      }

      const [updated] = await db.update(gameMatches)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(eq(gameMatches.id, matchId))
        .returning();

      // Update queue entries
      await db.update(matchmakingQueue)
        .set({ status: "matched" })
        .where(and(
          or(eq(matchmakingQueue.userId, match.player1Id), eq(matchmakingQueue.userId, match.player2Id)),
          eq(matchmakingQueue.status, "waiting")
        ));

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Decline match invitation
  app.post("/api/games/matches/:matchId/decline", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { matchId } = req.params;

      const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.player2Id !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const [updated] = await db.update(gameMatches)
        .set({ status: "cancelled" })
        .where(eq(gameMatches.id, matchId))
        .returning();

      // Update queue entries
      await db.update(matchmakingQueue)
        .set({ status: "cancelled" })
        .where(and(
          eq(matchmakingQueue.userId, match.player1Id),
          eq(matchmakingQueue.status, "waiting")
        ));

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get match details
  app.get("/api/games/matches/:matchId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { matchId } = req.params;

      const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.player1Id !== userId && match.player2Id !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get player details
      const [player1] = await db.select({
        id: users.id,
        username: users.username,
        accountId: users.accountId,
        avatarUrl: users.profilePicture,
        vipLevel: users.vipLevel,
      }).from(users).where(eq(users.id, match.player1Id));

      const [player2] = await db.select({
        id: users.id,
        username: users.username,
        accountId: users.accountId,
        avatarUrl: users.profilePicture,
        vipLevel: users.vipLevel,
      }).from(users).where(eq(users.id, match.player2Id));

      const [game] = await db.select().from(games).where(eq(games.id, match.gameId));

      res.json({ ...match, player1, player2, game });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get('/api/ai/reports', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requesterId = req.user!.id;
      const requesterRole = req.user!.role;
      const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const requestedGameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;

      if (requestedUserId && requesterRole !== 'admin' && requestedUserId !== requesterId) {
        return res.status(403).json({ error: 'You can only access your own AI report' });
      }

      const report = await generateAdaptiveAiReport({
        userId: requesterRole === 'admin' ? requestedUserId : (requestedUserId || requesterId),
        gameType: requestedGameType,
      });

      res.json(report);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get('/api/ai/reports/download', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requesterId = req.user!.id;
      const requesterRole = req.user!.role;
      const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const requestedGameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;
      const format = String(req.query.format || 'json').toLowerCase();

      if (requestedUserId && requesterRole !== 'admin' && requestedUserId !== requesterId) {
        return res.status(403).json({ error: 'You can only download your own AI report' });
      }

      const report = await generateAdaptiveAiReport({
        userId: requesterRole === 'admin' ? requestedUserId : (requestedUserId || requesterId),
        gameType: requestedGameType,
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (format === 'csv') {
        const csv = toAdaptiveAiReportCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ai-report-${timestamp}.csv"`);
        return res.send(csv);
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ai-report-${timestamp}.json"`);
      res.send(JSON.stringify(report, null, 2));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Development-only: Create live game session for testing
  if (process.env.NODE_ENV !== 'production') {
    app.post("/api/dev/live-sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const {
          gameType: rawGameType,
          player1Id,
          player2Id,
          gameId: providedGameId,
          settings,
          mode,
          singlePlayer,
          difficulty,
        } = req.body;

        const gameType = String(rawGameType || '').toLowerCase();
        if (!gameType) {
          return res.status(400).json({ error: "gameType is required" });
        }

        const isSinglePlayer = mode === 'single-player' || mode === 'single' || singlePlayer === true || !player2Id;
        const primaryPlayerId = String(player1Id || userId);

        if (!primaryPlayerId) {
          return res.status(400).json({ error: "player1Id is required" });
        }

        const [primaryUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, primaryPlayerId)).limit(1);
        if (!primaryUser) {
          return res.status(404).json({ error: "Primary player not found" });
        }

        const engine = getGameEngine(gameType);
        if (!engine) {
          return res.status(400).json({ error: `Unsupported game type: ${gameType}` });
        }

        // Find or use provided gameId
        let gameId = providedGameId;
        if (!gameId) {
          // Look up game by type/name
          const [existingGame] = await db.select().from(games)
            .where(eq(games.name, gameType === 'chess' ? 'Chess' : gameType))
            .limit(1);

          if (existingGame) {
            gameId = existingGame.id;
          } else {
            // Create a test game if none exists
            const [newGame] = await db.insert(games).values({
              name: gameType === 'chess' ? 'Chess' : gameType,
              description: `Test ${gameType} game`,
              gameType: gameType,
              status: 'active',
              minPlayers: 2,
              maxPlayers: 2,
            }).returning();
            gameId = newGame.id;
          }
        }

        if (isSinglePlayer) {
          const difficultyAssessment = await resolveAdaptiveDifficultyForUser({
            requestedDifficulty: typeof difficulty === 'string' ? difficulty : undefined,
            userId: primaryPlayerId,
            gameType,
          });

          const totalPlayers = (gameType === 'tarneeb' || gameType === 'baloot') ? 4 : 2;
          const botCount = totalPlayers - 1;
          const botUsers = await ensureAdaptiveBotUsers(gameType, botCount, difficultyAssessment.level);
          const botIds = botUsers.map((bot) => bot.id);

          let initializedState: string;
          if (gameType === 'tarneeb') {
            initializedState = engine.initializeWithPlayers([primaryPlayerId, ...botIds.slice(0, 3)], Number(settings?.targetScore ?? 31));
          } else if (gameType === 'baloot') {
            initializedState = engine.initializeWithPlayers([primaryPlayerId, ...botIds.slice(0, 3)], Number(settings?.targetPoints ?? 152));
          } else if (gameType === 'domino') {
            initializedState = engine.initializeWithPlayers([primaryPlayerId, botIds[0]]);
          } else {
            initializedState = engine.initializeWithPlayers(primaryPlayerId, botIds[0]);
          }

          const currentTurn = resolveCurrentPlayerFromState(gameType, initializedState, {
            player1Id: primaryPlayerId,
            player2Id: botIds[0] || null,
            player3Id: botIds[1] || null,
            player4Id: botIds[2] || null,
          }) || primaryPlayerId;

          const session = await storage.createLiveGameSession({
            gameId,
            gameType,
            player1Id: primaryPlayerId,
            player2Id: botIds[0] || null,
            player3Id: botIds[1] || null,
            player4Id: botIds[2] || null,
            status: 'in_progress',
            gameState: initializedState,
            currentTurn,
            turnNumber: 0,
            winnerId: null,
            endedAt: null,
          });

          await registerAdaptiveAiSession({
            sessionId: session.id,
            gameType,
            enabled: true,
            humanPlayerIds: [primaryPlayerId],
            botPlayerIds: botIds,
            difficultyLevel: difficultyAssessment.level,
            createdBy: userId,
          });

          return res.json({
            ...session,
            ai: {
              enabled: true,
              difficulty: difficultyAssessment.level,
              score: difficultyAssessment.score,
              confidence: difficultyAssessment.confidence,
              reasons: difficultyAssessment.reasons,
              bots: botUsers,
            },
          });
        }

        if (!player2Id) {
          return res.status(400).json({ error: "player2Id is required for non-single-player mode" });
        }

        const session = await storage.createLiveGameSession({
          gameId,
          gameType,
          player1Id: primaryPlayerId,
          player2Id,
          player3Id: null,
          player4Id: null,
          status: 'in_progress',
          gameState: null,
          currentTurn: primaryPlayerId,
          turnNumber: 0,
          winnerId: null,
          endedAt: null,
        });

        res.json(session);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    app.get('/api/dev/ai/reports', authMiddleware, async (req: AuthRequest, res: Response) => {
      try {
        const requesterId = req.user!.id;
        const requesterRole = req.user!.role;
        const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
        const requestedGameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;

        if (requestedUserId && requesterRole !== 'admin' && requestedUserId !== requesterId) {
          return res.status(403).json({ error: 'You can only access your own AI report' });
        }

        const report = await generateAdaptiveAiReport({
          userId: requesterRole === 'admin' ? requestedUserId : (requestedUserId || requesterId),
          gameType: requestedGameType,
        });

        res.json(report);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    app.get('/api/dev/ai/reports/download', authMiddleware, async (req: AuthRequest, res: Response) => {
      try {
        const requesterId = req.user!.id;
        const requesterRole = req.user!.role;
        const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
        const requestedGameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;
        const format = String(req.query.format || 'json').toLowerCase();

        if (requestedUserId && requesterRole !== 'admin' && requestedUserId !== requesterId) {
          return res.status(403).json({ error: 'You can only download your own AI report' });
        }

        const report = await generateAdaptiveAiReport({
          userId: requesterRole === 'admin' ? requestedUserId : (requestedUserId || requesterId),
          gameType: requestedGameType,
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (format === 'csv') {
          const csv = toAdaptiveAiReportCsv(report);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="ai-report-${timestamp}.csv"`);
          return res.send(csv);
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ai-report-${timestamp}.json"`);
        res.send(JSON.stringify(report, null, 2));
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });
  }
}
