/**
 * Task #76 — Verify viewer-count stays accurate across multiple servers.
 *
 * The production deployment runs more than one Node process behind
 * Traefik, with all instances joined into a single Socket.IO cluster
 * via the `@socket.io/redis-adapter`. Task #26's `chat:viewer_count`
 * is computed from `socket.data.spectatorRoomIds` (an array, NOT a
 * Map) precisely so it survives the JSON serialization that
 * `fetchSockets()` does when crossing nodes. Without an automated
 * check, a future refactor could silently re-introduce a Map-only
 * code path that breaks the count for any cluster deployment.
 *
 * This smoke spins up TWO independent Socket.IO server instances
 * sharing a single (in-memory) Redis pub/sub bus, mirrors the actual
 * `chat:join` / `chat:leave` / `disconnecting` lifecycle from
 * `server/socketio/index.ts`, and drives it with real
 * `socket.io-client` connections. It uses the production
 * `broadcastChallengeViewerCount` helper directly, so the contract
 * under test is the real implementation — not a re-rolled copy.
 *
 * Why a smoke instead of vitest: this matches the existing
 * `quality:smoke:*` pattern (see `scripts/smoke-room-notifications.ts`)
 * and keeps the test runnable from `verify:fast` /
 * `quality:gate:phase-e` with no extra tooling.
 *
 * Assertions exercised:
 *   1. count = 0 with no spectators present
 *   2. count = 1 after one spectator joins (instance #1)
 *   3. count = 2 after a second spectator joins on a DIFFERENT
 *      instance (#2) — proves the cluster path works
 *   4. count = 1 after one spectator leaves
 *   5. count = 0 after both spectators disconnect
 *   6. The PLAYER socket is never counted, even when in the room
 */

import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as IOServer, type Namespace, type Socket } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { createAdapter } from "@socket.io/redis-adapter";
import RedisMock from "ioredis-mock";

import { broadcastChallengeViewerCount } from "../server/socketio/challenge-chat-bridge";
import { SOCKETIO_NS_CHAT } from "../shared/socketio-events";
import { createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers(
  "ChatViewerCountSmokeError",
);

const ROOM_ID = "challenge:smoke-viewer-count";
const STEP_TIMEOUT_MS = 2000;

// ---- Spin up one Socket.IO instance with a shared mock-Redis adapter ----

interface Instance {
  io: IOServer;
  http: HttpServer;
  port: number;
  chatNs: Namespace;
  close: () => Promise<void>;
}

type EventEmitterLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => boolean;
};

type AnyMock = EventEmitterLike & {
  send_command?: (
    cmd: string,
    args: unknown[],
    cb: (err: Error | null, res?: unknown) => void,
  ) => void;
  __viewerCountSmokePatched?: boolean;
  [k: string]: unknown;
};

/**
 * `@socket.io/redis-adapter` v8 expects two ioredis behaviors that
 * `ioredis-mock` does not implement out of the box:
 *
 *   1. The legacy `send_command(cmd, args, cb)` callback API — used
 *      by `serverCount()` to call `PUBSUB NUMSUB`. ioredis v5 ships
 *      this as a deprecated alias; ioredis-mock omits it entirely.
 *   2. `messageBuffer` / `pmessageBuffer` events with Buffer payloads.
 *      ioredis-mock only emits the string variants (`message`,
 *      `pmessage`), so the adapter never sees inbound requests.
 *
 * Both are bridged here so we can run a faithful cluster smoke
 * without standing up a real Redis instance.
 */
function patchMockForRedisAdapter(client: AnyMock): void {
  if (client.__viewerCountSmokePatched) return;
  client.__viewerCountSmokePatched = true;

  if (typeof client.send_command !== "function") {
    client.send_command = function (
      this: AnyMock,
      cmd: string,
      args: unknown[],
      cb: (err: Error | null, res?: unknown) => void,
    ): void {
      const method = cmd.toLowerCase();
      const fn = this[method];
      if (typeof fn !== "function") {
        cb(new Error(`ioredis-mock shim: unsupported command ${cmd}`));
        return;
      }
      Promise.resolve((fn as (...a: unknown[]) => unknown).apply(this, args))
        .then((res) => cb(null, res))
        .catch((err: Error) => cb(err));
    };
  }

  client.on("message", (channel: unknown, message: unknown) => {
    client.emit(
      "messageBuffer",
      Buffer.from(String(channel)),
      Buffer.from(String(message)),
    );
  });
  client.on("pmessage", (pattern: unknown, channel: unknown, message: unknown) => {
    client.emit(
      "pmessageBuffer",
      Buffer.from(String(pattern)),
      Buffer.from(String(channel)),
      Buffer.from(String(message)),
    );
  });
}

