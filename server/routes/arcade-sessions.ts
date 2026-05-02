/**
 * Arcade (HTML5 mini-games) sessions API.
 * Receives end-of-run reports from the new 9 mini-games (snake,
 * stack_tower, aim_trainer, pong, air_hockey, typing_duel, bomb_pass,
 * quiz_rush, dice_battle) and records them so they show up in the
 * player profile, leaderboards, and Sam9's awareness.
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { arcadeSessions, users, gameMatches } from "@shared/schema";
import { ARCADE_GAME_KEYS, getArcadeGame } from "@shared/arcade-games";
import { SAM9_ARCADE_CONTRACT } from "@shared/sam9-contract";
import { authMiddleware } from "./middleware";
import { logger } from "../lib/logger";
import { chooseArcadeBanter, sam9KnowsArcadeGame, arcadeGameLabel } from "../lib/sam9-arcade-banter";
import {
    decideArcadeReward,
    type PlayerArcadeState,
} from "../lib/sam9-arcade-economy";

interface ArcadeOverviewRow {
    totalRuns: number;
    totalPlayers: number;
    totalVolumeVex: number;
    avgScore: number;
    bestScore: number;
    multiplayerMatches: number;
    topGameKey: string | null;
}

const submitSchema = z.object({
    gameKey: z.enum(ARCADE_GAME_KEYS as [string, ...string[]]),
    score: z.number().int().min(0).max(10_000_000),
    result: z.enum(["win", "loss", "draw"]).default("draw"),
    durationMs: z.number().int().min(0).max(10 * 60 * 1000).default(0),
    metadata: z.record(z.unknown()).optional(),
});

/**
 * Per-game realistic score caps (max score points per second of play).
 * Anti-cheat heuristic — anything above this is almost certainly a
 * tampered payload. Tuned generously so legit speed-runners aren't hit.
 * NOTE: pure heuristic — for hard guarantees we'd need server-authoritative
 * gameplay, which these casual HTML5 mini-games don't have today.
 */
const MAX_SCORE_PER_SECOND: Record<string, number> = {
    snake: 8,
    stack_tower: 6,
    aim_trainer: 25,
    pong: 4,
    air_hockey: 4,
    typing_duel: 120,
    bomb_pass: 50,
    quiz_rush: 200,
    dice_battle: 100,
};

function computeTypingDuelScore(metadata: Record<string, unknown> | undefined, score: number): number {
    const rawAccuracy = Number(metadata?.accuracy ?? 0);
    const rawWpm = Number(metadata?.wpm ?? 0);
    const rawOpponentWpm = Number(metadata?.opponentWpm ?? 0);
    const accuracy = Number.isFinite(rawAccuracy) ? Math.max(0, Math.min(100, rawAccuracy)) : 0;
    const wpm = Number.isFinite(rawWpm) ? Math.max(0, Math.min(300, rawWpm)) : 0;
    const opponentWpm = Number.isFinite(rawOpponentWpm) ? Math.max(0, Math.min(300, rawOpponentWpm)) : 0;
    const speedEdge = Math.max(0, wpm - opponentWpm);
    const base = Math.round(wpm * 8 + accuracy * 3 + speedEdge * 5);
    return Math.max(score, base);
}
const MIN_RUN_MS = 1500;

function isPlausibleScore(gameKey: string, score: number, durationMs: number): boolean {
    if (score <= 0) return true;
    if (durationMs < MIN_RUN_MS) return false;
    const cap = MAX_SCORE_PER_SECOND[gameKey] ?? 50;
    const allowedMax = Math.ceil((durationMs / 1000) * cap) + 5;
    return score <= allowedMax;
}

interface AuthedRequest extends Request {
    user?: { id: string; language?: string };
}

