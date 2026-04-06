import { createHash } from "crypto";
import type { NextFunction, Response } from "express";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
    paymentIpActivities,
    paymentIpBlocks,
    paymentOperationTokens,
    type PaymentOperationType,
    users,
} from "@shared/schema";
import { db } from "../db";
import { emitSystemAlert } from "./admin-alerts";
import { logger } from "./logger";
import type { AuthRequest } from "../routes/middleware";

const PAYMENT_TOKEN_TTL_MS = Math.max(30_000, Number(process.env.PAYMENT_TOKEN_TTL_MS || 120_000));
const PAYMENT_IP_WINDOW_HOURS = Math.max(1, Number(process.env.PAYMENT_IP_WINDOW_HOURS || 24));
const PAYMENT_IP_DISTINCT_USERS_THRESHOLD = Math.max(2, Number(process.env.PAYMENT_IP_DISTINCT_USERS_THRESHOLD || 2));
const PAYMENT_IP_MIN_OPERATIONS_FOR_AUTO_BLOCK = Math.max(1, Number(process.env.PAYMENT_IP_MIN_OPERATIONS_FOR_AUTO_BLOCK || 3));
const PAYMENT_IP_RISK_SCORE_BLOCK_THRESHOLD = Math.min(100, Math.max(10, Number(process.env.PAYMENT_IP_RISK_SCORE_BLOCK_THRESHOLD || 80)));
const PAYMENT_IP_AUTO_BLOCK_ENABLED = process.env.PAYMENT_IP_AUTO_BLOCK_ENABLED !== "false";
const PAYMENT_IP_IGNORE_PRIVATE_RANGES = process.env.PAYMENT_IP_IGNORE_PRIVATE_RANGES === "true";

export type PaymentIpRiskLevel = "low" | "medium" | "high" | "critical";
export type PaymentIpRecommendedAction = "allow" | "monitor" | "review" | "block" | "blocked";

interface PaymentIpRiskMetrics {
    distinctUsers: number;
    operationsCount: number;
    operationTypesCount: number;
    tokenFailures: number;
    pendingTokens: number;
    isBlocked?: boolean;
}

interface PaymentIpRiskAssessment {
    score: number;
    level: PaymentIpRiskLevel;
    reasons: string[];
    recommendedAction: PaymentIpRecommendedAction;
}

function now(): Date {
    return new Date();
}

export function normalizeIpAddress(rawIp?: string | null): string {
    const baseValue = (rawIp || "unknown").split(",")[0]?.trim() || "unknown";
    if (baseValue.startsWith("::ffff:")) {
        return baseValue.slice(7);
    }
    if (baseValue === "::1") {
        return "127.0.0.1";
    }
    return baseValue;
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isPrivateOrLocalIp(ipAddress: string): boolean {
    if (!ipAddress || ipAddress === "unknown" || ipAddress === "localhost") return true;
    if (ipAddress === "127.0.0.1" || ipAddress === "::1") return true;
    if (ipAddress.startsWith("10.")) return true;
    if (ipAddress.startsWith("192.168.")) return true;
    if (ipAddress.startsWith("169.254.")) return true;

    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ipAddress)) {
        return true;
    }

    return false;
}

function computePaymentIpRisk(metrics: PaymentIpRiskMetrics): PaymentIpRiskAssessment {
    let score = 0;
    const reasons: string[] = [];

    if (metrics.distinctUsers >= 2) {
        score += 22;
        reasons.push(`shared by ${metrics.distinctUsers} accounts`);
    }
    if (metrics.distinctUsers >= 3) {
        score += 18;
    }
    if (metrics.distinctUsers >= 5) {
        score += 20;
    }

    if (metrics.operationsCount >= 8) {
        score += 8;
        reasons.push(`${metrics.operationsCount} payment operations in the analysis window`);
    }
    if (metrics.operationsCount >= 20) {
        score += 12;
    }
    if (metrics.operationsCount >= 50) {
        score += 15;
    }

    if (metrics.operationTypesCount >= 3) {
        score += 10;
        reasons.push(`high operation diversity (${metrics.operationTypesCount} operation types)`);
    }

    if (metrics.tokenFailures >= 2) {
        score += 10;
        reasons.push(`${metrics.tokenFailures} failed/cancelled/expired operation tokens`);
    }
    if (metrics.tokenFailures >= 5) {
        score += 15;
    }
    if (metrics.tokenFailures >= 10) {
        score += 20;
    }

    const operationsPerUser = metrics.distinctUsers > 0 ? metrics.operationsCount / metrics.distinctUsers : 0;
    if (metrics.distinctUsers >= 2 && operationsPerUser >= 10) {
        score += 8;
        reasons.push(`high operations per account (${operationsPerUser.toFixed(1)})`);
    }

    if (metrics.pendingTokens >= 3) {
        score += 6;
    }

    const boundedScore = Math.min(100, Math.max(0, score));
    const level: PaymentIpRiskLevel = boundedScore >= 80
        ? "critical"
        : boundedScore >= 60
            ? "high"
            : boundedScore >= 35
                ? "medium"
                : "low";

    const recommendedAction: PaymentIpRecommendedAction = metrics.isBlocked
        ? "blocked"
        : level === "critical"
            ? "block"
            : level === "high"
                ? "review"
                : level === "medium"
                    ? "monitor"
                    : "allow";

    return {
        score: boundedScore,
        level,
        reasons,
        recommendedAction,
    };
}

