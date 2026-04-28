/**
 * Sam9 Player Profile Service
 * ---------------------------
 * Builds and caches a per-user "skill + engagement" profile that Sam9 reads
 * before every move and after every completed match. The profile is the
 * single source of truth Sam9 uses to:
 *   1. Pick an effective difficulty per opponent (`sam9-engagement.ts`)
 *   2. Decide how often to make a "deliberate mistake" so the customer
 *      stays engaged even when they lose.
 *   3. Pick the right banter mood (`sam9-banter.ts`).
 *
 * Cache: tiny in-memory LRU-by-recency Map, 60s TTL — short enough that
 * mid-session profile updates (a player just won 3 in a row) take effect
 * by the next session, long enough that move-time hot path doesn't hit
 * the DB on every turn.
 *
 * Persistence: every refresh upserts the snapshot into
 * `sam9_player_profiles` so admins can audit Sam9's view of any player
 * and so the profile survives process restarts.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
    users,
    sam9PlayerProfiles,
    sam9MatchRecords,
} from "@shared/schema";
import { logger } from "./logger";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 2_000;
const RECENT_FORM_WINDOW = 10;

export type Sam9SkillTier = "newbie" | "casual" | "regular" | "strong" | "expert";
export type Sam9MatchOutcome = "win" | "loss" | "draw" | "abandon";

export interface Sam9PlayerProfile {
    userId: string;
    skillTier: Sam9SkillTier;
    masteryScore: number; // 0..1
    gameMastery: Record<string, number>; // gameType -> 0..1
    winRate: number; // overall win rate vs everyone (0..1)
    totalGames: number;
    accountAgeDays: number;
    vipLevel: number;
    isNewbie: boolean;
    preferredGameType: string | null;
    vsSam9: {
        played: number;
        won: number;
        lost: number;
        draw: number;
        winRate: number; // 0..1
        recentForm: Sam9MatchOutcome[];
        recentWinRate: number; // 0..1 across last `recentForm` window
    };
    engagementScore: number; // 0..100
}

interface CacheEntry {
    profile: Sam9PlayerProfile;
    expiresAt: number;
}

const profileCache = new Map<string, CacheEntry>();

function nowMs(): number {
    return Date.now();
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

function pruneCache(): void {
    if (profileCache.size <= CACHE_MAX_ENTRIES) return;
    // Drop oldest 25% (Map iteration is insertion order).
    const dropCount = Math.floor(CACHE_MAX_ENTRIES * 0.25);
    let dropped = 0;
    for (const key of profileCache.keys()) {
        if (dropped >= dropCount) break;
        profileCache.delete(key);
        dropped += 1;
    }
}

const PER_GAME_COUNTERS: Array<{ key: string; played: keyof typeof users.$inferSelect; won: keyof typeof users.$inferSelect }> = [
    { key: "chess", played: "chessPlayed", won: "chessWon" },
    { key: "backgammon", played: "backgammonPlayed", won: "backgammonWon" },
    { key: "domino", played: "dominoPlayed", won: "dominoWon" },
    { key: "tarneeb", played: "tarneebPlayed", won: "tarneebWon" },
    { key: "baloot", played: "balootPlayed", won: "balootWon" },
];

function computeGameMastery(account: typeof users.$inferSelect): Record<string, number> {
    const mastery: Record<string, number> = {};
    for (const slot of PER_GAME_COUNTERS) {
        const played = toNumber(account[slot.played], 0);
        const won = toNumber(account[slot.won], 0);
        if (played <= 0) {
            mastery[slot.key] = 0.3;
            continue;
        }
        // Mastery blends raw experience (capped) with win rate.
        const experienceComponent = clamp(played / 80, 0, 1) * 0.55;
        const winRate = clamp(won / played, 0, 1);
        const winComponent = winRate * 0.45;
        mastery[slot.key] = Number((experienceComponent + winComponent).toFixed(3));
    }
    return mastery;
}

function pickPreferredGame(mastery: Record<string, number>, account: typeof users.$inferSelect): string | null {
    let bestKey: string | null = null;
    let bestPlays = -1;
    for (const slot of PER_GAME_COUNTERS) {
        const played = toNumber(account[slot.played], 0);
        if (played > bestPlays) {
            bestPlays = played;
            bestKey = slot.key;
        }
    }
    return bestPlays > 0 ? bestKey : null;
}

function computeSkillTier(masteryScore: number, totalGames: number, vipLevel: number): Sam9SkillTier {
    if (totalGames < 5) return "newbie";
    if (masteryScore >= 0.78 || vipLevel >= 6) return "expert";
    if (masteryScore >= 0.6 || vipLevel >= 3) return "strong";
    if (masteryScore >= 0.4) return "regular";
    return "casual";
}

/**
 * Engagement score blends:
 *   - vs-Sam9 recent win rate (we want it ~40% — lower = frustration)
 *   - total games played (more = more invested)
 *   - abandonment rate (negative)
 *   - vip level (slight positive)
 */
