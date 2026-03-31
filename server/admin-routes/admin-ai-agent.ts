import type { Express, Response } from "express";
import { generateAdaptiveAiReport } from "../lib/adaptive-ai";
import {
    chatWithAiAgentAdmin,
    getAiAgentAdminReport,
    getAiAgentCapabilities,
    getAiAgentConnectionConfig,
    getAiAgentDataSummary,
    getAiAgentHealth,
    getAiAgentRuntimeStatus,
    queryAiAgentData,
    runAiAgentSelfTune,
    sendAiAgentLearningEvent,
    setAiAgentRuntimeStatus,
} from "../lib/ai-agent-client";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "./helpers";

export function registerAdminAiAgentRoutes(app: Express) {
    app.get("/api/admin/ai-agent/health", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const health = await getAiAgentHealth();
            res.json({
                connection: getAiAgentConnectionConfig(),
                healthy: health?.status === 'ok',
                health,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/ai-agent/report", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const [externalReport, localReport] = await Promise.all([
                getAiAgentAdminReport(),
                generateAdaptiveAiReport({}).catch(() => null),
            ]);

            res.json({
                source: externalReport ? 'ai-service' : 'local-fallback',
                connection: getAiAgentConnectionConfig(),
                generatedAt: externalReport?.generatedAt || new Date().toISOString(),
                external: externalReport,
                localFallback: localReport
                    ? {
                        reportId: localReport.reportId,
                        generatedAt: localReport.generatedAt,
                        summary: localReport.summary,
                        modelSnapshot: localReport.modelSnapshot,
                    }
                    : null,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/ai-agent/capabilities", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const external = await getAiAgentCapabilities();
            if (external?.capabilities) {
                return res.json({
                    source: 'ai-service',
                    generatedAt: external.generatedAt || new Date().toISOString(),
                    capabilities: external.capabilities,
                });
            }

            return res.json({
                source: 'local-fallback',
                generatedAt: new Date().toISOString(),
                capabilities: {
                    agentName: 'sam9',
                    privacyMode: 'strict',
                    autonomousLearning: {
                        enabled: true,
                        methods: ['adaptive-ai-local-model', 'difficulty-balancing', 'behavior-profiles'],
                    },
                    dataAnalyst: {
                        enabled: true,
                        supports: {
                            groupBy: ['gameType', 'user'],
                            metrics: ['moves', 'aggression', 'defensive', 'avgThinkMs'],
                        },
                    },
                },
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/ai-agent/runtime", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const [runtimeStatus, health] = await Promise.all([
                getAiAgentRuntimeStatus(),
                getAiAgentHealth(),
            ]);

            if (runtimeStatus?.runtime) {
                return res.json({
                    source: 'ai-service',
                    generatedAt: runtimeStatus.generatedAt || new Date().toISOString(),
                    runtime: runtimeStatus.runtime,
                    healthStatus: typeof health?.status === 'string' ? health.status : 'unknown',
                });
            }

            return res.json({
                source: 'local-fallback',
                generatedAt: new Date().toISOString(),
                runtime: {
                    enabled: false,
                    changedBy: 'local-fallback',
                    reason: 'AI service unavailable',
                },
                healthStatus: typeof health?.status === 'string' ? health.status : 'unreachable',
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/ai-agent/runtime", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
            const rawAction = typeof body.action === 'string' ? body.action.toLowerCase() : '';
            const enabled = typeof body.enabled === 'boolean'
                ? body.enabled
                : rawAction === 'start'
                    ? true
                    : rawAction === 'stop'
                        ? false
                        : undefined;

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ error: 'enabled(boolean) or action(start|stop) is required' });
            }

            const reason = typeof body.reason === 'string' ? body.reason.slice(0, 180) : '';
            const requestedBy = req.admin?.id ? `admin:${String(req.admin.id)}` : 'admin';

            const runtime = await setAiAgentRuntimeStatus({
                enabled,
                action: enabled ? 'start' : 'stop',
                reason,
                requestedBy,
            });

            if (!runtime?.runtime) {
                return res.status(503).json({ error: 'AI agent service is currently unavailable' });
            }

            return res.json({
                source: 'ai-service',
                generatedAt: runtime.generatedAt || new Date().toISOString(),
                runtime: runtime.runtime,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/ai-agent/data-summary", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const [externalSummary, localReport] = await Promise.all([
                getAiAgentDataSummary(),
                generateAdaptiveAiReport({}).catch(() => null),
            ]);

            if (externalSummary?.summary) {
                return res.json({
                    source: 'ai-service',
                    generatedAt: externalSummary.generatedAt || new Date().toISOString(),
                    summary: externalSummary.summary,
                    insights: externalSummary.insights || null,
                    decisionAverages: externalSummary.decisionAverages || null,
                });
            }

            return res.json({
                source: 'local-fallback',
                generatedAt: new Date().toISOString(),
                summary: localReport
                    ? {
                        totalProfiles: localReport.summary.totalProfiles,
                        totalTrackedMoves: localReport.summary.totalTrackedMoves,
                        gamesCoverage: localReport.summary.gamesCoverage,
                    }
                    : {
                        totalProfiles: 0,
                        totalTrackedMoves: 0,
                        gamesCoverage: {},
                    },
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/ai-agent/data-query", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const queryBody = req.body && typeof req.body === 'object' ? req.body : {};
            const externalQuery = await queryAiAgentData(queryBody as Record<string, unknown>);

            if (externalQuery?.data) {
                return res.json({
                    source: 'ai-service',
                    generatedAt: externalQuery.generatedAt || new Date().toISOString(),
                    query: externalQuery.query || null,
                    data: externalQuery.data,
                });
            }

            const fallbackReport = await generateAdaptiveAiReport({
                gameType: typeof queryBody.gameType === 'string' ? queryBody.gameType : undefined,
            });

            const rows = fallbackReport.players.map((item) => ({
                userId: item.userId,
                gameType: item.gameType,
                totalMoves: item.totalMoves,
                aggressionIndex: item.aggressionIndex,
                defensiveIndex: item.defensiveIndex,
                averageThinkMs: item.averageThinkMs,
                favoriteMoveType: item.favoriteMoveType,
            }));

            return res.json({
                source: 'local-fallback',
                generatedAt: new Date().toISOString(),
                data: {
                    columns: ['userId', 'gameType', 'totalMoves', 'aggressionIndex', 'defensiveIndex', 'averageThinkMs', 'favoriteMoveType'],
                    rows,
                },
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/ai-agent/self-tune", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const triggerBase = typeof req.body?.trigger === 'string' ? req.body.trigger : 'manual-admin';
            const trigger = `${triggerBase}`.slice(0, 64);
            const external = await runAiAgentSelfTune(trigger);

            if (!external?.success) {
                return res.status(503).json({ error: 'AI agent service is currently unavailable' });
            }

            return res.json({
                source: 'ai-service',
                generatedAt: external.generatedAt || new Date().toISOString(),
                tunedStrategies: external.tunedStrategies || 0,
                trigger: external.trigger || trigger,
                success: true,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/ai-agent/chat", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const rawMessage = req.body?.message;
            const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
            if (!message) {
                return res.status(400).json({ error: 'message is required' });
            }

            void sendAiAgentLearningEvent('project_snapshot', {
                source: 'admin_chat_prompt',
                adminId: req.admin?.id,
                promptMeta: {
                    length: message.length,
                    hasDigits: /\d/.test(message),
                    hasArabic: /[\u0600-\u06FF]/.test(message),
                    hasEmailLikePattern: /@/.test(message),
                },
                capturedAt: new Date().toISOString(),
            });

            const externalReply = await chatWithAiAgentAdmin(message);
            if (externalReply?.reply) {
                return res.json({
                    source: 'ai-service',
                    generatedAt: externalReply.generatedAt || new Date().toISOString(),
                    reply: externalReply.reply,
                    summary: externalReply.summary || null,
                });
            }

            const localReport = await generateAdaptiveAiReport({});
            const topGames = Object.entries(localReport.summary.gamesCoverage)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([gameType, count]) => `${gameType}:${count}`)
                .join(', ');

            return res.json({
                source: 'local-fallback',
                generatedAt: new Date().toISOString(),
                reply: topGames
                    ? `AI service unavailable, local adaptive report is active. Top tracked games: ${topGames}.`
                    : 'AI service unavailable, local adaptive report is active with no tracked games yet.',
                summary: {
                    totalProfiles: localReport.summary.totalProfiles,
                    totalTrackedMoves: localReport.summary.totalTrackedMoves,
                    gamesCoverage: localReport.summary.gamesCoverage,
                },
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/ai-agent/project-snapshot", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 2000) : undefined;
            const tags = Array.isArray(req.body?.tags)
                ? req.body.tags.map((tag: unknown) => String(tag).slice(0, 64)).slice(0, 20)
                : [];

            const accepted = await sendAiAgentLearningEvent('project_snapshot', {
                source: 'admin_snapshot',
                adminId: req.admin?.id,
                notes,
                tags,
                metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined,
                createdAt: new Date().toISOString(),
            });

            if (!accepted) {
                return res.status(503).json({ error: 'AI agent service is currently unavailable' });
            }

            res.json({ success: true });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}