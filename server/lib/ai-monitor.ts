/**
 * AI Monitor — centralised error tracking & anomaly alerting for the adaptive bot system.
 *
 * Responsibilities:
 *  - Rolling 60-second error-burst detection (5+ errors of same type → admin alert)
 *  - Critical-severity errors → immediate admin alert (1 min cooldown per session)
 *  - Anomaly detection: bot dominance, mass abandonment, zero moves, stale model
 *  - All alerts go to the admin panel via emitAdminAlert() + WebSocket broadcast
 */

import { emitAdminAlert } from './admin-alerts';
import { logger } from './logger';

export type AiErrorType = 'move_failure' | 'profile_error' | 'session_error' | 'engine_error';
export type AiAnomalyType = 'bot_dominant' | 'mass_abandon' | 'zero_moves' | 'stale_model';

interface AiErrorEntry {
    type: AiErrorType;
    message: string;
    gameType?: string;
    sessionId?: string;
    timestamp: number;
}

export interface AiMonitorStats {
    moveFailures: number;
    profileErrors: number;
    sessionErrors: number;
    engineErrors: number;
    anomaliesDetected: number;
    totalErrors: number;
    lastErrorAt?: string;
    recentErrorCount: number; // in last 60s window
}

// Alert thresholds & cooldowns
const BURST_THRESHOLD = 5;           // errors of the same type in BURST_WINDOW_MS → alert
const BURST_WINDOW_MS = 60_000;      // 60-second sliding window
const BURST_COOLDOWN_MS = 300_000;   // 5 min between same-type burst alerts
const IMMEDIATE_COOLDOWN_MS = 60_000; // 1 min between per-session critical alerts
const ANOMALY_COOLDOWN_MS = 900_000; // 15 min between same anomaly type alerts

// Human-readable labels for alert messages (EN + AR)
const ERROR_LABELS_EN: Record<AiErrorType, string> = {
    move_failure: 'Move Generation Failure',
    profile_error: 'Player Profile I/O Error',
    session_error: 'Session Config Error',
    engine_error: 'Game Engine Error',
};
const ERROR_LABELS_AR: Record<AiErrorType, string> = {
    move_failure: 'فشل توليد الحركات',
    profile_error: 'خطأ في ملف اللاعب',
    session_error: 'خطأ في إعداد الجلسة',
    engine_error: 'خطأ في محرك اللعبة',
};

const ANOMALY_TITLES_EN: Record<AiAnomalyType, string> = {
    bot_dominant: 'AI Bot Dominance Anomaly',
    mass_abandon: 'Mass Game Abandonment Detected',
    zero_moves: 'AI Move Generation Returned Zero Moves',
    stale_model: 'AI Learning Model May Be Stale',
};
const ANOMALY_TITLES_AR: Record<AiAnomalyType, string> = {
    bot_dominant: 'شذوذ: هيمنة البوت على اللاعبين',
    mass_abandon: 'شذوذ: موجة تخلٍّ جماعي عن الألعاب',
    zero_moves: 'فشل توليد الحركات في البوت — صفر حركات صالحة',
    stale_model: 'نموذج التعلم قد يكون متقادمًا',
};

