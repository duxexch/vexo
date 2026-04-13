import { WebSocket } from "ws";
import { db } from "../db";
import { challenges, gameMatches, liveGameSessions } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { redisRateLimit } from "../lib/redis";
import type { AuthenticatedSocket } from "./shared";
import { voiceRooms } from "./shared";

const MAX_SDP_LENGTH = 25_000;
const MAX_ICE_CANDIDATE_LENGTH = 2_048;
const VOICE_TELEMETRY_FLUSH_INTERVAL_MS = 60_000;

interface VoiceTelemetryCounters {
  joinRequests: number;
  joinAccepted: number;
  offerForwarded: number;
  answerForwarded: number;
  iceForwarded: number;
  leaveProcessed: number;
  rejectedRateLimit: number;
  rejectedInvalidPayload: number;
  rejectedUnauthorized: number;
  rejectedNotInRoom: number;
  rejectedOther: number;
}

export interface VoiceTelemetrySnapshot {
  generatedAt: string;
  windowStartedAt: string;
  windowDurationMs: number;
  activeRooms: number;
  counters: VoiceTelemetryCounters;
  totals: {
    rejected: number;
    forwarded: number;
  };
  rates: {
    joinAcceptanceRate: number;
  };
}

const voiceTelemetryCounters: VoiceTelemetryCounters = {
  joinRequests: 0,
  joinAccepted: 0,
  offerForwarded: 0,
  answerForwarded: 0,
  iceForwarded: 0,
  leaveProcessed: 0,
  rejectedRateLimit: 0,
  rejectedInvalidPayload: 0,
  rejectedUnauthorized: 0,
  rejectedNotInRoom: 0,
  rejectedOther: 0,
};

let voiceTelemetryLastFlushAt = Date.now();

function getVoiceTelemetryBaseSnapshot(nowMs: number): VoiceTelemetrySnapshot {
  const counters: VoiceTelemetryCounters = { ...voiceTelemetryCounters };
  const rejected = counters.rejectedRateLimit
    + counters.rejectedInvalidPayload
    + counters.rejectedUnauthorized
    + counters.rejectedNotInRoom
    + counters.rejectedOther;
  const forwarded = counters.offerForwarded + counters.answerForwarded + counters.iceForwarded;
  const joinAcceptanceRate = counters.joinRequests > 0
    ? Number((counters.joinAccepted / counters.joinRequests).toFixed(4))
    : 1;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    windowStartedAt: new Date(voiceTelemetryLastFlushAt).toISOString(),
    windowDurationMs: nowMs - voiceTelemetryLastFlushAt,
    activeRooms: voiceRooms.size,
    counters,
    totals: {
      rejected,
      forwarded,
    },
    rates: {
      joinAcceptanceRate,
    },
  };
}

function incrementVoiceTelemetryCounter(counter: keyof VoiceTelemetryCounters, amount: number = 1): void {
  voiceTelemetryCounters[counter] += amount;
}

function classifyVoiceError(errorMessage: string): keyof VoiceTelemetryCounters {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("rate limit")) return "rejectedRateLimit";
  if (normalized.includes("invalid")) return "rejectedInvalidPayload";
  if (normalized.includes("not authorized")) return "rejectedUnauthorized";
  if (normalized.includes("not in voice room")) return "rejectedNotInRoom";
  return "rejectedOther";
}

