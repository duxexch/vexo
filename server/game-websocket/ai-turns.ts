import { eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { gameMoves, liveGameSessions, users } from '@shared/schema';
import { getGameEngine } from '../game-engines';
import type { MoveData, GameStatus } from '../game-engines/types';
import { logger } from '../lib/logger';
import { aiMonitor } from '../lib/ai-monitor';
import {
    chooseAdaptiveAIMove,
    getAdaptiveAiSessionConfig,
    isAdaptiveAiPlayer,
    recordAdaptiveAiMove,
    recordAdaptiveGameResult,
    resolveCurrentPlayerFromState,
} from '../lib/adaptive-ai';
import { getPlayerProfile } from '../lib/sam9-player-profile';
import { computeEngagementPlan } from '../lib/sam9-engagement';
import {
    ensureMatchRecordOpen,
    recordBotMoveStat,
} from '../lib/sam9-match-records';
import {
    dispatchMidGameBanter,
    dispatchOpeningBanter,
} from '../lib/sam9-banter-dispatcher';
import type { GameRoom } from './types';
import { getEffectiveAiSpeedMultiplier } from './speed-mode';
import { send } from './utils';
import { clearTurnTimer, startTurnTimer } from './timers-disconnect';
import { handleGameOver } from './game-over';

const aiProcessingLocks = new Set<string>();

const allowedMoveKeys = [
    'type', 'from', 'to', 'promotion', 'die', 'dieValues', 'position', 'tileId', 'side',
    'card', 'bid', 'suit', 'rank', 'action', 'target', 'source', 'destination', 'piece',
    'selectedTile', 'playedTile', 'drawFromBoneyard', 'pass', 'endSide', 'trump', 'declaration',
    'team', 'points', 'gameType', 'trumpSuit', 'tile', 'end',
] as const;

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeMove(move: MoveData): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const key of allowedMoveKeys) {
        if (key in move) {
            sanitized[key] = (move as Record<string, unknown>)[key];
        }
    }
    return sanitized;
}

function fallbackCurrentPlayerFromSession(session: {
    player1Id: string | null;
    player2Id: string | null;
    player3Id?: string | null;
    player4Id?: string | null;
}): {
    player1Id?: string | null;
    player2Id?: string | null;
    player3Id?: string | null;
    player4Id?: string | null;
} {
    return {
        player1Id: session.player1Id,
        player2Id: session.player2Id,
        player3Id: session.player3Id,
        player4Id: session.player4Id,
    };
}

async function broadcastAiUpdate(room: GameRoom, newState: string, events: unknown[], turnNumber: number): Promise<void> {
    const engine = getGameEngine(room.gameType);
    if (!engine) return;

    for (const [playerId, playerWs] of room.players) {
        const playerView = engine.getPlayerView(newState, playerId);
        send(playerWs, {
            type: 'game_update',
            payload: {
                gameType: room.gameType,
                events,
                view: playerView,
                turnNumber,
            },
        });
    }

    const spectatorView = engine.getPlayerView(newState, 'spectator');
    for (const [, spectatorWs] of room.spectators) {
        send(spectatorWs, {
            type: 'game_update',
            payload: {
                gameType: room.gameType,
                events,
                view: spectatorView,
                turnNumber,
            },
        });
    }
}

const botUsernameCache = new Map<string, string>();

async function resolveBotUsername(botUserId: string): Promise<string> {
    const cached = botUsernameCache.get(botUserId);
    if (cached) return cached;
    try {
        const [row] = await db.select({ username: users.username }).from(users).where(eq(users.id, botUserId)).limit(1);
        const name = row?.username || "Sam9";
        botUsernameCache.set(botUserId, name);
        return name;
    } catch {
        return "Sam9";
    }
}