async function bootInstance(label: string): Promise<Instance> {
  const http: HttpServer = createServer();
  const io = new IOServer(http, {
    // Quiet the default 60s ping window so a hung test fails fast.
    pingTimeout: 1000,
    pingInterval: 500,
  });

  // ioredis-mock instances share a single in-memory pub/sub bus, so
  // two server processes get the same cross-instance behavior the real
  // Redis adapter provides — perfect for cluster smoke.
  const pub = new RedisMock();
  const sub = pub.duplicate();
  // `@socket.io/redis-adapter` v8 invokes the legacy ioredis
  // `send_command(cmd, args, cb)` API for `PUBSUB NUMSUB` (used by
  // `fetchSockets`). Real ioredis v5 exposes that alias; ioredis-mock
  // does not. Shim it onto each mock client by routing to the matching
  // top-level method (e.g. `pubsub('NUMSUB', channel)`), preserving the
  // node-style callback contract the adapter expects.
  patchMockForRedisAdapter(pub as unknown as AnyMock);
  patchMockForRedisAdapter(sub as unknown as AnyMock);
  io.adapter(createAdapter(pub, sub));

  const chatNs = io.of(SOCKETIO_NS_CHAT);

  // Stand-in auth: stamp `userId` from the handshake. The real server
  // verifies a JWT here; we are testing the presence-mirror plumbing,
  // not the auth gate.
  chatNs.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (typeof userId !== "string" || !userId) {
      return next(new Error("missing userId"));
    }
    (socket.data as { userId?: string }).userId = userId;
    next();
  });

  chatNs.on("connection", (socket: Socket) => {
    socket.on(
      "chat:join",
      async (
        payload: { roomId: string; role?: "player" | "spectator" },
        ack?: (ok: boolean) => void,
      ) => {
        const roomId = String(payload?.roomId || "");
        if (!roomId) {
          ack?.(false);
          return;
        }
        // Smoke role is supplied by the client. Production derives the
        // role from `isUserAllowedInRoom`, but the cluster-counting
        // path only cares about how `spectatorRoomIds` is mutated.
        const role = payload?.role === "player" ? "player" : "spectator";
        await socket.join(roomId);
        const data = socket.data as {
          spectatorRoomIds?: string[];
        };
        if (role === "spectator") {
          if (!data.spectatorRoomIds) data.spectatorRoomIds = [];
          if (!data.spectatorRoomIds.includes(roomId)) {
            data.spectatorRoomIds.push(roomId);
          }
        } else if (data.spectatorRoomIds) {
          data.spectatorRoomIds = data.spectatorRoomIds.filter(
            (r) => r !== roomId,
          );
        }
        ack?.(true);
        // Use the production helper — this is the contract under test.
        try {
          await broadcastChallengeViewerCount(
            chatNs as unknown as Parameters<
              typeof broadcastChallengeViewerCount
            >[0],
            roomId,
          );
          if (process.env.SMOKE_DEBUG) {
            console.log(`[${label}] broadcast done after ${role} join`);
          }
        } catch (err) {
          console.error(
            `[${label}] broadcastChallengeViewerCount threw:`,
            err,
          );
        }
      },
    );

    socket.on(
      "chat:leave",
      async (payload: { roomId: string }) => {
        const roomId = String(payload?.roomId || "");
        if (!roomId) return;
        await socket.leave(roomId);
        const data = socket.data as { spectatorRoomIds?: string[] };
        if (data.spectatorRoomIds) {
          data.spectatorRoomIds = data.spectatorRoomIds.filter(
            (r) => r !== roomId,
          );
        }
        void broadcastChallengeViewerCount(
          chatNs as unknown as Parameters<
            typeof broadcastChallengeViewerCount
          >[0],
          roomId,
        );
      },
    );

    socket.on("disconnecting", () => {
      const data = socket.data as { spectatorRoomIds?: string[] };
      const rooms = data.spectatorRoomIds ? [...data.spectatorRoomIds] : [];
      if (rooms.length === 0) return;
      // Mirror the production handler: defer to next tick so socket.io
      // has actually pulled the socket out of the room before we count.
      setImmediate(() => {
        for (const roomId of rooms) {
          void broadcastChallengeViewerCount(
            chatNs as unknown as Parameters<
              typeof broadcastChallengeViewerCount
            >[0],
            roomId,
          );
        }
      });
    });
  });

  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const addr = http.address() as AddressInfo;

  return {
    io,
    http,
    port: addr.port,
    chatNs,
    label, // kept for log clarity if we ever add diagnostics
    close: async () => {
      io.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await pub.quit().catch(() => undefined);
      await sub.quit().catch(() => undefined);
    },
  } as Instance & { label: string };
}

