import { db } from "../../db";
import { systemConfig, type SystemConfig as SystemConfigType } from "@shared/schema";
import { eq } from "drizzle-orm";
import type {
    RealtimeProviderConfig,
    RealtimeMonitoringSnapshot,
    RealtimeMode,
    RealtimeExternalProviderType,
    RealtimeQualityPreset,
    RealtimeFeature,
} from "@shared/realtime";

const REALTIME_CONFIG_KEY = "realtime_provider_config";

const DEFAULT_FEATURES: Record<RealtimeFeature, boolean> = {
    textChat: true,
    voiceCalls: true,
    videoCalls: true,
};

const DEFAULT_CONFIG: RealtimeProviderConfig = {
    mode: "auto",
    external: {
        providerType: "agora",
        apiKey: "",
        apiSecret: "",
        region: "us-east-1",
    },
    features: DEFAULT_FEATURES,
    performance: {
        maxParticipantsPerRoom: 8,
        bitratePreset: "balanced",
        turnUsageThreshold: 70,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: null,
};

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return null;
    }

    return null;
}

function normalizeMode(value: unknown): RealtimeMode {
    return value === "self" || value === "external" || value === "auto" ? value : "auto";
}

function normalizeProviderType(value: unknown): RealtimeExternalProviderType {
    return value === "100ms" ? "100ms" : "agora";
}

function normalizeBitratePreset(value: unknown): RealtimeQualityPreset {
    return value === "low" || value === "high" || value === "ultra" ? value : "balanced";
}

function normalizeFeatureMap(value: unknown): Record<RealtimeFeature, boolean> {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
        textChat: source.textChat !== false,
        voiceCalls: source.voiceCalls !== false,
        videoCalls: source.videoCalls !== false,
    };
}

function normalizeMonitoringSnapshot(value: string | null | undefined): RealtimeMonitoringSnapshot {
    const parsed = parseJsonObject(value);
    const providerUsageSource = parsed?.providerUsage && typeof parsed.providerUsage === "object" && !Array.isArray(parsed.providerUsage)
        ? parsed.providerUsage as Record<string, unknown>
        : {};

    return {
        activeRooms: Number(parsed?.activeRooms ?? 0) || 0,
        activeUsers: Number(parsed?.activeUsers ?? 0) || 0,
        failedConnections: Number(parsed?.failedConnections ?? 0) || 0,
        turnBandwidthUsageMbps: Number(parsed?.turnBandwidthUsageMbps ?? 0) || 0,
        providerUsage: {
            selfHosted: Number(providerUsageSource.selfHosted ?? 0) || 0,
            external: Number(providerUsageSource.external ?? 0) || 0,
            autoRouted: Number(providerUsageSource.autoRouted ?? 0) || 0,
        },
    };
}

function createRealtimeConfigFromRow(row: SystemConfigType | undefined): RealtimeProviderConfig {
    if (!row?.value) {
        return DEFAULT_CONFIG;
    }

    const parsed = parseJsonObject(row.value);
    if (!parsed) {
        return DEFAULT_CONFIG;
    }

    return {
        mode: normalizeMode(parsed.mode),
        external: {
            providerType: normalizeProviderType(parsed.external && typeof parsed.external === "object" && !Array.isArray(parsed.external) ? (parsed.external as Record<string, unknown>).providerType : undefined),
            apiKey: String(parsed.external && typeof parsed.external === "object" && !Array.isArray(parsed.external) ? (parsed.external as Record<string, unknown>).apiKey ?? "" : ""),
            apiSecret: String(parsed.external && typeof parsed.external === "object" && !Array.isArray(parsed.external) ? (parsed.external as Record<string, unknown>).apiSecret ?? "" : ""),
            region: String(parsed.external && typeof parsed.external === "object" && !Array.isArray(parsed.external) ? (parsed.external as Record<string, unknown>).region ?? "us-east-1" : "us-east-1"),
        },
        features: normalizeFeatureMap(parsed.features),
        performance: {
            maxParticipantsPerRoom: Math.max(2, Number(parsed.performance && typeof parsed.performance === "object" && !Array.isArray(parsed.performance) ? (parsed.performance as Record<string, unknown>).maxParticipantsPerRoom : 8) || 8),
            bitratePreset: normalizeBitratePreset(parsed.performance && typeof parsed.performance === "object" && !Array.isArray(parsed.performance) ? (parsed.performance as Record<string, unknown>).bitratePreset : undefined),
            turnUsageThreshold: Math.min(100, Math.max(0, Number(parsed.performance && typeof parsed.performance === "object" && !Array.isArray(parsed.performance) ? (parsed.performance as Record<string, unknown>).turnUsageThreshold : 70) || 70)),
        },
        updatedAt: row.updatedAt?.toISOString?.() || new Date().toISOString(),
        updatedBy: row.updatedBy || null,
    };
}

export async function getRealtimeProviderConfig(): Promise<RealtimeProviderConfig> {
    const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, REALTIME_CONFIG_KEY)).limit(1);
    return createRealtimeConfigFromRow(row);
}

export async function updateRealtimeProviderConfig(
    config: RealtimeProviderConfig,
    updatedBy?: string,
): Promise<RealtimeProviderConfig> {
    const payload: RealtimeProviderConfig = {
        mode: config.mode,
        external: {
            providerType: config.external.providerType,
            apiKey: config.external.apiKey,
            apiSecret: config.external.apiSecret,
            region: config.external.region,
        },
        features: config.features,
        performance: config.performance,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy || null,
    };

    const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, REALTIME_CONFIG_KEY)).limit(1);
    const serialized = JSON.stringify(payload);

    if (existing.length > 0) {
        await db.update(systemConfig)
            .set({
                value: serialized,
                version: existing[0].version + 1,
                updatedAt: new Date(),
                updatedBy: updatedBy || null,
            })
            .where(eq(systemConfig.key, REALTIME_CONFIG_KEY));
    } else {
        await db.insert(systemConfig).values({
            key: REALTIME_CONFIG_KEY,
            value: serialized,
            version: 1,
            updatedBy: updatedBy || null,
        });
    }

    return payload;
}

export async function getRealtimeMonitoringSnapshot(): Promise<RealtimeMonitoringSnapshot> {
    const [snapshotRow] = await db.select().from(systemConfig).where(eq(systemConfig.key, `${REALTIME_CONFIG_KEY}:monitoring`)).limit(1);
    return normalizeMonitoringSnapshot(snapshotRow?.value);
}

export async function setRealtimeMonitoringSnapshot(snapshot: RealtimeMonitoringSnapshot): Promise<void> {
    const payload = JSON.stringify(snapshot);
    const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, `${REALTIME_CONFIG_KEY}:monitoring`)).limit(1);

    if (existing.length > 0) {
        await db.update(systemConfig)
            .set({ value: payload, version: existing[0].version + 1, updatedAt: new Date() })
            .where(eq(systemConfig.key, `${REALTIME_CONFIG_KEY}:monitoring`));
        return;
    }

    await db.insert(systemConfig).values({
        key: `${REALTIME_CONFIG_KEY}:monitoring`,
        value: payload,
        version: 1,
    });
}
