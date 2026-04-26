import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { Server as IOServer, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { parse as parseCookie } from "cookie";
import { logger } from "../lib/logger";
import { getRedisPub, getRedisSub, redisRateLimit } from "../lib/redis";
import { verifyUserAccessToken, AuthVerificationError } from "../lib/auth-verification";
import {
  SOCKETIO_PATH,
  SOCKETIO_NS_CHAT,
  SOCKETIO_NS_RTC,
  type ChatBroadcast,
  type ChatClientToServerEvents,
  type ChatServerToClientEvents,
  type RtcClientToServerEvents,
  type RtcServerToClientEvents,
} from "../../shared/socketio-events";
import { storage } from "../storage";
import { db } from "../db";
import { challenges, gameMatches } from "../../shared/schema";
import { eq } from "drizzle-orm";
import {
  deliverRealtimeChallengeChat,
  broadcastChallengeViewerCount,
  broadcastChallengeViewerList,
  type ChatNamespace,
} from "./challenge-chat-bridge";
import { deliverRealtimeDirectMessage } from "./direct-message-bridge";
import { challengeGameRooms } from "../websocket/shared";
import { getRedisClient } from "../lib/redis";
import { insertMissedCallChatMessage } from "../lib/chat-call-event";

interface AuthedSocketData {
  userId: string;
  username: string;
  // Per-room role stamped at chat:join time. Used by chat:send to enforce
  // read-only access for spectators (Task #10). Map keyed by roomId.
  roomRoles?: Map<string, "player" | "spectator">;
  // Task #14: serialization-friendly mirror of the spectator entries in
  // `roomRoles`. Native `Map`s don't survive the Socket.IO Redis adapter's
  // JSON serialization for `fetchSockets()` across nodes, so the cap check
  // reads from this array instead. Always kept in sync with `roomRoles`.
  spectatorRoomIds?: string[];
}

type RoomAuthzResult =
  | { allowed: true; role: "player" }
  // Task #14: spectator decisions also carry the per-game cap so the
  // chat:join handler can enforce capacity without a second DB lookup.
  | { allowed: true; role: "spectator"; maxSpectators: number }
  | { allowed: false };

type ChatSocket = Socket<ChatClientToServerEvents, ChatServerToClientEvents, Record<string, never>, AuthedSocketData>;
type RtcSocket = Socket<RtcClientToServerEvents, RtcServerToClientEvents, Record<string, never>, AuthedSocketData>;

let ioInstance: IOServer | null = null;

/** Extract a JWT token from a Socket.IO handshake (cookie or auth payload). */
function extractTokenFromHandshake(req: IncomingMessage, auth: Record<string, unknown> | undefined): string | undefined {
  const authToken = auth && typeof auth.token === "string" ? auth.token : undefined;
  if (authToken) return authToken;

  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;
  const parsed = parseCookie(rawCookie);
  return parsed.vex_token;
}

async function authenticateHandshake(socket: Socket): Promise<AuthedSocketData | null> {
  const token = extractTokenFromHandshake(
    socket.request,
    socket.handshake.auth as Record<string, unknown> | undefined,
  );
  if (!token) return null;

  try {
    const userAgent = socket.handshake.headers["user-agent"];
    const verified = await verifyUserAccessToken(token, {
      userAgent: typeof userAgent === "string" ? userAgent : undefined,
      // Enforce active session parity with REST routes — revoked / logged-out
      // tokens must NOT be able to open a socket. Activity is not bumped per
      // ping (would thrash the sessions table); REST traffic keeps it warm.
      requireActiveSession: true,
      updateSessionActivity: false,
    });
    return { userId: verified.id, username: verified.username || verified.id };
  } catch (err) {
    if (err instanceof AuthVerificationError) {
      logger.debug?.(`[socket.io] auth failed: ${err.message}`);
    } else {
      logger.warn?.(`[socket.io] auth error: ${(err as Error).message}`);
    }
    return null;
  }
}

/**
 * Check whether `userId` is allowed to join `roomId`.
 *
 * Accepted patterns (anything else is denied):
 *   - `challenge:<challengeId>` — user must be one of player1..player4
 *   - `match:<gameMatchId>`     — user must be player1 or player2 of the
 *                                 casual gameplay match (`game_matches`
 *                                 table). Spectators not supported here
 *                                 because that table has no spectator
 *                                 concept; only the two participants can
 *                                 join the realtime chat room.
 *   - `dm:<idA>:<idB>`         — user must be A or B (sorted lexicographically)
 *
 * Failures (DB error, missing row) deny — fail-closed.
 */
async function isUserAllowedInRoom(userId: string, roomId: string): Promise<RoomAuthzResult> {
  if (roomId.startsWith("match:")) {
    // Task #109: casual gameplay matches use a separate `game_matches`
    // table from challenges, so they get their own room namespace. The
    // matchmaking pipeline only ever stamps player1Id/player2Id, so
    // authorization is the strict 2-player set. No spectator role is
    // exposed for this room type today (mirrors the legacy
    // /api/gameplay/messages REST endpoint, which also only accepts
    // posts from those two participants).
    const matchId = roomId.slice("match:".length);
    if (!matchId) return { allowed: false };
    try {
      const [row] = await db
        .select({
          p1: gameMatches.player1Id,
          p2: gameMatches.player2Id,
        })
        .from(gameMatches)
        .where(eq(gameMatches.id, matchId))
        .limit(1);
      if (!row) return { allowed: false };
      if (userId === row.p1 || userId === row.p2) {
        return { allowed: true, role: "player" };
      }
      return { allowed: false };
    } catch (err) {
      logger.warn?.(`[socket.io] match room authz lookup failed: ${(err as Error).message}`);
      return { allowed: false };
    }
  }

  if (roomId.startsWith("challenge:")) {
    const challengeId = roomId.slice("challenge:".length);
    if (!challengeId) return { allowed: false };
    try {
      const [row] = await db
        .select({
          p1: challenges.player1Id,
          p2: challenges.player2Id,
          p3: challenges.player3Id,
          p4: challenges.player4Id,
          gameType: challenges.gameType,
          visibility: challenges.visibility,
          friendAccountId: challenges.friendAccountId,
        })
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .limit(1);
      if (!row) return { allowed: false };

      // Players always allowed (read + write).
      if ([row.p1, row.p2, row.p3, row.p4].includes(userId)) {
        return { allowed: true, role: "player" };
      }

      // Spectator path (Task #10): mirror the same authz rules used by
      // the legacy spectate WS path in server/game-websocket/auth-join.ts:
      //   1. Private challenges: only the explicitly-invited friend may watch.
      //   2. The game's challenge settings must allow spectators at all.
      //   3. Per-game spectator capacity is enforced in chat:join — see
      //      Task #14. We surface `maxSpectators` here so that handler can
      //      run the count without a second DB round trip.
      if (row.visibility === "private" && row.friendAccountId !== userId) {
        return { allowed: false };
      }
      const config = await storage.getChallengeSettings(row.gameType);
      if (!config.allowSpectators) return { allowed: false };
      return { allowed: true, role: "spectator", maxSpectators: config.maxSpectators };
    } catch (err) {
      logger.warn?.(`[socket.io] room authz lookup failed: ${(err as Error).message}`);
      return { allowed: false };
    }
  }

  if (roomId.startsWith("dm:")) {
    const parts = roomId.slice("dm:".length).split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { allowed: false };
    // Enforce canonical sorted form so `dm:a:b` and `dm:b:a` are the same room
    const [a, b] = [parts[0], parts[1]].sort();
    if (`dm:${a}:${b}` !== roomId) return { allowed: false };
    if (userId === a || userId === b) return { allowed: true, role: "player" };
    return { allowed: false };
  }

  return { allowed: false };
}

/**
 * Apply a Redis-backed rate-limit to a socket event. Returns true if allowed.
 * `windowSec` is converted to ms because `redisRateLimit` expects milliseconds.
 */
async function rateLimitOk(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const result = await redisRateLimit(key, max, windowSec * 1000);
    return result.allowed;
  } catch {
    // Fail-open if Redis is briefly unavailable — better than silently dropping events
    return true;
  }
}