// ---- Client helper: a queue-aware viewer_count listener ----
//
// The Redis adapter delivers messages asynchronously, so a single
// "wait for next emit" is racy if multiple emits arrive between
// awaits. We capture every emit into a queue and let the test pull
// them in order.
function attachClient(opts: {
  port: number;
  userId: string;
  signal: { current: boolean };
}): {
  client: ClientSocket;
  next: (predicate: (count: number) => boolean) => Promise<number>;
  events: Array<{ roomId: string; count: number }>;
} {
  const events: Array<{ roomId: string; count: number }> = [];
  const waiters: Array<{
    predicate: (count: number) => boolean;
    resolve: (n: number) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  const client = ioClient(`http://127.0.0.1:${opts.port}/chat`, {
    auth: { userId: opts.userId },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });

  client.on(
    "chat:viewer_count",
    (payload: { roomId: string; count: number }) => {
      events.push(payload);
      if (payload.roomId !== ROOM_ID) return;
      // Match the FIRST waiter whose predicate passes, FIFO.
      for (let i = 0; i < waiters.length; i++) {
        const w = waiters[i];
        if (w.predicate(payload.count)) {
          waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.resolve(payload.count);
          return;
        }
      }
    },
  );

  return {
    client,
    events,
    next: (predicate) =>
      new Promise<number>((resolve, reject) => {
        // Drain queued events first so order matters.
        for (let i = events.length - 1; i >= 0; i--) {
          const e = events[i];
          if (e.roomId === ROOM_ID && predicate(e.count)) {
            // Remove the matched event so a later assertion that
            // demands a NEW value doesn't trip on the cached one.
            events.splice(i, 1);
            resolve(e.count);
            return;
          }
        }
        const entry = {
          predicate,
          resolve,
          reject,
          timer: null as NodeJS.Timeout | null,
        };
        entry.timer = setTimeout(() => {
          // Drop the timed-out waiter so it can never match a late
          // event after teardown — prevents stale-state leaks during
          // failure paths.
          const idx = waiters.indexOf(entry);
          if (idx !== -1) waiters.splice(idx, 1);
          if (opts.signal.current) {
            reject(new Error("teardown signaled"));
          } else {
            reject(
              new Error(
                `Timed out waiting for chat:viewer_count matching predicate (last 5 events: ${JSON.stringify(events.slice(-5))})`,
              ),
            );
          }
        }, STEP_TIMEOUT_MS);
        waiters.push(entry);
      }),
  };
}

function joinRoom(
  c: ClientSocket,
  role: "player" | "spectator",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("chat:join ack timed out")),
      STEP_TIMEOUT_MS,
    );
    c.emit("chat:join", { roomId: ROOM_ID, role }, (ok: boolean) => {
      clearTimeout(t);
      if (!ok) return reject(new Error("chat:join ack returned false"));
      resolve();
    });
  });
}

function leaveRoom(c: ClientSocket): void {
  c.emit("chat:leave", { roomId: ROOM_ID });
}

function waitConnect(c: ClientSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (c.connected) return resolve();
    const t = setTimeout(
      () => reject(new Error("client connect timed out")),
      STEP_TIMEOUT_MS,
    );
    c.once("connect", () => {
      clearTimeout(t);
      resolve();
    });
    c.once("connect_error", (err) => {
      clearTimeout(t);
      reject(new Error(`client connect_error: ${err.message}`));
    });
  });
}

