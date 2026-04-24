#!/usr/bin/env tsx

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { WebSocket } from "ws";
import { Pool } from "pg";
import { createErrorHelpers, SmokeScriptError } from "./lib/smoke-helpers";

class PerfError extends SmokeScriptError {
  constructor(message: string, details?: unknown) {
    super("PerfError", message, details);
  }
}
import { requestJson as smokeRequestJson } from "./lib/smoke-http";

const SMOKE_USER_AGENT = "smoke-domino-load-latency/1.0";

type PerfProfile = "latency" | "load" | "all";

interface CliOptions {
    profile: PerfProfile;
    baseUrl: string;
    databaseUrl: string;
    password: string;
    timeoutMs: number;
    latencyRounds: number;
    latencyP95Ms: number;
    loadConcurrency: number;
    loadBursts: number;
    loadHoldMs: number;
    loadP95Ms: number;
    loadMinSuccessRate: number;
    keepData: boolean;
}

interface SpectatorSeedUser {
    id: string;
    username: string;
}

interface SetupData {
    userIds: {
        player1: string;
        player2: string;
    };
    usernames: {
        player1: string;
        player2: string;
    };
    spectators: SpectatorSeedUser[];
    challengeId: string;
    sessionId: string;
}

interface WsMessage {
    type?: string;
    role?: string;
    error?: string;
    code?: string;
    session?: Record<string, unknown>;
    view?: Record<string, unknown>;
    [key: string]: unknown;
}

interface SampleStats {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
}

interface JoinResult {
    elapsedMs: number;
    socket: WebSocket;
}

const { fail, assertCondition } = createErrorHelpers("PerfError");

function parseArgs(argv: string[]): CliOptions {
    const profileRaw = (process.env.SMOKE_DOMINO_PROFILE || "all").toLowerCase();
    const initialProfile: PerfProfile = profileRaw === "latency" || profileRaw === "load" ? profileRaw : "all";

    const args: CliOptions = {
        profile: initialProfile,
        baseUrl: process.env.BASE_URL || "http://localhost:3001",
        databaseUrl: process.env.DATABASE_URL || "",
        password: process.env.SMOKE_PASSWORD || "SmokePass123!",
        timeoutMs: Number.parseInt(process.env.SMOKE_TIMEOUT_MS || "", 10) || 12000,
        latencyRounds: Number.parseInt(process.env.SMOKE_DOMINO_LATENCY_ROUNDS || "", 10) || 20,
        latencyP95Ms: Number.parseInt(process.env.SMOKE_DOMINO_LATENCY_P95_MS || "", 10) || 1200,
        loadConcurrency: Number.parseInt(process.env.SMOKE_DOMINO_LOAD_CONCURRENCY || "", 10) || 12,
        loadBursts: Number.parseInt(process.env.SMOKE_DOMINO_LOAD_BURSTS || "", 10) || 3,
        loadHoldMs: Number.parseInt(process.env.SMOKE_DOMINO_LOAD_HOLD_MS || "", 10) || 1000,
        loadP95Ms: Number.parseInt(process.env.SMOKE_DOMINO_LOAD_P95_MS || "", 10) || 1800,
        loadMinSuccessRate: Number.parseFloat(process.env.SMOKE_DOMINO_LOAD_MIN_SUCCESS || "") || 0.9,
        keepData: false,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const part = argv[i];
        if (part === "--keep-data") {
            args.keepData = true;
            continue;
        }

        const [key, value] = part.split("=");
        if (!value) continue;

        if (key === "--profile") {
            const p = value.toLowerCase();
            if (p === "latency" || p === "load" || p === "all") {
                args.profile = p;
            }
        }
        if (key === "--base-url") args.baseUrl = value;
        if (key === "--database-url") args.databaseUrl = value;
        if (key === "--password") args.password = value;
        if (key === "--timeout-ms") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) args.timeoutMs = parsed;
        }
        if (key === "--latency-rounds") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) args.latencyRounds = parsed;
        }
        if (key === "--latency-p95-ms") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) args.latencyP95Ms = parsed;
        }
        if (key === "--load-concurrency") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) args.loadConcurrency = parsed;
        }
        if (key === "--load-bursts") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) args.loadBursts = parsed;
        }
        if (key === "--load-hold-ms") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed >= 0) args.loadHoldMs = parsed;
        }
        if (key === "--load-p95-ms") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) args.loadP95Ms = parsed;
        }
        if (key === "--load-min-success") {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) {
                args.loadMinSuccessRate = parsed;
            }
        }
    }

    args.baseUrl = args.baseUrl.replace(/\/+$/, "");
    return args;
}

