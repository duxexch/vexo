#!/usr/bin/env tsx

import crypto from "node:crypto";
import { pool, closePool } from "../server/db";
import { settleChallengePayout, settleDrawPayout } from "../server/lib/payout";
import { closeRedisConnections } from "../server/lib/redis";

class SmokeError extends Error {
    details?: unknown;

    constructor(message: string, details?: unknown) {
        super(message);
        this.name = "SmokeError";
        this.details = details;
    }
}

interface CliOptions {
    keepData: boolean;
}

interface WalletSnapshot {
    earned: number;
    total: number;
}

interface SetupData {
    userIds: {
        usdWinWinner: string;
        usdWinLoser: string;
        usdResignWinner: string;
        usdResignLoser: string;
        usdDrawP1: string;
        usdDrawP2: string;
        projectWinWinner: string;
        projectWinLoser: string;
        projectDrawP1: string;
        projectDrawP2: string;
    };
    usernames: {
        usdWinWinner: string;
        usdWinLoser: string;
        usdResignWinner: string;
        usdResignLoser: string;
        usdDrawP1: string;
        usdDrawP2: string;
        projectWinWinner: string;
        projectWinLoser: string;
        projectDrawP1: string;
        projectDrawP2: string;
    };
    challengeIds: {
        usdWin: string;
        usdResign: string;
        usdDraw: string;
        usdBackgammonCube: string;
        projectWin: string;
        projectDraw: string;
        projectBackgammonCube: string;
    };
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = { keepData: false };

    for (let i = 2; i < argv.length; i += 1) {
        if (argv[i] === "--keep-data") {
            options.keepData = true;
        }
    }

    return options;
}

function fail(message: string, details?: unknown): never {
    throw new SmokeError(message, details);
}

function assertCondition(condition: unknown, message: string, details?: unknown): asserts condition {
    if (!condition) {
        fail(message, details);
    }
}

function assertNumberEqual(actual: number, expected: number, message: string, tolerance = 1e-9): void {
    if (Math.abs(actual - expected) > tolerance) {
        fail(message, { actual, expected, tolerance });
    }
}

function parseDecimal(value: unknown): number {
    const numeric = Number.parseFloat(String(value ?? "0"));
    if (Number.isNaN(numeric)) {
        fail("Failed to parse decimal value", { value });
    }
    return numeric;
}

async function safeDelete(sqlText: string, values: unknown[]): Promise<void> {
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

async function createUser(id: string, username: string): Promise<void> {
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance)
     VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
        [id, username, "smoke-local-password-hash"],
    );
}

async function createProjectWallet(userId: string): Promise<void> {
    await pool.query(
        `INSERT INTO project_currency_wallets (
      user_id,
      purchased_balance,
      earned_balance,
      total_balance,
      total_converted,
      total_spent,
      total_earned,
      locked_balance
    ) VALUES ($1, '100.00', '0.00', '100.00', '0.00', '0.00', '0.00', '0.00')`,
        [userId],
    );
}

async function createChallenge(
    id: string,
    player1Id: string,
    player2Id: string,
    betAmount: string,
    currencyType: "usd" | "project",
    gameType: "chess" | "backgammon" = "chess",
): Promise<void> {
    await pool.query(
        `INSERT INTO challenges (
      id,
      game_type,
      bet_amount,
      currency_type,
      visibility,
      status,
      player1_id,
      player2_id,
      required_players,
      current_players,
      opponent_type
    ) VALUES (
      $1,
        $2,
        $3,
        $4,
      'public',
      'active',
        $5,
        $6,
      2,
      2,
      'anyone'
    )`,
        [id, gameType, betAmount, currencyType, player1Id, player2Id],
    );
}

async function getUserBalance(userId: string): Promise<number> {
    const result = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);
    assertCondition(result.rowCount === 1, "Expected user row for balance query", { userId });
    return parseDecimal(result.rows[0].balance);
}

async function getWalletSnapshot(userId: string): Promise<WalletSnapshot> {
    const result = await pool.query(
        `SELECT earned_balance AS "earned", total_balance AS "total"
     FROM project_currency_wallets
     WHERE user_id = $1`,
        [userId],
    );

    assertCondition(result.rowCount === 1, "Expected project wallet row", { userId });
    return {
        earned: parseDecimal(result.rows[0].earned),
        total: parseDecimal(result.rows[0].total),
    };
}