export function registerArcadeSessionsRoutes(app: Express): void {
    /**
     * POST /api/arcade/sessions
     * Body: { gameKey, score, result, durationMs, metadata? }
     * Returns the saved row + a Sam9 banter line for the result UI.
     */
    app.post("/api/arcade/sessions", authMiddleware, async (req: AuthedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: "unauthorized" });
                return;
            }

            const parsed = submitSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
                return;
            }
            const { gameKey, score, result, durationMs, metadata } = parsed.data;

            if (!sam9KnowsArcadeGame(gameKey)) {
                res.status(400).json({ error: "unknown_game" });
                return;
            }

            // Anti-cheat: drop physically-impossible scores (e.g. 1M points
            // in 0.5s) before they pollute leaderboards. Heuristic only —
            // these are casual HTML5 games without server-authoritative state.
            if (!isPlausibleScore(gameKey, score, durationMs)) {
                logger.warn?.(
                    `[arcade-sessions] rejected implausible score user=${userId} game=${gameKey} score=${score} duration=${durationMs}ms`,
                );
                res.status(400).json({ error: "implausible_score" });
                return;
            }

            // Per-game stats (best score + runs) for personal-best detection.
            const [prev] = await db
                .select({ best: sql<number>`COALESCE(MAX(${arcadeSessions.score}), 0)::int`, runs: sql<number>`COUNT(*)::int` })
                .from(arcadeSessions)
                .where(and(eq(arcadeSessions.userId, userId), eq(arcadeSessions.gameKey, gameKey)));
            const previousBest = Number(prev?.best ?? 0);
            const previousRuns = Number(prev?.runs ?? 0);
            const isPersonalBest = score > previousBest && score > 0;

            // ---- Sam9 Arcade Economy: gather lifetime + recent state ----
            // We aggregate across ALL arcade games (not just this one) because
            // the player's wallet is shared and their psychology travels with
            // them between games. Recent run history drives streak detection.
            const [userRow] = await db
                .select({ balance: users.balance })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
            const balance = Number.parseFloat(String(userRow?.balance ?? "0")) || 0;

            const [lifetime] = await db
                .select({
                    totalRuns: sql<number>`COUNT(*)::int`,
                    lifetimeWon: sql<number>`COALESCE(SUM((${arcadeSessions.metadata}->>'rewardVex')::numeric), 0)::float`,
                })
                .from(arcadeSessions)
                .where(eq(arcadeSessions.userId, userId));
            const totalLifetimeRuns = Number(lifetime?.totalRuns ?? 0);
            const lifetimeWon = Number(lifetime?.lifetimeWon ?? 0);
            const lifetimeWagered = totalLifetimeRuns * SAM9_ARCADE_CONTRACT.entryCostVex;

            const recentRows = await db
                .select({
                    score: arcadeSessions.score,
                    result: arcadeSessions.result,
                    metadata: arcadeSessions.metadata,
                    createdAt: arcadeSessions.createdAt,
                })
                .from(arcadeSessions)
                .where(eq(arcadeSessions.userId, userId))
                .orderBy(desc(arcadeSessions.createdAt))
                .limit(20);

            const playerState: PlayerArcadeState = {
                balance,
                totalRuns: totalLifetimeRuns,
                lifetimeWagered,
                lifetimeWon,
                recentRuns: recentRows.map((r) => ({
                    score: Number(r.score ?? 0),
                    rewardVex: Number((r.metadata as Record<string, unknown> | null)?.rewardVex ?? 0),
                    result: (r.result as "win" | "loss" | "draw") ?? "draw",
                    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(),
                })),
            };

            // ---- Decide reward & settle wallet ATOMICALLY ----
            // Free-play guard: if the player can't even afford the entry cost
            // we run the game in "free mode" (no debit, no reward). This keeps
            // the game playable for broke users without giving them free VEX.
            const canAffordEntry = balance >= SAM9_ARCADE_CONTRACT.entryCostVex;

            let decision = decideArcadeReward(playerState, score, gameKey);
            if (!canAffordEntry) {
                decision = {
                    rewardVex: 0,
                    netVex: 0,
                    multiplier: 0,
                    rarity: "miss",
                    psychologyMode: "neutral",
                    reason: "Free-play mode (insufficient balance for entry).",
                    debug: decision.debug,
                };
            }

            // Wrap balance mutation + session insert in a single DB
            // transaction. If either side fails, both roll back — so the
            // wallet ledger and session history can never diverge. Use
            // an in-tx UPDATE that re-reads & checks the balance to
            // prevent double-spend under concurrent runs (no read-then-
            // write race because the row is locked for the duration of
            // the tx via the conditional WHERE clause + RETURNING).
            const txResult = await db.transaction(async (tx) => {
                let newBalance = balance;
                let txDecision = decision;

                if (canAffordEntry && txDecision.netVex !== 0) {
                    const net = txDecision.netVex;
                    if (net > 0) {
                        const [updated] = await tx
                            .update(users)
                            .set({
                                balance: sql`CAST(CAST(${users.balance} AS DECIMAL) + ${net} AS TEXT)`,
                                updatedAt: new Date(),
                            })
                            .where(eq(users.id, userId))
                            .returning({ balance: users.balance });
                        newBalance = Number.parseFloat(String(updated?.balance ?? balance)) || balance;
                    } else {
                        // net < 0 → debit. Conditional UPDATE ensures we
                        // never push the balance below zero even under
                        // concurrent runs — the WHERE filters out the row
                        // if the funds aren't there anymore.
                        const debit = Math.abs(net);
                        const [updated] = await tx
                            .update(users)
                            .set({
                                balance: sql`CAST(CAST(${users.balance} AS DECIMAL) - ${debit} AS TEXT)`,
                                updatedAt: new Date(),
                            })
                            .where(and(
                                eq(users.id, userId),
                                sql`CAST(${users.balance} AS DECIMAL) >= ${debit}`,
                            ))
                            .returning({ balance: users.balance });
                        if (!updated) {
                            // Concurrent debit raced and emptied the wallet.
                            // Convert this run to free play inside the tx so
                            // the session row reflects reality.
                            txDecision = {
                                ...txDecision,
                                rewardVex: 0,
                                netVex: 0,
                                multiplier: 0,
                                rarity: "miss",
                                reason: "Concurrent wallet race — converted to free play.",
                            };
                        } else {
                            newBalance = Number.parseFloat(String(updated.balance)) || balance;
                        }
                    }
                }

                const [row] = await tx
                    .insert(arcadeSessions)
                    .values({
                        userId,
                        gameKey,
                        score,
                        result,
                        durationMs,
                        isPersonalBest,
                        metadata: {
                            ...(metadata ?? {}),
                            rewardVex: txDecision.rewardVex,
                            netVex: txDecision.netVex,
                            rarity: txDecision.rarity,
                            psychologyMode: txDecision.psychologyMode,
                            rewardReason: txDecision.reason,
                            entryCostVex: canAffordEntry ? SAM9_ARCADE_CONTRACT.entryCostVex : 0,
                        } as Record<string, unknown>,
                    })
                    .returning();

                return { row, newBalance, decision: txDecision };
            });

            const row = txResult.row;
            const newBalance = txResult.newBalance;
            decision = txResult.decision;

            const banter = chooseArcadeBanter({
                gameKey,
                outcome: result,
                score,
                isPersonalBest,
                totalRuns: previousRuns + 1,
                rarity: decision.rarity,
                psychologyMode: decision.psychologyMode,
            });

            res.json({
                ok: true,
                session: {
                    id: row.id,
                    gameKey: row.gameKey,
                    score: row.score,
                    result: row.result,
                    durationMs: row.durationMs,
                    isPersonalBest: row.isPersonalBest,
                    createdAt: row.createdAt,
                },
                personalBest: Math.max(previousBest, score),
                previousBest,
                totalRuns: previousRuns + 1,
                banter,
                game: getArcadeGame(gameKey) ?? null,
                economy: {
                    rewardVex: decision.rewardVex,
                    netVex: decision.netVex,
                    multiplier: decision.multiplier,
                    rarity: decision.rarity,
                    psychologyMode: decision.psychologyMode,
                    reason: decision.reason,
                    entryCostVex: canAffordEntry ? SAM9_ARCADE_CONTRACT.entryCostVex : 0,
                    freePlay: !canAffordEntry,
                    balanceBefore: balance,
                    balanceAfter: newBalance,
                },
            });
        } catch (err) {
            logger.error?.(`[arcade-sessions] submit failed: ${(err as Error).message}`);
            res.status(500).json({ error: "internal_error" });
        }
    });

    /**
     * GET /api/arcade/sessions/me?gameKey=snake
     * Player's history + best score for one game (or all 9 if omitted).
     */
    app.get("/api/arcade/sessions/me", authMiddleware, async (req: AuthedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: "unauthorized" });
                return;
            }
            const gameKeyParam = typeof req.query.gameKey === "string" ? req.query.gameKey : null;
            if (gameKeyParam && !sam9KnowsArcadeGame(gameKeyParam)) {
                res.status(400).json({ error: "unknown_game" });
                return;
            }

            const whereExpr = gameKeyParam
                ? and(eq(arcadeSessions.userId, userId), eq(arcadeSessions.gameKey, gameKeyParam))
                : eq(arcadeSessions.userId, userId);

            const [stats] = await db
                .select({
                    best: sql<number>`COALESCE(MAX(${arcadeSessions.score}), 0)::int`,
                    runs: sql<number>`COUNT(*)::int`,
                    wins: sql<number>`COALESCE(SUM(CASE WHEN ${arcadeSessions.result} = 'win' THEN 1 ELSE 0 END), 0)::int`,
                })
                .from(arcadeSessions)
                .where(whereExpr);

            const recent = await db
                .select()
                .from(arcadeSessions)
                .where(whereExpr)
                .orderBy(desc(arcadeSessions.createdAt))
                .limit(20);

            res.json({
                ok: true,
                stats: {
                    best: Number(stats?.best ?? 0),
                    runs: Number(stats?.runs ?? 0),
                    wins: Number(stats?.wins ?? 0),
                },
                recent,
            });
        } catch (err) {
            logger.error?.(`[arcade-sessions] me fetch failed: ${(err as Error).message}`);
            res.status(500).json({ error: "internal_error" });
        }
    });

    /**
     * GET /api/arcade/leaderboard?gameKey=snake&limit=20
     * Top scores for one game, joined with the player's display name.
     */
    app.get("/api/arcade/leaderboard", async (req: Request, res: Response) => {
        try {
            const gameKey = typeof req.query.gameKey === "string" ? req.query.gameKey : null;
            if (!gameKey || !sam9KnowsArcadeGame(gameKey)) {
                res.status(400).json({ error: "unknown_game" });
                return;
            }
            const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

            const rows = await db.execute(sql`
                SELECT u.id AS user_id, u.username, u.first_name, u.avatar_url,
                       MAX(a.score) AS best_score,
                       COUNT(a.id) AS runs
                FROM arcade_sessions a
                JOIN users u ON u.id = a.user_id
                WHERE a.game_key = ${gameKey}
                GROUP BY u.id, u.username, u.first_name, u.avatar_url
                ORDER BY best_score DESC, runs DESC
                LIMIT ${limit}
            `);

            res.json({
                ok: true,
                gameKey,
                gameLabel: { ar: arcadeGameLabel(gameKey, "ar"), en: arcadeGameLabel(gameKey, "en") },
                rows: rows.rows ?? rows,
            });
        } catch (err) {
            logger.error?.(`[arcade-sessions] leaderboard failed: ${(err as Error).message}`);
            res.status(500).json({ error: "internal_error" });
        }
    });

    /**
     * GET /api/arcade/games
     * Sam9's allow-list of mini-games — used by clients to know what's
     * playable without re-importing the shared module.
     */
    app.get("/api/arcade/games", (_req: Request, res: Response) => {
        res.json({
            ok: true,
            games: ARCADE_GAME_KEYS.map((key) => getArcadeGame(key)).filter(Boolean),
        });
    });

    /**
     * GET /api/arcade/overview
     * Public overview for the arcade hub: engagement, finance, and multiplayer signals.
     */
    app.get("/api/arcade/overview", async (_req: Request, res: Response) => {
        try {
            const [stats] = await db
                .select({
                    totalRuns: sql<number>`COUNT(*)::int`,
                    totalPlayers: sql<number>`COUNT(DISTINCT ${arcadeSessions.userId})::int`,
                    totalVolumeVex: sql<number>`COALESCE(SUM(COALESCE((${arcadeSessions.metadata}->>'rewardVex')::numeric, 0)), 0)::float`,
                    avgScore: sql<number>`COALESCE(AVG(${arcadeSessions.score}), 0)::float`,
                    bestScore: sql<number>`COALESCE(MAX(${arcadeSessions.score}), 0)::int`,
                })
                .from(arcadeSessions);

            const [topGame] = await db
                .select({
                    gameKey: arcadeSessions.gameKey,
                    runs: sql<number>`COUNT(*)::int`,
                })
                .from(arcadeSessions)
                .groupBy(arcadeSessions.gameKey)
                .orderBy(sql`COUNT(*) DESC`, desc(arcadeSessions.gameKey))
                .limit(1);

            const multiplayerMatchesResult = await db.execute(sql`
                SELECT COUNT(*)::int AS count
                FROM game_matches
                WHERE status IN ('pending', 'in_progress')
            `);
            const multiplayerMatchesRow = Array.isArray(multiplayerMatchesResult.rows)
                ? multiplayerMatchesResult.rows[0]
                : undefined;

            const payload: ArcadeOverviewRow = {
                totalRuns: Number(stats?.totalRuns ?? 0),
                totalPlayers: Number(stats?.totalPlayers ?? 0),
                totalVolumeVex: Number(stats?.totalVolumeVex ?? 0),
                avgScore: Number(stats?.avgScore ?? 0),
                bestScore: Number(stats?.bestScore ?? 0),
                multiplayerMatches: Number((multiplayerMatchesRow as { count?: number } | undefined)?.count ?? 0),
                topGameKey: topGame?.gameKey ?? null,
            };

            res.json({
                ok: true,
                ...payload,
                topGame: payload.topGameKey ? getArcadeGame(payload.topGameKey) ?? null : null,
                investmentPitch: {
                    titleAr: "الأركيد كمنتج نمو",
                    titleEn: "Arcade as a growth product",
                    descriptionAr: "تحسين التجربة القصيرة + اللعب الجماعي + اقتصاد الرصيد يزيد العودة اليومية ويخلق مسار تسييل طبيعي.",
                    descriptionEn: "A polished short-session loop plus multiplayer and wallet economics improves retention and creates a natural monetization path.",
                },
            });
        } catch (err) {
            logger.error?.(`[arcade-sessions] overview failed: ${(err as Error).message}`);
            res.status(500).json({ error: "internal_error" });
        }
    });
}
