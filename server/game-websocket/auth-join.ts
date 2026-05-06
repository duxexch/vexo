import { WebSocket } from 'ws';
import { storage } from '../storage';
import { db } from '../db';
import { challenges } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getGameEngine } from '../game-engines';
import { logger } from '../lib/logger';
import {
  getAdaptiveAiSessionConfig,
  isAdaptiveAiPlayer,
  resolveCurrentPlayerFromState,
} from '../lib/adaptive-ai';
import { AuthVerificationError, verifyUserAccessToken } from '../lib/auth-verification';
import type { AuthenticatedWebSocket } from './types';
import { rooms, userConnections, disconnectedPlayers, TURN_TIMEOUT_MS, turnTimers } from './types';
import { send, sendError, broadcastToRoom, getPlayerList } from './utils';
import { processAdaptiveAiTurns } from './ai-turns';
import { startTurnTimer } from './timers-disconnect';
import { wsReconnectTotal } from '../lib/prometheus-metrics';
import { restoreGameStateFromSnapshotsIfMissingInDb } from '../lib/game-session-snapshots';

export async function handleAuthenticate(ws: AuthenticatedWebSocket, payload: { token: string }) {
  try {
    if (!payload.token || typeof payload.token !== 'string') {
      sendError(ws, 'Missing token');
      return;
    }

    const verified = await verifyUserAccessToken(payload.token, {
      userAgent: ws.userAgent,
      requireActiveSession: true,
      updateSessionActivity: true,
    });

    // Block users who have not chosen a permanent username yet — same gate
    // as the REST API. Admins are exempt (matches authMiddleware behavior).
    if (verified.usernameSelected === false && verified.role !== 'admin') {
      sendError(ws, 'USERNAME_SELECTION_REQUIRED');
      return;
    }

    ws.userId = verified.id;
    ws.username = verified.username;
    ws.role = verified.role;
    ws.tokenFingerprint = verified.tokenFingerprint;

    // Close previous connection from same user (multi-tab support)
    const existing = userConnections.get(verified.id);
    if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
      send(existing, { type: 'session_replaced', payload: { reason: 'Opened in another tab' } });
      existing.close(4001, 'Replaced by new connection');
    }

    userConnections.set(verified.id, ws);

    send(ws, {
      type: 'authenticated',
      payload: { userId: verified.id, username: verified.username }
    });
  } catch (error) {
    if (error instanceof AuthVerificationError) {
      sendError(ws, error.message);
      return;
    }

    sendError(ws, 'Authentication failed');
  }
}

export async function handleJoinGame(ws: AuthenticatedWebSocket, payload: { sessionId: string }) {
  if (!ws.userId) {
    sendError(ws, 'Not authenticated');
    return;
  }

  const { sessionId } = payload;

  try {
    const session = await storage.getLiveGameSession(sessionId);
    if (!session) {
      sendError(ws, 'Game session not found');
      return;
    }

    // Crash recovery: if live_game_sessions.game_state is missing,
    // restore it from the latest game_session_snapshots row.
    const restored = await restoreGameStateFromSnapshotsIfMissingInDb({
      sessionId,
      currentTurnNumber: session.turnNumber ?? 0,
      existingGameState: session.gameState ?? null,
    });

    const effectiveGameState = restored ?? session.gameState ?? getGameEngine(session.gameType)?.createInitialState() ?? '{}';

    const isPlayer = [session.player1Id, session.player2Id, session.player3Id, session.player4Id].includes(ws.userId);

    if (!isPlayer) {
      sendError(ws, 'You are not a player in this game');
      return;
    }

    let room = rooms.get(sessionId);
    if (!room) {
      const turnTimeLimitMs = TURN_TIMEOUT_MS;
      room = {
        sessionId,
        players: new Map(),
        spectators: new Map(),
        gameType: session.gameType,
        gameState: effectiveGameState,
        turnTimeLimitMs,
      };
      rooms.set(sessionId, room);
    } else {
      // If room already exists, keep it in sync with recovered DB state.
      if (effectiveGameState) room.gameState = effectiveGameState;
      if (!room.turnTimeLimitMs) room.turnTimeLimitMs = TURN_TIMEOUT_MS;
    }

    room.players.set(ws.userId, ws);
    ws.sessionId = sessionId;
    ws.challengeId = session.challengeId || undefined;
    ws.isSpectator = false;

    // Check if this player is reconnecting — cancel forfeit timer
    const disconnectKey = `${sessionId}:${ws.userId}`;
    const pendingDisconnect = disconnectedPlayers.get(disconnectKey);
    if (pendingDisconnect) {
      wsReconnectTotal.inc();
      clearTimeout(pendingDisconnect.timer);
      disconnectedPlayers.delete(disconnectKey);
      logger.info(`[WS] Player ${ws.userId} reconnected to session ${sessionId} — forfeit cancelled`);

      // Notify room of reconnection
      broadcastToRoom(room, {
        type: 'player_reconnected',
        payload: { userId: ws.userId, username: ws.username }
      }, ws.userId);
    }

    const engine = getGameEngine(session.gameType);
    const playerView = engine?.getPlayerView(room.gameState, ws.userId);

    const playerIds = [session.player1Id, session.player2Id, session.player3Id, session.player4Id];
    const seatIndex = playerIds.indexOf(ws.userId);
    const playerSeat = seatIndex !== -1 ? seatIndex + 1 : null;
    const playerColor = session.gameType === 'chess'
      ? (playerSeat === 1 ? 'w' : (playerSeat === 2 ? 'b' : null))
      : null;

    let opponent = null;
    const opponentIds = playerIds.filter((id) => id && id !== ws.userId);
    if (opponentIds.length > 0) {
      const opponentUser = await storage.getUser(opponentIds[0]!);
      if (opponentUser) {
        opponent = { id: opponentIds[0], username: opponentUser.username };
      }
    }

    send(ws, {
      type: 'game_joined',
      payload: {
        sessionId,
        gameType: session.gameType,
        view: playerView,
        playerColor,
        playerSeat,
        isSpectator: false,
        opponent,
        players: getPlayerList(room),
        spectatorCount: room.spectators.size,
        status: session.status,
        turnNumber: session.turnNumber
      }
    });

    broadcastToRoom(room, {
      type: 'player_joined',
      payload: { userId: ws.userId, username: ws.username }
    }, ws.userId);

    const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
    const currentPlayer = resolveCurrentPlayerFromState(session.gameType, room.gameState, {
      player1Id: session.player1Id,
      player2Id: session.player2Id,
      player3Id: session.player3Id,
      player4Id: session.player4Id,
    });

    if (isAdaptiveAiPlayer(aiConfig, currentPlayer)) {
      setTimeout(() => {
        processAdaptiveAiTurns(sessionId, room).catch((error) => {
          logger.error('[AdaptiveAI] Failed to process AI turns on join', error as Error);
        });
      }, 80);
    } else if (session.status === 'in_progress' && currentPlayer && !turnTimers.has(sessionId)) {
      startTurnTimer(sessionId, currentPlayer, room.turnTimeLimitMs);
    }

  } catch (error) {
    console.error('Error joining game:', error);
    sendError(ws, 'Failed to join game');
  }
}

