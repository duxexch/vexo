import { CircuitState } from '../circuit-breaker';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    loadAverage: number[];
  };
  process: {
    pid: number;
    uptime: number;
    nodeVersion: string;
  };
}

export interface DatabaseHealth {
  connected: boolean;
  latencyMs: number;
  poolStats?: {
    idle: number;
    total: number;
    waiting: number;
  };
}

export interface DominoMoveErrorTelemetry {
  windowMs: number;
  trackedKeys: string[];
  lastMinuteTotal: number;
  lastMinuteByKey: Record<string, number>;
  lifetimeTotal: number;
  lifetimeByKey: Record<string, number>;
  securitySignals: {
    invalidStateLastMinute: number;
    suspiciousCodesLastMinute: number;
    uniqueUsersLastMinute: number;
    uniqueChallengesLastMinute: number;
    lastMinuteByCode: Record<string, number>;
  };
  lastEventAt?: string;
}

export interface ServiceHealth {
  circuitBreakers: Record<string, { state: string; failures: number }>;
  recentErrors: number;
  activeConnections: number;
  dominoMoveErrors: DominoMoveErrorTelemetry;
}

export interface HealthReport {
  status: HealthStatus;
  system: SystemMetrics;
  database: DatabaseHealth;
  services: ServiceHealth;
  alerts: Alert[];
}

export interface Alert {
  level: 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: string;
}

// Alert thresholds
export const THRESHOLDS = {
  memoryWarning: 80, // %
  memoryCritical: 95, // %
  dbLatencyWarning: 100, // ms
  dbLatencyCritical: 500, // ms
  errorRateWarning: 10, // per minute
  errorRateCritical: 50, // per minute
  dominoMoveErrorRateWarning: 15, // per minute
  dominoMoveErrorRateCritical: 40, // per minute
  dominoInvalidStateWarning: 5, // per minute
  dominoInvalidStateCritical: 15, // per minute
  dominoSuspiciousCodeWarning: 8, // per minute
  dominoSuspiciousCodeCritical: 20, // per minute
};
