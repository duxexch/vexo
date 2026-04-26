/**
 * Shared harness for the `chat:viewer_count` cluster smoke (task #76).
 *
 * Two scripts depend on this module:
 *   - `scripts/smoke-chat-viewer-count.ts`         — fast in-CI variant
 *     that uses `ioredis-mock` plus a small adapter shim so it can run
 *     anywhere with no external dependencies.
 *   - `scripts/smoke-chat-viewer-count-real-redis.ts` — staging dry-run
 *     variant that targets a real Redis (production driver, real
 *     network) to catch incompatibilities the mock cannot reproduce
 *     (cluster-mode quirks, AUTH failures, response timeouts under
 *     real network latency). See task #111.
 *
 * The mock and real-Redis paths differ ONLY in how they construct
 * the pub/sub clients; everything else (the two-instance Socket.IO
 * harness, the `chat:join` / `chat:leave` / `disconnecting` mirror,
 * the production `broadcastChallengeViewerCount` call, and the
 * cluster cross-instance assertion sequence) is identical. Sharing
 * one harness guarantees both scripts exercise the exact same
 * contract.
 */

import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as IOServer, type Namespace, type Socket } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { createAdapter } from "@socket.io/redis-adapter";

import { broadcastChallengeViewerCount } from "../../server/socketio/challenge-chat-bridge";
import { SOCKETIO_NS_CHAT } from "../../shared/socketio-events";
import { createErrorHelpers } from "./smoke-helpers";

const { assertCondition } = createErrorHelpers("ChatViewerCountSmokeError");

/** Single room used across both spectators and the player. */
export const ROOM_ID = "challenge:smoke-viewer-count";

/**
 * Per-step timeout. The in-memory variant typically completes each
 * step in <50 ms; the real-Redis variant is given more headroom via
 * the optional `stepTimeoutMs` overrides on `bootHarness` /
 * `attachClient` so transient network blips on staging Redis don't
 * fail the smoke for the wrong reason.
 */
export const DEFAULT_STEP_TIMEOUT_MS = 2000;

/**
 * The redis-adapter requires two clients (one for publish, one for
 * subscribe) plus a way to close them at teardown. The factory
 * returns a fresh pair per Socket.IO instance so each "node" has its
 * own connections, mirroring how the production cluster is wired.
 */
export interface RedisClientPair {
  pub: unknown;
  sub: unknown;
  close: () => Promise<void>;
}

export type RedisClientFactory = (label: string) => Promise<RedisClientPair>;

export interface Instance {
  io: IOServer;
  http: HttpServer;
  port: number;
  chatNs: Namespace;
  label: string;
  close: () => Promise<void>;
}

interface BootInstanceOptions {
  label: string;
  redisFactory: RedisClientFactory;
}

async function bootInstance(opts: BootInstanceOptions): Promise<Instance> {
  const { label, redisFactory } = opts;
  const http: HttpServer = createServer();
  const io = new IOServer(http, {
    // Quiet the default 60s ping window so a hung test fails fast.
    pingTimeout: 1000,
    pingInterval: 500,
  });

  const { pub, sub, close: closeRedis } = await redisFactory(label);
  // The adapter signature is parametric over the redis client type;
  // the real ioredis client and the patched mock both satisfy it,
  // but a shared harness has to launder the type once.
  io.adapter(
    createAdapter(
      pub as Parameters<typeof createAdapter>[0],
      sub as Parameters<typeof createAdapter>[1],
    ),
  );

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
        // Smoke role is supplied by the client. Production derives
        // the role from `isUserAllowedInRoom`, but the cluster-
        // counting path only cares about how `spectatorRoomIds` is
        // mutated.
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

    socket.on("chat:leave", async (payload: { roomId: string }) => {
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
    });

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
    label,
    close: async () => {
      io.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await closeRedis();
    },
  };
}

interface AttachClientOptions {
  port: number;
  userId: string;
  signal: { current: boolean };
  stepTimeoutMs?: number;
}

interface ClientHandle {
  client: ClientSocket;
  next: (predicate: (count: number) => boolean) => Promise<number>;
  events: Array<{ roomId: string; count: number }>;
}

/**
 * Queue-aware listener for `chat:viewer_count`.
 *
 * The Redis adapter delivers messages asynchronously, so a single
 * "wait for next emit" is racy if multiple emits arrive between
 * awaits. We capture every emit into a queue and let the test pull
 * them in order.
 */
