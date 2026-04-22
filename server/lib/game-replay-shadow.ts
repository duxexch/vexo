import { createHash } from 'node:crypto';
import type { GameEngine, MoveData } from '../game-engines/types';
import { logger } from './logger';
import { trackReplayShadowCheck } from './health';

type ReplayScope = 'live' | 'challenge';

const GAME_REPLAY_SHADOW_ENABLED = process.env.GAME_REPLAY_SHADOW_ENABLED !== 'false';
const GAME_REPLAY_SHADOW_LOG_MATCH = process.env.GAME_REPLAY_SHADOW_LOG_MATCH === 'true';

export interface ReplayShadowValidationInput {
    scope: ReplayScope;
    gameType: string;
    userId: string;
    move: MoveData;
    preState: string;
    committedState: string;
    sessionId?: string;
    challengeId?: string;
    turnNumber?: number;
}

export interface ReplayShadowValidationResult {
    enabled: boolean;
    drift: boolean;
    reason: string;
    expectedHash?: string;
    replayHash?: string;
    replayedState?: string;
}

export interface SessionReplayEvent {
    actorId: string;
    payload: unknown;
}

export interface SessionReplayValidationInput {
    scope: ReplayScope;
    gameType: string;
    initialState: string;
    events: SessionReplayEvent[];
    committedState: string;
    sessionId?: string;
    challengeId?: string;
    turnNumber?: number;
}

function stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right));

    const serializedEntries = entries.map(([key, entryValue]) => {
        return `${JSON.stringify(key)}:${stableSerialize(entryValue)}`;
    });

    return `{${serializedEntries.join(',')}}`;
}

function hashState(stateJson: string): string {
    try {
        const parsed = JSON.parse(stateJson) as unknown;
        return createHash('sha256').update(stableSerialize(parsed)).digest('hex');
    } catch {
        return createHash('sha256').update(stateJson).digest('hex');
    }
}

function normalizeReason(reason: string): string {
    const trimmed = reason.trim();
    return trimmed ? trimmed.slice(0, 64) : 'unknown';
}

function extractMoveFromEventPayload(payload: unknown): MoveData | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const payloadObj = payload as Record<string, unknown>;
    const nestedMove = payloadObj.move;
    if (nestedMove && typeof nestedMove === 'object') {
        const nestedMoveObj = nestedMove as Record<string, unknown>;
        if (typeof nestedMoveObj.type === 'string') {
            return nestedMoveObj as MoveData;
        }
    }

    if (typeof payloadObj.type === 'string') {
        return payloadObj as MoveData;
    }

    return null;
}

export function runReplayShadowValidation(
    input: ReplayShadowValidationInput,
    engine: Pick<GameEngine, 'validateMove' | 'applyMove'>,
): ReplayShadowValidationResult {
    if (!GAME_REPLAY_SHADOW_ENABLED) {
        return {
            enabled: false,
            drift: false,
            reason: 'disabled',
        };
    }

    let drift = false;
    let reason = 'match';
    let expectedHash: string | undefined;
    let replayHash: string | undefined;

    try {
        const replayValidation = engine.validateMove(input.preState, input.userId, input.move);

        if (!replayValidation.valid) {
            drift = true;
            reason = normalizeReason(`replay_validation:${replayValidation.errorKey || 'invalid_move'}`);
        } else {
            const replayApply = engine.applyMove(input.preState, input.userId, input.move);
            if (!replayApply.success) {
                drift = true;
                reason = normalizeReason(`replay_apply:${replayApply.error || 'failed'}`);
            } else {
                expectedHash = hashState(input.committedState);
                replayHash = hashState(replayApply.newState);

                if (expectedHash !== replayHash) {
                    drift = true;
                    reason = 'state_hash_mismatch';
                }
            }
        }
    } catch (error) {
        drift = true;
        reason = normalizeReason(`replay_exception:${error instanceof Error ? error.name : 'unknown'}`);
    }

    trackReplayShadowCheck({
        scope: input.scope,
        drift,
        reason,
    });

    if (drift) {
        logger.warn('[ReplayShadow] Drift detected', {
            scope: input.scope,
            gameType: input.gameType,
            sessionId: input.sessionId,
            challengeId: input.challengeId,
            userId: input.userId,
            turnNumber: input.turnNumber,
            reason,
            expectedHash,
            replayHash,
        });
    } else if (GAME_REPLAY_SHADOW_LOG_MATCH) {
        logger.debug('[ReplayShadow] Match', {
            scope: input.scope,
            gameType: input.gameType,
            sessionId: input.sessionId,
            challengeId: input.challengeId,
            turnNumber: input.turnNumber,
        });
    }

    return {
        enabled: true,
        drift,
        reason,
        expectedHash,
        replayHash,
    };
}

export function runSessionReplayValidation(
    input: SessionReplayValidationInput,
    engine: Pick<GameEngine, 'validateMove' | 'applyMove'>,
): ReplayShadowValidationResult {
    if (!GAME_REPLAY_SHADOW_ENABLED) {
        return {
            enabled: false,
            drift: false,
            reason: 'disabled',
        };
    }

    let drift = false;
    let reason = 'session_match';
    let expectedHash: string | undefined;
    let replayHash: string | undefined;
    let replayState = input.initialState;

    try {
        for (let i = 0; i < input.events.length; i += 1) {
            const event = input.events[i];
            const move = extractMoveFromEventPayload(event.payload);

            if (!move) {
                drift = true;
                reason = normalizeReason(`session_payload_invalid:${i + 1}`);
                break;
            }

            const validation = engine.validateMove(replayState, event.actorId, move);
            if (!validation.valid) {
                drift = true;
                reason = normalizeReason(`session_validation:${validation.errorKey || i + 1}`);
                break;
            }

            const applyResult = engine.applyMove(replayState, event.actorId, move);
            if (!applyResult.success) {
                drift = true;
                reason = normalizeReason(`session_apply:${applyResult.error || i + 1}`);
                break;
            }

            replayState = applyResult.newState;
        }

        expectedHash = hashState(input.committedState);
        replayHash = hashState(drift ? input.initialState : replayState);

        if (!drift && replayHash !== expectedHash) {
            drift = true;
            reason = 'session_state_hash_mismatch';
        }
    } catch (error) {
        drift = true;
        reason = normalizeReason(`session_exception:${error instanceof Error ? error.name : 'unknown'}`);
    }

    trackReplayShadowCheck({
        scope: input.scope,
        drift,
        reason,
    });

    if (drift) {
        logger.warn('[ReplayShadow] Session drift detected', {
            scope: input.scope,
            gameType: input.gameType,
            sessionId: input.sessionId,
            challengeId: input.challengeId,
            turnNumber: input.turnNumber,
            eventsReplayed: input.events.length,
            reason,
            expectedHash,
            replayHash,
        });
    } else if (GAME_REPLAY_SHADOW_LOG_MATCH) {
        logger.debug('[ReplayShadow] Session match', {
            scope: input.scope,
            gameType: input.gameType,
            sessionId: input.sessionId,
            challengeId: input.challengeId,
            turnNumber: input.turnNumber,
            eventsReplayed: input.events.length,
        });
    }

    return {
        enabled: true,
        drift,
        reason,
        expectedHash,
        replayHash,
        replayedState: drift ? undefined : replayState,
    };
}
