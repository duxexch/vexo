#!/usr/bin/env tsx

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { WebSocket } from "ws";
import { Pool } from "pg";

const SMOKE_USER_AGENT = "smoke-challenge-gameplay-regression/1.0";

type GameType = "chess" | "backgammon" | "tarneeb" | "baloot";

interface CliOptions {
    baseUrl: string;
    databaseUrl: string;
    password: string;
    timeoutMs: number;
    keepData: boolean;
}

interface WsMessage {
    type?: string;
    role?: string;
    error?: string;
    code?: string;
    session?: Record<string, unknown>;
    view?: Record<string, unknown>;
    events?: Array<Record<string, unknown>>;
    seq?: number;
    [key: string]: unknown;
}

interface SetupData {
    userIds: {
        player1: string;
        player2: string;
        player3: string;
        player4: string;
    };
    usernames: {
        player1: string;
        player2: string;
        player3: string;
        player4: string;
    };
    challengeIds: Record<GameType, string>;
    sessionIds: Record<GameType, string>;
}

interface Scenario {
    gameType: GameType;
    move: Record<string, unknown>;
    expectedCurrentTurn: string;
    assertAck?: (ack: WsMessage) => void;
}

class SmokeError extends Error {
    details?: unknown;

    constructor(message: string, details?: unknown) {
        super(message);
        this.name = "SmokeError";
        this.details = details;
    }
}

function fail(message: string, details?: unknown): never {
    throw new SmokeError(message, details);
}

function assertCondition(condition: unknown, message: string, details?: unknown): asserts condition {
    if (!condition) {
        fail(message, details);
    }
}

function parseArgs(argv: string[]): CliOptions {
    const args: CliOptions = {
        baseUrl: process.env.BASE_URL || "http://localhost:3001",
        databaseUrl: process.env.DATABASE_URL || "",
        password: process.env.SMOKE_PASSWORD || "SmokePass123!",
        timeoutMs: Number.parseInt(process.env.SMOKE_TIMEOUT_MS || "", 10) || 12000,
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

        if (key === "--base-url") args.baseUrl = value;
        if (key === "--database-url") args.databaseUrl = value;
        if (key === "--password") args.password = value;
        if (key === "--timeout-ms") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                args.timeoutMs = parsed;
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

async function requestJson(options: {
    baseUrl: string;
    path: string;
    method?: string;
    body?: unknown;
    timeoutMs: number;
}): Promise<{ status: number; ok: boolean; json: unknown; text: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
        const response = await fetch(`${options.baseUrl}${options.path}`, {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": SMOKE_USER_AGENT,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
        });

        const text = await response.text();
        let json: unknown = null;
        if (text) {
            try {
                json = JSON.parse(text);
            } catch {
                json = { raw: text };
            }
        }

        return { status: response.status, ok: response.ok, json, text };
    } finally {
        clearTimeout(timeout);
    }
}

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
            reject(new SmokeError(`WebSocket did not open in time: ${url}`));
        }, timeoutMs);

        const onOpen = () => {
            cleanup();
            resolve(ws);
        };

        const onError = (error: Error) => {
            cleanup();
            reject(new SmokeError(`WebSocket connection failed: ${url}`, error.message));
        };

        const onClose = (code: number, reason: Buffer) => {
            cleanup();
            reject(new SmokeError(`WebSocket closed before open: ${url}`, { code, reason: reason.toString() }));
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
            reject(new SmokeError(`${stepName}: timed out waiting for websocket message`));
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
            reject(new SmokeError(`${stepName}: websocket closed`, { code, reason: reason.toString() }));
        };

        const onError = (error: Error) => {
            cleanup();
            reject(new SmokeError(`${stepName}: websocket error`, error.message));
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
        }, Math.min(timeoutMs, 1500));

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
            ws.close(1000, "smoke-challenge-gameplay-regression-complete");
        } else {
            ws.terminate();
        }
    });
}

async function authenticateSocket(ws: WebSocket, token: string, timeoutMs: number): Promise<void> {
    ws.send(JSON.stringify({ type: "auth", token }));
    const authMessage = await waitForWsMessage(
        ws,
        (message) => message.type === "auth_success" || message.type === "auth_error" || message.type === "ws_error",
        timeoutMs,
        "legacy ws auth",
    );

    assertCondition(authMessage.type === "auth_success", "WebSocket authentication failed", authMessage);
}

