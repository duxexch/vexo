import Redis from "ioredis";
import { logger } from "./logger";

// Hostnames that only resolve inside the production docker network.
// In development we transparently fall back to localhost so devs can run the
// platform outside docker without editing env vars.
const DOCKER_INTERNAL_REDIS_HOSTS = new Set(["vex-redis", "redis"]);

function resolveRedisUrl(): string {
  const raw = (process.env.REDIS_URL ?? "").trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!raw) {
    if (isProduction) {
      throw new Error(
        "[Redis] REDIS_URL is required in production but is not set. " +
          "Cache, pub/sub and distributed rate limiting are unavailable.",
      );
    }
    return "redis://localhost:6379";
  }

  if (!isProduction) {
    try {
      const parsed = new URL(raw);
      if (DOCKER_INTERNAL_REDIS_HOSTS.has(parsed.hostname)) {
        parsed.hostname = "127.0.0.1";
        const swapped = parsed.toString();
        logger.warn(
          `[Redis] Dev override: configured host points at docker-internal '${parsed.hostname}'; ` +
            `using ${swapped} for local development. Set REDIS_URL explicitly to silence this.`,
        );
        return swapped;
      }
    } catch {
      // Not a parseable URL — let ioredis raise its own clear error.
    }
  }

  return raw;
}

// Redis client for caching, sessions, and rate limiting
const REDIS_URL = resolveRedisUrl();

let redis: Redis | null = null;
let redisSub: Redis | null = null;
let redisPub: Redis | null = null;

function createRedisConnection(name: string): Redis {
  const isProd = process.env.NODE_ENV === "production";
  const LOG_THROTTLE_MS = 60_000;
  // Shared throttle map for all log streams emitted by this client (errors and
  // "Closed" notices). Keys are namespaced by stream name so different events
  // don't interfere.
  const logThrottle = new Map<string, { lastLoggedAt: number; suppressed: number }>();

  function shouldLogThrottled(streamKey: string): { log: boolean; suppressed: number } {
    const now = Date.now();
    const state = logThrottle.get(streamKey);
    if (state && now - state.lastLoggedAt < LOG_THROTTLE_MS) {
      state.suppressed += 1;
      return { log: false, suppressed: 0 };
    }
    const suppressedSinceLast = state?.suppressed ?? 0;
    logThrottle.set(streamKey, { lastLoggedAt: now, suppressed: 0 });
    return { log: true, suppressed: suppressedSinceLast };
  }

  const client = new Redis(REDIS_URL, {
    // In production we want fail-fast (commands reject after 3 retries so callers
    // can fall back). In development a missing local redis would otherwise emit
    // an unbounded stream of FATAL "Unhandled Rejection: MaxRetriesPerRequestError"
    // until the operator starts redis. `null` keeps commands queued instead, so
    // they simply succeed once redis comes up — no FATAL log spam.
    maxRetriesPerRequest: isProd ? 3 : null,
    retryStrategy(times) {
      // In production give up after 10 attempts so callers see a hard error and
      // health checks fail loudly. In development we keep retrying forever (with
      // a 5s ceiling) so a developer can start redis at any time and the app
      // recovers without restart, and we don't leak "Connection is closed"
      // Unhandled Rejections from the in-flight queue.
      if (isProd && times > 10) {
        logger.error(`[Redis:${name}] Max retries reached, giving up`);
        return null;
      }
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(err) {
      return ["READONLY", "ECONNRESET", "ETIMEDOUT"].some((e) => err.message.includes(e));
    },
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: 10000,
  });

  client.on("connect", () => {
    logger.info(`[Redis:${name}] Connected`);
    logThrottle.clear();
  });

  // Throttle "Error" lines so a redis outage doesn't spam thousands of
  // identical ECONNREFUSED entries every second.
  client.on("error", (err) => {
    const message = err.message || "unknown";
    const decision = shouldLogThrottled(`error:${message}`);
    if (!decision.log) return;
    const suffix = decision.suppressed > 0
      ? ` (suppressed ${decision.suppressed} similar errors in the last ${Math.floor(LOG_THROTTLE_MS / 1000)}s)`
      : "";
    logger.error(`[Redis:${name}] Error${suffix}`, new Error(message));
  });

  // Same for "Closed" — when a redis isn't available these can fire on every
  // reconnect attempt.
  client.on("close", () => {
    const decision = shouldLogThrottled("closed");
    if (!decision.log) return;
    const suffix = decision.suppressed > 0
      ? ` (suppressed ${decision.suppressed} similar close events in the last ${Math.floor(LOG_THROTTLE_MS / 1000)}s)`
      : "";
    logger.warn(`[Redis:${name}] Closed${suffix}`);
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!redis) redis = createRedisConnection('main');
  return redis;
}

/** Dedicated pub client (never enters subscriber mode) */
export function getRedisPub(): Redis {
  if (!redisPub) redisPub = createRedisConnection('pub');
  return redisPub;
}

/** Dedicated sub client (enters subscriber mode) */
export function getRedisSub(): Redis {
  if (!redisSub) redisSub = createRedisConnection('sub');
  return redisSub;
}

/**
 * Gracefully close any Redis connections that were initialized in this process.
 * Useful for standalone scripts/tests to avoid hanging Node handles.
 */
export async function closeRedisConnections(): Promise<void> {
  const clients = [redisSub, redisPub, redis].filter(Boolean) as Redis[];

  for (const client of clients) {
    try {
      if (client.status !== "end") {
        await client.quit();
      }
    } catch {
      try {
        client.disconnect();
      } catch {
        // no-op: best-effort shutdown for script termination
      }
    }
  }

  redis = null;
  redisPub = null;
  redisSub = null;
  subInitialized = false;
  subscriptionHandlers.clear();
}

// ==================== PUB/SUB SYSTEM ====================

type MessageHandler = (channel: string, message: string) => void;
const subscriptionHandlers = new Map<string, Set<MessageHandler>>();
let subInitialized = false;

function initSubscriber() {
  if (subInitialized) return;
  subInitialized = true;
  const sub = getRedisSub();
  sub.on('message', (channel: string, message: string) => {
    const handlers = subscriptionHandlers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(channel, message); } catch (e) {
          logger.error('[Redis:pub/sub] Handler error', e instanceof Error ? e : new Error(String(e)));
        }
      }
    }
  });
}

