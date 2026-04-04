import { eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { logger } from '../lib/logger';
import { getGameEngine } from '../game-engines';
import { gameMoves, liveGameSessions } from '@shared/schema';
import type { MoveData } from '../game-engines/types';
import type { AuthenticatedWebSocket, GameRoom } from './types';
import { rooms, userConnections, disconnectedPlayers, RECONNECT_GRACE_MS, TURN_TIMEOUT_MS, turnTimers, forfeitingSessionsLock } from './types';
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

function selectDominoTimeoutAutoMove(validMoves: MoveData[]): MoveData | null {
  const playable = validMoves.find((move) => move.type === 'play');
  if (playable) return playable;

  const drawMove = validMoves.find((move) => move.type === 'draw');
  if (drawMove) return drawMove;

  const passMove = validMoves.find((move) => move.type === 'pass');
  if (passMove) return passMove;

  return null;
}

async function tryHandleDominoTimeoutAutoMove(sessionId: string, room: GameRoom, currentPlayerId: string): Promise<boolean> {
  if (room.gameType !== 'domino') {
    return false;
  }

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
    const autoMove = selectDominoTimeoutAutoMove(validMoves);
    if (!autoMove) {
      return { outcome: 'failed' as const };
    }

    const validation = engine.validateMove(lockedState, currentPlayerId, autoMove);
    if (!validation.valid) {
      logger.warn(`[WS] Domino timeout auto-move invalid for player ${currentPlayerId} in session ${sessionId}: ${validation.error || 'unknown error'}`);
      return { outcome: 'failed' as const };
    }

    const applyResult = engine.applyMove(lockedState, currentPlayerId, autoMove);
    if (!applyResult.success) {
      logger.warn(`[WS] Domino timeout auto-move apply failed for player ${currentPlayerId} in session ${sessionId}: ${applyResult.error || 'unknown error'}`);
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

  logger.info(`[WS] Domino timeout auto-move applied for player ${currentPlayerId} in session ${sessionId}: ${txResult.autoMove.type}`);

  broadcastToRoom(room, {
    type: 'turn_timeout',
    payload: {
      timedOutPlayer: currentPlayerId,
      autoAction: 'move',
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

      if (room.gameType === 'domino') {
        const handledByAutoMove = await tryHandleDominoTimeoutAutoMove(sessionId, room, currentPlayerId);
        if (handledByAutoMove) {
          return;
        }
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

        const sessionId = ws.sessionId;

        // Notify room about disconnection
        broadcastToRoom(room, {
          type: 'player_disconnected',
          payload: { userId: disconnectedPlayerId, username: ws.username }
        });

        // Voluntary leave = immediate forfeit. Disconnect = grace period for reconnection.
        if (isVoluntaryLeave) {
          // Immediate forfeit for voluntary leave
          if (!forfeitingSessionsLock.has(sessionId)) {
            forfeitingSessionsLock.add(sessionId);
            try {
              const session = await storage.getLiveGameSession(sessionId);

              if (session && session.status === 'in_progress') {
                // FIX: Handle both 2-player and 4-player team games
                const { winner: opponentId, winningTeam } = determineWinnerOnForfeit(session, disconnectedPlayerId);
                const hasForfeitDecision = Boolean(opponentId) || winningTeam !== undefined;
                if (hasForfeitDecision) {
                  logger.info(`[WS] Player ${disconnectedPlayerId} left voluntarily — forfeiting (${opponentId ? `winner=${opponentId}` : `team=${winningTeam}`})`);
                  clearTurnTimer(sessionId);
                  await handleGameOver(room, { isOver: true, winner: opponentId || undefined, winningTeam, reason: 'abandonment' });
                  broadcastToRoom(room, {
                    type: 'player_forfeited',
                    payload: { forfeitedBy: disconnectedPlayerId, winner: opponentId, reason: 'abandonment' }
                  });
                  // Notify adaptive AI that this human abandoned the game
                  const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
                  if (aiConfig?.enabled && aiConfig.humanPlayerIds.includes(disconnectedPlayerId)) {
                    await recordAbandonedGame({ sessionId, gameType: room.gameType, humanPlayerIds: [disconnectedPlayerId] });
                  }
                }
              }
            } catch (error) {
              console.error('[WS] Error handling voluntary leave forfeit:', error);
            } finally {
              setTimeout(() => forfeitingSessionsLock.delete(sessionId), 5000);
            }
          }
        } else {
          // Network disconnect — give grace period before forfeiting
          const disconnectKey = `${sessionId}:${disconnectedPlayerId}`;

          if (!disconnectedPlayers.has(disconnectKey)) {
            // Notify room about grace period
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

              // After grace period, check if player reconnected
              const currentRoom = rooms.get(sessionId);
              if (currentRoom && !currentRoom.players.has(disconnectedPlayerId)) {
                // Player didn't reconnect — forfeit
                if (!forfeitingSessionsLock.has(sessionId)) {
                  forfeitingSessionsLock.add(sessionId);
                  try {
                    const session = await storage.getLiveGameSession(sessionId);

                    if (session && session.status === 'in_progress') {
                      // FIX: Handle both 2-player and 4-player team games
                      const { winner: opponentId, winningTeam } = determineWinnerOnForfeit(session, disconnectedPlayerId);
                      const hasForfeitDecision = Boolean(opponentId) || winningTeam !== undefined;
                      if (hasForfeitDecision) {
                        logger.info(`[WS] Player ${disconnectedPlayerId} did not reconnect within ${RECONNECT_GRACE_MS}ms — forfeiting (${opponentId ? `winner=${opponentId}` : `team=${winningTeam}`})`);
                        clearTurnTimer(sessionId);
                        await handleGameOver(currentRoom, { isOver: true, winner: opponentId || undefined, winningTeam, reason: 'disconnect' });
                        broadcastToRoom(currentRoom, {
                          type: 'player_forfeited',
                          payload: { forfeitedBy: disconnectedPlayerId, winner: opponentId, reason: 'disconnect' }
                        });
                        // Notify adaptive AI that this human abandoned the game
                        const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
                        if (aiConfig?.enabled && aiConfig.humanPlayerIds.includes(disconnectedPlayerId)) {
                          await recordAbandonedGame({ sessionId, gameType: currentRoom.gameType, humanPlayerIds: [disconnectedPlayerId] });
                        }
                      }
                    }
                  } catch (error) {
                    console.error('[WS] Error handling disconnect forfeit after grace:', error);
                  } finally {
                    setTimeout(() => forfeitingSessionsLock.delete(sessionId), 5000);
                  }
                }
              }
            }, RECONNECT_GRACE_MS);

            disconnectedPlayers.set(disconnectKey, { sessionId, userId: disconnectedPlayerId, timer });
          }
        }
      }

      if (room.players.size === 0 && room.spectators.size === 0) {
        // Don't immediately clean up room if there are disconnected players with grace period
        const hasGracePeriodPlayers = Array.from(disconnectedPlayers.keys()).some(k => k.startsWith(ws.sessionId + ':'));
        if (!hasGracePeriodPlayers) {
          clearTurnTimer(ws.sessionId);
          rooms.delete(ws.sessionId);
        }
      }
    }
  }
}
