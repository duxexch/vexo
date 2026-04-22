import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { db } from "../../db";
import { challengeGameSessions, challengeChatMessages, challenges, gameEvents } from "@shared/schema";
import { eq, desc, and, asc, ne } from "drizzle-orm";
import { getGameEngine } from "../../game-engines";
import { settleChallengePayout, settleDrawPayout } from "../../lib/payout";
import { isChallengeSessionPlayableStatus, normalizeChallengeGameState } from "../../lib/challenge-game-state";
import { trackDominoMoveError } from "../../lib/health";
import { moveRateLimiter } from "../../lib/rate-limiter";
import { sendNotification } from "../notifications";
import { logger } from "../../lib/logger";
import { getErrorMessage, type AuthenticatedSocket } from "../shared";
import { requireChallengePlayer } from "./guards";
import { appendGameEvent, finalizeGameEvent } from "../../lib/game-events";
import { runReplayShadowValidation, runSessionReplayValidation } from "../../lib/game-replay-shadow";
import type { MoveData, GameEngine } from "../../game-engines/types";

const GAME_EVENT_LOG_ENABLED = process.env.GAME_EVENT_LOG_ENABLED !== "false";
const GAME_MOVE_IDEMPOTENCY_STRICT = process.env.GAME_MOVE_IDEMPOTENCY_STRICT !== "false";
const GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL = process.env.GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL !== "false";
const GAME_REPLAY_SHADOW_ENABLED = process.env.GAME_REPLAY_SHADOW_ENABLED !== "false";
const GAME_REPLAY_SESSION_SHADOW_ENABLED = process.env.GAME_REPLAY_SESSION_SHADOW_ENABLED === "true";
const GAME_REPLAY_READ_SHADOW_ENABLED = process.env.GAME_REPLAY_READ_SHADOW_ENABLED === "true";
const GAME_REPLAY_SESSION_SHADOW_EVERY_N_TURNS = Math.max(1, Number(process.env.GAME_REPLAY_SESSION_SHADOW_EVERY_N_TURNS || "5"));

interface MoveErrorDetails {
  code: string;
  errorKey?: string;
  requiresSync: boolean;
}

class ChallengeMoveError extends Error {
  code: string;
  errorKey?: string;
  requiresSync: boolean;

  constructor(message: string, details: MoveErrorDetails) {
    super(message);
    this.name = "ChallengeMoveError";
    this.code = details.code;
    this.errorKey = details.errorKey;
    this.requiresSync = details.requiresSync;
  }
}

interface SuspiciousMoveTrackerEntry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

const suspiciousMoveTracker = new Map<string, SuspiciousMoveTrackerEntry>();
const SUSPICIOUS_MOVE_WINDOW_MS = 20_000;
const SUSPICIOUS_MOVE_THRESHOLD = 8;
const SUSPICIOUS_MOVE_BLOCK_MS = 45_000;
const SUSPICIOUS_MOVE_MAX_IDLE_MS = 10 * 60_000;

function buildSuspiciousMoveTrackerKey(userId: string, challengeId: string): string {
  return `${userId}:${challengeId}`;
}

function pruneSuspiciousMoveTracker(now = Date.now()): void {
  for (const [key, entry] of suspiciousMoveTracker.entries()) {
    const isWindowExpired = now - entry.windowStart >= SUSPICIOUS_MOVE_MAX_IDLE_MS;
    const isBlockExpired = typeof entry.blockedUntil === 'number' && entry.blockedUntil <= now;
    if (isWindowExpired || (isBlockExpired && entry.count <= 0)) {
      suspiciousMoveTracker.delete(key);
    }
  }
}

function getSuspiciousMoveBlockRemainingMs(userId: string, challengeId: string): number {
  const now = Date.now();
  const key = buildSuspiciousMoveTrackerKey(userId, challengeId);
  const entry = suspiciousMoveTracker.get(key);

  if (!entry || typeof entry.blockedUntil !== 'number') {
    return 0;
  }

  if (entry.blockedUntil <= now) {
    entry.blockedUntil = undefined;
    entry.count = 0;
    entry.windowStart = now;
    return 0;
  }

  return entry.blockedUntil - now;
}

