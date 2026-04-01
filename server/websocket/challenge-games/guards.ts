import type { AuthenticatedSocket } from "../shared";
import { challengeGameRooms } from "../shared";

export function requireChallengePlayer(ws: AuthenticatedSocket, challengeId: string) {
    const room = challengeGameRooms.get(challengeId);

    if (!room) {
        ws.send(JSON.stringify({
            type: "challenge_error",
            error: "Room not ready",
            code: "room_not_ready",
            challengeId,
            recoverable: true,
        }));
        return { ok: false as const };
    }

    if (ws.activeChallengeId !== challengeId) {
        ws.send(JSON.stringify({
            type: "challenge_error",
            error: "Challenge session drift detected",
            code: "rejoin_required",
            challengeId,
            recoverable: true,
        }));
        return { ok: false as const };
    }

    if (ws.activeChallengeRole !== "player") {
        ws.send(JSON.stringify({
            type: "challenge_error",
            error: "Player role required",
            code: "player_required",
            challengeId,
            recoverable: false,
        }));
        return { ok: false as const };
    }

    if (!ws.userId || !room.players.has(ws.userId)) {
        ws.send(JSON.stringify({
            type: "challenge_error",
            error: "Not a player in this game",
            code: "rejoin_required",
            challengeId,
            recoverable: true,
        }));
        return { ok: false as const };
    }

    return { ok: true as const, room };
}
