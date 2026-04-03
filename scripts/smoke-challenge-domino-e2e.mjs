#!/usr/bin/env node

// @ts-nocheck

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { WebSocket } from "ws";
import { Pool } from "pg";

const SMOKE_USER_AGENT = "smoke-challenge-domino-e2e/1.0";

function parseArgs(argv) {
    const args = {
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

class SmokeError extends Error {
    constructor(message, details) {
        super(message);
        this.name = "SmokeError";
        this.details = details;
    }
}

function fail(message, details) {
    throw new SmokeError(message, details);
}

function assertCondition(condition, message, details) {
    if (!condition) {
        fail(message, details);
    }
}

function toWebSocketBaseUrl(baseUrl) {
    if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
    if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
    if (baseUrl.startsWith("ws://") || baseUrl.startsWith("wss://")) return baseUrl;
    return `ws://${baseUrl}`;
}

function parseWsPayload(raw) {
    try {
        return JSON.parse(raw.toString());
    } catch {
        return null;
    }
}

function expandWsMessages(parsed) {
    if (parsed && parsed.type === "batch" && Array.isArray(parsed.messages)) {
        return parsed.messages;
    }
    return [parsed];
}

async function requestJson({ baseUrl, path, method = "GET", body, timeoutMs }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": SMOKE_USER_AGENT,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        const text = await response.text();
        let json = null;
        if (text) {
            try {
                json = JSON.parse(text);
            } catch {
                json = { raw: text };
            }
        }

        return { ok: response.ok, status: response.status, json, text };
    } finally {
        clearTimeout(timeout);
    }
}

async function login({ baseUrl, username, password, timeoutMs }) {
    const response = await requestJson({
        baseUrl,
        path: "/api/auth/login",
        method: "POST",
        body: { username, password },
        timeoutMs,
    });

    assertCondition(response.status === 200, "Login failed", { username, response: response.json || response.text });
    const token = response.json?.token;
    assertCondition(typeof token === "string" && token.length > 20, "Login token missing", response.json);
    return token;
}

function connectWebSocket(url, timeoutMs) {
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

        const onError = (error) => {
            cleanup();
            reject(new SmokeError(`WebSocket error while connecting: ${url}`, error instanceof Error ? error.message : String(error)));
        };

        const onClose = (code, reason) => {
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

function waitForWsMessage(ws, predicate, timeoutMs, stepName) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new SmokeError(`${stepName}: timed out waiting for websocket message`));
        }, timeoutMs);

        const onMessage = (raw) => {
            const parsed = parseWsPayload(raw);
            if (!parsed) return;

            const messages = expandWsMessages(parsed);
            for (const msg of messages) {
                if (predicate(msg)) {
                    cleanup();
                    resolve(msg);
                    return;
                }
            }
        };

        const onClose = (code, reason) => {
            cleanup();
            reject(new SmokeError(`${stepName}: websocket closed`, { code, reason: reason.toString() }));
        };

        const onError = (error) => {
            cleanup();
            reject(new SmokeError(`${stepName}: websocket error`, error instanceof Error ? error.message : String(error)));
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

async function closeSocket(ws, timeoutMs) {
    if (!ws || ws.readyState === WebSocket.CLOSED) return;

    await new Promise((resolve) => {
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
            ws.close(1000, "smoke-complete");
        } else {
            ws.terminate();
        }
    });
}

async function authenticateSocket(ws, token, timeoutMs) {
    ws.send(JSON.stringify({ type: "auth", token }));
    const authMessage = await waitForWsMessage(
        ws,
        (msg) => msg?.type === "auth_success" || msg?.type === "auth_error",
        timeoutMs,
        "legacy ws auth",
    );

    assertCondition(authMessage?.type === "auth_success", "WebSocket authentication failed", authMessage);
}