export async function processAdaptiveAiTurns(sessionId: string, room: GameRoom): Promise<void> {
    if (aiProcessingLocks.has(sessionId)) {
        return;
    }

    aiProcessingLocks.add(sessionId);

    try {
        const aiConfig = await getAdaptiveAiSessionConfig(sessionId);
        if (!aiConfig || !aiConfig.enabled || aiConfig.botPlayerIds.length === 0) {
            return;
        }

        const engine = getGameEngine(room.gameType);
        if (!engine) {
            return;
        }

        // ── Sam9 v2: per-session opponent context ─────────────────────────
        // Pick the primary human opponent + bot identity. We compute the
        // engagement plan once per match (not per move) so the banter mood
        // is stable across the session even if profile data updates mid-game.
        const primaryHumanId = aiConfig.humanPlayerIds[0] || null;
        const primaryBotId = aiConfig.botPlayerIds[0];
        const enableBanter = Boolean(primaryHumanId && primaryBotId);
        let openedMatchRecord = false;
        let cachedMood: ReturnType<typeof computeEngagementPlan>["banterMood"] = "professional";
        let cachedBotUsername = "Sam9";

        if (enableBanter && primaryHumanId) {
            try {
                cachedBotUsername = await resolveBotUsername(primaryBotId);
                const profile = await getPlayerProfile(primaryHumanId);
                const plan = computeEngagementPlan(profile, aiConfig.difficultyLevel);
                cachedMood = plan.banterMood;

                // Open the match record now and emit the opening line.
                const openResult = await ensureMatchRecordOpen({
                    sessionId,
                    humanUserId: primaryHumanId,
                    botUserId: primaryBotId,
                    botUserIds: aiConfig.botPlayerIds,
                    botUsername: cachedBotUsername,
                    gameType: room.gameType,
                    profile,
                    plan,
                    baseDifficulty: aiConfig.difficultyLevel,
                });
                openedMatchRecord = !!openResult;

                // Opening banter — emit ONCE per session. `wasCreated` is
                // false on subsequent invocations of `processAdaptiveAiTurns`
                // (which fires every AI turn), so the opening line never
                // repeats mid-match.
                if (openResult?.wasCreated) {
                    void dispatchOpeningBanter({
                        room,
                        sessionId,
                        botUserId: primaryBotId,
                        botUsername: cachedBotUsername,
                        humanUserId: primaryHumanId,
                        trigger: "opening",
                        mood: cachedMood,
                    });
                }
            } catch (error) {
                logger.warn?.(`[ai-turns] Sam9 v2 setup skipped: ${(error as Error).message}`);
            }
        }

        let loopCount = 0;
        while (loopCount < 32) {
            const liveSession = await storage.getLiveGameSession(sessionId);
            if (!liveSession || liveSession.status !== 'in_progress') {
                break;
            }

            const stateJson = liveSession.gameState || room.gameState || engine.createInitialState();
            room.gameState = stateJson;

            const currentPlayerId = resolveCurrentPlayerFromState(
                room.gameType,
                stateJson,
                fallbackCurrentPlayerFromSession(liveSession),
            );

            if (!isAdaptiveAiPlayer(aiConfig, currentPlayerId)) {
                break;
            }

            const decision = await chooseAdaptiveAIMove({
                sessionId,
                engine,
                gameType: room.gameType,
                stateJson,
                botPlayerId: currentPlayerId!,
                difficultyLevel: aiConfig.difficultyLevel,
                humanPlayerIds: aiConfig.humanPlayerIds,
            });

            if (!decision) {
                const status = engine.getGameStatus(stateJson);
                if (!status.isOver) {
                    aiMonitor.recordError('move_failure', {
                        message: 'Adaptive AI could not select a valid move.',
                        sessionId,
                        gameType: room.gameType,
                        severity: 'warning',
                    });
                    aiMonitor.recordAnomaly({
                        anomalyType: 'zero_moves',
                        gameType: room.gameType,
                    });
                }
                break;
            }

            // Floor the AI think time at 120ms so trivial decisions (forced
            // single-move plays etc.) don't feel like the bot is stalling,
            // then scale by the room's effective speed multiplier (set by
            // players via `set_speed_mode`). The 80ms hard floor below keeps
            // bot moves visible — they never appear instantaneous.
            const baseThinkMs = Math.max(120, decision.thinkMs);
            const speedMultiplier = getEffectiveAiSpeedMultiplier(room.playerSpeedMultipliers);
            const scaledThinkMs = Math.max(80, Math.round(baseThinkMs * speedMultiplier));
            await wait(scaledThinkMs);

            const turnResult = await db.transaction(async (tx) => {
                const [lockedSession] = await tx
                    .select()
                    .from(liveGameSessions)
                    .where(eq(liveGameSessions.id, sessionId))
                    .for('update');

                if (!lockedSession || lockedSession.status !== 'in_progress') {
                    throw new Error('SESSION_NOT_ACTIVE');
                }

                const lockedState = lockedSession.gameState || stateJson;
                const activePlayerId = resolveCurrentPlayerFromState(
                    room.gameType,
                    lockedState,
                    fallbackCurrentPlayerFromSession(lockedSession),
                );

                if (!isAdaptiveAiPlayer(aiConfig, activePlayerId)) {
                    throw new Error('AI_TURN_NOT_READY');
                }

                const validation = engine.validateMove(lockedState, activePlayerId!, decision.move);
                if (!validation.valid) {
                    aiMonitor.recordError('move_failure', {
                        message: validation.error || 'AI_INVALID_MOVE',
                        sessionId,
                        gameType: room.gameType,
                        severity: 'warning',
                    });
                    throw new Error(validation.error || 'AI_INVALID_MOVE');
                }

                const applyResult = engine.applyMove(lockedState, activePlayerId!, decision.move);
                if (!applyResult.success) {
                    aiMonitor.recordError('engine_error', {
                        message: applyResult.error || 'AI_MOVE_APPLY_FAILED',
                        sessionId,
                        gameType: room.gameType,
                        severity: 'critical',
                    });
                    throw new Error(applyResult.error || 'AI_MOVE_APPLY_FAILED');
                }

                const nextTurnNumber = (lockedSession.turnNumber || 0) + 1;

                await tx
                    .update(liveGameSessions)
                    .set({
                        gameState: applyResult.newState,
                        turnNumber: nextTurnNumber,
                        updatedAt: new Date(),
                    })
                    .where(eq(liveGameSessions.id, sessionId));

                await tx.insert(gameMoves).values({
                    sessionId,
                    playerId: activePlayerId!,
                    moveNumber: nextTurnNumber,
                    moveType: decision.move.type || 'move',
                    moveData: JSON.stringify(sanitizeMove(decision.move)),
                    isValid: true,
                });

                return {
                    newState: applyResult.newState,
                    events: applyResult.events,
                    turnNumber: nextTurnNumber,
                    actorId: activePlayerId!,
                    move: decision.move,
                    confidence: decision.confidence,
                    consideredMoves: decision.consideredMoves,
                };
            });

            room.gameState = turnResult.newState;

            await recordAdaptiveAiMove({
                sessionId,
                botPlayerId: turnResult.actorId,
                gameType: room.gameType,
                difficultyLevel: aiConfig.difficultyLevel,
                move: turnResult.move,
                turnNumber: turnResult.turnNumber,
                confidence: turnResult.confidence,
                consideredMoves: turnResult.consideredMoves,
            });

            await broadcastAiUpdate(room, turnResult.newState, turnResult.events, turnResult.turnNumber);

            // Sam9 v2: track per-match move stats and (rate-limited) banter.
            if (enableBanter && primaryHumanId && openedMatchRecord) {
                recordBotMoveStat(sessionId, turnResult.confidence);
                // High-confidence moves → "good_own_move", low → "good_player_move"
                // (a humble nod toward the human's pressure). The cadence gate
                // inside the dispatcher ensures we only emit ~1 line / 5 moves.
                const trigger = turnResult.confidence >= 0.6 ? "good_own_move" : "good_player_move";
                void dispatchMidGameBanter({
                    room,
                    sessionId,
                    botUserId: primaryBotId,
                    botUsername: cachedBotUsername,
                    humanUserId: primaryHumanId,
                    trigger,
                    mood: cachedMood,
                });
            }

            const gameStatus = engine.getGameStatus(turnResult.newState);
            if (gameStatus.isOver) {
                clearTurnTimer(sessionId);
                await recordAdaptiveGameResult({
                    sessionId,
                    gameType: room.gameType,
                    status: gameStatus,
                    stateJson: turnResult.newState,
                });
                // Sam9 v2: per-match record close + engagement-on-finish
                // banter is centralised inside `handleGameOver` so every
                // game-over path (AI loop, timeout, resignation, disconnect)
                // closes cleanly without duplication.
                await handleGameOver(room, gameStatus);
                return;
            }

            loopCount += 1;
        }

        const latestSession = await storage.getLiveGameSession(sessionId);
        if (!latestSession || !latestSession.gameState) {
            return;
        }

        room.gameState = latestSession.gameState;

        const nextPlayer = resolveCurrentPlayerFromState(
            room.gameType,
            latestSession.gameState,
            fallbackCurrentPlayerFromSession(latestSession),
        );

        if (nextPlayer && !isAdaptiveAiPlayer(aiConfig, nextPlayer)) {
            startTurnTimer(sessionId, nextPlayer, room.turnTimeLimitMs);
        }
    } catch (error) {
        logger.error('[AdaptiveAI] Failed to process AI turns', error as Error);
        aiMonitor.recordError('engine_error', {
            message: error instanceof Error ? error.message : String(error),
            sessionId,
            gameType: room.gameType,
            severity: 'critical',
        });
    } finally {
        aiProcessingLocks.delete(sessionId);
    }
}