function waitDisconnect(c: ClientSocket): Promise<void> {
  return new Promise<void>((resolve) => {
    if (c.disconnected) return resolve();
    c.once("disconnect", () => resolve());
    c.disconnect();
  });
}

// ---- Test driver ----

async function main(): Promise<void> {
  const teardown = { current: false };
  const instA = await bootInstance("A");
  const instB = await bootInstance("B");

  // Three clients:
  //   - player connects to instance A (must NOT be counted)
  //   - spectatorA connects to instance A
  //   - spectatorB connects to instance B (cross-instance — the
  //     scenario that would silently break with a Map-only mirror)
  // Each client subscribes to chat:viewer_count for the same room.
  const player = attachClient({
    port: instA.port,
    userId: "player-1",
    signal: teardown,
  });
  const specA = attachClient({
    port: instA.port,
    userId: "spectator-A",
    signal: teardown,
  });
  const specB = attachClient({
    port: instB.port,
    userId: "spectator-B",
    signal: teardown,
  });

  try {
    await Promise.all([
      waitConnect(player.client),
      waitConnect(specA.client),
      waitConnect(specB.client),
    ]);

    // ---- Step 1: player joins as PLAYER. count must stay 0. ----
    await joinRoom(player.client, "player");
    const playerJoinCount = await player.next(() => true);
    assertCondition(
      playerJoinCount === 0,
      `Player join must broadcast count=0, got ${playerJoinCount}`,
    );

    // ---- Step 2: spectator A joins on instance A. count = 1. ----
    await joinRoom(specA.client, "spectator");
    const afterA = await Promise.all([
      player.next((c) => c === 1),
      specA.next((c) => c === 1),
    ]);
    assertCondition(
      afterA.every((c) => c === 1),
      `Expected all sockets to see count=1 after first spectator joined, got ${JSON.stringify(afterA)}`,
    );

    // ---- Step 3: spectator B joins on instance B (cross-cluster).
    //              Every recipient — including specB on the OTHER
    //              instance — must see count=2. This is the load-
    //              bearing assertion of the whole smoke. ----
    await joinRoom(specB.client, "spectator");
    const afterB = await Promise.all([
      player.next((c) => c === 2),
      specA.next((c) => c === 2),
      specB.next((c) => c === 2),
    ]);
    assertCondition(
      afterB.every((c) => c === 2),
      `Cross-instance count broke: expected count=2 everywhere after second spectator joined on a DIFFERENT server, got ${JSON.stringify(afterB)}`,
    );

    // ---- Step 4: spectator A leaves. count drops to 1 cluster-wide. ----
    leaveRoom(specA.client);
    const afterLeave = await Promise.all([
      player.next((c) => c === 1),
      specB.next((c) => c === 1),
    ]);
    assertCondition(
      afterLeave.every((c) => c === 1),
      `Expected count=1 after spectator A left, got ${JSON.stringify(afterLeave)}`,
    );

    // ---- Step 5: spectator B disconnects abruptly (no chat:leave).
    //              Production relies on the `disconnecting` handler
    //              snapshotting `spectatorRoomIds` BEFORE the socket
    //              leaves; verify count drops to 0. ----
    await waitDisconnect(specB.client);
    const afterDisc = await player.next((c) => c === 0);
    assertCondition(
      afterDisc === 0,
      `Expected count=0 after spectator B disconnected, got ${afterDisc}`,
    );

    console.log("✓ chat:viewer_count smoke passed (cluster cross-instance)");
  } finally {
    teardown.current = true;
    player.client.disconnect();
    specA.client.disconnect();
    specB.client.disconnect();
    await instA.close();
    await instB.close();
  }
}

// Explicit exit: importing `broadcastChallengeViewerCount` pulls in the
// real server's DB / Redis modules, which hold long-lived handles
// (idle Postgres pool, ioredis reconnect timers). Letting Node wait for
// them to settle would hang CI gates after a passing run, so end the
// process immediately once the assertions are done.
main()
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error(`✗ ${err.name}: ${err.message}`);
    if ((err as { details?: unknown }).details) {
      console.error(
        JSON.stringify((err as { details?: unknown }).details, null, 2),
      );
    }
    process.exit(1);
  });