async function countCompletedTransactions(referenceId: string, type: string, userId?: string): Promise<number> {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count
     FROM transactions
     WHERE reference_id = $1
       AND type = $2
       AND status = 'completed'
       AND ($3::text IS NULL OR user_id = $3)`,
        [referenceId, type, userId ?? null],
    );

    return Number(result.rows[0]?.count ?? 0);
}

async function countProjectLedgerEntries(
    referenceId: string,
    type: string,
    userId?: string,
    referenceType?: string,
): Promise<number> {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count
     FROM project_currency_ledger
     WHERE reference_id = $1
       AND type = $2
       AND ($3::text IS NULL OR user_id = $3)
       AND ($4::text IS NULL OR reference_type = $4)`,
        [referenceId, type, userId ?? null, referenceType ?? null],
    );

    return Number(result.rows[0]?.count ?? 0);
}

async function runUsdWinReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.usdWin;
    const winnerId = setupData.userIds.usdWinWinner;
    const loserId = setupData.userIds.usdWinLoser;
    const betAmount = 5;

    const winnerBefore = await getUserBalance(winnerId);

    const firstResult = await settleChallengePayout(challengeId, winnerId, loserId, "chess");
    assertCondition(firstResult.success, "USD win first settlement failed", firstResult);

    const winnerAfterFirst = await getUserBalance(winnerId);
    assertNumberEqual(
        winnerAfterFirst,
        winnerBefore + (betAmount * 2),
        "USD winner balance mismatch after first payout",
    );

    const secondResult = await settleChallengePayout(challengeId, winnerId, loserId, "chess");
    assertCondition(secondResult.success, "USD win second settlement failed", secondResult);

    const winnerAfterSecond = await getUserBalance(winnerId);
    assertNumberEqual(
        winnerAfterSecond,
        winnerAfterFirst,
        "USD winner balance changed after replayed payout",
    );

    const winRows = await countCompletedTransactions(challengeId, "win", winnerId);
    const stakeRows = await countCompletedTransactions(challengeId, "stake", loserId);
    assertCondition(winRows === 1, "USD win transaction duplicated", { challengeId, winRows });
    assertCondition(stakeRows === 1, "USD stake transaction duplicated", { challengeId, stakeRows });

    console.log("[smoke:settlement-idempotency] PASS usd winner settlement replay");
}

async function runUsdResignReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.usdResign;
    const winnerId = setupData.userIds.usdResignWinner;
    const loserId = setupData.userIds.usdResignLoser;
    const betAmount = 4;

    const winnerBefore = await getUserBalance(winnerId);

    // Resignation path uses the same shared payout helper with challenge-level reference id.
    const firstResult = await settleChallengePayout(challengeId, winnerId, loserId, "chess");
    assertCondition(firstResult.success, "USD resign first settlement failed", firstResult);

    const winnerAfterFirst = await getUserBalance(winnerId);
    assertNumberEqual(
        winnerAfterFirst,
        winnerBefore + (betAmount * 2),
        "USD resignation winner balance mismatch after first payout",
    );

    const secondResult = await settleChallengePayout(challengeId, winnerId, loserId, "chess");
    assertCondition(secondResult.success, "USD resign second settlement failed", secondResult);

    const winnerAfterSecond = await getUserBalance(winnerId);
    assertNumberEqual(
        winnerAfterSecond,
        winnerAfterFirst,
        "USD resignation replay changed winner balance",
    );

    const winRows = await countCompletedTransactions(challengeId, "win", winnerId);
    assertCondition(winRows === 1, "USD resignation win transaction duplicated", { challengeId, winRows });

    console.log("[smoke:settlement-idempotency] PASS usd resign settlement replay");
}

