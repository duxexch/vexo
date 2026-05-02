import type { Express, Response } from "express";
import { z } from "zod";
import { authMiddleware, type AuthRequest } from "./middleware";
import { adminAuthMiddleware, type AdminRequest, createHttpError, getErrorMessage, logAdminAction, resolveErrorStatus } from "../admin-routes/helpers";
import { getRealtimeProvider, getRealtimeProviderSelectionContext, getRealtimeProviderSnapshot, getProviderRoomFeatures, supportsFeature } from "../services/realtime";
import { getRealtimeMonitoringSnapshot, getRealtimeProviderConfig, setRealtimeMonitoringSnapshot, updateRealtimeProviderConfig } from "../storage/admin/realtime";
import type { RealtimeMode, RealtimeProviderConfig, RealtimeRoomCreateOptions } from "../../shared/realtime";

const updateRealtimeConfigSchema = z.object({
    mode: z.enum(["self", "external", "auto"]),
    external: z.object({
        providerType: z.enum(["agora", "100ms"]),
        apiKey: z.string().trim().max(256),
        apiSecret: z.string().trim().max(256),
        region: z.string().trim().min(1).max(64),
    }),
    features: z.object({
        textChat: z.boolean(),
        voiceCalls: z.boolean(),
        videoCalls: z.boolean(),
    }),
    performance: z.object({
        maxParticipantsPerRoom: z.number().int().min(2).max(100),
        bitratePreset: z.enum(["low", "balanced", "high", "ultra"]),
        turnUsageThreshold: z.number().min(0).max(100),
    }),
});

