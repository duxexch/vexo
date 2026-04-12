#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";

const VALID_AGENTS = new Set([
    "flow",
    "i18n-rtl",
    "mobile",
    "backend",
    "frontend",
    "database",
]);

const DEFAULT_AGENTS = [
    "flow",
    "i18n-rtl",
    "mobile",
    "backend",
    "frontend",
    "database",
];

const VALID_DB_POLICIES = new Set(["auto", "strict", "skip"]);

function parseAgents() {
    const arg = process.argv.find((entry) => entry.startsWith("--agents="));
    const raw = arg ? arg.split("=")[1] : DEFAULT_AGENTS.join(",");
    const agents = raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    if (agents.length === 0) {
        return [...DEFAULT_AGENTS];
    }

    const invalid = agents.filter((agent) => !VALID_AGENTS.has(agent));
    if (invalid.length > 0) {
        throw new Error(
            `Invalid agent(s): ${invalid.join(", ")}. Valid values: ${Array.from(VALID_AGENTS).join(", ")}`,
        );
    }

    return Array.from(new Set(agents));
}

function parseDbPolicy() {
    const arg = process.argv.find((entry) => entry.startsWith("--db-policy="));
    const policy = (arg ? arg.split("=")[1] : "auto").trim().toLowerCase();

    if (!VALID_DB_POLICIES.has(policy)) {
        throw new Error(
            `Invalid db policy: ${policy}. Valid values: ${Array.from(VALID_DB_POLICIES).join(", ")}`,
        );
    }

    return policy;
}

function runCommand(label, command, args = []) {
    return new Promise((resolve, reject) => {
        console.log(`\n[team-agent] ${label}`);
        console.log(`[team-agent] > ${command} ${args.join(" ")}`);

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

function assertIncludes(filePath, snippets, contextLabel) {
    const content = readFileSync(filePath, "utf8");
    for (const snippet of snippets) {
        if (!content.includes(snippet)) {
            throw new Error(`${contextLabel}: missing snippet in ${filePath}: ${snippet}`);
        }
    }
}

function assertRouteContracts() {
    assertIncludes(
        "client/src/App.tsx",
        [
            'path="/challenge/:id/play"',
            'path="/challenge/:id/watch"',
            'path="/game/chess/:sessionId"',
            'path="/game/backgammon/:sessionId"',
            'path="/game/domino/:sessionId"',
            'path="/game/tarneeb/:sessionId"',
            'path="/game/baloot/:sessionId"',
        ],
        "Flow route contract",
    );

    const matchmaking = readFileSync("server/websocket/matchmaking.ts", "utf8");
    if (matchmaking.includes("`/game/${match.id}`")) {
        throw new Error("Flow route contract: found deprecated /game/${match.id} link in websocket matchmaking");
    }
    if (!matchmaking.includes("buildMatchLink(")) {
        throw new Error("Flow route contract: websocket matchmaking must use buildMatchLink helper");
    }

    const multiplayerPage = readFileSync("client/src/pages/multiplayer.tsx", "utf8");
    if (!multiplayerPage.includes("openMatchRoute(")) {
        throw new Error("Flow route contract: multiplayer page must navigate through openMatchRoute");
    }
}

function assertUnifiedGameSurfaceClasses() {
    const gamePages = [
        "client/src/pages/games/ChessGame.tsx",
        "client/src/pages/games/BackgammonGame.tsx",
        "client/src/pages/games/DominoGame.tsx",
        "client/src/pages/games/TarneebGame.tsx",
        "client/src/pages/games/BalootGame.tsx",
    ];

    for (const filePath of gamePages) {
        assertIncludes(filePath, ["vex-arcade-stage"], "Frontend game surface contract");
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

async function checkDbReady() {
    console.log("\n[team-agent] DB precheck: localhost:5432");
    const reachable = await checkPortOpen("127.0.0.1", 5432, 2000);
    if (reachable) {
        console.log("[team-agent] DB precheck passed");
    }
    return reachable;
}

function assertDatabaseSchemaContracts() {
    assertIncludes(
        "shared/schema.ts",
        [
            "export const matchmakingQueue = pgTable",
            "export const gameMatches = pgTable",
        ],
        "Database schema contract",
    );
}

const agentRunners = {
    async flow() {
        console.log("\n[team-agent] Running flow agent");
        assertRouteContracts();
        await runCommand("TypeScript", "npm", ["run", "check:types"]);
        await runCommand("WebSocket heartbeat smoke", "npm", ["run", "security:smoke:ws-heartbeat"]);
    },

    async "i18n-rtl"() {
        console.log("\n[team-agent] Running i18n-rtl agent");
        assertIncludes("client/src/index.css", ['[dir="rtl"]'], "RTL contract");
        await runCommand("I18n audit strict", "npm", ["run", "i18n:audit:strict"]);
        await runCommand("I18n quality strict", "npm", ["run", "i18n:quality:strict"]);
    },

    async mobile() {
        console.log("\n[team-agent] Running mobile agent");
        await runCommand("Mobile domino quality smoke", "npm", ["run", "quality:mobile:domino"]);
    },

    async backend() {
        console.log("\n[team-agent] Running backend agent");
        await runCommand("Backend general gate", "npm", ["run", "team:gate:general"]);
    },

    async frontend() {
        console.log("\n[team-agent] Running frontend agent");
        assertUnifiedGameSurfaceClasses();
        await runCommand("TypeScript", "npm", ["run", "check:types"]);
    },

    async database({ dbPolicy }) {
        console.log("\n[team-agent] Running database agent");

        if (dbPolicy === "skip") {
            console.warn("[team-agent] Database checks skipped (--db-policy=skip).");
            return;
        }

        const dbReady = await checkDbReady();
        if (!dbReady) {
            if (dbPolicy === "strict") {
                throw new Error("PostgreSQL is not reachable on localhost:5432. Start DB/container before database agent checks.");
            }

            console.warn("[team-agent] PostgreSQL is offline; running static database contract checks (auto mode).");
            assertDatabaseSchemaContracts();
            await runCommand("TypeScript", "npm", ["run", "check:types"]);
            return;
        }

        await runCommand("Settlement idempotency smoke", "npm", ["run", "security:smoke:settlement-idempotency"]);
    },
};

async function run() {
    const agents = parseAgents();
    const dbPolicy = parseDbPolicy();
    console.log(`[team-agent] Running agents: ${agents.join(", ")} (db-policy=${dbPolicy})`);

    for (const agent of agents) {
        const runner = agentRunners[agent];
        if (!runner) {
            throw new Error(`Agent runner not found: ${agent}`);
        }
        await runner({ dbPolicy });
    }

    console.log("\n[team-agent] All selected agents passed.");
}

run().catch((error) => {
    console.error(`\n[team-agent] FAILED: ${error.message}`);
    process.exit(1);
});
