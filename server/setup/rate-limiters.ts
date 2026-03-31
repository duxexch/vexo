import rateLimit from "express-rate-limit";
import RedisStorePkg from "rate-limit-redis";
import { getRedisClient } from "../lib/redis";
import { logger } from "../lib/logger";

// Fix ESM/CJS interop for rate-limit-redis
const RedisStore = (RedisStorePkg as unknown as Record<string, unknown>).default || RedisStorePkg;

// Redis-backed rate limit store for production (distributed, persistent)
const isProduction = process.env.NODE_ENV === "production";

// Create a NEW RedisStore for each rate limiter (each needs unique prefix)
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

// Helper: returns store option object only if Redis store was created
function redisStoreOpts(prefix: string): Record<string, any> {
  const store = createRedisStore(prefix);
  return store ? { store } : {};
}

// General API rate limiter for all endpoints - optimized for 20k users
export const apiRateLimiter = rateLimit({
  ...redisStoreOpts("api"),
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP (increased for high traffic)
  message: { error: "Too many requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health" || req.path === "/api/health/detailed",
});

// Aggressive rate limiter for suspected attacks (DDoS protection)
// Set high to avoid blocking legitimate NAT/CDN users
export const attackProtectionLimiter = rateLimit({
  ...redisStoreOpts("attack"),
  windowMs: 60 * 1000, // 1 minute
  max: 5000, // 5000 requests per minute absolute max (allows for NAT/CDN)
  message: { error: "Rate limit exceeded. Your IP has been flagged." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.security('Rate limit exceeded', { ip: req.ip, action: 'rate_limit', result: 'blocked' });
    res.status(429).json({ error: "Too many requests. Please wait before retrying." });
  },
});