const createRoomSchema = z.object({
    hostUserId: z.string().trim().min(1),
    callType: z.enum(["voice", "video", "chat"]),
    maxParticipants: z.number().int().min(2).max(100),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const joinRoomSchema = z.object({
    roomId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
});

const leaveRoomSchema = joinRoomSchema;

const endRoomSchema = z.object({
    roomId: z.string().trim().min(1),
});

function toRealtimeConfigResponse(config: RealtimeProviderConfig) {
    return {
        config,
        providerLabels: {
            external: config.external.providerType,
        },
    };
}

function toProviderRecommendation(config: RealtimeProviderConfig) {
    return {
        selfHostedAllowed: supportsFeature(config, "voiceCalls") || supportsFeature(config, "textChat") || supportsFeature(config, "videoCalls"),
        supportedRooms: {
            chat: getProviderRoomFeatures("chat"),
            voice: getProviderRoomFeatures("voice"),
            video: getProviderRoomFeatures("video"),
        },
    };
}

export function registerRealtimeRoutes(app: Express): void {
    app.get("/api/realtime/provider", authMiddleware, async (_req: AuthRequest, res: Response) => {
        try {
            const snapshot = await getRealtimeProviderSnapshot();
            res.json({
                ...snapshot,
                recommendations: toProviderRecommendation(snapshot.config),
                config: toRealtimeConfigResponse(snapshot.config),
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/realtime", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const config = await getRealtimeProviderConfig();
            const monitoring = await getRealtimeMonitoringSnapshot();
            const selection = await getRealtimeProviderSelectionContext();
            res.json({
                config,
                monitoring,
                selection,
                providers: {
                    selfHosted: { available: true },
                    external: { available: true, type: config.external.providerType, region: config.external.region },
                },
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.put("/api/admin/realtime", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const parsed = updateRealtimeConfigSchema.parse(req.body);
            const updated = await updateRealtimeProviderConfig({
                mode: parsed.mode,
                external: parsed.external,
                features: parsed.features,
                performance: parsed.performance,
                updatedAt: new Date().toISOString(),
                updatedBy: req.admin?.id,
            }, req.admin?.id);

            await logAdminAction(req.admin!.id, "settings_update", "realtime", "provider-config", {
                newValue: JSON.stringify(updated),
            }, req);

            res.json(updated);
        } catch (error: unknown) {
            const status = error instanceof z.ZodError ? 400 : resolveErrorStatus(error);
            res.status(status).json({
                error: error instanceof z.ZodError ? error.flatten() : getErrorMessage(error),
            });
        }
    });

    app.post("/api/admin/realtime/monitoring", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const snapshot = {
                activeRooms: Number(req.body?.activeRooms ?? 0) || 0,
                activeUsers: Number(req.body?.activeUsers ?? 0) || 0,
                failedConnections: Number(req.body?.failedConnections ?? 0) || 0,
                turnBandwidthUsageMbps: Number(req.body?.turnBandwidthUsageMbps ?? 0) || 0,
                providerUsage: {
                    selfHosted: Number(req.body?.providerUsage?.selfHosted ?? 0) || 0,
                    external: Number(req.body?.providerUsage?.external ?? 0) || 0,
                    autoRouted: Number(req.body?.providerUsage?.autoRouted ?? 0) || 0,
                },
            };

            await setRealtimeMonitoringSnapshot(snapshot);

            await logAdminAction(req.admin!.id, "settings_update", "realtime", "monitoring-snapshot", {
                newValue: JSON.stringify(snapshot),
            }, req);

            res.json(snapshot);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/realtime/rooms", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const parsed = createRoomSchema.parse(req.body);
            const config = await getRealtimeProviderConfig();
            if (!supportsFeature(config, parsed.callType === "chat" ? "textChat" : parsed.callType === "voice" ? "voiceCalls" : "videoCalls")) {
                throw createHttpError(400, "Requested realtime feature is disabled");
            }

            const provider = getRealtimeProvider({
                mode: config.mode,
                turnLoadHigh: false,
            });

            const room = await provider.createRoom(parsed satisfies RealtimeRoomCreateOptions);
            res.json(room);
        } catch (error: unknown) {
            const status = error instanceof z.ZodError ? 400 : resolveErrorStatus(error);
            res.status(status).json({ error: error instanceof z.ZodError ? error.flatten() : getErrorMessage(error) });
        }
    });

    app.post("/api/realtime/rooms/:roomId/join", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const parsed = joinRoomSchema.parse({ roomId: req.params.roomId, ...req.body });
            const config = await getRealtimeProviderConfig();
            const provider = getRealtimeProvider({
                mode: config.mode,
                turnLoadHigh: false,
            });
            const result = await provider.joinRoom(parsed.roomId, parsed.userId);
            res.json(result);
        } catch (error: unknown) {
            const status = error instanceof z.ZodError ? 400 : resolveErrorStatus(error);
            res.status(status).json({ error: error instanceof z.ZodError ? error.flatten() : getErrorMessage(error) });
        }
    });

    app.post("/api/realtime/rooms/:roomId/leave", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const parsed = leaveRoomSchema.parse({ roomId: req.params.roomId, ...req.body });
            const config = await getRealtimeProviderConfig();
            const provider = getRealtimeProvider({
                mode: config.mode,
                turnLoadHigh: false,
            });
            await provider.leaveRoom(parsed.roomId, parsed.userId);
            res.json({ ok: true });
        } catch (error: unknown) {
            const status = error instanceof z.ZodError ? 400 : resolveErrorStatus(error);
            res.status(status).json({ error: error instanceof z.ZodError ? error.flatten() : getErrorMessage(error) });
        }
    });

    app.delete("/api/realtime/rooms/:roomId", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const parsed = endRoomSchema.parse({ roomId: req.params.roomId });
            const config = await getRealtimeProviderConfig();
            const provider = getRealtimeProvider({
                mode: config.mode,
                turnLoadHigh: false,
            });
            await provider.endRoom(parsed.roomId);
            res.json({ ok: true });
        } catch (error: unknown) {
            const status = error instanceof z.ZodError ? 400 : resolveErrorStatus(error);
            res.status(status).json({ error: error instanceof z.ZodError ? error.flatten() : getErrorMessage(error) });
        }
    });
}
