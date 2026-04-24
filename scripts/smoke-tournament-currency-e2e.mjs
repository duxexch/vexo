#!/usr/bin/env node

/**
 * Tournament currency end-to-end smoke test.
 *
 * Validates that the tournament lifecycle correctly branches every payment
 * path on the persisted `tournaments.currency` flag (`usd` vs `project`/VXC):
 *   - Entry fee deduction (transactions vs project_currency_ledger)
 *   - Prize payout settlement (`win` tx vs `game_win` ledger entry)
 *   - Refunds on admin cancel / player withdraw / admin delete
 *   - Localized notification text via formatTournamentAmountText
 *
 * Run against a live dev server:
 *   DATABASE_URL=... node scripts/smoke-tournament-currency-e2e.mjs
 */

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
    console.error("[smoke:tournament-currency] DATABASE_URL is required");
    process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const runTag = crypto.randomBytes(4).toString("hex");

const ENTRY_FEE = 10;
const STARTING_BALANCE = 100;

const checks = [];
function pass(label) { checks.push({ label, ok: true }); console.log(`  ✓ ${label}`); }
function fail(label, details) {
    const suffix = details === undefined ? "" : ` | ${typeof details === "string" ? details : JSON.stringify(details)}`;
    checks.push({ label, ok: false, details });
    throw new Error(`${label}${suffix}`);
}
function assert(condition, label, details) {
    if (condition) { pass(label); return; }
    fail(label, details);
}

async function requestJson({ method = "GET", path, token, body }) {
    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "smoke-tournament-currency/1.0",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json = null;
    if (text) {
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
    }
    return { status: res.status, ok: res.ok, json, text };
}

async function login(username) {
    const res = await requestJson({
        method: "POST",
        path: "/api/auth/login",
        body: { username, password },
    });
    if (res.status !== 200 || typeof res.json?.token !== "string") {
        throw new Error(`login failed for ${username}: ${res.text}`);
    }
    return res.json.token;
}

