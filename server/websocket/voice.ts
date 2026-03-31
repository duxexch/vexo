import { WebSocket } from "ws";
import { db } from "../db";
import { gameMatches } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { AuthenticatedSocket } from "./shared";
import { voiceRooms } from "./shared";

/**
 * Handle voice chat/WebRTC signaling message types:
 * voice_join, voice_offer, voice_answer, voice_ice_candidate, voice_leave
 */
export async function handleVoice(ws: AuthenticatedSocket, data: any): Promise<void> {
  // Voice join — verify user is participant in match, set up room
  if (data.type === "voice_join" && ws.userId) {
    const { matchId } = data;

    // Verify user is participant in this match
    const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
    if (!match || (match.player1Id !== ws.userId && match.player2Id !== ws.userId)) {
      ws.send(JSON.stringify({ type: "voice_error", error: "Not authorized for this match" }));
      return;
    }

    // Add to voice room
    if (!voiceRooms.has(matchId)) {
      voiceRooms.set(matchId, new Map());
    }
    voiceRooms.get(matchId)!.set(ws.userId, ws);

    // Notify other participant that peer joined
    const otherPlayerId = match.player1Id === ws.userId ? match.player2Id : match.player1Id;
    const otherPlayerRoom = voiceRooms.get(matchId)?.get(otherPlayerId);
    if (otherPlayerRoom && otherPlayerRoom.readyState === WebSocket.OPEN) {
      otherPlayerRoom.send(JSON.stringify({ type: "voice_peer_joined", matchId }));
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