function computeEngagementScore(args: {
    totalGames: number;
    vipLevel: number;
    vsSam9Played: number;
    vsSam9RecentWinRate: number;
    vsSam9AbandonRate: number;
}): number {
    const investmentSignal = clamp(args.totalGames / 80, 0, 1) * 30;
    const vipSignal = clamp(args.vipLevel / 10, 0, 1) * 10;

    // Win-rate sweet spot is ~0.4 for Sam9 sessions.
    // Distance from sweet spot lowers engagement.
    const winRateGap = Math.abs(args.vsSam9RecentWinRate - 0.4);
    const winRateSignal = (1 - clamp(winRateGap / 0.4, 0, 1)) * 40;

    const abandonPenalty = clamp(args.vsSam9AbandonRate, 0, 1) * 25;

    // New players (vsSam9Played < 3) get a baseline boost so engagement
    // isn't crushed by tiny samples.
    const newcomerBoost = args.vsSam9Played < 3 ? 15 : 0;

    return Number(
        clamp(investmentSignal + vipSignal + winRateSignal + newcomerBoost - abandonPenalty, 0, 100)
            .toFixed(2),
    );
}

/**
 * Pull recent vsSam9 outcomes from the match record table for this user.
 * Returns last `RECENT_FORM_WINDOW` outcomes (most recent first → reversed
 * to chronological for downstream code).
 */
async function loadRecentVsSam9(userId: string): Promise<{
    played: number;
    won: number;
    lost: number;
    draw: number;
    abandoned: number;
    recentForm: Sam9MatchOutcome[];
}> {
    try {
        // Aggregated counters across all completed matches.
        const [agg] = await db
            .select({
                total: sql<number>`COUNT(*)::int`,
                wins: sql<number>`COUNT(*) FILTER (WHERE ${sam9MatchRecords.outcome} = 'win')::int`,
                losses: sql<number>`COUNT(*) FILTER (WHERE ${sam9MatchRecords.outcome} = 'loss')::int`,
                draws: sql<number>`COUNT(*) FILTER (WHERE ${sam9MatchRecords.outcome} = 'draw')::int`,
                abandons: sql<number>`COUNT(*) FILTER (WHERE ${sam9MatchRecords.outcome} = 'abandon')::int`,
            })
            .from(sam9MatchRecords)
            .where(eq(sam9MatchRecords.humanUserId, userId));

        // Last N outcomes for "form" (chronological, oldest → newest).
        const recentRows = await db
            .select({ outcome: sam9MatchRecords.outcome })
            .from(sam9MatchRecords)
            .where(eq(sam9MatchRecords.humanUserId, userId))
            .orderBy(sql`${sam9MatchRecords.startedAt} DESC`)
            .limit(RECENT_FORM_WINDOW);

        const recentForm: Sam9MatchOutcome[] = [];
        for (const row of recentRows.reverse()) {
            const o = row.outcome;
            if (o === "win" || o === "loss" || o === "draw" || o === "abandon") {
                recentForm.push(o);
            }
        }

        return {
            played: toNumber(agg?.total, 0),
            won: toNumber(agg?.wins, 0),
            lost: toNumber(agg?.losses, 0),
            draw: toNumber(agg?.draws, 0),
            abandoned: toNumber(agg?.abandons, 0),
            recentForm,
        };
    } catch (error) {
        logger.warn?.(`[sam9-player-profile] vsSam9 history load failed for ${userId}: ${(error as Error).message}`);
        return { played: 0, won: 0, lost: 0, draw: 0, abandoned: 0, recentForm: [] };
    }
}

