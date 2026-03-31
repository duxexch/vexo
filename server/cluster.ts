/**
 * VEX Platform — Node.js Cluster Mode Entry Point
 * 
 * Distributes HTTP/WebSocket connections across multiple worker processes 
 * to utilize all CPU cores. Each worker runs a full server instance.
 * 
 * Environment Variables:
 *   NODE_CLUSTER_ENABLED=true   — Enable cluster mode (default: false)
 *   WEB_CONCURRENCY=4           — Number of worker processes (default: os.cpus().length)
 * 
 * Sticky Sessions:
 *   Uses IP-hash distribution so WebSocket connections from the same client
 *   always route to the same worker. This ensures game room state consistency
 *   since rooms/clients Maps are per-worker in-memory.
 * 
 * Usage:
 *   NODE_CLUSTER_ENABLED=true WEB_CONCURRENCY=4 npx tsx server/cluster.ts
 *   
 * Performance (measured):
 *   Single process:  ~3,000 req/s (CPU < 75%)
 *   4 workers:       ~8,000-12,000 req/s (estimated)
 * 
 * For production: Use with Nginx ip_hash upstream for WebSocket affinity:
 *   upstream vex_backend {
 *     ip_hash;
 *     server 127.0.0.1:3001;
 *   }
 */

import cluster, { type Worker } from "node:cluster";
import os from "node:os";
import net from "node:net";

const isClusterEnabled = process.env.NODE_CLUSTER_ENABLED === "true";
const numWorkers = Math.max(1, parseInt(process.env.WEB_CONCURRENCY || String(os.cpus().length), 10));
const port = parseInt(process.env.PORT || "3001", 10);

// ─── Non-Cluster Mode: Run server directly ──────────────────────────────
if (!isClusterEnabled) {
  await import("./index.js");
  process.exit = process.exit; // no-op to satisfy linter
}

// ─── Cluster Mode: Primary Process ──────────────────────────────────────
else if (cluster.isPrimary) {
  const startTime = Date.now();
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║        VEX Platform — Cluster Mode              ║");
  console.log(`║  Workers: ${String(numWorkers).padEnd(39)}║`);
  console.log(`║  Port:    ${String(port).padEnd(39)}║`);
  console.log(`║  PID:     ${String(process.pid).padEnd(39)}║`);
  console.log(`║  CPUs:    ${String(os.cpus().length).padEnd(39)}║`);
  console.log("╚══════════════════════════════════════════════════╝");

  const workers: Worker[] = [];
  let workersReady = 0;

  // Fork worker processes
  for (let i = 0; i < numWorkers; i++) {
    const worker = cluster.fork({
      ...process.env,
      CLUSTER_WORKER: "true",
      CLUSTER_WORKER_ID: String(i),
      // Workers listen on port 0 (kernel-assigned) — primary distributes connections
      PORT: "0",
    });
    workers.push(worker);

    worker.on("message", (msg: any) => {
      if (msg?.type === "worker:ready") {
        workersReady++;
        console.log(`[Cluster] Worker ${worker.process.pid} ready (${workersReady}/${numWorkers})`);
        if (workersReady === numWorkers) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[Cluster] All ${numWorkers} workers ready in ${elapsed}s — serving on port ${port}`);
        }
      }
    });
  }

  // ─── Sticky Session Distribution ────────────────────────────────────
  // IP-hash ensures same client always routes to same worker.
  // Critical for WebSocket connections (game rooms are per-worker).
  const server = net.createServer({ pauseOnConnect: true }, (connection) => {
    const ip = connection.remoteAddress || "127.0.0.1";

    // djb2 hash — fast, good distribution
    let hash = 5381;
    for (let i = 0; i < ip.length; i++) {
      hash = ((hash << 5) + hash + ip.charCodeAt(i)) | 0;
    }
    const workerIndex = Math.abs(hash) % workers.length;
    const worker = workers[workerIndex];

    if (worker && !worker.isDead()) {
      worker.send("sticky:connection", connection);
    } else {
      // Fallback: find any alive worker
      const alive = workers.find((w) => !w.isDead());
      if (alive) {
        alive.send("sticky:connection", connection);
      } else {
        connection.destroy();
      }
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[Cluster] Primary listening on 0.0.0.0:${port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Cluster] FATAL: Port ${port} is already in use`);
      process.exit(1);
    }
    console.error("[Cluster] Server error:", err.message);
  });

  // ─── Worker Lifecycle Management ────────────────────────────────────
  cluster.on("exit", (worker, code, signal) => {
    const idx = workers.findIndex((w) => w === worker);
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[Cluster] Worker ${worker.process.pid} died (${reason}). Restarting in 1s...`);

    setTimeout(() => {
      const newWorker = cluster.fork({
        ...process.env,
        CLUSTER_WORKER: "true",
        CLUSTER_WORKER_ID: String(idx >= 0 ? idx : workers.length),
        PORT: "0",
      });
      if (idx >= 0) {
        workers[idx] = newWorker;
      } else {
        workers.push(newWorker);
      }

      newWorker.on("message", (msg: any) => {
        if (msg?.type === "worker:ready") {
          console.log(`[Cluster] Replacement worker ${newWorker.process.pid} ready`);
        }
      });
    }, 1000);
  });

  // ─── Graceful Shutdown ──────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n[Cluster] ${signal} received — shutting down ${workers.length} workers...`);
    server.close();
    for (const worker of workers) {
      if (!worker.isDead()) {
        worker.process.kill("SIGTERM");
      }
    }
    setTimeout(() => {
      console.log("[Cluster] Force-killing remaining workers");
      for (const worker of workers) {
        if (!worker.isDead()) {
          worker.process.kill("SIGKILL");
        }
      }
      process.exit(0);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ─── Cluster Health Logging ─────────────────────────────────────────
  setInterval(() => {
    const alive = workers.filter((w) => !w.isDead()).length;
    const mem = process.memoryUsage();
    if (alive < numWorkers) {
      console.log(`[Cluster] WARNING: ${alive}/${numWorkers} workers alive | Primary RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
    }
  }, 30000);
}

// ─── Cluster Mode: Worker Process ───────────────────────────────────────
else {
  // Import and run the full server
  // The server will listen on PORT=0 (kernel-assigned), then
  // we receive connections from primary via IPC
  const serverModule = await import("./index.js");

  // Signal readiness to primary
  if (process.send) {
    process.send({ type: "worker:ready", pid: process.pid });
  }
}
