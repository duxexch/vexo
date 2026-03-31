import { storage } from '../storage';
import { logger } from '../lib/logger';
import type { AuthenticatedWebSocket } from './types';
import { rooms, userConnections, disconnectedPlayers, RECONNECT_GRACE_MS, TURN_TIMEOUT_MS, turnTimers, forfeitingSessionsLock } from './types';
import { broadcastToRoom, determineWinnerOnForfeit } from './utils';
import { handleGameOver } from './game-over';
import { getAdaptiveAiSessionConfig, recordAbandonedGame } from '../lib/adaptive-ai';

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