function toWebSocketBaseUrl(baseUrl: string): string {
    if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
    if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
    if (baseUrl.startsWith("ws://") || baseUrl.startsWith("wss://")) return baseUrl;
    return `ws://${baseUrl}`;
}

function parseWsPayload(raw: WebSocket.RawData): WsMessage | null {
    try {
        return JSON.parse(raw.toString()) as WsMessage;
    } catch {
        return null;
    }
}

function expandWsMessages(parsed: WsMessage | null): WsMessage[] {
    const candidate = parsed as WsMessage & { messages?: unknown };
    if (candidate?.type === "batch" && Array.isArray(candidate.messages)) {
        return candidate.messages as WsMessage[];
    }

    return parsed ? [parsed] : [];
}

const requestJson = (options: {
    baseUrl: string;
    path: string;
    method?: string;
    body?: unknown;
    timeoutMs: number;
}) => smokeRequestJson({ ...options, userAgent: SMOKE_USER_AGENT });

async function login(options: {
    baseUrl: string;
    username: string;
    password: string;
    timeoutMs: number;
}): Promise<string> {
    const response = await requestJson({
        baseUrl: options.baseUrl,
        path: "/api/auth/login",
        method: "POST",
        body: { username: options.username, password: options.password },
        timeoutMs: options.timeoutMs,
    });

    assertCondition(response.status === 200, "Login failed", { username: options.username, response });
    const token = (response.json as { token?: unknown })?.token;
    assertCondition(typeof token === "string" && token.length > 20, "Login token missing", response.json);

    return token;
}

function connectWebSocket(url: string, timeoutMs: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, {
            headers: {
                "User-Agent": SMOKE_USER_AGENT,
            },
        });

        const timeout = setTimeout(() => {
            cleanup();
            ws.terminate();
            reject(new PerfError(`WebSocket did not open in time: ${url}`));
        }, timeoutMs);

        const onOpen = () => {
            cleanup();
            resolve(ws);
        };

        const onError = (error: Error) => {
            cleanup();
            reject(new PerfError(`WebSocket connection failed: ${url}`, error.message));
        };

        const onClose = (code: number, reason: Buffer) => {
            cleanup();
            reject(new PerfError(`WebSocket closed before open: ${url}`, { code, reason: reason.toString() }));
        };

        const cleanup = () => {
            clearTimeout(timeout);
            ws.off("open", onOpen);
            ws.off("error", onError);
            ws.off("close", onClose);
        };

        ws.on("open", onOpen);
        ws.on("error", onError);
        ws.on("close", onClose);
    });
}

function waitForWsMessage(
    ws: WebSocket,
    predicate: (message: WsMessage) => boolean,
    timeoutMs: number,
    stepName: string,
): Promise<WsMessage> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new PerfError(`${stepName}: timed out waiting for websocket message`));
        }, timeoutMs);

        const onMessage = (raw: WebSocket.RawData) => {
            const parsed = parseWsPayload(raw);
            const messages = expandWsMessages(parsed);

            for (const message of messages) {
                if (predicate(message)) {
                    cleanup();
                    resolve(message);
                    return;
                }
            }
        };

        const onClose = (code: number, reason: Buffer) => {
            cleanup();
            reject(new PerfError(`${stepName}: websocket closed`, { code, reason: reason.toString() }));
        };

        const onError = (error: Error) => {
            cleanup();
            reject(new PerfError(`${stepName}: websocket error`, error.message));
        };

        const cleanup = () => {
            clearTimeout(timeout);
            ws.off("message", onMessage);
            ws.off("close", onClose);
            ws.off("error", onError);
        };

        ws.on("message", onMessage);
        ws.on("close", onClose);
        ws.on("error", onError);
    });
}

