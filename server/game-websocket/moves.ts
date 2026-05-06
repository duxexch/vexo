import { randomUUID } from 'node:crypto';
import { storage } from '../storage';
import { db } from '../db';
import { liveGameSessions, gameMoves } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getGameEngine } from '../game-engines';
import type { MoveData } from '../game-engines/types';
import { logger } from '../lib/logger';
import {
  getAdaptiveAiSessionConfig,
  isAdaptiveAiPlayer,
  recordAdaptiveGameResult,
  recordAdaptiveHumanMove,
  resolveCurrentPlayerFromState,
} from '../lib/adaptive-ai';
import type { AuthenticatedWebSocket } from './types';
import { rooms } from './types';
import { send, sendError } from './utils';
import { handleGameOver } from './game-over';
import { startTurnTimer, clearTurnTimer } from './timers-disconnect';
import { getErrorMessage } from './types';
import { processAdaptiveAiTurns } from './ai-turns';
import { appendGameEvent, finalizeGameEvent } from '../lib/game-events';
import { runReplayShadowValidation } from '../lib/game-replay-shadow';

const GAME_EVENT_LOG_ENABLED = process.env.GAME_EVENT_LOG_ENABLED !== 'false';
const GAME_MOVE_IDEMPOTENCY_STRICT = process.env.GAME_MOVE_IDEMPOTENCY_STRICT !== 'false';
const GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL = process.env.GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL !== 'false';
const GAME_REPLAY_SHADOW_ENABLED = process.env.GAME_REPLAY_SHADOW_ENABLED !== 'false';

interface HandleMakeMovePayload {
  move: MoveData;
  expectedTurn?: number;
  idempotencyKey?: string;
  correlationId?: string;
}

