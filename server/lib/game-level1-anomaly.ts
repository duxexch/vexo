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

type Level1AnomalyThresholds = {
    blockMs: number;

    rateWindowMs: number;
    rateMaxSubmissions: number;

    invalidWindowMs: number;
    invalidMaxAttempts: number;

    timingRegularWindowMs: number;
    timingFastAvgMs: number;
    timingMaxStdDevMs: number;
    timingMinSamples: number;
};

/**
 * Simple in-memory Level 1 (rule-based) anomaly detector for Game WS.
 * CIS requirements (production hardening):
 * - thresholds configurable via env with safe defaults
 * - optional per-game override support via GAME_L1_ANOMALY_OVERRIDES_JSON
 * - in-memory is acceptable for Level-1; pair with sticky sessions/Redis for multi-node
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

const detector = new Map<string, DetectorEntry>();

function keyFor(sessionId: string, userId: string): string {
    return `game-l1:${sessionId}:${userId}`;
}

function stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNonNegativeFloat(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBaseThresholdsFromEnv(): Level1AnomalyThresholds {
    return {
        blockMs: parsePositiveInt(process.env.GAME_L1_BLOCK_MS, 20_000),

        rateWindowMs: parsePositiveInt(process.env.GAME_L1_RATE_WINDOW_MS, 2_000),
        rateMaxSubmissions: parseNonNegativeInt(process.env.GAME_L1_RATE_MAX_SUBMISSIONS, 25),

        invalidWindowMs: parsePositiveInt(process.env.GAME_L1_INVALID_WINDOW_MS, 10_000),
        invalidMaxAttempts: parseNonNegativeInt(process.env.GAME_L1_INVALID_MAX_ATTEMPTS, 6),

        timingRegularWindowMs: parsePositiveInt(process.env.GAME_L1_TIMING_REGULAR_WINDOW_MS, 30_000),
        timingFastAvgMs: parseNonNegativeInt(process.env.GAME_L1_TIMING_FAST_AVG_MS, 220),
        timingMaxStdDevMs: parseNonNegativeInt(process.env.GAME_L1_TIMING_MAX_STD_DEV_MS, 30),
        timingMinSamples: parseNonNegativeInt(process.env.GAME_L1_TIMING_MIN_SAMPLES, 4),
    };
}

type ThresholdOverrideInput = Partial<{
    blockMs: number;

    rateWindowMs: number;
    rateMaxSubmissions: number;

    invalidWindowMs: number;
    invalidMaxAttempts: number;

    timingRegularWindowMs: number;
    timingFastAvgMs: number;
    timingMaxStdDevMs: number;
    timingMinSamples: number;

    // Alternative nested forms
    rate: Partial<{
        rateWindowMs: number;
        rateMaxSubmissions: number;
    }>;
    invalid: Partial<{
        invalidWindowMs: number;
        invalidMaxAttempts: number;
    }>;
    timing: Partial<{
        timingRegularWindowMs: number;
        timingFastAvgMs: number;
        timingMaxStdDevMs: number;
        timingMinSamples: number;
    }>;
}>;

function getOverridesFromEnv(): Record<string, ThresholdOverrideInput> {
    const raw = process.env.GAME_L1_ANOMALY_OVERRIDES_JSON;
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return parsed as Record<string, ThresholdOverrideInput>;
    } catch {
        return {};
    }
}

function applyOverride(base: Level1AnomalyThresholds, override?: ThresholdOverrideInput): Level1AnomalyThresholds {
    if (!override) return base;

    const rate = override.rate || undefined;
    const invalid = override.invalid || undefined;
    const timing = override.timing || undefined;

    const merged: Level1AnomalyThresholds = {
        blockMs: typeof override.blockMs === "number" && override.blockMs > 0 ? override.blockMs : base.blockMs,

        rateWindowMs:
            typeof override.rateWindowMs === "number" && override.rateWindowMs > 0
                ? override.rateWindowMs
                : typeof rate?.rateWindowMs === "number" && rate.rateWindowMs > 0
                    ? rate.rateWindowMs
                    : base.rateWindowMs,

        rateMaxSubmissions:
            typeof override.rateMaxSubmissions === "number" && override.rateMaxSubmissions >= 0
                ? override.rateMaxSubmissions
                : typeof rate?.rateMaxSubmissions === "number" && rate.rateMaxSubmissions >= 0
                    ? rate.rateMaxSubmissions
                    : base.rateMaxSubmissions,

        invalidWindowMs:
            typeof override.invalidWindowMs === "number" && override.invalidWindowMs > 0
                ? override.invalidWindowMs
                : typeof invalid?.invalidWindowMs === "number" && invalid.invalidWindowMs > 0
                    ? invalid.invalidWindowMs
                    : base.invalidWindowMs,

        invalidMaxAttempts:
            typeof override.invalidMaxAttempts === "number" && override.invalidMaxAttempts >= 0
                ? override.invalidMaxAttempts
                : typeof invalid?.invalidMaxAttempts === "number" && invalid.invalidMaxAttempts >= 0
                    ? invalid.invalidMaxAttempts
                    : base.invalidMaxAttempts,

        timingRegularWindowMs:
            typeof override.timingRegularWindowMs === "number" && override.timingRegularWindowMs > 0
                ? override.timingRegularWindowMs
                : typeof timing?.timingRegularWindowMs === "number" && timing.timingRegularWindowMs > 0
                    ? timing.timingRegularWindowMs
                    : base.timingRegularWindowMs,

        timingFastAvgMs:
            typeof override.timingFastAvgMs === "number" && override.timingFastAvgMs >= 0
                ? override.timingFastAvgMs
                : typeof timing?.timingFastAvgMs === "number" && timing.timingFastAvgMs >= 0
                    ? timing.timingFastAvgMs
                    : base.timingFastAvgMs,

        timingMaxStdDevMs:
            typeof override.timingMaxStdDevMs === "number" && override.timingMaxStdDevMs >= 0
                ? override.timingMaxStdDevMs
                : typeof timing?.timingMaxStdDevMs === "number" && timing.timingMaxStdDevMs >= 0
                    ? timing.timingMaxStdDevMs
                    : base.timingMaxStdDevMs,

        timingMinSamples:
            typeof override.timingMinSamples === "number" && override.timingMinSamples >= 0
                ? override.timingMinSamples
                : typeof timing?.timingMinSamples === "number" && timing.timingMinSamples >= 0
                    ? timing.timingMinSamples
                    : base.timingMinSamples,
    };

    return merged;
}

function getThresholdsForGame(gameType?: string): Level1AnomalyThresholds {
    const base = getBaseThresholdsFromEnv();
    if (!gameType) return base;

    const overrides = getOverridesFromEnv();
    const overrideForGame = overrides[gameType];

    // Optional: also accept override keyed by lowercased gameType
    const overrideForLower = overrides[String(gameType).toLowerCase()];

    return applyOverride(base, overrideForGame || overrideForLower);
}

function getOrCreate(sessionId: string, userId: string, now: number): DetectorEntry {
    const key = keyFor(sessionId, userId);
    const existing = detector.get(key);
    if (existing) return existing;

    const created: DetectorEntry = {
        rateWindowStart: now,
        rateCount: 0,
        invalidWindowStart: now,
        invalidCount: 0,
        lastSubmissionAt: undefined,
        lastIntervals: [],
    };
    detector.set(key, created);
    return created;
}

function pruneIfStale(entry: DetectorEntry, now: number, thresholds: Level1AnomalyThresholds): void {
    const allOld =
        now - entry.rateWindowStart > Math.max(thresholds.rateWindowMs, thresholds.invalidWindowMs, thresholds.timingRegularWindowMs) &&
        now - entry.invalidWindowStart > thresholds.invalidWindowMs;

    if (allOld) {
        entry.rateWindowStart = now;
        entry.rateCount = 0;
        entry.invalidWindowStart = now;
        entry.invalidCount = 0;
        entry.lastSubmissionAt = undefined;
        entry.lastIntervals = [];
    }
}

/**
 * Detects abuse patterns from repeated handler submissions.
 * - Move rate abuse (moves/sec proxy via RATE_WINDOW_MS)
 * - Timing regularity (steady machine-like intervals)
 */
