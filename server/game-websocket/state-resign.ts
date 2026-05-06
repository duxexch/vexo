import { storage } from '../storage';
import { getGameEngine } from '../game-engines';
import { logger } from '../lib/logger';
import type { AuthenticatedWebSocket } from './types';
import { rooms } from './types';
import { send, sendError, broadcastToRoom, getPlayerList, determineWinnerOnForfeit } from './utils';
import { handleGameOver } from './game-over';
import { restoreGameStateFromSnapshotsIfMissingInDb } from '../lib/game-session-snapshots';

export async function handleGetState(ws: AuthenticatedWebSocket, payload: { sessionId: string }) {
  try {
    // SECURITY: Verify the requesting WebSocket belongs to this session
    // If ws.sessionId is not set, verify they are a known player/spectator in the room
    if (ws.sessionId && ws.sessionId !== payload.sessionId) {
      sendError(ws, 'Session mismatch', 'SESSION_MISMATCH');
      return;
    }

    const session = await storage.getLiveGameSession(payload.sessionId);
    if (!session) {
      sendError(ws, 'Game not found', 'SESSION_NOT_FOUND');
      return;
    }

    // Crash recovery: restore gameState from snapshots if missing.
    const effectiveGameState = await restoreGameStateFromSnapshotsIfMissingInDb({
      sessionId: payload.sessionId,
      currentTurnNumber: session.turnNumber ?? 0,
      existingGameState: session.gameState ?? null,
    });

    const normalizedGameState =
      effectiveGameState ?? session.gameState ?? getGameEngine(session.gameType)?.createInitialState() ?? '{}';

    // SECURITY: If user hasn't joined this session, verify they are authorized
    if (!ws.sessionId) {
      const room = rooms.get(payload.sessionId);
      const isPlayer = ws.userId && (session.player1Id === ws.userId || session.player2Id === ws.userId ||
        (session as any).player3Id === ws.userId || (session as any).player4Id === ws.userId);
      const isSpectator = room?.spectators.has(ws.userId || ws.spectatorId || '');
      if (!isPlayer && !isSpectator) {
        sendError(ws, 'Not authorized for this session', 'UNAUTHORIZED');
        return;
      }
    }

    let room = rooms.get(payload.sessionId);

    if (room) {
      room.gameState = normalizedGameState;
    } else {
      room = {
        sessionId: payload.sessionId,
        players: new Map(),
        spectators: new Map(),
        gameType: session.gameType,
        gameState: normalizedGameState,
      };
      rooms.set(payload.sessionId, room);
    }

    const engine = getGameEngine(room.gameType);
    const playerView = engine?.getPlayerView(room.gameState, ws.userId || 'spectator');

    let opponent = null;
    let playerSeat: number | null = null;
    let playerColor: 'w' | 'b' | null = null;

    if (ws.userId) {
      const playerIds = [session.player1Id, session.player2Id, session.player3Id, session.player4Id];
      playerSeat = playerIds.indexOf(ws.userId);

      if (playerSeat === -1) {
        playerSeat = null;
      } else {
        playerSeat = playerSeat + 1;

        if (room.gameType === 'chess') {
          playerColor = playerSeat === 1 ? 'w' : 'b';
        }

        const opponentIds = playerIds.filter((id, idx) => id && id !== ws.userId);
        if (opponentIds.length > 0) {
          const opponentUser = await storage.getUser(opponentIds[0]!);
          if (opponentUser) {
            opponent = { id: opponentIds[0], username: opponentUser.username };
          }
        }
      }
    }

    const chatMessages = await storage.getGameChatMessages(payload.sessionId);

    logger.info(`[WS] State sync for session ${payload.sessionId}, player ${ws.userId}`);

    send(ws, {
      type: 'state_sync',
      payload: {
        sessionId: payload.sessionId,
        gameType: room.gameType,
        view: playerView,
        playerColor,
        playerSeat,
        isSpectator: playerSeat === null,
        opponent,
        players: getPlayerList(room),
        spectatorCount: room.spectators.size,
        chatMessages: chatMessages?.slice(-50) || [],
        status: session.status,
        turnNumber: session.turnNumber
      }
    });
  } catch (error) {
    console.error('[WS] Error getting state:', error);
    sendError(ws, 'Failed to get game state');
  }
}