async function getIpAggregateMetrics(ipAddress: string, since: Date): Promise<{
    distinctUsers: number;
    operationsCount: number;
    operationTypesCount: number;
    tokenFailures: number;
    pendingTokens: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
}> {
    const [activity] = await db
        .select({
            distinctUsers: sql<number>`count(distinct ${paymentIpActivities.userId})::int`,
            operationsCount: sql<number>`count(*)::int`,
            operationTypesCount: sql<number>`count(distinct ${paymentIpActivities.operation})::int`,
            firstSeenAt: sql<string | null>`min(${paymentIpActivities.createdAt})::text`,
            lastSeenAt: sql<string | null>`max(${paymentIpActivities.createdAt})::text`,
        })
        .from(paymentIpActivities)
        .where(and(
            eq(paymentIpActivities.ipAddress, ipAddress),
            gte(paymentIpActivities.createdAt, since),
        ));

    const [tokens] = await db
        .select({
            tokenFailures: sql<number>`count(*) filter (where ${paymentOperationTokens.status} in ('failed','cancelled','expired'))::int`,
            pendingTokens: sql<number>`count(*) filter (where ${paymentOperationTokens.status} = 'pending')::int`,
        })
        .from(paymentOperationTokens)
        .where(and(
            eq(paymentOperationTokens.ipAddress, ipAddress),
            gte(paymentOperationTokens.createdAt, since),
        ));

    return {
        distinctUsers: Number(activity?.distinctUsers || 0),
        operationsCount: Number(activity?.operationsCount || 0),
        operationTypesCount: Number(activity?.operationTypesCount || 0),
        tokenFailures: Number(tokens?.tokenFailures || 0),
        pendingTokens: Number(tokens?.pendingTokens || 0),
        firstSeenAt: toIsoOrNull(activity?.firstSeenAt),
        lastSeenAt: toIsoOrNull(activity?.lastSeenAt),
    };
}

function getOperationTokenHeader(req: AuthRequest): string | null {
    const header = req.headers["x-operation-token"];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || typeof value !== "string") {
        return null;
    }
    return value.trim();
}

function hashPayload(payload: unknown): string {
    try {
        const stable = JSON.stringify(payload ?? {});
        return createHash("sha256").update(stable).digest("hex");
    } catch {
        return createHash("sha256").update("{}").digest("hex");
    }
}

export async function getPaymentIpBlock(ipAddress: string) {
    const [blocked] = await db
        .select()
        .from(paymentIpBlocks)
        .where(and(eq(paymentIpBlocks.ipAddress, ipAddress), eq(paymentIpBlocks.isActive, true)))
        .limit(1);
    return blocked;
}