async function runUsdDrawReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.usdDraw;
    const p1 = setupData.userIds.usdDrawP1;
    const p2 = setupData.userIds.usdDrawP2;
    const betAmount = 3;

    const p1Before = await getUserBalance(p1);
    const p2Before = await getUserBalance(p2);

    const firstResult = await settleDrawPayout(challengeId, p1, p2, "chess");
    assertCondition(firstResult.success, "USD draw first settlement failed", firstResult);

    const p1AfterFirst = await getUserBalance(p1);
    const p2AfterFirst = await getUserBalance(p2);
    assertNumberEqual(p1AfterFirst, p1Before + betAmount, "USD draw P1 balance mismatch after first refund");
    assertNumberEqual(p2AfterFirst, p2Before + betAmount, "USD draw P2 balance mismatch after first refund");

    const secondResult = await settleDrawPayout(challengeId, p1, p2, "chess");
    assertCondition(secondResult.success, "USD draw second settlement failed", secondResult);

    const p1AfterSecond = await getUserBalance(p1);
    const p2AfterSecond = await getUserBalance(p2);
    assertNumberEqual(p1AfterSecond, p1AfterFirst, "USD draw replay changed P1 balance");
    assertNumberEqual(p2AfterSecond, p2AfterFirst, "USD draw replay changed P2 balance");

    const refundRows = await countCompletedTransactions(challengeId, "game_refund");
    const refundRowsP1 = await countCompletedTransactions(challengeId, "game_refund", p1);
    const refundRowsP2 = await countCompletedTransactions(challengeId, "game_refund", p2);
    assertCondition(refundRows === 2, "USD draw refund transactions duplicated", { challengeId, refundRows });
    assertCondition(refundRowsP1 === 1, "USD draw refund duplicated for P1", { challengeId, refundRowsP1 });
    assertCondition(refundRowsP2 === 1, "USD draw refund duplicated for P2", { challengeId, refundRowsP2 });

    console.log("[smoke:settlement-idempotency] PASS usd draw refund replay");
}

async function runProjectWinReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.projectWin;
    const winnerId = setupData.userIds.projectWinWinner;
    const loserId = setupData.userIds.projectWinLoser;
    const betAmount = 7;

    const winnerBefore = await getWalletSnapshot(winnerId);

    const firstResult = await settleChallengePayout(challengeId, winnerId, loserId, "chess");
    assertCondition(firstResult.success, "Project win first settlement failed", firstResult);

    const winnerAfterFirst = await getWalletSnapshot(winnerId);
    assertNumberEqual(
        winnerAfterFirst.earned,
        winnerBefore.earned + (betAmount * 2),
        "Project winner earned balance mismatch after first payout",
    );
    assertNumberEqual(
        winnerAfterFirst.total,
        winnerBefore.total + (betAmount * 2),
        "Project winner total balance mismatch after first payout",
    );

    const secondResult = await settleChallengePayout(challengeId, winnerId, loserId, "chess");
    assertCondition(secondResult.success, "Project win second settlement failed", secondResult);

    const winnerAfterSecond = await getWalletSnapshot(winnerId);
    assertNumberEqual(
        winnerAfterSecond.earned,
        winnerAfterFirst.earned,
        "Project winner earned balance changed after replayed payout",
    );
    assertNumberEqual(
        winnerAfterSecond.total,
        winnerAfterFirst.total,
        "Project winner total balance changed after replayed payout",
    );

    const winRows = await countProjectLedgerEntries(challengeId, "game_win", winnerId);
    assertCondition(winRows === 1, "Project game_win ledger duplicated", { challengeId, winRows });

    console.log("[smoke:settlement-idempotency] PASS project winner settlement replay");
}

