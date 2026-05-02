import {
    getProviderRoomFeatures,
    getProviderTypeLabel,
    getQualityPresetLabel,
    supportsFeature,
} from "./providers";
import {
    getRealtimeOrchestrationContext,
    getRealtimeProviderSnapshot,
    resolveRealtimeProvider,
    type RealtimeCapabilitySnapshot,
    type RealtimeOrchestrationContext,
    type RealtimeSessionState,
} from "./orchestrator";

export const realtimeGovernance = Object.freeze({
    getProviderRoomFeatures,
    getProviderTypeLabel,
    getQualityPresetLabel,
    getRealtimeOrchestrationContext,
    getRealtimeProviderSnapshot,
    resolveRealtimeProvider,
    supportsFeature,
});

export type {
    RealtimeCapabilitySnapshot,
    RealtimeOrchestrationContext,
    RealtimeSessionState,
};
