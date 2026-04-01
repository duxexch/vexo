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

export function requireChallengeParticipant(
    ws: AuthenticatedSocket,
    challengeId: string,
    options?: { allowSpectator?: boolean }
) {
    const allowSpectator = options?.allowSpectator ?? true;
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

    if (!ws.userId) {
        ws.send(JSON.stringify({
            type: "challenge_error",
            error: "Authentication required",
            code: "auth_required",
            challengeId,
            recoverable: false,
        }));
        return { ok: false as const };
    }

    if (ws.activeChallengeRole === "player") {
        if (!room.players.has(ws.userId)) {
            ws.send(JSON.stringify({
                type: "challenge_error",
                error: "Not a player in this game",
                code: "rejoin_required",
                challengeId,
                recoverable: true,
            }));
            return { ok: false as const };
        }
        return { ok: true as const, room, role: "player" as const };
    }

    if (allowSpectator && ws.activeChallengeRole === "spectator") {
        if (!room.spectators.has(ws.userId)) {
            ws.send(JSON.stringify({
                type: "challenge_error",
                error: "Not a spectator in this game",
                code: "rejoin_required",
                challengeId,
                recoverable: true,
            }));
            return { ok: false as const };
        }
        return { ok: true as const, room, role: "spectator" as const };
    }

    ws.send(JSON.stringify({
        type: "challenge_error",
        error: allowSpectator ? "Participant role required" : "Player role required",
        code: allowSpectator ? "participant_required" : "player_required",
        challengeId,
        recoverable: false,
    }));
    return { ok: false as const };
}