async function joinChallengeAsPlayer(
    ws: WebSocket,
    challengeId: string,
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
        roleMessage.type === "role_assigned" && roleMessage.role === "player",
        `${stepPrefix} failed role assignment`,
        roleMessage,
    );

    const syncMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "game_state_sync" || msg.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} game_state_sync`,
    );

    assertCondition(syncMessage.type === "game_state_sync", `${stepPrefix} failed state sync`, syncMessage);
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

async function detectChallengeCurrencyType(pool: Pool): Promise<"project" | "usd"> {
    const { rows } = await pool.query(
        "SELECT value FROM gameplay_settings WHERE key = 'play_gift_currency_mode' LIMIT 1",
    );
    const modeValue = String(rows?.[0]?.value || "").toLowerCase();
    return modeValue === "mixed" ? "usd" : "project";
}

async function seedProjectWallets(pool: Pool, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
        await pool.query(
            `INSERT INTO project_currency_wallets (
                user_id, purchased_balance, earned_balance, total_balance,
                total_converted, total_spent, total_earned, locked_balance
             ) VALUES (
                $1, '100.00', '100.00', '200.00',
                '0.00', '0.00', '0.00', '0.00'
             )`,
            [userId],
        );
    }
}

async function cleanup(pool: Pool, setupData: SetupData): Promise<void> {
    const challengeIds = Object.values(setupData.challengeIds);
    const userIds = Object.values(setupData.userIds);

    await safeDelete(pool, "DELETE FROM challenge_chat_messages WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM chess_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM backgammon_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM tarneeb_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM baloot_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_spectators WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_gifts WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_spectator_bets WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenge_points_ledger WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM transactions WHERE reference_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM project_currency_ledger WHERE reference_id = ANY($1::text[])", [challengeIds]);
    await safeDelete(pool, "DELETE FROM challenges WHERE id = ANY($1::text[])", [challengeIds]);

    await safeDelete(pool, "DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])", [userIds]);

    await safeDelete(pool, "DELETE FROM notifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM audit_logs WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM active_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM login_history WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM otp_verifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete(pool, "DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);
}

async function seedUsers(pool: Pool, setupData: SetupData, passwordHash: string): Promise<void> {
    const usersToInsert = [
        [setupData.userIds.player1, setupData.usernames.player1],
        [setupData.userIds.player2, setupData.usernames.player2],
        [setupData.userIds.player3, setupData.usernames.player3],
        [setupData.userIds.player4, setupData.usernames.player4],
    ] as const;

    for (const [id, username] of usersToInsert) {
        await pool.query(
            `INSERT INTO users (id, username, password, role, status, registration_type, balance)
             VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
            [id, username, passwordHash],
        );
    }
}

async function seedChallengesAndSessions(
    pool: Pool,
    setupData: SetupData,
    currencyType: "project" | "usd",
): Promise<void> {
    await pool.query(
        `INSERT INTO challenges (
            id, game_type, bet_amount, currency_type, visibility, status,
            player1_id, player2_id, required_players, current_players, opponent_type, time_limit
         ) VALUES (
            $1, 'chess', '0.00', $4, 'public', 'active',
            $2, $3, 2, 2, 'anyone', 300
         )`,
        [
            setupData.challengeIds.chess,
            setupData.userIds.player1,
            setupData.userIds.player2,
            currencyType,
        ],
    );

    await pool.query(
        `INSERT INTO challenges (
            id, game_type, bet_amount, currency_type, visibility, status,
            player1_id, player2_id, required_players, current_players, opponent_type, time_limit
         ) VALUES (
            $1, 'backgammon', '0.00', $4, 'public', 'active',
            $2, $3, 2, 2, 'anyone', 300
         )`,
        [
            setupData.challengeIds.backgammon,
            setupData.userIds.player1,
            setupData.userIds.player2,
            currencyType,
        ],
    );

    await pool.query(
        `INSERT INTO challenges (
            id, game_type, bet_amount, currency_type, visibility, status,
            player1_id, player2_id, player3_id, player4_id,
            required_players, current_players, opponent_type, time_limit
         ) VALUES (
            $1, 'tarneeb', '0.00', $6, 'public', 'active',
            $2, $3, $4, $5,
            4, 4, 'anyone', 300
         )`,
        [
            setupData.challengeIds.tarneeb,
            setupData.userIds.player1,
            setupData.userIds.player2,
            setupData.userIds.player3,
            setupData.userIds.player4,
            currencyType,
        ],
    );

    await pool.query(
        `INSERT INTO challenges (
            id, game_type, bet_amount, currency_type, visibility, status,
            player1_id, player2_id, player3_id, player4_id,
            required_players, current_players, opponent_type, time_limit
         ) VALUES (
            $1, 'baloot', '0.00', $6, 'public', 'active',
            $2, $3, $4, $5,
            4, 4, 'anyone', 300
         )`,
        [
            setupData.challengeIds.baloot,
            setupData.userIds.player1,
            setupData.userIds.player2,
            setupData.userIds.player3,
            setupData.userIds.player4,
            currencyType,
        ],
    );

    const sessions: Array<{ gameType: GameType; challengeId: string; sessionId: string }> = [
        { gameType: "chess", challengeId: setupData.challengeIds.chess, sessionId: setupData.sessionIds.chess },
        { gameType: "backgammon", challengeId: setupData.challengeIds.backgammon, sessionId: setupData.sessionIds.backgammon },
        { gameType: "tarneeb", challengeId: setupData.challengeIds.tarneeb, sessionId: setupData.sessionIds.tarneeb },
        { gameType: "baloot", challengeId: setupData.challengeIds.baloot, sessionId: setupData.sessionIds.baloot },
    ];

    for (const session of sessions) {
        await pool.query(
            `INSERT INTO challenge_game_sessions (
                id, challenge_id, game_type, current_turn,
                player1_time_remaining, player2_time_remaining,
                game_state, status, total_moves
             ) VALUES (
                $1, $2, $3, $4,
                300, 300,
                NULL, 'playing', 0
             )`,
            [
                session.sessionId,
                session.challengeId,
                session.gameType,
                setupData.userIds.player1,
            ],
        );
    }
}

