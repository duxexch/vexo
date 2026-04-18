import { and, eq, inArray, sql } from "drizzle-orm";
import {
    tournaments,
    tournamentMatches,
    tournamentParticipants,
    transactions,
    users,
    type TournamentStatus,
} from "@shared/schema";
import { db } from "../db";
import { sendNotification } from "../websocket";

const TOURNAMENT_GAME_TYPE_ALIASES: Record<string, string> = {
    dominoes: "domino",
};

const ALLOWED_TOURNAMENT_FORMATS = new Set([
    "single_elimination",
    "double_elimination",
    "round_robin",
    "swiss",
]);

const PRIZE_DISTRIBUTION_PRESETS: Record<string, number[]> = {
    winner_take_all: [100],
    top_2: [70, 30],
    top_3: [50, 30, 20],
    top_4: [45, 25, 18, 12],
    top_5: [40, 25, 15, 12, 8],
    top_8_balanced: [28, 20, 14, 10, 8, 7, 7, 6],
};

const ALLOWED_PRIZE_DISTRIBUTION_METHODS = new Set([
    ...Object.keys(PRIZE_DISTRIBUTION_PRESETS),
    "custom",
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

function parseOptionalPositiveInteger(rawValue: unknown, fieldName: string): number | null {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
        return null;
    }

    const numericValue = Number.parseInt(String(rawValue), 10);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }

    return numericValue;
}

function parseBoolean(rawValue: unknown, fieldName: string, fallbackValue: boolean): boolean {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
        return fallbackValue;
    }

    if (typeof rawValue === "boolean") {
        return rawValue;
    }

    const normalized = String(rawValue).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
    }

    throw new Error(`Invalid ${fieldName}`);
}

function parseOptionalMediaUrl(rawValue: unknown, fieldName: string): string | null {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
        return null;
    }

    const value = String(rawValue).trim();
    if (value.length > 2048) {
        throw new Error(`${fieldName} is too long`);
    }

    const isAllowed = value.startsWith("/uploads/")
        || value.startsWith("/storage/")
        || value.startsWith("http://")
        || value.startsWith("https://");

    if (!isAllowed) {
        throw new Error(`${fieldName} must reference an uploaded or public URL`);
    }

    return value;
}

function sanitizeSlug(rawValue: string): string {
    return rawValue
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 80);
}

export function buildTournamentShareSlug(name: string, rawSlug?: unknown): string {
    const requestedSlug = sanitizeSlug(String(rawSlug || ""));
    if (requestedSlug.length >= 3) {
        return requestedSlug;
    }

    const derivedSlug = sanitizeSlug(name);
    if (derivedSlug.length >= 3) {
        return derivedSlug;
    }

    return "tournament";
}

function parsePrizeDistributionArray(rawValue: unknown): number[] {
    if (Array.isArray(rawValue)) {
        return rawValue
            .map((entry) => Number.parseFloat(String(entry)))
            .filter((entry) => Number.isFinite(entry) && entry >= 0);
    }

    if (typeof rawValue === "string") {
        const value = rawValue.trim();
        if (!value) {
            return [];
        }

        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((entry) => Number.parseFloat(String(entry)))
                    .filter((entry) => Number.isFinite(entry) && entry >= 0);
            }
        } catch {
            // Fall through to comma parsing.
        }

        return value
            .split(",")
            .map((entry) => Number.parseFloat(entry.trim()))
            .filter((entry) => Number.isFinite(entry) && entry >= 0);
    }

    return [];
}

function normalizeDistributionToHundred(distribution: number[]): number[] {
    const clean = distribution
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry >= 0);

    const sum = clean.reduce((accumulator, entry) => accumulator + entry, 0);
    if (sum <= 0) {
        return [];
    }

    return clean.map((entry) => (entry / sum) * 100);
}

function getDefaultPrizeDistribution(method: string): number[] {
    return PRIZE_DISTRIBUTION_PRESETS[method] || PRIZE_DISTRIBUTION_PRESETS.top_3;
}

