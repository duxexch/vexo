import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger';
import type { HealthReport } from './types';
import { checkDatabaseHealth, getSystemMetrics, getServiceHealth, trackError } from './metrics';
import { generateAlerts, determineOverallStatus } from './alerts';

export async function getHealthReport(): Promise<HealthReport> {
  const [database, system] = await Promise.all([
    checkDatabaseHealth(),
    Promise.resolve(getSystemMetrics())
  ]);

  const services = getServiceHealth();
  const alerts = generateAlerts(system, database, services);
  const overallStatus = determineOverallStatus(database, alerts);

  const report: HealthReport = {
    status: {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: system.process.uptime,
      version: process.env.npm_package_version || '1.0.0'
    },
    system,
    database,
    services,
    alerts
  };

  // Log if unhealthy
  if (overallStatus === 'unhealthy') {
    logger.error('Health check: UNHEALTHY', undefined, {
      alerts: alerts.filter(a => a.level === 'critical')
    });
  } else if (overallStatus === 'degraded') {
    logger.warn('Health check: DEGRADED', {
      alerts: alerts.filter(a => a.level === 'warning')
    });
  }

  return report;
}

// Quick health check for load balancers
export async function quickHealthCheck(): Promise<{ ok: boolean; db: boolean }> {
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, db: true };
  } catch {
    return { ok: false, db: false };
  }
}

// Express middleware to track errors
export function errorTracker() {
  return (err: unknown, _req: unknown, _res: unknown, next: (err?: unknown) => void) => {
    trackError(err instanceof Error ? err.message : String(err));
    next(err);
  };
}