/** Subscribe to a Redis pub/sub channel */
export function subscribe(channel: string, handler: MessageHandler): void {
  initSubscriber();
  if (!subscriptionHandlers.has(channel)) {
    subscriptionHandlers.set(channel, new Set());
    getRedisSub().subscribe(channel).catch(err => {
      logger.error(`[Redis] Subscribe error for ${channel}`, err instanceof Error ? err : new Error(String(err)));
    });
  }
  subscriptionHandlers.get(channel)!.add(handler);
}

/** Unsubscribe a handler from a channel */
export function unsubscribe(channel: string, handler: MessageHandler): void {
  const handlers = subscriptionHandlers.get(channel);
  if (handlers) {
    handlers.delete(handler);
    if (handlers.size === 0) {
      subscriptionHandlers.delete(channel);
      getRedisSub().unsubscribe(channel).catch(() => { });
    }
  }
}

/** Publish a message to a Redis pub/sub channel */
export async function publish(channel: string, data: Record<string, unknown> | string): Promise<void> {
  try {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    await getRedisPub().publish(channel, message);
  } catch (err: unknown) {
    logger.warn('[Redis] Publish error', { channel, error: err instanceof Error ? err.message : String(err) });
  }
}

// ==================== USER CACHE (block/mute lists) ====================

interface UserCacheEntry {
  blockedUsers: string[];
  mutedUsers: string[];
  notificationMutedUsers: string[];
  fetchedAt: number;
}

export interface UserBlockLists {
  blockedUsers: string[];
  mutedUsers: string[];
  notificationMutedUsers: string[];
}

const userBlockCache = new Map<string, UserCacheEntry>();
const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const USER_CACHE_MAX_SIZE = 10000;

/** Get cached block/mute lists for a user, with DB fallback */
export async function getCachedUserBlockLists(
  userId: string,
  fetchFn: (id: string) => Promise<Partial<UserBlockLists> | null>,
): Promise<UserBlockLists> {
  const now = Date.now();
  const cached = userBlockCache.get(userId);
  if (cached && now - cached.fetchedAt < USER_CACHE_TTL_MS) {
    return {
      blockedUsers: cached.blockedUsers,
      mutedUsers: cached.mutedUsers,
      notificationMutedUsers: cached.notificationMutedUsers,
    };
  }

  const user = await fetchFn(userId);
  const result: UserBlockLists = {
    blockedUsers: user?.blockedUsers || [],
    mutedUsers: user?.mutedUsers || [],
    notificationMutedUsers: user?.notificationMutedUsers || [],
  };

  // Evict oldest entries if cache is full
  if (userBlockCache.size >= USER_CACHE_MAX_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, entry] of userBlockCache) {
      if (entry.fetchedAt < oldestTime) {
        oldestTime = entry.fetchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) userBlockCache.delete(oldestKey);
  }

  userBlockCache.set(userId, { ...result, fetchedAt: now });
  return result;
}

/** Invalidate a user's cached block/mute lists */
export function invalidateUserBlockCache(userId: string): void {
  userBlockCache.delete(userId);
}

// ==================== CHAT SETTINGS CACHE ====================

let chatEnabledCache: { value: boolean; fetchedAt: number } | null = null;
const CHAT_ENABLED_CACHE_TTL_MS = 60 * 1000; // 1 minute

