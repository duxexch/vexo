import { z } from "zod";

const challengeIdSchema = z.string().trim().min(1).max(128);
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

const challengeGameMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("join_challenge_game"),
        challengeId: challengeIdSchema,
    }),
    z.object({
        type: z.literal("leave_challenge_game"),
        challengeId: challengeIdSchema,
    }),
    z.object({
        type: z.literal("game_move"),
        challengeId: challengeIdSchema,
        move: moveSchema,
    }),
    z.object({
        type: z.literal("roll_dice"),
        challengeId: challengeIdSchema,
    }),
    z.object({
        type: z.literal("end_turn"),
        challengeId: challengeIdSchema,
    }),
    z.object({
        type: z.literal("challenge_chat"),
        challengeId: challengeIdSchema,
        message: z.string().trim().min(1).max(500),
        isQuickMessage: z.boolean().optional(),
        quickMessageKey: shortStringSchema.optional(),
    }),
    z.object({
        type: z.literal("game_resign"),
        challengeId: challengeIdSchema,
    }),
    z.object({
        type: z.literal("offer_draw"),
        challengeId: challengeIdSchema,
    }),
    z.object({
        type: z.literal("respond_draw"),
        challengeId: challengeIdSchema,
        accept: z.boolean(),
    }),
    z.object({
        type: z.literal("gift_to_player"),
        challengeId: challengeIdSchema,
        recipientId: shortStringSchema,
        giftId: shortStringSchema,
        idempotencyKey: shortStringSchema.optional(),
    }),
    // Backward-compatibility alias used by some clients
    z.object({
        type: z.literal("send_gift"),
        challengeId: challengeIdSchema,
        recipientId: shortStringSchema,
        giftId: shortStringSchema,
        idempotencyKey: shortStringSchema.optional(),
    }),
]);

export type ChallengeGameMessage = z.infer<typeof challengeGameMessageSchema>;

type ValidationResult =
    | { ok: true; data: ChallengeGameMessage }
    | { ok: false; error: string };

export function validateChallengeGameMessage(data: unknown): ValidationResult {
    const parsed = challengeGameMessageSchema.safeParse(data);
    if (parsed.success) {
        return { ok: true, data: parsed.data };
    }

    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? issue.path.join(".") : "message";
    return {
        ok: false,
        error: `Invalid ${path}: ${issue?.message || "Malformed payload"}`,
    };
}
