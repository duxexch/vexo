/**
 * Sam9 per-match record manager.
 *
 * Maintains a row in `sam9_match_records` for every match played against
 * Sam9. The row is opened on the first bot turn and closed on game end
 * via a single call from `handleGameOver` so that timeout / forfeit /
 * disconnect / regular game-over paths all close cleanly without
 * duplicating logic.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { sam9MatchRecords } from "@shared/schema";
import type { GameStatus } from "../game-engines/types";
import { logger } from "./logger";
import { invalidatePlayerProfileCache, type Sam9PlayerProfile } from "./sam9-player-profile";
import type { Sam9EngagementPlan, Sam9BanterMood } from "./sam9-engagement";
import { dispatchEndOfMatchBanter } from "./sam9-banter-dispatcher";
import type { GameRoom } from "../game-websocket/types";

export type Sam9HumanOutcome = "win" | "loss" | "draw" | "abandon";

interface OpenMatchEntry {
    recordId: string;
    humanUserId: string;
    botUserId: string;
    botUserIds: string[];
    botUsername: string;
    gameType: string;
    mood: Sam9BanterMood;
    totalMoves: number;
    confidenceSum: number;
}

const openMatches = new Map<string, OpenMatchEntry>();

export interface OpenMatchRecordParams {
    sessionId: string;
    humanUserId: string;
    botUserId: string;
    /** Every bot id in the session — used to compute the outcome reliably. */
    botUserIds: string[];
    botUsername: string;
    gameType: string;
    profile: Sam9PlayerProfile | null;
    plan: Sam9EngagementPlan;
    baseDifficulty: string;
}

export interface EnsureMatchRecordResult {
    recordId: string;
    /** True only on the first call for this session — use this to gate the
     * one-shot opening banter dispatch so it cannot fire on every AI turn. */
    wasCreated: boolean;
}

/**
 * Open (or return the existing) Sam9 match record for this session.
 * Idempotent — safe to call once per AI turn.
 */
export async function ensureMatchRecordOpen(params: OpenMatchRecordParams): Promise<EnsureMatchRecordResult | null> {
    const cached = openMatches.get(params.sessionId);
    if (cached) return { recordId: cached.recordId, wasCreated: false };

    try {
        // Defensive: if a row already exists for this (session, user) pair
        // (e.g. process restart mid-match, or post-finalize re-entry of the
        // AI turn loop) reuse it rather than inserting a duplicate. If the
        // existing row is already finalised, refuse to (re)open — the match
        // is over and we must not reseed the in-memory cache or re-emit the
        // opening line.
        const [existing] = await db
            .select({ id: sam9MatchRecords.id, endedAt: sam9MatchRecords.endedAt })
            .from(sam9MatchRecords)
            .where(and(
                eq(sam9MatchRecords.sessionId, params.sessionId),
                eq(sam9MatchRecords.humanUserId, params.humanUserId),
            ))
            .limit(1);

        if (existing?.endedAt) {
            return null;
        }

        const recordId = existing
            ? existing.id
            : (await db
                .insert(sam9MatchRecords)
                .values({
                    sessionId: params.sessionId,
                    humanUserId: params.humanUserId,
                    botUserId: params.botUserId,
                    gameType: params.gameType,
                    profileSnapshot: params.profile
                        ? {
                            skillTier: params.profile.skillTier,
                            masteryScore: params.profile.masteryScore,
                            gameMastery: params.profile.gameMastery,
                            winRate: params.profile.winRate,
                            totalGames: params.profile.totalGames,
                            accountAgeDays: params.profile.accountAgeDays,
                            vipLevel: params.profile.vipLevel,
                            isNewbie: params.profile.isNewbie,
                            engagementScore: params.profile.engagementScore,
                            vsSam9: params.profile.vsSam9,
                        }
                        : {},
                    baseDifficulty: params.baseDifficulty,
                    effectiveDifficulty: params.plan.effectiveDifficulty,
                    engagementPlan: {
                        effectiveDifficulty: params.plan.effectiveDifficulty,
                        mistakeBias: params.plan.mistakeBias,
                        thinkTimeMultiplier: params.plan.thinkTimeMultiplier,
                        banterMood: params.plan.banterMood,
                        allowDeliberateLoss: params.plan.allowDeliberateLoss,
                        reasons: params.plan.reasons,
                    },
                })
                .returning({ id: sam9MatchRecords.id }))[0].id;

        openMatches.set(params.sessionId, {
            recordId,
            humanUserId: params.humanUserId,
            botUserId: params.botUserId,
            botUserIds: params.botUserIds.length ? params.botUserIds : [params.botUserId],
            botUsername: params.botUsername,
            gameType: params.gameType,
            mood: params.plan.banterMood,
            totalMoves: 0,
            confidenceSum: 0,
        });
        // `wasCreated` reflects whether THIS call inserted a fresh DB row.
        // When we reused an existing (still-open) row, opening banter has
        // either already fired in this process or in a prior process — we
        // err on the side of NOT replaying it to keep "exactly once per
        // session" semantics.
        return { recordId, wasCreated: !existing };
    } catch (error) {
        logger.warn?.(`[sam9-match-records] open failed: ${(error as Error).message}`);
        return null;
    }
}

