import type { Request } from "express";
import crypto from "crypto";
import { emitSystemAlert } from "../../lib/admin-alerts";
import { logger } from "../../lib/logger";
import { getRedisClient } from "../../lib/redis";

export type ResetSecurityFlow =
    | "password-reset-request"
    | "account-recovery-request"
    | "password-reset-confirm"
    | "account-recovery-confirm";

type SecuritySeverity = "info" | "warning" | "critical" | "urgent";

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

const AUTH_RESET_BRUTE_WINDOW_SECONDS = readIntEnv("AUTH_RESET_BRUTE_WINDOW_SECONDS", 15 * 60, 60, 24 * 60 * 60);
const AUTH_RESET_BRUTE_MAX_FAILURES = readIntEnv("AUTH_RESET_BRUTE_MAX_FAILURES", 6, 3, 100);
const AUTH_RESET_BRUTE_BLOCK_SECONDS = readIntEnv("AUTH_RESET_BRUTE_BLOCK_SECONDS", 30 * 60, 60, 24 * 60 * 60);
const AUTH_RESET_ALERT_COOLDOWN_SECONDS = readIntEnv("AUTH_RESET_ALERT_COOLDOWN_SECONDS", 5 * 60, 30, 60 * 60);

const localAlertCooldown = new Map<string, number>();

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function sha256Short(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function getClientIpFromRequest(req: Request): string {
    const requestIp = normalizeString(req.ip);
    if (requestIp) {
        return requestIp;
    }

    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        const firstIp = normalizeString(forwarded.split(",")[0]);
        if (firstIp) {
            return firstIp;
        }
    }

    return "unknown";
}

export function getResetIdentifierFromBody(body: unknown): string | null {
    if (!body || typeof body !== "object") {
        return null;
    }

    const payload = body as Record<string, unknown>;
    const email = normalizeString(payload.email).toLowerCase();
    if (email) {
        return `email:${email}`;
    }

    const phone = normalizeString(payload.phone);
    if (phone) {
        return `phone:${phone}`;
    }

    const accountId = normalizeString(payload.accountId);
    if (accountId) {
        return `account:${accountId}`;
    }

    const identifier = normalizeString(payload.identifier).toLowerCase();
    if (identifier) {
        return `identifier:${identifier}`;
    }

    return null;
}

export function getResetIdentifierHashFromBody(body: unknown): string | null {
    const identifier = getResetIdentifierFromBody(body);
    return identifier ? sha256Short(identifier) : null;
}

function getUserAgentFingerprint(req: Request): string {
    const userAgent = normalizeString(req.headers["user-agent"]);
    if (!userAgent) {
        return "ua-none";
    }

    return sha256Short(userAgent);
}

async function shouldEmitAlertWithCooldown(key: string): Promise<boolean> {
    const redisKey = `auth:reset:alert:${key}`;

    try {
        const redisResult = await getRedisClient().set(
            redisKey,
            "1",
            "EX",
            AUTH_RESET_ALERT_COOLDOWN_SECONDS,
            "NX",
        );
        if (redisResult === "OK") {
            return true;
        }
        if (redisResult === null) {
            return false;
        }
    } catch {
        // Fallback to local cooldown map when Redis is unavailable.
    }

    const now = Date.now();
    const existingExpiry = localAlertCooldown.get(redisKey) || 0;
    if (existingExpiry > now) {
        return false;
    }

    localAlertCooldown.set(redisKey, now + AUTH_RESET_ALERT_COOLDOWN_SECONDS * 1000);
    return true;
}

