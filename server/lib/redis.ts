import Redis from "ioredis";
import { logger } from "./logger";

// Redis client for caching, sessions, and rate limiting
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;
let redisSub: Redis | null = null;
let redisPub: Redis | null = null;

function createRedisConnection(name: string): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) {
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

  client.on("connect", () => logger.info(`[Redis:${name}] Connected`));
  client.on("error", (err) => logger.error(`[Redis:${name}] Error`, new Error(err.message)));
  client.on("close", () => logger.warn(`[Redis:${name}] Closed`));

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
      getRedisSub().unsubscribe(channel).catch(() => {});
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
  fetchedAt: number;
}

const userBlockCache = new Map<string, UserCacheEntry>();
const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const USER_CACHE_MAX_SIZE = 10000;

/** Get cached block/mute lists for a user, with DB fallback */
export async function getCachedUserBlockLists(
  userId: string,
  fetchFn: (id: string) => Promise<{ blockedUsers: string[]; mutedUsers: string[] } | null>
): Promise<{ blockedUsers: string[]; mutedUsers: string[] }> {
  const now = Date.now();
  const cached = userBlockCache.get(userId);
  if (cached && now - cached.fetchedAt < USER_CACHE_TTL_MS) {
    return { blockedUsers: cached.blockedUsers, mutedUsers: cached.mutedUsers };
  }

  const user = await fetchFn(userId);
  const result = {
    blockedUsers: user?.blockedUsers || [],
    mutedUsers: user?.mutedUsers || [],
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
    // Fallback: allow on Redis error (don't block users)
    logger.warn('[Redis] Rate limit error', { action: 'rate_limit', error: err instanceof Error ? err.message : String(err) });
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
  } catch {}
}

export async function trackUserOffline(userId: string): Promise<void> {
  const client = getRedisClient();
  try {
    await client.zrem("online_users", userId);
  } catch {}
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
