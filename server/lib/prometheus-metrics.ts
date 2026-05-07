import client from "prom-client";
import type { Request, Response, NextFunction } from "express";

export const registry = new client.Registry();

// Default Node.js/process metrics into our registry.
client.collectDefaultMetrics({ register: registry });

// -----------------------
// WS instrumentation
// -----------------------
export const wsEventLagMs = new client.Histogram({
    name: "ws_event_lag_ms",
    help: "WS event processing latency in ms (server-side, server clock)",
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
    registers: [registry],
});

export const wsReconnectTotal = new client.Counter({
    name: "ws_reconnect_total",
    help: "Total WS reconnects (within reconnect grace window)",
    registers: [registry],
});

export const wsMoveRateLimitedTotal = new client.Counter({
    name: "ws_move_rate_limited_total",
    help: "Total WS make_move requests rejected due to rate limiting",
    labelNames: ["scope"],
    registers: [registry],
});

export const gameLevel1AnomalyTotal = new client.Counter({
    name: "game_level1_anomaly_total",
    help: "Total Game WS Level-1 anomaly detections (and blocks) recorded",
    labelNames: ["anomalyType", "result"],
    registers: [registry],
});

export const wsMoveTurnMismatchRejectedTotal = new client.Counter({
    name: "ws_move_turn_mismatch_rejected_total",
    help: "Total websocket move rejections due to turn/order mismatch and related stale move scenarios",
    labelNames: ["reason"],
    registers: [registry],
});

// -----------------------
// Express /metrics handler
// -----------------------
export function metricsHandler(_req: Request, res: Response, _next: NextFunction): void {
    res.setHeader("Content-Type", registry.contentType);

    registry
        .metrics()
        .then((metrics: string) => res.status(200).send(metrics))
        .catch((err: unknown) => {
            // Fail closed: metrics must never break app.
            // eslint-disable-next-line no-console
            console.error("[metrics] failed to render metrics", err);
            res.status(500).send("");
        });
}