async function buildProfileFromDb(userId: string): Promise<Sam9PlayerProfile | null> {
    const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!account) return null;

    const totalPlayed = toNumber(account.gamesPlayed, 0);
    const totalWon = toNumber(account.gamesWon, 0);
    const winRate = totalPlayed > 0 ? clamp(totalWon / totalPlayed, 0, 1) : 0.5;

    const gameMastery = computeGameMastery(account);
    const masteryScore = Number(
        clamp(
            Object.values(gameMastery).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(gameMastery).length),
            0,
            1,
        ).toFixed(3),
    );

    const accountAgeDays = account.createdAt
        ? Math.max(0, Math.floor((nowMs() - new Date(account.createdAt).getTime()) / 86_400_000))
        : 0;

    const vipLevel = toNumber(account.vipLevel, 0);
    const totalGames = totalPlayed;
    const isNewbie = totalGames < 5 || accountAgeDays < 7;
    const skillTier = computeSkillTier(masteryScore, totalGames, vipLevel);
    const preferredGameType = pickPreferredGame(gameMastery, account);

    const vsSam9 = await loadRecentVsSam9(userId);

    const recentDecisive = vsSam9.recentForm.filter((o) => o === "win" || o === "loss");
    const recentWins = vsSam9.recentForm.filter((o) => o === "win").length;
    const recentWinRate = recentDecisive.length > 0
        ? clamp(recentWins / recentDecisive.length, 0, 1)
        : 0.4; // neutral baseline for cold-start

    const overallVsSam9WinRate = vsSam9.played > 0
        ? clamp(vsSam9.won / vsSam9.played, 0, 1)
        : 0.4;

    const abandonRate = vsSam9.played > 0 ? clamp(vsSam9.abandoned / vsSam9.played, 0, 1) : 0;

    const engagementScore = computeEngagementScore({
        totalGames,
        vipLevel,
        vsSam9Played: vsSam9.played,
        vsSam9RecentWinRate: recentWinRate,
        vsSam9AbandonRate: abandonRate,
    });

    return {
        userId,
        skillTier,
        masteryScore,
        gameMastery,
        winRate,
        totalGames,
        accountAgeDays,
        vipLevel,
        isNewbie,
        preferredGameType,
        vsSam9: {
            played: vsSam9.played,
            won: vsSam9.won,
            lost: vsSam9.lost,
            draw: vsSam9.draw,
            winRate: overallVsSam9WinRate,
            recentForm: vsSam9.recentForm,
            recentWinRate,
        },
        engagementScore,
    };
}

async function persistSnapshot(profile: Sam9PlayerProfile): Promise<void> {
    try {
        await db
            .insert(sam9PlayerProfiles)
            .values({
                userId: profile.userId,
                skillTier: profile.skillTier,
                masteryScore: profile.masteryScore.toFixed(3),
                gameMastery: profile.gameMastery,
                vsSam9Played: profile.vsSam9.played,
                vsSam9Won: profile.vsSam9.won,
                vsSam9Lost: profile.vsSam9.lost,
                vsSam9Draw: profile.vsSam9.draw,
                recentForm: profile.vsSam9.recentForm,
                engagementScore: profile.engagementScore.toFixed(2),
                vipLevel: profile.vipLevel,
                accountAgeDays: profile.accountAgeDays,
                isNewbie: profile.isNewbie,
                preferredGameType: profile.preferredGameType,
                refreshedAt: new Date(),
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: sam9PlayerProfiles.userId,
                set: {
                    skillTier: profile.skillTier,
                    masteryScore: profile.masteryScore.toFixed(3),
                    gameMastery: profile.gameMastery,
                    vsSam9Played: profile.vsSam9.played,
                    vsSam9Won: profile.vsSam9.won,
                    vsSam9Lost: profile.vsSam9.lost,
                    vsSam9Draw: profile.vsSam9.draw,
                    recentForm: profile.vsSam9.recentForm,
                    engagementScore: profile.engagementScore.toFixed(2),
                    vipLevel: profile.vipLevel,
                    accountAgeDays: profile.accountAgeDays,
                    isNewbie: profile.isNewbie,
                    preferredGameType: profile.preferredGameType,
                    refreshedAt: new Date(),
                    updatedAt: new Date(),
                },
            });
    } catch (error) {
        logger.warn?.(`[sam9-player-profile] snapshot upsert failed for ${profile.userId}: ${(error as Error).message}`);
    }
}

/**
 * Best-effort persisted update of the engagement plan applied to the
 * latest match. Runs in the background — never blocks the move pipeline.
 */
export async function recordLastEngagementPlan(userId: string, plan: Record<string, unknown>): Promise<void> {
    try {
        await db
            .update(sam9PlayerProfiles)
            .set({ lastEngagementPlan: plan, updatedAt: new Date() })
            .where(eq(sam9PlayerProfiles.userId, userId));
    } catch (error) {
        logger.warn?.(`[sam9-player-profile] engagement plan persist failed for ${userId}: ${(error as Error).message}`);
    }
}

/**
 * Public API: read a fresh-or-cached profile for the player. Pass the
 * gameType so the profile carries the right preferredGameType context
 * if the caller knows which game is being played.
 *
 * Returns `null` if the user does not exist (e.g. stale session).
 */
export async function getPlayerProfile(userId: string): Promise<Sam9PlayerProfile | null> {
    if (!userId) return null;

    const cached = profileCache.get(userId);
    if (cached && cached.expiresAt > nowMs()) {
        return cached.profile;
    }

    const fresh = await buildProfileFromDb(userId);
    if (!fresh) {
        profileCache.delete(userId);
        return null;
    }

    profileCache.set(userId, { profile: fresh, expiresAt: nowMs() + CACHE_TTL_MS });
    pruneCache();

    // Persist asynchronously — never block callers on the snapshot write.
    void persistSnapshot(fresh);

    return fresh;
}

/** Force a refresh on the next read. */
export function invalidatePlayerProfileCache(userId: string): void {
    profileCache.delete(userId);
}

/** Test/diagnostic helper. */
export function getPlayerProfileCacheSize(): number {
    return profileCache.size;
}
