import { WebSocket } from 'ws';
import { storage } from '../storage';
import { getCachedUserBlockLists } from '../lib/redis';
import type { AuthenticatedWebSocket, GameRoom } from './types';
import type { WebSocketMessage } from '../game-engines/types';

/**
 * Determine winner when a player forfeits (resign/timeout/disconnect).
 * Handles both 2-player and 4-player team games.
 * Team structure: Team 1 = player1 + player3, Team 2 = player2 + player4
 */
export function determineWinnerOnForfeit(
  session: { player1Id: string | null; player2Id: string | null; player3Id?: string | null; player4Id?: string | null },
  forfeitedPlayerId: string
): { winner: string | null; winningTeam?: number } {
  const participants = [session.player1Id, session.player2Id, session.player3Id, session.player4Id]
    .filter(Boolean) as string[];

  if (!participants.includes(forfeitedPlayerId)) {
    return { winner: null };
  }

  const team0 = [session.player1Id, session.player3Id].filter(Boolean) as string[];
  const team1 = [session.player2Id, session.player4Id].filter(Boolean) as string[];
  const isTeamGame = team0.length > 0 && team1.length > 0 && participants.length > 2;

  if (!isTeamGame) {
    // 2-player game (or incomplete teams): the non-forfeiting participant wins.
    const winner = participants.find((playerId) => playerId !== forfeitedPlayerId) || null;
    return { winner };
  }

  // Team game: team0 = player1 + player3, team1 = player2 + player4 (matches tarneeb/baloot convention).
  const forfeitedTeam = team0.includes(forfeitedPlayerId) ? 0 : (team1.includes(forfeitedPlayerId) ? 1 : null);
  if (forfeitedTeam === null) {
    const winner = participants.find((playerId) => playerId !== forfeitedPlayerId) || null;
    return { winner };
  }

  const winningTeam = forfeitedTeam === 0 ? 1 : 0;
  const winners = winningTeam === 0 ? team0 : team1;
  const winner = winners.find((playerId) => playerId !== forfeitedPlayerId)
    || participants.find((playerId) => playerId !== forfeitedPlayerId)
    || null;

  return { winner, winningTeam };
}

export function getPlayerList(room: GameRoom): { id: string; username?: string }[] {
  return Array.from(room.players.entries()).map(([id, ws]) => ({
    id,
    username: ws.username
  }));
}

export function send(ws: WebSocket, message: WebSocketMessage) {
  if (ws.readyState !== WebSocket.OPEN) return;

  const authenticated = ws as AuthenticatedWebSocket | undefined;
  const correlationId = authenticated?.correlationId;
  const sessionId = authenticated?.sessionId;

  // Best-effort correlation/session propagation for all outgoing
  // accepted/rejected messages.
  const payload = (message as { payload?: unknown }).payload;

  let enriched: WebSocketMessage = message;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const payloadObj = payload as Record<string, unknown>;

    // Server-controlled: always overwrite any client-injected values.
    if (typeof correlationId === 'string') {
      payloadObj.correlationId = correlationId;
    }
    if (typeof sessionId === 'string') {
      payloadObj.sessionId = sessionId;
    }

    enriched = { ...message, payload: payloadObj };
  }

  ws.send(JSON.stringify(enriched));
}

export function sendError(
  ws: WebSocket,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
) {
  if (ws.readyState !== WebSocket.OPEN) return;

  const authenticated = ws as AuthenticatedWebSocket | undefined;
  const correlationId = authenticated?.correlationId;
  const sessionId = authenticated?.sessionId;

  const errorKey = typeof code === 'string' && code.trim().length > 0 ? code : 'unknown';

  ws.send(JSON.stringify({
    type: 'error',
    payload: {
      status: 'rejected',
      errorKey,
      code: code ?? 'error',
      reason: message,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      correlationId: typeof correlationId === 'string' ? correlationId : undefined,
      ...(details ?? {}),
    },
    // Backward-compatible top-level fields for older clients.
    error: message,
    code,
  }));
}

function tryEnrichBroadcastPayloadWithIds(
  room: GameRoom,
  message: WebSocketMessage,
): WebSocketMessage {
  const payload = (message as { payload?: unknown }).payload;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return message;
  }

  const payloadObj = payload as Record<string, unknown>;

  // Server-controlled: always overwrite any client-injected values.
  if (typeof room.operationCorrelationId === 'string') {
    payloadObj.correlationId = room.operationCorrelationId;
  }
  if (typeof room.operationAttemptId === 'string') {
    payloadObj.attemptId = room.operationAttemptId;
  }

  // Always stamp sessionId for forensic correlation, even if the handler
  // doesn't explicitly include it.
  payloadObj.sessionId = room.sessionId;

  return { ...message, payload: payloadObj };
}

export function broadcastToRoom(room: GameRoom, message: WebSocketMessage, excludeUserId?: string) {
  const enriched = tryEnrichBroadcastPayloadWithIds(room, message);
  const serialized = JSON.stringify(enriched);

  for (const [userId, ws] of room.players) {
    if (userId !== excludeUserId && ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
  for (const [userId, ws] of room.spectators) {
    if (userId !== excludeUserId && ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

export async function broadcastToRoomFiltered(
  room: GameRoom,
  message: WebSocketMessage,
  senderId: string,
  senderBlockedUsers: string[]
) {
  // Collect all recipients excluding sender and sender-blocked users
  const recipientEntries: Array<[string, WebSocket]> = [];
  for (const [userId, ws] of room.players) {
    if (userId !== senderId && !senderBlockedUsers.includes(userId)) {
      recipientEntries.push([userId, ws]);
    }
  }
  for (const [userId, ws] of room.spectators) {
    if (userId !== senderId && !senderBlockedUsers.includes(userId)) {
      recipientEntries.push([userId, ws]);
    }
  }

  if (recipientEntries.length === 0) return;

  // Use cached block/mute lists instead of DB queries per recipient
  const recipientChecks = await Promise.all(
    recipientEntries.map(async ([recipientId]) => {
      const { blockedUsers, mutedUsers } = await getCachedUserBlockLists(recipientId, async (id) => {
        const user = await storage.getUser(id);
        return user ? { blockedUsers: user.blockedUsers || [], mutedUsers: user.mutedUsers || [] } : null;
      });
      return { recipientId, blockedUsers, mutedUsers };
    })
  );

  const checkMap = new Map(recipientChecks.map(c => [c.recipientId, c]));

  // Pre-serialize message once (with forensic correlation/session ids)
  const enriched = tryEnrichBroadcastPayloadWithIds(room, message);
  const serialized = JSON.stringify(enriched);

  for (const [recipientId, ws] of recipientEntries) {
    const check = checkMap.get(recipientId);
    if (check?.blockedUsers?.includes(senderId)) continue;
    if (check?.mutedUsers?.includes(senderId)) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}
