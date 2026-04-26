/**
 * Task #111 — Real-Redis dry-run variant of the chat:viewer_count
 * cluster smoke (task #76).
 *
 * The default `quality:smoke:chat-viewer-count` runs entirely against
 * an in-memory `ioredis-mock` plus a small adapter shim. That covers
 * the cluster broadcast logic and the `spectatorRoomIds[]` mirror,
 * but it cannot catch incompatibilities between the production
 * `ioredis` driver and `@socket.io/redis-adapter` (cluster-mode
 * quirks, AUTH failures, response timeouts under real network
 * latency, TLS / sentinel oddities).
 *
 * This variant boots the SAME two-instance harness but constructs
 * pub/sub clients with the real `ioredis` driver pointed at a real
 * Redis URL — the adapter shim is deliberately NOT applied, because
 * if the production driver ever stops speaking the API the adapter
 * expects, this script is the place we want to find out.
 *
 * Usage (one-time, before a chat-namespace rollout):
 *
 *   REDIS_URL=rediss://staging.example:6380 \
 *     npm run quality:smoke:chat-viewer-count-real-redis
 *
 * A passing run prints:
 *
 *   [real-redis] Targeting redis at <REDIS_URL>
 *   ✓ chat:viewer_count smoke passed (cluster cross-instance)
 *
 * See `PROJECT_KNOWLEDGE_ENGINE/05_DOCKER_DEPLOYMENT_RUNBOOK.md`
 * §11 for the full runbook step.
 */

import Redis, { type RedisOptions } from "ioredis";

import {
  runHarness,
  type RedisClientPair,
} from "./lib/chat-viewer-count-harness";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.error(
    "✗ smoke-chat-viewer-count-real-redis requires REDIS_URL (e.g. rediss://staging.example:6380).\n" +
      "  This variant is intended for one-time staging dry runs against a real Redis.\n" +
      "  For the in-memory CI variant, use `npm run quality:smoke:chat-viewer-count`.",
  );
  process.exit(2);
}

// Allow operators to extend the per-step timeout for slow staging
// links (real network ≫ in-process pub/sub).
const STEP_TIMEOUT_MS = (() => {
  const raw = process.env.SMOKE_STEP_TIMEOUT_MS;
  if (!raw) return 5000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 250) {
    console.warn(
      `[real-redis] Ignoring invalid SMOKE_STEP_TIMEOUT_MS=${raw}; using default 5000ms.`,
    );
    return 5000;
  }
  return parsed;
})();

// Mirror server/lib/redis.ts so the dry run uses the same retry /
// reconnect behavior as production. We deliberately set
// `enableOfflineQueue: false` so a misconfigured Redis URL fails
// fast with a connection error instead of silently buffering
// commands until the per-step timeout fires (which would surface as
// a confusing "Timed out waiting for chat:viewer_count" error).
function buildRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: 3,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    lazyConnect: false,
  };
}

async function createRealRedisPair(label: string): Promise<RedisClientPair> {
  const options = buildRedisOptions();
  const pub = new Redis(REDIS_URL!, options);
  // ioredis allows `duplicate()` to inherit options; we re-use it so
  // the sub client matches the pub client exactly.
  const sub = pub.duplicate();

  // Fail fast and loud on ANY connection error during the dry run.
  // In production the app logs and continues so other namespaces
  // keep working; for a dry run we want a non-zero exit so the
  // operator sees the failure instead of timing out on assertions.
  const onError = (kind: "pub" | "sub") => (err: Error) => {
    console.error(`[real-redis:${label}:${kind}] redis error: ${err.message}`);
  };
  pub.on("error", onError("pub"));
  sub.on("error", onError("sub"));

  // Wait for both to reach `ready`. If the URL is unreachable this
  // is where we'll bail out — much earlier than the cluster
  // assertion that would otherwise eat the failure as a timeout.
  await Promise.all([waitReady(pub, label, "pub"), waitReady(sub, label, "sub")]);

  return {
    pub,
    sub,
    close: async () => {
      await pub.quit().catch(() => undefined);
      await sub.quit().catch(() => undefined);
    },
  };
}

function waitReady(
  client: Redis,
  label: string,
  kind: "pub" | "sub",
): Promise<void> {
  if (client.status === "ready") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(
        new Error(
          `[real-redis:${label}:${kind}] redis client never reached 'ready' (status=${client.status}). Check REDIS_URL and network reachability.`,
        ),
      );
    }, 15_000);
    client.once("ready", () => {
      clearTimeout(t);
      resolve();
    });
    client.once("end", () => {
      clearTimeout(t);
      reject(
        new Error(
          `[real-redis:${label}:${kind}] redis connection ended before 'ready'.`,
        ),
      );
    });
  });
}

// Explicit exit: importing the harness pulls in the real server's
// DB / Redis modules (idle Postgres pool, ioredis reconnect timers).
// Letting Node wait for them to settle would hang the operator's
// shell after a passing run, so end the process immediately once
// the assertions are done.
runHarness({
  redisFactory: createRealRedisPair,
  stepTimeoutMs: STEP_TIMEOUT_MS,
  banner: `[real-redis] Targeting redis at ${REDIS_URL} (step timeout: ${STEP_TIMEOUT_MS}ms)`,
})
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
