import os from 'os';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { getAllCircuitBreakerStats } from '../circuit-breaker';
import type { SystemMetrics, DatabaseHealth, DominoMoveErrorTelemetry, ServiceHealth } from './types';

// Recent errors tracking
const recentErrors: { timestamp: number; message: string }[] = [];
const ERROR_WINDOW_MS = 60000; // 1 minute

const DOMINO_ERROR_WINDOW_MS = 60000; // 1 minute
const DOMINO_TRACKED_ERROR_KEYS = [
  'domino.invalidState',
  'domino.notYourTurn',
  'domino.invalidMoveType',
  'domino.tileNotInHand',
  'domino.invalidPlacement',
  'domino.cannotDraw',
  'domino.maxDrawsReached',
  'domino.other',
] as const;

type DominoTrackedKey = (typeof DOMINO_TRACKED_ERROR_KEYS)[number];

interface DominoMoveErrorContext {
  userId?: string;
  challengeId?: string;
  code?: string;
}

interface DominoMoveErrorEvent {
  timestamp: number;
  key: DominoTrackedKey;
  userId?: string;
  challengeId?: string;
  code?: string;
}

const dominoMoveErrors: DominoMoveErrorEvent[] = [];
const dominoLifetimeByKey = new Map<DominoTrackedKey, number>(
  DOMINO_TRACKED_ERROR_KEYS.map((key) => [key, 0]),
);
let lastDominoMoveErrorAt: number | null = null;

function normalizeDominoErrorKey(errorKey?: string): DominoTrackedKey {
  if (errorKey === 'domino.invalidState') return 'domino.invalidState';
  if (errorKey === 'domino.notYourTurn') return 'domino.notYourTurn';
  if (errorKey === 'domino.invalidMoveType') return 'domino.invalidMoveType';
  if (errorKey === 'domino.tileNotInHand') return 'domino.tileNotInHand';
  if (errorKey === 'domino.invalidPlacement') return 'domino.invalidPlacement';
  if (errorKey === 'domino.cannotDraw') return 'domino.cannotDraw';
  if (errorKey === 'domino.maxDrawsReached') return 'domino.maxDrawsReached';
  return 'domino.other';
}

function normalizeDominoMoveErrorContext(context?: DominoMoveErrorContext): DominoMoveErrorContext {
  if (!context) {
    return {};
  }

  const userId = typeof context.userId === 'string' && context.userId.trim()
    ? context.userId.trim().slice(0, 64)
    : undefined;

  const challengeId = typeof context.challengeId === 'string' && context.challengeId.trim()
    ? context.challengeId.trim().slice(0, 128)
    : undefined;

  const code = typeof context.code === 'string' && context.code.trim()
    ? context.code.trim().slice(0, 64)
    : undefined;

  return { userId, challengeId, code };
}

function isSuspiciousDominoMoveCode(code?: string): boolean {
  return code === 'invalid_game_state'
    || code === 'move_apply_failed'
    || code === 'suspicious_activity';
}

function pruneDominoWindow(now = Date.now()): void {
  const cutoff = now - DOMINO_ERROR_WINDOW_MS;
  while (dominoMoveErrors.length > 0 && dominoMoveErrors[0].timestamp < cutoff) {
    dominoMoveErrors.shift();
  }
}

export function trackDominoMoveError(errorKey?: string, context?: DominoMoveErrorContext): void {
  const now = Date.now();
  const key = normalizeDominoErrorKey(errorKey);
  const normalizedContext = normalizeDominoMoveErrorContext(context);

  dominoMoveErrors.push({
    timestamp: now,
    key,
    userId: normalizedContext.userId,
    challengeId: normalizedContext.challengeId,
    code: normalizedContext.code,
  });
  dominoLifetimeByKey.set(key, (dominoLifetimeByKey.get(key) || 0) + 1);
  lastDominoMoveErrorAt = now;
  pruneDominoWindow(now);
}

export function getDominoMoveErrorTelemetry(): DominoMoveErrorTelemetry {
  pruneDominoWindow();

  const lastMinuteByKey: Record<string, number> = Object.fromEntries(
    DOMINO_TRACKED_ERROR_KEYS.map((key) => [key, 0]),
  );

  const lastMinuteByCode: Record<string, number> = {};
  const uniqueUsers = new Set<string>();
  const uniqueChallenges = new Set<string>();
  let invalidStateLastMinute = 0;
  let suspiciousCodesLastMinute = 0;

  dominoMoveErrors.forEach((event) => {
    lastMinuteByKey[event.key] = (lastMinuteByKey[event.key] || 0) + 1;

    if (event.key === 'domino.invalidState') {
      invalidStateLastMinute += 1;
    }

    if (isSuspiciousDominoMoveCode(event.code)) {
      suspiciousCodesLastMinute += 1;
    }

    if (event.userId) {
      uniqueUsers.add(event.userId);
    }

    if (event.challengeId) {
      uniqueChallenges.add(event.challengeId);
    }

    if (event.code) {
      lastMinuteByCode[event.code] = (lastMinuteByCode[event.code] || 0) + 1;
    }
  });

  const lifetimeByKey: Record<string, number> = Object.fromEntries(
    DOMINO_TRACKED_ERROR_KEYS.map((key) => [key, dominoLifetimeByKey.get(key) || 0]),
  );

  const lifetimeTotal = Object.values(lifetimeByKey).reduce((sum, count) => sum + count, 0);

  return {
    windowMs: DOMINO_ERROR_WINDOW_MS,
    trackedKeys: [...DOMINO_TRACKED_ERROR_KEYS],
    lastMinuteTotal: dominoMoveErrors.length,
    lastMinuteByKey,
    lifetimeTotal,
    lifetimeByKey,
    securitySignals: {
      invalidStateLastMinute,
      suspiciousCodesLastMinute,
      uniqueUsersLastMinute: uniqueUsers.size,
      uniqueChallengesLastMinute: uniqueChallenges.size,
      lastMinuteByCode,
    },
    lastEventAt: typeof lastDominoMoveErrorAt === 'number'
      ? new Date(lastDominoMoveErrorAt).toISOString()
      : undefined,
  };
}

export function trackError(message: string): void {
  const now = Date.now();
  recentErrors.push({ timestamp: now, message });

  // Clean up old errors
  const cutoff = now - ERROR_WINDOW_MS;
  while (recentErrors.length > 0 && recentErrors[0].timestamp < cutoff) {
    recentErrors.shift();
  }
}

export function getRecentErrorCount(): number {
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  return recentErrors.filter(e => e.timestamp >= cutoff).length;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;

    return {
      connected: true,
      latencyMs,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start
    };
  }
}

export function getSystemMetrics(): SystemMetrics {
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const usedMem = memUsage.heapUsed + memUsage.external;

  return {
    memory: {
      used: Math.round(usedMem / 1024 / 1024), // MB
      total: Math.round(totalMem / 1024 / 1024), // MB
      percentage: Math.round((usedMem / totalMem) * 100)
    },
    cpu: {
      loadAverage: os.loadavg()
    },
    process: {
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version
    }
  };
}

export function getServiceHealth(): ServiceHealth {
  const cbStats = getAllCircuitBreakerStats();
  const circuitBreakers: Record<string, { state: string; failures: number }> = {};

  Object.entries(cbStats).forEach(([name, stats]) => {
    circuitBreakers[name] = {
      state: stats.state,
      failures: stats.failures
    };
  });

  return {
    circuitBreakers,
    recentErrors: getRecentErrorCount(),
    activeConnections: 0, // Would need WebSocket server reference
    dominoMoveErrors: getDominoMoveErrorTelemetry(),
  };
}
