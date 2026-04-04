#!/usr/bin/env node

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const args = Object.fromEntries(
    process.argv.slice(2)
        .map((item) => item.split("="))
        .filter((pair) => pair.length === 2),
);

const baseUrl = String(args["--base-url"] || process.env.BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const databaseUrl = String(args["--database-url"] || process.env.DATABASE_URL || "");
const password = String(args["--password"] || process.env.SMOKE_PASSWORD || "SmokePass123!");

if (!databaseUrl) {
    console.error("[smoke:withdraw-4p] DATABASE_URL is required");
    process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

function assert(condition, message, details) {
    if (condition) return;
    const suffix = details ? ` | ${JSON.stringify(details)}` : "";
    throw new Error(`${message}${suffix}`);
}

async function requestJson({ method = "GET", path, token, body }) {
    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "smoke-challenge-withdraw-4p/1.0",
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json = null;
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            json = { raw: text };
        }
    }

    return { status: res.status, ok: res.ok, json, text };
}

async function login(username) {
    const res = await requestJson({
        method: "POST",
        path: "/api/auth/login",
        body: { username, password },
    });

    assert(res.status === 200, `login failed for ${username}`, res.json || res.text);
    assert(typeof res.json?.token === "string" && res.json.token.length > 20, `missing token for ${username}`, res.json);
    return res.json.token;
}

async function detectChallengeCurrencyType() {
    const { rows } = await pool.query(
        "SELECT value FROM gameplay_settings WHERE key = 'play_gift_currency_mode' LIMIT 1",
    );

    const mode = String(rows?.[0]?.value || "").toLowerCase();
    return mode === "mixed" ? "usd" : "project";
}

async function seedProjectWallet(userId) {
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

async function safeDelete(sql, values) {
    try {
        await pool.query(sql, values);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("does not exist")) return;
        throw error;
    }
}

const runTag = crypto.randomBytes(4).toString("hex");
const ids = {
    creator: crypto.randomUUID(),
    p2: crypto.randomUUID(),
    p3: crypto.randomUUID(),
    p4: crypto.randomUUID(),
    waitingChallenge: crypto.randomUUID(),
    activeChallenge: crypto.randomUUID(),
};

const usernames = {
    creator: `smoke4p_creator_${runTag}`,
    p2: `smoke4p_p2_${runTag}`,
    p3: `smoke4p_p3_${runTag}`,
    p4: `smoke4p_p4_${runTag}`,
};

async function cleanup() {
    const challengeIds = [ids.waitingChallenge, ids.activeChallenge];
    const userIds = [ids.creator, ids.p2, ids.p3, ids.p4];

    await safeDelete("DELETE FROM challenge_chat_messages WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM live_game_sessions WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_points_ledger WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_gifts WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_spectator_bets WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_spectators WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM transactions WHERE reference_id = ANY($1::text[]) OR user_id = ANY($2::text[])", [challengeIds, userIds]);
    await safeDelete("DELETE FROM challenges WHERE id = ANY($1::text[])", [challengeIds]);

    await safeDelete("DELETE FROM notifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM audit_logs WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM active_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM login_history WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM password_reset_tokens WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM otp_verifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM two_factor_backup_codes WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);
}

async function main() {
    const currencyType = await detectChallengeCurrencyType();
    const passwordHash = await bcrypt.hash(password, 12);

    for (const [key, userId] of Object.entries({ creator: ids.creator, p2: ids.p2, p3: ids.p3, p4: ids.p4 })) {
        await pool.query(
            `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
            [userId, usernames[key], passwordHash],
        );

        if (currencyType === "project") {
            await seedProjectWallet(userId);
        }
    }

    // Waiting 4-player challenge with 3 seated players.
    await pool.query(
        `INSERT INTO challenges (
      id, game_type, bet_amount, currency_type, visibility, status,
      player1_id, player2_id, player3_id, player4_id,
      required_players, current_players, opponent_type
    ) VALUES (
      $1, 'domino', '5.00', $5, 'public', 'waiting',
      $2, $3, $4, NULL,
      4, 3, 'anyone'
    )`,
        [ids.waitingChallenge, ids.creator, ids.p2, ids.p3, currencyType],
    );

    // Active 4-player challenge already started.
    await pool.query(
        `INSERT INTO challenges (
      id, game_type, bet_amount, currency_type, visibility, status,
      player1_id, player2_id, player3_id, player4_id,
      required_players, current_players, opponent_type
    ) VALUES (
      $1, 'domino', '5.00', $6, 'public', 'active',
      $2, $3, $4, $5,
      4, 4, 'anyone'
    )`,
        [ids.activeChallenge, ids.creator, ids.p2, ids.p3, ids.p4, currencyType],
    );

    const creatorToken = await login(usernames.creator);
    const p2Token = await login(usernames.p2);

    const p2LeaveWaiting = await requestJson({
        method: "POST",
        path: `/api/challenges/${ids.waitingChallenge}/withdraw`,
        token: p2Token,
    });
    assert(p2LeaveWaiting.status === 200, "p2 should be able to leave waiting 4p seat", p2LeaveWaiting.json || p2LeaveWaiting.text);

    const waitingAfterLeave = await pool.query(
        `SELECT status, current_players AS "currentPlayers", player2_id AS "player2Id", player3_id AS "player3Id"
     FROM challenges
     WHERE id = $1`,
        [ids.waitingChallenge],
    );
    assert(waitingAfterLeave.rowCount === 1, "missing waiting challenge after p2 leave");
    assert(waitingAfterLeave.rows[0].status === "waiting", "waiting challenge should remain waiting after participant leaves", waitingAfterLeave.rows[0]);
    assert(Number(waitingAfterLeave.rows[0].currentPlayers) === 2, "currentPlayers should decrement to 2", waitingAfterLeave.rows[0]);
    assert(waitingAfterLeave.rows[0].player2Id === null, "player2 seat should be cleared after leave", waitingAfterLeave.rows[0]);

    const creatorCancelWaiting = await requestJson({
        method: "POST",
        path: `/api/challenges/${ids.waitingChallenge}/withdraw`,
        token: creatorToken,
    });
    assert(creatorCancelWaiting.status === 200, "creator should be able to cancel waiting challenge", creatorCancelWaiting.json || creatorCancelWaiting.text);

    const waitingAfterCancel = await pool.query(
        `SELECT status FROM challenges WHERE id = $1`,
        [ids.waitingChallenge],
    );
    assert(waitingAfterCancel.rows[0]?.status === "cancelled", "waiting challenge should be cancelled by creator", waitingAfterCancel.rows[0]);

    const creatorWithdrawActive = await requestJson({
        method: "POST",
        path: `/api/challenges/${ids.activeChallenge}/withdraw`,
        token: creatorToken,
    });
    assert(creatorWithdrawActive.status === 200, "creator withdrawal in active challenge should succeed", creatorWithdrawActive.json || creatorWithdrawActive.text);

    const activeAfterWithdraw = await pool.query(
        `SELECT status FROM challenges WHERE id = $1`,
        [ids.activeChallenge],
    );
    assert(activeAfterWithdraw.rows[0]?.status === "cancelled", "active challenge should be terminated after withdraw flow", activeAfterWithdraw.rows[0]);

    console.log("[smoke:withdraw-4p] PASS all checks");
}

(async () => {
    try {
        await main();
    } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error("[smoke:withdraw-4p] FAIL", message);
        process.exitCode = 1;
    } finally {
        try {
            await cleanup();
        } catch (cleanupError) {
            const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            console.warn("[smoke:withdraw-4p] cleanup warning", message);
        }
        await pool.end();
    }
})();