async function closeSocket(ws: WebSocket | null, timeoutMs: number): Promise<void> {
    if (!ws || ws.readyState === WebSocket.CLOSED) return;

    await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
            cleanup();
            resolve();
        }, Math.min(timeoutMs, 1800));

        const onClose = () => {
            cleanup();
            resolve();
        };

        const cleanup = () => {
            clearTimeout(timeout);
            ws.off("close", onClose);
        };

        ws.on("close", onClose);

        if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "domino-load-latency-smoke-complete");
        } else {
            ws.terminate();
        }
    });
}

async function authenticateSocket(ws: WebSocket, token: string, timeoutMs: number): Promise<void> {
    ws.send(JSON.stringify({ type: "auth", token }));

    const authMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "auth_success" || msg.type === "auth_error",
        timeoutMs,
        "ws auth",
    );

    assertCondition(authMessage.type === "auth_success", "WebSocket authentication failed", authMessage);
}

async function joinChallenge(
    ws: WebSocket,
    challengeId: string,
    expectedRole: "player" | "spectator",
    timeoutMs: number,
    stepPrefix: string,
): Promise<void> {
    ws.send(JSON.stringify({ type: "join_challenge_game", challengeId }));

    const roleMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "role_assigned" || msg.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} role_assigned`,
    );

    assertCondition(
        roleMessage.type === "role_assigned" && roleMessage.role === expectedRole,
        `${stepPrefix} role assignment failed`,
        roleMessage,
    );

    const syncMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "game_state_sync" || msg.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} game_state_sync`,
    );

    assertCondition(syncMessage.type === "game_state_sync", `${stepPrefix} state sync failed`, syncMessage);
}

async function joinAsSpectatorOnce(options: {
    wsBaseUrl: string;
    challengeId: string;
    token: string;
    timeoutMs: number;
    stepPrefix: string;
}): Promise<JoinResult> {
    const started = performance.now();
    let socket: WebSocket | null = null;

    try {
        socket = await connectWebSocket(`${options.wsBaseUrl}/ws`, options.timeoutMs);
        await authenticateSocket(socket, options.token, options.timeoutMs);
        await joinChallenge(socket, options.challengeId, "spectator", options.timeoutMs, options.stepPrefix);

        const elapsedMs = Number((performance.now() - started).toFixed(2));
        return { elapsedMs, socket };
    } catch (error) {
        await closeSocket(socket, options.timeoutMs);
        throw error;
    }
}

function percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = ((Math.max(0, Math.min(100, p))) / 100) * (sortedValues.length - 1);
    const low = Math.floor(index);
    const high = Math.ceil(index);

    if (low === high) return sortedValues[low];

    const weight = index - low;
    return sortedValues[low] * (1 - weight) + sortedValues[high] * weight;
}

function computeStats(values: number[]): SampleStats {
    assertCondition(values.length > 0, "Cannot compute stats for empty sample list");

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, current) => acc + current, 0);

    return {
        count: sorted.length,
        min: Number(sorted[0].toFixed(2)),
        max: Number(sorted[sorted.length - 1].toFixed(2)),
        avg: Number((sum / sorted.length).toFixed(2)),
        p50: Number(percentile(sorted, 50).toFixed(2)),
        p95: Number(percentile(sorted, 95).toFixed(2)),
    };
}