/** Get cached chat enabled status */
export async function isChatEnabled(
  fetchFn: () => Promise<boolean>
): Promise<boolean> {
  const now = Date.now();
  if (chatEnabledCache && now - chatEnabledCache.fetchedAt < CHAT_ENABLED_CACHE_TTL_MS) {
    return chatEnabledCache.value;
  }
  const value = await fetchFn();
  chatEnabledCache = { value, fetchedAt: now };
  return value;
}

export function invalidateChatEnabledCache(): void {
  chatEnabledCache = null;
}

// ==================== CACHING HELPERS ====================

/**
 * Get cached value, or fetch and cache it
 * @param key Cache key
 * @param ttlSeconds Time to live in seconds
 * @param fetchFn Function to fetch data if not cached
 */
export async function cacheGet<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const client = getRedisClient();
  try {
    const cached = await client.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err: unknown) {
    logger.warn('[Redis] Cache read error', { action: 'cache_read', error: err instanceof Error ? err.message : String(err) });
  }

  // Fetch fresh data
  const data = await fetchFn();

  // Cache it (non-blocking)
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data));
  } catch (err: unknown) {
    logger.warn('[Redis] Cache write error', { action: 'cache_write', error: err instanceof Error ? err.message : String(err) });
  }

  return data;
}

/**
 * Invalidate cache by key or pattern
 */
export async function cacheInvalidate(pattern: string): Promise<void> {
  const client = getRedisClient();
  try {
    if (pattern.includes("*")) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } else {
      await client.del(pattern);
    }
  } catch (err: unknown) {
    logger.warn('[Redis] Cache invalidate error', { action: 'cache_invalidate', error: err instanceof Error ? err.message : String(err) });
  }
}

// ==================== RATE LIMITING (Redis-backed) ====================

/**
 * Redis-backed rate limiter for WebSocket/chat
 */
export async function redisRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const client = getRedisClient();
  const now = Date.now();
  const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`;

  try {
    const count = await client.incr(windowKey);
    if (count === 1) {
      await client.pexpire(windowKey, windowMs);
    }

    if (count > maxRequests) {
      const ttl = await client.pttl(windowKey);
      return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
    }

    return { allowed: true };
  } catch (err: unknown) {
    // Fallback policy controlled by RATE_LIMIT_FAIL_MODE (defaults to "closed"
    // in production, "open" in development). Failing closed in production
    // prevents bypass of distributed rate limits when Redis is degraded.
    const failClosed = (process.env.RATE_LIMIT_FAIL_MODE ?? "").trim().toLowerCase() === "closed"
      || (process.env.NODE_ENV === "production"
        && (process.env.RATE_LIMIT_FAIL_MODE ?? "").trim().toLowerCase() !== "open");
    logger.warn('[Redis] Rate limit error', {
      action: 'rate_limit',
      error: err instanceof Error ? err.message : String(err),
      fail_mode: failClosed ? 'closed' : 'open',
    });
    if (failClosed) {
      return { allowed: false, retryAfterMs: windowMs };
    }
    return { allowed: true };
  }
}

// ==================== SESSION/ONLINE TRACKING ====================

/**
 * Track online users via Redis sorted set
 */
export async function trackUserOnline(userId: string): Promise<void> {
  const client = getRedisClient();
  try {
    await client.zadd("online_users", Date.now(), userId);
  } catch { }
}

export async function trackUserOffline(userId: string): Promise<void> {
  const client = getRedisClient();
  try {
    await client.zrem("online_users", userId);
  } catch { }
}

export async function getOnlineUserCount(): Promise<number> {
  const client = getRedisClient();
  try {
    // Users active in last 5 minutes
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return await client.zcount("online_users", fiveMinAgo, "+inf");
  } catch {
    return 0;
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const client = getRedisClient();
  try {
    const score = await client.zscore("online_users", userId);
    if (!score) return false;
    return Date.now() - parseInt(score) < 5 * 60 * 1000;
  } catch {
    return false;
  }
}

// ==================== HEALTH CHECK ====================

export async function redisHealthCheck(): Promise<{
  status: string;
  latency: string;
}> {
  const client = getRedisClient();
  const start = Date.now();
  try {
    await client.ping();
    return {
      status: "connected",
      latency: `${Date.now() - start}ms`,
    };
  } catch (err: unknown) {
    return {
      status: `error: ${err instanceof Error ? err.message : String(err)}`,
      latency: `${Date.now() - start}ms`,
    };
  }
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  if (redis) { closePromises.push(redis.quit().then(() => { redis = null; })); }
  if (redisPub) { closePromises.push(redisPub.quit().then(() => { redisPub = null; })); }
  if (redisSub) { closePromises.push(redisSub.quit().then(() => { redisSub = null; subInitialized = false; })); }
  await Promise.allSettled(closePromises);
  userBlockCache.clear();
  chatEnabledCache = null;
  logger.info('[Redis] All connections closed gracefully');
}