async function autoBlockIpIfNeeded(ipAddress: string, triggerUserId: string): Promise<{ blocked: boolean; reason?: string }> {
    if (!PAYMENT_IP_AUTO_BLOCK_ENABLED) {
        return { blocked: false };
    }

    if (PAYMENT_IP_IGNORE_PRIVATE_RANGES && isPrivateOrLocalIp(ipAddress)) {
        return { blocked: false };
    }

    const defaultWindowStart = new Date(Date.now() - PAYMENT_IP_WINDOW_HOURS * 60 * 60 * 1000);

    const [ipHistory] = await db
        .select({ unblockedAt: paymentIpBlocks.unblockedAt })
        .from(paymentIpBlocks)
        .where(eq(paymentIpBlocks.ipAddress, ipAddress))
        .limit(1);

    const thresholdWindowStart = ipHistory?.unblockedAt
        ? new Date(Math.max(defaultWindowStart.getTime(), new Date(ipHistory.unblockedAt).getTime()))
        : defaultWindowStart;

    const metrics = await getIpAggregateMetrics(ipAddress, thresholdWindowStart);
    const risk = computePaymentIpRisk({
        distinctUsers: metrics.distinctUsers,
        operationsCount: metrics.operationsCount,
        operationTypesCount: metrics.operationTypesCount,
        tokenFailures: metrics.tokenFailures,
        pendingTokens: metrics.pendingTokens,
        isBlocked: false,
    });

    const meetsDistinctAndVolumeRule = metrics.distinctUsers >= PAYMENT_IP_DISTINCT_USERS_THRESHOLD
        && metrics.operationsCount >= PAYMENT_IP_MIN_OPERATIONS_FOR_AUTO_BLOCK;
    const meetsRiskScoreRule = risk.score >= PAYMENT_IP_RISK_SCORE_BLOCK_THRESHOLD;

    if (!meetsDistinctAndVolumeRule && !meetsRiskScoreRule) {
        return { blocked: false };
    }

    const existingBlock = await getPaymentIpBlock(ipAddress);
    if (existingBlock) {
        return { blocked: true, reason: existingBlock.blockReason };
    }

    const reason = risk.reasons.length > 0
        ? `Risk score ${risk.score}/100 (${risk.level}) for payment operations: ${risk.reasons.join("; ")}`
        : `Risk score ${risk.score}/100 (${risk.level}) for payment operations`;

    await db.insert(paymentIpBlocks).values({
        ipAddress,
        isActive: true,
        blockReason: reason,
        autoBlocked: true,
        blockedBy: null,
        metadata: JSON.stringify({
            distinctUsers: metrics.distinctUsers,
            operationsCount: metrics.operationsCount,
            operationTypesCount: metrics.operationTypesCount,
            tokenFailures: metrics.tokenFailures,
            pendingTokens: metrics.pendingTokens,
            windowHours: PAYMENT_IP_WINDOW_HOURS,
            distinctUsersThreshold: PAYMENT_IP_DISTINCT_USERS_THRESHOLD,
            minOperationsThreshold: PAYMENT_IP_MIN_OPERATIONS_FOR_AUTO_BLOCK,
            riskScoreThreshold: PAYMENT_IP_RISK_SCORE_BLOCK_THRESHOLD,
            riskScore: risk.score,
            riskLevel: risk.level,
            riskReasons: risk.reasons,
            triggerUserId,
        }),
    }).onConflictDoUpdate({
        target: paymentIpBlocks.ipAddress,
        set: {
            isActive: true,
            blockReason: reason,
            autoBlocked: true,
            blockedBy: null,
            unblockedBy: null,
            unblockedAt: null,
            metadata: JSON.stringify({
                distinctUsers: metrics.distinctUsers,
                operationsCount: metrics.operationsCount,
                operationTypesCount: metrics.operationTypesCount,
                tokenFailures: metrics.tokenFailures,
                pendingTokens: metrics.pendingTokens,
                windowHours: PAYMENT_IP_WINDOW_HOURS,
                distinctUsersThreshold: PAYMENT_IP_DISTINCT_USERS_THRESHOLD,
                minOperationsThreshold: PAYMENT_IP_MIN_OPERATIONS_FOR_AUTO_BLOCK,
                riskScoreThreshold: PAYMENT_IP_RISK_SCORE_BLOCK_THRESHOLD,
                riskScore: risk.score,
                riskLevel: risk.level,
                riskReasons: risk.reasons,
                triggerUserId,
            }),
            updatedAt: now(),
        },
    });

    await emitSystemAlert({
        title: "Payment IP Auto-Blocked",
        titleAr: "تم حظر IP تلقائيًا لعمليات الدفع",
        message: `IP ${ipAddress} was auto-blocked (risk ${risk.score}/100, ${risk.level}) after payment risk analysis.`,
        messageAr: `تم حظر العنوان ${ipAddress} تلقائيًا (مستوى الخطورة ${risk.score}/100، ${risk.level}) بعد تحليل مخاطر الدفع.`,
        severity: "urgent",
        deepLink: "/admin/payment-security",
        entityType: "payment_ip_block",
        entityId: ipAddress,
    }).catch((error) => {
        logger.warn("Failed to emit payment IP auto-block alert", {
            action: "payment_ip_alert",
            error: error instanceof Error ? error.message : String(error),
            ipAddress,
        });
    });

    return { blocked: true, reason };
}

