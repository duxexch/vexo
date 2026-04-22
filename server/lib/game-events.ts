import { eq } from "drizzle-orm";
import { gameEvents } from "@shared/schema";
import { db } from "../db";
import { logger } from "./logger";

type GameEventExecutor = Pick<typeof db, "insert" | "update">;

export interface AppendGameEventInput {
    eventId: string;
    idempotencyKey: string;
    sessionId?: string;
    challengeId?: string;
    challengeSessionId?: string;
    source: string;
    eventType: string;
    actorId: string;
    actorType?: string;
    moveType?: string;
    payload: Record<string, unknown>;
}

export interface AppendGameEventResult {
    duplicate: boolean;
    recordId?: string;
}

function isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code === "23505") {
        return true;
    }

    const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
    return message.toLowerCase().includes("duplicate key") || message.toLowerCase().includes("unique");
}

export async function appendGameEvent(
    input: AppendGameEventInput,
    executor: GameEventExecutor = db,
): Promise<AppendGameEventResult> {
    try {
        const [created] = await executor.insert(gameEvents).values({
            eventId: input.eventId,
            idempotencyKey: input.idempotencyKey,
            sessionId: input.sessionId,
            challengeId: input.challengeId,
            challengeSessionId: input.challengeSessionId,
            source: input.source,
            eventType: input.eventType,
            actorId: input.actorId,
            actorType: input.actorType || "player",
            moveType: input.moveType,
            payload: input.payload,
            status: "recorded",
        }).returning({ id: gameEvents.id });

        return { duplicate: false, recordId: created?.id };
    } catch (error) {
        if (isUniqueViolation(error)) {
            return { duplicate: true };
        }
        throw error;
    }
}

export async function finalizeGameEvent(
    recordId: string | undefined,
    status: "applied" | "rejected",
    errorCode?: string,
    executor: GameEventExecutor = db,
): Promise<void> {
    if (!recordId) {
        return;
    }

    try {
        await executor.update(gameEvents)
            .set({
                status,
                errorCode: errorCode || null,
                appliedAt: status === "applied" ? new Date() : null,
            })
            .where(eq(gameEvents.id, recordId));
    } catch (error) {
        logger.warn(`[GameEvents] Failed finalizing event ${recordId}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