export interface NormalizedTournamentPayload {
    name: string;
    nameAr: string;
    description: string | null;
    descriptionAr: string | null;
    isPublished: boolean;
    coverImageUrl: string | null;
    promoVideoUrl: string | null;
    shareSlug: string;
    gameType: string;
    format: string;
    maxPlayers: number;
    minPlayers: number;
    autoStartOnFull: boolean;
    autoStartPlayerCount: number | null;
    entryFee: string;
    prizePool: string;
    prizeDistributionMethod: string;
    prizeDistribution: string;
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
    const isPublished = parseBoolean(payload.isPublished, "isPublished", true);
    const autoStartOnFull = parseBoolean(payload.autoStartOnFull, "autoStartOnFull", false);
    const requestedAutoStartPlayerCount = parseOptionalPositiveInteger(payload.autoStartPlayerCount, "autoStartPlayerCount");
    const shareSlug = buildTournamentShareSlug(name, payload.shareSlug);
    const coverImageUrl = parseOptionalMediaUrl(payload.coverImageUrl, "coverImageUrl");
    const promoVideoUrl = parseOptionalMediaUrl(payload.promoVideoUrl, "promoVideoUrl");
    const prizeDistributionMethod = String(payload.prizeDistributionMethod || "top_3").trim().toLowerCase();

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

    if (!ALLOWED_PRIZE_DISTRIBUTION_METHODS.has(prizeDistributionMethod)) {
        throw new Error("Unsupported prize distribution method");
    }

    let prizeDistributionValues: number[];
    if (prizeDistributionMethod === "custom") {
        prizeDistributionValues = parsePrizeDistributionArray(payload.prizeDistribution);
        if (prizeDistributionValues.length === 0) {
            throw new Error("Custom prize distribution is required");
        }
    } else {
        prizeDistributionValues = [...getDefaultPrizeDistribution(prizeDistributionMethod)];
    }

    if (prizeDistributionValues.length > maxPlayers) {
        throw new Error("Prize distribution cannot exceed max players");
    }

    const distributionSum = prizeDistributionValues.reduce((accumulator, entry) => accumulator + entry, 0);
    if (Math.abs(distributionSum - 100) > 0.01) {
        throw new Error("Prize distribution percentages must total 100");
    }