export function paymentIpGuard(operation: PaymentOperationType) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({ error: "Authentication required" });
            }

            const ipAddress = normalizeIpAddress(req.ip || null);
            const existingBlock = await getPaymentIpBlock(ipAddress);
            if (existingBlock) {
                return res.status(403).json({
                    error: "This IP is blocked from payment operations",
                    errorCode: "PAYMENT_IP_BLOCKED",
                });
            }

            await db.insert(paymentIpActivities).values({
                ipAddress,
                userId: req.user.id,
                operation,
                requestPath: req.path,
                operationToken: null,
            });

            const riskResult = await autoBlockIpIfNeeded(ipAddress, req.user.id);
            if (riskResult.blocked) {
                return res.status(403).json({
                    error: "This IP is blocked from payment operations",
                    errorCode: "PAYMENT_IP_BLOCKED",
                });
            }

            return next();
        } catch (error) {
            logger.error("Payment IP guard failed", error instanceof Error ? error : undefined, {
                path: req.path,
                method: req.method,
            });
            return res.status(500).json({ error: "Failed to validate payment IP security" });
        }
    };
}

type ReserveTokenResult =
    | { ok: true; token: string }
    | { ok: false; statusCode: number; error: string; errorCode: string };

async function reserveOperationToken(req: AuthRequest, operation: PaymentOperationType): Promise<ReserveTokenResult> {
    if (!req.user?.id) {
        return { ok: false, statusCode: 401, error: "Authentication required", errorCode: "AUTH_REQUIRED" };
    }

    const token = getOperationTokenHeader(req);
    if (!token) {
        return {
            ok: false,
            statusCode: 400,
            error: "Missing operation token",
            errorCode: "MISSING_OPERATION_TOKEN",
        };
    }

    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
        return {
            ok: false,
            statusCode: 400,
            error: "Invalid operation token format",
            errorCode: "INVALID_OPERATION_TOKEN",
        };
    }

    const ipAddress = normalizeIpAddress(req.ip || null);
    const requestHash = hashPayload(req.body);
    const currentTime = now();

    const txResult = await db.transaction(async (tx) => {
        await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, req.user!.id))
            .limit(1)
            .for("update");

        await tx
            .update(paymentOperationTokens)
            .set({
                status: "expired",
                finalizedAt: currentTime,
                failureReason: "Token expired",
            })
            .where(and(
                eq(paymentOperationTokens.userId, req.user!.id),
                eq(paymentOperationTokens.status, "pending"),
                lt(paymentOperationTokens.expiresAt, currentTime),
            ));

        const [existingToken] = await tx
            .select({
                status: paymentOperationTokens.status,
                expiresAt: paymentOperationTokens.expiresAt,
            })
            .from(paymentOperationTokens)
            .where(eq(paymentOperationTokens.token, token))
            .limit(1);

        if (existingToken) {
            const stillPending = existingToken.status === "pending" && new Date(existingToken.expiresAt).getTime() > Date.now();
            return {
                ok: false,
                statusCode: 409,
                error: stillPending ? "Operation is already in progress" : "Operation token was already used",
                errorCode: stillPending ? "OPERATION_IN_PROGRESS" : "OPERATION_TOKEN_USED",
            } as ReserveTokenResult;
        }

        const [pendingOperation] = await tx
            .select({ id: paymentOperationTokens.id })
            .from(paymentOperationTokens)
            .where(and(
                eq(paymentOperationTokens.userId, req.user!.id),
                eq(paymentOperationTokens.operation, operation),
                eq(paymentOperationTokens.status, "pending"),
                gte(paymentOperationTokens.expiresAt, currentTime),
            ))
            .limit(1);

        if (pendingOperation) {
            return {
                ok: false,
                statusCode: 409,
                error: "Another payment operation is already in progress",
                errorCode: "PENDING_OPERATION_EXISTS",
            } as ReserveTokenResult;
        }

        await tx.insert(paymentOperationTokens).values({
            token,
            userId: req.user!.id,
            operation,
            status: "pending",
            ipAddress,
            requestPath: req.path,
            requestHash,
            expiresAt: new Date(Date.now() + PAYMENT_TOKEN_TTL_MS),
        });

        return { ok: true, token } as ReserveTokenResult;
    });

    return txResult;
}

