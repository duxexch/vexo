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
import { challenges } from "../../shared/schema";
import { eq } from "drizzle-orm";

interface AuthedSocketData {
  userId: string;
  username: string;
  // Per-room role stamped at chat:join time. Used by chat:send to enforce
  // read-only access for spectators (Task #10). Map keyed by roomId.
  roomRoles?: Map<string, "player" | "spectator">;
}

type RoomAuthzResult =
  | { allowed: true; role: "player" | "spectator" }
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
 *   - `dm:<idA>:<idB>`         — user must be A or B (sorted lexicographically)
 *
 * Failures (DB error, missing row) deny — fail-closed.
 */
async function isUserAllowedInRoom(userId: string, roomId: string): Promise<RoomAuthzResult> {
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
      // Capacity (maxSpectators) is intentionally NOT enforced here — that
      // limit governs the legacy spectate stream; the realtime channel only
      // delivers chat to users who already secured a spectate slot.
      if (row.visibility === "private" && row.friendAccountId !== userId) {
        return { allowed: false };
      }
      const config = await storage.getChallengeSettings(row.gameType);
      if (!config.allowSpectators) return { allowed: false };
      return { allowed: true, role: "spectator" };
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
  const chatNs = io.of(SOCKETIO_NS_CHAT);

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
      await socket.join(roomId);
      // Stamp this socket's role for the room so chat:send can enforce
      // read-only access for spectators.
      if (!socket.data.roomRoles) socket.data.roomRoles = new Map();
      socket.data.roomRoles.set(roomId, authz.role);
      const room = chatNs.adapter.rooms.get(roomId);
      socket.emit("chat:joined", { roomId, members: room?.size || 1 });
      ack?.(true);
    });

    socket.on("chat:leave", async (payload) => {
      const roomId = String(payload?.roomId || "").slice(0, 128);
      if (roomId) {
        await socket.leave(roomId);
        socket.data.roomRoles?.delete(roomId);
      }
    });

    socket.on("chat:send", async (payload, ack) => {
      const roomId = String(payload?.roomId || "").slice(0, 128);
      const text = String(payload?.text || "").slice(0, 500).trim();
      const clientMsgId = payload?.clientMsgId ? String(payload.clientMsgId).slice(0, 64) : undefined;

      if (!roomId || !text) {
        ack?.({ ok: false, error: "invalid" });
        return;
      }

      if (!socket.rooms.has(roomId)) {
        ack?.({ ok: false, error: "not_in_room" });
        return;
      }

      // Task #10: spectators are read-only on the realtime channel.
      // They may join/listen for chat:message events but must not send.
      const role = socket.data.roomRoles?.get(roomId);
      if (role !== "player") {
        socket.emit("chat:error", { code: "spectator_readonly", message: "Spectators cannot send chat" });
        ack?.({ ok: false, error: "spectator_readonly" });
        return;
      }

      if (!(await rateLimitOk(`sio:chat:send:${userId}`, 30, 10))) {
        socket.emit("chat:error", { code: "rate_limit", message: "Slow down" });
        ack?.({ ok: false, error: "rate_limit" });
        return;
      }

      const broadcast: ChatBroadcast = {
        roomId,
        fromUserId: userId,
        fromUsername: socket.data.username,
        text,
        ts: Date.now(),
        clientMsgId,
      };
      chatNs.to(roomId).emit("chat:message", broadcast);
      ack?.({ ok: true });
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
    });

    socket.on("rtc:tier", (payload) => {
      const sessionId = String(payload?.sessionId || "").slice(0, 64);
      if (!sessionId || !payload?.tier) return;
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