async function safeDelete(pool, sqlText, values) {
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

async function cleanup(pool, setupData) {
    const challengeIds = Object.values(setupData.challengeIds);
    const userIds = Object.values(setupData.userIds);

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

function buildDrawPassState(player1Id, player2Id) {
    return {
        board: [{ left: 6, right: 6, id: "6-6" }],
        leftEnd: 6,
        rightEnd: 6,
        hands: {
            [player1Id]: [{ left: 0, right: 1, id: "0-1" }],
            [player2Id]: [{ left: 2, right: 2, id: "2-2" }],
        },
        boneyard: [{ left: 3, right: 4, id: "3-4" }],
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

function buildEndgameState(player1Id, player2Id) {
    return {
        board: [{ left: 6, right: 6, id: "6-6" }],
        leftEnd: 6,
        rightEnd: 6,
        hands: {
            [player1Id]: [{ left: 6, right: 5, id: "5-6" }],
            [player2Id]: [{ left: 0, right: 0, id: "0-0" }],
        },
        boneyard: [],
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

async function joinChallengeAsPlayer(ws, challengeId, timeoutMs, stepPrefix) {
    ws.send(JSON.stringify({ type: "join_challenge_game", challengeId }));

    const roleMessage = await waitForWsMessage(
        ws,
        (msg) => msg?.type === "role_assigned" || msg?.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} role_assigned`,
    );
    assertCondition(roleMessage?.type === "role_assigned" && roleMessage?.role === "player", `${stepPrefix} failed role assignment`, roleMessage);

    const syncMessage = await waitForWsMessage(
        ws,
        (msg) => msg?.type === "game_state_sync" || msg?.type === "challenge_error",
        timeoutMs,
        `${stepPrefix} game_state_sync`,
    );
    assertCondition(syncMessage?.type === "game_state_sync", `${stepPrefix} failed state sync`, syncMessage);

    return syncMessage;
}

async function runDrawPassScenario({ wsBaseUrl, timeoutMs, challengeId, player1Token, player2Token, player1Id, player2Id }) {
    const p1Socket = await connectWebSocket(`${wsBaseUrl}/ws`, timeoutMs);
    const p2Socket = await connectWebSocket(`${wsBaseUrl}/ws`, timeoutMs);

    try {
        await authenticateSocket(p1Socket, player1Token, timeoutMs);
        await authenticateSocket(p2Socket, player2Token, timeoutMs);

        await joinChallengeAsPlayer(p1Socket, challengeId, timeoutMs, "draw-pass p1");
        await joinChallengeAsPlayer(p2Socket, challengeId, timeoutMs, "draw-pass p2");

        p1Socket.send(JSON.stringify({
            type: "game_move",
            challengeId,
            move: { type: "draw" },
        }));

        const drawAck = await waitForWsMessage(
            p1Socket,
            (msg) => msg?.type === "game_move" || msg?.type === "move_error",
            timeoutMs,
            "draw-pass draw ack",
        );
        assertCondition(drawAck?.type === "game_move", "Draw move rejected", drawAck);
        assertCondition(String(drawAck?.view?.lastAction?.type || "") === "draw", "Expected draw lastAction", drawAck);

        p1Socket.send(JSON.stringify({
            type: "game_move",
            challengeId,
            move: { type: "pass" },
        }));

        const passAck = await waitForWsMessage(
            p1Socket,
            (msg) => msg?.type === "game_move" || msg?.type === "move_error",
            timeoutMs,
            "draw-pass pass ack",
        );
        assertCondition(passAck?.type === "game_move", "Pass move rejected", passAck);
        assertCondition(String(passAck?.view?.lastAction?.type || "") === "pass", "Expected pass lastAction", passAck);
        assertCondition(String(passAck?.session?.currentTurn || "") === player2Id, "Expected turn to pass to player2", passAck?.session);

        console.log("[smoke:challenge-domino-e2e] PASS draw -> pass flow");
    } finally {
        await closeSocket(p1Socket, timeoutMs);
        await closeSocket(p2Socket, timeoutMs);
    }
}

async function runEndScenario({ wsBaseUrl, timeoutMs, challengeId, player1Token, player2Token, player1Id }) {
    const p1Socket = await connectWebSocket(`${wsBaseUrl}/ws`, timeoutMs);
    const p2Socket = await connectWebSocket(`${wsBaseUrl}/ws`, timeoutMs);

    try {
        await authenticateSocket(p1Socket, player1Token, timeoutMs);
        await authenticateSocket(p2Socket, player2Token, timeoutMs);

        const p1Sync = await joinChallengeAsPlayer(p1Socket, challengeId, timeoutMs, "endgame p1");
        await joinChallengeAsPlayer(p2Socket, challengeId, timeoutMs, "endgame p2");

        const validMoves = Array.isArray(p1Sync?.view?.validMoves) ? p1Sync.view.validMoves : [];
        const playMove = validMoves.find((move) => move?.type === "play") || { type: "play", tile: { left: 6, right: 5, id: "5-6" }, end: "left" };

        p1Socket.send(JSON.stringify({
            type: "game_move",
            challengeId,
            move: playMove,
        }));

        const endMessage = await waitForWsMessage(
            p1Socket,
            (msg) => msg?.type === "game_ended" || msg?.type === "move_error",
            timeoutMs,
            "endgame resolution",
        );

        assertCondition(endMessage?.type === "game_ended", "Expected game_ended after final play", endMessage);
        assertCondition(String(endMessage?.winnerId || "") === player1Id, "Unexpected winner in game_ended", endMessage);

        console.log("[smoke:challenge-domino-e2e] PASS play -> end flow");
    } finally {
        await closeSocket(p1Socket, timeoutMs);
        await closeSocket(p2Socket, timeoutMs);
    }
}

async function main() {
    const options = parseArgs(process.argv);
    if (!options.databaseUrl) {
        fail("DATABASE_URL is required (use --database-url=... or set env)");
    }

    const pool = new Pool({ connectionString: options.databaseUrl });
    const runTag = crypto.randomBytes(4).toString("hex");

    const setupData = {
        userIds: {
            player1: crypto.randomUUID(),
            player2: crypto.randomUUID(),
        },
        usernames: {
            player1: `smoke_domino_p1_${runTag}`,
            player2: `smoke_domino_p2_${runTag}`,
        },
        challengeIds: {
            drawPass: crypto.randomUUID(),
            endgame: crypto.randomUUID(),
        },
        sessionIds: {
            drawPass: crypto.randomUUID(),
            endgame: crypto.randomUUID(),
        },
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
            [setupData.challengeIds.drawPass, setupData.userIds.player1, setupData.userIds.player2],
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
            [setupData.challengeIds.endgame, setupData.userIds.player1, setupData.userIds.player2],
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
                setupData.sessionIds.drawPass,
                setupData.challengeIds.drawPass,
                setupData.userIds.player1,
                JSON.stringify(buildDrawPassState(setupData.userIds.player1, setupData.userIds.player2)),
            ],
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
                setupData.sessionIds.endgame,
                setupData.challengeIds.endgame,
                setupData.userIds.player1,
                JSON.stringify(buildEndgameState(setupData.userIds.player1, setupData.userIds.player2)),
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

        const wsBaseUrl = toWebSocketBaseUrl(options.baseUrl);

        await runDrawPassScenario({
            wsBaseUrl,
            timeoutMs: options.timeoutMs,
            challengeId: setupData.challengeIds.drawPass,
            player1Token,
            player2Token,
            player1Id: setupData.userIds.player1,
            player2Id: setupData.userIds.player2,
        });

        await runEndScenario({
            wsBaseUrl,
            timeoutMs: options.timeoutMs,
            challengeId: setupData.challengeIds.endgame,
            player1Token,
            player2Token,
            player1Id: setupData.userIds.player1,
        });

        console.log("[smoke:challenge-domino-e2e] All checks passed.");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const details = error instanceof SmokeError ? error.details : undefined;
        console.error("[smoke:challenge-domino-e2e] FAIL", message, details ?? "");
        process.exitCode = 1;
    } finally {
        if (shouldCleanup && !options.keepData) {
            try {
                await cleanup(pool, setupData);
            } catch (cleanupError) {
                const msg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                console.error("[smoke:challenge-domino-e2e] cleanup failed", msg);
            }
        }

        await pool.end();
    }
}

main();