    if (registrationStartsAt && startsAt && registrationStartsAt > startsAt) {
        throw new Error("Registration cannot open after the tournament starts");
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

    let autoStartPlayerCount = requestedAutoStartPlayerCount;
    if (autoStartOnFull) {
        autoStartPlayerCount = requestedAutoStartPlayerCount ?? minPlayers;
        if (autoStartPlayerCount < minPlayers || autoStartPlayerCount > maxPlayers) {
            throw new Error("Auto-start threshold must be within min and max players");
        }
    } else {
        autoStartPlayerCount = null;
    }

    return {
        name,
        nameAr,
        description: String(payload.description || "").trim() || null,
        descriptionAr: String(payload.descriptionAr || "").trim() || null,
        isPublished,
        coverImageUrl,
        promoVideoUrl,
        shareSlug,
        gameType,
        format,
        maxPlayers,
        minPlayers,
        autoStartOnFull,
        autoStartPlayerCount,
        entryFee: parseCurrencyString(payload.entryFee, "Entry fee"),
        prizePool: parseCurrencyString(payload.prizePool, "Prize pool"),
        prizeDistributionMethod,
        prizeDistribution: JSON.stringify(prizeDistributionValues.map((entry) => Number(entry.toFixed(4)))),
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

function shuffleParticipants<T>(items: T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        const current = copy[index];
        copy[index] = copy[randomIndex];
        copy[randomIndex] = current;
    }

    return copy;
}

export interface TournamentStartResult {
    success: boolean;
    reason?: string;
    totalRounds?: number;
    firstRoundMatches?: number;
    currentRound?: number;
    participantCount?: number;
    tournamentName?: string;
    tournamentNameAr?: string;
    participantIds?: string[];
}

export async function startTournamentBracket(tournamentId: string): Promise<TournamentStartResult> {
    const now = new Date();

    const started = await db.transaction(async (tx): Promise<TournamentStartResult> => {
        const [tournament] = await tx.select()
            .from(tournaments)
            .where(eq(tournaments.id, tournamentId))
            .for("update");

        if (!tournament) {
            return { success: false, reason: "Tournament not found" };
        }

        if (tournament.status === "in_progress" || tournament.status === "completed" || tournament.status === "cancelled") {
            return { success: false, reason: "Tournament already started or completed" };
        }

        if (tournament.status !== "registration" && tournament.status !== "upcoming") {
            return { success: false, reason: `Tournament cannot be started from status ${tournament.status}` };
        }

        const participants = await tx.select()
            .from(tournamentParticipants)
            .where(eq(tournamentParticipants.tournamentId, tournamentId))
            .orderBy(tournamentParticipants.seed);

        if (participants.length < (tournament.minPlayers || 4)) {
            return { success: false, reason: `Need at least ${tournament.minPlayers} players` };
        }

        const shuffled = shuffleParticipants(participants);
        const totalSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(2, shuffled.length))));
        const totalRounds = Math.ceil(Math.log2(totalSlots));
        const firstRoundMatches = totalSlots / 2;

        type MatchInsert = typeof tournamentMatches.$inferInsert;
        const firstRoundValues: MatchInsert[] = [];

        for (let matchIndex = 0; matchIndex < firstRoundMatches; matchIndex += 1) {
            const playerOne = shuffled[matchIndex * 2];
            const playerTwo = shuffled[(matchIndex * 2) + 1];

            firstRoundValues.push({
                tournamentId,
                round: 1,
                matchNumber: matchIndex + 1,
                player1Id: playerOne?.userId || null,
                player2Id: playerTwo?.userId || null,
                status: (!playerOne || !playerTwo) ? "bye" : "pending",
            });
        }

        for (let index = 0; index < shuffled.length; index += 1) {
            await tx.update(tournamentParticipants)
                .set({ seed: index + 1 })
                .where(eq(tournamentParticipants.id, shuffled[index].id));
        }

        await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));

        if (firstRoundValues.length > 0) {
            await tx.insert(tournamentMatches).values(firstRoundValues);
        }

        for (let round = 2; round <= totalRounds; round += 1) {
            const roundMatchCount = totalSlots / Math.pow(2, round);
            const placeholderMatches: MatchInsert[] = [];

            for (let matchNumber = 0; matchNumber < roundMatchCount; matchNumber += 1) {
                placeholderMatches.push({
                    tournamentId,
                    round,
                    matchNumber: matchNumber + 1,
                    player1Id: null,
                    player2Id: null,
                    status: "pending",
                });
            }

            if (placeholderMatches.length > 0) {
                await tx.insert(tournamentMatches).values(placeholderMatches);
            }
        }

        await tx.update(tournaments)
            .set({
                status: "in_progress",
                currentRound: 1,
                totalRounds,
                startsAt: now,
                updatedAt: now,
            })
            .where(eq(tournaments.id, tournamentId));

        return {
            success: true,
            totalRounds,
            firstRoundMatches: firstRoundValues.length,
            currentRound: 1,
            participantCount: shuffled.length,
            tournamentName: tournament.name,
            tournamentNameAr: tournament.nameAr,
            participantIds: shuffled.map((entry) => entry.userId),
        };
    });

    if (!started.success) {
        return started;
    }

    await autoAdvanceTournamentByes(tournamentId, started.totalRounds || 1);

    const [nextRoundMatch] = await db.select({ round: tournamentMatches.round })
        .from(tournamentMatches)
        .where(and(
            eq(tournamentMatches.tournamentId, tournamentId),
            sql`${tournamentMatches.status} <> 'completed'`,
        ))
        .orderBy(tournamentMatches.round)
        .limit(1);

    const resolvedCurrentRound = nextRoundMatch?.round ?? started.totalRounds ?? 1;
    if (resolvedCurrentRound !== 1) {
        await db.update(tournaments)
            .set({ currentRound: resolvedCurrentRound, updatedAt: new Date() })
            .where(eq(tournaments.id, tournamentId));
    }

    const tournamentName = started.tournamentName || "Tournament";
    const tournamentNameAr = started.tournamentNameAr || tournamentName;

    for (const participantId of started.participantIds || []) {
        sendNotification(participantId, {
            type: "announcement",
            priority: "high",
            title: "Tournament Started!",
            titleAr: "بدأت البطولة!",
            message: `"${tournamentName}" has started! Check your bracket and prepare for your matches.`,
            messageAr: `بدأت "${tournamentNameAr}"! تحقق من جدول المباريات واستعد.`,
            link: `/tournaments/${tournamentId}`,
            metadata: JSON.stringify({ tournamentId, action: "tournament_started" }),
        }).catch(() => { });
    }

    return {
        ...started,
        currentRound: resolvedCurrentRound,
    };
}

