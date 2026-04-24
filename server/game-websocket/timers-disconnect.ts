import { eq } from 'drizzle-orm';
import { Chess } from 'chess.js';
import { db } from '../db';
import { storage } from '../storage';
import { logger } from '../lib/logger';
import { getGameEngine } from '../game-engines';
import { gameMoves, liveGameSessions } from '@shared/schema';
import type { MoveData } from '../game-engines/types';
import type { AuthenticatedWebSocket, GameRoom } from './types';
import { rooms, userConnections, disconnectedPlayers, RECONNECT_GRACE_MS, TURN_TIMEOUT_MS, turnTimers } from './types';
import { broadcastToRoom, determineWinnerOnForfeit, send } from './utils';
import { handleGameOver } from './game-over';
import { getAdaptiveAiSessionConfig, isAdaptiveAiPlayer, recordAbandonedGame, resolveCurrentPlayerFromState } from '../lib/adaptive-ai';

const allowedMoveKeys = [
  'type', 'from', 'to', 'promotion', 'die', 'dieValues', 'position', 'tileId', 'side',
  'card', 'bid', 'suit', 'rank', 'action', 'target', 'source', 'destination', 'piece', 'selectedTile',
  'playedTile', 'drawFromBoneyard', 'pass', 'endSide', 'trump', 'declaration', 'team', 'points',
  'gameType', 'trumpSuit', 'tile', 'end',
] as const;

function sanitizeMove(move: MoveData): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of allowedMoveKeys) {
    if (key in move) {
      sanitized[key] = (move as Record<string, unknown>)[key];
    }
  }
  return sanitized;
}