async function finalizeOperationToken(token: string, status: "completed" | "failed" | "cancelled", reason?: string): Promise<void> {
    await db
        .update(paymentOperationTokens)
        .set({
            status,
            failureReason: reason || null,
            finalizedAt: now(),
        })
        .where(and(
            eq(paymentOperationTokens.token, token),
            eq(paymentOperationTokens.status, "pending"),
        ));
}

export function paymentOperationTokenGuard(operation: PaymentOperationType) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const reservation = await reserveOperationToken(req, operation);
            if (!reservation.ok) {
                return res.status(reservation.statusCode).json({
                    error: reservation.error,
                    errorCode: reservation.errorCode,
                });
            }

            let finalized = false;
            const token = reservation.token;
            (req as AuthRequest & { paymentOperationToken?: string; paymentOperation?: PaymentOperationType }).paymentOperationToken = token;
            (req as AuthRequest & { paymentOperationToken?: string; paymentOperation?: PaymentOperationType }).paymentOperation = operation;

            const safeFinalize = (status: "completed" | "failed" | "cancelled", reason?: string) => {
                if (finalized) return;
                finalized = true;
                void finalizeOperationToken(token, status, reason).catch((error) => {
                    logger.warn("Failed to finalize payment operation token", {
                        action: "payment_token_finalize",
                        status,
                        reason,
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
            };

            res.once("finish", () => {
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    safeFinalize("completed");
                } else {
                    safeFinalize("failed", `HTTP_${res.statusCode}`);
                }
            });

            res.once("close", () => {
                if (!res.writableEnded) {
                    safeFinalize("cancelled", "CLIENT_DISCONNECTED");
                }
            });

            return next();
        } catch (error) {
            logger.error("Payment operation token guard failed", error instanceof Error ? error : undefined, {
                path: req.path,
                method: req.method,
            });
            return res.status(500).json({ error: "Failed to validate payment operation token" });
        }
    };
}

export async function cancelPaymentOperationToken(userId: string, token: string, reason = "CLIENT_CANCELLED"): Promise<boolean> {
    const result = await db
        .update(paymentOperationTokens)
        .set({
            status: "cancelled",
            failureReason: reason,
            finalizedAt: now(),
        })
        .where(and(
            eq(paymentOperationTokens.userId, userId),
            eq(paymentOperationTokens.token, token),
            eq(paymentOperationTokens.status, "pending"),
        ));

    return (result.rowCount || 0) > 0;
}

export async function listBlockedPaymentIps(limit = 200, activeOnly = true) {
    const query = db.select().from(paymentIpBlocks);
    if (activeOnly) {
        return query
            .where(eq(paymentIpBlocks.isActive, true))
            .orderBy(desc(paymentIpBlocks.blockedAt))
            .limit(limit);
    }
    return query.orderBy(desc(paymentIpBlocks.blockedAt)).limit(limit);
}

export async function blockPaymentIpManually(ipAddress: string, reason: string, adminId: string) {
    const safeIp = normalizeIpAddress(ipAddress);
    const [block] = await db.insert(paymentIpBlocks).values({
        ipAddress: safeIp,
        isActive: true,
        blockReason: reason,
        autoBlocked: false,
        blockedBy: adminId,
        unblockedBy: null,
        unblockedAt: null,
        metadata: JSON.stringify({ source: "admin_manual" }),
    }).onConflictDoUpdate({
        target: paymentIpBlocks.ipAddress,
        set: {
            isActive: true,
            blockReason: reason,
            autoBlocked: false,
            blockedBy: adminId,
            unblockedBy: null,
            unblockedAt: null,
            metadata: JSON.stringify({ source: "admin_manual" }),
            updatedAt: now(),
        },
    }).returning();

    return block;
}

export async function unblockPaymentIpManually(ipAddress: string, adminId: string, reason?: string): Promise<boolean> {
    const safeIp = normalizeIpAddress(ipAddress);
    const result = await db.update(paymentIpBlocks).set({
        isActive: false,
        unblockedBy: adminId,
        unblockedAt: now(),
        metadata: reason
            ? JSON.stringify({ source: "admin_manual_unblock", reason })
            : JSON.stringify({ source: "admin_manual_unblock" }),
        updatedAt: now(),
    }).where(and(
        eq(paymentIpBlocks.ipAddress, safeIp),
        eq(paymentIpBlocks.isActive, true),
    ));

    return (result.rowCount || 0) > 0;
}

