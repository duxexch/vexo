import { describe, expect, it, beforeEach, vi } from "vitest";
import type { WebSocket } from "ws";

const lockedSessionForTest = {
  player1Id: "p1",
  player2Id: "p2",
  player3Id: null as string | null,
  player4Id: null as string | null,
  status: "in_progress",
  turnNumber: 5,
  // GameRoom.gameState is string in this codebase.
  gameState: JSON.stringify({ g: 1 }),
  challengeId: null as string | null,
  gameType: "chess",
  turnTimeLimitMs: 30_000,
};

const baseSessionId = "s-sec-1";
const engine = {
  createInitialState: () => ({ init: true }),
  validateMove: vi.fn(() => ({ valid: false, error: "INVALID_MOVE", errorKey: "invalid" })),
  applyMove: vi.fn(() => ({ success: false, error: "INVALID_MOVE" })),
  getPlayerView: vi.fn(() => ({ view: "x" })),
  getGameStatus: vi.fn(() => ({ isOver: false })),
};

vi.mock("../server/game-engines", () => ({
  getGameEngine: vi.fn(() => engine),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getLiveGameSession: vi.fn(async () => ({
      // GameRoom.gameState is string in this codebase.
      gameState: JSON.stringify({ g: 1 }),
      turnNumber: lockedSessionForTest.turnNumber,
    })),
    getGameMoves: vi.fn(async () => []),
  },
}));

vi.mock("../server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: vi.fn(async () => [{ stateMode: 'CANONICAL' }]),
        }),
      }),
    })),
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => [
                {
                  player1Id: lockedSessionForTest.player1Id,
                  player2Id: lockedSessionForTest.player2Id,
                  player3Id: lockedSessionForTest.player3Id,
                  player4Id: lockedSessionForTest.player4Id,
                  status: lockedSessionForTest.status,
                  turnNumber: lockedSessionForTest.turnNumber,
                  gameState: lockedSessionForTest.gameState,
                  challengeId: lockedSessionForTest.challengeId,
                  gameType: lockedSessionForTest.gameType,
                  turnTimeLimitMs: lockedSessionForTest.turnTimeLimitMs,
                  // match legacy naming
                  id: baseSessionId,
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => undefined,
          }),
        }),
        insert: () => ({
          values: async () => undefined,
        }),
      };

      return fn(tx);
    }),
  },
}));

vi.mock("../server/lib/game-events", () => ({
  appendGameEvent: vi.fn(async () => ({
    duplicate: false,
    recordId: "rec-1",
  })),
  finalizeGameEvent: vi.fn(async () => undefined),
}));

vi.mock("../server/lib/game-replay-shadow", () => ({
  runReplayShadowValidation: vi.fn(() => undefined),
  runSessionReplayValidation: vi.fn(() => ({
    drift: false,
    reason: "ok",
    expectedHash: "e",
    replayHash: "r",
  })),
}));

vi.mock("../server/lib/game-level1-anomaly", () => ({
  evaluateAndRecordSubmission: vi.fn(() => ({
    blocked: false,
    anomalies: [],
    blockMs: null,
  })),
  evaluateAndRecordInvalid: vi.fn(() => ({ blocked: false, anomalies: [] })),
}));

vi.mock("../server/lib/prometheus-metrics", () => ({
  gameLevel1AnomalyTotal: { inc: vi.fn() },
  wsMoveTurnMismatchRejectedTotal: { inc: vi.fn() },
}));

vi.mock("../server/lib/game-session-snapshots", () => ({
  persistGameSessionSnapshotIfDue: vi.fn(async () => undefined),
}));

vi.mock("../server/game-websocket/inflight-move-limiter", () => ({
  sessionMoveInFlightLimiter: {
    tryAcquire: () => ({ allowed: true }),
  },
}));

vi.mock("../server/game-websocket/ai-turns", () => ({
  processAdaptiveAiTurns: vi.fn(async () => undefined),
}));

import { rooms } from "../server/game-websocket/types";
import { handleMakeMove } from "../server/game-websocket/moves";

function createWs(userId: string) {
  const sent: string[] = [];
  const ws = {
    readyState: (1 as unknown) as number,
    userId,
    username: userId,
    role: "player",
    isSpectator: false,
    sessionId: baseSessionId,
    correlationId: "corr",
    attemptId: "att",
    send: (data: any) => {
      sent.push(typeof data === "string" ? data : String(data));
    },
  } as unknown as WebSocket & {
    userId: string;
    sessionId: string;
    isSpectator: boolean;
    correlationId?: string;
    attemptId?: string;
    send: (data: any) => void;
  };

  return { ws, sent };
}

function parseSent(sent: string[]) {
  return sent.map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return { raw: s };
    }
  });
}

describe("game-websocket make_move security invariants (unit)", () => {
  beforeEach(() => {
    rooms.clear();
    // reset turn for each test
    lockedSessionForTest.turnNumber = 5;
    lockedSessionForTest.gameState = JSON.stringify({ g: 1 });

    rooms.set(baseSessionId, {
      sessionId: baseSessionId,
      gameType: "chess",
      gameState: JSON.stringify({ g: 1 }),
      players: new Map<string, any>(),
      spectators: new Map<string, any>(),
      turnTimeLimitMs: 30_000,
    });
  });

  it("rejects a non-participant (session isolation invariant)", async () => {
    const intruderId = "intruder";
    const { ws, sent } = createWs(intruderId);

    await handleMakeMove(ws as any, {
      move: { type: "move" } as any,
      expectedTurn: 5,
      idempotencyKey: "idem-1",
      correlationId: "client-ignored",
    });

    const messages = parseSent(sent);
    const errorMsg = messages.find((m) => m?.type === "error");
    expect(errorMsg?.payload?.code).toBe("UNAUTHORIZED");
    expect(errorMsg?.payload?.reason).toMatch(/not authorized/i);
    // ensure no state leak keys are present
    expect(JSON.stringify(messages)).not.toContain("dbState");
    expect(JSON.stringify(messages)).not.toContain("preState");
  });

  it("rejects turn mismatch without leaking preState/dbState in payload", async () => {
    const playerId = lockedSessionForTest.player1Id;
    const { ws, sent } = createWs(playerId);

    await handleMakeMove(ws as any, {
      move: { type: "move" } as any,
      expectedTurn: 4, // mismatch: dbTurn is 5
      idempotencyKey: "idem-2",
      correlationId: "client-ignored",
    });

    const messages = parseSent(sent);
    const rejected = messages.find((m) => m?.type === "move_rejected");
    expect(rejected).toBeTruthy();
    expect(rejected.payload?.reason).toBe("turn_mismatch");

    const serialized = JSON.stringify(rejected);
    expect(serialized).not.toContain("dbState");
    expect(serialized).not.toContain("preState");
  });
});