function registerSuspiciousMoveFailure(userId: string, challengeId: string): { blocked: boolean; retryAfterMs?: number; count: number } {
  const now = Date.now();
  const key = buildSuspiciousMoveTrackerKey(userId, challengeId);
  const current = suspiciousMoveTracker.get(key);

  const entry: SuspiciousMoveTrackerEntry = (!current || now - current.windowStart >= SUSPICIOUS_MOVE_WINDOW_MS)
    ? { count: 0, windowStart: now }
    : current;

  entry.count += 1;

  if (entry.count >= SUSPICIOUS_MOVE_THRESHOLD) {
    entry.blockedUntil = now + SUSPICIOUS_MOVE_BLOCK_MS;
  }

  suspiciousMoveTracker.set(key, entry);

  if (typeof entry.blockedUntil === 'number' && entry.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterMs: entry.blockedUntil - now,
      count: entry.count,
    };
  }

  return { blocked: false, count: entry.count };
}

function resetSuspiciousMoveFailures(userId: string, challengeId: string): void {
  const key = buildSuspiciousMoveTrackerKey(userId, challengeId);
  suspiciousMoveTracker.delete(key);
}

const suspiciousMovePruneInterval = setInterval(() => {
  pruneSuspiciousMoveTracker();
}, 60_000);

if (typeof (suspiciousMovePruneInterval as any).unref === "function") {
  (suspiciousMovePruneInterval as any).unref();
}

function inferDominoErrorKey(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (normalized.includes("not your turn")) return "domino.notYourTurn";
  if (normalized.includes("cannot pass")) return "domino.cannotPass";
  if (normalized.includes("must draw")) return "domino.mustDraw";
  if (normalized.includes("cannot draw")) return "domino.cannotDraw";
  if (normalized.includes("boneyard is empty")) return "domino.boneyardEmpty";
  if (normalized.includes("tile not in your hand")) return "domino.tileNotInHand";
  if (normalized.includes("cannot play this tile on this end") || normalized.includes("invalid placement")) {
    return "domino.invalidPlacement";
  }
  if (normalized.includes("maximum draws reached")) return "domino.maxDrawsReached";
  if (normalized.includes("game is already over")) return "domino.gameAlreadyOver";
  if (normalized.includes("invalid game state") || normalized.includes("corrupted game state")) {
    return "domino.invalidState";
  }
  if (normalized.includes("invalid move type") || normalized.includes("invalid tile payload")) {
    return "domino.invalidMoveType";
  }
  return undefined;
}

function inferMoveErrorCode(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("not your turn")) return "not_your_turn";
  if (normalized.includes("game not in progress") || normalized.includes("already over")) {
    return "game_not_playable";
  }
  if (normalized.includes("challenge not found")) return "challenge_not_found";
  if (normalized.includes("unknown game type")) return "unknown_game_type";
  if (normalized.includes("corrupted game state") || normalized.includes("invalid game state")) {
    return "invalid_game_state";
  }
  if (normalized.includes("invalid move") || normalized.includes("cannot play") || normalized.includes("tile not in your hand")) {
    return "invalid_move";
  }
  if (normalized.includes("move apply failed") || normalized.includes("failed to apply move")) {
    return "move_apply_failed";
  }
  return "move_failed";
}

function toMoveErrorPayload(
  error: unknown,
  gameType: string | undefined,
): { error: string; code: string; errorKey?: string; requiresSync: boolean } {
  if (error instanceof ChallengeMoveError) {
    return {
      error: error.message,
      code: error.code,
      errorKey: error.errorKey,
      requiresSync: error.requiresSync,
    };
  }

  const message = getErrorMessage(error) || "Invalid move";
  const code = inferMoveErrorCode(message);
  const errorKey = gameType === "domino" ? inferDominoErrorKey(message) : undefined;
  const requiresSync = code === "not_your_turn" || code === "invalid_game_state" || code === "game_not_playable";

  return {
    error: message,
    code,
    errorKey,
    requiresSync,
  };
}

