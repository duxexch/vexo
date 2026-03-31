import { eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { gameMoves, liveGameSessions } from '@shared/schema';
import { getGameEngine } from '../game-engines';
import type { MoveData } from '../game-engines/types';
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
import type { GameRoom } from './types';
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

            await wait(Math.max(220, decision.thinkMs));

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

            const gameStatus = engine.getGameStatus(turnResult.newState);
            if (gameStatus.isOver) {
                clearTurnTimer(sessionId);
                await recordAdaptiveGameResult({
                    sessionId,
                    gameType: room.gameType,
                    status: gameStatus,
                    stateJson: turnResult.newState,
                });
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
