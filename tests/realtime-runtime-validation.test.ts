import { afterEach, describe, expect, it, vi } from "vitest";

import type { RealtimeMonitoringSnapshot, RealtimeProviderConfig } from "../shared/realtime";

const state: {
    config: RealtimeProviderConfig | null;
    monitoring: RealtimeMonitoringSnapshot | null;
    createRoomCalls: Array<{
        hostUserId: string;
        callType: "voice" | "video" | "chat";
        maxParticipants: number;
        metadata?: Record<string, unknown>;
    }>;
    joinRoomCalls: Array<{ roomId: string; userId: string }>;
    leaveRoomCalls: Array<{ roomId: string; userId: string }>;
    endRoomCalls: Array<{ roomId: string }>;
} = {
    config: null,
    monitoring: null,
    createRoomCalls: [],
    joinRoomCalls: [],
    leaveRoomCalls: [],
    endRoomCalls: [],
};

vi.mock("../server/storage/admin/realtime", () => ({
    getRealtimeProviderConfig: async () => state.config,
    getRealtimeMonitoringSnapshot: async () => state.monitoring,
    setRealtimeMonitoringSnapshot: async (_snapshot: unknown) => undefined,
    updateRealtimeProviderConfig: async (config: unknown) => config,
}));

vi.mock("../server/lib/turn-credentials", () => ({
    buildIceServers: (_scope: string) => ({
        iceServers: [{ urls: ["stun:example.org:3478"] }],
        ttlSeconds: 600,
        hasRelay: true,
    }),
}));

vi.mock("../server/services/realtime/providers", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../server/services/realtime/providers")>();
    const provider = {
        createRoom: async (options: any) => {
            state.createRoomCalls.push(options);
            return { roomId: "room_123" };
        },
        joinRoom: async (roomId: string, userId: string) => {
            state.joinRoomCalls.push({ roomId, userId });
            return { token: JSON.stringify({ roomId, userId, provider: "mock" }) };
        },
        leaveRoom: async (roomId: string, userId: string) => {
            state.leaveRoomCalls.push({ roomId, userId });
        },
        endRoom: async (roomId: string) => {
            state.endRoomCalls.push({ roomId });
        },
    };

    return {
        ...actual,
        getSelfHostedProvider: () => provider,
        getExternalProvider: () => provider,
    };
});

const makeConfig = (overrides: Partial<RealtimeProviderConfig> = {}): RealtimeProviderConfig =>
    ({
        mode: "auto",
        external: {
            providerType: "agora",
            apiKey: "",
            apiSecret: "",
            region: "us-east-1",
        },
        features: {
            textChat: true,
            voiceCalls: true,
            videoCalls: true,
        },
        performance: {
            maxParticipantsPerRoom: 8,
            bitratePreset: "balanced",
            turnUsageThreshold: 70,
        },
        updatedAt: "2026-04-26T12:00:00Z",
        updatedBy: null,
        ...overrides,
    }) as RealtimeProviderConfig;

const makeMonitoring = (
    overrides: Partial<RealtimeMonitoringSnapshot> = {},
): RealtimeMonitoringSnapshot =>
    ({
        activeRooms: 0,
        activeUsers: 0,
        failedConnections: 0,
        turnBandwidthUsageMbps: 0,
        providerUsage: {
            selfHosted: 0,
            external: 0,
            autoRouted: 0,
        },
        ...overrides,
    }) as RealtimeMonitoringSnapshot;

afterEach(() => {
    state.config = null;
    state.monitoring = null;
    state.createRoomCalls = [];
    state.joinRoomCalls = [];
    state.leaveRoomCalls = [];
    state.endRoomCalls = [];
    vi.resetModules();
});