function flushVoiceTelemetryIfDue(): void {
  const now = Date.now();
  if (now - voiceTelemetryLastFlushAt < VOICE_TELEMETRY_FLUSH_INTERVAL_MS) {
    return;
  }

  const snapshot = getVoiceTelemetryBaseSnapshot(now);
  const shouldLog = snapshot.totals.rejected > 0
    || snapshot.counters.joinRequests > 0
    || snapshot.totals.forwarded > 0
    || snapshot.counters.leaveProcessed > 0;

  if (shouldLog) {
    logger.info("[VoiceWS] telemetry summary", {
      windowMs: snapshot.windowDurationMs,
      activeRooms: snapshot.activeRooms,
      ...snapshot.counters,
      ...snapshot.totals,
      ...snapshot.rates,
    });

    if (snapshot.counters.rejectedRateLimit >= 10 || snapshot.counters.rejectedInvalidPayload >= 10) {
      logger.warn("[VoiceWS] telemetry alert", {
        reason: "high_voice_signaling_rejections",
        windowMs: snapshot.windowDurationMs,
        rejectedRateLimit: snapshot.counters.rejectedRateLimit,
        rejectedInvalidPayload: snapshot.counters.rejectedInvalidPayload,
      });
    }
  }

  voiceTelemetryLastFlushAt = now;
  Object.keys(voiceTelemetryCounters).forEach((key) => {
    voiceTelemetryCounters[key as keyof VoiceTelemetryCounters] = 0;
  });
}

export function getVoiceTelemetrySnapshot(): VoiceTelemetrySnapshot {
  flushVoiceTelemetryIfDue();
  return getVoiceTelemetryBaseSnapshot(Date.now());
}

export function resetVoiceTelemetryCounters(): void {
  Object.keys(voiceTelemetryCounters).forEach((key) => {
    voiceTelemetryCounters[key as keyof VoiceTelemetryCounters] = 0;
  });
  voiceTelemetryLastFlushAt = Date.now();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMatchId(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }
  return value.trim();
}

function validateSessionDescription(value: unknown, expectedType: "offer" | "answer"): RTCSessionDescriptionInit | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<RTCSessionDescriptionInit>;
  const type = candidate.type;
  const sdp = candidate.sdp;

  if (type !== expectedType || !isNonEmptyString(sdp) || sdp.length > MAX_SDP_LENGTH) {
    return null;
  }

  return { type, sdp };
}

function validateIceCandidate(value: unknown): RTCIceCandidateInit | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<RTCIceCandidateInit>;
  if (!isNonEmptyString(candidate.candidate) || candidate.candidate.length > MAX_ICE_CANDIDATE_LENGTH) {
    return null;
  }

  if (candidate.sdpMid !== undefined && typeof candidate.sdpMid !== "string") {
    return null;
  }

  if (
    candidate.sdpMLineIndex !== undefined
    && (typeof candidate.sdpMLineIndex !== "number" || !Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0)
  ) {
    return null;
  }

  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

function isNonEmptyId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function toUniqueParticipantIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(isNonEmptyId)));
}

type VoiceAccessResolution = {
  participantIds: string[];
  userRole: "player" | "spectator";
};