export async function logResetSecurityEvent(options: {
    req: Request;
    flow: ResetSecurityFlow;
    event: string;
    reason: string;
    result: "allowed" | "blocked" | "suspicious";
    severity?: SecuritySeverity;
    includeLiveAlert?: boolean;
    extra?: Record<string, unknown>;
}): Promise<void> {
    const ip = getClientIpFromRequest(options.req);
    const identifierHash = getResetIdentifierHashFromBody(options.req.body);
    const uaFingerprint = getUserAgentFingerprint(options.req);
    const severity = options.severity || (options.result === "blocked" ? "warning" : "info");

    logger.security(options.event, {
        action: options.event,
        result: options.result,
        reason: options.reason,
        ip,
    });

    logger.warn("Reset security telemetry", {
        action: options.event,
        flow: options.flow,
        path: options.req.originalUrl || options.req.path,
        method: options.req.method,
        ip,
        identifierHash,
        userAgentFingerprint: uaFingerprint,
        result: options.result,
        reason: options.reason,
        severity,
        ...options.extra,
    });

    if (!options.includeLiveAlert) {
        return;
    }

    const alertCooldownKey = `${options.flow}:${ip}:${options.event}`;
    const shouldEmit = await shouldEmitAlertWithCooldown(alertCooldownKey);
    if (!shouldEmit) {
        return;
    }

    await emitSystemAlert({
        title: "Auth reset protection triggered",
        titleAr: "تم تفعيل حماية استعادة الحساب",
        message: `Flow ${options.flow} blocked suspicious activity from IP ${ip}. Reason: ${options.reason}`,
        messageAr: `تم حظر نشاط مريب في مسار ${options.flow} من العنوان ${ip}. السبب: ${options.reason}`,
        severity,
        deepLink: "/admin/audit-logs",
        entityType: "auth_reset_protection",
        entityId: `${options.flow}:${ip}`,
    });
}

function getBruteForceFailKey(flow: ResetSecurityFlow, ip: string): string {
    return `auth:reset:bf:${flow}:fail:${ip}`;
}

function getBruteForceBlockKey(flow: ResetSecurityFlow, ip: string): string {
    return `auth:reset:bf:${flow}:block:${ip}`;
}

export async function getResetBruteForceBlockState(req: Request, flow: ResetSecurityFlow): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
    const ip = getClientIpFromRequest(req);
    const blockKey = getBruteForceBlockKey(flow, ip);

    try {
        const ttl = await getRedisClient().ttl(blockKey);
        if (ttl > 0) {
            await logResetSecurityEvent({
                req,
                flow,
                event: "reset_bruteforce_block_active",
                reason: "temporary_block_active",
                result: "blocked",
                severity: "critical",
                includeLiveAlert: true,
                extra: { retryAfterSeconds: ttl },
            });

            return {
                blocked: true,
                retryAfterSeconds: ttl,
            };
        }
    } catch {
        // Fail-open to avoid blocking users if Redis has transient issues.
    }

    return {
        blocked: false,
        retryAfterSeconds: 0,
    };
}

export async function registerResetBruteForceFailure(req: Request, flow: ResetSecurityFlow, reason: string): Promise<void> {
    const ip = getClientIpFromRequest(req);
    const failKey = getBruteForceFailKey(flow, ip);
    const blockKey = getBruteForceBlockKey(flow, ip);

    try {
        const client = getRedisClient();
        const failures = await client.incr(failKey);
        if (failures === 1) {
            await client.expire(failKey, AUTH_RESET_BRUTE_WINDOW_SECONDS);
        }

        if (failures >= AUTH_RESET_BRUTE_MAX_FAILURES) {
            await client.set(blockKey, "1", "EX", AUTH_RESET_BRUTE_BLOCK_SECONDS);
            await logResetSecurityEvent({
                req,
                flow,
                event: "reset_bruteforce_blocked",
                reason,
                result: "blocked",
                severity: "critical",
                includeLiveAlert: true,
                extra: {
                    failures,
                    blockSeconds: AUTH_RESET_BRUTE_BLOCK_SECONDS,
                },
            });
            return;
        }

        const warnThreshold = Math.max(2, Math.floor(AUTH_RESET_BRUTE_MAX_FAILURES / 2));
        if (failures >= warnThreshold) {
            await logResetSecurityEvent({
                req,
                flow,
                event: "reset_bruteforce_suspected",
                reason,
                result: "suspicious",
                severity: "warning",
                includeLiveAlert: false,
                extra: {
                    failures,
                    threshold: AUTH_RESET_BRUTE_MAX_FAILURES,
                },
            });
        }
    } catch {
        // Non-blocking telemetry path.
    }
}

export async function clearResetBruteForceFailures(req: Request, flow: ResetSecurityFlow): Promise<void> {
    const ip = getClientIpFromRequest(req);
    const failKey = getBruteForceFailKey(flow, ip);
    const blockKey = getBruteForceBlockKey(flow, ip);

    try {
        await getRedisClient().del(failKey, blockKey);
    } catch {
        // Non-blocking cleanup path.
    }
}