export async function handleResign(ws: AuthenticatedWebSocket, payload: { sessionId: string }) {
  if (!ws.userId || !ws.sessionId) {
    sendError(ws, 'Not in a game');
    return;
  }

  const room = rooms.get(ws.sessionId);
  if (!room) {
    sendError(ws, 'Game room not found', 'SESSION_NOT_FOUND');
    return;
  }

  if (!room.players.has(ws.userId)) {
    sendError(ws, 'Spectators cannot resign', 'FORBIDDEN_SPECTATOR_ACTION');
    return;
  }

  const session = await storage.getLiveGameSession(ws.sessionId);
  if (!session) return;

  // FIX: Check if game is already completed to prevent double handleGameOver
  if (session.status === 'completed') {
    sendError(ws, 'Game is already finished');
    return;
  }

  // SECURITY: Check if surrender is allowed for this game type
  const challengeConfig = await storage.getChallengeSettings(room.gameType);
  if (!challengeConfig.allowSurrender) {
    sendError(ws, 'Surrender is not allowed for this game type');
    return;
  }

  // SECURITY: Enforce minimum moves before surrender to prevent money laundering
  // (Player A creates challenge, Player B joins and immediately resigns to transfer money)
  const minMoves = challengeConfig.minMovesBeforeSurrender;
  const currentTurnNumber = session.turnNumber || 0;
  if (currentTurnNumber < minMoves) {
    sendError(ws, `You must play at least ${minMoves} moves before surrendering`);
    send(ws, {
      type: 'resign_blocked',
      payload: {
        reason: 'min_moves',
        currentMoves: currentTurnNumber,
        requiredMoves: minMoves
      }
    });
    return;
  }

  // FIX: Handle both 2-player and 4-player team games
  const { winner, winningTeam } = determineWinnerOnForfeit(session, ws.userId);

  await handleGameOver(room, {
    isOver: true,
    winner: winner || undefined,
    winningTeam,
    reason: 'resignation'
  });
}

export async function handleOfferDraw(ws: AuthenticatedWebSocket, payload: { sessionId: string }) {
  if (!ws.sessionId) return;

  const room = rooms.get(ws.sessionId);
  if (!room) return;

  // SECURITY: Only actual players can offer draw, not spectators
  if (!room.players.has(ws.userId!)) {
    sendError(ws, 'Spectators cannot offer draw', 'FORBIDDEN_SPECTATOR_ACTION');
    return;
  }

  // SECURITY: Check if draw is allowed for this game type
  const challengeConfig = await storage.getChallengeSettings(room.gameType);
  if (!challengeConfig.allowDraw) {
    sendError(ws, 'Draw is not allowed for this game type');
    return;
  }

  // FIX: Prevent draw offer spam — track pending offers per room
  const roomKey = `draw_pending:${ws.sessionId}`;
  if ((room as any)._drawOfferedBy === ws.userId) {
    sendError(ws, 'Draw offer already pending');
    return;
  }
  (room as any)._drawOfferedBy = ws.userId;

  for (const [playerId, playerWs] of room.players) {
    if (playerId !== ws.userId) {
      send(playerWs, {
        type: 'draw_offered',
        payload: { offeredBy: ws.userId, offeredByUsername: ws.username }
      });
    }
  }
}

export async function handleRespondDraw(ws: AuthenticatedWebSocket, payload: { accept: boolean }) {
  if (!ws.sessionId) return;

  const room = rooms.get(ws.sessionId);
  if (!room) return;

  // SECURITY: Only actual players can respond to draw, not spectators
  if (!room.players.has(ws.userId!)) {
    sendError(ws, 'Spectators cannot respond to draw', 'FORBIDDEN_SPECTATOR_ACTION');
    return;
  }

  // FIX: Clear draw offer tracking on response
  delete (room as any)._drawOfferedBy;

  if (payload.accept) {
    await handleGameOver(room, {
      isOver: true,
      isDraw: true,
      reason: 'agreement'
    });
  } else {
    broadcastToRoom(room, {
      type: 'draw_declined',
      payload: { declinedBy: ws.userId }
    });
  }
}