async function resolveVoiceAccess(roomId: string, userId: string): Promise<VoiceAccessResolution | null> {
  const [match] = await db
    .select({
      player1Id: gameMatches.player1Id,
      player2Id: gameMatches.player2Id,
    })
    .from(gameMatches)
    .where(eq(gameMatches.id, roomId))
    .limit(1);

  if (match) {
    const participantIds = toUniqueParticipantIds([match.player1Id, match.player2Id]);
    if (!participantIds.includes(userId)) {
      return null;
    }
    return {
      participantIds,
      userRole: "player",
    };
  }

  const [challenge] = await db
    .select({
      player1Id: challenges.player1Id,
      player2Id: challenges.player2Id,
      player3Id: challenges.player3Id,
      player4Id: challenges.player4Id,
      visibility: challenges.visibility,
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

  if (participantIds.includes(userId)) {
    return {
      participantIds,
      userRole: "player",
    };
  }

  const visibility = String(challenge.visibility || "public").toLowerCase();
  if (visibility !== "private") {
    return {
      participantIds,
      userRole: "spectator",
    };
  }

  return null;
}

/**
 * Handle voice chat/WebRTC signaling message types:
 * voice_join, voice_offer, voice_answer, voice_ice_candidate, voice_leave
 */
export async function handleVoice(ws: AuthenticatedSocket, data: any): Promise<void> {
  flushVoiceTelemetryIfDue();

  const rateLimitBaseKey = ws.userId
    ? `ws:voice:user:${ws.userId}`
    : `ws:voice:ip:${ws.clientIp || "unknown"}`;

  const sendVoiceError = (errorMessage: string, context: Record<string, unknown>) => {
    incrementVoiceTelemetryCounter(classifyVoiceError(errorMessage));

    logger.warn("[VoiceWS] Signaling rejected", {
      ...context,
      userId: ws.userId,
      type: data?.type,
      error: errorMessage,
    });
    ws.send(JSON.stringify({ type: "voice_error", error: errorMessage }));
  };

  const enforceVoiceRateLimit = async (
    eventName: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<boolean> => {
    const limit = await redisRateLimit(`${rateLimitBaseKey}:${eventName}`, maxRequests, windowMs);
    if (!limit.allowed) {
      sendVoiceError("Voice signaling rate limit exceeded", {
        event: eventName,
        retryAfterMs: limit.retryAfterMs,
      });
      return false;
    }
    return true;
  };

  // Voice join — verify user is participant in match, set up room
  if (data.type === "voice_join" && ws.userId) {
    incrementVoiceTelemetryCounter("joinRequests");

    if (!(await enforceVoiceRateLimit("join", 8, 10_000))) {
      return;
    }

    const matchId = validateMatchId(data.matchId);
    if (!matchId) {
      sendVoiceError("Invalid room identifier", { matchId });
      return;
    }

    const access = await resolveVoiceAccess(matchId, ws.userId);
    if (!access) {
      sendVoiceError("Not authorized for this match", { matchId, participantCount: 0 });
      return;
    }

    const participantIds = access.participantIds;

    // Add to voice room
    if (!voiceRooms.has(matchId)) {
      voiceRooms.set(matchId, new Map());
    }
    const room = voiceRooms.get(matchId)!;
    const existingPeers = Array.from(room.entries())
      .filter(([peerUserId, socket]) => peerUserId !== ws.userId && socket.readyState === WebSocket.OPEN)
      .map(([peerUserId]) => ({
        userId: peerUserId,
        role: participantIds.includes(peerUserId) ? "player" : "spectator",
      }));

    voiceRooms.get(matchId)!.set(ws.userId, ws);
    incrementVoiceTelemetryCounter("joinAccepted");

    logger.info("[VoiceWS] voice_join accepted", {
      matchId,
      userId: ws.userId,
      role: access.userRole,
      participantIds,
      roomSize: voiceRooms.get(matchId)?.size ?? 0,
    });

    // Notify existing peers that a new peer joined.
    room.forEach((socket, peerUserId) => {
      if (peerUserId === ws.userId || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(JSON.stringify({
        type: "voice_peer_joined",
        matchId,
        peerUserId: ws.userId,
        peerRole: access.userRole,
      }));
    });

    ws.send(JSON.stringify({
      type: "voice_joined",
      matchId,
      role: access.userRole,
      peers: existingPeers,
    }));
  }

  // Voice offer — forward WebRTC offer to other peers
  if (data.type === "voice_offer" && ws.userId) {
    if (!(await enforceVoiceRateLimit("offer", 16, 10_000))) {
      return;
    }

    const matchId = validateMatchId(data.matchId);
    const offer = validateSessionDescription(data.offer, "offer");
    const targetUserId = validateMatchId(data.targetUserId);

    if (!matchId || !offer || !targetUserId) {
      sendVoiceError("Invalid voice offer payload", {
        matchId: data.matchId,
      });
      return;
    }

    // Verify sender is in the voice room before forwarding
    const room = voiceRooms.get(matchId);
    if (room && room.has(ws.userId)) {
      const targetSocket = room.get(targetUserId);
      if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
        sendVoiceError("Voice peer is not available", {
          matchId,
          targetUserId,
          event: "voice_offer",
        });
        return;
      }

      targetSocket.send(JSON.stringify({
        type: "voice_offer",
        matchId,
        fromUserId: ws.userId,
        offer,
      }));

      incrementVoiceTelemetryCounter("offerForwarded", 1);
      logger.info("[VoiceWS] voice_offer forwarded", {
        matchId,
        fromUserId: ws.userId,
        toUserId: targetUserId,
        forwardedCount: 1,
      });
    } else {
      sendVoiceError("Not in voice room", { matchId, event: "voice_offer" });
    }
  }

  // Voice answer — forward WebRTC answer to other peers
  if (data.type === "voice_answer" && ws.userId) {
    if (!(await enforceVoiceRateLimit("answer", 16, 10_000))) {
      return;
    }

    const matchId = validateMatchId(data.matchId);
    const answer = validateSessionDescription(data.answer, "answer");
    const targetUserId = validateMatchId(data.targetUserId);

    if (!matchId || !answer || !targetUserId) {
      sendVoiceError("Invalid voice answer payload", {
        matchId: data.matchId,
      });
      return;
    }

    // Verify sender is in the voice room before forwarding
    const room = voiceRooms.get(matchId);
    if (room && room.has(ws.userId)) {
      const targetSocket = room.get(targetUserId);
      if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
        sendVoiceError("Voice peer is not available", {
          matchId,
          targetUserId,
          event: "voice_answer",
        });
        return;
      }

      targetSocket.send(JSON.stringify({
        type: "voice_answer",
        matchId,
        fromUserId: ws.userId,
        answer,
      }));

      incrementVoiceTelemetryCounter("answerForwarded", 1);
      logger.info("[VoiceWS] voice_answer forwarded", {
        matchId,
        fromUserId: ws.userId,
        toUserId: targetUserId,
        forwardedCount: 1,
      });
    } else {
      sendVoiceError("Not in voice room", { matchId, event: "voice_answer" });
    }
  }

  // ICE candidate — forward to other peers
  if (data.type === "voice_ice_candidate" && ws.userId) {
    if (!(await enforceVoiceRateLimit("ice", 100, 10_000))) {
      return;
    }

    const matchId = validateMatchId(data.matchId);
    const candidate = validateIceCandidate(data.candidate);
    const targetUserId = validateMatchId(data.targetUserId);
    if (!matchId || !candidate || !targetUserId) {
      sendVoiceError("Invalid ICE candidate payload", {
        matchId: data.matchId,
      });
      return;
    }

    // Verify sender is in the voice room before forwarding
    const room = voiceRooms.get(matchId);
    if (room && room.has(ws.userId)) {
      const targetSocket = room.get(targetUserId);
      if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
        return;
      }

      targetSocket.send(JSON.stringify({
        type: "voice_ice_candidate",
        matchId,
        fromUserId: ws.userId,
        candidate,
      }));

      incrementVoiceTelemetryCounter("iceForwarded", 1);

      logger.debug("[VoiceWS] voice_ice_candidate forwarded", {
        matchId,
        fromUserId: ws.userId,
        toUserId: targetUserId,
        forwardedCount: 1,
      });
    }
  }

  // Voice leave — remove from room, notify peers
  if (data.type === "voice_leave" && ws.userId) {
    if (!(await enforceVoiceRateLimit("leave", 20, 10_000))) {
      return;
    }

    const matchId = validateMatchId(data.matchId);
    if (!matchId) {
      sendVoiceError("Invalid room identifier", { matchId: data.matchId, event: "voice_leave" });
      return;
    }

    const room = voiceRooms.get(matchId);
    if (room) {
      const mappedSocket = room.get(ws.userId);
      if (mappedSocket !== ws) {
        return;
      }

      room.delete(ws.userId);
      incrementVoiceTelemetryCounter("leaveProcessed");
      // Notify peer that user left
      room.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "voice_peer_left", matchId, peerUserId: ws.userId }));
        }
      });

      logger.info("[VoiceWS] voice_leave processed", {
        matchId,
        userId: ws.userId,
        roomSizeAfterLeave: room.size,
      });

      // Clean up empty room
      if (room.size === 0) {
        voiceRooms.delete(matchId);
      }
    }
  }
}
