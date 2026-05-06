import { eq } from 'drizzle-orm';
import { liveGameSessions } from '@shared/schema';
import { storage } from '../storage';
import { db } from '../db';

type PersistDecision = {
    persist: boolean;
    reason: string;
};

const DEFAULT_SNAPSHOT_EVERY_N_MOVES = 5;
const DEFAULT_SNAPSHOT_INTERVAL_MS = 15_000;

const SNAPSHOT_EVERY_N_MOVES = (() => {
    const raw = process.env.GAME_SESSION_SNAPSHOT_EVERY_N_MOVES;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNAPSHOT_EVERY_N_MOVES;
})();

const SNAPSHOT_INTERVAL_MS = (() => {
    const raw = process.env.GAME_SESSION_SNAPSHOT_INTERVAL_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNAPSHOT_INTERVAL_MS;
})();

// In-memory cadence controls. For multi-node deployments, pair with sticky sessions
// (already present in the project for realtime), or accept best-effort per-node snapshots.
const lastPersistedTurnBySession = new Map<string, number>();
const lastPersistedAtMsBySession = new Map<string, number>();

function decidePersistSnapshot(sessionId: string, turnNumber: number): PersistDecision {
    const lastTurn = lastPersistedTurnBySession.get(sessionId);
    const lastAt = lastPersistedAtMsBySession.get(sessionId) ?? 0;

    if (!Number.isFinite(turnNumber) || turnNumber < 1) {
        return { persist: false, reason: 'turnNumber_invalid' };
    }

    if (lastTurn === undefined) {
        return { persist: true, reason: 'first_snapshot' };
    }

    const movedBy = turnNumber - lastTurn;
    if (movedBy >= SNAPSHOT_EVERY_N_MOVES) {
        return { persist: true, reason: 'every_n_moves' };
    }

    const now = Date.now();
    if (now - lastAt >= SNAPSHOT_INTERVAL_MS) {
        return { persist: true, reason: 'interval_ms' };
    }

    return { persist: false, reason: 'not_due' };
}

export async function persistGameSessionSnapshotIfDue(params: {
    sessionId: string;
    turnNumber: number;
    stateJson: string;
    correlationId?: string;
}): Promise<void> {
    const { sessionId, turnNumber, stateJson, correlationId } = params;

    const decision = decidePersistSnapshot(sessionId, turnNumber);
    if (!decision.persist) return;

    await storage.upsertGameSessionSnapshot({
        sessionId,
        orderingIndex: turnNumber,
        stateJson,
        correlationId,
    });

    lastPersistedTurnBySession.set(sessionId, turnNumber);
    lastPersistedAtMsBySession.set(sessionId, Date.now());
}

/**
 * Restore gameState from latest snapshot if existingGameState is missing/falsy.
 * The `updateGameState` callback is used to update live_game_sessions either
 * in a transaction (for move commits) or outside of one (for reads).
 */
export async function restoreGameStateFromSnapshotsIfMissing(params: {
    sessionId: string;
    currentTurnNumber: number;
    existingGameState?: string | null;
    updateGameState: (nextGameStateJson: string) => Promise<void>;
}): Promise<string | null> {
    const { sessionId, currentTurnNumber, existingGameState, updateGameState } = params;

    if (typeof existingGameState === 'string' && existingGameState.trim().length > 0) {
        return existingGameState;
    }

    const latest = await storage.getLatestGameSessionSnapshot(sessionId, currentTurnNumber);
    if (!latest?.stateJson) {
        return null;
    }

    await updateGameState(latest.stateJson);
    return latest.stateJson;
}

/**
 * Convenience wrapper for non-transactional reads (e.g. state_sync).
 */
export async function restoreGameStateFromSnapshotsIfMissingInDb(params: {
    sessionId: string;
    currentTurnNumber: number;
    existingGameState?: string | null;
}): Promise<string | null> {
    const { sessionId, currentTurnNumber, existingGameState } = params;

    return restoreGameStateFromSnapshotsIfMissing({
        sessionId,
        currentTurnNumber,
        existingGameState,
        updateGameState: async (nextGameStateJson) => {
            await db
                .update(liveGameSessions)
                .set({ gameState: nextGameStateJson, updatedAt: new Date() })
                .where(eq(liveGameSessions.id, sessionId));
        },
    });
}
