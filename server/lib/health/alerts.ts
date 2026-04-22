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

  // Domino move-error telemetry alerts (challenge mode quality signal)
  const dominoMoveErrorsPerMinute = services.dominoMoveErrors.lastMinuteTotal;
  if (dominoMoveErrorsPerMinute >= THRESHOLDS.dominoMoveErrorRateCritical) {
    alerts.push({
      level: 'critical',
      component: 'domino-move-errors',
      message: `${dominoMoveErrorsPerMinute} domino move errors in last minute`,
      timestamp,
    });
  } else if (dominoMoveErrorsPerMinute >= THRESHOLDS.dominoMoveErrorRateWarning) {
    alerts.push({
      level: 'warning',
      component: 'domino-move-errors',
      message: `${dominoMoveErrorsPerMinute} domino move errors in last minute`,
      timestamp,
    });
  }

  const invalidStatePerMinute = services.dominoMoveErrors.securitySignals.invalidStateLastMinute;
  if (invalidStatePerMinute >= THRESHOLDS.dominoInvalidStateCritical) {
    alerts.push({
      level: 'critical',
      component: 'domino-invalid-state',
      message: `${invalidStatePerMinute} domino invalid-state events in last minute`,
      timestamp,
    });
  } else if (invalidStatePerMinute >= THRESHOLDS.dominoInvalidStateWarning) {
    alerts.push({
      level: 'warning',
      component: 'domino-invalid-state',
      message: `${invalidStatePerMinute} domino invalid-state events in last minute`,
      timestamp,
    });
  }

  const suspiciousCodesPerMinute = services.dominoMoveErrors.securitySignals.suspiciousCodesLastMinute;
  if (suspiciousCodesPerMinute >= THRESHOLDS.dominoSuspiciousCodeCritical) {
    alerts.push({
      level: 'critical',
      component: 'domino-suspicious-codes',
      message: `${suspiciousCodesPerMinute} suspicious domino move codes in last minute`,
      timestamp,
    });
  } else if (suspiciousCodesPerMinute >= THRESHOLDS.dominoSuspiciousCodeWarning) {
    alerts.push({
      level: 'warning',
      component: 'domino-suspicious-codes',
      message: `${suspiciousCodesPerMinute} suspicious domino move codes in last minute`,
      timestamp,
    });
  }

  // Replay shadow drift alerts (event-replay parity signal)
  const replayDriftsPerMinute = services.replayShadow.driftCountLastMinute;
  if (replayDriftsPerMinute >= THRESHOLDS.replayShadowDriftCritical) {
    alerts.push({
      level: 'critical',
      component: 'replay-shadow-drift',
      message: `${replayDriftsPerMinute} replay shadow drifts in last minute`,
      timestamp,
    });
  } else if (replayDriftsPerMinute >= THRESHOLDS.replayShadowDriftWarning) {
    alerts.push({
      level: 'warning',
      component: 'replay-shadow-drift',
      message: `${replayDriftsPerMinute} replay shadow drifts in last minute`,
      timestamp,
    });
  }

  const replayDriftRate = services.replayShadow.driftRateLastMinute;
  if (replayDriftRate >= THRESHOLDS.replayShadowDriftRateCritical) {
    alerts.push({
      level: 'critical',
      component: 'replay-shadow-drift-rate',
      message: `Replay drift rate ${replayDriftRate}% exceeds critical threshold`,
      timestamp,
    });
  } else if (replayDriftRate >= THRESHOLDS.replayShadowDriftRateWarning) {
    alerts.push({
      level: 'warning',
      component: 'replay-shadow-drift-rate',
      message: `Replay drift rate ${replayDriftRate}% is elevated`,
      timestamp,
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
