import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from './types';
import { randomBytes } from 'crypto';

interface AimTarget {
    id: string;
    x: number;
    y: number;
    radius: number;
    spawnAtMs: number;
    expireAtMs: number;
}

interface AimPlayerStats {
    playerId: string;
    hits: number;
    misses: number;
    accuracy: number;
    lastHitAtMs: number;
}

interface AimTrainerState {
    phase: 'waiting' | 'countdown' | 'active' | 'finished';
    startTimeMs: number;
    roundDurationMs: number;
    players: { [playerId: string]: AimPlayerStats };
    playerOrder: string[];
    targetSequence: AimTarget[];
    currentTargetIdx: number;
    gameStartedAtMs: number;
    difficulty: 'normal' | 'hard';
}

export class AimTrainerEngine implements GameEngine {
    gameType = 'aim_trainer';
    minPlayers = 1;
    maxPlayers = 2;

    private pseudoRandom(seed: number): number {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    private buildInitialState(playerIds: string[], roundDurationMs: number = 30000, difficulty: 'normal' | 'hard' = 'normal'): AimTrainerState {
        const targetSequence = this.generateTargetSequence(roundDurationMs, difficulty);
        return {
            phase: 'waiting',
            startTimeMs: Date.now(),
            roundDurationMs,
            players: Object.fromEntries(
                playerIds.map(pid => [pid, { playerId: pid, hits: 0, misses: 0, accuracy: 100, lastHitAtMs: 0 }])
            ),
            playerOrder: playerIds,
            targetSequence,
            currentTargetIdx: 0,
            gameStartedAtMs: 0,
            difficulty
        };
    }

    private generateTargetSequence(roundDurationMs: number, difficulty: 'normal' | 'hard'): AimTarget[] {
        const targets: AimTarget[] = [];
        const baseRadius = difficulty === 'hard' ? 30 : 42;
        const targetCount = Math.floor(roundDurationMs / 800);
        const seed = randomBytes(4).readUInt32BE(0);

        for (let i = 0; i < targetCount; i++) {
            const progress = i / targetCount;
            const spawnAtMs = i * 800;
            const radiusScale = Math.max(0.5, 1 - progress * 0.4);
            const expireWindowMs = Math.max(1200, 1600 - progress * 400);

            targets.push({
                id: `target_${i}`,
                x: this.pseudoRandom(seed + i * 2) * 100,
                y: this.pseudoRandom(seed + i * 2 + 1) * 100,
                radius: Math.round(baseRadius * radiusScale),
                spawnAtMs,
                expireAtMs: spawnAtMs + expireWindowMs
            });
        }

        return targets;
    }

    createInitialState(): string {
        return JSON.stringify(this.buildInitialState(['player1']));
    }

    initializeWithPlayers(playerIds: string[], roundDurationMs?: number, difficulty: 'normal' | 'hard' = 'normal'): string {
        const duration = Math.max(10000, Math.min(60000, roundDurationMs ?? 30000));
        return JSON.stringify(this.buildInitialState(playerIds, duration, difficulty));
    }

    validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
        try {
            const state = JSON.parse(stateJson) as AimTrainerState;
            if (!state.players[playerId]) return { valid: false, error: 'Not a player', errorKey: 'aim.notPlayer' };
            if (state.phase !== 'active') return { valid: false, error: 'Game not active', errorKey: 'aim.notActive' };
            if (move.type !== 'click') return { valid: false, error: 'Invalid move type', errorKey: 'aim.invalidMoveType' };

            const targetId = move.targetId as string | undefined;
            const x = move.x as number | undefined;
            const y = move.y as number | undefined;
            const clickTimestampMs = move.clickTimestampMs as number | undefined;

            if (!targetId || x === undefined || y === undefined || !clickTimestampMs) {
                return { valid: false, error: 'Missing click data', errorKey: 'aim.missingClickData' };
            }

            if (x < 0 || x > 100 || y < 0 || y > 100) {
                return { valid: false, error: 'Invalid coordinates', errorKey: 'aim.invalidCoordinates' };
            }

            return { valid: true };
        } catch {
            return { valid: false, error: 'Validation error', errorKey: 'aim.validationError' };
        }
    }

    applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
        try {
            const state = JSON.parse(stateJson) as AimTrainerState;
            const events: GameEvent[] = [];

            if (!state.players[playerId]) {
                return { success: false, newState: stateJson, events, error: 'Not a player' };
            }

            const targetId = move.targetId as string;
            const target = state.targetSequence.find(t => t.id === targetId);

            if (!target) {
                state.players[playerId].misses++;
                state.players[playerId].accuracy = this.calculateAccuracy(state.players[playerId]);
                return { success: true, newState: JSON.stringify(state), events };
            }

            const clickTimestampMs = move.clickTimestampMs as number;
            const elapsedMs = clickTimestampMs - state.gameStartedAtMs;

            if (elapsedMs >= target.spawnAtMs && elapsedMs <= target.expireAtMs) {
                state.players[playerId].hits++;
                state.players[playerId].lastHitAtMs = clickTimestampMs;
                state.players[playerId].accuracy = this.calculateAccuracy(state.players[playerId]);
                state.currentTargetIdx++;
                events.push({
                    type: 'score',
                    data: { playerId, hits: state.players[playerId].hits, accuracy: state.players[playerId].accuracy }
                });
            } else {
                state.players[playerId].misses++;
                state.players[playerId].accuracy = this.calculateAccuracy(state.players[playerId]);
            }

            const now = Date.now();
            const elapsed = now - state.gameStartedAtMs;
            if (elapsed >= state.roundDurationMs) {
                state.phase = 'finished';
                const winner = this.determineWinner(state);
                events.push({ type: 'game_over', data: { winner, reason: 'time_up' } });
            }

            return { success: true, newState: JSON.stringify(state), events };
        } catch (err) {
            return { success: false, newState: stateJson, events: [], error: String(err) };
        }
    }

    private calculateAccuracy(stats: AimPlayerStats): number {
        const total = stats.hits + stats.misses;
        return total === 0 ? 100 : Math.round((stats.hits / total) * 100);
    }

    private determineWinner(state: AimTrainerState): string | null {
        if (state.playerOrder.length === 1) return null;

        let winner: string | null = null;
        let maxHits = -1;
        let maxAccuracy = -1;
        let fastestLastHit = Infinity;

        for (const playerId of state.playerOrder) {
            const stats = state.players[playerId];
            if (!stats) continue;

            const betterHits = stats.hits > maxHits;
            const equalHits = stats.hits === maxHits;
            const betterAcc = equalHits && stats.accuracy > maxAccuracy;
            const fasterHit = equalHits && stats.accuracy === maxAccuracy && stats.lastHitAtMs < fastestLastHit;

            if (betterHits || betterAcc || fasterHit) {
                winner = playerId;
                maxHits = stats.hits;
                maxAccuracy = stats.accuracy;
                fastestLastHit = stats.lastHitAtMs;
            }
        }

        return winner;
    }

    getGameStatus(stateJson: string): GameStatus {
        try {
            const state = JSON.parse(stateJson) as AimTrainerState;
            const now = Date.now();
            const elapsed = state.gameStartedAtMs ? now - state.gameStartedAtMs : 0;

            if (state.phase === 'active' && elapsed >= state.roundDurationMs) {
                state.phase = 'finished';
            }

            if (state.phase === 'finished') {
                const winner = state.playerOrder.length === 1 ? null : this.determineWinner(state);
                return {
                    isOver: true,
                    winner: winner ?? undefined,
                    isDraw: state.playerOrder.length === 2 && this.isDraw(state),
                    reason: 'time_up',
                    scores: Object.fromEntries(
                        Object.entries(state.players).map(([pid, stats]) => [pid, stats.hits])
                    )
                };
            }

            return {
                isOver: false,
                scores: Object.fromEntries(
                    Object.entries(state.players).map(([pid, stats]) => [pid, stats.hits])
                )
            };
        } catch {
            return { isOver: false };
        }
    }

    private isDraw(state: AimTrainerState): boolean {
        if (state.playerOrder.length !== 2) return false;
        const stats0 = state.players[state.playerOrder[0]];
        const stats1 = state.players[state.playerOrder[1]];
        if (!stats0 || !stats1) return false;
        return stats0.hits === stats1.hits && stats0.accuracy === stats1.accuracy;
    }

    getValidMoves(stateJson: string, playerId: string): MoveData[] {
        return [{ type: 'click' }];
    }

    getPlayerView(stateJson: string, playerId: string): PlayerView {
        try {
            const state = JSON.parse(stateJson) as AimTrainerState;
            const now = Date.now();
            const elapsed = state.gameStartedAtMs ? now - state.gameStartedAtMs : 0;
            const remainingMs = Math.max(0, state.roundDurationMs - elapsed);

            const playerStats = state.players[playerId] || {
                playerId,
                hits: 0,
                misses: 0,
                accuracy: 100,
                lastHitAtMs: 0
            };

            const allStats: { [key: string]: any } = {};
            for (const pid of state.playerOrder) {
                const stats = state.players[pid];
                if (stats) {
                    allStats[pid] = { hits: stats.hits, misses: stats.misses, accuracy: stats.accuracy };
                }
            }

            const currentTarget = state.targetSequence[state.currentTargetIdx] || null;

            return {
                phase: state.phase,
                playerStats: { ...playerStats },
                allStats,
                remainingMs,
                currentTarget,
                targetSequence: state.targetSequence,
                playerOrder: state.playerOrder,
                difficulty: state.difficulty
            };
        } catch {
            return {};
        }
    }
}

export const aimTrainerEngine = new AimTrainerEngine();
