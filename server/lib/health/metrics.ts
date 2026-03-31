import os from 'os';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { getAllCircuitBreakerStats } from '../circuit-breaker';
import type { SystemMetrics, DatabaseHealth, ServiceHealth } from './types';

// Recent errors tracking
const recentErrors: { timestamp: number; message: string }[] = [];
const ERROR_WINDOW_MS = 60000; // 1 minute

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
    activeConnections: 0 // Would need WebSocket server reference
  };
}