function buildAnomalyMessage(params: { anomalyType: AiAnomalyType; gameType?: string; value?: number }): { en: string; ar: string } {
    const game = params.gameType || 'all games';
    const gameAr = params.gameType || 'جميع الألعاب';
    const val = params.value !== undefined ? params.value.toFixed(1) : '?';

    switch (params.anomalyType) {
        case 'bot_dominant':
            return {
                en: `Bot win rate is abnormally high (${val}%) for "${game}". Review difficulty calibration — players may be losing too often, causing disengagement.`,
                ar: `معدل فوز البوت مرتفع بشكل غير طبيعي (${val}%) في "${gameAr}". يُنصح بمراجعة معايرة صعوبة البوت — قد يخسر اللاعبون كثيرًا مما يقلل تفاعلهم.`,
            };
        case 'mass_abandon':
            return {
                en: `Abandonment rate is critically high (${val}%) in "${game}". Bot difficulty may be too hard or the game experience is frustrating users.`,
                ar: `معدل التخلي عن الألعاب مرتفع جدًا (${val}%) في "${gameAr}". قد يكون البوت صعبًا للغاية أو تجربة اللعبة تُحبط اللاعبين.`,
            };
        case 'zero_moves':
            return {
                en: `AI engine returned zero valid moves for game "${game}". This prevents bot from playing its turn. Possible game engine or state corruption.`,
                ar: `أعاد محرك الذكاء الاصطناعي صفر حركات صالحة في لعبة "${gameAr}". هذا يمنع البوت من اللعب. احتمال وجود عطل في المحرك أو الحالة.`,
            };
        case 'stale_model':
            return {
                en: 'AI learning model has not been updated in over 24 hours. Verify that game results are being recorded correctly and the AI learning pipeline is healthy.',
                ar: 'لم يتم تحديث نموذج تعلم الذكاء الاصطناعي منذ أكثر من 24 ساعة. تحقق من تسجيل نتائج الألعاب بشكل صحيح وأن مسار التعلم يعمل.',
            };
    }
}

class AiMonitor {
    private counters = {
        moveFailures: 0,
        profileErrors: 0,
        sessionErrors: 0,
        engineErrors: 0,
        anomaliesDetected: 0,
        totalErrors: 0,
    };
    private lastErrorAt?: number;
    private slidingWindow: AiErrorEntry[] = [];
    private cooldowns = new Map<string, number>();

    /**
     * Record an AI system error. Automatically fires admin alerts if:
     *  - 5+ errors of the same type appear within 60 seconds (burst)
     *  - severity is 'critical' or 'urgent' (immediate alert)
     */
    recordError(
        type: AiErrorType,
        context: {
            message: string;
            sessionId?: string;
            gameType?: string;
            severity?: 'warning' | 'critical' | 'urgent';
        },
    ): void {
        const now = Date.now();
        this.counters.totalErrors += 1;
        this.lastErrorAt = now;

        switch (type) {
            case 'move_failure': this.counters.moveFailures += 1; break;
            case 'profile_error': this.counters.profileErrors += 1; break;
            case 'session_error': this.counters.sessionErrors += 1; break;
            case 'engine_error': this.counters.engineErrors += 1; break;
        }

        this.slidingWindow.push({
            type,
            message: context.message,
            gameType: context.gameType,
            sessionId: context.sessionId,
            timestamp: now,
        });

        // Prune entries older than the burst window
        const cutoff = now - BURST_WINDOW_MS;
        this.slidingWindow = this.slidingWindow.filter((e) => e.timestamp > cutoff);

        // Burst threshold check (per error type)
        const windowCountForType = this.slidingWindow.filter((e) => e.type === type).length;
        if (windowCountForType >= BURST_THRESHOLD) {
            this.fireBurstAlert(type, windowCountForType, context.severity || 'warning').catch(() => { });
        }

        // Immediate alert for critical/urgent
        if (context.severity === 'critical' || context.severity === 'urgent') {
            this.fireImmediateAlert(type, context).catch(() => { });
        }
    }

    /**
     * Record a detected anomaly in AI behaviour and dispatch an admin alert.
     * Examples: bot winning 80%+ of games, mass abandonment spike, zero valid moves.
     */
    recordAnomaly(params: {
        anomalyType: AiAnomalyType;
        gameType?: string;
        value?: number;
    }): void {
        this.counters.anomaliesDetected += 1;
        this.fireAnomalyAlert(params).catch(() => { });
    }

