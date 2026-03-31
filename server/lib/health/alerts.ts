import { CircuitState } from '../circuit-breaker';
import type { SystemMetrics, DatabaseHealth, ServiceHealth, Alert } from './types';
import { THRESHOLDS } from './types';

export function generateAlerts(
  system: SystemMetrics,
  database: DatabaseHealth,
  services: ServiceHealth
): Alert[] {
  const alerts: Alert[] = [];
  const timestamp = new Date().toISOString();

  // Memory alerts
  if (system.memory.percentage >= THRESHOLDS.memoryCritical) {
    alerts.push({
      level: 'critical',
      component: 'memory',
      message: `Memory usage at ${system.memory.percentage}%`,
      timestamp
    });
  } else if (system.memory.percentage >= THRESHOLDS.memoryWarning) {
    alerts.push({
      level: 'warning',
      component: 'memory',
      message: `Memory usage at ${system.memory.percentage}%`,
      timestamp
    });
  }

  // Database alerts
  if (!database.connected) {
    alerts.push({
      level: 'critical',
      component: 'database',
      message: 'Database connection failed',
      timestamp
    });
  } else if (database.latencyMs >= THRESHOLDS.dbLatencyCritical) {
    alerts.push({
      level: 'critical',
      component: 'database',
      message: `Database latency ${database.latencyMs}ms exceeds threshold`,
      timestamp
    });
  } else if (database.latencyMs >= THRESHOLDS.dbLatencyWarning) {
    alerts.push({
      level: 'warning',
      component: 'database',
      message: `Database latency ${database.latencyMs}ms is elevated`,
      timestamp
    });
  }

  // Circuit breaker alerts
  Object.entries(services.circuitBreakers).forEach(([name, cb]) => {
    if (cb.state === CircuitState.OPEN) {
      alerts.push({
        level: 'critical',
        component: `circuit-${name}`,
        message: `Circuit breaker ${name} is OPEN`,
        timestamp
      });
    } else if (cb.state === CircuitState.HALF_OPEN) {
      alerts.push({
        level: 'warning',
        component: `circuit-${name}`,
        message: `Circuit breaker ${name} is recovering`,
        timestamp
      });
    }
  });

  // Error rate alerts
  if (services.recentErrors >= THRESHOLDS.errorRateCritical) {
    alerts.push({
      level: 'critical',
      component: 'errors',
      message: `${services.recentErrors} errors in last minute`,
      timestamp
    });
  } else if (services.recentErrors >= THRESHOLDS.errorRateWarning) {
    alerts.push({
      level: 'warning',
      component: 'errors',
      message: `${services.recentErrors} errors in last minute`,
      timestamp
    });
  }

  return alerts;
}

export function determineOverallStatus(
  database: DatabaseHealth,
  alerts: Alert[]
): 'healthy' | 'degraded' | 'unhealthy' {
  if (!database.connected) {
    return 'unhealthy';
  }

  const hasCritical = alerts.some(a => a.level === 'critical');
  if (hasCritical) {
    return 'unhealthy';
  }

  const hasWarning = alerts.some(a => a.level === 'warning');
  if (hasWarning) {
    return 'degraded';
  }

  return 'healthy';
}
