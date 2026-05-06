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