export async function tryAutoStartTournament(tournamentId: string): Promise<TournamentStartResult> {
    const [tournament] = await db.select({
        autoStartOnFull: tournaments.autoStartOnFull,
        autoStartPlayerCount: tournaments.autoStartPlayerCount,
        minPlayers: tournaments.minPlayers,
        maxPlayers: tournaments.maxPlayers,
    })
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
        return { success: false, reason: "Tournament not found" };
    }

    if (!tournament.autoStartOnFull) {
        return { success: false, reason: "Auto-start is disabled" };
    }

    const threshold = Math.min(
        tournament.maxPlayers,
        Math.max(tournament.minPlayers, tournament.autoStartPlayerCount ?? tournament.minPlayers),
    );

    const [counter] = await db.select({
        count: sql<number>`count(*)`,
    })
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, tournamentId));

    if (Number(counter?.count || 0) < threshold) {
        return { success: false, reason: `Auto-start threshold not reached (${threshold})` };
    }

    return startTournamentBracket(tournamentId);
}

interface TournamentPlacementBucket {
    placement: number;
    userIds: string[];
}

function getTournamentDistributionForSettlement(tournament: typeof tournaments.$inferSelect): number[] {
    const storedDistribution = parsePrizeDistributionArray(tournament.prizeDistribution);
    if (storedDistribution.length > 0) {
        return storedDistribution;
    }

    return getDefaultPrizeDistribution(String(tournament.prizeDistributionMethod || "top_3"));
}

function normalizeDistributionForSlots(distribution: number[], slotCount: number): number[] {
    const safeSlotCount = Math.max(slotCount, 1);
    const values = distribution.slice(0, safeSlotCount);

    while (values.length < safeSlotCount) {
        values.push(0);
    }

    let normalized = normalizeDistributionToHundred(values);
    if (normalized.length === 0) {
        const fallback = [...getDefaultPrizeDistribution("top_3")];
        while (fallback.length < safeSlotCount) {
            fallback.push(0);
        }
        normalized = normalizeDistributionToHundred(fallback.slice(0, safeSlotCount));
    }

    return normalized;
}

function buildTournamentPlacementBuckets(
    tournament: typeof tournaments.$inferSelect,
    matches: Array<typeof tournamentMatches.$inferSelect>,
    participants: Array<typeof tournamentParticipants.$inferSelect>,
): TournamentPlacementBucket[] {
    const buckets: TournamentPlacementBucket[] = [];
    const assignedUserIds = new Set<string>();

    const pushBucket = (placement: number, ids: Array<string | null | undefined>) => {
        const cleanIds = ids
            .filter((entry): entry is string => Boolean(entry))
            .filter((entry) => !assignedUserIds.has(entry));

        if (cleanIds.length === 0) {
            return;
        }

        for (const userId of cleanIds) {
            assignedUserIds.add(userId);
        }

        buckets.push({ placement, userIds: cleanIds });
    };

    const finalMatch = matches.find((match) => (
        match.round === tournament.totalRounds
        && match.matchNumber === 1
        && match.status === "completed"
        && Boolean(match.winnerId)
    ));

    if (finalMatch?.winnerId) {
        pushBucket(1, [finalMatch.winnerId]);
        const runnerUpId = finalMatch.winnerId === finalMatch.player1Id
            ? finalMatch.player2Id
            : finalMatch.player1Id;
        pushBucket(2, [runnerUpId]);
    }

    let placementCursor = 3;
    for (let round = Math.max(tournament.totalRounds - 1, 1); round >= 1; round -= 1) {
        const roundLosers = matches
            .filter((match) => (
                match.round === round
                && match.status === "completed"
                && Boolean(match.player1Id)
                && Boolean(match.player2Id)
                && Boolean(match.winnerId)
            ))
            .map((match) => (match.winnerId === match.player1Id ? match.player2Id : match.player1Id));

        const beforeCount = buckets.length;
        pushBucket(placementCursor, roundLosers);
        if (buckets.length > beforeCount) {
            placementCursor += buckets[buckets.length - 1].userIds.length;
        }
    }

    const unassigned = participants
        .map((participant) => participant.userId)
        .filter((userId) => !assignedUserIds.has(userId));

    pushBucket(placementCursor, unassigned);
    return buckets;
}

export interface TournamentPrizeSettlementResult {
    settled: boolean;
    reason?: string;
    payoutCount: number;
}

