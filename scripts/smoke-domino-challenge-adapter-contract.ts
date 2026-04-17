#!/usr/bin/env tsx

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { WebSocket } from "ws";
import { Pool } from "pg";
import {
    adaptDominoBoardMoveToEngine,
    normalizeDominoChallengePlayerView,
    type DominoTile,
} from "../shared/domino-challenge-adapter";
import { createErrorHelpers } from "./lib/smoke-helpers";
import { requestJson as smokeRequestJson } from "./lib/smoke-http";

const SMOKE_USER_AGENT = "smoke-domino-challenge-adapter-contract/1.0";

interface CliOptions {
    baseUrl: string;
    databaseUrl: string;
    password: string;
    timeoutMs: number;
    keepData: boolean;
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
    challengeId: string;
    sessionId: string;
}

interface WsMessage {
    type?: string;
    role?: string;
    errorKey?: string;
    error?: string;
    code?: string;
    view?: Record<string, unknown>;
    [key: string]: unknown;
}

const { fail, assertCondition } = createErrorHelpers("SmokeError");

function parseArgs(argv: string[]): CliOptions {
    const args: CliOptions = {
        baseUrl: process.env.BASE_URL || "http://localhost:3001",
        databaseUrl: process.env.DATABASE_URL || "",
        password: "SmokePass123!",
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
    if (parsed && parsed.type === "batch" && Array.isArray(parsed.messages)) {
        return parsed.messages as WsMessage[];
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
            ws.close(1000, "adapter-contract-smoke-complete");
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
        "legacy ws auth",
    );

    assertCondition(authMessage.type === "auth_success", "WebSocket authentication failed", authMessage);
}

async function joinChallengeAsPlayer(ws: WebSocket, challengeId: string, timeoutMs: number, stepPrefix: string): Promise<WsMessage> {
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
    assertCondition(syncMessage.type === "game_state_sync", `${stepPrefix} failed state sync`, syncMessage);

    return syncMessage;
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
    const userIds = [setupData.userIds.player1, setupData.userIds.player2];

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

function buildAdapterContractState(player1Id: string, player2Id: string): Record<string, unknown> {
    return {
        board: [],
        leftEnd: -1,
        rightEnd: -1,
        hands: {
            [player1Id]: [{ left: 6, right: 6, id: "6-6" }],
            [player2Id]: [{ left: 0, right: 1, id: "0-1" }],
        },
        boneyard: [{ left: 2, right: 3, id: "2-3" }],
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

function runPureAdapterChecks(): void {
    const hand: DominoTile[] = [{ left: 6, right: 5, id: "5-6" }];

    const drawMove = adaptDominoBoardMoveToEngine({
        tileLeft: -1,
        tileRight: -1,
        placedEnd: "left",
        isPassed: false,
    }, hand);
    assertCondition(drawMove.type === "draw", "Adapter draw contract failed", drawMove);

    const passMove = adaptDominoBoardMoveToEngine({
        tileLeft: 0,
        tileRight: 0,
        placedEnd: "left",
        isPassed: true,
    }, hand);
    assertCondition(passMove.type === "pass", "Adapter pass contract failed", passMove);

    const playMove = adaptDominoBoardMoveToEngine({
        tileLeft: 6,
        tileRight: 5,
        placedEnd: "right",
        isPassed: false,
    }, hand);
    assertCondition(playMove.type === "play", "Adapter play contract failed", playMove);
    assertCondition(playMove.type === "play" && playMove.tile.id === "5-6", "Adapter should preserve tile id from hand", playMove);

    const normalized = normalizeDominoChallengePlayerView({
        hand: [{ left: 6, right: 5, id: "5-6" }],
        board: [{ left: 6, right: 6, id: "6-6" }],
        leftEnd: 6,
        rightEnd: 6,
        boneyardCount: 4,
        otherHandCounts: { p2: 3 },
        validMoves: [{ type: "play", tile: { left: 6, right: 5 }, end: "left" }],
        playerOrder: ["p1", "p2"],
    });

    assertCondition(Boolean(normalized), "Normalizer returned undefined for valid playerView");
    assertCondition((normalized?.myHand.length || 0) === 1, "Normalizer should map hand -> myHand", normalized);
    assertCondition((normalized?.boardTiles.length || 0) === 1, "Normalizer should map board -> boardTiles", normalized);
    assertCondition((normalized?.opponentTileCount || 0) === 3, "Normalizer should map otherHandCounts -> opponentTileCount", normalized);

    console.log("[smoke:domino-challenge-adapter-contract] PASS pure adapter mapping");
}

async function runErrorKeyContractScenario(options: {
    baseUrl: string;
    challengeId: string;
    timeoutMs: number;
    player1Token: string;
    player2Token: string;
}): Promise<void> {
    const wsBaseUrl = toWebSocketBaseUrl(options.baseUrl);
    const p1Socket = await connectWebSocket(`${wsBaseUrl}/ws`, options.timeoutMs);
    const p2Socket = await connectWebSocket(`${wsBaseUrl}/ws`, options.timeoutMs);

    try {
        await authenticateSocket(p1Socket, options.player1Token, options.timeoutMs);
        await authenticateSocket(p2Socket, options.player2Token, options.timeoutMs);

        const p1Sync = await joinChallengeAsPlayer(p1Socket, options.challengeId, options.timeoutMs, "adapter-contract p1");
        await joinChallengeAsPlayer(p2Socket, options.challengeId, options.timeoutMs, "adapter-contract p2");

        const handRaw = Array.isArray(p1Sync.view?.hand) ? p1Sync.view?.hand : [];
        const hand = handRaw.filter((value): value is DominoTile => {
            if (!value || typeof value !== "object") return false;
            const tile = value as Partial<DominoTile>;
            return typeof tile.left === "number" && typeof tile.right === "number";
        });

        const cannotDrawMove = adaptDominoBoardMoveToEngine({
            tileLeft: -1,
            tileRight: -1,
            placedEnd: "left",
            isPassed: false,
        }, hand);

        p1Socket.send(JSON.stringify({
            type: "game_move",
            challengeId: options.challengeId,
            move: cannotDrawMove,
        }));

        const cannotDrawError = await waitForWsMessage(
            p1Socket,
            (msg) => msg.type === "move_error" || msg.type === "game_move",
            options.timeoutMs,
            "adapter-contract cannotDraw",
        );

        assertCondition(cannotDrawError.type === "move_error", "Expected move_error for cannotDraw assertion", cannotDrawError);
        assertCondition(cannotDrawError.errorKey === "domino.cannotDraw", "Expected domino.cannotDraw errorKey", cannotDrawError);

        const tileNotInHandMove = adaptDominoBoardMoveToEngine({
            tileLeft: 7,
            tileRight: 7,
            placedEnd: "left",
            isPassed: false,
        }, hand);

        p1Socket.send(JSON.stringify({
            type: "game_move",
            challengeId: options.challengeId,
            move: tileNotInHandMove,
        }));

        const tileNotInHandError = await waitForWsMessage(
            p1Socket,
            (msg) => msg.type === "move_error" || msg.type === "game_move",
            options.timeoutMs,
            "adapter-contract tileNotInHand",
        );

        assertCondition(tileNotInHandError.type === "move_error", "Expected move_error for tileNotInHand assertion", tileNotInHandError);
        assertCondition(tileNotInHandError.errorKey === "domino.tileNotInHand", "Expected domino.tileNotInHand errorKey", tileNotInHandError);

        p1Socket.send(JSON.stringify({
            type: "game_move",
            challengeId: options.challengeId,
            move: { type: "invalid_type" },
        }));

        const invalidMoveTypeError = await waitForWsMessage(
            p1Socket,
            (msg) => msg.type === "move_error" || msg.type === "game_move",
            options.timeoutMs,
            "adapter-contract invalidMoveType",
        );

        assertCondition(invalidMoveTypeError.type === "move_error", "Expected move_error for invalidMoveType assertion", invalidMoveTypeError);
        assertCondition(invalidMoveTypeError.errorKey === "domino.invalidMoveType", "Expected domino.invalidMoveType errorKey", invalidMoveTypeError);

        console.log("[smoke:domino-challenge-adapter-contract] PASS move_error key assertions");
    } finally {
        await closeSocket(p1Socket, options.timeoutMs);
        await closeSocket(p2Socket, options.timeoutMs);
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv);
    if (!options.databaseUrl) {
        fail("DATABASE_URL is required (use --database-url=... or set env)");
    }

    runPureAdapterChecks();

    const pool = new Pool({ connectionString: options.databaseUrl });
    const runTag = crypto.randomBytes(4).toString("hex");
    const setupData: SetupData = {
        userIds: {
            player1: crypto.randomUUID(),
            player2: crypto.randomUUID(),
        },
        usernames: {
            player1: `smoke_domino_adapter_p1_${runTag}`,
            player2: `smoke_domino_adapter_p2_${runTag}`,
        },
        challengeId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
    };

    let shouldCleanup = false;

    try {
        await pool.query("SELECT 1");
        shouldCleanup = true;

        const passwordHash = await bcrypt.hash(options.password, 12);

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
                JSON.stringify(buildAdapterContractState(setupData.userIds.player1, setupData.userIds.player2)),
            ],
        );

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

        await runErrorKeyContractScenario({
            baseUrl: options.baseUrl,
            challengeId: setupData.challengeId,
            timeoutMs: options.timeoutMs,
            player1Token,
            player2Token,
        });

        console.log("[smoke:domino-challenge-adapter-contract] All checks passed.");
    } finally {
        if (shouldCleanup && !options.keepData) {
            await cleanup(pool, setupData);
        }
        await pool.end();
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const details =
        typeof error === "object" &&
            error !== null &&
            "details" in error
            ? (error as { details?: unknown }).details
            : error;
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[smoke:domino-challenge-adapter-contract] FAIL", message, details ?? "", stack ?? "");
    process.exit(1);
});