async function runScenario(options: {
    wsBaseUrl: string;
    timeoutMs: number;
    actorToken: string;
    challengeId: string;
    scenario: Scenario;
}): Promise<void> {
    const socket = await connectWebSocket(`${options.wsBaseUrl}/ws`, options.timeoutMs);

    try {
        await authenticateSocket(socket, options.actorToken, options.timeoutMs);
        await joinChallengeAsPlayer(socket, options.challengeId, options.timeoutMs, `${options.scenario.gameType} join`);

        socket.send(JSON.stringify({
            type: "game_move",
            challengeId: options.challengeId,
            move: options.scenario.move,
        }));

        const ack = await waitForWsMessage(
            socket,
            (message) => message.type === "game_move" || message.type === "challenge_error",
            options.timeoutMs,
            `${options.scenario.gameType} move ack`,
        );

        assertCondition(ack.type === "game_move", `${options.scenario.gameType} move rejected`, ack);
        assertCondition(typeof ack.seq === "number" && ack.seq >= 1, `${options.scenario.gameType} sequence missing`, ack);

        if (options.scenario.assertAck) {
            options.scenario.assertAck(ack);
        }

        console.log(`[smoke:challenge-gameplay-regression] PASS ${options.scenario.gameType} gameplay move accepted`);
    } finally {
        await closeSocket(socket, options.timeoutMs);
    }
}