export async function listPaymentIpUsage(limit = 200, windowHours = 24) {
    const since = new Date(Date.now() - Math.max(1, windowHours) * 60 * 60 * 1000);

    const usageRows = await db
        .select({
            ipAddress: paymentIpActivities.ipAddress,
            distinctUsers: sql<number>`count(distinct ${paymentIpActivities.userId})::int`,
            operationsCount: sql<number>`count(*)::int`,
            operationTypesCount: sql<number>`count(distinct ${paymentIpActivities.operation})::int`,
            firstSeenAt: sql<string | null>`min(${paymentIpActivities.createdAt})::text`,
            lastSeenAt: sql<string | null>`max(${paymentIpActivities.createdAt})::text`,
        })
        .from(paymentIpActivities)
        .where(gte(paymentIpActivities.createdAt, since))
        .groupBy(paymentIpActivities.ipAddress)
        .orderBy(desc(sql`max(${paymentIpActivities.createdAt})`))
        .limit(limit);

    const tokenRows = await db
        .select({
            ipAddress: paymentOperationTokens.ipAddress,
            tokenFailures: sql<number>`count(*) filter (where ${paymentOperationTokens.status} in ('failed','cancelled','expired'))::int`,
            pendingTokens: sql<number>`count(*) filter (where ${paymentOperationTokens.status} = 'pending')::int`,
        })
        .from(paymentOperationTokens)
        .where(and(
            sql`${paymentOperationTokens.ipAddress} is not null`,
            gte(paymentOperationTokens.createdAt, since),
        ))
        .groupBy(paymentOperationTokens.ipAddress);

    const tokenMap = new Map(tokenRows.map((row) => [row.ipAddress || "", {
        tokenFailures: Number(row.tokenFailures || 0),
        pendingTokens: Number(row.pendingTokens || 0),
    }]));

    const blockedRows = await db
        .select({
            ipAddress: paymentIpBlocks.ipAddress,
            blockReason: paymentIpBlocks.blockReason,
            autoBlocked: paymentIpBlocks.autoBlocked,
            blockedAt: paymentIpBlocks.blockedAt,
        })
        .from(paymentIpBlocks)
        .where(eq(paymentIpBlocks.isActive, true));

    const blockedMap = new Map(blockedRows.map((row) => [row.ipAddress, row]));

    return usageRows.map((row) => {
        const tokenStats = tokenMap.get(row.ipAddress) || { tokenFailures: 0, pendingTokens: 0 };
        const blocked = blockedMap.get(row.ipAddress);
        const risk = computePaymentIpRisk({
            distinctUsers: Number(row.distinctUsers || 0),
            operationsCount: Number(row.operationsCount || 0),
            operationTypesCount: Number(row.operationTypesCount || 0),
            tokenFailures: tokenStats.tokenFailures,
            pendingTokens: tokenStats.pendingTokens,
            isBlocked: Boolean(blocked),
        });

        return {
            ipAddress: row.ipAddress,
            distinctUsers: Number(row.distinctUsers || 0),
            operationsCount: Number(row.operationsCount || 0),
            operationTypesCount: Number(row.operationTypesCount || 0),
            tokenFailures: tokenStats.tokenFailures,
            pendingTokens: tokenStats.pendingTokens,
            firstSeenAt: toIsoOrNull(row.firstSeenAt),
            lastSeenAt: toIsoOrNull(row.lastSeenAt),
            isBlocked: Boolean(blocked),
            blockedReason: blocked?.blockReason || null,
            blockedAt: toIsoOrNull(blocked?.blockedAt),
            autoBlocked: blocked?.autoBlocked ?? null,
            riskScore: risk.score,
            riskLevel: risk.level,
            riskReasons: risk.reasons,
            recommendedAction: risk.recommendedAction,
        };
    });
}

