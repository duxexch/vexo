export type RealtimeMode = "self" | "external" | "auto";
export type RealtimeExternalProviderType = "agora" | "100ms";
export type RealtimeFeature = "textChat" | "voiceCalls" | "videoCalls";
export type RealtimeQualityPreset = "low" | "balanced" | "high" | "ultra";

export interface RealtimeProvider {
    createRoom(options: RealtimeRoomCreateOptions): Promise<{ roomId: string }>;
    joinRoom(roomId: string, userId: string): Promise<{ token: string }>;
    leaveRoom(roomId: string, userId: string): Promise<void>;
    endRoom(roomId: string): Promise<void>;
}

export interface RealtimeRoomCreateOptions {
    hostUserId: string;
    callType: "voice" | "video" | "chat";
    maxParticipants: number;
    metadata?: Record<string, unknown>;
}

export interface RealtimeProviderConfig {
    mode: RealtimeMode;
    external: {
        providerType: RealtimeExternalProviderType;
        apiKey: string;
        apiSecret: string;
        region: string;
    };
    features: Record<RealtimeFeature, boolean>;
    performance: {
        maxParticipantsPerRoom: number;
        bitratePreset: RealtimeQualityPreset;
        turnUsageThreshold: number;
    };
    updatedAt: string;
    updatedBy?: string | null;
}

export interface RealtimeMonitoringSnapshot {
    activeRooms: number;
    activeUsers: number;
    failedConnections: number;
    turnBandwidthUsageMbps: number;
    providerUsage: {
        selfHosted: number;
        external: number;
        autoRouted: number;
    };
}

export interface RealtimeProviderSelectionContext {
    mode: RealtimeMode;
    turnLoadHigh: boolean;
}

export const REALTIME_FEATURES: RealtimeFeature[] = ["textChat", "voiceCalls", "videoCalls"];
export const REALTIME_QUALITY_PRESETS: RealtimeQualityPreset[] = ["low", "balanced", "high", "ultra"];
export const REALTIME_EXTERNAL_PROVIDER_TYPES: RealtimeExternalProviderType[] = ["agora", "100ms"];
export const REALTIME_MODES: RealtimeMode[] = ["self", "external", "auto"];
