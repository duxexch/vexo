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
    const defaultWindowStart = new Date(Date.now() - PAYMENT_IP_WINDOW_HOURS * 60 * 60 * 1000);

    const [ipHistory] = await db
        .select({ unblockedAt: paymentIpBlocks.unblockedAt })
        .from(paymentIpBlocks)
        .where(eq(paymentIpBlocks.ipAddress, ipAddress))
        .limit(1);

    const thresholdWindowStart = ipHistory?.unblockedAt
        ? new Date(Math.max(defaultWindowStart.getTime(), new Date(ipHistory.unblockedAt).getTime()))
        : defaultWindowStart;

    const [usage] = await db
        .select({
            distinctUsers: sql<number>`count(distinct ${paymentIpActivities.userId})::int`,
        })
        .from(paymentIpActivities)
        .where(and(
            eq(paymentIpActivities.ipAddress, ipAddress),
            gte(paymentIpActivities.createdAt, thresholdWindowStart),
        ));

    const distinctUsers = Number(usage?.distinctUsers || 0);
    if (distinctUsers < PAYMENT_IP_DISTINCT_USERS_THRESHOLD) {
        return { blocked: false };
    }

    const existingBlock = await getPaymentIpBlock(ipAddress);
    if (existingBlock) {
        return { blocked: true, reason: existingBlock.blockReason };
    }

    const reason = `IP used by ${distinctUsers} different accounts in payment operations within ${PAYMENT_IP_WINDOW_HOURS}h`;

    await db.insert(paymentIpBlocks).values({
        ipAddress,
        isActive: true,
        blockReason: reason,
        autoBlocked: true,
        blockedBy: null,
        metadata: JSON.stringify({
            distinctUsers,
            windowHours: PAYMENT_IP_WINDOW_HOURS,
            threshold: PAYMENT_IP_DISTINCT_USERS_THRESHOLD,
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
                distinctUsers,
                windowHours: PAYMENT_IP_WINDOW_HOURS,
                threshold: PAYMENT_IP_DISTINCT_USERS_THRESHOLD,
                triggerUserId,
            }),
            updatedAt: now(),
        },
    });

    await emitSystemAlert({
        title: "Payment IP Auto-Blocked",
        titleAr: "تم حظر IP تلقائيًا لعمليات الدفع",
        message: `IP ${ipAddress} was auto-blocked after multi-account payment activity (${distinctUsers} accounts).`,
        messageAr: `تم حظر العنوان ${ipAddress} تلقائيًا بعد نشاط دفع متعدد الحسابات (${distinctUsers} حسابات).`,
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
            lastSeenAt: sql<string>`max(${paymentIpActivities.createdAt})::text`,
        })
        .from(paymentIpActivities)
        .where(gte(paymentIpActivities.createdAt, since))
        .groupBy(paymentIpActivities.ipAddress)
        .orderBy(desc(sql`max(${paymentIpActivities.createdAt})`))
        .limit(limit);

    const blocked = await db
        .select({ ipAddress: paymentIpBlocks.ipAddress })
        .from(paymentIpBlocks)
        .where(eq(paymentIpBlocks.isActive, true));

    const blockedSet = new Set(blocked.map((row) => row.ipAddress));

    return usageRows.map((row) => ({
        ...row,
        isBlocked: blockedSet.has(row.ipAddress),
    }));
}
