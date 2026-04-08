import { WebSocket } from "ws";
import { db } from "../db";
import { challenges, gameMatches, liveGameSessions } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import type { AuthenticatedSocket } from "./shared";
import { voiceRooms } from "./shared";

function isNonEmptyId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function toUniqueParticipantIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(isNonEmptyId)));
}

async function resolveVoiceParticipantIds(roomId: string, userId: string): Promise<string[] | null> {
  const [match] = await db
    .select({
      player1Id: gameMatches.player1Id,
      player2Id: gameMatches.player2Id,
    })
    .from(gameMatches)
    .where(eq(gameMatches.id, roomId))
    .limit(1);

  if (match) {
    return toUniqueParticipantIds([match.player1Id, match.player2Id]);
  }

  const [challenge] = await db
    .select({
      player1Id: challenges.player1Id,
      player2Id: challenges.player2Id,
      player3Id: challenges.player3Id,
      player4Id: challenges.player4Id,
    })
    .from(challenges)
    .where(eq(challenges.id, roomId))
    .limit(1);

  if (!challenge) {
    return null;
  }

  let participantIds = toUniqueParticipantIds([
    challenge.player1Id,
    challenge.player2Id,
    challenge.player3Id,
    challenge.player4Id,
  ]);

  // Challenge seating can lag in the challenge row during reconnect windows.
  if (!participantIds.includes(userId)) {
    const [liveSession] = await db
      .select({
        player1Id: liveGameSessions.player1Id,
        player2Id: liveGameSessions.player2Id,
        player3Id: liveGameSessions.player3Id,
        player4Id: liveGameSessions.player4Id,
      })
      .from(liveGameSessions)
      .where(eq(liveGameSessions.challengeId, roomId))
      .orderBy(desc(liveGameSessions.createdAt))
      .limit(1);

    if (liveSession) {
      participantIds = toUniqueParticipantIds([
        liveSession.player1Id,
        liveSession.player2Id,
        liveSession.player3Id,
        liveSession.player4Id,
      ]);
    }
  }

  return participantIds;
}

/**
 * Handle voice chat/WebRTC signaling message types:
 * voice_join, voice_offer, voice_answer, voice_ice_candidate, voice_leave
 */
export async function handleVoice(ws: AuthenticatedSocket, data: any): Promise<void> {
  // Voice join — verify user is participant in match, set up room
  if (data.type === "voice_join" && ws.userId) {
    const { matchId } = data;

    if (typeof matchId !== "string" || matchId.length === 0) {
      ws.send(JSON.stringify({ type: "voice_error", error: "Invalid room identifier" }));
      return;
    }

    const participantIds = await resolveVoiceParticipantIds(matchId, ws.userId);
    if (!participantIds || !participantIds.includes(ws.userId)) {
      ws.send(JSON.stringify({ type: "voice_error", error: "Not authorized for this match" }));
      return;
    }

    // Current signaling client is single-peer; keep voice limited to head-to-head rooms.
    if (participantIds.length !== 2) {
      ws.send(JSON.stringify({ type: "voice_error", error: "Voice chat is currently available for 2-player games only" }));
      return;
    }

    // Add to voice room
    if (!voiceRooms.has(matchId)) {
      voiceRooms.set(matchId, new Map());
    }
    voiceRooms.get(matchId)!.set(ws.userId, ws);

    // Notify other participant that peer joined
    for (const participantId of participantIds) {
      if (participantId === ws.userId) continue;
      const participantSocket = voiceRooms.get(matchId)?.get(participantId);
      if (participantSocket && participantSocket.readyState === WebSocket.OPEN) {
        participantSocket.send(JSON.stringify({ type: "voice_peer_joined", matchId }));
      }
    }

    ws.send(JSON.stringify({ type: "voice_joined", matchId }));
  }

  // Voice offer — forward WebRTC offer to other peers
  if (data.type === "voice_offer" && ws.userId) {
    const { matchId, offer } = data;

    // Verify sender is in the voice room before forwarding
    const room = voiceRooms.get(matchId);
    if (room && room.has(ws.userId)) {
      room.forEach((socket, oderId) => {
        if (oderId !== ws.userId && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "voice_offer", matchId, offer }));
        }
      });
    } else {
      ws.send(JSON.stringify({ type: "voice_error", error: "Not in voice room" }));
    }
  }

  // Voice answer — forward WebRTC answer to other peers
  if (data.type === "voice_answer" && ws.userId) {
    const { matchId, answer } = data;

    // Verify sender is in the voice room before forwarding
    const room = voiceRooms.get(matchId);
    if (room && room.has(ws.userId)) {
      room.forEach((socket, oderId) => {
        if (oderId !== ws.userId && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "voice_answer", matchId, answer }));
        }
      });
    } else {
      ws.send(JSON.stringify({ type: "voice_error", error: "Not in voice room" }));
    }
  }

  // ICE candidate — forward to other peers
  if (data.type === "voice_ice_candidate" && ws.userId) {
    const { matchId, candidate } = data;

    // Verify sender is in the voice room before forwarding
    const room = voiceRooms.get(matchId);
    if (room && room.has(ws.userId)) {
      room.forEach((socket, oderId) => {
        if (oderId !== ws.userId && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "voice_ice_candidate", matchId, candidate }));
        }
      });
    }
  }

  // Voice leave — remove from room, notify peers
  if (data.type === "voice_leave" && ws.userId) {
    const { matchId } = data;

    const room = voiceRooms.get(matchId);
    if (room) {
      room.delete(ws.userId);
      // Notify peer that user left
      room.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "voice_peer_left", matchId }));
        }
      });
      // Clean up empty room
      if (room.size === 0) {
        voiceRooms.delete(matchId);
      }
    }
  }
}
