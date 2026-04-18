import { and, eq, inArray } from "drizzle-orm";
import { tournaments, tournamentMatches, type TournamentStatus } from "@shared/schema";
import { db } from "../db";

const TOURNAMENT_GAME_TYPE_ALIASES: Record<string, string> = {
    dominoes: "domino",
};

const ALLOWED_TOURNAMENT_FORMATS = new Set([
    "single_elimination",
    "double_elimination",
    "round_robin",
    "swiss",
]);

export function normalizeTournamentGameType(rawGameType: unknown): string {
    const normalized = String(rawGameType || "").trim().toLowerCase();
    return TOURNAMENT_GAME_TYPE_ALIASES[normalized] || normalized;
}

function parseOptionalDate(rawValue: unknown, fieldName: string): Date | null {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
        return null;
    }

    const parsed = new Date(String(rawValue));
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid ${fieldName}`);
    }

    return parsed;
}

function parseCurrencyString(rawValue: unknown, fieldName: string): string {
    const numericValue = Number.parseFloat(String(rawValue ?? "0"));
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        throw new Error(`${fieldName} must be a valid non-negative amount`);
    }

    return numericValue.toFixed(2);
}

function parseInteger(rawValue: unknown, fieldName: string, fallbackValue: number): number {
    const numericValue = Number.parseInt(String(rawValue ?? fallbackValue), 10);
    if (!Number.isFinite(numericValue)) {
        throw new Error(`Invalid ${fieldName}`);
    }

    return numericValue;
}

export interface NormalizedTournamentPayload {
    name: string;
    nameAr: string;
    description: string | null;
    descriptionAr: string | null;
    gameType: string;
    format: string;
    maxPlayers: number;
    minPlayers: number;
    entryFee: string;
    prizePool: string;
    startsAt: Date | null;
    endsAt: Date | null;
    registrationStartsAt: Date | null;
    registrationEndsAt: Date | null;
    totalRounds: number;
}

export function normalizeTournamentPayload(payload: Record<string, unknown>): NormalizedTournamentPayload {
    const name = String(payload.name || "").trim();
    const nameAr = String(payload.nameAr || "").trim();
    const gameType = normalizeTournamentGameType(payload.gameType);
    const format = String(payload.format || "single_elimination").trim().toLowerCase();
    const maxPlayers = parseInteger(payload.maxPlayers, "maxPlayers", 16);
    const minPlayers = parseInteger(payload.minPlayers, "minPlayers", 4);
    const startsAt = parseOptionalDate(payload.startsAt, "startsAt");
    const endsAt = parseOptionalDate(payload.endsAt, "endsAt");
    const registrationStartsAt = parseOptionalDate(payload.registrationStartsAt, "registrationStartsAt");
    const registrationEndsAt = parseOptionalDate(payload.registrationEndsAt, "registrationEndsAt");

    if (!name || !nameAr || !gameType) {
        throw new Error("Name, Arabic name, and game type are required");
    }

    if (!ALLOWED_TOURNAMENT_FORMATS.has(format)) {
        throw new Error("Unsupported tournament format");
    }

    if (minPlayers < 2) {
        throw new Error("Minimum players must be at least 2");
    }

    if (maxPlayers < 2) {
        throw new Error("Maximum players must be at least 2");
    }

    if (minPlayers > maxPlayers) {
        throw new Error("Minimum players cannot exceed maximum players");
    }

    if (endsAt && startsAt && endsAt < startsAt) {
        throw new Error("Tournament end time must be after the start time");
    }

    if (registrationStartsAt && registrationEndsAt && registrationEndsAt < registrationStartsAt) {
        throw new Error("Registration close time must be after the registration open time");
    }

    if (registrationEndsAt && startsAt && registrationEndsAt > startsAt) {
        throw new Error("Registration must close before the tournament starts");
    }

    return {
        name,
        nameAr,
        description: String(payload.description || "").trim() || null,
        descriptionAr: String(payload.descriptionAr || "").trim() || null,
        gameType,
        format,
        maxPlayers,
        minPlayers,
        entryFee: parseCurrencyString(payload.entryFee, "Entry fee"),
        prizePool: parseCurrencyString(payload.prizePool, "Prize pool"),
        startsAt,
        endsAt,
        registrationStartsAt,
        registrationEndsAt,
        totalRounds: Math.ceil(Math.log2(Math.max(2, maxPlayers))),
    };
}

export function isTournamentRegistrationOpen(
    tournament: typeof tournaments.$inferSelect,
    now: Date = new Date(),
): boolean {
    if (tournament.status !== "registration" && tournament.status !== "upcoming") {
        return false;
    }

    if (tournament.registrationStartsAt && now < tournament.registrationStartsAt) {
        return false;
    }

    if (tournament.registrationEndsAt && now > tournament.registrationEndsAt) {
        return false;
    }

    if (tournament.startsAt && now >= tournament.startsAt) {
        return false;
    }

    return true;
}

export function canDeleteTournament(status: TournamentStatus): boolean {
    return status === "upcoming" || status === "registration" || status === "cancelled";
}

export function isAllowedTournamentStatusTransition(
    currentStatus: TournamentStatus,
    nextStatus: TournamentStatus,
): boolean {
    if (currentStatus === nextStatus) {
        return true;
    }

    const allowedTransitions: Record<TournamentStatus, TournamentStatus[]> = {
        upcoming: ["registration", "cancelled"],
        registration: ["upcoming", "in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
    };

    return allowedTransitions[currentStatus]?.includes(nextStatus) ?? false;
}

export async function autoAdvanceTournamentByes(tournamentId: string, totalRounds: number): Promise<void> {
    let hasChanges = true;

    while (hasChanges) {
        hasChanges = false;

        for (let round = 1; round <= totalRounds; round += 1) {
            const matches = await db.select()
                .from(tournamentMatches)
                .where(and(
                    eq(tournamentMatches.tournamentId, tournamentId),
                    eq(tournamentMatches.round, round),
                ));

            for (const match of matches) {
                if (match.status === "completed") {
                    continue;
                }

                const winnerId = match.player1Id || match.player2Id;
                const onlyOnePlayerPresent = Boolean(winnerId) && (!match.player1Id || !match.player2Id);

                if (!onlyOnePlayerPresent || !winnerId) {
                    continue;
                }

                // For rounds beyond the first, only auto-advance when both source matches
                // have already resolved (or were structurally empty from bracket padding).
                if (round > 1) {
                    const sourceMatchNumbers = [((match.matchNumber * 2) - 1), (match.matchNumber * 2)];
                    const sourceMatches = await db.select({
                        id: tournamentMatches.id,
                        status: tournamentMatches.status,
                        player1Id: tournamentMatches.player1Id,
                        player2Id: tournamentMatches.player2Id,
                    })
                        .from(tournamentMatches)
                        .where(and(
                            eq(tournamentMatches.tournamentId, tournamentId),
                            eq(tournamentMatches.round, round - 1),
                            inArray(tournamentMatches.matchNumber, sourceMatchNumbers),
                        ));

                    const hasUnresolvedSourceWithPlayers = sourceMatches.some((sourceMatch) => {
                        if (sourceMatch.status === "completed") {
                            return false;
                        }

                        return Boolean(sourceMatch.player1Id || sourceMatch.player2Id);
                    });

                    if (hasUnresolvedSourceWithPlayers) {
                        continue;
                    }
                }

                await db.update(tournamentMatches)
                    .set({
                        winnerId,
                        status: "completed",
                        completedAt: new Date(),
                    })
                    .where(eq(tournamentMatches.id, match.id));

                if (round < totalRounds) {
                    const nextMatchNumber = Math.ceil(match.matchNumber / 2);
                    const assignTopSlot = match.matchNumber % 2 === 1;

                    await db.update(tournamentMatches)
                        .set(assignTopSlot ? { player1Id: winnerId } : { player2Id: winnerId })
                        .where(and(
                            eq(tournamentMatches.tournamentId, tournamentId),
                            eq(tournamentMatches.round, round + 1),
                            eq(tournamentMatches.matchNumber, nextMatchNumber),
                        ));
                }

                hasChanges = true;
            }
        }
    }
}