function normalizeChallengeCurrencyType(currencyType: unknown): "project" | "usd" {
  return currencyType === "project" ? "project" : "usd";
}

function formatChallengeAmount(amount: number, currencyType: unknown): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrencyType = normalizeChallengeCurrencyType(currencyType);
  if (normalizedCurrencyType === "project") {
    return `VXC ${safeAmount.toFixed(2)}`;
  }
  return `$${safeAmount.toFixed(2)}`;
}

function shouldRunSessionReplayShadow(turnNumber: number): boolean {
  if (GAME_REPLAY_READ_SHADOW_ENABLED) {
    return true;
  }

  if (turnNumber <= 1) {
    return true;
  }

  return turnNumber % GAME_REPLAY_SESSION_SHADOW_EVERY_N_TURNS === 0;
}

function buildChallengeInitialState(
  engine: Pick<GameEngine, "initializeWithPlayers">,
  gameType: string,
  challenge: typeof challenges.$inferSelect,
): string {
  const playerIds = [
    challenge.player1Id,
    challenge.player2Id,
    challenge.player3Id,
    challenge.player4Id,
  ].filter(Boolean) as string[];

  if (gameType === "tarneeb") {
    return engine.initializeWithPlayers(playerIds, 31);
  }

  if (gameType === "baloot") {
    return engine.initializeWithPlayers(playerIds, 152);
  }

  if (gameType === "backgammon") {
    return engine.initializeWithPlayers(playerIds[0], playerIds[1]);
  }

  if (gameType === "domino") {
    const targetScore = challenge.dominoTargetScore === 201 ? 201 : 101;
    return engine.initializeWithPlayers(playerIds, targetScore);
  }

  if (gameType === "languageduel") {
    return engine.initializeWithPlayers(playerIds[0], playerIds[1], {
      nativeLanguageCode: challenge.nativeLanguageCode || "ar",
      targetLanguageCode: challenge.targetLanguageCode || "en",
      mode: challenge.languageDuelMode || "mixed",
      pointsToWin: challenge.languageDuelPointsToWin || 10,
    });
  }

  return engine.initializeWithPlayers(playerIds[0], playerIds[1]);
}