export async function getPaymentSecurityOverview(windowHours = 72) {
    const normalizedWindowHours = Math.max(1, windowHours);
    const since = new Date(Date.now() - normalizedWindowHours * 60 * 60 * 1000);

    const [activeBlockStats] = await db
        .select({
            activeBlocks: sql<number>`count(*)::int`,
            autoBlocks: sql<number>`count(*) filter (where ${paymentIpBlocks.autoBlocked} = true)::int`,
            manualBlocks: sql<number>`count(*) filter (where ${paymentIpBlocks.autoBlocked} = false)::int`,
        })
        .from(paymentIpBlocks)
        .where(eq(paymentIpBlocks.isActive, true));

    const [activityStats] = await db
        .select({
            uniqueIps: sql<number>`count(distinct ${paymentIpActivities.ipAddress})::int`,
            uniqueAccounts: sql<number>`count(distinct ${paymentIpActivities.userId})::int`,
            operationsCount: sql<number>`count(*)::int`,
            lastActivityAt: sql<string | null>`max(${paymentIpActivities.createdAt})::text`,
        })
        .from(paymentIpActivities)
        .where(gte(paymentIpActivities.createdAt, since));

    const usageRows = await listPaymentIpUsage(1000, normalizedWindowHours);
    const mediumRiskIps = usageRows.filter((row) => row.riskScore >= 35).length;
    const highRiskIps = usageRows.filter((row) => row.riskScore >= 60).length;
    const criticalRiskIps = usageRows.filter((row) => row.riskScore >= 80).length;

    return {
        windowHours: normalizedWindowHours,
        activeBlocks: Number(activeBlockStats?.activeBlocks || 0),
        autoBlocks: Number(activeBlockStats?.autoBlocks || 0),
        manualBlocks: Number(activeBlockStats?.manualBlocks || 0),
        uniqueIps: Number(activityStats?.uniqueIps || 0),
        uniqueAccounts: Number(activityStats?.uniqueAccounts || 0),
        operationsCount: Number(activityStats?.operationsCount || 0),
        lastActivityAt: toIsoOrNull(activityStats?.lastActivityAt),
        mediumRiskIps,
        highRiskIps,
        criticalRiskIps,
    };
}