export async function handleMakeMove(ws: AuthenticatedWebSocket, payload: HandleMakeMovePayload) {
  if (!ws.userId || !ws.sessionId) {
    sendError(ws, 'Not in a game');
    return;
  }

  if (ws.isSpectator) {
    sendError(ws, 'Spectators cannot make moves');
    return;
  }

  const room = rooms.get(ws.sessionId);
  if (!room) {
    sendError(ws, 'Game room not found');
    return;
  }

  const engine = getGameEngine(room.gameType);
  if (!engine) {
    sendError(ws, 'Game engine not available');
    return;
  }

  const sessionId = ws.sessionId;
  const userId = ws.userId;
  const normalizedIdempotencyKey = typeof payload.idempotencyKey === 'string'
    ? payload.idempotencyKey.trim().slice(0, 128)
    : '';
  if (GAME_MOVE_IDEMPOTENCY_STRICT && !normalizedIdempotencyKey) {
    sendError(ws, 'Missing idempotency key for move submission', 'IDEMPOTENCY_KEY_REQUIRED');
    return;
  }

  const correlationId = typeof payload.correlationId === 'string' && payload.correlationId.trim().length > 0
    ? payload.correlationId.trim().slice(0, 128)
    : randomUUID();
  const eventId = normalizedIdempotencyKey || correlationId;
  const moveId = normalizedIdempotencyKey || eventId;
  const idempotencyReference = normalizedIdempotencyKey
    ? `live_game_move_idem:${sessionId}:${userId}:${normalizedIdempotencyKey}`
    : `live_game_move_evt:${sessionId}:${userId}:${eventId}`;

  let isCanonicalSession = false;
  let moveEventRecordId: string | undefined;
  let appendFailed = false;

  if (GAME_EVENT_LOG_ENABLED && (GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL || GAME_REPLAY_SHADOW_ENABLED)) {
    try {
      const [sessionModeRow] = await db
        .select({ stateMode: liveGameSessions.stateMode })
        .from(liveGameSessions)
        .where(eq(liveGameSessions.id, sessionId))
        .limit(1);

      isCanonicalSession = sessionModeRow?.stateMode === 'CANONICAL';
    } catch (modeError) {
      logger.warn(`[GameEvents] Failed reading state mode for session ${sessionId}: ${modeError instanceof Error ? modeError.message : String(modeError)}`);
    }
  }

  if (GAME_EVENT_LOG_ENABLED) {
    try {
      const eventResult = await appendGameEvent({
        eventId,
        idempotencyKey: idempotencyReference,
        sessionId,
        source: 'live_game_ws',
        eventType: 'move',
        actorId: userId,
        actorType: 'player',
        moveType: typeof payload.move?.type === 'string' ? payload.move.type : 'move',
        payload: {
          move: payload.move as unknown as Record<string, unknown>,
          expectedTurn: payload.expectedTurn ?? null,
        },
      });

      if (eventResult.duplicate && normalizedIdempotencyKey && GAME_MOVE_IDEMPOTENCY_STRICT) {
        send(ws, {
          type: 'move_rejected',
          payload: {
            error: 'Duplicate move request ignored',
            errorKey: 'game.duplicateMove',
            code: 'duplicate_event',
            requiresSync: false,
            correlationId,
          }
        });
        return;
      }

      moveEventRecordId = eventResult.recordId;
      if (!eventResult.duplicate && !moveEventRecordId) {
        appendFailed = true;
      }
    } catch (eventError) {
      appendFailed = true;
      logger.warn(`[GameEvents] Failed to append live game event for session ${sessionId}: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
    }
  }

  if (appendFailed && isCanonicalSession && GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL) {
    send(ws, {
      type: 'move_rejected',
      payload: {
        error: 'Move was rejected because event logging is unavailable',
        errorKey: 'game.eventLogUnavailable',
        code: 'event_log_unavailable',
        requiresSync: true,
        correlationId,
      }
    });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [lockedSession] = await tx
        .select()
        .from(liveGameSessions)
        .where(eq(liveGameSessions.id, sessionId))
        .for('update');

      if (!lockedSession) {
        throw new Error('SESSION_NOT_FOUND');
      }

      if (lockedSession.status !== 'in_progress') {
        throw new Error('SESSION_NOT_ACTIVE');
      }

      const sessionPlayers = [
        lockedSession.player1Id,
        lockedSession.player2Id,
        lockedSession.player3Id,
        lockedSession.player4Id,
      ].filter(Boolean) as string[];

      if (!sessionPlayers.includes(userId)) {
        throw new Error('UNAUTHORIZED_PLAYER');
      }

      const dbState = lockedSession.gameState || engine.createInitialState();
      const dbTurn = lockedSession.turnNumber || 0;

      if (payload.expectedTurn !== undefined && payload.expectedTurn !== dbTurn) {
        const error = Object.assign(new Error('TURN_MISMATCH'), { dbState, dbTurn });
        throw error;
      }

      const validation = engine.validateMove(dbState, userId, payload.move);
      if (!validation.valid) {
        const error = Object.assign(new Error('INVALID_MOVE'), { validationError: validation.error, errorKey: validation.errorKey });
        throw error;
      }

      const applyResult = engine.applyMove(dbState, userId, payload.move);
      if (!applyResult.success) {
        const error = Object.assign(new Error('MOVE_APPLY_FAILED'), { applyError: applyResult.error });
        throw error;
      }

      const newTurnNumber = dbTurn + 1;

      await tx
        .update(liveGameSessions)
        .set({
          gameState: applyResult.newState,
          turnNumber: newTurnNumber
        })
        .where(eq(liveGameSessions.id, sessionId));

      // SECURITY: Strip unknown properties from move data before storage to prevent data stuffing
      const allowedMoveKeys = ['type', 'from', 'to', 'promotion', 'die', 'dieValues', 'position', 'tileId', 'side',
        'card', 'bid', 'suit', 'rank', 'action', 'target', 'source', 'destination', 'piece', 'selectedTile',
        'playedTile', 'drawFromBoneyard', 'pass', 'endSide', 'trump', 'declaration', 'team', 'points',
        'gameType', 'trumpSuit', 'tile', 'end'];
      const sanitizedMove: Record<string, unknown> = {};
      for (const key of allowedMoveKeys) {
        if (key in payload.move) sanitizedMove[key] = (payload.move as Record<string, unknown>)[key];
      }

      await tx.insert(gameMoves).values({
        sessionId: sessionId,
        moveId,
        playerId: userId,
        moveNumber: newTurnNumber,
        moveType: payload.move.type || 'move',
        moveData: JSON.stringify(sanitizedMove),
        isValid: true
      });

      return {
        preState: dbState,
        newState: applyResult.newState,
        events: applyResult.events,
        turnNumber: newTurnNumber,
        playerFallback: {
          player1Id: lockedSession.player1Id,
          player2Id: lockedSession.player2Id,
          player3Id: lockedSession.player3Id,
          player4Id: lockedSession.player4Id,
        },
      };
    });

    room.gameState = result.newState;

    if (isCanonicalSession && GAME_REPLAY_SHADOW_ENABLED) {
      runReplayShadowValidation({
        scope: 'live',
        gameType: room.gameType,
        sessionId,
        userId,
        move: payload.move,
        preState: result.preState,
        committedState: result.newState,
        turnNumber: result.turnNumber,
      }, engine);
    }

    await recordAdaptiveHumanMove({
      sessionId,
      userId,
      gameType: room.gameType,
      move: payload.move,
      turnNumber: result.turnNumber,
    });

    logger.info(`[WS] Move committed: session=${sessionId}, turn=${result.turnNumber}, player=${userId}`);

    for (const [playerId, playerWs] of room.players) {
      const playerView = engine.getPlayerView(result.newState, playerId);
      send(playerWs, {
        type: 'game_update',
        payload: {
          gameType: room.gameType,
          events: result.events,
          view: playerView,
          turnNumber: result.turnNumber
        }
      });
    }

    const spectatorView = engine.getPlayerView(result.newState, 'spectator');
    for (const [, spectatorWs] of room.spectators) {
      send(spectatorWs, {
        type: 'game_update',
        payload: {
          gameType: room.gameType,
          events: result.events,
          view: spectatorView,
          turnNumber: result.turnNumber
        }
      });
    }

    const gameStatus = engine.getGameStatus(result.newState);
    if (gameStatus.isOver) {
      clearTurnTimer(sessionId);
      await recordAdaptiveGameResult({
        sessionId,
        gameType: room.gameType,
        status: gameStatus,
        stateJson: result.newState,
      });
      await handleGameOver(room, gameStatus);
    } else {
      // Start turn timer for the next player
      const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
      const nextPlayer = resolveCurrentPlayerFromState(room.gameType, result.newState, result.playerFallback);

      if (isAdaptiveAiPlayer(aiConfig, nextPlayer)) {
        await processAdaptiveAiTurns(sessionId, room);
      } else if (nextPlayer) {
        startTurnTimer(sessionId, nextPlayer, room.turnTimeLimitMs);
      }
    }

    await finalizeGameEvent(moveEventRecordId, 'applied');
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    await finalizeGameEvent(moveEventRecordId, 'rejected', errorMessage.slice(0, 64));

    console.error('[WS] Move transaction failed:', error);

    const syncRoom = async () => {
      const freshSession = await storage.getLiveGameSession(sessionId);
      if (freshSession?.gameState) {
        room.gameState = freshSession.gameState;
        const syncView = engine.getPlayerView(freshSession.gameState, userId);
        send(ws, {
          type: 'state_sync',
          payload: {
            gameType: room.gameType,
            view: syncView,
            turnNumber: freshSession.turnNumber
          }
        });
      }
    };

    if (errorMessage === 'SESSION_NOT_FOUND') {
      sendError(ws, 'Session not found', 'SESSION_NOT_FOUND');
    } else if (errorMessage === 'SESSION_NOT_ACTIVE') {
      sendError(ws, 'Game is not active', 'SESSION_NOT_ACTIVE');
      await syncRoom();
    } else if (errorMessage === 'UNAUTHORIZED_PLAYER') {
      sendError(ws, 'Not authorized to play in this session', 'UNAUTHORIZED');
      await syncRoom();
    } else if (errorMessage === 'TURN_MISMATCH') {
      send(ws, {
        type: 'move_rejected',
        payload: {
          error: 'Game state has changed. Syncing...',
          errorKey: 'game.turnMismatch',
          requiresSync: true,
          correlationId
        }
      });
      await syncRoom();
    } else if (errorMessage === 'INVALID_MOVE') {
      const moveErr = error as Error & { validationError?: string; errorKey?: string };
      send(ws, {
        type: 'move_rejected',
        payload: { error: moveErr.validationError, errorKey: moveErr.errorKey, correlationId }
      });
    } else if (errorMessage === 'MOVE_APPLY_FAILED') {
      const applyErr = error as Error & { applyError?: string };
      send(ws, {
        type: 'move_rejected',
        payload: { error: applyErr.applyError, correlationId }
      });
    } else {
      sendError(ws, 'Failed to save move. Please try again.');
      await syncRoom();
    }
  }
}
