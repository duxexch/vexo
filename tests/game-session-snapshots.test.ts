import { describe, it, expect, vi, beforeEach } from "vitest";
/* Test module under test */
import {
    restoreGameStateFromSnapshotsIfMissing,
    restoreGameStateFromSnapshotsIfMissingInDb,
} from "../server/lib/game-session-snapshots";

// ---- Mocks ----
const latestSnapshot = {
    orderingIndex: 10,
    stateJson: `{"fen":"mock"}`,
    correlationId: "corr:1",
    createdAt: new Date(),
};

const mockGetLatestGameSessionSnapshot = vi.fn();

vi.mock("../server/storage", () => {
    return {
        storage: {
            getLatestGameSessionSnapshot: (...args: unknown[]) => mockGetLatestGameSessionSnapshot(...args),
            // not used by these tests
            upsertGameSessionSnapshot: vi.fn(),
        },
    };
});

const mockDbUpdateWhere = vi.fn();

vi.mock("../server/db", () => {
    return {
        db: {
            update: vi.fn(() => ({
                set: vi.fn(() => ({
                    where: vi.fn(() => {
                        mockDbUpdateWhere();
                        return Promise.resolve(undefined);
                    }),
                })),
            })),
        },
    };
});

beforeEach(() => {
    mockGetLatestGameSessionSnapshot.mockReset();
    mockDbUpdateWhere.mockReset();
});

describe("restoreGameStateFromSnapshotsIfMissing", () => {
    it("restores latest snapshot state when existingGameState is missing", async () => {
        mockGetLatestGameSessionSnapshot.mockResolvedValue(latestSnapshot);

        const updateGameState = vi.fn(async (_next: string) => { });
        const restored = await restoreGameStateFromSnapshotsIfMissing({
            sessionId: "s1",
            currentTurnNumber: 20,
            existingGameState: null,
            updateGameState,
        });

        expect(restored).toBe(latestSnapshot.stateJson);
        expect(updateGameState).toHaveBeenCalledTimes(1);
        expect(updateGameState).toHaveBeenCalledWith(latestSnapshot.stateJson);
    });

    it("returns existingGameState and does not touch DB when existingGameState present", async () => {
        mockGetLatestGameSessionSnapshot.mockResolvedValue(latestSnapshot);

        const updateGameState = vi.fn(async (_next: string) => { });
        const restored = await restoreGameStateFromSnapshotsIfMissing({
            sessionId: "s1",
            currentTurnNumber: 20,
            existingGameState: `{"fen":"already"}`,
            updateGameState,
        });

        expect(restored).toBe(`{"fen":"already"}`);
        expect(updateGameState).not.toHaveBeenCalled();
        expect(mockGetLatestGameSessionSnapshot).not.toHaveBeenCalled();
    });

    it("returns null when snapshot does not exist", async () => {
        mockGetLatestGameSessionSnapshot.mockResolvedValue(null);

        const updateGameState = vi.fn(async (_next: string) => { });
        const restored = await restoreGameStateFromSnapshotsIfMissing({
            sessionId: "s1",
            currentTurnNumber: 20,
            existingGameState: "",
            updateGameState,
        });

        expect(restored).toBeNull();
        expect(updateGameState).not.toHaveBeenCalled();
    });
});

describe("restoreGameStateFromSnapshotsIfMissingInDb", () => {
    it("updates liveGameSessions.gameState from snapshot when existingGameState missing", async () => {
        mockGetLatestGameSessionSnapshot.mockResolvedValue(latestSnapshot);

        const restored = await restoreGameStateFromSnapshotsIfMissingInDb({
            sessionId: "s1",
            currentTurnNumber: 20,
            existingGameState: null,
        });

        expect(restored).toBe(latestSnapshot.stateJson);
        expect(mockDbUpdateWhere).toHaveBeenCalledTimes(1);
    });

    it("does not update DB when existingGameState present", async () => {
        mockGetLatestGameSessionSnapshot.mockResolvedValue(latestSnapshot);

        const restored = await restoreGameStateFromSnapshotsIfMissingInDb({
            sessionId: "s1",
            currentTurnNumber: 20,
            existingGameState: `{"fen":"already"}`,
        });

        expect(restored).toBe(`{"fen":"already"}`);
        expect(mockDbUpdateWhere).not.toHaveBeenCalled();
        expect(mockGetLatestGameSessionSnapshot).not.toHaveBeenCalled();
    });
});
