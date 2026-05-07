import { setTimeout as setTimeoutFn } from 'node:timers';

export interface InflightAcquireResult {
    allowed: boolean;
    retryAfterMs?: number;
    lockAgeMs?: number;
}

interface Entry {
    token: number;
    startedAtMs: number;
}

const DEFAULT_LOCK_TTL_MS = 2_000;

export class InflightMoveLimiter {
    private readonly lockTtlMs: number;
    private readonly locks = new Map<string, Entry>();
    private tokenSeq = 1;

    constructor(lockTtlMs: number = DEFAULT_LOCK_TTL_MS) {
        this.lockTtlMs = lockTtlMs;
    }

    /**
     * Acquire an in-flight lock for `key`.
     * - If lock exists and is still fresh: reject (returns retryAfterMs).
     * - If lock is stale: overwrite and allow.
     */
    tryAcquire(key: string): InflightAcquireResult {
        const now = Date.now();
        const existing = this.locks.get(key);

        if (existing) {
            const age = now - existing.startedAtMs;
            if (age < this.lockTtlMs) {
                return {
                    allowed: false,
                    retryAfterMs: Math.max(0, this.lockTtlMs - age),
                    lockAgeMs: age,
                };
            }
            // stale: overwrite
        }

        const token = this.tokenSeq++;
        this.locks.set(key, { token, startedAtMs: now });

        // Auto-expire using token guard to avoid deleting a newer lock.
        setTimeoutFn(() => {
            const current = this.locks.get(key);
            if (current && current.token === token) {
                this.locks.delete(key);
            }
        }, this.lockTtlMs);

        return { allowed: true };
    }
}

export const sessionMoveInFlightLimiter = new InflightMoveLimiter();
