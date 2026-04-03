import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, desc, or, isNull, sql } from "drizzle-orm";
import { challenges as challengesTable } from "@shared/schema";
import { isChallengeSessionPlayableStatus, normalizeChallengeGameState } from "../../lib/challenge-game-state";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import {
  getChallengeParticipantIds,
  getChallengeReadAccess,
  isChallengeParticipant,
  getErrorMessage,
} from "./helpers";

export function registerSessionsPointsRoutes(app: Express) {
  // ==================== CHALLENGE GAME SESSIONS ====================

  app.get("/api/challenges/:id/session", authMiddleware, async (req: AuthRequest, res: Response) => {
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

      const { challengeGameSessions: sessions } = await import("@shared/schema");
      const [session] = await db.select()
        .from(sessions)
        .where(eq(sessions.challengeId, req.params.id))
        .orderBy(desc(sessions.createdAt))
        .limit(1);
      res.json(session || null);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/challenges/:id/session", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { challengeGameSessions: sessions } = await import("@shared/schema");

      const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, req.params.id));
      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      if (!isChallengeParticipant(challenge, req.user!.id)) {
        return res.status(403).json({ error: "Not a participant in this challenge" });
      }

      // SECURITY: Idempotency guard — return current playable session instead of creating duplicates
      const [latestSession] = await db.select()
        .from(sessions)
        .where(eq(sessions.challengeId, req.params.id))
        .orderBy(desc(sessions.createdAt))
        .limit(1);

      if (latestSession && isChallengeSessionPlayableStatus(latestSession.status)) {
        return res.json(latestSession);
      }

      // Use proper game engine initialization instead of hardcoded stub
      const { getGameEngine } = await import("../../game-engines");
      const normalizedGameType = String(challenge.gameType || "").toLowerCase();
      const engine = getGameEngine(normalizedGameType);
      const playerIds = getChallengeParticipantIds(challenge);
      let initialStateJson = "";

      if (engine && typeof engine.initializeWithPlayers === 'function' && playerIds.length >= 2) {
        if (normalizedGameType === 'tarneeb') {
          // Team card game target is 31 points.
          initialStateJson = engine.initializeWithPlayers(playerIds, 31);
        } else if (normalizedGameType === 'baloot') {
          // Baloot match target is 152 points.
          initialStateJson = engine.initializeWithPlayers(playerIds, 152);
        } else if (normalizedGameType === 'domino') {
          // Preserve challenge-selected domino target score (101/201).
          const targetScore = challenge.dominoTargetScore === 201 ? 201 : 101;
          initialStateJson = engine.initializeWithPlayers(playerIds, targetScore);
        } else if (normalizedGameType === 'chess') {
          const incrementMs = challenge.timeLimit === 180 ? 2000 : challenge.timeLimit === 900 ? 10000 : 0;
          initialStateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1], {
            timeMs: Math.max(60, challenge.timeLimit || 300) * 1000,
            incrementMs,
          });
        } else {
          initialStateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1]);
        }
      } else if (normalizedGameType === "chess") {
        initialStateJson = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", moveCount: 0 });
      } else {
        const fallbackState = engine?.createInitialState?.() || "{}";
        initialStateJson = typeof fallbackState === "string" ? fallbackState : JSON.stringify(fallbackState);
      }

      const normalizedInitialState = normalizeChallengeGameState(initialStateJson);
      if (!normalizedInitialState) {
        return res.status(500).json({ error: "Failed to initialize valid game state" });
      }

      const [session] = await db.insert(sessions).values({
        challengeId: req.params.id,
        gameType: challenge.gameType,
        currentTurn: challenge.player1Id,
        player1TimeRemaining: challenge.timeLimit || 300,
        player2TimeRemaining: challenge.timeLimit || 300,
        gameState: normalizedInitialState,
        status: "playing",
      }).returning();

      await db.update(challengesTable)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(eq(challengesTable.id, req.params.id));

      res.json(session);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== CHALLENGE POINTS ====================

  app.post("/api/challenge-points", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { challengePointsLedger, challengeSpectators } = await import("@shared/schema");
      const { challengeId, targetPlayerId, pointsAmount } = req.body;

      if (!challengeId || !targetPlayerId || !pointsAmount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const parsedPoints = parseInt(pointsAmount);
      if (isNaN(parsedPoints) || parsedPoints <= 0 || parsedPoints > 1000) {
        return res.status(400).json({ error: "Points amount must be between 1 and 1000" });
      }

      // Verify the challenge exists and is active
      const [challenge] = await db.select().from(challengesTable)
        .where(and(
          eq(challengesTable.id, challengeId),
          or(
            eq(challengesTable.status, 'waiting'),
            eq(challengesTable.status, 'active'),
            eq(challengesTable.status, 'in_progress'),
          ),
        ))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: "Active challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, req.user!.id);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      const participantIds = getChallengeParticipantIds(challenge);

      // Policy: only spectators can add challenge points, never seated players.
      if (participantIds.includes(req.user!.id)) {
        return res.status(403).json({ error: "Players cannot add spectator points" });
      }

      // Require active spectator membership to prevent public API abuse.
      const [activeSpectator] = await db.select({ id: challengeSpectators.id })
        .from(challengeSpectators)
        .where(and(
          eq(challengeSpectators.challengeId, challengeId),
          eq(challengeSpectators.userId, req.user!.id),
          isNull(challengeSpectators.leftAt),
        ))
        .limit(1);

      if (!activeSpectator) {
        return res.status(403).json({ error: "Only active spectators can add points" });
      }

      // Verify target player is in the challenge
      if (!participantIds.includes(targetPlayerId)) {
        return res.status(400).json({ error: "Target player is not in this challenge" });
      }

      // Cannot boost yourself
      if (targetPlayerId === req.user!.id) {
        return res.status(400).json({ error: "Cannot boost yourself" });
      }

      // Per-user cooldown to reduce spam bursts even before IP/user global rate limits.
      const [recentBoost] = await db.select({ id: challengePointsLedger.id })
        .from(challengePointsLedger)
        .where(and(
          eq(challengePointsLedger.challengeId, challengeId),
          eq(challengePointsLedger.userId, req.user!.id),
          sql`${challengePointsLedger.createdAt} > NOW() - interval '10 seconds'`,
        ))
        .limit(1);

      if (recentBoost) {
        return res.status(429).json({ error: "Please wait before adding points again" });
      }

      const [entry] = await db.insert(challengePointsLedger).values({
        challengeId,
        userId: req.user!.id,
        targetPlayerId,
        pointsAmount: parsedPoints,
        reason: "boost_challenge",
      }).returning();

      res.json(entry);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/challenges/:id/points", authMiddleware, async (req: AuthRequest, res: Response) => {
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

      const { challengePointsLedger } = await import("@shared/schema");
      const points = await db.select()
        .from(challengePointsLedger)
        .where(eq(challengePointsLedger.challengeId, req.params.id))
        .orderBy(desc(challengePointsLedger.createdAt));
      res.json(points);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // PUBLIC: Get challenge config for a game type (commission, surrender rules, etc.)
  app.get("/api/challenge-config/:gameType", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const config = await storage.getChallengeSettings(req.params.gameType);
      res.json({
        gameType: config.gameType,
        isEnabled: config.isEnabled,
        commissionPercent: config.commissionPercent,
        allowSurrender: config.allowSurrender,
        surrenderWinnerPercent: config.surrenderWinnerPercent,
        surrenderLoserRefundPercent: config.surrenderLoserRefundPercent,
        withdrawPenaltyPercent: config.withdrawPenaltyPercent,
        minStake: config.minStake,
        maxStake: config.maxStake,
        allowDraw: config.allowDraw,
        allowSpectators: config.allowSpectators,
        turnTimeoutSeconds: config.turnTimeoutSeconds,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
