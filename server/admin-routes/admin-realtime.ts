import type { Express, Response } from "express";
import { getVoiceTelemetrySnapshot, resetVoiceTelemetryCounters } from "../websocket/voice";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "./helpers";

export function registerAdminRealtimeRoutes(app: Express) {
    app.get("/api/admin/realtime/voice-signaling", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const shouldReset = req.query.reset === "1" || req.query.reset === "true";
            const snapshot = getVoiceTelemetrySnapshot();

            if (shouldReset) {
                resetVoiceTelemetryCounters();
            }

            res.json({
                ok: true,
                resetApplied: shouldReset,
                telemetry: snapshot,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/realtime/voice-signaling/reset", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            resetVoiceTelemetryCounters();
            res.json({
                ok: true,
                resetApplied: true,
                telemetry: getVoiceTelemetrySnapshot(),
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
