import rateLimit from "express-rate-limit";
import RedisStorePkg from "rate-limit-redis";
import { getRedisClient } from "../lib/redis";
import { logger } from "../lib/logger";

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Fix ESM/CJS interop for rate-limit-redis
const RedisStore = (RedisStorePkg as unknown as Record<string, unknown>).default || RedisStorePkg;

const isProduction = process.env.NODE_ENV === "production";

/** Create a Redis-backed rate limit store for production */
function createRedisStore(prefix: string): unknown | undefined {
  if (!isProduction) return undefined;
  try {
    const StoreClass = typeof RedisStore === 'function' ? RedisStore : (RedisStore as (...args: unknown[]) => unknown);
    return new (StoreClass as new (opts: Record<string, unknown>) => unknown)({
      sendCommand: (...args: string[]) => getRedisClient().call(...(args as [string, ...string[]])),
      prefix: `rl:${prefix}:`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[Redis] RedisStore creation failed for ${prefix}, using memory store`, { action: 'redis', error: message });
    return undefined;
  }
}

/** Returns store option object only if Redis store was created */
export function redisStoreOpts(prefix: string): Record<string, unknown> {
  const store = createRedisStore(prefix);
  return store ? { store } : {};
}

/** Notification-specific rate limiter */
export const notificationRateLimiter = rateLimit({
  ...redisStoreOpts("notif"),
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many notification requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});