function safeParseState(stateJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stateJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function selectDominoTimeoutAutoMove(validMoves: MoveData[]): MoveData | null {
  const plays = validMoves.filter((move) => move.type === 'play');
  if (plays.length > 0) {
    const scored = plays
      .map((move) => {
        const tile = move.tile as { left?: number; right?: number } | undefined;
        const left = typeof tile?.left === 'number' ? tile.left : 0;
        const right = typeof tile?.right === 'number' ? tile.right : 0;
        const isDouble = left === right;
        return {
          move,
          score: (left + right) + (isDouble ? 12 : 0),
        };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.move ?? plays[0];
  }

  return null;
}

const CHESS_TIMEOUT_PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};
const CHESS_TIMEOUT_CENTER_SQUARES = new Set(['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);

type EngineWithTimeoutBots = {
  generateBotMove?: (state: Record<string, unknown>) => MoveData;
  generateBotMoveFromState?: (state: Record<string, unknown>, playerId: string) => MoveData;
};

function scoreChessTimeoutMove(stateJson: string, move: MoveData): number {
  if (typeof move.from !== 'string' || typeof move.to !== 'string') {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = safeParseState(stateJson);
  const fen = typeof parsed?.fen === 'string' ? parsed.fen : stateJson;

  try {
    const chess = new Chess(fen);
    const piece = chess.get(move.from as never);
    const target = chess.get(move.to as never);

    let score = 0;
    if (target) {
      score += (CHESS_TIMEOUT_PIECE_VALUES[target.type] ?? 0) + 120;
    }

    if (typeof move.promotion === 'string') {
      score += move.promotion.toLowerCase() === 'q' ? 320 : 220;
    }

    if (CHESS_TIMEOUT_CENTER_SQUARES.has(move.to)) {
      score += 24;
    }

    if (piece?.type === 'n' || piece?.type === 'b') {
      score += 12;
    }

    if (piece?.type === 'p') {
      const targetRank = Number.parseInt(move.to[1] ?? '0', 10);
      if (targetRank === 4 || targetRank === 5) {
        score += 10;
      }
    }

    const applied = chess.move({
      from: move.from,
      to: move.to,
      promotion: typeof move.promotion === 'string' ? move.promotion : 'q',
    });

    if (applied) {
      if (chess.isCheckmate()) {
        score += 10000;
      } else if (chess.inCheck()) {
        score += 80;
      }
    }

    return score;
  } catch {
    return 0;
  }
}

function selectChessTimeoutAutoMove(stateJson: string, validMoves: MoveData[]): MoveData | null {
  const moves = validMoves.filter((move) => move.type === 'move');
  if (moves.length === 0) {
    return validMoves[0] ?? null;
  }

  const scored = moves
    .map((move) => ({ move, score: scoreChessTimeoutMove(stateJson, move) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.move ?? moves[0] ?? null;
}

function selectTimeoutAutoMove(
  room: GameRoom,
  engine: NonNullable<ReturnType<typeof getGameEngine>>,
  stateJson: string,
  currentPlayerId: string,
  validMoves: MoveData[],
): MoveData | null {
  if (validMoves.length === 0) {
    return null;
  }

  const parsedState = safeParseState(stateJson);
  const engineWithBots = engine as unknown as EngineWithTimeoutBots;

  try {
    if (room.gameType === 'domino') {
      const botMove = parsedState && typeof engineWithBots.generateBotMoveFromState === 'function'
        ? engineWithBots.generateBotMoveFromState(parsedState, currentPlayerId)
        : null;
      if (botMove?.type === 'play') {
        return botMove;
      }
      return selectDominoTimeoutAutoMove(validMoves);
    }

    if ((room.gameType === 'backgammon' || room.gameType === 'tarneeb' || room.gameType === 'baloot')
      && parsedState
      && typeof engineWithBots.generateBotMove === 'function') {
      const botMove = engineWithBots.generateBotMove(parsedState);
      if (botMove) {
        return botMove;
      }
    }

    if (room.gameType === 'chess') {
      return selectChessTimeoutAutoMove(stateJson, validMoves);
    }
  } catch (error) {
    logger.warn(`[WS] Timeout auto-move selector fallback for ${room.gameType} in session ${room.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return validMoves[0] ?? null;
}

async function tryHandleTimeoutAutoMove(sessionId: string, room: GameRoom, currentPlayerId: string): Promise<boolean> {
  const engine = getGameEngine(room.gameType);
  if (!engine) {
    return false;
  }

  const txResult = await db.transaction(async (tx) => {
    const [lockedSession] = await tx
      .select()
      .from(liveGameSessions)
      .where(eq(liveGameSessions.id, sessionId))
      .for('update');

    if (!lockedSession || lockedSession.status !== 'in_progress') {
      return { outcome: 'stale' as const };
    }

    const lockedState = lockedSession.gameState || room.gameState || engine.createInitialState();
    const activePlayerId = resolveCurrentPlayerFromState(room.gameType, lockedState, {
      player1Id: lockedSession.player1Id,
      player2Id: lockedSession.player2Id,
      player3Id: lockedSession.player3Id,
      player4Id: lockedSession.player4Id,
    });

    if (!activePlayerId || activePlayerId !== currentPlayerId) {
      return { outcome: 'stale' as const };
    }

    const validMoves = engine.getValidMoves(lockedState, currentPlayerId);
    const autoMove = selectTimeoutAutoMove(room, engine, lockedState, currentPlayerId, validMoves);
    if (!autoMove) {
      return { outcome: 'failed' as const };
    }

    const validation = engine.validateMove(lockedState, currentPlayerId, autoMove);
    if (!validation.valid) {
      logger.warn(`[WS] ${room.gameType} timeout auto-move invalid for player ${currentPlayerId} in session ${sessionId}: ${validation.error || 'unknown error'}`);
      return { outcome: 'failed' as const };
    }

    const applyResult = engine.applyMove(lockedState, currentPlayerId, autoMove);
    if (!applyResult.success) {
      logger.warn(`[WS] ${room.gameType} timeout auto-move apply failed for player ${currentPlayerId} in session ${sessionId}: ${applyResult.error || 'unknown error'}`);
      return { outcome: 'failed' as const };
    }

    const nextTurnNumber = (lockedSession.turnNumber || 0) + 1;

    await tx
      .update(liveGameSessions)
      .set({
        gameState: applyResult.newState,
        turnNumber: nextTurnNumber,
        updatedAt: new Date(),
      })
      .where(eq(liveGameSessions.id, sessionId));

    await tx.insert(gameMoves).values({
      sessionId,
      playerId: currentPlayerId,
      moveNumber: nextTurnNumber,
      moveType: autoMove.type || 'move',
      moveData: JSON.stringify({ ...sanitizeMove(autoMove), timeoutAuto: true }),
      isValid: true,
    });

    return {
      outcome: 'applied' as const,
      newState: applyResult.newState,
      events: applyResult.events,
      turnNumber: nextTurnNumber,
      autoMove,
      playerFallback: {
        player1Id: lockedSession.player1Id,
        player2Id: lockedSession.player2Id,
        player3Id: lockedSession.player3Id,
        player4Id: lockedSession.player4Id,
      },
    };
  });

  if (txResult.outcome === 'stale') {
    return true;
  }

  if (txResult.outcome !== 'applied') {
    return false;
  }

  room.gameState = txResult.newState;

  logger.info(`[WS] ${room.gameType} timeout auto-move applied for player ${currentPlayerId} in session ${sessionId}: ${txResult.autoMove.type}`);

  broadcastToRoom(room, {
    type: 'turn_timeout',
    payload: {
      timedOutPlayer: currentPlayerId,
      autoAction: 'auto_move',
      moveType: txResult.autoMove.type,
    }
  });

  for (const [playerId, playerWs] of room.players) {
    const playerView = engine.getPlayerView(txResult.newState, playerId);
    send(playerWs, {
      type: 'game_update',
      payload: {
        gameType: room.gameType,
        events: txResult.events,
        view: playerView,
        turnNumber: txResult.turnNumber,
      }
    });
  }

  const spectatorView = engine.getPlayerView(txResult.newState, 'spectator');
  for (const [, spectatorWs] of room.spectators) {
    send(spectatorWs, {
      type: 'game_update',
      payload: {
        gameType: room.gameType,
        events: txResult.events,
        view: spectatorView,
        turnNumber: txResult.turnNumber,
      }
    });
  }

  const gameStatus = engine.getGameStatus(txResult.newState);
  if (gameStatus.isOver) {
    clearTurnTimer(sessionId);
    await handleGameOver(room, gameStatus);
    cleanupCompletedRoomIfEmpty(sessionId, room);
    return true;
  }

  const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
  const nextPlayer = resolveCurrentPlayerFromState(room.gameType, txResult.newState, txResult.playerFallback);

  if (isAdaptiveAiPlayer(aiConfig, nextPlayer)) {
    const { processAdaptiveAiTurns } = await import('./ai-turns');
    await processAdaptiveAiTurns(sessionId, room);
  } else if (nextPlayer) {
    startTurnTimer(sessionId, nextPlayer, room.turnTimeLimitMs);
  }

  return true;
}

function cleanupCompletedRoomIfEmpty(sessionId: string, room: GameRoom) {
  if (room.players.size === 0 && room.spectators.size === 0) {
    rooms.delete(sessionId);
  }
}

async function continueMatchWithAbsentPlayer(
  sessionId: string,
  room: GameRoom,
  absentPlayerId: string,
  username?: string,
  reason: 'disconnect' | 'abandonment' = 'disconnect',
) {
  const session = await storage.getLiveGameSession(sessionId);
  if (!session || session.status !== 'in_progress') {
    return false;
  }

  const latestState = session.gameState || room.gameState;
  if (latestState) {
    room.gameState = latestState;
  }

  const currentPlayer = latestState
    ? resolveCurrentPlayerFromState(room.gameType, latestState, {
      player1Id: session.player1Id,
      player2Id: session.player2Id,
      player3Id: session.player3Id,
      player4Id: session.player4Id,
    })
    : null;

  logger.info(`[WS] Player ${absentPlayerId} is absent (${reason}) in session ${sessionId} — autoplay timer will keep the match running until it ends`);

  broadcastToRoom(room, {
    type: 'player_absent_auto',
    payload: {
      userId: absentPlayerId,
      username,
      reason,
      autoPlay: true,
      turnTimeLimitMs: room.turnTimeLimitMs || TURN_TIMEOUT_MS,
    }
  });

  if (currentPlayer && !turnTimers.has(sessionId)) {
    startTurnTimer(sessionId, currentPlayer, room.turnTimeLimitMs);
  }

  return true;
}

// Turn timer management
export function startTurnTimer(sessionId: string, currentPlayerId: string, timeLimitMs?: number) {
  // Clear existing timer for this session
  clearTurnTimer(sessionId);

  const timeout = timeLimitMs || TURN_TIMEOUT_MS;
  const timer = setTimeout(async () => {
    turnTimers.delete(sessionId);
    const room = rooms.get(sessionId);
    if (!room) return;

    try {
      const session = await storage.getLiveGameSession(sessionId);
      if (!session || session.status === 'completed') return;

      const handledByAutoMove = await tryHandleTimeoutAutoMove(sessionId, room, currentPlayerId);
      if (handledByAutoMove) {
        return;
      }

      // FIX: Determine winner correctly for both 2-player and 4-player team games
      const { winner: opponentId, winningTeam } = determineWinnerOnForfeit(session, currentPlayerId);
      const hasForfeitDecision = Boolean(opponentId) || winningTeam !== undefined;

      if (hasForfeitDecision) {
        logger.info(`[WS] Turn timeout for player ${currentPlayerId} in session ${sessionId}`);

        broadcastToRoom(room, {
          type: 'turn_timeout',
          payload: { timedOutPlayer: currentPlayerId, winner: opponentId }
        });

        await handleGameOver(room, {
          isOver: true,
          winner: opponentId || undefined,
          winningTeam,
          reason: 'timeout'
        });
        cleanupCompletedRoomIfEmpty(sessionId, room);
      }
    } catch (error) {
      console.error('[WS] Turn timer error:', error);
    }
  }, timeout);

  turnTimers.set(sessionId, timer);
}

export function clearTurnTimer(sessionId: string) {
  const existing = turnTimers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(sessionId);
  }
}

export function handleLeaveGame(ws: AuthenticatedWebSocket) {
  handleDisconnect(ws, true);
}

export async function handleDisconnect(ws: AuthenticatedWebSocket, isVoluntaryLeave: boolean = false) {
  if (ws.userId) {
    userConnections.delete(ws.userId);
  }

  if (ws.sessionId) {
    const room = rooms.get(ws.sessionId);
    if (room) {
      if (ws.isSpectator && ws.spectatorId) {
        room.spectators.delete(ws.spectatorId);
        broadcastToRoom(room, {
          type: 'spectator_left',
          payload: { spectatorCount: room.spectators.size }
        });
      } else if (ws.userId) {
        const disconnectedPlayerId = ws.userId;
        room.players.delete(disconnectedPlayerId);
        room.playerSpeedMultipliers?.delete(disconnectedPlayerId);

        const sessionId = ws.sessionId;

        // Notify room about disconnection
        broadcastToRoom(room, {
          type: 'player_disconnected',
          payload: { userId: disconnectedPlayerId, username: ws.username }
        });

        // Absence should not freeze the challenge. After the reconnect grace window,
        // the 30-second turn timer keeps auto-playing until the match reaches a winner.
        if (isVoluntaryLeave) {
          try {
            await continueMatchWithAbsentPlayer(sessionId, room, disconnectedPlayerId, ws.username, 'abandonment');
            const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
            if (aiConfig?.enabled && aiConfig.humanPlayerIds.includes(disconnectedPlayerId)) {
              await recordAbandonedGame({ sessionId, gameType: room.gameType, humanPlayerIds: [disconnectedPlayerId] });
            }
          } catch (error) {
            console.error('[WS] Error keeping abandoned match running:', error);
          }
        } else {
          const disconnectKey = `${sessionId}:${disconnectedPlayerId}`;

          if (!disconnectedPlayers.has(disconnectKey)) {
            broadcastToRoom(room, {
              type: 'player_disconnected_grace',
              payload: {
                userId: disconnectedPlayerId,
                username: ws.username,
                graceMs: RECONNECT_GRACE_MS
              }
            });

            const timer = setTimeout(async () => {
              disconnectedPlayers.delete(disconnectKey);

              const currentRoom = rooms.get(sessionId);
              if (currentRoom && !currentRoom.players.has(disconnectedPlayerId)) {
                try {
                  await continueMatchWithAbsentPlayer(sessionId, currentRoom, disconnectedPlayerId, ws.username, 'disconnect');
                  const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
                  if (aiConfig?.enabled && aiConfig.humanPlayerIds.includes(disconnectedPlayerId)) {
                    await recordAbandonedGame({ sessionId, gameType: currentRoom.gameType, humanPlayerIds: [disconnectedPlayerId] });
                  }
                } catch (error) {
                  console.error('[WS] Error enabling autoplay after disconnect grace:', error);
                }
              }
            }, RECONNECT_GRACE_MS);

            disconnectedPlayers.set(disconnectKey, { sessionId, userId: disconnectedPlayerId, timer });
          }
        }
      }

      if (room.players.size === 0 && room.spectators.size === 0) {
        const hasGracePeriodPlayers = Array.from(disconnectedPlayers.keys()).some(k => k.startsWith(ws.sessionId + ':'));
        if (!hasGracePeriodPlayers) {
          const session = await storage.getLiveGameSession(ws.sessionId);
          if (session?.status === 'in_progress') {
            const latestState = session.gameState || room.gameState;
            const currentPlayer = latestState
              ? resolveCurrentPlayerFromState(room.gameType, latestState, {
                player1Id: session.player1Id,
                player2Id: session.player2Id,
                player3Id: session.player3Id,
                player4Id: session.player4Id,
              })
              : null;

            if (currentPlayer && !turnTimers.has(ws.sessionId)) {
              startTurnTimer(ws.sessionId, currentPlayer, room.turnTimeLimitMs);
            }

            logger.info(`[WS] Keeping empty room ${ws.sessionId} alive so autoplay can finish the match while all players are absent`);
          } else {
            clearTurnTimer(ws.sessionId);
            rooms.delete(ws.sessionId);
          }
        }
      }
    }
  }
}
