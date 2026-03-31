/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides graceful degradation for external service calls:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 * 
 * Features:
 * - Configurable failure thresholds
 * - Automatic recovery attempts
 * - Timeout handling
 * - Fallback functions
 */

import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
  fallback?: (...args: unknown[]) => Promise<unknown>;
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  totalCalls: number;
  rejectedCalls: number;
}

export class CircuitBreaker {
  private name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureThreshold: number;
  private successThreshold: number;
  private timeout: number;
  private resetTimeout: number;
  private fallback?: (...args: unknown[]) => Promise<unknown>;
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    totalCalls: 0,
    rejectedCalls: 0
  };
  private nextAttempt: number = 0;
  private halfOpenSuccesses: number = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 10000; // 10 seconds
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.fallback = options.fallback;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitStats & { state: CircuitState } {
    return { ...this.stats, state: this.state };
  }

  async execute<T>(fn: () => Promise<T>, ...args: unknown[]): Promise<T> {
    this.stats.totalCalls++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        this.stats.rejectedCalls++;
        logger.warn(`Circuit breaker ${this.name} is OPEN, rejecting request`, {
          circuitBreaker: this.name,
          state: this.state,
          nextAttempt: new Date(this.nextAttempt).toISOString()
        });

        if (this.fallback) {
          return this.fallback(...args) as Promise<T>;
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }

      this.state = CircuitState.HALF_OPEN;
      this.halfOpenSuccesses = 0;
      logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`, {
        circuitBreaker: this.name
      });
    }

    try {
      const result = await this.withTimeout(fn());
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${this.timeout}ms`)), this.timeout)
      )
    ]);
  }

  private onSuccess(): void {
    this.stats.successes++;
    this.stats.lastSuccess = new Date();
    this.stats.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info(`Circuit breaker ${this.name} recovered, now CLOSED`, {
          circuitBreaker: this.name,
          stats: this.getStats()
        });
      }
    }
  }

  private onFailure(error: unknown): void {
    this.stats.failures++;
    this.stats.lastFailure = new Date();

    logger.warn(`Circuit breaker ${this.name} recorded failure`, {
      circuitBreaker: this.name,
      failures: this.stats.failures,
      threshold: this.failureThreshold,
      error: error instanceof Error ? error.message : String(error)
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.trip();
    } else if (this.stats.failures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.resetTimeout;
    
    logger.error(`Circuit breaker ${this.name} TRIPPED`, undefined, {
      circuitBreaker: this.name,
      failures: this.stats.failures,
      nextAttempt: new Date(this.nextAttempt).toISOString()
    });
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.stats.failures = 0;
    this.halfOpenSuccesses = 0;
    
    logger.info(`Circuit breaker ${this.name} manually reset`, {
      circuitBreaker: this.name
    });
  }
}

// Registry of circuit breakers for monitoring
const circuitBreakers: Map<string, CircuitBreaker> = new Map();

export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const breaker = new CircuitBreaker(options);
  circuitBreakers.set(options.name, breaker);
  return breaker;
}

export function getCircuitBreaker(name: string): CircuitBreaker | undefined {
  return circuitBreakers.get(name);
}

export function getAllCircuitBreakerStats(): Record<string, CircuitStats & { state: CircuitState }> {
  const stats: Record<string, CircuitStats & { state: CircuitState }> = {};
  circuitBreakers.forEach((breaker, name) => {
    stats[name] = breaker.getStats();
  });
  return stats;
}

// Pre-configured circuit breakers for common services
export const databaseCircuit = createCircuitBreaker({
  name: 'database',
  failureThreshold: 3,
  resetTimeout: 10000,
  timeout: 5000,
  fallback: async () => {
    throw new Error('Database temporarily unavailable. Please try again.');
  }
});

export const externalApiCircuit = createCircuitBreaker({
  name: 'external-api',
  failureThreshold: 5,
  resetTimeout: 30000,
  timeout: 15000
});

export const paymentCircuit = createCircuitBreaker({
  name: 'payment',
  failureThreshold: 2, // Very sensitive for payment operations
  resetTimeout: 60000, // 1 minute before retry
  timeout: 30000
});
