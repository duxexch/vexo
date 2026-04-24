import type { AuthenticatedWebSocket } from "./types";
import { rooms } from "./types";
import { sendError } from "./utils";

const SPEED_MULTIPLIERS: Record<"normal" | "fast" | "turbo", number> = {
    normal: 1,
    fast: 0.65,
    turbo: 0.4,
};

export async function handleSetSpeedMode(
    ws: AuthenticatedWebSocket,
    payload: { mode: "normal" | "fast" | "turbo" },
): Promise<void> {
    if (!ws.userId) {
        sendError(ws, "Not authenticated");
        return;
    }
    const sessionId = ws.sessionId;
    if (!sessionId) {
        return;
    }
    const room = rooms.get(sessionId);
    if (!room) {
        return;
    }
    if (ws.isSpectator) {
        return;
    }
    if (!room.players.has(ws.userId)) {
        return;
    }
    const multiplier = SPEED_MULTIPLIERS[payload.mode];
    if (typeof multiplier !== "number") {
        return;
    }
    if (!room.playerSpeedMultipliers) {
        room.playerSpeedMultipliers = new Map();
    }
    room.playerSpeedMultipliers.set(ws.userId, multiplier);
}

/**
 * Effective AI think-time multiplier for a room: the minimum across all
 * connected players' preferences, clamped to a sensible floor so AI moves
 * never feel literally instantaneous. Returns 1 when no preference is set.
 */
export function getEffectiveAiSpeedMultiplier(
    playerSpeedMultipliers: Map<string, number> | undefined,
): number {
    if (!playerSpeedMultipliers || playerSpeedMultipliers.size === 0) {
        return 1;
    }
    let min = Infinity;
    for (const value of playerSpeedMultipliers.values()) {
        if (value < min) {
            min = value;
        }
    }
    if (!Number.isFinite(min)) {
        return 1;
    }
    return Math.max(0.4, Math.min(1, min));
}
