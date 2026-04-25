#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";

const VALID_SCOPES = new Set(["general", "challenge", "auth", "finance"]);

function parseScopes() {
    const arg = process.argv.find((entry) => entry.startsWith("--scope="));
    const raw = arg ? arg.split("=")[1] : "general";
    const scopes = raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    if (scopes.length === 0) {
        return ["general"];
    }

    const invalid = scopes.filter((scope) => !VALID_SCOPES.has(scope));
    if (invalid.length > 0) {
        throw new Error(
            `Invalid scope(s): ${invalid.join(", ")}. Valid values: ${Array.from(VALID_SCOPES).join(", ")}`,
        );
    }

    return Array.from(new Set(scopes));
}

function runCommand(label, command, args = []) {
    return new Promise((resolve, reject) => {
        console.log(`\n[gate] ${label}`);
        console.log(`[gate] > ${command} ${args.join(" ")}`);

        const fullCommand = `${command}${args.length > 0 ? ` ${args.join(" ")}` : ""}`;

        const child = spawn(fullCommand, {
            stdio: "inherit",
            shell: true,
            env: process.env,
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Step failed: ${label} (exit ${code ?? "unknown"})`));
            }
        });

        child.on("error", (error) => {
            reject(new Error(`Step failed: ${label} (${error.message})`));
        });
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommandWithRetry(label, command, args = [], retries = 0, retryDelayMs = 1000) {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            await runCommand(label, command, args);
            return;
        } catch (error) {
            if (attempt >= retries) {
                throw error;
            }
            const nextAttempt = attempt + 2;
            console.warn(`[gate] ${label} failed on attempt ${attempt + 1}; retrying (${nextAttempt}/${retries + 1})...`);
            await wait(retryDelayMs);
        }
        attempt += 1;
    }
}

function checkPortOpen(host, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };

        socket.setTimeout(timeoutMs);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        socket.once("error", () => finish(false));
        socket.connect(port, host);
    });
}

async function assertHealth(url) {
    console.log(`\n[gate] Health check: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
    }
    console.log(`[gate] Health check passed (${response.status})`);
}

async function assertDbReady() {
    console.log("\n[gate] DB precheck: localhost:5432");
    const reachable = await checkPortOpen("127.0.0.1", 5432, 2000);
    if (!reachable) {
        throw new Error("PostgreSQL is not reachable on localhost:5432. Start DB/container before challenge/finance gates.");
    }
    console.log("[gate] DB precheck passed");
}

async function run() {
    const scopes = parseScopes();
    const needChallenge = scopes.includes("challenge");
    const needAuth = scopes.includes("auth");
    const needFinance = scopes.includes("finance");

    console.log(`[gate] Running team gate with scopes: ${scopes.join(", ")}`);

    // Gate-1: baseline compile + health + foundational websocket smoke
    await runCommand("TypeScript", "npm", ["run", "check:types"]);
    await assertHealth("http://localhost:3001/");
    await runCommandWithRetry(
        "WebSocket heartbeat smoke",
        "npm",
        ["run", "security:smoke:ws-heartbeat"],
        1,
        1000,
    );

    // Gate-2: scoped checks
    if (needAuth) {
        await runCommand("Auth matrix smoke", "npm", ["run", "security:smoke:auth-matrix"]);
    }

    if (needChallenge) {
        await assertDbReady();
        await runCommand("Challenge permissions smoke", "npm", ["run", "security:smoke:challenges"]);
        await runCommand("Challenge gameplay regression smoke", "npm", ["run", "quality:smoke:challenge-gameplay-regression"]);
        await runCommand("Challenge reconnect SLA smoke", "npm", ["run", "quality:smoke:challenge-reconnect-sla"]);
    }

    if (needFinance) {
        await assertDbReady();
        await runCommand("Settlement idempotency smoke", "npm", ["run", "security:smoke:settlement-idempotency"]);
        await runCommand("Tournament currency lifecycle smoke", "npm", ["run", "quality:smoke:tournament-currency"]);
    }

    console.log("\n[gate] All selected gates passed.");
}

run().catch((error) => {
    console.error(`\n[gate] FAILED: ${error.message}`);
    process.exit(1);
});
