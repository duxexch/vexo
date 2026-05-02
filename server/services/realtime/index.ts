import crypto from "crypto";
import type {
    RealtimeExternalProviderType,
    RealtimeFeature,
    RealtimeMode,
    RealtimeMonitoringSnapshot,
    RealtimeProvider,
    RealtimeProviderConfig,
    RealtimeProviderSelectionContext,
    RealtimeQualityPreset,
    RealtimeRoomCreateOptions,
} from "@shared/realtime";
import { getRealtimeMonitoringSnapshot, getRealtimeProviderConfig } from "../../storage/admin/realtime";
import { buildIceServers } from "../../lib/turn-credentials";

type ProviderRoomState = {
    roomId: string;
    hostUserId: string;
    callType: RealtimeRoomCreateOptions["callType"];
    maxParticipants: number;
    createdAt: string;
    metadata?: Record<string, unknown>;
};

const roomRegistry = new Map<string, ProviderRoomState>();

const FEATURE_TO_ROOM_TYPE: Record<RealtimeRoomCreateOptions["callType"], RealtimeFeature[]> = {
    chat: ["textChat"],
    voice: ["voiceCalls"],
    video: ["voiceCalls", "videoCalls"],
};

function createRoomId(prefix: string): string {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    return `${prefix}_${id}`;
}

function createTokenPayload(roomId: string, userId: string, provider: string): string {
    const payload = {
        roomId,
        userId,
        provider,
        ts: Date.now(),
    };
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

class SelfHostedProvider implements RealtimeProvider {
    async createRoom(options: RealtimeRoomCreateOptions): Promise<{ roomId: string }> {
        const roomId = createRoomId("self");
        roomRegistry.set(roomId, {
            roomId,
            hostUserId: options.hostUserId,
            callType: options.callType,
            maxParticipants: options.maxParticipants,
            metadata: options.metadata,
            createdAt: new Date().toISOString(),
        });
        return { roomId };
    }

    async joinRoom(roomId: string, userId: string): Promise<{ token: string }> {
        const room = roomRegistry.get(roomId);
        const ice = buildIceServers(userId);
        const token = createTokenPayload(roomId, userId, "self");
        return {
            token: JSON.stringify({
                token,
                roomId,
                userId,
                provider: "self",
                iceServers: ice.iceServers,
                ttlSeconds: ice.ttlSeconds,
                hasRelay: ice.hasRelay,
                room: room ? {
                    hostUserId: room.hostUserId,
                    callType: room.callType,
                    maxParticipants: room.maxParticipants,
                } : null,
            }),
        };
    }

    async leaveRoom(roomId: string, userId: string): Promise<void> {
        void roomId;
        void userId;
    }

    async endRoom(roomId: string): Promise<void> {
        roomRegistry.delete(roomId);
    }
}

class ExternalProvider implements RealtimeProvider {
    async createRoom(options: RealtimeRoomCreateOptions): Promise<{ roomId: string }> {
        const roomId = createRoomId("ext");
        roomRegistry.set(roomId, {
            roomId,
            hostUserId: options.hostUserId,
            callType: options.callType,
            maxParticipants: options.maxParticipants,
            metadata: options.metadata,
            createdAt: new Date().toISOString(),
        });
        return { roomId };
    }

    async joinRoom(roomId: string, userId: string): Promise<{ token: string }> {
        const room = roomRegistry.get(roomId);
        const token = createTokenPayload(roomId, userId, "external");
        return {
            token: JSON.stringify({
                token,
                roomId,
                userId,
                provider: "external",
                providerRoomId: roomId,
                providerName: "agora",
                room: room ? {
                    hostUserId: room.hostUserId,
                    callType: room.callType,
                    maxParticipants: room.maxParticipants,
                } : null,
            }),
        };
    }

    async leaveRoom(roomId: string, userId: string): Promise<void> {
        void roomId;
        void userId;
    }

    async endRoom(roomId: string): Promise<void> {
        roomRegistry.delete(roomId);
    }
}

export const selfHostedProvider = new SelfHostedProvider();
export const externalProvider = new ExternalProvider();

export function getRealtimeProvider(context: RealtimeProviderSelectionContext): RealtimeProvider {
    if (context.mode === "external") return externalProvider;
    if (context.mode === "self") return selfHostedProvider;
    if (context.turnLoadHigh) return externalProvider;
    return selfHostedProvider;
}

export async function getRealtimeProviderSelectionContext(): Promise<RealtimeProviderSelectionContext> {
    const config = await getRealtimeProviderConfig();
    const monitoring = await getRealtimeMonitoringSnapshot();
    return {
        mode: config.mode,
        turnLoadHigh: monitoring.turnBandwidthUsageMbps >= config.performance.turnUsageThreshold,
    };
}

export async function getRealtimeProviderSnapshot(): Promise<{
    config: RealtimeProviderConfig;
    monitoring: RealtimeMonitoringSnapshot;
    selectedProvider: "self" | "external";
}> {
    const config = await getRealtimeProviderConfig();
    const monitoring = await getRealtimeMonitoringSnapshot();
    const selection = getRealtimeProvider({
        mode: config.mode,
        turnLoadHigh: monitoring.turnBandwidthUsageMbps >= config.performance.turnUsageThreshold,
    });

    return {
        config,
        monitoring,
        selectedProvider: selection === externalProvider ? "external" : "self",
    };
}

export function supportsFeature(config: RealtimeProviderConfig, feature: RealtimeFeature): boolean {
    return config.features[feature] !== false;
}

export function getProviderTypeLabel(providerType: RealtimeExternalProviderType): string {
    return providerType === "100ms" ? "100ms" : "Agora";
}

export function getQualityPresetLabel(preset: RealtimeQualityPreset): string {
    return preset.charAt(0).toUpperCase() + preset.slice(1);
}

export function getProviderRoomFeatures(callType: RealtimeRoomCreateOptions["callType"]): RealtimeFeature[] {
    return FEATURE_TO_ROOM_TYPE[callType];
}