export function evaluateAndRecordSubmission(params: {
    sessionId: string;
    userId: string;
    gameType?: string;
    now?: number;
}): Level1AnomalyDecision {
    const now = params.now ?? Date.now();
    const thresholds = getThresholdsForGame(params.gameType);

    const entry = getOrCreate(params.sessionId, params.userId, now);
    pruneIfStale(entry, now, thresholds);

    entry.rateCount += 1;

    if (now - entry.rateWindowStart >= thresholds.rateWindowMs) {
        entry.rateWindowStart = now;
        entry.rateCount = 1;
    }

    const anomalies: Level1AnomalyType[] = [];
    const reasons: string[] = [];

    if (entry.rateCount > thresholds.rateMaxSubmissions) {
        anomalies.push("move_rate_abuse");
        reasons.push(`moves_per_${thresholds.rateWindowMs}ms>${thresholds.rateMaxSubmissions}`);
    }

    const intervals: number[] = [];
    if (typeof entry.lastSubmissionAt === "number") {
        intervals.push(now - entry.lastSubmissionAt);
    }
    entry.lastSubmissionAt = now;

    if (intervals.length > 0) {
        entry.lastIntervals.push(...intervals);
    }

    // Keep last intervals bounded (approx window by sample count)
    const maxKeep = thresholds.timingMinSamples + 6;
    if (entry.lastIntervals.length > maxKeep) {
        entry.lastIntervals = entry.lastIntervals.slice(-maxKeep);
    }

    if (now - entry.rateWindowStart <= thresholds.timingRegularWindowMs) {
        if (entry.lastIntervals.length >= thresholds.timingMinSamples) {
            const last = entry.lastIntervals.slice(-thresholds.timingMinSamples);
            const avg = last.reduce((a, b) => a + b, 0) / last.length;
            const sd = stdDev(last);

            if (avg <= thresholds.timingFastAvgMs && sd <= thresholds.timingMaxStdDevMs) {
                anomalies.push("timing_regular_fast");
                reasons.push(
                    `avg_interval_ms<=${thresholds.timingFastAvgMs}, stddev_ms<=${thresholds.timingMaxStdDevMs}`,
                );
            }
        }
    } else {
        entry.lastIntervals = [];
    }

    const blocked = anomalies.length > 0;
    return blocked
        ? { blocked: true, blockMs: thresholds.blockMs, anomalies, reasons }
        : { blocked: false, anomalies: [], reasons: [] };
}

/**
 * Detects invalid-move spam (server-side invalid submissions).
 */
export function evaluateAndRecordInvalid(params: {
    sessionId: string;
    userId: string;
    gameType?: string;
    now?: number;
}): Level1AnomalyDecision {
    const now = params.now ?? Date.now();
    const thresholds = getThresholdsForGame(params.gameType);

    const entry = getOrCreate(params.sessionId, params.userId, now);
    pruneIfStale(entry, now, thresholds);

    entry.invalidCount += 1;

    if (now - entry.invalidWindowStart >= thresholds.invalidWindowMs) {
        entry.invalidWindowStart = now;
        entry.invalidCount = 1;
    }

    const anomalies: Level1AnomalyType[] = [];
    const reasons: string[] = [];

    if (entry.invalidCount > thresholds.invalidMaxAttempts) {
        anomalies.push("invalid_move_spam");
        reasons.push(`invalid_moves_per_${thresholds.invalidWindowMs}ms>${thresholds.invalidMaxAttempts}`);
    }

    const blocked = anomalies.length > 0;
    return blocked
        ? { blocked: true, blockMs: thresholds.blockMs, anomalies, reasons }
        : { blocked: false, anomalies: [], reasons: [] };
}
