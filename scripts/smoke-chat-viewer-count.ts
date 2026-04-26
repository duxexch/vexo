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
 * NOTE: The cluster harness, the Socket.IO event mirror, and the
 * end-to-end assertion sequence live in
 * `scripts/lib/chat-viewer-count-harness.ts` so the staging dry-run
 * variant (`scripts/smoke-chat-viewer-count-real-redis.ts`, task #111)
 * runs the EXACT same contract against a real Redis URL — only the
 * pub/sub client construction differs.
 */

import RedisMock from "ioredis-mock";

import { runHarness, type RedisClientPair } from "./lib/chat-viewer-count-harness";

// ---- ioredis-mock ↔ redis-adapter shim ---------------------------------

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
 * without standing up a real Redis instance. The staging dry-run
 * variant (`smoke-chat-viewer-count-real-redis.ts`) deliberately
 * SKIPS this shim — it talks to real ioredis, which already speaks
 * both APIs natively. That is the point of the dry run: it catches
 * any mismatch between the production driver and the adapter that
 * the mock would mask.
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

async function createMockRedisPair(): Promise<RedisClientPair> {
  // ioredis-mock instances share a single in-memory pub/sub bus, so
  // two server processes get the same cross-instance behavior the
  // real Redis adapter provides — perfect for cluster smoke.
  const pub = new RedisMock();
  const sub = pub.duplicate();
  patchMockForRedisAdapter(pub as unknown as AnyMock);
  patchMockForRedisAdapter(sub as unknown as AnyMock);
  return {
    pub,
    sub,
    close: async () => {
      await pub.quit().catch(() => undefined);
      await sub.quit().catch(() => undefined);
    },
  };
}

// Explicit exit: importing `broadcastChallengeViewerCount` (via the
// shared harness) pulls in the real server's DB / Redis modules,
// which hold long-lived handles (idle Postgres pool, ioredis
// reconnect timers). Letting Node wait for them to settle would
// hang CI gates after a passing run, so end the process immediately
// once the assertions are done.
runHarness({ redisFactory: createMockRedisPair })
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