describe("realtime runtime validation", () => {
    it("fails over to self-hosted when auto mode sees TURN pressure but external credentials are missing", async () => {
        state.config = makeConfig({
            mode: "auto",
            external: {
                providerType: "agora",
                apiKey: "",
                apiSecret: "",
                region: "us-east-1",
            },
        });
        state.monitoring = makeMonitoring({ turnBandwidthUsageMbps: 95 });

        const { getRealtimeOrchestrationContext, resolveRealtimeProvider } = await import("../server/services/realtime/orchestrator");

        const context = await getRealtimeOrchestrationContext();
        expect(context.turnLoadHigh).toBe(true);
        expect(context.externalConfigured).toBe(false);
        expect(context.selectedProvider).toBe("self");
        expect(context.sessionState).toBe("FAILOVER");
        expect(context.failoverReason).toBe("turn_pressure_without_external_credentials");

        const resolved = await resolveRealtimeProvider();
        expect(resolved.selection.selectedProvider).toBe("self");
        expect(resolved.selection.sessionState).toBe("FAILOVER");
    });

    it("routes to external provider when auto mode sees TURN pressure and credentials exist", async () => {
        state.config = makeConfig({
            mode: "auto",
            external: {
                providerType: "agora",
                apiKey: "key",
                apiSecret: "secret",
                region: "us-east-1",
            },
        });
        state.monitoring = makeMonitoring({ turnBandwidthUsageMbps: 85 });

        const { getRealtimeOrchestrationContext, resolveRealtimeProvider } = await import("../server/services/realtime/orchestrator");

        const context = await getRealtimeOrchestrationContext();
        expect(context.turnLoadHigh).toBe(true);
        expect(context.externalConfigured).toBe(true);
        expect(context.selectedProvider).toBe("external");
        expect(context.sessionState).toBe("DEGRADED");

        const resolved = await resolveRealtimeProvider();
        expect(resolved.selection.selectedProvider).toBe("external");
        expect(resolved.selection.sessionState).toBe("DEGRADED");
    });

    it("creates room payloads and tokens through the resolved provider contract", async () => {
        state.config = makeConfig({
            mode: "self",
            external: {
                providerType: "agora",
                apiKey: "",
                apiSecret: "",
                region: "us-east-1",
            },
        });
        state.monitoring = makeMonitoring();

        const { realtimeGovernance } = await import("../server/services/realtime");

        const selection = await realtimeGovernance.getRealtimeOrchestrationContext();
        expect(selection.selectedProvider).toBe("self");

        const { provider } = await realtimeGovernance.resolveRealtimeProvider();
        const room = await provider.createRoom({
            hostUserId: "user-1",
            callType: "voice",
            maxParticipants: 8,
            metadata: { stress: "baseline" },
        });

        expect(room.roomId).toBe("room_123");
        expect(state.createRoomCalls).toEqual([
            {
                hostUserId: "user-1",
                callType: "voice",
                maxParticipants: 8,
                metadata: { stress: "baseline" },
            },
        ]);

        const joined = await provider.joinRoom(room.roomId, "user-2");
        expect(JSON.parse(joined.token)).toMatchObject({
            roomId: "room_123",
            userId: "user-2",
            provider: "mock",
        });
        expect(state.joinRoomCalls).toEqual([{ roomId: "room_123", userId: "user-2" }]);
    });

    it("keeps feature gates aligned with the room feature map", async () => {
        state.config = makeConfig({
            features: {
                textChat: true,
                voiceCalls: true,
                videoCalls: false,
            },
        });
        state.monitoring = makeMonitoring();

        const { realtimeGovernance } = await import("../server/services/realtime");

        expect(realtimeGovernance.supportsFeature(state.config, "textChat")).toBe(true);
        expect(realtimeGovernance.supportsFeature(state.config, "videoCalls")).toBe(false);
        expect(realtimeGovernance.getProviderRoomFeatures("chat")).toEqual(["textChat"]);
        expect(realtimeGovernance.getProviderRoomFeatures("voice")).toEqual(["voiceCalls"]);
        expect(realtimeGovernance.getProviderRoomFeatures("video")).toEqual(["voiceCalls", "videoCalls"]);
    });
});