function statsToString(label: string, stats: SampleStats): string {
    return `${label} count=${stats.count} min=${stats.min}ms p50=${stats.p50}ms p95=${stats.p95}ms avg=${stats.avg}ms max=${stats.max}ms`;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeDelete(pool: Pool, sqlText: string, values: unknown[]): Promise<void> {
    try {
        await pool.query(sqlText, values);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("does not exist")) {
            return;
        }
        throw error;
    }
}

async function cleanup(pool: Pool, setupData: SetupData): Promise<void> {
    const challengeIds = [setupData.challengeId];
    const userIds = [
        setupData.userIds.player1,
        setupData.userIds.player2,
        ...setupData.spectators.map((spectator) => spectator.id),
    ];

    await safeDelete(pool, "DELETE FROM challenge_chat_messages WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM domino_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_spectators WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_gifts WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_spectator_bets WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_points_ledger WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM transactions WHERE reference_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM project_currency_ledger WHERE reference_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenges WHERE id = ANY($1::text[])", [challengeIds]);

    await safeDelete(pool, "DELETE FROM notifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM audit_logs WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM active_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM login_history WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM otp_verifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);
}

function buildDominoState(player1Id: string, player2Id: string): Record<string, unknown> {
    return {
        board: [{ left: 6, right: 6, id: "6-6" }],
        leftEnd: 6,
        rightEnd: 6,
        hands: {
            [player1Id]: [{ left: 1, right: 6, id: "1-6" }],
            [player2Id]: [{ left: 0, right: 4, id: "0-4" }],
        },
        boneyard: [
            { left: 2, right: 3, id: "2-3" },
            { left: 1, right: 4, id: "1-4" },
        ],
        currentPlayer: player1Id,
        playerOrder: [player1Id, player2Id],
        passCount: 0,
        drawsThisTurn: 0,
        gameOver: false,
        scores: {
            [player1Id]: 0,
            [player2Id]: 0,
        },
    };
}

function buildSetupData(runTag: string, spectatorCount: number): SetupData {
    const spectators: SpectatorSeedUser[] = [];
    for (let i = 0; i < spectatorCount; i += 1) {
        spectators.push({
            id: crypto.randomUUID(),
            username: `smoke_domino_spec_${runTag}_${i + 1}`,
        });
    }

    return {
        userIds: {
            player1: crypto.randomUUID(),
            player2: crypto.randomUUID(),
        },
        usernames: {
            player1: `smoke_domino_p1_${runTag}`,
            player2: `smoke_domino_p2_${runTag}`,
        },
        spectators,
        challengeId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
    };
}

async function seedUsers(pool: Pool, setupData: SetupData, passwordHash: string): Promise<void> {
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance)
     VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
        [setupData.userIds.player1, setupData.usernames.player1, passwordHash],
    );

    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance)
     VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
        [setupData.userIds.player2, setupData.usernames.player2, passwordHash],
    );

    for (const spectator of setupData.spectators) {
        await pool.query(
            `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
            [spectator.id, spectator.username, passwordHash],
        );
    }
}

async function seedDominoChallenge(pool: Pool, setupData: SetupData): Promise<void> {
    await pool.query(
        `INSERT INTO challenges (
        id, game_type, bet_amount, currency_type, visibility, status,
        player1_id, player2_id, required_players, current_players,
        opponent_type, time_limit
     ) VALUES (
        $1, 'domino', '0.00', 'usd', 'public', 'active',
        $2, $3, 2, 2,
        'anyone', 300
     )`,
        [setupData.challengeId, setupData.userIds.player1, setupData.userIds.player2],
    );

    await pool.query(
        `INSERT INTO challenge_game_sessions (
        id, challenge_id, game_type, current_turn, player1_time_remaining,
        player2_time_remaining, game_state, status, total_moves
     ) VALUES (
        $1, $2, 'domino', $3, 300,
        300, $4, 'playing', 0
     )`,
        [
            setupData.sessionId,
            setupData.challengeId,
            setupData.userIds.player1,
            JSON.stringify(buildDominoState(setupData.userIds.player1, setupData.userIds.player2)),
        ],
    );
}

async function runLatencyProfile(options: {
    wsBaseUrl: string;
    challengeId: string;
    timeoutMs: number;
    rounds: number;
    p95BudgetMs: number;
    token: string;
}): Promise<void> {
    const samples: number[] = [];

    for (let round = 1; round <= options.rounds; round += 1) {
        const join = await joinAsSpectatorOnce({
            wsBaseUrl: options.wsBaseUrl,
            challengeId: options.challengeId,
            token: options.token,
            timeoutMs: options.timeoutMs,
            stepPrefix: `latency round ${round}`,
        });

        samples.push(join.elapsedMs);
        await closeSocket(join.socket, options.timeoutMs);
        console.log(`[perf:domino][latency] round ${round}/${options.rounds}: ${join.elapsedMs}ms`);
    }

    const stats = computeStats(samples);
    console.log(`[perf:domino][latency] ${statsToString("summary", stats)}`);

    assertCondition(
        stats.p95 <= options.p95BudgetMs,
        "Latency profile p95 exceeded budget",
        { p95: stats.p95, budget: options.p95BudgetMs, stats },
    );

    console.log(`[perf:domino][latency] PASS p95=${stats.p95}ms <= ${options.p95BudgetMs}ms`);
}

async function runLoadProfile(options: {
    wsBaseUrl: string;
    challengeId: string;
    timeoutMs: number;
    concurrency: number;
    bursts: number;
    holdMs: number;
    p95BudgetMs: number;
    minSuccessRate: number;
    spectatorTokens: string[];
}): Promise<void> {
    const allSamples: number[] = [];
    let totalAttempts = 0;
    let totalSuccess = 0;
    const failures: Array<{ burst: number; worker: number; reason: string }> = [];

    for (let burst = 1; burst <= options.bursts; burst += 1) {
        const settled = await Promise.allSettled(
            Array.from({ length: options.concurrency }, (_, worker) => {
                const token = options.spectatorTokens[worker % options.spectatorTokens.length];
                return joinAsSpectatorOnce({
                    wsBaseUrl: options.wsBaseUrl,
                    challengeId: options.challengeId,
                    token,
                    timeoutMs: options.timeoutMs,
                    stepPrefix: `load burst ${burst} worker ${worker + 1}`,
                });
            }),
        );

        totalAttempts += settled.length;

        const socketsToClose: WebSocket[] = [];
        for (let i = 0; i < settled.length; i += 1) {
            const item = settled[i];
            if (item.status === "fulfilled") {
                totalSuccess += 1;
                allSamples.push(item.value.elapsedMs);
                socketsToClose.push(item.value.socket);
            } else {
                const reason = item.reason instanceof Error ? item.reason.message : String(item.reason);
                failures.push({ burst, worker: i + 1, reason });
            }
        }

        if (options.holdMs > 0) {
            await delay(options.holdMs);
        }

        await Promise.all(socketsToClose.map((socket) => closeSocket(socket, options.timeoutMs)));

        const burstSuccessRate = settled.length > 0 ? Number((socketsToClose.length / settled.length).toFixed(3)) : 0;
        console.log(
            `[perf:domino][load] burst ${burst}/${options.bursts} success=${socketsToClose.length}/${settled.length} (${burstSuccessRate})`,
        );
    }

    const successRate = totalAttempts > 0 ? Number((totalSuccess / totalAttempts).toFixed(3)) : 0;
    assertCondition(allSamples.length > 0, "Load profile produced no successful samples", { failures });

    const stats = computeStats(allSamples);
    console.log(`[perf:domino][load] ${statsToString("summary", stats)} successRate=${successRate}`);

    assertCondition(
        successRate >= options.minSuccessRate,
        "Load profile success rate below threshold",
        { successRate, minimum: options.minSuccessRate, failures: failures.slice(0, 12) },
    );

    assertCondition(
        stats.p95 <= options.p95BudgetMs,
        "Load profile p95 exceeded budget",
        { p95: stats.p95, budget: options.p95BudgetMs, stats },
    );

    console.log(
        `[perf:domino][load] PASS p95=${stats.p95}ms <= ${options.p95BudgetMs}ms and successRate=${successRate} >= ${options.minSuccessRate}`,
    );
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv);
    if (!options.databaseUrl) {
        fail("DATABASE_URL is required (use --database-url=... or set env)");
    }

    const pool = new Pool({ connectionString: options.databaseUrl });
    const runTag = crypto.randomBytes(4).toString("hex");
    const setupData = buildSetupData(runTag, Math.max(1, options.loadConcurrency));
    const wsBaseUrl = toWebSocketBaseUrl(options.baseUrl);

    let shouldCleanup = false;
    const playerSockets: WebSocket[] = [];

    try {
        await pool.query("SELECT 1");
        shouldCleanup = true;

        const passwordHash = await bcrypt.hash(options.password, 12);
        await seedUsers(pool, setupData, passwordHash);
        await seedDominoChallenge(pool, setupData);

        const player1Token = await login({
            baseUrl: options.baseUrl,
            username: setupData.usernames.player1,
            password: options.password,
            timeoutMs: options.timeoutMs,
        });

        const player2Token = await login({
            baseUrl: options.baseUrl,
            username: setupData.usernames.player2,
            password: options.password,
            timeoutMs: options.timeoutMs,
        });

        const spectatorTokens: string[] = [];
        for (const spectator of setupData.spectators) {
            const token = await login({
                baseUrl: options.baseUrl,
                username: spectator.username,
                password: options.password,
                timeoutMs: options.timeoutMs,
            });
            spectatorTokens.push(token);
        }

        const p1 = await connectWebSocket(`${wsBaseUrl}/ws`, options.timeoutMs);
        const p2 = await connectWebSocket(`${wsBaseUrl}/ws`, options.timeoutMs);
        playerSockets.push(p1, p2);

        await authenticateSocket(p1, player1Token, options.timeoutMs);
        await authenticateSocket(p2, player2Token, options.timeoutMs);
        await joinChallenge(p1, setupData.challengeId, "player", options.timeoutMs, "baseline player1");
        await joinChallenge(p2, setupData.challengeId, "player", options.timeoutMs, "baseline player2");

        console.log(`[perf:domino] profile=${options.profile} challenge=${setupData.challengeId}`);

        if (options.profile === "latency" || options.profile === "all") {
            await runLatencyProfile({
                wsBaseUrl,
                challengeId: setupData.challengeId,
                timeoutMs: options.timeoutMs,
                rounds: options.latencyRounds,
                p95BudgetMs: options.latencyP95Ms,
                token: spectatorTokens[0],
            });
        }

        if (options.profile === "load" || options.profile === "all") {
            await runLoadProfile({
                wsBaseUrl,
                challengeId: setupData.challengeId,
                timeoutMs: options.timeoutMs,
                concurrency: options.loadConcurrency,
                bursts: options.loadBursts,
                holdMs: options.loadHoldMs,
                p95BudgetMs: options.loadP95Ms,
                minSuccessRate: options.loadMinSuccessRate,
                spectatorTokens,
            });
        }

        console.log("[perf:domino] PASS all requested profile checks");
    } finally {
        await Promise.all(playerSockets.map((socket) => closeSocket(socket, options.timeoutMs)));

        if (shouldCleanup && !options.keepData) {
            await cleanup(pool, setupData);
        }

        await pool.end();
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof PerfError ? error.details : error;
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[perf:domino] FAIL", message, details ?? "", stack ?? "");
    process.exit(1);
});
