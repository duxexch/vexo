import { z } from "zod";
import type { MoveData } from "../game-engines/types";

const sessionIdSchema = z.string().trim().min(1).max(128);
const shortStringSchema = z.string().trim().min(1).max(128);
const MAX_MOVE_KEYS = 40;
const MAX_MOVE_DEPTH = 4;
const MAX_MOVE_ARRAY_LENGTH = 32;
const MAX_MOVE_STRING_LENGTH = 512;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isSafeMoveValue(value: unknown, depth = 0): boolean {
    if (value === null) {
        return true;
    }

    if (typeof value === "string") {
        return value.length <= MAX_MOVE_STRING_LENGTH;
    }

    if (typeof value === "number") {
        return Number.isFinite(value);
    }

    if (typeof value === "boolean") {
        return true;
    }

    if (Array.isArray(value)) {
        if (value.length > MAX_MOVE_ARRAY_LENGTH || depth >= MAX_MOVE_DEPTH) {
            return false;
        }
        return value.every((item) => isSafeMoveValue(item, depth + 1));
    }

    if (!isPlainObject(value) || depth >= MAX_MOVE_DEPTH) {
        return false;
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_MOVE_KEYS) {
        return false;
    }

    for (const [key, nestedValue] of entries) {
        if (
            key.length > 64 ||
            key === "__proto__" ||
            key === "constructor" ||
            key === "prototype"
        ) {
            return false;
        }

        if (!isSafeMoveValue(nestedValue, depth + 1)) {
            return false;
        }
    }

    return true;
}

const moveSchema = z.object({
    type: z.string().trim().min(1).max(64).optional(),
}).passthrough().superRefine((move, ctx) => {
    const keys = Object.keys(move);
    if (keys.length > MAX_MOVE_KEYS) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `move has too many keys (max ${MAX_MOVE_KEYS})`,
        });
        return;
    }

    if (!isSafeMoveValue(move)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "move contains unsupported or unsafe nested values",
        });
    }
});

const gameWebSocketMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("authenticate"),
        payload: z.object({
            token: z.string().trim().min(1).max(4096),
        }),
    }),
    z.object({
        type: z.literal("ping"),
        payload: z.unknown().optional(),
    }),
    z.object({
        type: z.literal("join_game"),
        payload: z.object({
            sessionId: sessionIdSchema,
        }),
    }),
    z.object({
        type: z.literal("spectate"),
        payload: z.object({
            sessionId: sessionIdSchema,
        }),
    }),
    z.object({
        type: z.literal("make_move"),
        payload: z.object({
            move: moveSchema,
            expectedTurn: z.number().int().nonnegative().optional(),
            idempotencyKey: shortStringSchema.optional(),
        }),
    }),
    z.object({
        type: z.literal("chat"),
        payload: z.object({
            message: z.string().trim().min(1).max(500),
        }),
    }),
    z.object({
        type: z.literal("send_gift"),
        payload: z.object({
            recipientId: shortStringSchema,
            giftItemId: shortStringSchema,
            quantity: z.number().int().positive().max(100),
            message: z.string().max(500).optional(),
        }),
    }),
    z.object({
        type: z.literal("leave_game"),
        payload: z.unknown().optional(),
    }),
    z.object({
        type: z.literal("get_state"),
        payload: z.object({
            sessionId: sessionIdSchema,
        }),
    }),
    z.object({
        type: z.literal("resign"),
        payload: z.object({
            sessionId: sessionIdSchema,
        }),
    }),
    z.object({
        type: z.literal("offer_draw"),
        payload: z.object({
            sessionId: sessionIdSchema,
        }),
    }),
    z.object({
        type: z.literal("respond_draw"),
        payload: z.object({
            accept: z.boolean(),
        }),
    }),
]);

type ParsedMessage = z.infer<typeof gameWebSocketMessageSchema>;

export type ValidatedGameMessage =
    | { type: "authenticate"; payload: { token: string } }
    | { type: "ping"; payload?: unknown }
    | { type: "join_game"; payload: { sessionId: string } }
    | { type: "spectate"; payload: { sessionId: string } }
    | { type: "make_move"; payload: { move: MoveData; expectedTurn?: number; idempotencyKey?: string } }
    | { type: "chat"; payload: { message: string } }
    | {
        type: "send_gift";
        payload: {
            recipientId: string;
            giftItemId: string;
            quantity: number;
            message?: string;
        };
    }
    | { type: "leave_game"; payload?: unknown }
    | { type: "get_state"; payload: { sessionId: string } }
    | { type: "resign"; payload: { sessionId: string } }
    | { type: "offer_draw"; payload: { sessionId: string } }
    | { type: "respond_draw"; payload: { accept: boolean } };

export interface GameWebSocketProtocolError {
    message: string;
    code: string;
}

export function createGameWsProtocolError(message: string, code: string): GameWebSocketProtocolError {
    return { message, code };
}

type ValidationResult =
    | { ok: true; data: ValidatedGameMessage }
    | { ok: false; error: GameWebSocketProtocolError };

export function validateGameMessage(input: unknown): ValidationResult {
    const parsed = gameWebSocketMessageSchema.safeParse(input);
    if (parsed.success) {
        return { ok: true, data: parsed.data as ParsedMessage as ValidatedGameMessage };
    }

    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? issue.path.join(".") : "message";
    return {
        ok: false,
        error: createGameWsProtocolError(
            `Invalid ${path}: ${issue?.message || "Malformed payload"}`,
            "invalid_payload"
        ),
    };
}