/**
 * Bootstrap Socket.IO on the existing HTTP server.
 * - Mounts at SOCKETIO_PATH (default `/socket.io`)
 * - Uses ioredis pub/sub adapter so multiple workers stay in sync
 * - Authenticates handshake via existing JWT cookie / auth.token
 * - Exposes /chat and /rtc namespaces
 *
 * Safe to call once; idempotent (no-op if already started).
 */
export function setupSocketIO(httpServer: HttpServer): IOServer {
  if (ioInstance) return ioInstance;

  const io = new IOServer(httpServer, {
    path: SOCKETIO_PATH,
    transports: ["websocket", "polling"],
    cors: {
      // Same-origin in production via Traefik; allow credentials so cookies flow
      origin: true,
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024, // chat payload only — keep small
  });

  // Wire Redis adapter (best-effort — log and continue if it fails)
  try {
    const pub = getRedisPub();
    const sub = getRedisSub();
    io.adapter(createAdapter(pub, sub));
    logger.info("[socket.io] Redis adapter attached");
  } catch (err) {
    logger.warn(`[socket.io] Redis adapter unavailable, running single-node: ${(err as Error).message}`);
  }

  /* ---------------------------- /chat namespace --------------------------- */
  const chatNs: ChatNamespace = io.of(SOCKETIO_NS_CHAT) as unknown as ChatNamespace;

  chatNs.use(async (socket, next) => {
    const auth = await authenticateHandshake(socket);
    if (!auth) return next(new Error("auth_required"));
    socket.data = auth;
    next();
  });

  chatNs.on("connection", (raw) => {
    const socket = raw as ChatSocket;
    const { userId } = socket.data;

    socket.on("ping", (ack) => ack({ ts: Date.now() }));

    socket.on("chat:join", async (payload, ack) => {
      const roomId = String(payload?.roomId || "").slice(0, 128);
      if (!roomId) {
        ack?.(false);
        return;
      }
      if (!(await rateLimitOk(`sio:chat:join:${userId}`, 30, 60))) {
        socket.emit("chat:error", { code: "rate_limit", message: "Too many joins" });
        ack?.(false);
        return;
      }
      // Authorization: only allow joining rooms the user is genuinely a
      // member of. We accept two patterns:
      //   challenge:<id>  → user must be one of player1..player4
      //   dm:<idA>:<idB>  → user must be A or B (sorted lexicographically)
      // Anything else is rejected.
      const authz = await isUserAllowedInRoom(userId, roomId);
      if (!authz.allowed) {
        socket.emit("chat:error", { code: "forbidden", message: "Not a member of this room" });
        ack?.(false);
        return;
      }

      // Task #14: enforce per-game spectator cap on the realtime chat
      // channel. Players are exempt — only spectator joins count toward
      // the cap. We count by socket (matches the legacy
      // `room.spectators.size` semantics) across the whole cluster via
      // the Redis adapter (`fetchSockets` is adapter-aware). The current
      // socket has not yet joined the room, so it is not double-counted.
      // Same user re-joining from another tab DOES count — mirroring the
      // legacy stream where each WS connection consumes a slot.
      if (authz.role === "spectator") {
        try {
          const sockets = await chatNs.in(roomId).fetchSockets();
          let spectatorCount = 0;
          for (const s of sockets) {
            // Use the array mirror (`spectatorRoomIds`) instead of the
            // `roomRoles` Map: when sockets live on a different node, the
            // Redis adapter serializes `data` as JSON and `Map`s come back
            // as `{}`. Arrays survive the round trip.
            const data = s.data as AuthedSocketData | undefined;
            if (data?.spectatorRoomIds?.includes(roomId)) spectatorCount++;
          }
          if (spectatorCount >= authz.maxSpectators) {
            socket.emit("chat:error", {
              code: "spectator_full",
              message: "Spectator limit reached for this game",
              roomId,
            });
            ack?.(false);
            return;
          }
        } catch (err) {
          logger.warn?.(`[socket.io] spectator cap check failed for ${roomId}: ${(err as Error).message}`);
          // Fail-closed on cap errors: better to refuse than over-fan-out.
          socket.emit("chat:error", { code: "server", message: "Could not verify capacity" });
          ack?.(false);
          return;
        }
      }

      await socket.join(roomId);
      // Stamp this socket's role for the room so chat:send can enforce
      // read-only access for spectators.
      if (!socket.data.roomRoles) socket.data.roomRoles = new Map();
      socket.data.roomRoles.set(roomId, authz.role);
      // Task #14: keep the cluster-visible spectator mirror in sync.
      // Defensive: also strip `roomId` from the mirror when joining as a
      // player so a stale spectator entry from a prior join can't inflate
      // the cap count.
      if (authz.role === "spectator") {
        if (!socket.data.spectatorRoomIds) socket.data.spectatorRoomIds = [];
        if (!socket.data.spectatorRoomIds.includes(roomId)) {
          socket.data.spectatorRoomIds.push(roomId);
        }
      } else if (socket.data.spectatorRoomIds) {
        socket.data.spectatorRoomIds = socket.data.spectatorRoomIds.filter(
          (r) => r !== roomId,
        );
      }
      const room = chatNs.adapter.rooms.get(roomId);
      socket.emit("chat:joined", { roomId, members: room?.size || 1 });
      ack?.(true);

      // Task #26: refresh the live spectator count for this challenge
      // chat room. We always broadcast — even when a player joins —
      // because the player's first chat:joined arrival is also when
      // they should see whatever spectator count is already present.
      // The helper short-circuits for non-challenge rooms.
      void broadcastChallengeViewerCount(chatNs, roomId);
      // Task #75: companion broadcast — emits a per-recipient
      // `chat:viewer_list` so every socket in the room (including the
      // joiner) sees the current "who's watching" set with their own
      // block-list filter applied. Failure is swallowed inside the
      // helper; the count broadcast above is unaffected.
      void broadcastChallengeViewerList(chatNs, roomId);
    });

    socket.on("chat:leave", async (payload) => {
      const roomId = String(payload?.roomId || "").slice(0, 128);
      if (roomId) {
        await socket.leave(roomId);
        socket.data.roomRoles?.delete(roomId);
        // Task #14: keep the cluster-visible spectator mirror in sync.
        if (socket.data.spectatorRoomIds) {
          socket.data.spectatorRoomIds = socket.data.spectatorRoomIds.filter(
            (r) => r !== roomId,
          );
        }
        // Task #26: re-broadcast the spectator count after the leaver
        // is actually out of the room. socket.leave above resolves
        // before we emit, so the count we compute will not include the
        // leaving socket.
        void broadcastChallengeViewerCount(chatNs, roomId);
        // Task #75: same lifecycle for the viewer-list broadcast so the
        // popover updates when a spectator leaves the room.
        void broadcastChallengeViewerList(chatNs, roomId);
      }
    });

    socket.on("chat:send", async (payload, ack) => {
      const roomId = String(payload?.roomId || "").slice(0, 128);
      const text = String(payload?.text || "").slice(0, 500).trim();
      const clientMsgId = payload?.clientMsgId ? String(payload.clientMsgId).slice(0, 64) : undefined;
      const isQuickMessage = Boolean(payload?.isQuickMessage);
      const quickMessageKey = payload?.quickMessageKey
        ? String(payload.quickMessageKey).slice(0, 50)
        : undefined;

      if (!roomId || !text) {
        ack?.({ ok: false, error: "invalid" });
        return;
      }

      if (!socket.rooms.has(roomId)) {
        ack?.({ ok: false, error: "not_in_room" });
        return;
      }

      // Role must have been stamped by chat:join. Missing role means the
      // client is trying to send into a room it never joined.
      const role = socket.data.roomRoles?.get(roomId);
      if (!role) {
        ack?.({ ok: false, error: "not_in_room" });
        return;
      }

      if (!(await rateLimitOk(`sio:chat:send:${userId}`, 30, 10))) {
        socket.emit("chat:error", { code: "rate_limit", message: "Slow down" });
        ack?.({ ok: false, error: "rate_limit" });
        return;
      }

      // Task #9: outgoing chat for challenge rooms is now the authoritative
      // path. We persist + apply the legacy filter pipeline + reverse-mirror
      // to legacy WS clients so behavior is identical regardless of which
      // transport the sender or recipients use.
      //
      // Task #13: spectators are read-only on this transport. They still
      // RECEIVE every broadcast (so the live chat panel works), but any
      // attempt to send is rejected with the dedicated `spectator_readonly`
      // code so the client can render a polite localized notice instead of
      // a generic failure. The check runs before the per-room presence
      // check below because role is the cheaper, more authoritative gate.
      if (roomId.startsWith("challenge:")) {
        const challengeId = roomId.slice("challenge:".length);

        if (role === "spectator") {
          socket.emit("chat:error", {
            code: "spectator_readonly",
            message: "Spectators can read chat but cannot send messages",
            roomId,
          });
          ack?.({ ok: false, error: "spectator_readonly" });
          return;
        }

        try {
          const result = await deliverRealtimeChallengeChat({
            challengeId,
            roomId,
            senderId: userId,
            senderUsernameFallback: socket.data.username,
            text,
            isQuickMessage,
            quickMessageKey,
            isSpectator: false,
            clientMsgId,
            chatNs,
          });
          if (result.ok) {
            ack?.({ ok: true });
          } else if (result.reason === "empty") {
            // Sanitization stripped everything — soft fail, no error toast.
            ack?.({ ok: false, error: "empty" });
          } else {
            socket.emit("chat:error", {
              code: "invalid",
              message: result.reason === "no_session"
                ? "Game session not active"
                : "Failed to send",
            });
            ack?.({ ok: false, error: result.reason || "failed" });
          }
        } catch (err) {
          logger.warn?.(`[socket.io] chat:send delivery failed: ${(err as Error).message}`);
          socket.emit("chat:error", { code: "server", message: "Failed to send" });
          ack?.({ ok: false, error: "server" });
        }
        return;
      }

      // DM rooms — Task #16: full feature parity with the challenge bridge:
      // word filter + per-recipient block/mute filtering + persistence into
      // `chat_messages` so the inbox UI can scroll history back. Sender
      // always receives an echo; the peer is suppressed when either side
      // has blocked or muted the other (the message is still persisted).
      if (roomId.startsWith("dm:")) {
        try {
          const result = await deliverRealtimeDirectMessage({
            roomId,
            senderId: userId,
            senderUsernameFallback: socket.data.username,
            text,
            clientMsgId,
            chatNs,
          });
          if (result.ok) {
            ack?.({ ok: true });
          } else if (result.reason === "empty") {
            ack?.({ ok: false, error: "empty" });
          } else {
            socket.emit("chat:error", {
              code: "invalid",
              message: "Invalid DM room",
            });
            ack?.({ ok: false, error: "invalid" });
          }
        } catch (err) {
          logger.warn?.(`[socket.io] DM chat:send delivery failed: ${(err as Error).message}`);
          socket.emit("chat:error", { code: "server", message: "Failed to send" });
          ack?.({ ok: false, error: "server" });
        }
        return;
      }

      // Unknown room pattern — chat:join authz should already have rejected
      // this, but fail-closed here too rather than leak an un-moderated emit.
      ack?.({ ok: false, error: "not_in_room" });
    });

    // Task #26: refresh viewer counts on every challenge room this socket
    // was in when it disconnects. We snapshot the spectator-room mirror
    // BEFORE the socket actually leaves (Socket.IO removes it from rooms
    // between `disconnecting` and `disconnect`), then re-broadcast on the
    // next tick so the count we compute excludes the dropped socket.
    socket.on("disconnecting", () => {
      const rooms = socket.data.spectatorRoomIds
        ? [...socket.data.spectatorRoomIds]
        : [];
      if (rooms.length === 0) return;
      setImmediate(() => {
        for (const roomId of rooms) {
          void broadcastChallengeViewerCount(chatNs, roomId);
          // Task #75: refresh the per-recipient viewer list too so the
          // chat-header avatar stack drops the leaver instantly.
          void broadcastChallengeViewerList(chatNs, roomId);
        }
      });
    });
  });

  /* ----------------------------- /rtc namespace --------------------------- */
  const rtcNs = io.of(SOCKETIO_NS_RTC);

  rtcNs.use(async (socket, next) => {
    const auth = await authenticateHandshake(socket);
    if (!auth) return next(new Error("auth_required"));
    socket.data = auth;
    // Personal room so we can target a user by id
    await socket.join(`u:${auth.userId}`);
    next();
  });

  function emitToUser(userId: string, event: keyof RtcServerToClientEvents, payload: unknown): void {
    rtcNs.to(`u:${userId}`).emit(event as string, payload as never);
  }

  rtcNs.on("connection", (raw) => {
    const socket = raw as RtcSocket;
    const { userId, username } = socket.data;

    socket.on("ping", (ack) => ack({ ts: Date.now() }));

    /**
     * Per-call room name. Both participants join `call:<sessionId>` so we can
     * scope rtc:end / rtc:tier broadcasts and avoid leaking presence metadata
     * to the whole namespace.
     */
    const callRoom = (sessionId: string) => `call:${sessionId}`;

    /**
     * Task #55 — Track legacy (in-game) call sessions in Redis so we can
     * tell a missed call apart from a normal hang-up at rtc:end time and
     * post a "Missed call" entry into the DM thread for both participants.
     * The REST DM-call path (server/routes/chat-features/calls.ts) records
     * its own state in Postgres; this keyspace only covers the rtc:* path.
     */
    const rtcSessionKey = (sessionId: string) => `rtc:session:${sessionId}`;
    const RTC_SESSION_TTL_SECONDS = 60 * 60; // 1h covers any plausible call.

    interface RtcSessionState {
      callerId: string;
      receiverId: string;
      callType: "voice" | "video";
      connected: 0 | 1;
    }

    const recordRtcInvite = async (state: RtcSessionState, sessionId: string) => {
      try {
        await getRedisClient().set(
          rtcSessionKey(sessionId),
          JSON.stringify(state),
          "EX",
          RTC_SESSION_TTL_SECONDS,
        );
      } catch {
        // Without Redis we can't detect missed calls on this path; the
        // chat thread simply won't get a synthetic entry. The call itself
        // still works because nothing else depends on this state.
      }
    };

    const loadRtcSession = async (sessionId: string): Promise<RtcSessionState | null> => {
      try {
        const raw = await getRedisClient().get(rtcSessionKey(sessionId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.callerId || !parsed?.receiverId) return null;
        return {
          callerId: String(parsed.callerId),
          receiverId: String(parsed.receiverId),
          callType: parsed.callType === "video" ? "video" : "voice",
          connected: parsed.connected === 1 ? 1 : 0,
        };
      } catch {
        return null;
      }
    };

    const markRtcConnected = async (sessionId: string) => {
      const state = await loadRtcSession(sessionId);
      if (!state || state.connected === 1) return;
      state.connected = 1;
      try {
        await getRedisClient().set(
          rtcSessionKey(sessionId),
          JSON.stringify(state),
          "EX",
          RTC_SESSION_TTL_SECONDS,
        );
      } catch {
        // Best-effort; worst case we'd post a false "missed" entry which
        // the dedupe key on `sessionId` keeps to a single row at most.
      }
    };

    const clearRtcSession = async (sessionId: string) => {
      try {
        await getRedisClient().del(rtcSessionKey(sessionId));
      } catch {
        // Key will TTL out on its own.
      }
    };

    socket.on("rtc:invite", async (payload, ack) => {
      const sessionId = String(payload?.sessionId || "").slice(0, 64);
      const toUserId = String(payload?.toUserId || "").slice(0, 64);
      const callType = payload?.callType === "video" ? "video" : "voice";
      const challengeId = payload?.context?.challengeId
        ? String(payload.context.challengeId).slice(0, 64)
        : "";
      if (!sessionId || !toUserId || toUserId === userId) {
        ack?.({ ok: false, error: "invalid" });
        return;
      }
      if (!(await rateLimitOk(`sio:rtc:invite:${userId}`, 20, 60))) {
        ack?.({ ok: false, error: "rate_limit" });
        return;
      }

      // Authorization: caller and callee must be co-participants in an
      // active challenge. We require a challengeId in context and verify
      // both users are listed in players1..4 of that challenge. This
      // prevents cross-context unsolicited call signaling.
      if (!challengeId) {
        ack?.({ ok: false, error: "context_required" });
        return;
      }
      try {
        const [row] = await db
          .select({
            p1: challenges.player1Id,
            p2: challenges.player2Id,
            p3: challenges.player3Id,
            p4: challenges.player4Id,
            status: challenges.status,
          })
          .from(challenges)
          .where(eq(challenges.id, challengeId))
          .limit(1);
        if (!row) {
          ack?.({ ok: false, error: "challenge_not_found" });
          return;
        }
        const players = [row.p1, row.p2, row.p3, row.p4];
        if (!players.includes(userId) || !players.includes(toUserId)) {
          ack?.({ ok: false, error: "not_participant" });
          return;
        }
        if (row.status !== "active" && row.status !== "waiting") {
          ack?.({ ok: false, error: "challenge_inactive" });
          return;
        }
      } catch (err) {
        logger.warn?.(`[socket.io] rtc:invite authz lookup failed: ${(err as Error).message}`);
        ack?.({ ok: false, error: "server" });
        return;
      }

      // Block-list check (best-effort, non-fatal on failure)
      try {
        const recipient = await storage.getUser(toUserId);
        if (recipient?.blockedUsers?.includes(userId)) {
          ack?.({ ok: false, error: "blocked" });
          return;
        }
      } catch { /* ignore */ }

      // Caller joins the call room immediately; callee will join on incoming
      await socket.join(callRoom(sessionId));

      // Stash the call's identity so rtc:end can tell missed-vs-hangup apart
      // and post a chat thread entry for the right pair of users (Task #55).
      await recordRtcInvite(
        { callerId: userId, receiverId: toUserId, callType, connected: 0 },
        sessionId,
      );

      emitToUser(toUserId, "rtc:incoming", {
        sessionId,
        toUserId,
        callType,
        context: payload.context,
        fromUserId: userId,
        fromUsername: username,
      });
      ack?.({ ok: true });
    });

    // SDP offer/answer relay — also marks both parties as call participants
    socket.on("rtc:sdp", async (payload) => {
      const toUserId = String(payload?.toUserId || "").slice(0, 64);
      const sessionId = String(payload?.sessionId || "").slice(0, 64);
      if (!toUserId || !sessionId || !payload?.sdp) return;
      if (!(await rateLimitOk(`sio:rtc:sdp:${userId}`, 30, 60))) return;
      // Ensure both sides are in the call room (callee joins on first SDP)
      await socket.join(callRoom(sessionId));
      // Task #55 — An SDP from the receiver back to the caller (i.e. an
      // "answer") is the cleanest signal that the call actually connected.
      // Mark it so the rtc:end handler can tell missed apart from hangup.
      const session = await loadRtcSession(sessionId);
      if (session && session.receiverId === userId && session.connected === 0) {
        await markRtcConnected(sessionId);
      }
      emitToUser(toUserId, "rtc:sdp", { sessionId, fromUserId: userId, sdp: payload.sdp });
    });

    socket.on("rtc:ice", async (payload) => {
      const toUserId = String(payload?.toUserId || "").slice(0, 64);
      const sessionId = String(payload?.sessionId || "").slice(0, 64);
      if (!toUserId || !sessionId || !payload?.candidate) return;
      if (!(await rateLimitOk(`sio:rtc:ice:${userId}`, 200, 60))) return;
      emitToUser(toUserId, "rtc:ice", { sessionId, fromUserId: userId, candidate: payload.candidate });
    });

    socket.on("rtc:end", async (payload) => {
      const sessionId = String(payload?.sessionId || "").slice(0, 64);
      if (!sessionId) return;
      // Optional explicit recipient — needed when caller cancels BEFORE the
      // callee has joined the per-call room (which only happens on first SDP).
      const toUserId = payload?.toUserId
        ? String(payload.toUserId).slice(0, 64)
        : "";
      const endedPayload = {
        sessionId,
        reason: payload?.reason,
        fromUserId: userId,
      };
      // Notify everyone already in the call room (the common case)
      rtcNs.to(callRoom(sessionId)).emit("rtc:ended", endedPayload);
      // Also direct-notify the explicit peer if provided (covers pre-SDP cancel
      // when the callee hasn't joined the call room yet).
      if (toUserId && toUserId !== userId) {
        emitToUser(toUserId, "rtc:ended", endedPayload);
      }
      // Vacate everyone from the room so it gets garbage-collected
      rtcNs.in(callRoom(sessionId)).socketsLeave(callRoom(sessionId));

      // Task #55 — If the call ended without ever connecting, drop a
      // "Missed call" entry into the DM thread for both participants. The
      // helper dedupes on `sessionId`, so even if the caller and callee
      // both fire rtc:end (which they often do) only one row is inserted.
      const session = await loadRtcSession(sessionId);
      if (session && session.connected === 0) {
        // `media_denied` / `sdp_failed` are technical failures that aren't
        // really "missed" from a human perspective — skip those so we don't
        // pollute the chat with infrastructure noise.
        const reason = typeof payload?.reason === "string" ? payload.reason : "";
        const skipReasons = new Set(["media_denied", "sdp_failed"]);
        if (!skipReasons.has(reason)) {
          const outcome = userId === session.receiverId ? "declined" : "missed";
          await insertMissedCallChatMessage({
            callerId: session.callerId,
            receiverId: session.receiverId,
            callType: session.callType,
            outcome,
            sessionId,
          }).catch(() => {
            // Helper already swallows storage errors; this catch keeps the
            // signaling path resilient if the DB or Redis hiccups.
          });
        }
      }
      await clearRtcSession(sessionId);
    });

    socket.on("rtc:tier", async (payload) => {
      const sessionId = String(payload?.sessionId || "").slice(0, 64);
      if (!sessionId || !payload?.tier) return;
      // A tier event is fired from inside an established call, so use it as
      // a defensive secondary signal that the call connected (Task #55).
      await markRtcConnected(sessionId);
      rtcNs.to(callRoom(sessionId)).emit("rtc:tier", {
        sessionId,
        tier: payload.tier,
        fromUserId: userId,
      });
    });
  });

  ioInstance = io;
  logger.info(`[socket.io] mounted at ${SOCKETIO_PATH} (namespaces: /chat, /rtc)`);
  return io;
}

export function getSocketIO(): IOServer | null {
  return ioInstance;
}
