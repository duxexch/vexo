import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { marketerCommissionSchedulerRuns } from "@shared/schema";
import { logger } from "./logger";
import {
    releaseEligibleMarketerCommissions,
    syncMarketerRevshareCommissions,
} from "./affiliate-commissions";

type SchedulerTrigger = "auto" | "manual";

type RunSchedulerOptions = {
    trigger: SchedulerTrigger;
    releaseOnly?: boolean;
    referrerUserId?: string;
    maxRetries?: number;
    idempotencyKey?: string;
};

const ADVISORY_LOCK_KEY_A = 841926;
const ADVISORY_LOCK_KEY_B = 220417;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 3;

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRunKey(): string {
    return `mkt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNodeId(): string {
    return `${process.env.HOSTNAME || "local"}:${process.pid}`;
}

async function tryAcquireLock(): Promise<boolean> {
    const result = await db.execute(sql`
    SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY_A}, ${ADVISORY_LOCK_KEY_B}) AS locked
  `);

    const row = (result.rows as Array<Record<string, unknown>>)?.[0];
    return row?.locked === true;
}

async function releaseLock(): Promise<void> {
    await db.execute(sql`
    SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY_A}, ${ADVISORY_LOCK_KEY_B})
  `);
}

export async function runMarketerCommissionScheduler(options: RunSchedulerOptions): Promise<{ runId: string; status: string; deduplicated?: boolean }> {
    const runKey = generateRunKey();
    const nodeId = getNodeId();
    const maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    const idempotencyKey = typeof options.idempotencyKey === "string" && options.idempotencyKey.trim().length > 0
        ? options.idempotencyKey.trim().slice(0, 120)
        : null;

    if (idempotencyKey) {
        const [existingByKey] = await db.select({
            id: marketerCommissionSchedulerRuns.id,
            status: marketerCommissionSchedulerRuns.status,
        })
            .from(marketerCommissionSchedulerRuns)
            .where(eq(marketerCommissionSchedulerRuns.idempotencyKey, idempotencyKey))
            .limit(1);

        if (existingByKey) {
            return {
                runId: existingByKey.id,
                status: String(existingByKey.status),
                deduplicated: true,
            };
        }
    }

    let runRow: { id: string };
    try {
        [runRow] = await db.insert(marketerCommissionSchedulerRuns)
            .values({
                trigger: options.trigger,
                status: "running",
                runKey,
                idempotencyKey,
                nodeId,
                attemptCount: 1,
                retryCount: 0,
                metadata: JSON.stringify({
                    releaseOnly: options.releaseOnly === true,
                    referrerUserId: options.referrerUserId || null,
                }),
                startedAt: new Date(),
            })
            .returning({ id: marketerCommissionSchedulerRuns.id });
    } catch (error: unknown) {
        const message = toErrorMessage(error).toLowerCase();
        if (idempotencyKey && (message.includes("duplicate") || message.includes("unique"))) {
            const [existingAfterRace] = await db.select({
                id: marketerCommissionSchedulerRuns.id,
                status: marketerCommissionSchedulerRuns.status,
            })
                .from(marketerCommissionSchedulerRuns)
                .where(eq(marketerCommissionSchedulerRuns.idempotencyKey, idempotencyKey))
                .limit(1);

            if (existingAfterRace) {
                return {
                    runId: existingAfterRace.id,
                    status: String(existingAfterRace.status),
                    deduplicated: true,
                };
            }
        }
        throw error;
    }

    const runId = runRow.id;
    const lockAcquired = await tryAcquireLock();

    if (!lockAcquired) {
        await db.update(marketerCommissionSchedulerRuns)
            .set({
                status: "skipped",
                errorMessage: "Scheduler run skipped because advisory lock is held by another worker",
                attemptCount: 1,
                retryCount: 0,
                finishedAt: new Date(),
            })
            .where(sql`${marketerCommissionSchedulerRuns.id} = ${runId}`);

        logger.warn(`[Marketer Scheduler] skipped run=${runId} lock held by another worker`);
        return { runId, status: "skipped" };
    }

    const attemptErrors: string[] = [];

    try {
        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
            try {
                const revshare = options.releaseOnly === true
                    ? { generatedEvents: 0, generatedAmount: "0.00" }
                    : await syncMarketerRevshareCommissions({ referrerUserId: options.referrerUserId });

                const release = await releaseEligibleMarketerCommissions({ referrerUserId: options.referrerUserId });

                await db.update(marketerCommissionSchedulerRuns)
                    .set({
                        status: "success",
                        attemptCount: attempt,
                        retryCount: attempt - 1,
                        generatedEvents: Number(revshare.generatedEvents || 0),
                        generatedAmount: String(revshare.generatedAmount || "0.00"),
                        releasedEvents: Number(release.releasedEvents || 0),
                        releasedAmount: String(release.releasedAmount || "0.00"),
                        errorMessage: attemptErrors.length > 0 ? attemptErrors.join(" | ") : null,
                        finishedAt: new Date(),
                    })
                    .where(sql`${marketerCommissionSchedulerRuns.id} = ${runId}`);

                logger.info(
                    `[Marketer Scheduler] success run=${runId} attempt=${attempt} generated=${revshare.generatedEvents}/${revshare.generatedAmount} released=${release.releasedEvents}/${release.releasedAmount}`,
                );

                return { runId, status: "success" };
            } catch (error: unknown) {
                const message = toErrorMessage(error);
                attemptErrors.push(`attempt ${attempt}: ${message}`);

                if (attempt >= maxRetries) {
                    await db.update(marketerCommissionSchedulerRuns)
                        .set({
                            status: "failed",
                            attemptCount: attempt,
                            retryCount: attempt - 1,
                            errorMessage: attemptErrors.join(" | "),
                            finishedAt: new Date(),
                        })
                        .where(sql`${marketerCommissionSchedulerRuns.id} = ${runId}`);

                    logger.error(`[Marketer Scheduler] failed run=${runId} attempt=${attempt} error=${message}`);
                    return { runId, status: "failed" };
                }

                await db.update(marketerCommissionSchedulerRuns)
                    .set({
                        attemptCount: attempt,
                        retryCount: attempt,
                        errorMessage: attemptErrors.join(" | "),
                    })
                    .where(sql`${marketerCommissionSchedulerRuns.id} = ${runId}`);

                const backoffMs = Math.min(20_000, 1_500 * (2 ** (attempt - 1)));
                logger.warn(`[Marketer Scheduler] retry run=${runId} nextAttempt=${attempt + 1} backoffMs=${backoffMs}`);
                await sleep(backoffMs);
            }
        }
    } finally {
        await releaseLock().catch((unlockError) => {
            logger.error("[Marketer Scheduler] failed to release advisory lock", unlockError instanceof Error ? unlockError : new Error(String(unlockError)));
        });
    }

    await db.update(marketerCommissionSchedulerRuns)
        .set({
            status: "failed",
            errorMessage: "Scheduler exited unexpectedly",
            finishedAt: new Date(),
        })
        .where(sql`${marketerCommissionSchedulerRuns.id} = ${runId}`);

    return { runId, status: "failed" };
}

export function startMarketerCommissionScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    const safeInterval = Math.max(60_000, intervalMs);

    const runAutoCycle = () => {
        void runMarketerCommissionScheduler({ trigger: "auto" }).catch((error) => {
            logger.error("[Marketer Scheduler] auto cycle crashed", error instanceof Error ? error : new Error(String(error)));
        });
    };

    setTimeout(runAutoCycle, 20_000);
    setInterval(runAutoCycle, safeInterval);

    logger.info(`[Marketer Scheduler] started (interval: ${Math.floor(safeInterval / 1000)}s)`);
}

export async function runMarketerCommissionSchedulerNow(input?: {
    releaseOnly?: boolean;
    referrerUserId?: string;
    idempotencyKey?: string;
}): Promise<{ runId: string; status: string; deduplicated?: boolean }> {
    return runMarketerCommissionScheduler({
        trigger: "manual",
        releaseOnly: input?.releaseOnly === true,
        referrerUserId: typeof input?.referrerUserId === "string" && input.referrerUserId.trim().length > 0
            ? input.referrerUserId.trim()
            : undefined,
        idempotencyKey: typeof input?.idempotencyKey === "string" ? input.idempotencyKey : undefined,
    });
}
