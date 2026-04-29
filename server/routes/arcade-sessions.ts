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
import { arcadeSessions } from "@shared/schema";
import { ARCADE_GAME_KEYS, getArcadeGame } from "@shared/arcade-games";
import { authMiddleware } from "./middleware";
import { logger } from "../lib/logger";
import { chooseArcadeBanter, sam9KnowsArcadeGame, arcadeGameLabel } from "../lib/sam9-arcade-banter";

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
    typing_duel: 30,
    bomb_pass: 50,
    quiz_rush: 200,
    dice_battle: 100,
};
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

            // Compute personal best vs the player's previous max.
            const [prev] = await db
                .select({ best: sql<number>`COALESCE(MAX(${arcadeSessions.score}), 0)::int`, runs: sql<number>`COUNT(*)::int` })
                .from(arcadeSessions)
                .where(and(eq(arcadeSessions.userId, userId), eq(arcadeSessions.gameKey, gameKey)));
            const previousBest = Number(prev?.best ?? 0);
            const previousRuns = Number(prev?.runs ?? 0);
            const isPersonalBest = score > previousBest && score > 0;

            const [row] = await db
                .insert(arcadeSessions)
                .values({
                    userId,
                    gameKey,
                    score,
                    result,
                    durationMs,
                    isPersonalBest,
                    metadata: (metadata ?? {}) as Record<string, unknown>,
                })
                .returning();

            const banter = chooseArcadeBanter({
                gameKey,
                outcome: result,
                score,
                isPersonalBest,
                totalRuns: previousRuns + 1,
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
}
