import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketEventSimulationHarness } from "./utils/websocket-event-harness";

type DbRow = Record<string, unknown>;

const state: {
    matchRows: DbRow[];
    challengeRows: DbRow[];
    liveSessionRows: DbRow[];
    walletRows: DbRow[];
    configRows: DbRow[];
    rateLimitAllowed: boolean;
    sentMessages: Array<{ socketId: string; payload: unknown }>;
} = {
    matchRows: [],
    challengeRows: [],
    liveSessionRows: [],
    walletRows: [],
    configRows: [],
    rateLimitAllowed: true,
    sentMessages: [],
};

vi.mock("../server/lib/redis", () => ({
    redisRateLimit: async () => ({
        allowed: state.rateLimitAllowed,
        retryAfterMs: 1000,
    }),
}));

vi.mock("../server/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock("../server/db", async () => {
    const schema = await import("../shared/schema");

    const buildSelectChain = () => {
        let table: unknown = undefined;

        const chain = {
            from: (nextTable: unknown) => {
                table = nextTable;
                return chain;
            },
            where: () => chain,
            orderBy: () => chain,
            limit: async () => {
                if (table === schema.chatCallSessions) return [] as never;
                if (table === schema.gameMatches) return state.matchRows as never;
                if (table === schema.challenges) return state.challengeRows as never;
                if (table === schema.liveGameSessions) return state.liveSessionRows as never;
                if (table === schema.projectCurrencyWallets) return state.walletRows as never;
                if (table === schema.systemConfig) return state.configRows as never;
                return [] as never;
            },
            then: (resolve: (value: unknown) => void) => resolve([]),
        };

        return chain;
    };

    return {
        db: {
            select: () => buildSelectChain(),
            update: () => ({
                set: () => ({
                    where: async () => undefined,
                }),
            }),
        },
    };
});

import { handleVoice, resetVoiceTelemetryCounters, getVoiceTelemetrySnapshot } from "../server/websocket/voice";
import { voiceRooms } from "../server/websocket/shared";

function queueMatchRows(...rows: DbRow[]): void {
    state.matchRows.push(...rows);
}

function queueChallengeRows(...rows: DbRow[]): void {
    state.challengeRows.push(...rows);
}

function queueLiveSessionRows(...rows: DbRow[]): void {
    state.liveSessionRows.push(...rows);
}

function queueWalletRows(...rows: DbRow[]): void {
    state.walletRows.push(...rows);
}

function queueConfigRows(...rows: DbRow[]): void {
    state.configRows.push(...rows);
}

beforeEach(() => {
    state.matchRows = [];
    state.challengeRows = [];
    state.liveSessionRows = [];
    state.walletRows = [];
    state.configRows = [];
    state.rateLimitAllowed = true;
    state.sentMessages = [];
    voiceRooms.clear();
    resetVoiceTelemetryCounters();
});

describe("handleVoice runtime", () => {
    it("accepts a match participant join and exposes peer list state", async () => {
        const harness = new WebSocketEventSimulationHarness();
        const socket = harness.createClient("s1");
        socket.userId = "user-a";

        queueMatchRows({ id: "match-1", player1Id: "user-a", player2Id: "user-b" });

        await handleVoice(socket, { type: "voice_join", matchId: "match-1" });

        expect(harness.transcript.at(-1)?.clientId).toBe("s1");
        expect((harness.transcript.at(-1)?.payload as { type?: string })?.type).toBe("voice_joined");
        expect(socket.readyState).toBe(1);
    });

    it("forwards offer to the target peer after both users joined the same room", async () => {
        const harness = new WebSocketEventSimulationHarness();
        const socketA = harness.createClient("s1");
        const socketB = harness.createClient("s2");
        socketA.userId = "user-a";
        socketB.userId = "user-b";

        queueMatchRows({ id: "match-1", player1Id: "user-a", player2Id: "user-b" });
        queueMatchRows({ id: "match-1", player1Id: "user-a", player2Id: "user-b" });

        await handleVoice(socketA, { type: "voice_join", matchId: "match-1" });
        await handleVoice(socketB, { type: "voice_join", matchId: "match-1" });
        state.sentMessages = [];

        await handleVoice(socketA, {
            type: "voice_offer",
            matchId: "match-1",
            targetUserId: "user-b",
            offer: { type: "offer", sdp: "v=0\r\ns=test" },
        });

        expect(socketB.sent).toHaveLength(2);
        expect(socketB.sent.at(-1)?.clientId).toBe("s2");
        expect((socketB.sent.at(-1)?.payload as { type?: string }).type).toBe("voice_offer");
    });

    it("keeps challenge first-attempt join free but enforces pricing on the second attempt", async () => {
        const harness = new WebSocketEventSimulationHarness();
        const socket = harness.createClient("s1");
        socket.userId = "user-a";

        queueChallengeRows({ id: "challenge-1", player1Id: "user-a", player2Id: "user-b", player3Id: null, player4Id: null });

        await handleVoice(socket, { type: "voice_join", matchId: "challenge-1" });
        expect(getVoiceTelemetrySnapshot().counters.challengeFirstAttemptBypass).toBe(1);

        state.sentMessages = [];
        await handleVoice(socket, { type: "voice_leave", matchId: "challenge-1" });

        state.rateLimitAllowed = true;
        state.challengeRows = [];
        state.walletRows = [];
        queueChallengeRows({ id: "challenge-1", player1Id: "user-a", player2Id: "user-b", player3Id: null, player4Id: null });
        queueWalletRows({ totalBalance: "0" });

        await handleVoice(socket, { type: "voice_join", matchId: "challenge-1" });

        expect(socket.sent.some((m) => (m.payload as { type?: string }).type === "voice_error")).toBe(true);
    });

    it("rejects joins when rate limit blocks them", async () => {
        const harness = new WebSocketEventSimulationHarness();
        const socket = harness.createClient("s1");
        socket.userId = "user-a";

        state.rateLimitAllowed = false;
        queueMatchRows({ id: "match-1", player1Id: "user-a", player2Id: "user-b" });

        await handleVoice(socket, { type: "voice_join", matchId: "match-1" });

        const last = socket.sent.at(-1);
        expect(last?.payload).toMatchObject({ type: "voice_error" });
        expect((last?.payload as { error?: string }).error).toMatch(/rate limit/i);
    });

    it("replays multi-client event graphs deterministically with ordered delivery", async () => {
        const harness = new WebSocketEventSimulationHarness();
        const caller = harness.createClient("caller");
        const callee = harness.createClient("callee");

        harness.link("caller", "callee", (payload) => (payload as { kind?: string }).kind === "offer");
        harness.link("callee", "caller", (payload) => (payload as { kind?: string }).kind === "answer");

        caller.emitJson({ kind: "offer", sessionId: "s-1" });
        callee.emitJson({ kind: "answer", sessionId: "s-1" });

        await harness.replay();

        expect(harness.eventGraph.map((event) => event.type)).toEqual(["message", "message", "deliver", "deliver"]);
        expect(caller.sent).toEqual([
            { clientId: "caller", payload: { kind: "answer", sessionId: "s-1" } },
        ]);
        expect(callee.sent).toEqual([
            { clientId: "callee", payload: { kind: "offer", sessionId: "s-1" } },
        ]);
    });
});
