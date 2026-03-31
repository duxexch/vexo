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
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function sendError(ws: WebSocket, message: string, code?: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'error',
    payload: { message, code },
    // Backward-compatible top-level fields for older clients.
    error: message,
    code,
  }));
}

export function broadcastToRoom(room: GameRoom, message: WebSocketMessage, excludeUserId?: string) {
  // Pre-serialize once instead of per-recipient
  const serialized = JSON.stringify(message);
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

  // Pre-serialize message once
  const serialized = JSON.stringify(message);

  for (const [recipientId, ws] of recipientEntries) {
    const check = checkMap.get(recipientId);
    if (check?.blockedUsers?.includes(senderId)) continue;
    if (check?.mutedUsers?.includes(senderId)) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}