    /** Return current in-memory stats snapshot for the admin dashboard. */
    getStats(): AiMonitorStats {
        const now = Date.now();
        const cutoff = now - BURST_WINDOW_MS;
        return {
            ...this.counters,
            lastErrorAt: this.lastErrorAt ? new Date(this.lastErrorAt).toISOString() : undefined,
            recentErrorCount: this.slidingWindow.filter((e) => e.timestamp > cutoff).length,
        };
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private isOnCooldown(key: string, cooldownMs: number): boolean {
        const last = this.cooldowns.get(key);
        return last !== undefined && Date.now() - last < cooldownMs;
    }

    private setCooldown(key: string): void {
        this.cooldowns.set(key, Date.now());
        // Prune to avoid unbounded growth
        if (this.cooldowns.size > 400) {
            const cutoff = Date.now() - ANOMALY_COOLDOWN_MS * 2;
            for (const [k, v] of this.cooldowns.entries()) {
                if (v < cutoff) this.cooldowns.delete(k);
            }
        }
    }

    private async fireBurstAlert(type: AiErrorType, count: number, severity: 'warning' | 'critical' | 'urgent'): Promise<void> {
        const key = `burst_${type}`;
        if (this.isOnCooldown(key, BURST_COOLDOWN_MS)) return;
        this.setCooldown(key);

        try {
            await emitAdminAlert({
                type: 'system_alert',
                severity,
                title: `AI Monitor: Error Burst — ${ERROR_LABELS_EN[type]}`,
                titleAr: `مراقب البوت: موجة أخطاء — ${ERROR_LABELS_AR[type]}`,
                message: `${count} "${ERROR_LABELS_EN[type]}" errors detected in the last 60 seconds. Check logs for details.`,
                messageAr: `تم رصد ${count} خطأ من نوع "${ERROR_LABELS_AR[type]}" خلال الدقيقة الأخيرة. راجع السجلات للتفاصيل.`,
                deepLink: '/admin/dashboard',
                entityType: 'ai_system',
                metadata: JSON.stringify({ errorType: type, count, windowMs: BURST_WINDOW_MS }),
            });
        } catch (e) {
            logger.error('[AiMonitor] Failed to emit burst alert', e as Error);
        }
    }

    private async fireImmediateAlert(
        type: AiErrorType,
        context: { message: string; sessionId?: string; gameType?: string },
    ): Promise<void> {
        const key = `immediate_${type}_${context.sessionId ?? 'global'}`;
        if (this.isOnCooldown(key, IMMEDIATE_COOLDOWN_MS)) return;
        this.setCooldown(key);

        try {
            await emitAdminAlert({
                type: 'system_alert',
                severity: 'critical',
                title: `AI Critical Error: ${ERROR_LABELS_EN[type]}`,
                titleAr: `خطأ حرج في البوت: ${ERROR_LABELS_AR[type]}`,
                message: `Critical error [${type}]${context.gameType ? ` in game "${context.gameType}"` : ''}: ${context.message}`,
                messageAr: `خطأ حرج [${type}]${context.gameType ? ` في لعبة "${context.gameType}"` : ''}: ${context.message}`,
                deepLink: '/admin/dashboard',
                entityType: 'ai_system',
                entityId: context.sessionId,
                metadata: JSON.stringify({ errorType: type, gameType: context.gameType, sessionId: context.sessionId }),
            });
        } catch (e) {
            logger.error('[AiMonitor] Failed to emit immediate alert', e as Error);
        }
    }

    private async fireAnomalyAlert(params: { anomalyType: AiAnomalyType; gameType?: string; value?: number }): Promise<void> {
        const key = `anomaly_${params.anomalyType}_${params.gameType ?? 'global'}`;
        if (this.isOnCooldown(key, ANOMALY_COOLDOWN_MS)) return;
        this.setCooldown(key);

        const msg = buildAnomalyMessage(params);
        const severity = params.anomalyType === 'zero_moves' ? 'critical' : 'warning';

        try {
            await emitAdminAlert({
                type: 'system_alert',
                severity,
                title: ANOMALY_TITLES_EN[params.anomalyType],
                titleAr: ANOMALY_TITLES_AR[params.anomalyType],
                message: msg.en,
                messageAr: msg.ar,
                deepLink: '/admin/dashboard',
                entityType: 'ai_system',
                metadata: JSON.stringify({
                    anomalyType: params.anomalyType,
                    gameType: params.gameType,
                    value: params.value,
                }),
            });
        } catch (e) {
            logger.error('[AiMonitor] Failed to emit anomaly alert', e as Error);
        }
    }
}

export const aiMonitor = new AiMonitor();