async function adminLogin(username) {
    const res = await requestJson({
        method: "POST",
        path: "/api/admin/login",
        body: { username, password },
    });
    if (res.status !== 200 || typeof res.json?.token !== "string") {
        throw new Error(`admin login failed for ${username}: ${res.text}`);
    }
    return res.json.token;
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

const adminId = crypto.randomUUID();
const adminUsername = `tcsmoke_admin_${runTag}`;
const tournamentIds = [];
const playerIds = [];
const playerUsernames = [];

function makePlayer(label) {
    const id = crypto.randomUUID();
    const username = `tcsmoke_${label}_${runTag}`;
    playerIds.push(id);
    playerUsernames.push(username);
    return { id, username };
}

async function seedUserBalance(userId, currency) {
    if (currency === "project") {
        await pool.query(
            `INSERT INTO project_currency_wallets (
        user_id, purchased_balance, earned_balance, total_balance,
        total_converted, total_spent, total_earned, locked_balance
      ) VALUES ($1, '0.00', $2, $2, '0.00', '0.00', $2, '0.00')
      ON CONFLICT (user_id) DO UPDATE SET
        earned_balance = EXCLUDED.earned_balance,
        total_balance  = EXCLUDED.total_balance,
        total_earned   = EXCLUDED.total_earned`,
            [userId, STARTING_BALANCE.toFixed(2)],
        );
    }
}

async function createUser({ id, username, role = "player" }) {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance, username_selected_at)
     VALUES ($1, $2, $3, $4, 'active', 'username', $5, NOW())`,
        [id, username, passwordHash, role, STARTING_BALANCE.toFixed(2)],
    );
}

async function createTournament(adminToken, { name, currency }) {
    const payload = {
        name,
        nameAr: `${name} (AR)`,
        gameType: "domino",
        format: "single_elimination",
        minPlayers: 2,
        maxPlayers: 2,
        entryFee: ENTRY_FEE.toFixed(2),
        prizePool: "0.00",
        currency,
        prizeDistributionMethod: "winner_take_all",
        autoStartOnFull: false,
        isPublished: true,
    };
    const res = await requestJson({
        method: "POST",
        path: "/api/admin/tournaments",
        token: adminToken,
        body: payload,
    });
    if (res.status !== 200 || !res.json?.id) {
        throw new Error(`tournament create failed (${name}): ${res.text}`);
    }
    tournamentIds.push(res.json.id);
    return res.json;
}

async function getUsdBalance(userId) {
    const { rows } = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);
    return Number.parseFloat(rows[0]?.balance || "0");
}

async function getProjectBalances(userId) {
    const { rows } = await pool.query(
        `SELECT earned_balance AS earned, purchased_balance AS purchased, total_balance AS total, total_earned AS lifetime_earned, total_spent AS lifetime_spent
     FROM project_currency_wallets WHERE user_id = $1`,
        [userId],
    );
    if (!rows.length) return { earned: 0, purchased: 0, total: 0, lifetime_earned: 0, lifetime_spent: 0 };
    return {
        earned: Number.parseFloat(rows[0].earned),
        purchased: Number.parseFloat(rows[0].purchased),
        total: Number.parseFloat(rows[0].total),
        lifetime_earned: Number.parseFloat(rows[0].lifetime_earned),
        lifetime_spent: Number.parseFloat(rows[0].lifetime_spent),
    };
}

async function findTransaction(userId, type, referenceId) {
    const { rows } = await pool.query(
        `SELECT type, status, amount, balance_before AS "balanceBefore", balance_after AS "balanceAfter", description
     FROM transactions WHERE user_id = $1 AND type = $2 AND reference_id = $3`,
        [userId, type, referenceId],
    );
    return rows[0] || null;
}

async function findLedger(userId, type, referenceId) {
    const { rows } = await pool.query(
        `SELECT type, amount, balance_before AS "balanceBefore", balance_after AS "balanceAfter", reference_type AS "referenceType", description
     FROM project_currency_ledger WHERE user_id = $1 AND type = $2 AND reference_id = $3`,
        [userId, type, referenceId],
    );
    return rows[0] || null;
}

async function findNotification(userId, action) {
    const { rows } = await pool.query(
        `SELECT title, title_ar AS "titleAr", message, message_ar AS "messageAr", metadata
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
        [userId],
    );
    return rows.find((row) => {
        if (!row.metadata) return false;
        try {
            const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
            return meta?.action === action;
        } catch {
            return false;
        }
    }) || null;
}

async function startTournament(adminToken, id) {
    const res = await requestJson({
        method: "POST",
        path: `/api/admin/tournaments/${id}/start`,
        token: adminToken,
    });
    if (res.status !== 200) throw new Error(`start failed for ${id}: ${res.text}`);
    return res.json;
}

async function reportFinalMatchResult(adminToken, tournamentId, winnerId) {
    const { rows } = await pool.query(
        `SELECT id, player1_id AS "player1Id", player2_id AS "player2Id"
     FROM tournament_matches WHERE tournament_id = $1 AND round = 1 AND match_number = 1`,
        [tournamentId],
    );
    if (!rows.length) throw new Error(`no match found for ${tournamentId}`);
    const match = rows[0];
    const res = await requestJson({
        method: "POST",
        path: `/api/admin/tournaments/matches/${match.id}/result`,
        token: adminToken,
        body: { winnerId, player1Score: winnerId === match.player1Id ? 3 : 1, player2Score: winnerId === match.player2Id ? 3 : 1 },
    });
    if (res.status !== 200) throw new Error(`match result failed: ${res.text}`);
    return res.json;
}

async function registerPlayer(playerToken, tournamentId) {
    const res = await requestJson({
        method: "POST",
        path: `/api/tournaments/${tournamentId}/register`,
        token: playerToken,
    });
    if (res.status !== 200) throw new Error(`register failed (${tournamentId}): ${res.text}`);
    return res.json;
}

