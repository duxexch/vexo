#!/usr/bin/env tsx

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { WebSocket } from "ws";
import { Pool } from "pg";
import { createErrorHelpers, SmokeScriptError } from "./lib/smoke-helpers";

class SmokeError extends SmokeScriptError {
  constructor(message: string, details?: unknown) {
    super("SmokeError", message, details);
  }
}
import { requestJson as smokeRequestJson } from "./lib/smoke-http";

const SMOKE_USER_AGENT = "smoke-sam9-solo-e2e/1.0";
const SAM9_MODE_KEY = "sam9_solo_mode";
const SAM9_FIXED_FEE_KEY = "sam9_solo_fixed_fee";

type Sam9Mode = "competitive" | "friendly_fixed_fee";
type CurrencyType = "project" | "usd";
type GameType = "domino" | "backgammon" | "tarneeb" | "baloot";

interface CliOptions {
    baseUrl: string;
    databaseUrl: string;
    password: string;
    timeoutMs: number;
    keepData: boolean;
    sam9Mode: Sam9Mode;
    sam9FixedFee: number;
    challengeStake: number;
}

interface WsMessage {
    type?: string;
    error?: string;
    code?: string;
    role?: string;
    view?: Record<string, unknown>;
    session?: Record<string, unknown>;
    messages?: WsMessage[];
    [key: string]: unknown;
}

interface GameplaySettingSnapshot {
    key: string;
    value: string;
    existed: boolean;
}

const { fail, assertCondition } = createErrorHelpers("SmokeError");

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        baseUrl: process.env.BASE_URL || "http://localhost:3001",
        databaseUrl: process.env.DATABASE_URL || "",
        password: process.env.SMOKE_PASSWORD || "SmokePass123!",
        timeoutMs: Number.parseInt(process.env.SMOKE_TIMEOUT_MS || "", 10) || 15000,
        keepData: false,
        sam9Mode: (process.env.SMOKE_SAM9_MODE as Sam9Mode) || "competitive",
        sam9FixedFee: Number.parseFloat(process.env.SMOKE_SAM9_FIXED_FEE || "2") || 2,
        challengeStake: Number.parseFloat(process.env.SMOKE_SAM9_CHALLENGE_STAKE || "10") || 10,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const part = argv[i];
        if (part === "--keep-data") {
            options.keepData = true;
            continue;
        }

        const [key, value] = part.split("=");
        if (!value) continue;

        if (key === "--base-url") options.baseUrl = value;
        if (key === "--database-url") options.databaseUrl = value;
        if (key === "--password") options.password = value;
        if (key === "--sam9-mode" && (value === "competitive" || value === "friendly_fixed_fee")) {
            options.sam9Mode = value;
        }
        if (key === "--sam9-fixed-fee") {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed) && parsed >= 0) {
                options.sam9FixedFee = parsed;
            }
        }
        if (key === "--challenge-stake") {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.challengeStake = parsed;
            }
        }
        if (key === "--timeout-ms") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.timeoutMs = parsed;
            }
        }
    }

    options.baseUrl = options.baseUrl.replace(/\/+$/, "");

    if (options.sam9Mode === "friendly_fixed_fee" && options.sam9FixedFee < 0) {
        fail("SAM9 fixed fee must be non-negative");
    }

    return options;
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
    if (parsed?.type === "batch" && Array.isArray(parsed.messages)) {
        return parsed.messages;
    }
    return parsed ? [parsed] : [];
}

