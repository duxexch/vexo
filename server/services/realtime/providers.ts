import crypto from "crypto";
import type {
    RealtimeExternalProviderType,
    RealtimeFeature,
    RealtimeMonitoringSnapshot,
    RealtimeProvider,
    RealtimeProviderConfig,
    RealtimeProviderSelectionContext,
    RealtimeQualityPreset,
    RealtimeRoomCreateOptions,
} from "../../../shared/realtime";
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

function hasExternalProviderCredentials(): boolean {
    const config = {
        apiKey: process.env.REALTIME_EXTERNAL_API_KEY || "",
        apiSecret: process.env.REALTIME_EXTERNAL_API_SECRET || "",
        region: process.env.REALTIME_EXTERNAL_REGION || "",
    };
    return config.apiKey.trim().length > 0 && config.apiSecret.trim().length > 0 && config.region.trim().length > 0;
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
        if (!hasExternalProviderCredentials()) {
            throw new Error("External realtime provider is not configured");
        }

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
        if (!hasExternalProviderCredentials()) {
            throw new Error("External realtime provider is not configured");
        }

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
                configured: true,
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

export function supportsFeature(config: RealtimeProviderConfig, feature: RealtimeFeature): boolean {
    return config.features[feature] !== false;
}

export function getProviderRoomFeatures(callType: RealtimeRoomCreateOptions["callType"]): RealtimeFeature[] {
    return FEATURE_TO_ROOM_TYPE[callType];
}

export function getProviderTypeLabel(providerType: RealtimeExternalProviderType): string {
    return providerType === "100ms" ? "100ms" : "Agora";
}

export function getQualityPresetLabel(preset: RealtimeQualityPreset): string {
    return preset.charAt(0).toUpperCase() + preset.slice(1);
}

export function getRealtimeProviderSelectionContext(): RealtimeProviderSelectionContext {
    return {
        mode: "auto",
        turnLoadHigh: false,
    };
}

export function getRealtimeProviderSnapshot(): {
    config: RealtimeProviderConfig;
    monitoring: RealtimeMonitoringSnapshot;
    selectedProvider: "self" | "external";
    externalConfigured: boolean;
} {
    const externalConfigured = hasExternalProviderCredentials();
    return {
        config: {
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
            updatedAt: new Date().toISOString(),
            updatedBy: null,
        },
        monitoring: {
            activeRooms: 0,
            activeUsers: 0,
            failedConnections: 0,
            turnBandwidthUsageMbps: 0,
            providerUsage: {
                selfHosted: 0,
                external: 0,
                autoRouted: 0,
            },
        },
        selectedProvider: "self",
        externalConfigured,
    };
}

export function getSelfHostedProvider(): RealtimeProvider {
    return selfHostedProvider;
}

export function getExternalProvider(): RealtimeProvider {
    return externalProvider;
}