async function withdrawPlayer(playerToken, tournamentId) {
    const res = await requestJson({
        method: "DELETE",
        path: `/api/tournaments/${tournamentId}/register`,
        token: playerToken,
    });
    if (res.status !== 200) throw new Error(`withdraw failed (${tournamentId}): ${res.text}`);
    return res.json;
}

async function adminSetStatus(adminToken, tournamentId, status) {
    const res = await requestJson({
        method: "PUT",
        path: `/api/admin/tournaments/${tournamentId}/status`,
        token: adminToken,
        body: { status },
    });
    if (res.status !== 200) throw new Error(`status->${status} failed (${tournamentId}): ${res.text}`);
    return res.json;
}

async function adminDelete(adminToken, tournamentId) {
    const res = await requestJson({
        method: "DELETE",
        path: `/api/admin/tournaments/${tournamentId}`,
        token: adminToken,
    });
    if (res.status !== 200) throw new Error(`delete failed (${tournamentId}): ${res.text}`);
    return res.json;
}

function approxEqual(a, b) { return Math.abs(a - b) < 0.005; }

async function cleanup() {
    const userIds = [adminId, ...playerIds];
    if (tournamentIds.length) {
        await safeDelete(`DELETE FROM tournament_matches WHERE tournament_id = ANY($1::text[])`, [tournamentIds]);
        await safeDelete(`DELETE FROM tournament_participants WHERE tournament_id = ANY($1::text[])`, [tournamentIds]);
        await safeDelete(`DELETE FROM tournaments WHERE id = ANY($1::text[])`, [tournamentIds]);
    }
    await safeDelete(`DELETE FROM project_currency_ledger WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM transactions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM notifications WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM admin_audit_logs WHERE admin_id = $1`, [adminId]);
    await safeDelete(`DELETE FROM audit_logs WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM active_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM user_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM login_history WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
}

async function main() {
    console.log(`\n[smoke:tournament-currency] runTag=${runTag} baseUrl=${baseUrl}`);

    // ---- Provision admin + players ----
    await createUser({ id: adminId, username: adminUsername, role: "admin" });

    const usdSettleA = makePlayer("usdSettleA");
    const usdSettleB = makePlayer("usdSettleB");
    const vxcSettleA = makePlayer("vxcSettleA");
    const vxcSettleB = makePlayer("vxcSettleB");
    const usdCancelA = makePlayer("usdCancelA");
    const usdCancelB = makePlayer("usdCancelB");
    const vxcCancelA = makePlayer("vxcCancelA");
    const vxcCancelB = makePlayer("vxcCancelB");
    const usdWithdraw = makePlayer("usdWithdraw");
    const vxcDelete = makePlayer("vxcDelete");

    const allPlayers = [
        usdSettleA, usdSettleB, vxcSettleA, vxcSettleB,
        usdCancelA, usdCancelB, vxcCancelA, vxcCancelB,
        usdWithdraw, vxcDelete,
    ];

    for (const p of allPlayers) {
        await createUser({ id: p.id, username: p.username });
    }
    for (const p of [vxcSettleA, vxcSettleB, vxcCancelA, vxcCancelB, vxcDelete]) {
        await seedUserBalance(p.id, "project");
    }

    const adminToken = await adminLogin(adminUsername);
    pass("admin login succeeded");

    const tokenCache = new Map();
    async function tokenFor(p) {
        if (!tokenCache.has(p.id)) tokenCache.set(p.id, await login(p.username));
        return tokenCache.get(p.id);
    }

    // ---- 1) USD tournament: full lifecycle with prize settlement ----
    console.log("\n--- USD tournament: register → start → settle ---");
    const usdT = await createTournament(adminToken, { name: `USD T ${runTag}`, currency: "usd" });
    {
        const beforeA = await getUsdBalance(usdSettleA.id);
        const beforeB = await getUsdBalance(usdSettleB.id);
        await registerPlayer(await tokenFor(usdSettleA), usdT.id);
        await registerPlayer(await tokenFor(usdSettleB), usdT.id);

        const afterA = await getUsdBalance(usdSettleA.id);
        const afterB = await getUsdBalance(usdSettleB.id);
        assert(approxEqual(afterA, beforeA - ENTRY_FEE), "USD entry: player A debited", { beforeA, afterA });
        assert(approxEqual(afterB, beforeB - ENTRY_FEE), "USD entry: player B debited", { beforeB, afterB });

        const stakeA = await findTransaction(usdSettleA.id, "stake", `tournament-entry:${usdT.id}:${usdSettleA.id}`);
        assert(stakeA && stakeA.status === "completed" && approxEqual(Number(stakeA.amount), ENTRY_FEE),
            "USD entry: tx_internal stake row exists for player A", stakeA);

        const wallet = await getProjectBalances(usdSettleA.id);
        assert(wallet.lifetime_spent === 0, "USD entry: project wallet untouched for USD tournament", wallet);

        await startTournament(adminToken, usdT.id);
        await reportFinalMatchResult(adminToken, usdT.id, usdSettleA.id);

        const tRow = (await pool.query(`SELECT status, prizes_settled_at AS "prizesSettledAt", winner_id AS "winnerId", prize_pool AS "prizePool" FROM tournaments WHERE id = $1`, [usdT.id])).rows[0];
        assert(tRow.status === "completed", "USD: tournament marked completed", tRow);
        assert(tRow.winnerId === usdSettleA.id, "USD: winner recorded correctly", tRow);
        assert(tRow.prizesSettledAt !== null, "USD: prizes_settled_at populated", tRow);

        const totalPool = ENTRY_FEE * 2;
        const winnerAfter = await getUsdBalance(usdSettleA.id);
        assert(approxEqual(winnerAfter, beforeA - ENTRY_FEE + totalPool),
            "USD: winner credited full prize pool (winner_take_all)", { beforeA, winnerAfter, totalPool });

        const winTx = await findTransaction(usdSettleA.id, "win", `tournament-prize:${usdT.id}:${usdSettleA.id}:1`);
        assert(winTx && approxEqual(Number(winTx.amount), totalPool),
            "USD: tx_internal win row written for winner", winTx);

        const noVxcLedger = await findLedger(usdSettleA.id, "game_win", `tournament-prize:${usdT.id}:${usdSettleA.id}:1`);
        assert(noVxcLedger === null, "USD: no VXC ledger written for USD tournament", noVxcLedger);
    }

    // ---- 2) VXC tournament: full lifecycle with prize settlement ----
    console.log("\n--- VXC tournament: register → start → settle ---");
    const vxcT = await createTournament(adminToken, { name: `VXC T ${runTag}`, currency: "project" });
    {
        const usdBeforeA = await getUsdBalance(vxcSettleA.id);
        const beforeA = await getProjectBalances(vxcSettleA.id);
        const beforeB = await getProjectBalances(vxcSettleB.id);

        await registerPlayer(await tokenFor(vxcSettleA), vxcT.id);
        await registerPlayer(await tokenFor(vxcSettleB), vxcT.id);

        const afterA = await getProjectBalances(vxcSettleA.id);
        const afterB = await getProjectBalances(vxcSettleB.id);
        assert(approxEqual(afterA.total, beforeA.total - ENTRY_FEE), "VXC entry: project total debited (A)", { beforeA, afterA });
        assert(approxEqual(afterB.total, beforeB.total - ENTRY_FEE), "VXC entry: project total debited (B)", { beforeB, afterB });
        assert(approxEqual(afterA.lifetime_spent, beforeA.lifetime_spent + ENTRY_FEE), "VXC entry: total_spent incremented", afterA);

        const stakeLedger = await findLedger(vxcSettleA.id, "game_stake", `tournament-entry:${vxcT.id}:${vxcSettleA.id}`);
        assert(stakeLedger && approxEqual(Number(stakeLedger.amount), -ENTRY_FEE) && stakeLedger.referenceType === "tournament_entry",
            "VXC entry: project_currency_ledger game_stake row exists for player A", stakeLedger);

        const usdAfter = await getUsdBalance(vxcSettleA.id);
        assert(approxEqual(usdAfter, usdBeforeA), "VXC entry: cash USD balance untouched", { usdBeforeA, usdAfter });

        await startTournament(adminToken, vxcT.id);
        await reportFinalMatchResult(adminToken, vxcT.id, vxcSettleA.id);

        const tRow = (await pool.query(`SELECT status, prizes_settled_at AS "prizesSettledAt", winner_id AS "winnerId" FROM tournaments WHERE id = $1`, [vxcT.id])).rows[0];
        assert(tRow.status === "completed" && tRow.winnerId === vxcSettleA.id && tRow.prizesSettledAt !== null,
            "VXC: tournament completed + winner + settled flag", tRow);

        const totalPool = ENTRY_FEE * 2;
        const winnerWallet = await getProjectBalances(vxcSettleA.id);
        assert(approxEqual(winnerWallet.total, afterA.total + totalPool), "VXC: winner total_balance credited", winnerWallet);
        assert(approxEqual(winnerWallet.earned, afterA.earned + totalPool), "VXC: winner earned_balance credited", winnerWallet);
        assert(approxEqual(winnerWallet.lifetime_earned, afterA.lifetime_earned + totalPool), "VXC: winner total_earned incremented", winnerWallet);

        const winLedger = await findLedger(vxcSettleA.id, "game_win", `tournament-prize:${vxcT.id}:${vxcSettleA.id}:1`);
        assert(winLedger && approxEqual(Number(winLedger.amount), totalPool) && winLedger.referenceType === "tournament_prize",
            "VXC: project_currency_ledger game_win row written", winLedger);

        const noUsdTx = await findTransaction(vxcSettleA.id, "win", `tournament-prize:${vxcT.id}:${vxcSettleA.id}:1`);
        assert(noUsdTx === null, "VXC: no tx_internal win row written for VXC tournament", noUsdTx);
    }

    // ---- 3) USD tournament: cancel with registered players → refund ----
    console.log("\n--- USD tournament: cancel with players → refund ---");
    const usdCancelT = await createTournament(adminToken, { name: `USD Cancel ${runTag}`, currency: "usd" });
    {
        const beforeA = await getUsdBalance(usdCancelA.id);
        const beforeB = await getUsdBalance(usdCancelB.id);
        await registerPlayer(await tokenFor(usdCancelA), usdCancelT.id);
        await registerPlayer(await tokenFor(usdCancelB), usdCancelT.id);

        const cancelResp = await adminSetStatus(adminToken, usdCancelT.id, "cancelled");
        assert(cancelResp.refunded === true && cancelResp.refundedCount === 2, "USD cancel: refund summary returned", cancelResp);

        const afterA = await getUsdBalance(usdCancelA.id);
        const afterB = await getUsdBalance(usdCancelB.id);
        assert(approxEqual(afterA, beforeA), "USD cancel: player A USD balance restored", { beforeA, afterA });
        assert(approxEqual(afterB, beforeB), "USD cancel: player B USD balance restored", { beforeB, afterB });

        const refundA = await findTransaction(usdCancelA.id, "refund", `tournament-cancel-refund:${usdCancelT.id}:${usdCancelA.id}`);
        assert(refundA && approxEqual(Number(refundA.amount), ENTRY_FEE) && refundA.status === "completed",
            "USD cancel: tx_internal refund row exists", refundA);

        // Confirm localized notification text uses formatTournamentAmountText -> "$10.00"
        await new Promise((r) => setTimeout(r, 200)); // allow async sendNotification to flush
        const notif = await findNotification(usdCancelA.id, "tournament_cancelled_refund");
        assert(notif && notif.message.includes("$10.00"), "USD cancel: notification renders $ amount", notif);
        assert(notif && notif.messageAr.includes("$10.00"), "USD cancel: AR notification renders $ amount", notif);

        // Tournaments listing/detail must surface userRefund so the UI can show the refund banner
        const playerToken = await tokenFor(usdCancelA);
        const detailResp = await requestJson({ path: `/api/tournaments/${usdCancelT.id}`, token: playerToken });
        assert(
            detailResp.status === 200 &&
                detailResp.json?.userRefund &&
                approxEqual(Number(detailResp.json.userRefund.amount), ENTRY_FEE) &&
                detailResp.json.userRefund.currency === "usd" &&
                detailResp.json.userRefund.reason === "cancelled",
            "USD cancel: GET /api/tournaments/:id returns userRefund for player",
            detailResp.json?.userRefund,
        );
        const listResp = await requestJson({ path: "/api/tournaments?status=cancelled", token: playerToken });
        const listed = Array.isArray(listResp.json)
            ? listResp.json.find((t) => t.id === usdCancelT.id)
            : null;
        assert(
            listed &&
                listed.userRefund &&
                approxEqual(Number(listed.userRefund.amount), ENTRY_FEE) &&
                listed.userRefund.currency === "usd" &&
                listed.userRefund.reason === "cancelled",
            "USD cancel: GET /api/tournaments returns userRefund for player",
            listed?.userRefund,
        );
    }

    // ---- 4) VXC tournament: cancel with registered players → refund ----
    console.log("\n--- VXC tournament: cancel with players → refund ---");
    const vxcCancelT = await createTournament(adminToken, { name: `VXC Cancel ${runTag}`, currency: "project" });
    {
        const beforeA = await getProjectBalances(vxcCancelA.id);
        const beforeB = await getProjectBalances(vxcCancelB.id);

        await registerPlayer(await tokenFor(vxcCancelA), vxcCancelT.id);
        await registerPlayer(await tokenFor(vxcCancelB), vxcCancelT.id);

        const cancelResp = await adminSetStatus(adminToken, vxcCancelT.id, "cancelled");
        assert(cancelResp.refunded === true && cancelResp.refundedCount === 2, "VXC cancel: refund summary returned", cancelResp);

        const afterA = await getProjectBalances(vxcCancelA.id);
        const afterB = await getProjectBalances(vxcCancelB.id);
        assert(approxEqual(afterA.total, beforeA.total), "VXC cancel: player A total balance restored", { beforeA, afterA });
        assert(approxEqual(afterB.total, beforeB.total), "VXC cancel: player B total balance restored", { beforeB, afterB });

        const refundLedger = await findLedger(vxcCancelA.id, "refund", `tournament-cancel-refund:${vxcCancelT.id}:${vxcCancelA.id}`);
        assert(refundLedger && approxEqual(Number(refundLedger.amount), ENTRY_FEE) && refundLedger.referenceType === "tournament_cancel_refund",
            "VXC cancel: project_currency_ledger refund row exists", refundLedger);

        const noUsdRefund = await findTransaction(vxcCancelA.id, "refund", `tournament-cancel-refund:${vxcCancelT.id}:${vxcCancelA.id}`);
        assert(noUsdRefund === null, "VXC cancel: no tx_internal refund written for VXC tournament", noUsdRefund);

        await new Promise((r) => setTimeout(r, 200));
        const notif = await findNotification(vxcCancelA.id, "tournament_cancelled_refund");
        assert(notif && notif.message.includes("VXC 10.00"), "VXC cancel: notification renders VXC amount", notif);
        assert(notif && notif.messageAr.includes("VXC 10.00"), "VXC cancel: AR notification renders VXC amount", notif);

        const playerToken = await tokenFor(vxcCancelA);
        const detailResp = await requestJson({ path: `/api/tournaments/${vxcCancelT.id}`, token: playerToken });
        assert(
            detailResp.status === 200 &&
                detailResp.json?.userRefund &&
                approxEqual(Number(detailResp.json.userRefund.amount), ENTRY_FEE) &&
                detailResp.json.userRefund.currency === "project" &&
                detailResp.json.userRefund.reason === "cancelled",
            "VXC cancel: GET /api/tournaments/:id returns userRefund for player",
            detailResp.json?.userRefund,
        );
    }

    // ---- 5) USD tournament: player withdraw → USD refund ----
    console.log("\n--- USD tournament: player withdraw → refund ---");
    const usdWithdrawT = await createTournament(adminToken, { name: `USD Withdraw ${runTag}`, currency: "usd" });
    {
        const before = await getUsdBalance(usdWithdraw.id);
        await registerPlayer(await tokenFor(usdWithdraw), usdWithdrawT.id);
        const mid = await getUsdBalance(usdWithdraw.id);
        assert(approxEqual(mid, before - ENTRY_FEE), "USD withdraw: entry fee debited first", { before, mid });

        await withdrawPlayer(await tokenFor(usdWithdraw), usdWithdrawT.id);
        const after = await getUsdBalance(usdWithdraw.id);
        assert(approxEqual(after, before), "USD withdraw: balance fully restored", { before, after });

        const refund = await findTransaction(usdWithdraw.id, "refund", `tournament-unregister-refund:${usdWithdrawT.id}:${usdWithdraw.id}`);
        assert(refund && approxEqual(Number(refund.amount), ENTRY_FEE), "USD withdraw: tx_internal refund row exists", refund);

        const { rows: partRows } = await pool.query(
            `SELECT id FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`,
            [usdWithdrawT.id, usdWithdraw.id],
        );
        assert(partRows.length === 0, "USD withdraw: participant row removed");
    }

    // ---- 6) VXC tournament: admin delete → VXC refund ----
    console.log("\n--- VXC tournament: admin delete → refund ---");
    const vxcDeleteT = await createTournament(adminToken, { name: `VXC Delete ${runTag}`, currency: "project" });
    {
        const before = await getProjectBalances(vxcDelete.id);
        await registerPlayer(await tokenFor(vxcDelete), vxcDeleteT.id);
        const mid = await getProjectBalances(vxcDelete.id);
        assert(approxEqual(mid.total, before.total - ENTRY_FEE), "VXC delete: entry fee debited first", { before, mid });

        const deleteResp = await adminDelete(adminToken, vxcDeleteT.id);
        assert(deleteResp.refunded === true && deleteResp.refundedCount === 1, "VXC delete: refund summary returned", deleteResp);

        const after = await getProjectBalances(vxcDelete.id);
        assert(approxEqual(after.total, before.total), "VXC delete: project balance fully restored", { before, after });

        const refundLedger = await findLedger(vxcDelete.id, "refund", `tournament-delete-refund:${vxcDeleteT.id}:${vxcDelete.id}`);
        assert(refundLedger && approxEqual(Number(refundLedger.amount), ENTRY_FEE) && refundLedger.referenceType === "tournament_delete_refund",
            "VXC delete: project_currency_ledger refund row exists", refundLedger);

        const { rows } = await pool.query(`SELECT id FROM tournaments WHERE id = $1`, [vxcDeleteT.id]);
        assert(rows.length === 0, "VXC delete: tournament row removed");
        // Already gone, drop from cleanup list
        const idx = tournamentIds.indexOf(vxcDeleteT.id);
        if (idx >= 0) tournamentIds.splice(idx, 1);
    }

    const passed = checks.filter((c) => c.ok).length;
    console.log(`\n[smoke:tournament-currency] PASS ${passed}/${checks.length} checks`);
}

(async () => {
    let exitCode = 0;
    try {
        await main();
    } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error("\n[smoke:tournament-currency] FAIL", message);
        exitCode = 1;
    } finally {
        try { await cleanup(); } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            console.warn("[smoke:tournament-currency] cleanup warning", m);
        }
        await pool.end();
        process.exit(exitCode);
    }
})();