export async function handleSpectate(ws: AuthenticatedWebSocket, payload: { sessionId: string }) {
  const { sessionId } = payload;

  try {
    const session = await storage.getLiveGameSession(sessionId);
    if (!session) {
      sendError(ws, 'Game session not found');
      return;
    }

    const viewerUserId = ws.userId ?? null;

    const isPlayer = Boolean(viewerUserId) && [
      session.player1Id,
      session.player2Id,
      session.player3Id,
      session.player4Id,
    ].includes(viewerUserId);

    if (isPlayer) {
      sendError(ws, 'Players must join as players');
      return;
    }

    let challengeConfig = await storage.getChallengeSettings(session.gameType);

    if (session.challengeId) {
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, session.challengeId)).limit(1);
      if (!challenge) {
        sendError(ws, 'Challenge not found');
        return;
      }

      const participantIds = [
        challenge.player1Id,
        challenge.player2Id,
        challenge.player3Id,
        challenge.player4Id,
      ].filter(Boolean) as string[];

      const isParticipant = Boolean(ws.userId) && participantIds.includes(ws.userId!);
      const isInvitedFriend = Boolean(ws.userId) && challenge.friendAccountId === ws.userId;

      if (challenge.visibility === 'private' && !isParticipant && !isInvitedFriend) {
        sendError(ws, 'Not authorized to spectate this private challenge');
        return;
      }

      challengeConfig = await storage.getChallengeSettings(challenge.gameType || session.gameType);
    }

    if (!challengeConfig.allowSpectators) {
      sendError(ws, 'Spectators are not allowed for this game');
      return;
    }

    let room = rooms.get(sessionId);
    if (!room) {
      room = {
        sessionId,
        players: new Map(),
        spectators: new Map(),
        gameType: session.gameType,
        gameState: session.gameState || '{}'
      };
      rooms.set(sessionId, room);
    }

    if (room.spectators.size >= challengeConfig.maxSpectators) {
      sendError(ws, 'Spectator limit reached for this game');
      return;
    }
    // SECURITY: Use crypto-random IDs to prevent collisions
    const crypto = await import('crypto');
    const spectatorId = ws.userId || `anon_${crypto.randomBytes(8).toString('hex')}`;
    room.spectators.set(spectatorId, ws);
    ws.sessionId = sessionId;
    ws.challengeId = session.challengeId || undefined;
    ws.isSpectator = true;
    ws.spectatorId = spectatorId;

    if (ws.userId) {
      await storage.addGameSpectator({
        sessionId,
        userId: ws.userId
      });
    }

    const engine = getGameEngine(session.gameType);
    const spectatorView = engine?.getPlayerView(room.gameState, 'spectator');

    send(ws, {
      type: 'spectating',
      payload: {
        sessionId,
        gameType: session.gameType,
        view: spectatorView,
        playerSeat: null,
        isSpectator: true,
        players: getPlayerList(room),
        spectatorCount: room.spectators.size,
        status: session.status
      }
    });

    broadcastToRoom(room, {
      type: 'spectator_joined',
      payload: { spectatorCount: room.spectators.size }
    });

  } catch (error) {
    console.error('Error spectating game:', error);
    sendError(ws, 'Failed to spectate game');
  }
}