/** Handle game_move message — process a move with DB transaction and payout settlement */
export async function handleGameMove(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, move, idempotencyKey } = data;
  const guard = requireChallengePlayer(ws, challengeId);
  if (!guard.ok) {
    return;
  }

  const userId = ws.userId;
  if (!userId) {
    return;
  }

  const moveType = typeof move?.type === "string" ? move.type : undefined;

  const moveRateLimitResult = moveRateLimiter.check(`challenge:${challengeId}:${userId}`);
  if (!moveRateLimitResult.allowed) {
    logger.security("Challenge move rate limit", {
      userId,
      action: "challenge_game_move",
      result: "blocked",
      reason: `rate_limit:${moveType || "unknown"}`,
    });

    ws.send(JSON.stringify({
      type: "move_error",
      error: "Too many moves, slow down",
      code: "rate_limit",
      requiresSync: false,
      retryAfterMs: moveRateLimitResult.retryAfterMs,
      challengeId,
      moveType,
    }));
    return;
  }

  const suspiciousBlockRemainingMs = getSuspiciousMoveBlockRemainingMs(userId, challengeId);
  if (suspiciousBlockRemainingMs > 0) {
    logger.security("Challenge move blocked due to suspicious attempts", {
      userId,
      action: "challenge_game_move",
      result: "blocked",
      reason: `suspicious_activity_block:${moveType || "unknown"}`,
    });

    ws.send(JSON.stringify({
      type: "move_error",
      error: "Too many invalid move attempts. Please wait and resync.",
      code: "suspicious_activity",
      requiresSync: true,
      retryAfterMs: suspiciousBlockRemainingMs,
      challengeId,
      moveType,
    }));
    return;
  }

  const { room } = guard;
  let resolvedGameType: string | undefined;
  const normalizedIdempotencyKey = typeof idempotencyKey === "string"
    ? idempotencyKey.trim().slice(0, 128)
    : "";
  const eventId = normalizedIdempotencyKey || randomUUID();
  const idempotencyReference = normalizedIdempotencyKey
    ? `challenge_game_move_idem:${challengeId}:${userId}:${normalizedIdempotencyKey}`
    : `challenge_game_move_evt:${challengeId}:${userId}:${eventId}`;

  let isCanonicalSession = false;
  let moveEventRecordId: string | undefined;
  let appendFailed = false;

  if (GAME_EVENT_LOG_ENABLED && (GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL || GAME_REPLAY_SHADOW_ENABLED)) {
    try {
      const [sessionModeRow] = await db.select({ stateMode: challengeGameSessions.stateMode })
        .from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1);

      isCanonicalSession = sessionModeRow?.stateMode === "CANONICAL";
    } catch (modeError) {
      logger.warn(`[GameEvents] Failed reading state mode for challenge ${challengeId}: ${modeError instanceof Error ? modeError.message : String(modeError)}`);
    }
  }

  if (GAME_EVENT_LOG_ENABLED) {
    try {
      const eventResult = await appendGameEvent({
        eventId,
        idempotencyKey: idempotencyReference,
        challengeId,
        source: "challenge_ws",
        eventType: "move",
        actorId: userId,
        actorType: "player",
        moveType: typeof move?.type === "string" ? move.type : "move",
        payload: {
          move: move as Record<string, unknown>,
        },
      });

      if (eventResult.duplicate && normalizedIdempotencyKey && GAME_MOVE_IDEMPOTENCY_STRICT) {
        ws.send(JSON.stringify({
          type: "move_error",
          error: "Duplicate move request ignored",
          code: "duplicate_event",
          requiresSync: false,
          challengeId,
          moveType,
        }));
        return;
      }

      moveEventRecordId = eventResult.recordId;
      if (!eventResult.duplicate && !moveEventRecordId) {
        appendFailed = true;
      }
    } catch (eventError) {
      appendFailed = true;
      logger.warn(`[GameEvents] Failed to append challenge game event for challenge ${challengeId}: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
    }
  }

  if (appendFailed && isCanonicalSession && GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL) {
    ws.send(JSON.stringify({
      type: "move_error",
      error: "Move was rejected because event logging is unavailable",
      code: "event_log_unavailable",
      requiresSync: true,
      challengeId,
      moveType,
    }));
    return;
  }

  try {
    // Use DB transaction with row lock for atomic move processing
    const result = await db.transaction(async (tx) => {
      // Lock the session row to prevent race conditions
      const [session] = await tx.select().from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1)
        .for('update');

      if (!session || !isChallengeSessionPlayableStatus(session.status)) {
        throw new ChallengeMoveError("Game not in progress", {
          code: "game_not_playable",
          requiresSync: true,
        });
      }

      const gameType = String(session.gameType || "").toLowerCase();
      resolvedGameType = gameType;

      if (session.currentTurn !== ws.userId) {
        throw new ChallengeMoveError("Not your turn", {
          code: "not_your_turn",
          errorKey: gameType === "domino" ? "domino.notYourTurn" : undefined,
          requiresSync: true,
        });
      }

      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, challengeId));
      if (!challenge) {
        throw new ChallengeMoveError("Challenge not found", {
          code: "challenge_not_found",
          requiresSync: true,
        });
      }

      const engine = getGameEngine(gameType);
      if (!engine) {
        throw new ChallengeMoveError(`Unknown game type: ${gameType}`, {
          code: "unknown_game_type",
          requiresSync: false,
        });
      }

      // Get or initialize game state
      let stateJson: string;
      const normalizedState = normalizeChallengeGameState(session.gameState);
      if (normalizedState) {
        stateJson = normalizedState;
      } else {
        const playerIds = [
          challenge.player1Id,
          challenge.player2Id,
          challenge.player3Id,
          challenge.player4Id,
        ].filter(Boolean) as string[];
        if ((session.totalMoves || 0) > 0) {
          throw new ChallengeMoveError("Corrupted game state", {
            code: "invalid_game_state",
            errorKey: gameType === "domino" ? "domino.invalidState" : undefined,
            requiresSync: true,
          });
        }

        if (gameType === "tarneeb") {
          stateJson = engine.initializeWithPlayers(playerIds, 31);
        } else if (gameType === "baloot") {
          stateJson = engine.initializeWithPlayers(playerIds, 152);
        } else if (gameType === "backgammon") {
          stateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1]);
        } else if (gameType === "domino") {
          const targetScore = challenge.dominoTargetScore === 201 ? 201 : 101;
          stateJson = engine.initializeWithPlayers(playerIds, targetScore);
        } else if (gameType === "languageduel") {
          stateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1], {
            nativeLanguageCode: challenge.nativeLanguageCode || "ar",
            targetLanguageCode: challenge.targetLanguageCode || "en",
            mode: challenge.languageDuelMode || "mixed",
            pointsToWin: challenge.languageDuelPointsToWin || 10,
          });
        } else {
          stateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1]);
        }
      }

      // Validate the move
      const validation = engine.validateMove(stateJson, ws.userId!, move);
      if (!validation.valid) {
        throw new ChallengeMoveError(validation.error || 'Invalid move', {
          code: "invalid_move",
          errorKey: validation.errorKey || (gameType === "domino" ? inferDominoErrorKey(validation.error || "") : undefined),
          requiresSync: false,
        });
      }

      // Apply the move
      const applyResult = engine.applyMove(stateJson, ws.userId!, move);
      if (!applyResult.success) {
        throw new ChallengeMoveError(applyResult.error || 'Move apply failed', {
          code: "move_apply_failed",
          errorKey: gameType === "domino" ? inferDominoErrorKey(applyResult.error || "") : undefined,
          requiresSync: true,
        });
      }

      // Check game status
      const gameStatus = engine.getGameStatus(applyResult.newState);
      let winnerId: string | null = null;
      let isGameOver = false;
      let isDraw = false;
      let winningTeam: number | undefined;

      if (gameStatus.isOver) {
        isGameOver = true;
        isDraw = gameStatus.isDraw || false;
        if (gameStatus.winner) {
          winnerId = gameStatus.winner;
        } else if (gameStatus.winningTeam !== undefined) {
          winningTeam = gameStatus.winningTeam;
          // For team games, map winning team to player
          const state = JSON.parse(applyResult.newState);
          if (state.teams) {
            const winningTeamPlayers = gameStatus.winningTeam === 0 ? state.teams.team0 : state.teams.team1;
            winnerId = winningTeamPlayers?.[0] || null;
          } else {
            winnerId = gameStatus.winningTeam === 0 ? challenge.player1Id : challenge.player2Id;
          }
        }
      }

      // Determine next turn from game state
      let nextTurn: string | null = null;
      if (!isGameOver) {
        const newState = JSON.parse(applyResult.newState);
        const playerIds = [
          challenge.player1Id,
          challenge.player2Id,
          challenge.player3Id,
          challenge.player4Id,
        ].filter(Boolean) as string[];
        if (newState.currentPlayer) {
          nextTurn = newState.currentPlayer;
        } else if (newState.currentTurn) {
          // For backgammon: map color to player
          if (newState.currentTurn === 'white' || newState.currentTurn === 'black') {
            nextTurn = newState.currentTurn === 'white' ? challenge.player1Id : challenge.player2Id!;
          } else {
            nextTurn = newState.currentTurn;
          }
        } else {
          // Fallback: rotate among seated players
          if (playerIds.length > 1) {
            const currentIdx = playerIds.indexOf(ws.userId!);
            nextTurn = playerIds[(currentIdx + 1) % playerIds.length] || null;
          } else {
            nextTurn = playerIds[0] || null;
          }
        }
      }

      // Update session in DB
      const [updatedSession] = await tx.update(challengeGameSessions)
        .set({
          gameState: applyResult.newState,
          currentTurn: isGameOver ? null : nextTurn,
          totalMoves: (session.totalMoves || 0) + 1,
          lastMoveAt: new Date(),
          updatedAt: new Date(),
          status: isGameOver ? 'finished' : 'playing',
          winnerId: winnerId,
        })
        .where(eq(challengeGameSessions.id, session.id))
        .returning();

      return {
        preState: stateJson,
        updatedSession,
        newState: applyResult.newState,
        events: applyResult.events,
        isGameOver,
        isDraw,
        winnerId,
        winningTeam,
        challenge,
        engine,
        gameType
      };
    });

    // Broadcast to players with personalized views (hide opponent cards)
    const seq = typeof result.updatedSession.totalMoves === "number" ? result.updatedSession.totalMoves : 0;
    let readState = result.newState;

    if (isCanonicalSession && GAME_REPLAY_SHADOW_ENABLED) {
      runReplayShadowValidation({
        scope: "challenge",
        gameType: result.gameType,
        challengeId,
        sessionId: result.updatedSession.id,
        userId,
        move: move as MoveData,
        preState: result.preState,
        committedState: result.newState,
        turnNumber: seq,
      }, result.engine);
    }

    const shouldRunSessionReplay = isCanonicalSession
      && (GAME_REPLAY_SESSION_SHADOW_ENABLED || GAME_REPLAY_READ_SHADOW_ENABLED)
      && shouldRunSessionReplayShadow(seq);

    if (shouldRunSessionReplay) {
      try {
        const replayRows = await db
          .select({
            actorId: gameEvents.actorId,
            payload: gameEvents.payload,
          })
          .from(gameEvents)
          .where(and(
            eq(gameEvents.challengeId, challengeId),
            eq(gameEvents.eventType, "move"),
            ne(gameEvents.status, "rejected"),
          ))
          .orderBy(asc(gameEvents.createdAt), asc(gameEvents.id));

        const initialState = buildChallengeInitialState(result.engine, result.gameType, result.challenge);

        const sessionReplayResult = runSessionReplayValidation({
          scope: "challenge",
          gameType: result.gameType,
          challengeId,
          sessionId: result.updatedSession.id,
          initialState,
          events: replayRows,
          committedState: result.newState,
          turnNumber: seq,
        }, result.engine);

        if (GAME_REPLAY_READ_SHADOW_ENABLED) {
          if (!sessionReplayResult.drift && sessionReplayResult.replayedState) {
            readState = sessionReplayResult.replayedState;
          } else {
            logger.warn(`[ReplayShadow] Read shadow fallback to committed state for challenge ${challengeId} on turn ${seq}`);
          }
        }
      } catch (sessionReplayError) {
        logger.warn(`[ReplayShadow] Session replay failed for challenge ${challengeId}: ${sessionReplayError instanceof Error ? sessionReplayError.message : String(sessionReplayError)}`);
      }
    }

    room.currentState = {
      challengeId,
      gameType: result.gameType,
      gameState: readState,
      currentTurn: result.updatedSession.currentTurn || "",
      totalMoves: seq,
      status: result.updatedSession.status,
      spectatorCount: room.spectators.size,
    };

    // Valid move flow completed successfully — clear suspicious counters for this user/challenge pair.
    resetSuspiciousMoveFailures(userId, challengeId);

    for (const [playerId, socket] of room.players) {
      if (socket.readyState === WebSocket.OPEN) {
        const playerView = result.engine.getPlayerView(readState, playerId);
        socket.send(JSON.stringify({
          type: "game_move",
          session: { ...result.updatedSession, gameState: undefined },
          view: playerView,
          events: result.events,
          move,
          playerId: ws.userId,
          seq,
        }));
      }
    }

    // Broadcast to spectators with spectator view (hidden hands)
    for (const [, socket] of room.spectators) {
      if (socket.readyState === WebSocket.OPEN) {
        const spectatorView = result.engine.getPlayerView(readState, 'spectator');
        socket.send(JSON.stringify({
          type: "game_move",
          session: { ...result.updatedSession, gameState: undefined },
          view: spectatorView,
          events: result.events,
          move,
          playerId: ws.userId,
          seq,
        }));
      }
    }

    // CRITICAL: Settle payout if game is over
    if (result.isGameOver && result.challenge) {
      let settledStakeForNotifications = result.challenge.betAmount;

      if (result.isDraw) {
        const drawSettlement = await settleDrawPayout(
          challengeId,
          result.challenge.player1Id,
          result.challenge.player2Id!,
          result.gameType,
          undefined,
          [result.challenge.player3Id, result.challenge.player4Id].filter(Boolean) as string[]
        );

        if (!drawSettlement.success) {
          throw new Error(drawSettlement.error || "Draw payout settlement failed");
        }
      } else if (result.winnerId) {
        const allPlayerIds = [
          result.challenge.player1Id,
          result.challenge.player2Id,
          result.challenge.player3Id,
          result.challenge.player4Id,
        ].filter(Boolean) as string[];

        const loserId = result.winningTeam !== undefined
          ? (result.winningTeam === 0
            ? ([result.challenge.player2Id, result.challenge.player4Id].filter(Boolean) as string[])[0]
            : ([result.challenge.player1Id, result.challenge.player3Id].filter(Boolean) as string[])[0])
          : allPlayerIds.find((id) => id !== result.winnerId);

        if (!loserId) {
          throw new Error('Unable to resolve loser for payout settlement');
        }

        const payoutSettlement = await settleChallengePayout(
          challengeId,
          result.winnerId,
          loserId,
          result.gameType,
          undefined,
          result.newState,
        );

        if (!payoutSettlement.success) {
          throw new Error(payoutSettlement.error || "Winner payout settlement failed");
        }

        settledStakeForNotifications = payoutSettlement.stakeAmount || settledStakeForNotifications;
      }

      // Update challenge status after successful settlement to keep money/state consistency
      await db.update(challenges)
        .set({
          status: "completed",
          winnerId: result.winnerId,
          endedAt: new Date(),
        })
        .where(eq(challenges.id, challengeId));

      // Broadcast game over
      const gameStatus2 = result.engine.getGameStatus(readState);
      [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "game_ended",
            winnerId: result.winnerId,
            isDraw: result.isDraw,
            reason: result.isDraw ? "draw" : (gameStatus2.reason || "game_complete"), // F3: use engine reason (e.g. "blocked")
            scores: gameStatus2.scores || undefined, // F12: include final scores
          }));
        }
      });

      // Send DB notifications for game result
      const betAmount = settledStakeForNotifications ? parseFloat(settledStakeForNotifications) : 0;
      const challengeCurrencyType = result.challenge.currencyType;
      const gameLabel = result.gameType || 'game';
      if (result.isDraw) {
        // Notify all players of draw
        const drawPlayerIds = [
          result.challenge.player1Id,
          result.challenge.player2Id,
          result.challenge.player3Id,
          result.challenge.player4Id,
        ].filter(Boolean) as string[];
        const formattedBetAmount = formatChallengeAmount(betAmount, challengeCurrencyType);
        const drawMsg = { type: 'system' as const, priority: 'normal' as const, title: `${gameLabel} — Draw`, titleAr: `${gameLabel} — تعادل`, message: `The game ended in a draw. ${betAmount > 0 ? `${formattedBetAmount} refunded.` : ''}`, messageAr: `انتهت اللعبة بالتعادل. ${betAmount > 0 ? `تم إرجاع ${formattedBetAmount}.` : ''}`, link: '/challenges' };
        drawPlayerIds.forEach((playerId) => {
          sendNotification(playerId, drawMsg).catch(() => { });
        });
      } else if (result.winnerId) {
        const winnerIds = result.winningTeam !== undefined
          ? (result.winningTeam === 0
            ? [result.challenge.player1Id, result.challenge.player3Id]
            : [result.challenge.player2Id, result.challenge.player4Id]).filter(Boolean) as string[]
          : [result.winnerId];

        const loserIds = result.winningTeam !== undefined
          ? (result.winningTeam === 0
            ? [result.challenge.player2Id, result.challenge.player4Id]
            : [result.challenge.player1Id, result.challenge.player3Id]).filter(Boolean) as string[]
          : ([result.challenge.player1Id, result.challenge.player2Id, result.challenge.player3Id, result.challenge.player4Id]
            .filter((id): id is string => Boolean(id && id !== result.winnerId)));

        winnerIds.forEach((winnerId) => {
          const formattedWinnerWinnings = formatChallengeAmount(betAmount * 2 * 0.95, challengeCurrencyType);
          sendNotification(winnerId, { type: 'success', priority: 'normal', title: `You Won! — ${gameLabel}`, titleAr: `فزت! — ${gameLabel}`, message: `Congratulations! You won the challenge.${betAmount > 0 ? ` You earned ${formattedWinnerWinnings}.` : ''}`, messageAr: `تهانينا! فزت بالتحدي.${betAmount > 0 ? ` ربحت ${formattedWinnerWinnings}.` : ''}`, link: '/challenges' }).catch(() => { });
        });

        loserIds.forEach((loserId) => {
          const formattedLoserDeduction = formatChallengeAmount(betAmount, challengeCurrencyType);
          sendNotification(loserId, { type: 'warning', priority: 'normal', title: `You Lost — ${gameLabel}`, titleAr: `خسرت — ${gameLabel}`, message: `You lost the challenge.${betAmount > 0 ? ` ${formattedLoserDeduction} deducted.` : ''} Better luck next time!`, messageAr: `خسرت التحدي.${betAmount > 0 ? ` تم خصم ${formattedLoserDeduction}.` : ''} حظاً أوفر المرة القادمة!`, link: '/challenges' }).catch(() => { });
        });
      }

      // Delete game chat messages after game ends
      try {
        const [gameSession] = await db.select().from(challengeGameSessions)
          .where(eq(challengeGameSessions.challengeId, challengeId))
          .orderBy(desc(challengeGameSessions.createdAt))
          .limit(1);
        if (gameSession) {
          await db.delete(challengeChatMessages)
            .where(eq(challengeChatMessages.sessionId, gameSession.id));
        }
      } catch (cleanupErr) {
        logger.error('Failed to cleanup game chat:', cleanupErr);
      }
    }

    await finalizeGameEvent(moveEventRecordId, "applied");
  } catch (error: unknown) {
    let payload = toMoveErrorPayload(error, resolvedGameType);
    await finalizeGameEvent(moveEventRecordId, "rejected", payload.code.slice(0, 64));

    let retryAfterMs: number | undefined;
    const shouldTrackDominoError = resolvedGameType === "domino" || String(payload.errorKey || "").startsWith("domino.");

    if (shouldTrackDominoError) {
      trackDominoMoveError(payload.errorKey, {
        userId,
        challengeId,
        code: payload.code,
      });
    }

    const isSuspiciousFailure = payload.code === "invalid_move"
      || payload.code === "invalid_game_state"
      || payload.code === "move_apply_failed";

    if (isSuspiciousFailure) {
      const suspiciousResult = registerSuspiciousMoveFailure(userId, challengeId);

      if (payload.code === "invalid_game_state" || payload.code === "move_apply_failed") {
        logger.security("Challenge move suspicious signal", {
          userId,
          action: "challenge_game_move",
          result: "suspicious",
          reason: payload.code,
        });
      }

      if (suspiciousResult.blocked) {
        retryAfterMs = suspiciousResult.retryAfterMs;
        payload = {
          error: "Too many invalid move attempts. Please wait and resync.",
          code: "suspicious_activity",
          errorKey: payload.errorKey,
          requiresSync: true,
        };

        logger.security("Challenge move blocked due to repeated invalid attempts", {
          userId,
          action: "challenge_game_move",
          result: "blocked",
          reason: `suspicious_activity_threshold:${suspiciousResult.count}`,
        });
      }
    }

    logger.warn("Challenge move rejected", {
      action: "challenge_game_move",
      challengeId,
      userId,
      gameType: resolvedGameType,
      moveType,
      code: payload.code,
      errorKey: payload.errorKey,
      requiresSync: payload.requiresSync,
      error: payload.error,
    });

    ws.send(JSON.stringify({
      type: "move_error",
      error: payload.error,
      code: payload.code,
      errorKey: payload.errorKey,
      requiresSync: payload.requiresSync,
      retryAfterMs,
      challengeId,
      gameType: resolvedGameType,
      moveType,
    }));
  }
}
