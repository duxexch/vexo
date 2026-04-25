import { WebSocket } from "ws";
import { db } from "../db";
import { challenges, chatCallSessions, gameMatches, liveGameSessions, projectCurrencyWallets, systemConfig } from "@shared/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { redisRateLimit } from "../lib/redis";
import type { AuthenticatedSocket } from "./shared";
import { voiceRooms } from "./shared";

const MAX_SDP_LENGTH = 25_000;
const MAX_ICE_CANDIDATE_LENGTH = 2_048;
const VOICE_TELEMETRY_FLUSH_INTERVAL_MS = 60_000;
const CHALLENGE_VOICE_PRICE_CONFIG_KEY = "chat_voice_call_price_per_minute";

type IceCandidateType = "host" | "srflx" | "relay" | "prflx" | "unknown";

interface VoiceIceCandidateTypeCounters {
  host: number;
  srflx: number;
  relay: number;
  prflx: number;
  unknown: number;
}

interface VoiceIceCandidateTypeDistribution {
  host: number;
  srflx: number;
  relay: number;
  prflx: number;
  unknown: number;
}

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
  rejectedNotParticipant: number;
  rejectedPricingGate: number;
  rejectedSignalingError: number;
  rejectedOther: number;
  challengeFirstAttemptBypass: number;
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
  iceCandidates: {
    totalObserved: number;
    byType: VoiceIceCandidateTypeCounters;
    distribution: VoiceIceCandidateTypeDistribution;
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
  rejectedNotParticipant: 0,
  rejectedPricingGate: 0,
  rejectedSignalingError: 0,
  rejectedOther: 0,
  challengeFirstAttemptBypass: 0,
};

const voiceIceCandidateTypeCounters: VoiceIceCandidateTypeCounters = {
  host: 0,
  srflx: 0,
  relay: 0,
  prflx: 0,
  unknown: 0,
};

let voiceTelemetryLastFlushAt = Date.now();

function getTotalIceCandidatesObserved(counters: VoiceIceCandidateTypeCounters): number {
  return counters.host + counters.srflx + counters.relay + counters.prflx + counters.unknown;
}

function buildIceCandidateTypeDistribution(
  counters: VoiceIceCandidateTypeCounters,
  totalObserved: number,
): VoiceIceCandidateTypeDistribution {
  if (totalObserved <= 0) {
    return {
      host: 0,
      srflx: 0,
      relay: 0,
      prflx: 0,
      unknown: 0,
    };
  }

  return {
    host: Number((counters.host / totalObserved).toFixed(4)),
    srflx: Number((counters.srflx / totalObserved).toFixed(4)),
    relay: Number((counters.relay / totalObserved).toFixed(4)),
    prflx: Number((counters.prflx / totalObserved).toFixed(4)),
    unknown: Number((counters.unknown / totalObserved).toFixed(4)),
  };
}

function getVoiceTelemetryBaseSnapshot(nowMs: number): VoiceTelemetrySnapshot {
  const counters: VoiceTelemetryCounters = { ...voiceTelemetryCounters };
  const iceCounters: VoiceIceCandidateTypeCounters = { ...voiceIceCandidateTypeCounters };
  const totalIceCandidatesObserved = getTotalIceCandidatesObserved(iceCounters);
  const rejected = counters.rejectedRateLimit
    + counters.rejectedInvalidPayload
    + counters.rejectedUnauthorized
    + counters.rejectedNotInRoom
    + counters.rejectedNotParticipant
    + counters.rejectedPricingGate
    + counters.rejectedSignalingError
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
    iceCandidates: {
      totalObserved: totalIceCandidatesObserved,
      byType: iceCounters,
      distribution: buildIceCandidateTypeDistribution(iceCounters, totalIceCandidatesObserved),
    },
  };
}

function incrementVoiceTelemetryCounter(counter: keyof VoiceTelemetryCounters, amount: number = 1): void {
  voiceTelemetryCounters[counter] += amount;
}

/**
 * Tracks `${matchId}:${userId}` keys for users who have already used their
 * first-attempt-free challenge voice join. The first time a user joins a
 * given challenge's voice room (within the current server uptime) the
 * pricing gate is bypassed so two players can confirm the call works
 * without anyone needing to top up VXC. Every subsequent attempt — even
 * after a leave/rejoin cycle — goes through the normal pricing gate. The
 * key is intentionally NOT purged on room-empty, otherwise a coordinated
 * leave/rejoin loop would let players get unlimited free voice within the
 * same match.
 *
 * Storage shape: Map<key, consumedAtMs>. We use a Map (instead of a plain
 * Set) so an idle interval can prune entries older than
 * CHALLENGE_FIRST_ATTEMPT_TTL_MS, keeping memory bounded on a long-lived
 * server. The TTL is comfortably longer than any realistic challenge match
 * duration.
 */
