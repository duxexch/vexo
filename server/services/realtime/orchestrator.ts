import type {
    RealtimeFeature,
    RealtimeMode,
    RealtimeMonitoringSnapshot,
    RealtimeProvider,
    RealtimeProviderConfig,
    RealtimeProviderSelectionContext,
    RealtimeRoomCreateOptions,
} from "../../../shared/realtime";
import { getExternalProvider, getSelfHostedProvider } from "./providers";
import { buildIceServers } from "../../lib/turn-credentials";
import {
    getRealtimeMonitoringSnapshot,
    getRealtimeProviderConfig,
} from "../../storage/admin/realtime";

export type RealtimeSessionState =
    | "CONNECTING"
    | "ACTIVE"
    | "DEGRADED"
    | "FAILOVER"
    | "CLOSED";

export interface RealtimeOrchestrationContext extends RealtimeProviderSelectionContext {
    config: RealtimeProviderConfig;
    monitoring: RealtimeMonitoringSnapshot;
    externalConfigured: boolean;
    selectedProvider: "self" | "external";
    failoverReason?: string;
    sessionState: RealtimeSessionState;
}

export interface RealtimeCapabilitySnapshot {
    selectedProvider: "self" | "external";
    availableProviders: {
        self: boolean;
        external: boolean;
    };
    ready: boolean;
    externalConfigured: boolean;
    selection: RealtimeOrchestrationContext;
    ice: ReturnType<typeof buildIceServers>;
    supportedFeatures: Record<RealtimeFeature, boolean>;
    roomFeatures: {
        chat: RealtimeFeature[];
        voice: RealtimeFeature[];
        video: RealtimeFeature[];
    };
    sessionState: RealtimeSessionState;
}

function hasExternalProviderCredentials(config: RealtimeProviderConfig): boolean {
    return (
        config.external.apiKey.trim().length > 0
        && config.external.apiSecret.trim().length > 0
        && config.external.region.trim().length > 0
    );
}

function isFeatureEnabled(config: RealtimeProviderConfig, feature: RealtimeFeature): boolean {
    return config.features[feature] !== false;
}

function isTurnLoadHigh(config: RealtimeProviderConfig, monitoring: RealtimeMonitoringSnapshot): boolean {
    return monitoring.turnBandwidthUsageMbps >= config.performance.turnUsageThreshold;
}

function determineProvider(config: RealtimeProviderConfig, monitoring: RealtimeMonitoringSnapshot): {
    provider: RealtimeProvider;
    selectedProvider: "self" | "external";
    failoverReason?: string;
    sessionState: RealtimeSessionState;
} {
    const externalConfigured = hasExternalProviderCredentials(config);
    const turnLoadHigh = isTurnLoadHigh(config, monitoring);

    const selfHostedProvider = getSelfHostedProvider();
    const externalProvider = getExternalProvider();

    if (config.mode === "self") {
        return { provider: selfHostedProvider, selectedProvider: "self", sessionState: "ACTIVE" };
    }

    if (config.mode === "external") {
        if (externalConfigured) {
            return { provider: externalProvider, selectedProvider: "external", sessionState: "ACTIVE" };
        }
        return {
            provider: selfHostedProvider,
            selectedProvider: "self",
            failoverReason: "external_credentials_missing",
            sessionState: "FAILOVER",
        };
    }

    if (turnLoadHigh && externalConfigured) {
        return {
            provider: externalProvider,
            selectedProvider: "external",
            sessionState: "DEGRADED",
        };
    }

    if (turnLoadHigh && !externalConfigured) {
        return {
            provider: selfHostedProvider,
            selectedProvider: "self",
            failoverReason: "turn_pressure_without_external_credentials",
            sessionState: "FAILOVER",
        };
    }

    return { provider: selfHostedProvider, selectedProvider: "self", sessionState: "ACTIVE" };
}

export async function getRealtimeOrchestrationContext(): Promise<RealtimeOrchestrationContext> {
    const config = await getRealtimeProviderConfig();
    const monitoring = await getRealtimeMonitoringSnapshot();
    const externalConfigured = hasExternalProviderCredentials(config);
    const turnLoadHigh = isTurnLoadHigh(config, monitoring);
    const selection = determineProvider(config, monitoring);

    return {
        mode: config.mode,
        turnLoadHigh,
        config,
        monitoring,
        externalConfigured,
        selectedProvider: selection.selectedProvider,
        failoverReason: selection.failoverReason,
        sessionState: selection.sessionState,
    };
}

export async function getRealtimeProviderSnapshot(): Promise<RealtimeCapabilitySnapshot> {
    const selection = await getRealtimeOrchestrationContext();
    const ice = buildIceServers("realtime");
    return {
        selectedProvider: selection.selectedProvider,
        availableProviders: {
            self: true,
            external: selection.externalConfigured,
        },
        ready: selection.selectedProvider === "self" || selection.externalConfigured,
        externalConfigured: selection.externalConfigured,
        selection,
        ice,
        supportedFeatures: {
            textChat: isFeatureEnabled(selection.config, "textChat"),
            voiceCalls: isFeatureEnabled(selection.config, "voiceCalls"),
            videoCalls: isFeatureEnabled(selection.config, "videoCalls"),
        },
        roomFeatures: {
            chat: ["textChat"],
            voice: ["voiceCalls"],
            video: ["voiceCalls", "videoCalls"],
        },
        sessionState: selection.sessionState,
    };
}

export function supportsFeature(config: RealtimeProviderConfig, feature: RealtimeFeature): boolean {
    return isFeatureEnabled(config, feature);
}

export function getProviderRoomFeatures(callType: RealtimeRoomCreateOptions["callType"]): RealtimeFeature[] {
    if (callType === "chat") return ["textChat"];
    if (callType === "voice") return ["voiceCalls"];
    return ["voiceCalls", "videoCalls"];
}

export async function resolveRealtimeProvider(): Promise<{
    provider: RealtimeProvider;
    selection: RealtimeOrchestrationContext;
}> {
    const selection = await getRealtimeOrchestrationContext();
    const resolved = determineProvider(selection.config, selection.monitoring);
    return {
        provider: resolved.provider,
        selection: {
            ...selection,
            selectedProvider: resolved.selectedProvider,
            failoverReason: resolved.failoverReason,
            sessionState: resolved.sessionState,
        },
    };
}