/** Track a Sam9 move so we can persist totals + avg confidence on close. */
export function recordBotMoveStat(sessionId: string, confidence: number): void {
    const entry = openMatches.get(sessionId);
    if (!entry) return;
    entry.totalMoves += 1;
    entry.confidenceSum += Math.max(0, Math.min(1, confidence));
}

const ABANDON_REASONS = new Set(["resignation", "timeout", "disconnect", "abandonment"]);

function isHumanWinner(
    status: GameStatus,
    humanId: string,
    finalState: string | null,
): boolean | null {
    if (status.winner) {
        return status.winner === humanId;
    }
    if (status.winningTeam !== undefined && finalState) {
        try {
            const parsed = JSON.parse(finalState) as { teams?: { team0?: string[]; team1?: string[] } };
            const teamPlayers = status.winningTeam === 0
                ? parsed.teams?.team0
                : parsed.teams?.team1;
            if (Array.isArray(teamPlayers)) return teamPlayers.includes(humanId);
        } catch {
            // fall through
        }
    }
    return null;
}

function resolveOutcome(
    status: GameStatus,
    humanId: string,
    finalState: string | null,
): Sam9HumanOutcome {
    if (status.isDraw) return "draw";

    const humanWon = isHumanWinner(status, humanId, finalState);

    // Abandon attribution: when a forfeit-type reason is set AND the human
    // is the losing side, classify as 'abandon' so analytics can separate
    // walkaways from normal losses. The end-of-match banter still uses the
    // encouraging mood (mapped from both 'loss' and 'abandon' below).
    if (status.reason && ABANDON_REASONS.has(status.reason) && humanWon === false) {
        return "abandon";
    }

    if (humanWon === true) return "win";
    if (humanWon === false) return "loss";
    return "draw";
}

/**
 * Close the Sam9 match record for this session if one is open.
 * No-op if no record was opened (e.g. non-Sam9 session, or process restart).
 *
 * This is the SINGLE close path — it must be invoked from `handleGameOver`
 * so every game-over flow (AI loop, timeout, forfeit, resignation,
 * disconnect) ends cleanly.
 *
 * Returns the human outcome we recorded (for callers that want to act
 * on it), or `null` if nothing was open.
 */
export async function finalizeMatchRecordIfOpen(
    room: GameRoom,
    status: GameStatus,
): Promise<Sam9HumanOutcome | null> {
    const sessionId = room.sessionId;
    const entry = openMatches.get(sessionId);
    if (!entry) return null;

    // Remove from cache UP FRONT so any concurrent re-entry of
    // `handleGameOver` (the WS layer guards against this but we belt-and-
    // suspenders it) can't double-emit banter or double-update the row.
    openMatches.delete(sessionId);

    const outcome = resolveOutcome(status, entry.humanUserId, room.gameState);
    const avgConfidence = entry.totalMoves > 0
        ? Number((entry.confidenceSum / entry.totalMoves).toFixed(3))
        : null;

    try {
        await db
            .update(sam9MatchRecords)
            .set({
                outcome,
                avgConfidence: avgConfidence !== null ? avgConfidence.toFixed(3) : null,
                totalMoves: entry.totalMoves,
                endedAt: new Date(),
            })
            .where(eq(sam9MatchRecords.id, entry.recordId));
    } catch (error) {
        logger.warn?.(`[sam9-match-records] finalize update failed for ${sessionId}: ${(error as Error).message}`);
    }

    // Force the next profile read to reflect this outcome.
    invalidatePlayerProfileCache(entry.humanUserId);

    // Engagement-on-finish banter — a single line per match. Encouraging
    // mood on a player loss; otherwise honour the mood Sam9 chose at
    // match start.
    const trigger = outcome === "win"
        ? "on_player_win" as const
        : outcome === "loss"
            ? "on_player_loss" as const
            : outcome === "abandon"
                ? "on_player_loss" as const
                : "on_draw" as const;
    void dispatchEndOfMatchBanter({
        room,
        sessionId,
        botUserId: entry.botUserId,
        botUsername: entry.botUsername,
        humanUserId: entry.humanUserId,
        mood: outcome === "loss" || outcome === "abandon" ? "encouraging" : entry.mood,
        trigger,
    });

    return outcome;
}

/** Test/diagnostic helpers. */
export function getOpenMatchRecordCount(): number {
    return openMatches.size;
}