const challengeVoiceFirstAttemptUsed = new Map<string, number>();
const CHALLENGE_FIRST_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function challengeVoiceFirstAttemptKey(matchId: string, userId: string): string {
  return `${matchId}:${userId}`;
}

function pruneChallengeFirstAttemptUsed(now: number = Date.now()): number {
  let pruned = 0;
  for (const [key, ts] of challengeVoiceFirstAttemptUsed) {
    if (now - ts > CHALLENGE_FIRST_ATTEMPT_TTL_MS) {
      challengeVoiceFirstAttemptUsed.delete(key);
      pruned += 1;
    }
  }
  return pruned;
}

// Periodic prune so the map cannot grow unbounded on a long-lived server.
const challengeFirstAttemptPruneTimer = setInterval(
  () => pruneChallengeFirstAttemptUsed(),
  60 * 60 * 1000, // hourly
);
if (typeof challengeFirstAttemptPruneTimer.unref === "function") {
  challengeFirstAttemptPruneTimer.unref();
}

function incrementIceCandidateTypeCounter(candidateType: IceCandidateType): void {
  voiceIceCandidateTypeCounters[candidateType] += 1;
}

function classifyVoiceError(errorMessage: string): keyof VoiceTelemetryCounters {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("rate limit")) return "rejectedRateLimit";
  if (normalized.includes("insufficient project currency balance")) return "rejectedPricingGate";
  if (normalized.includes("not authorized for this match")) return "rejectedNotParticipant";
  if (normalized.includes("not authorized")) return "rejectedUnauthorized";
  if (normalized.includes("not in voice room")) return "rejectedNotInRoom";
  if (normalized.includes("voice peer is not available")) return "rejectedSignalingError";
  if (normalized.includes("invalid")) return "rejectedInvalidPayload";
  return "rejectedOther";
}