export async function settleTournamentPrizes(tournamentId: string): Promise<TournamentPrizeSettlementResult> {
    return db.transaction(async (tx): Promise<TournamentPrizeSettlementResult> => {
        const [tournament] = await tx.select()
            .from(tournaments)
            .where(eq(tournaments.id, tournamentId))
            .for("update");

        if (!tournament) {
            return { settled: false, reason: "Tournament not found", payoutCount: 0 };
        }

        if (tournament.prizesSettledAt) {
            return { settled: false, reason: "Prizes already settled", payoutCount: 0 };
        }

        if (tournament.status !== "completed") {
            return { settled: false, reason: "Tournament is not completed", payoutCount: 0 };
        }

        const participants = await tx.select()
            .from(tournamentParticipants)
            .where(eq(tournamentParticipants.tournamentId, tournamentId));

        if (participants.length === 0) {
            await tx.update(tournaments)
                .set({ prizesSettledAt: new Date(), updatedAt: new Date() })
                .where(eq(tournaments.id, tournamentId));
            return { settled: true, payoutCount: 0 };
        }

        const matches = await tx.select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.tournamentId, tournamentId));

        const placementBuckets = buildTournamentPlacementBuckets(tournament, matches, participants);
        if (placementBuckets.length === 0) {
            await tx.update(tournaments)
                .set({ prizesSettledAt: new Date(), updatedAt: new Date() })
                .where(eq(tournaments.id, tournamentId));
            return { settled: true, payoutCount: 0 };
        }

        const slotCount = placementBuckets.reduce((accumulator, bucket) => accumulator + bucket.userIds.length, 0);
        const normalizedDistribution = normalizeDistributionForSlots(
            getTournamentDistributionForSettlement(tournament),
            slotCount,
        );

        const totalPrizeCents = Math.max(0, Math.round(Number.parseFloat(tournament.prizePool || "0") * 100));

        let slotOffset = 0;
        let distributedCents = 0;
        let payoutCount = 0;

        for (let bucketIndex = 0; bucketIndex < placementBuckets.length; bucketIndex += 1) {
            const bucket = placementBuckets[bucketIndex];
            const bucketSize = bucket.userIds.length;
            if (bucketSize === 0) {
                continue;
            }

            const bucketPercent = normalizedDistribution
                .slice(slotOffset, slotOffset + bucketSize)
                .reduce((accumulator, value) => accumulator + value, 0);

            let bucketCents = bucketIndex === placementBuckets.length - 1
                ? Math.max(0, totalPrizeCents - distributedCents)
                : Math.max(0, Math.round((totalPrizeCents * bucketPercent) / 100));

            distributedCents += bucketCents;
            slotOffset += bucketSize;

            const baseAward = Math.floor(bucketCents / bucketSize);
            let remainderAward = bucketCents % bucketSize;

            for (const userId of bucket.userIds) {
                const awardCents = baseAward + (remainderAward > 0 ? 1 : 0);
                if (remainderAward > 0) {
                    remainderAward -= 1;
                }

                const awardAmount = (awardCents / 100).toFixed(2);
                await tx.update(tournamentParticipants)
                    .set({
                        placement: bucket.placement,
                        prizeWon: awardAmount,
                    })
                    .where(and(
                        eq(tournamentParticipants.tournamentId, tournamentId),
                        eq(tournamentParticipants.userId, userId),
                    ));

                if (awardCents <= 0) {
                    continue;
                }

                const [user] = await tx.select({ balance: users.balance })
                    .from(users)
                    .where(eq(users.id, userId))
                    .for("update");

                if (!user) {
                    continue;
                }

                const balanceBefore = Number.parseFloat(user.balance || "0");
                const balanceAfter = (balanceBefore + (awardCents / 100)).toFixed(2);

                await tx.update(users)
                    .set({ balance: balanceAfter })
                    .where(eq(users.id, userId));

                await tx.insert(transactions).values({
                    userId,
                    type: "win",
                    status: "completed",
                    amount: awardAmount,
                    balanceBefore: balanceBefore.toFixed(2),
                    balanceAfter,
                    description: `Tournament prize payout (${bucket.placement} place)`,
                    referenceId: `tournament-prize:${tournamentId}`,
                    processedAt: new Date(),
                });

                payoutCount += 1;
            }
        }

        await tx.update(tournaments)
            .set({ prizesSettledAt: new Date(), updatedAt: new Date() })
            .where(eq(tournaments.id, tournamentId));

        return { settled: true, payoutCount };
    });
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
