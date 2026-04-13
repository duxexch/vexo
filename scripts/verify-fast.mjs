import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_ENV = {
    DATABASE_URL: "postgresql://vex_user:VexLocal2026SecurePass!@localhost:5432/vex_db",
    DB_SSL: "false",
    SESSION_SECRET: "vex-local-dev-session-secret-key-2026-very-secure",
    JWT_SIGNING_KEY: "vex-local-dev-jwt-signing-key-2026-for-user-auth-tokens",
    ADMIN_JWT_SECRET: "vex-local-dev-admin-jwt-secret-2026-different-from-user",
    NODE_ENV: "development",
};

const VERIFY_PORT = String(process.env.FAST_VERIFY_PORT || "3011");
const SERVER_URL = `http://127.0.0.1:${VERIFY_PORT}/`;
const BOOT_TIMEOUT_MS = Number(process.env.FAST_VERIFY_BOOT_TIMEOUT_MS || 25000);
const POLL_INTERVAL_MS = 500;

function npxBin() {
    return process.platform === "win32" ? "npx.cmd" : "npx";
}

function withTimeout(ms, message) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(message), ms);
    return { controller, clear: () => clearTimeout(timeout) };
}

function runTscIncremental() {
    return new Promise((resolve, reject) => {
        const child = spawn(`${npxBin()} tsc --noEmit --incremental --tsBuildInfoFile .cache/tsc-fast.tsbuildinfo`, [], {
            stdio: "inherit",
            shell: true,
            env: process.env,
        });

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`TypeScript check failed with exit code ${code}`));
        });
    });
}

function spawnServer() {
    const child = spawn(`${npxBin()} tsx server/index.ts`, [], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        env: {
            ...process.env,
            ...DEFAULT_ENV,
            PORT: VERIFY_PORT,
        },
    });

    const output = [];
    const pushLine = (line) => {
        output.push(line);
        if (output.length > 80) {
            output.shift();
        }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        process.stdout.write(text);
        text.split(/\r?\n/).filter(Boolean).forEach(pushLine);
    });
    child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        process.stderr.write(text);
        text.split(/\r?\n/).filter(Boolean).forEach(pushLine);
    });

    return { child, output };
}

async function waitForHealthOrExit(server) {
    const startAt = Date.now();

    while (Date.now() - startAt < BOOT_TIMEOUT_MS) {
        if (server.child.exitCode !== null) {
            throw new Error(`Server exited early with code ${server.child.exitCode}`);
        }

        try {
            const timeout = withTimeout(2000, "health-timeout");
            const response = await fetch(SERVER_URL, { signal: timeout.controller.signal });
            timeout.clear();
            if (response.status === 200) {
                return;
            }
        } catch {
            // Keep polling while server boots.
        }

        await delay(POLL_INTERVAL_MS);
    }

    throw new Error(`Server did not become healthy on ${SERVER_URL} within ${BOOT_TIMEOUT_MS}ms`);
}

async function stopServer(server) {
    if (server.child.exitCode !== null) {
        return;
    }

    if (process.platform === "win32" && server.child.pid) {
        await new Promise((resolve) => {
            const killer = spawn("taskkill", ["/PID", String(server.child.pid), "/T", "/F"], {
                stdio: "ignore",
                shell: false,
            });
            killer.on("exit", () => resolve());
            killer.on("error", () => resolve());
        });
        return;
    }

    server.child.kill("SIGTERM");
    const waitStart = Date.now();
    while (server.child.exitCode === null && Date.now() - waitStart < 4000) {
        await delay(100);
    }

    if (server.child.exitCode === null) {
        server.child.kill("SIGKILL");
    }
}

function printSummary(ok, durationMs) {
    const seconds = (durationMs / 1000).toFixed(1);
    if (ok) {
        console.log(`\n[verify:fast] Success in ${seconds}s`);
    } else {
        console.log(`\n[verify:fast] Failed after ${seconds}s`);
    }
}

async function main() {
    const startedAt = Date.now();
    const server = spawnServer();

    try {
        await Promise.all([
            runTscIncremental(),
            waitForHealthOrExit(server),
        ]);
        await stopServer(server);
        printSummary(true, Date.now() - startedAt);
    } catch (error) {
        await stopServer(server);
        printSummary(false, Date.now() - startedAt);

        if (server.output.length > 0) {
            console.error("\n[verify:fast] Last server logs:");
            for (const line of server.output.slice(-25)) {
                console.error(line);
            }
        }

        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n[verify:fast] ${message}`);
        process.exitCode = 1;
    }
}

main();