async function runProjectDrawReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.projectDraw;
    const p1 = setupData.userIds.projectDrawP1;
    const p2 = setupData.userIds.projectDrawP2;
    const betAmount = 2;

    const p1Before = await getWalletSnapshot(p1);
    const p2Before = await getWalletSnapshot(p2);

    const firstResult = await settleDrawPayout(challengeId, p1, p2, "chess");
    assertCondition(firstResult.success, "Project draw first settlement failed", firstResult);

    const p1AfterFirst = await getWalletSnapshot(p1);
    const p2AfterFirst = await getWalletSnapshot(p2);

    assertNumberEqual(
        p1AfterFirst.earned,
        p1Before.earned + betAmount,
        "Project draw P1 earned balance mismatch after first refund",
    );
    assertNumberEqual(
        p2AfterFirst.earned,
        p2Before.earned + betAmount,
        "Project draw P2 earned balance mismatch after first refund",
    );
    assertNumberEqual(
        p1AfterFirst.total,
        p1Before.total + betAmount,
        "Project draw P1 total balance mismatch after first refund",
    );
    assertNumberEqual(
        p2AfterFirst.total,
        p2Before.total + betAmount,
        "Project draw P2 total balance mismatch after first refund",
    );

    const secondResult = await settleDrawPayout(challengeId, p1, p2, "chess");
    assertCondition(secondResult.success, "Project draw second settlement failed", secondResult);

    const p1AfterSecond = await getWalletSnapshot(p1);
    const p2AfterSecond = await getWalletSnapshot(p2);

    assertNumberEqual(p1AfterSecond.earned, p1AfterFirst.earned, "Project draw replay changed P1 earned balance");
    assertNumberEqual(p2AfterSecond.earned, p2AfterFirst.earned, "Project draw replay changed P2 earned balance");
    assertNumberEqual(p1AfterSecond.total, p1AfterFirst.total, "Project draw replay changed P1 total balance");
    assertNumberEqual(p2AfterSecond.total, p2AfterFirst.total, "Project draw replay changed P2 total balance");

    const refundRows = await countProjectLedgerEntries(challengeId, "refund", undefined, "challenge_draw_refund");
    const refundRowsP1 = await countProjectLedgerEntries(challengeId, "refund", p1, "challenge_draw_refund");
    const refundRowsP2 = await countProjectLedgerEntries(challengeId, "refund", p2, "challenge_draw_refund");

    assertCondition(refundRows === 2, "Project draw refund ledger duplicated", { challengeId, refundRows });
    assertCondition(refundRowsP1 === 1, "Project draw refund duplicated for P1", { challengeId, refundRowsP1 });
    assertCondition(refundRowsP2 === 1, "Project draw refund duplicated for P2", { challengeId, refundRowsP2 });

    console.log("[smoke:settlement-idempotency] PASS project draw refund replay");
}

async function runUsdBackgammonCubeReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.usdBackgammonCube;
    const winnerId = setupData.userIds.usdWinWinner;
    const loserId = setupData.userIds.usdWinLoser;
    const effectiveStake = 5 * 4; // base 5.00 with cube x4

    const winnerBefore = await getUserBalance(winnerId);

    const firstResult = await settleChallengePayout(
        challengeId,
        winnerId,
        loserId,
        "backgammon",
        undefined,
        JSON.stringify({ doublingCube: 4 }),
    );
    assertCondition(firstResult.success, "USD backgammon cube first settlement failed", firstResult);

    const winnerAfterFirst = await getUserBalance(winnerId);
    assertNumberEqual(
        winnerAfterFirst,
        winnerBefore + (effectiveStake * 2),
        "USD backgammon cube winner balance mismatch after first payout",
    );

    const secondResult = await settleChallengePayout(
        challengeId,
        winnerId,
        loserId,
        "backgammon",
        undefined,
        JSON.stringify({ doublingCube: 4 }),
    );
    assertCondition(secondResult.success, "USD backgammon cube second settlement failed", secondResult);

    const winnerAfterSecond = await getUserBalance(winnerId);
    assertNumberEqual(
        winnerAfterSecond,
        winnerAfterFirst,
        "USD backgammon cube replay changed winner balance",
    );

    const winRows = await countCompletedTransactions(challengeId, "win", winnerId);
    const stakeRows = await countCompletedTransactions(challengeId, "stake", loserId);
    assertCondition(winRows === 1, "USD backgammon cube win transaction duplicated", { challengeId, winRows });
    assertCondition(stakeRows === 1, "USD backgammon cube stake transaction duplicated", { challengeId, stakeRows });

    console.log("[smoke:settlement-idempotency] PASS usd backgammon cube replay");
}