function classifyIceCandidateType(candidateValue: string): IceCandidateType {
  const match = /\btyp\s+([a-z0-9]+)/i.exec(candidateValue);
  const type = match?.[1]?.toLowerCase() || "unknown";

  switch (type) {
    case "host":
    case "srflx":
    case "relay":
    case "prflx":
      return type;
    default:
      return "unknown";
  }
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
    const iceByType = snapshot.iceCandidates.byType;

    logger.info("[VoiceWS] telemetry summary", {
      windowMs: snapshot.windowDurationMs,
      activeRooms: snapshot.activeRooms,
      ...snapshot.counters,
      ...snapshot.totals,
      ...snapshot.rates,
      iceCandidatesObserved: snapshot.iceCandidates.totalObserved,
      iceCandidateHost: iceByType.host,
      iceCandidateSrflx: iceByType.srflx,
      iceCandidateRelay: iceByType.relay,
      iceCandidatePrflx: iceByType.prflx,
      iceCandidateUnknown: iceByType.unknown,
      iceCandidateRelayRatio: snapshot.iceCandidates.distribution.relay,
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
  Object.keys(voiceIceCandidateTypeCounters).forEach((key) => {
    voiceIceCandidateTypeCounters[key as keyof VoiceIceCandidateTypeCounters] = 0;
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

async function getConfigDecimal(key: string, fallback: number): Promise<number> {
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  const parsed = Number.parseFloat(config?.value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveChallengeVoicePricingGate(userId: string): Promise<{
  requiredRate: number;
  walletBalance: number;
  allowed: boolean;
}> {
  const requiredRate = Number((await getConfigDecimal(CHALLENGE_VOICE_PRICE_CONFIG_KEY, 15)).toFixed(2));
  if (requiredRate <= 0) {
    return {
      requiredRate,
      walletBalance: Number.POSITIVE_INFINITY,
      allowed: true,
    };
  }

  const [wallet] = await db
    .select({ totalBalance: projectCurrencyWallets.totalBalance })
    .from(projectCurrencyWallets)
    .where(eq(projectCurrencyWallets.userId, userId))
    .limit(1);

  const walletBalance = Number(parseFloat(wallet?.totalBalance || "0").toFixed(2));
  return {
    requiredRate,
    walletBalance,
    allowed: walletBalance >= requiredRate,
  };
}

function toUniqueParticipantIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(isNonEmptyId)));
}

type VoiceAccessResolution = {
  participantIds: string[];
  userRole: "player";
  roomKind: "match" | "challenge" | "private_call";
  callSessionId?: string;
};

function parsePrivateCallRoomId(roomId: string): string | null {
  if (!roomId.startsWith("private:")) {
    return null;
  }

  const sessionId = roomId.slice("private:".length).trim();
  return sessionId.length > 0 ? sessionId : null;
}

async function resolvePrivateCallAccess(roomId: string, userId: string): Promise<VoiceAccessResolution | null> {
  const sessionId = parsePrivateCallRoomId(roomId);
  if (!sessionId) {
    return null;
  }

  const [session] = await db
    .select({
      id: chatCallSessions.id,
      callerId: chatCallSessions.callerId,
      receiverId: chatCallSessions.receiverId,
      status: chatCallSessions.status,
    })
    .from(chatCallSessions)
    .where(
      and(
        eq(chatCallSessions.id, sessionId),
        eq(chatCallSessions.status, "active"),
        or(
          eq(chatCallSessions.callerId, userId),
          eq(chatCallSessions.receiverId, userId),
        ),
      ),
    )
    .limit(1);

  if (!session) {
    return null;
  }

  return {
    participantIds: toUniqueParticipantIds([session.callerId, session.receiverId]),
    userRole: "player",
    roomKind: "private_call",
    callSessionId: session.id,
  };
}

async function resolveVoiceAccess(roomId: string, userId: string): Promise<VoiceAccessResolution | null> {
  const privateCallAccess = await resolvePrivateCallAccess(roomId, userId);
  if (privateCallAccess) {
    return privateCallAccess;
  }

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
      roomKind: "match",
    };
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

  if (participantIds.includes(userId)) {
    return {
      participantIds,
      userRole: "player",
      roomKind: "challenge",
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

  const sendVoiceError = (
    errorMessage: string,
    context: Record<string, unknown>,
    options?: { code?: string; details?: Record<string, unknown> },
  ) => {
    incrementVoiceTelemetryCounter(classifyVoiceError(errorMessage));

    logger.warn("[VoiceWS] Signaling rejected", {
      ...context,
      userId: ws.userId,
      type: data?.type,
      error: errorMessage,
      code: options?.code,
    });
    const payload: Record<string, unknown> = { type: "voice_error", error: errorMessage };
    if (options?.code) payload.code = options.code;
    if (options?.details) payload.details = options.details;
    ws.send(JSON.stringify(payload));
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

  if (data.type === "voice_ping" && ws.userId) {
    if (!(await enforceVoiceRateLimit("ping", 90, 60_000))) {
      return;
    }

    ws.send(JSON.stringify({
      type: "voice_pong",
      timestamp: Date.now(),
    }));
    return;
  }

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
      sendVoiceError(
        "Not authorized for this match",
        { matchId, participantCount: 0 },
        { code: "not_participant" },
      );
      return;
    }

    if (access.roomKind === "challenge") {
      // First-attempt-free policy: the very first time a player joins this
      // challenge's voice room (within the current server uptime) we skip
      // the pricing gate so two players can confirm voice works without
      // anyone needing to top up VXC. Subsequent attempts pay normally.
      const firstAttemptKey = challengeVoiceFirstAttemptKey(matchId, ws.userId);
      const isFirstAttempt = !challengeVoiceFirstAttemptUsed.has(firstAttemptKey);

      if (!isFirstAttempt) {
        const pricingGate = await resolveChallengeVoicePricingGate(ws.userId);
        if (!pricingGate.allowed) {
          sendVoiceError(
            "Insufficient project currency balance for challenge voice",
            {
              matchId,
              requiredRate: pricingGate.requiredRate,
              walletBalance: pricingGate.walletBalance,
              roomKind: access.roomKind,
              role: access.userRole,
            },
            {
              code: "pricing_gate",
              details: {
                requiredRate: pricingGate.requiredRate,
                walletBalance: pricingGate.walletBalance,
              },
            },
          );
          return;
        }
      } else {
        logger.info("[VoiceWS] challenge voice first-attempt-free bypass", {
          matchId,
          userId: ws.userId,
        });
        incrementVoiceTelemetryCounter("challengeFirstAttemptBypass");
      }

      // Mark the first attempt as consumed once we've decided to admit the
      // user. Any later join (e.g. after disconnect/reconnect) will require
      // sufficient VXC balance.
      challengeVoiceFirstAttemptUsed.set(firstAttemptKey, Date.now());
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
        role: "player",
      }));

    voiceRooms.get(matchId)!.set(ws.userId, ws);

    if (access.roomKind === "private_call" && access.callSessionId && room.size >= 2) {
      await db
        .update(chatCallSessions)
        .set({
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(chatCallSessions.id, access.callSessionId),
            eq(chatCallSessions.status, "active"),
            sql`${chatCallSessions.connectedAt} IS NULL`,
          ),
        );
    }

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
    if (room && room.get(ws.userId) === ws) {
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
    if (room && room.get(ws.userId) === ws) {
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
    if (room && room.get(ws.userId) === ws) {
      const candidateType = classifyIceCandidateType(candidate.candidate || "");
      incrementIceCandidateTypeCounter(candidateType);

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
        candidateType,
        forwardedCount: 1,
      });
    } else {
      sendVoiceError("Not in voice room", { matchId, event: "voice_ice_candidate" });
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

      // Clean up empty room. We intentionally do NOT clear
      // challengeVoiceFirstAttemptUsed entries here — they persist for the
      // lifetime of the server process so a leave/rejoin loop cannot give
      // unlimited free voice within the same match.
      if (room.size === 0) {
        voiceRooms.delete(matchId);
      }
    }
  }
}