const requestJson = (options: {
    baseUrl: string;
    path: string;
    timeoutMs: number;
    token?: string;
    method?: string;
    body?: unknown;
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

    assertCondition(response.status === 200, "Login failed", response.json || response.text);
    const token = (response.json as { token?: unknown })?.token;
    assertCondition(typeof token === "string" && token.length > 20, "Login token missing", response.json);
    return token;
}

function connectWebSocket(url: string, timeoutMs: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, {
            headers: { "User-Agent": SMOKE_USER_AGENT },
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

        const onClose = (code: number, reason: Buffer) => {
            cleanup();
            reject(new SmokeError(`WebSocket closed before open: ${url}`, { code, reason: reason.toString() }));
        };

        const onError = (error: Error) => {
            cleanup();
            reject(new SmokeError(`WebSocket connection failed: ${url}`, error.message));
        };

        const cleanup = () => {
            clearTimeout(timeout);
            ws.off("open", onOpen);
            ws.off("close", onClose);
            ws.off("error", onError);
        };

        ws.on("open", onOpen);
        ws.on("close", onClose);
        ws.on("error", onError);
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
            ws.close(1000, "smoke-sam9-solo-e2e-complete");
        } else {
            ws.terminate();
        }
    });
}

async function authenticateSocket(ws: WebSocket, token: string, timeoutMs: number): Promise<void> {
    ws.send(JSON.stringify({ type: "auth", token }));

    const authMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "auth_success" || msg.type === "auth_error" || msg.type === "ws_error",
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
): Promise<WsMessage> {
    ws.send(JSON.stringify({ type: "join_challenge_game", challengeId }));

    const roleMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "role_assigned" || msg.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} role_assigned`,
    );

    assertCondition(roleMessage.type === "role_assigned" && roleMessage.role === "player", `${stepPrefix} failed role assignment`, roleMessage);

    const syncMessage = await waitForWsMessage(
        ws,
        (msg) => msg.type === "game_state_sync" || msg.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} game_state_sync`,
    );

    assertCondition(syncMessage.type === "game_state_sync", `${stepPrefix} failed game state sync`, syncMessage);
    return syncMessage;
}

async function getGameplaySettingSnapshot(pool: Pool, key: string): Promise<GameplaySettingSnapshot> {
    const { rows } = await pool.query("SELECT value FROM gameplay_settings WHERE key = $1 LIMIT 1", [key]);
    if (rows.length === 0) {
        return { key, value: "", existed: false };
    }
    return { key, value: String(rows[0].value || ""), existed: true };
}

async function upsertGameplaySetting(pool: Pool, key: string, value: string, description: string): Promise<void> {
    await pool.query(
        `INSERT INTO gameplay_settings (key, value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()`,
        [key, value, description],
    );
}

async function restoreGameplaySetting(pool: Pool, snapshot: GameplaySettingSnapshot): Promise<void> {
    if (!snapshot.existed) {
        await pool.query("DELETE FROM gameplay_settings WHERE key = $1", [snapshot.key]);
        return;
    }

    await pool.query(
        "UPDATE gameplay_settings SET value = $2, updated_at = NOW() WHERE key = $1",
        [snapshot.key, snapshot.value],
    );
}

async function detectChallengeCurrencyType(pool: Pool): Promise<CurrencyType> {
    const { rows } = await pool.query("SELECT value FROM gameplay_settings WHERE key = 'play_gift_currency_mode' LIMIT 1");
    const modeValue = String(rows?.[0]?.value || "").toLowerCase();
    return modeValue === "mixed" ? "usd" : "project";
}