async function runProjectBackgammonCubeReplayCase(setupData: SetupData): Promise<void> {
    const challengeId = setupData.challengeIds.projectBackgammonCube;
    const winnerId = setupData.userIds.projectWinWinner;
    const loserId = setupData.userIds.projectWinLoser;
    const effectiveStake = 3 * 4; // base 3.00 with cube x4

    const winnerBefore = await getWalletSnapshot(winnerId);

    const firstResult = await settleChallengePayout(
        challengeId,
        winnerId,
        loserId,
        "backgammon",
        undefined,
        JSON.stringify({ doublingCube: 4 }),
    );
    assertCondition(firstResult.success, "Project backgammon cube first settlement failed", firstResult);

    const winnerAfterFirst = await getWalletSnapshot(winnerId);
    assertNumberEqual(
        winnerAfterFirst.earned,
        winnerBefore.earned + (effectiveStake * 2),
        "Project backgammon cube earned mismatch after first payout",
    );
    assertNumberEqual(
        winnerAfterFirst.total,
        winnerBefore.total + (effectiveStake * 2),
        "Project backgammon cube total mismatch after first payout",
    );

    const secondResult = await settleChallengePayout(
        challengeId,
        winnerId,
        loserId,
        "backgammon",
        undefined,
        JSON.stringify({ doublingCube: 4 }),
    );
    assertCondition(secondResult.success, "Project backgammon cube second settlement failed", secondResult);

    const winnerAfterSecond = await getWalletSnapshot(winnerId);
    assertNumberEqual(
        winnerAfterSecond.earned,
        winnerAfterFirst.earned,
        "Project backgammon cube replay changed earned balance",
    );
    assertNumberEqual(
        winnerAfterSecond.total,
        winnerAfterFirst.total,
        "Project backgammon cube replay changed total balance",
    );

    const winRows = await countProjectLedgerEntries(challengeId, "game_win", winnerId);
    assertCondition(winRows === 1, "Project backgammon cube win ledger duplicated", { challengeId, winRows });

    console.log("[smoke:settlement-idempotency] PASS project backgammon cube replay");
}