function attachClient(opts: AttachClientOptions): ClientHandle {
  const stepTimeoutMs = opts.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
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
        }, stepTimeoutMs);
        waiters.push(entry);
      }),
  };
}

function joinRoom(
  c: ClientSocket,
  role: "player" | "spectator",
  stepTimeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("chat:join ack timed out")),
      stepTimeoutMs,
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

function waitConnect(c: ClientSocket, stepTimeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (c.connected) return resolve();
    const t = setTimeout(
      () => reject(new Error("client connect timed out")),
      stepTimeoutMs,
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

export interface RunHarnessOptions {
  /**
   * Pub/sub client factory invoked once per Socket.IO instance.
   * Mock variant returns ioredis-mock clients with the adapter shim
   * applied; real-Redis variant returns plain ioredis clients pointed
   * at `REDIS_URL`.
   */
  redisFactory: RedisClientFactory;
  /**
   * Per-step timeout. Real-Redis runs may legitimately need more
   * headroom than the in-memory variant.
   */
  stepTimeoutMs?: number;
  /**
   * Optional banner printed before the assertions run, e.g. the URL
   * being targeted. Helps the operator confirm a staging dry run is
   * actually pointed at staging.
   */
  banner?: string;
}

/**
 * Boot two Socket.IO instances sharing the supplied Redis pair, then
 * walk the chat:viewer_count assertion sequence end-to-end. Throws
 * on any failure; the caller is responsible for `process.exit`.
 */
export async function runHarness(opts: RunHarnessOptions): Promise<void> {
  const stepTimeoutMs = opts.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  if (opts.banner) console.log(opts.banner);

  const teardown = { current: false };
  const instA = await bootInstance({
    label: "A",
    redisFactory: opts.redisFactory,
  });
  const instB = await bootInstance({
    label: "B",
    redisFactory: opts.redisFactory,
  });

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
    stepTimeoutMs,
  });
  const specA = attachClient({
    port: instA.port,
    userId: "spectator-A",
    signal: teardown,
    stepTimeoutMs,
  });
  const specB = attachClient({
    port: instB.port,
    userId: "spectator-B",
    signal: teardown,
    stepTimeoutMs,
  });

  try {
    await Promise.all([
      waitConnect(player.client, stepTimeoutMs),
      waitConnect(specA.client, stepTimeoutMs),
      waitConnect(specB.client, stepTimeoutMs),
    ]);

    // ---- Step 0: baseline. With nobody in the room yet, an out-of-
    //              band broadcast must report count=0. We trigger
    //              it from the player's socket (which is in the room
    //              because the next step will join it) by invoking
    //              the production helper directly against instance A
    //              — the assertion proves the helper handles the
    //              empty-room case cleanly before any spectators
    //              exist. ----
    await joinRoom(player.client, "player", stepTimeoutMs);
    const playerJoinCount = await player.next(() => true);
    assertCondition(
      playerJoinCount === 0,
      `Baseline: player join must broadcast count=0, got ${playerJoinCount}`,
    );
    // Re-trigger the helper explicitly so we get a second 0 emission
    // that proves the count is genuinely re-derivable from cluster
    // state — not just a coincidence of the initial join broadcast.
    await broadcastChallengeViewerCount(
      instA.chatNs as unknown as Parameters<
        typeof broadcastChallengeViewerCount
      >[0],
      ROOM_ID,
    );
    const baseline = await player.next((c) => c === 0);
    assertCondition(
      baseline === 0,
      `Baseline: empty-room rebroadcast must report count=0, got ${baseline}`,
    );

    // ---- Step 2: spectator A joins on instance A. count = 1. ----
    await joinRoom(specA.client, "spectator", stepTimeoutMs);
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
    await joinRoom(specB.client, "spectator", stepTimeoutMs);
    const afterB = await Promise.all([
      player.next((c) => c === 2),
      specA.next((c) => c === 2),
      specB.next((c) => c === 2),
    ]);
    assertCondition(
      afterB.every((c) => c === 2),
      `Cross-instance count broke: expected count=2 everywhere after second spectator joined on a DIFFERENT server, got ${JSON.stringify(afterB)}`,
    );

    // ---- Step 4: spectator A leaves. count drops to 1 cluster-
    //              wide. ----
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