export async function getPaymentIpDetails(ipAddress: string, windowHours = 72, recentLimit = 100) {
    const safeIp = normalizeIpAddress(ipAddress);
    const normalizedWindowHours = Math.max(1, windowHours);
    const since = new Date(Date.now() - normalizedWindowHours * 60 * 60 * 1000);
    const boundedRecentLimit = Math.min(200, Math.max(10, recentLimit));

    const [activeBlock] = await db
        .select({
            isActive: paymentIpBlocks.isActive,
            blockReason: paymentIpBlocks.blockReason,
            autoBlocked: paymentIpBlocks.autoBlocked,
            blockedAt: paymentIpBlocks.blockedAt,
            unblockedAt: paymentIpBlocks.unblockedAt,
            metadata: paymentIpBlocks.metadata,
        })
        .from(paymentIpBlocks)
        .where(and(
            eq(paymentIpBlocks.ipAddress, safeIp),
            eq(paymentIpBlocks.isActive, true),
        ))
        .limit(1);

    const metrics = await getIpAggregateMetrics(safeIp, since);
    const risk = computePaymentIpRisk({
        distinctUsers: metrics.distinctUsers,
        operationsCount: metrics.operationsCount,
        operationTypesCount: metrics.operationTypesCount,
        tokenFailures: metrics.tokenFailures,
        pendingTokens: metrics.pendingTokens,
        isBlocked: Boolean(activeBlock),
    });

    const operationsByType = await db
        .select({
            operation: paymentIpActivities.operation,
            count: sql<number>`count(*)::int`,
        })
        .from(paymentIpActivities)
        .where(and(
            eq(paymentIpActivities.ipAddress, safeIp),
            gte(paymentIpActivities.createdAt, since),
        ))
        .groupBy(paymentIpActivities.operation)
        .orderBy(desc(sql`count(*)`));

    const usersByActivity = await db
        .select({
            userId: users.id,
            username: users.username,
            nickname: users.nickname,
            accountId: users.accountId,
            operationsCount: sql<number>`count(*)::int`,
            lastSeenAt: sql<string | null>`max(${paymentIpActivities.createdAt})::text`,
        })
        .from(paymentIpActivities)
        .innerJoin(users, eq(paymentIpActivities.userId, users.id))
        .where(and(
            eq(paymentIpActivities.ipAddress, safeIp),
            gte(paymentIpActivities.createdAt, since),
        ))
        .groupBy(users.id, users.username, users.nickname, users.accountId)
        .orderBy(desc(sql`count(*)`), desc(sql`max(${paymentIpActivities.createdAt})`))
        .limit(50);

    const recentActivities = await db
        .select({
            createdAt: paymentIpActivities.createdAt,
            operation: paymentIpActivities.operation,
            requestPath: paymentIpActivities.requestPath,
            operationToken: paymentIpActivities.operationToken,
            userId: users.id,
            username: users.username,
            nickname: users.nickname,
            accountId: users.accountId,
        })
        .from(paymentIpActivities)
        .innerJoin(users, eq(paymentIpActivities.userId, users.id))
        .where(and(
            eq(paymentIpActivities.ipAddress, safeIp),
            gte(paymentIpActivities.createdAt, since),
        ))
        .orderBy(desc(paymentIpActivities.createdAt))
        .limit(boundedRecentLimit);

    const tokenStatusBreakdownRows = await db
        .select({
            status: paymentOperationTokens.status,
            count: sql<number>`count(*)::int`,
        })
        .from(paymentOperationTokens)
        .where(and(
            eq(paymentOperationTokens.ipAddress, safeIp),
            gte(paymentOperationTokens.createdAt, since),
        ))
        .groupBy(paymentOperationTokens.status)
        .orderBy(desc(sql`count(*)`));

    const recentTokenEvents = await db
        .select({
            token: paymentOperationTokens.token,
            operation: paymentOperationTokens.operation,
            status: paymentOperationTokens.status,
            failureReason: paymentOperationTokens.failureReason,
            createdAt: paymentOperationTokens.createdAt,
            finalizedAt: paymentOperationTokens.finalizedAt,
            userId: users.id,
            username: users.username,
            nickname: users.nickname,
            accountId: users.accountId,
        })
        .from(paymentOperationTokens)
        .innerJoin(users, eq(paymentOperationTokens.userId, users.id))
        .where(and(
            eq(paymentOperationTokens.ipAddress, safeIp),
            gte(paymentOperationTokens.createdAt, since),
        ))
        .orderBy(desc(paymentOperationTokens.createdAt))
        .limit(Math.min(100, boundedRecentLimit));

    const tokenStatusMap = new Map<string, number>();
    for (const row of tokenStatusBreakdownRows) {
        tokenStatusMap.set(row.status, Number(row.count || 0));
    }

    return {
        ipAddress: safeIp,
        windowHours: normalizedWindowHours,
        metrics: {
            distinctUsers: metrics.distinctUsers,
            operationsCount: metrics.operationsCount,
            operationTypesCount: metrics.operationTypesCount,
            tokenFailures: metrics.tokenFailures,
            pendingTokens: metrics.pendingTokens,
            firstSeenAt: metrics.firstSeenAt,
            lastSeenAt: metrics.lastSeenAt,
            riskScore: risk.score,
            riskLevel: risk.level,
            riskReasons: risk.reasons,
            recommendedAction: risk.recommendedAction,
        },
        block: activeBlock
            ? {
                isActive: true,
                blockReason: activeBlock.blockReason,
                autoBlocked: activeBlock.autoBlocked,
                blockedAt: toIsoOrNull(activeBlock.blockedAt),
                unblockedAt: toIsoOrNull(activeBlock.unblockedAt),
                metadata: activeBlock.metadata,
            }
            : null,
        operationsByType: operationsByType.map((row) => ({
            operation: row.operation,
            count: Number(row.count || 0),
        })),
        usersByActivity: usersByActivity.map((row) => ({
            userId: row.userId,
            username: row.username,
            nickname: row.nickname,
            accountId: row.accountId,
            operationsCount: Number(row.operationsCount || 0),
            lastSeenAt: toIsoOrNull(row.lastSeenAt),
        })),
        recentActivities: recentActivities.map((row) => ({
            createdAt: toIsoOrNull(row.createdAt),
            operation: row.operation,
            requestPath: row.requestPath,
            operationToken: row.operationToken,
            userId: row.userId,
            username: row.username,
            nickname: row.nickname,
            accountId: row.accountId,
        })),
        tokenStatusSummary: {
            pending: tokenStatusMap.get("pending") || 0,
            completed: tokenStatusMap.get("completed") || 0,
            failed: tokenStatusMap.get("failed") || 0,
            cancelled: tokenStatusMap.get("cancelled") || 0,
            expired: tokenStatusMap.get("expired") || 0,
        },
        recentTokenEvents: recentTokenEvents.map((row) => ({
            token: row.token,
            operation: row.operation,
            status: row.status,
            failureReason: row.failureReason,
            createdAt: toIsoOrNull(row.createdAt),
            finalizedAt: toIsoOrNull(row.finalizedAt),
            userId: row.userId,
            username: row.username,
            nickname: row.nickname,
            accountId: row.accountId,
        })),
    };
}