async function cleanup(setupData: SetupData): Promise<void> {
    const challengeIds = Object.values(setupData.challengeIds);
    const userIds = Object.values(setupData.userIds);

    await safeDelete("DELETE FROM challenge_points_ledger WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_gifts WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_spectator_bets WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_spectators WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM challenge_chat_messages WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM chess_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM domino_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM backgammon_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM baloot_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM tarneeb_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
    await safeDelete("DELETE FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[])", [challengeIds]);
    await safeDelete("DELETE FROM live_game_sessions WHERE challenge_id = ANY($1::text[]) OR id = ANY($1::text[])", [challengeIds]);

    await safeDelete("DELETE FROM transactions WHERE reference_id = ANY($1::text[]) OR user_id = ANY($2::text[])", [challengeIds, userIds]);
    await safeDelete("DELETE FROM project_currency_ledger WHERE reference_id = ANY($1::text[]) OR user_id = ANY($2::text[])", [challengeIds, userIds]);

    await safeDelete("DELETE FROM challenges WHERE id = ANY($1::text[])", [challengeIds]);

    await safeDelete("DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])", [userIds]);

    await safeDelete("DELETE FROM notifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM active_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM login_history WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM password_reset_tokens WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM otp_verifications WHERE user_id = ANY($1::text[])", [userIds]);
    await safeDelete("DELETE FROM two_factor_backup_codes WHERE user_id = ANY($1::text[])", [userIds]);

    await safeDelete("DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv);

    if (!process.env.DATABASE_URL) {
        fail("DATABASE_URL must be set before running settlement idempotency smoke");
    }

    const runTag = crypto.randomBytes(4).toString("hex");
    const setupData: SetupData = {
        userIds: {
            usdWinWinner: crypto.randomUUID(),
            usdWinLoser: crypto.randomUUID(),
            usdResignWinner: crypto.randomUUID(),
            usdResignLoser: crypto.randomUUID(),
            usdDrawP1: crypto.randomUUID(),
            usdDrawP2: crypto.randomUUID(),
            projectWinWinner: crypto.randomUUID(),
            projectWinLoser: crypto.randomUUID(),
            projectDrawP1: crypto.randomUUID(),
            projectDrawP2: crypto.randomUUID(),
        },
        usernames: {
            usdWinWinner: `smoke_usd_win_w_${runTag}`,
            usdWinLoser: `smoke_usd_win_l_${runTag}`,
            usdResignWinner: `smoke_usd_res_w_${runTag}`,
            usdResignLoser: `smoke_usd_res_l_${runTag}`,
            usdDrawP1: `smoke_usd_draw_1_${runTag}`,
            usdDrawP2: `smoke_usd_draw_2_${runTag}`,
            projectWinWinner: `smoke_pc_win_w_${runTag}`,
            projectWinLoser: `smoke_pc_win_l_${runTag}`,
            projectDrawP1: `smoke_pc_draw_1_${runTag}`,
            projectDrawP2: `smoke_pc_draw_2_${runTag}`,
        },
        challengeIds: {
            usdWin: crypto.randomUUID(),
            usdResign: crypto.randomUUID(),
            usdDraw: crypto.randomUUID(),
            usdBackgammonCube: crypto.randomUUID(),
            projectWin: crypto.randomUUID(),
            projectDraw: crypto.randomUUID(),
            projectBackgammonCube: crypto.randomUUID(),
        },
    };

    let shouldCleanup = false;

    try {
        await pool.query("SELECT 1");
        shouldCleanup = true;

        for (const [key, userId] of Object.entries(setupData.userIds)) {
            await createUser(userId, setupData.usernames[key as keyof SetupData["usernames"]]);
        }

        await createProjectWallet(setupData.userIds.projectWinWinner);
        await createProjectWallet(setupData.userIds.projectWinLoser);
        await createProjectWallet(setupData.userIds.projectDrawP1);
        await createProjectWallet(setupData.userIds.projectDrawP2);

        await createChallenge(
            setupData.challengeIds.usdWin,
            setupData.userIds.usdWinWinner,
            setupData.userIds.usdWinLoser,
            "5.00",
            "usd",
        );

        await createChallenge(
            setupData.challengeIds.usdResign,
            setupData.userIds.usdResignWinner,
            setupData.userIds.usdResignLoser,
            "4.00",
            "usd",
        );

        await createChallenge(
            setupData.challengeIds.usdDraw,
            setupData.userIds.usdDrawP1,
            setupData.userIds.usdDrawP2,
            "3.00",
            "usd",
        );

        await createChallenge(
            setupData.challengeIds.usdBackgammonCube,
            setupData.userIds.usdWinWinner,
            setupData.userIds.usdWinLoser,
            "5.00",
            "usd",
            "backgammon",
        );

        await createChallenge(
            setupData.challengeIds.projectWin,
            setupData.userIds.projectWinWinner,
            setupData.userIds.projectWinLoser,
            "7.00",
            "project",
        );

        await createChallenge(
            setupData.challengeIds.projectDraw,
            setupData.userIds.projectDrawP1,
            setupData.userIds.projectDrawP2,
            "2.00",
            "project",
        );

        await createChallenge(
            setupData.challengeIds.projectBackgammonCube,
            setupData.userIds.projectWinWinner,
            setupData.userIds.projectWinLoser,
            "3.00",
            "project",
            "backgammon",
        );

        await runUsdWinReplayCase(setupData);
        await runUsdResignReplayCase(setupData);
        await runUsdDrawReplayCase(setupData);
        await runUsdBackgammonCubeReplayCase(setupData);
        await runProjectWinReplayCase(setupData);
        await runProjectDrawReplayCase(setupData);
        await runProjectBackgammonCubeReplayCase(setupData);

        console.log("[smoke:settlement-idempotency] All checks passed.");
    } finally {
        if (!options.keepData && shouldCleanup) {
            try {
                await cleanup(setupData);
            } catch (cleanupError) {
                const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                console.warn("[smoke:settlement-idempotency] Cleanup warning:", message);
            }
        } else if (!options.keepData && !shouldCleanup) {
            console.warn("[smoke:settlement-idempotency] Cleanup skipped because database connectivity was not established.");
        } else {
            console.log("[smoke:settlement-idempotency] keep-data enabled, skipping cleanup.");
        }

        const closeResults = await Promise.allSettled([
            closePool(),
            closeRedisConnections(),
        ]);

        for (const result of closeResults) {
            if (result.status === "rejected") {
                const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
                console.warn("[smoke:settlement-idempotency] Resource close warning:", reason);
            }
        }
    }
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        if (error instanceof SmokeError) {
            if (error.details !== undefined) {
                console.error("[smoke:settlement-idempotency]", error.message, error.details);
            } else {
                console.error("[smoke:settlement-idempotency]", error.message);
            }
            process.exit(1);
        }

        const details = error instanceof Error
            ? `${error.name}: ${error.message}\n${error.stack || ""}`
            : String(error);

        console.error("[smoke:settlement-idempotency] Unexpected error", details);
        process.exit(1);
    });
