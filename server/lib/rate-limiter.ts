interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimiterConfig {
  maxMessages: number;
  windowMs: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxMessages: 5,
  windowMs: 3000
};

export function checkRateLimit(
  userId: string,
  config: RateLimiterConfig = DEFAULT_CONFIG
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    userRateLimits.set(userId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= config.maxMessages) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

export function resetRateLimit(userId: string): void {
  userRateLimits.delete(userId);
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of userRateLimits.entries()) {
    if (now - entry.windowStart >= 60000) {
      userRateLimits.delete(userId);
    }
  }
}, 60000);

export const chatRateLimiter = {
  check: (userId: string) => checkRateLimit(userId, { maxMessages: 5, windowMs: 3000 }),
  reset: resetRateLimit
};

export const giftRateLimiter = {
  check: (userId: string) => checkRateLimit(userId, { maxMessages: 3, windowMs: 10000 }),
  reset: resetRateLimit
};

/**
 * Game move rate limiters
 * - moveRateLimiter: per-user global (prevents per-user spam)
 * - sessionMoveRateLimiter: per-session global (prevents flooding the same room)
 * - sessionUserMoveRateLimiter: per-session + per-user (prevents multi-connection spam)
 */

// Game move rate limiter: prevent move spam per user (10 moves per 2 seconds)
export const moveRateLimiter = {
  check: (userId: string) => checkRateLimit(`move:${userId}`, { maxMessages: 10, windowMs: 2000 }),
  reset: (userId: string) => resetRateLimit(`move:${userId}`)
};

// Prevent move spam for a single session (20 moves per 2 seconds total across all players)
export const sessionMoveRateLimiter = {
  check: (sessionId: string) => checkRateLimit(`move:session:${sessionId}`, { maxMessages: 20, windowMs: 2000 }),
  reset: (sessionId: string) => resetRateLimit(`move:session:${sessionId}`)
};

// Prevent move spam for a single user inside a session (10 moves per 2 seconds)
export const sessionUserMoveRateLimiter = {
  check: (sessionId: string, userId: string) =>
    checkRateLimit(`move:session-user:${sessionId}:${userId}`, { maxMessages: 10, windowMs: 2000 }),
  reset: (sessionId: string, userId: string) =>
    resetRateLimit(`move:session-user:${sessionId}:${userId}`)
};

// WebSocket connection rate limiter: prevent connection flooding (5 connections per 10 seconds)
export const wsConnectionRateLimiter = {
  check: (ip: string) => checkRateLimit(`ws:${ip}`, { maxMessages: 5, windowMs: 10000 }),
  reset: (ip: string) => resetRateLimit(`ws:${ip}`)
};

// Resign rate limiter: prevent resign spam (1 per 5 seconds)
export const resignRateLimiter = {
  check: (userId: string) => checkRateLimit(`resign:${userId}`, { maxMessages: 1, windowMs: 5000 }),
  reset: (userId: string) => resetRateLimit(`resign:${userId}`)
};