async function seedUser(pool: Pool, userId: string, username: string, passwordHash: string): Promise<void> {
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance)
     VALUES ($1, $2, $3, 'player', 'active', 'username', '1000.00')`,
        [userId, username, passwordHash],
    );
}

async function seedProjectWallet(pool: Pool, userId: string): Promise<void> {
    await pool.query(
        `INSERT INTO project_currency_wallets (
        user_id, purchased_balance, earned_balance, total_balance,
        total_converted, total_spent, total_earned, locked_balance
     ) VALUES (
        $1, '1000.00', '1000.00', '2000.00',
        '0.00', '0.00', '0.00', '0.00'
     )`,
        [userId],
    );
}

async function getUserBalance(pool: Pool, userId: string, currencyType: CurrencyType): Promise<number> {
    if (currencyType === "project") {
        const { rows } = await pool.query(
            "SELECT total_balance AS \"totalBalance\" FROM project_currency_wallets WHERE user_id = $1 LIMIT 1",
            [userId],
        );
        assertCondition(rows.length === 1, "Project wallet missing", { userId });
        return Number.parseFloat(String(rows[0].totalBalance || "0"));
    }

    const { rows } = await pool.query("SELECT balance FROM users WHERE id = $1 LIMIT 1", [userId]);
    assertCondition(rows.length === 1, "User balance row missing", { userId });
    return Number.parseFloat(String(rows[0].balance || "0"));
}

function approxEqual(a: number, b: number, tolerance = 0.0001): boolean {
    return Math.abs(a - b) <= tolerance;
}

function getScenarioMove(gameType: GameType, syncMessage: WsMessage): Record<string, unknown> {
    if (gameType === "domino") {
        const view = (syncMessage.view || {}) as { validMoves?: unknown };
        const validMoves = Array.isArray(view.validMoves) ? (view.validMoves as Array<Record<string, unknown>>) : [];
        const preferred = validMoves.find((move) => move?.type === "play")
            || validMoves.find((move) => move?.type === "draw")
            || validMoves.find((move) => move?.type === "pass");

        if (preferred) {
            return preferred;
        }

        return { type: "draw" };
    }

    if (gameType === "backgammon") {
        return { type: "roll" };
    }

    if (gameType === "tarneeb") {
        return { type: "bid", bid: 7 };
    }

    if (gameType === "baloot") {
        return { type: "choose", gameType: "sun" };
    }

    return { type: "move" };
}

async function waitForChallengeCompletion(pool: Pool, challengeId: string, timeoutMs: number): Promise<{ status: string; betAmount: number }> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const { rows } = await pool.query(
            `SELECT status, bet_amount AS "betAmount"
       FROM challenges
       WHERE id = $1
       LIMIT 1`,
            [challengeId],
        );

        if (rows.length === 1) {
            const status = String(rows[0].status || "");
            const betAmount = Number.parseFloat(String(rows[0].betAmount || "0"));
            if (status === "completed") {
                return { status, betAmount };
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    fail("Challenge did not reach completed status in time", { challengeId });
}

async function runSam9Scenario(options: {
    baseUrl: string;
    wsBaseUrl: string;
    timeoutMs: number;
    token: string;
    pool: Pool;
    userId: string;
    currencyType: CurrencyType;
    gameType: GameType;
    challengeStake: number;
    sam9Mode: Sam9Mode;
    sam9FixedFee: number;
    challengeIds: string[];
}): Promise<void> {
    const expectedDeduction = options.sam9Mode === "friendly_fixed_fee"
        ? Number(options.sam9FixedFee.toFixed(2))
        : Number(options.challengeStake.toFixed(2));

    const beforeBalance = await getUserBalance(options.pool, options.userId, options.currencyType);

    const createResponse = await requestJson({
        baseUrl: options.baseUrl,
        path: "/api/challenges",
        method: "POST",
        token: options.token,
        timeoutMs: options.timeoutMs,
        body: {
            gameType: options.gameType,
            betAmount: options.challengeStake,
            opponentType: "sam9",
            visibility: "public",
            requiredPlayers: 2,
            currencyType: options.currencyType,
        },
    });

    const challengeId = String((createResponse.json as { id?: unknown })?.id || "");
    if (challengeId.length > 10) {
        options.challengeIds.push(challengeId);
    }

    assertCondition(createResponse.ok && (createResponse.status === 200 || createResponse.status === 201), `${options.gameType} create failed`, createResponse.json || createResponse.text);
    assertCondition(challengeId.length > 10, `${options.gameType} challenge id missing`, createResponse.json);

    const { rows: challengeRows } = await options.pool.query(
        `SELECT bet_amount AS "betAmount", status
     FROM challenges
     WHERE id = $1
     LIMIT 1`,
        [challengeId],
    );

    assertCondition(challengeRows.length === 1, `${options.gameType} challenge row missing`, { challengeId });
    const persistedBetAmount = Number.parseFloat(String(challengeRows[0].betAmount || "0"));
    const expectedPersistedBet = options.sam9Mode === "friendly_fixed_fee" ? 0 : Number(options.challengeStake.toFixed(2));
    assertCondition(
        approxEqual(persistedBetAmount, expectedPersistedBet, 0.001),
        `${options.gameType} persisted bet amount mismatch`,
        { expectedPersistedBet, persistedBetAmount, sam9Mode: options.sam9Mode },
    );

    const socket = await connectWebSocket(`${options.wsBaseUrl}/ws`, options.timeoutMs);

    try {
        await authenticateSocket(socket, options.token, options.timeoutMs);
        const syncMessage = await joinChallengeAsPlayer(socket, challengeId, options.timeoutMs, `${options.gameType} join`);

        const move = getScenarioMove(options.gameType, syncMessage);

        socket.send(JSON.stringify({
            type: "game_move",
            challengeId,
            move,
        }));

        const moveAck = await waitForWsMessage(
            socket,
            (msg) => msg.type === "game_move" || msg.type === "move_error" || msg.type === "challenge_error" || msg.type === "game_ended",
            options.timeoutMs,
            `${options.gameType} move ack`,
        );

        assertCondition(moveAck.type !== "challenge_error", `${options.gameType} challenge error on move`, moveAck);
        assertCondition(moveAck.type !== "move_error", `${options.gameType} move rejected`, moveAck);

        const endedFromMove = moveAck.type === "game_ended"
            || String((moveAck.session as { status?: unknown } | undefined)?.status || "").toLowerCase() === "finished";

        if (!endedFromMove) {
            socket.send(JSON.stringify({ type: "game_resign", challengeId }));

            const endMessage = await waitForWsMessage(
                socket,
                (msg) => msg.type === "game_ended" || msg.type === "challenge_error",
                options.timeoutMs,
                `${options.gameType} finish`,
            );

            assertCondition(endMessage.type === "game_ended", `${options.gameType} did not finish after resign`, endMessage);
        }
    } finally {
        await closeSocket(socket, options.timeoutMs);
    }

    await waitForChallengeCompletion(options.pool, challengeId, options.timeoutMs);

    const afterBalance = await getUserBalance(options.pool, options.userId, options.currencyType);
    const actualDelta = Number((afterBalance - beforeBalance).toFixed(4));
    const expectedDelta = Number((-expectedDeduction).toFixed(4));

    assertCondition(
        approxEqual(actualDelta, expectedDelta, options.currencyType === "usd" ? 0.01 : 0.001),
        `${options.gameType} balance delta mismatch`,
        {
            beforeBalance,
            afterBalance,
            actualDelta,
            expectedDelta,
            expectedDeduction,
            currencyType: options.currencyType,
            sam9Mode: options.sam9Mode,
        },
    );

    console.log(`[smoke:sam9-solo-e2e] PASS ${options.gameType} create -> play -> finish (${options.sam9Mode})`);
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

async function cleanup(pool: Pool, challengeIds: string[], userId: string): Promise<void> {
    const allChallengeIds = new Set(challengeIds);
    const { rows: userChallenges } = await pool.query(
        `SELECT id FROM challenges
         WHERE player1_id = $1 OR player2_id = $1 OR player3_id = $1 OR player4_id = $1`,
        [userId],
    );

    for (const row of userChallenges) {
        const challengeId = String(row.id || "");
        if (challengeId) {
            allChallengeIds.add(challengeId);
        }
    }

    const targetChallengeIds = Array.from(allChallengeIds);

    if (targetChallengeIds.length > 0) {
        await safeDelete(pool, "DELETE FROM challenge_chat_messages WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM chess_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM backgammon_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM tarneeb_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM baloot_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM live_game_sessions WHERE challenge_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM challenge_spectators WHERE challenge_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM challenge_gifts WHERE challenge_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM challenge_spectator_bets WHERE challenge_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM challenge_points_ledger WHERE challenge_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM transactions WHERE reference_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM project_currency_ledger WHERE reference_id = ANY($1::text[])", [targetChallengeIds]);
        await safeDelete(pool, "DELETE FROM challenges WHERE id = ANY($1::text[])", [targetChallengeIds]);
    }

    await safeDelete(pool, "DELETE FROM notifications WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM audit_logs WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM active_sessions WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM login_history WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM otp_verifications WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM project_currency_wallets WHERE user_id = $1", [userId]);
    await safeDelete(pool, "DELETE FROM users WHERE id = $1", [userId]);
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv);

    if (!options.databaseUrl) {
        fail("DATABASE_URL is required (use --database-url=... or env DATABASE_URL)");
    }

    const pool = new Pool({ connectionString: options.databaseUrl });
    const wsBaseUrl = toWebSocketBaseUrl(options.baseUrl);
    const runTag = crypto.randomBytes(4).toString("hex");

    const userId = crypto.randomUUID();
    const username = `smoke_sam9_${runTag}`;
    const challengeIds: string[] = [];

    const previousModeSetting = await getGameplaySettingSnapshot(pool, SAM9_MODE_KEY);
    const previousFeeSetting = await getGameplaySettingSnapshot(pool, SAM9_FIXED_FEE_KEY);

    let shouldCleanup = false;

    try {
        await pool.query("SELECT 1");
        shouldCleanup = true;

        await upsertGameplaySetting(pool, SAM9_MODE_KEY, options.sam9Mode, "SAM9 solo mode");
        await upsertGameplaySetting(pool, SAM9_FIXED_FEE_KEY, options.sam9FixedFee.toFixed(2), "SAM9 fixed fee");

        const passwordHash = await bcrypt.hash(options.password, 12);
        await seedUser(pool, userId, username, passwordHash);

        const currencyType = await detectChallengeCurrencyType(pool);
        if (currencyType === "project") {
            await seedProjectWallet(pool, userId);
        }

        const token = await login({
            baseUrl: options.baseUrl,
            username,
            password: options.password,
            timeoutMs: options.timeoutMs,
        });

        const games: GameType[] = ["domino", "backgammon", "tarneeb", "baloot"];
        for (const gameType of games) {
            await runSam9Scenario({
                baseUrl: options.baseUrl,
                wsBaseUrl,
                timeoutMs: options.timeoutMs,
                token,
                pool,
                userId,
                currencyType,
                gameType,
                challengeStake: options.challengeStake,
                sam9Mode: options.sam9Mode,
                sam9FixedFee: options.sam9FixedFee,
                challengeIds,
            });
        }

        console.log("[smoke:sam9-solo-e2e] PASS all SAM9 supported games (domino/backgammon/tarneeb/baloot)");
    } finally {
        await restoreGameplaySetting(pool, previousModeSetting);
        await restoreGameplaySetting(pool, previousFeeSetting);

        if (!options.keepData && shouldCleanup) {
            try {
                await cleanup(pool, challengeIds, userId);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn("[smoke:sam9-solo-e2e] Cleanup warning:", message);
            }
        } else if (options.keepData) {
            console.log("[smoke:sam9-solo-e2e] keep-data enabled, skipping cleanup.");
        }

        await pool.end();
    }
}

main().catch((error: unknown) => {
    if (error instanceof SmokeError) {
        if (error.details !== undefined) {
            console.error("[smoke:sam9-solo-e2e] FAIL", error.message, error.details);
        } else {
            console.error("[smoke:sam9-solo-e2e] FAIL", error.message);
        }
        process.exit(1);
    }

    const details = error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack || ""}`
        : String(error);
    console.error("[smoke:sam9-solo-e2e] FAIL Unexpected error", details);
    process.exit(1);
});
