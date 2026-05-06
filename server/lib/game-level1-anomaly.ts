export type Level1AnomalyType =
    | "invalid_move_spam"
    | "move_rate_abuse"
    | "timing_regular_fast";

export interface Level1AnomalyDecision {
    blocked: boolean;
    blockMs?: number;
    anomalies: Level1AnomalyType[];
    reasons: string[];
}

/**
 * Simple in-memory Level 1 (rule-based) anomaly detector for Game WS.
 * CIS note: in-memory is acceptable as a first Level-1 control; for multi-node
 * production you should pair with sticky sessions (already present) and/or Redis.
 */
type DetectorEntry = {
    // For move rate abuse (all submissions that hit the handler)
    rateWindowStart: number;
    rateCount: number;

    // For invalid move spam
    invalidWindowStart: number;
    invalidCount: number;

    // For timing regularity detection
    lastSubmissionAt?: number;
    lastIntervals: number[]; // milliseconds between submissions
};

const DEFAULT_BLOCK_MS = 20_000;

const RATE_WINDOW_MS = 2_000;
const RATE_MAX_SUBMISSIONS = 25;

const INVALID_WINDOW_MS = 10_000;
const INVALID_MAX_ATTEMPTS = 6;

const TIMING_REGULAR_WINDOW_MS = 30_000;
const TIMING_FAST_AVG_MS = 220;
const TIMING_MAX_STD_DEV_MS = 30;
const TIMING_MIN_SAMPLES = 4;

/**
 * Standard deviation (population) for a small sample set.
 */
function stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

function keyFor(sessionId: string, userId: string): string {
    return `game-l1:${sessionId}:${userId}`;
}

const detector = new Map<string, DetectorEntry>();

function getOrCreate(sessionId: string, userId: string, now: number): DetectorEntry {
    const key = keyFor(sessionId, userId);
    const existing = detector.get(key);
    if (existing) return existing;

    const created: DetectorEntry = {
        rateWindowStart: now,
        rateCount: 0,
        invalidWindowStart: now,
        invalidCount: 0,
        lastIntervals: [],
    };
    detector.set(key, created);
    return created;
}

function pruneIfStale(entry: DetectorEntry, now: number): void {
    // Light pruning: reset entries if all windows are old.
    const allOld =
        now - entry.rateWindowStart > Math.max(RATE_WINDOW_MS, INVALID_WINDOW_MS, TIMING_REGULAR_WINDOW_MS) &&
        now - entry.invalidWindowStart > INVALID_WINDOW_MS;

    if (allOld) {
        entry.rateWindowStart = now;
        entry.rateCount = 0;
        entry.invalidWindowStart = now;
        entry.invalidCount = 0;
        entry.lastSubmissionAt = undefined;
        entry.lastIntervals = [];
    }
}

export function evaluateAndRecordSubmission(params: {
    sessionId: string;
    userId: string;
    now?: number;
}): Level1AnomalyDecision {
    const now = params.now ?? Date.now();
    const entry = getOrCreate(params.sessionId, params.userId, now);
    pruneIfStale(entry, now);

    entry.rateCount += 1;
    if (now - entry.rateWindowStart >= RATE_WINDOW_MS) {
        entry.rateWindowStart = now;
        entry.rateCount = 1;
    }

    const anomalies: Level1AnomalyType[] = [];
    const reasons: string[] = [];

    // Move rate abuse
    if (entry.rateCount > RATE_MAX_SUBMISSIONS) {
        anomalies.push("move_rate_abuse");
        reasons.push(`moves_per_${RATE_WINDOW_MS}ms>${RATE_MAX_SUBMISSIONS}`);
    }

    // Timing regularity (based on inter-arrival time)
    const intervals: number[] = [];
    if (typeof entry.lastSubmissionAt === "number") {
        intervals.push(now - entry.lastSubmissionAt);
    }
    entry.lastSubmissionAt = now;

    // Keep last intervals only for the recent timing window.
    if (intervals.length > 0) {
        entry.lastIntervals.push(...intervals);
    }

    // Prune intervals older than TIMING_REGULAR_WINDOW_MS by count approximation:
    // We don't store timestamps per interval, so we cap by samples and let window
    // be handled through resets.
    if (entry.lastIntervals.length > TIMING_MIN_SAMPLES + 6) {
        entry.lastIntervals = entry.lastIntervals.slice(- (TIMING_MIN_SAMPLES + 6));
    }

    if (now - entry.rateWindowStart <= TIMING_REGULAR_WINDOW_MS) {
        // We require enough samples.
        if (entry.lastIntervals.length >= TIMING_MIN_SAMPLES) {
            const last = entry.lastIntervals.slice(-TIMING_MIN_SAMPLES);
            const avg = last.reduce((a, b) => a + b, 0) / last.length;
            const sd = stdDev(last);

            if (avg <= TIMING_FAST_AVG_MS && sd <= TIMING_MAX_STD_DEV_MS) {
                anomalies.push("timing_regular_fast");
                reasons.push(`avg_interval_ms<=${TIMING_FAST_AVG_MS}, stddev_ms<=${TIMING_MAX_STD_DEV_MS}`);
            }
        }
    } else {
        // If we drifted, reset timing samples.
        entry.lastIntervals = [];
    }

    const blocked = anomalies.length > 0;
    return blocked
        ? { blocked: true, blockMs: DEFAULT_BLOCK_MS, anomalies, reasons }
        : { blocked: false, anomalies: [], reasons: [] };
}

export function evaluateAndRecordInvalid(params: {
    sessionId: string;
    userId: string;
    now?: number;
}): Level1AnomalyDecision {
    const now = params.now ?? Date.now();
    const entry = getOrCreate(params.sessionId, params.userId, now);
    pruneIfStale(entry, now);

    entry.invalidCount += 1;
    if (now - entry.invalidWindowStart >= INVALID_WINDOW_MS) {
        entry.invalidWindowStart = now;
        entry.invalidCount = 1;
    }

    const anomalies: Level1AnomalyType[] = [];
    const reasons: string[] = [];

    if (entry.invalidCount > INVALID_MAX_ATTEMPTS) {
        anomalies.push("invalid_move_spam");
        reasons.push(`invalid_moves_per_${INVALID_WINDOW_MS}ms>${INVALID_MAX_ATTEMPTS}`);
    }

    const blocked = anomalies.length > 0;
    return blocked
        ? { blocked: true, blockMs: DEFAULT_BLOCK_MS, anomalies, reasons }
        : { blocked: false, anomalies: [], reasons: [] };
}