async function verifySessionProgress(options: {
    pool: Pool;
    sessionId: string;
    gameType: GameType;
    expectedCurrentTurn: string;
}): Promise<void> {
    const result = await options.pool.query(
        `SELECT total_moves AS "totalMoves", current_turn AS "currentTurn", game_state AS "gameState", status
         FROM challenge_game_sessions
         WHERE id = $1`,
        [options.sessionId],
    );

    assertCondition(result.rowCount === 1, `${options.gameType} session row missing after move`, { sessionId: options.sessionId });

    const row = result.rows[0] as {
        totalMoves: number;
        currentTurn: string | null;
        gameState: string | null;
        status: string;
    };

    assertCondition(Number(row.totalMoves) >= 1, `${options.gameType} total_moves did not increment`, row);
    assertCondition(typeof row.gameState === "string" && row.gameState.length > 10, `${options.gameType} game_state was not persisted`, row);
    assertCondition(String(row.currentTurn || "") === options.expectedCurrentTurn, `${options.gameType} current_turn mismatch`, {
        expected: options.expectedCurrentTurn,
        actual: row.currentTurn,
        row,
    });
    assertCondition(String(row.status || "").toLowerCase() === "playing", `${options.gameType} status changed unexpectedly`, row);

    console.log(`[smoke:challenge-gameplay-regression] PASS ${options.gameType} DB progression persisted`);
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv);
    if (!options.databaseUrl) {
        fail("DATABASE_URL is required (use --database-url=... or env DATABASE_URL)");
    }

    const pool = new Pool({ connectionString: options.databaseUrl });
    const runTag = crypto.randomBytes(4).toString("hex");
    const wsBaseUrl = toWebSocketBaseUrl(options.baseUrl);

    const setupData: SetupData = {
        userIds: {
            player1: crypto.randomUUID(),
            player2: crypto.randomUUID(),
            player3: crypto.randomUUID(),
            player4: crypto.randomUUID(),
        },
        usernames: {
            player1: `smoke_gameplay_p1_${runTag}`,
            player2: `smoke_gameplay_p2_${runTag}`,
            player3: `smoke_gameplay_p3_${runTag}`,
            player4: `smoke_gameplay_p4_${runTag}`,
        },
        challengeIds: {
            chess: crypto.randomUUID(),
            backgammon: crypto.randomUUID(),
            tarneeb: crypto.randomUUID(),
            baloot: crypto.randomUUID(),
        },
        sessionIds: {
            chess: crypto.randomUUID(),
            backgammon: crypto.randomUUID(),
            tarneeb: crypto.randomUUID(),
            baloot: crypto.randomUUID(),
        },
    };

    let shouldCleanup = false;

    try {
        await pool.query("SELECT 1");
        shouldCleanup = true;

        const challengeCurrencyType = await detectChallengeCurrencyType(pool);
        console.log(`[smoke:challenge-gameplay-regression] Challenge currency mode: ${challengeCurrencyType}`);

        const passwordHash = await bcrypt.hash(options.password, 12);
        await seedUsers(pool, setupData, passwordHash);

        if (challengeCurrencyType === "project") {
            await seedProjectWallets(pool, Object.values(setupData.userIds));
        }

        await seedChallengesAndSessions(pool, setupData, challengeCurrencyType);

        const player1Token = await login({
            baseUrl: options.baseUrl,
            username: setupData.usernames.player1,
            password: options.password,
            timeoutMs: options.timeoutMs,
        });

        const scenarios: Scenario[] = [
            {
                gameType: "chess",
                move: { type: "move", from: "e2", to: "e4" },
                expectedCurrentTurn: setupData.userIds.player2,
                assertAck: (ack) => {
                    const events = Array.isArray(ack.events) ? ack.events : [];
                    assertCondition(events.length > 0, "chess move events missing", ack);
                },
            },
            {
                gameType: "backgammon",
                move: { type: "roll" },
                expectedCurrentTurn: setupData.userIds.player1,
                assertAck: (ack) => {
                    const dice = (ack.view as { dice?: unknown })?.dice;
                    assertCondition(Array.isArray(dice) && dice.length >= 2, "backgammon dice not present after roll", ack);
                },
            },
            {
                gameType: "tarneeb",
                move: { type: "bid", bid: 7 },
                expectedCurrentTurn: setupData.userIds.player2,
            },
            {
                gameType: "baloot",
                move: { type: "choose", gameType: "sun" },
                expectedCurrentTurn: setupData.userIds.player1,
            },
        ];

        for (const scenario of scenarios) {
            await runScenario({
                wsBaseUrl,
                timeoutMs: options.timeoutMs,
                actorToken: player1Token,
                challengeId: setupData.challengeIds[scenario.gameType],
                scenario,
            });

            await verifySessionProgress({
                pool,
                sessionId: setupData.sessionIds[scenario.gameType],
                gameType: scenario.gameType,
                expectedCurrentTurn: scenario.expectedCurrentTurn,
            });
        }

        console.log("[smoke:challenge-gameplay-regression] PASS all game scenarios (chess/backgammon/tarneeb/baloot)");
    } finally {
        if (!options.keepData && shouldCleanup) {
            try {
                await cleanup(pool, setupData);
            } catch (cleanupError) {
                const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                console.warn("[smoke:challenge-gameplay-regression] Cleanup warning:", message);
            }
        } else if (options.keepData) {
            console.log("[smoke:challenge-gameplay-regression] keep-data enabled, skipping cleanup.");
        }

        await pool.end();
    }
}

main().catch((error: unknown) => {
    if (error instanceof SmokeError) {
        if (error.details !== undefined) {
            console.error("[smoke:challenge-gameplay-regression] FAIL", error.message, error.details);
        } else {
            console.error("[smoke:challenge-gameplay-regression] FAIL", error.message);
        }
        process.exit(1);
    }

    const details = error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack || ""}`
        : String(error);
    console.error("[smoke:challenge-gameplay-regression] FAIL Unexpected error", details);
    process.exit(1);
});
