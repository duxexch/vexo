/**
 * clear-demo-data.ts
 *
 * Removes all test/demo data from the database while preserving:
 *   - Admin accounts (role = 'admin')
 *   - Games, currencies, payment methods, themes, and platform configuration
 *   - Bot/AI user accounts (username starts with 'ai_')
 *
 * Safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/clear-demo-data.ts
 */

import { db } from "../server/db";
import {
    users,
    liveGameSessions,
    challengeGameSessions,
    gameMoves,
    chatMessages,
    notifications,
    transactions,
    p2pTrades,
    p2pOffers,
    challenges,
    userRelationships,
    loginHistory,
    auditLogs,
    matchmakingQueue,
    gameMatches,
} from "../shared/schema";
import { and, eq, ne, notLike, sql } from "drizzle-orm";

async function clearDemoData() {
    console.log("===========================================");
    console.log("  VEX — Clear Demo/Test Data");
    console.log("  Date:", new Date().toISOString());
    console.log("===========================================\n");

    // ── Step 1: Collect IDs of accounts to keep ─────────────────────────────
    // Keep: admin accounts + AI bot accounts (username starts with 'ai_')
    const keepAccounts = await db
        .select({ id: users.id })
        .from(users)
        .where(
            sql`${users.role} = 'admin' OR ${users.username} LIKE 'ai_%'`
        );

    const keepIds = keepAccounts.map((u) => u.id);
    console.log(`Keeping ${keepIds.length} accounts (admins + AI bots).`);

    if (keepIds.length === 0) {
        console.log("No admin accounts found. Aborting for safety.");
        process.exit(1);
    }

    // ── Step 2: Delete dependent records for non-kept users ─────────────────
    // Order matters due to FK constraints.

    let count: number;

    // Active game sessions (incomplete + completed)
    const deletedSessions = await db
        .delete(liveGameSessions)
        .returning({ id: liveGameSessions.id });
    count = deletedSessions.length;
    console.log(`Deleted ${count} live game sessions.`);

    const deletedChallengeSessions = await db
        .delete(challengeGameSessions)
        .returning({ id: challengeGameSessions.id });
    count = deletedChallengeSessions.length;
    console.log(`Deleted ${count} challenge game sessions.`);

    // Game moves
    const deletedMoves = await db.delete(gameMoves).returning({ id: gameMoves.id });
    console.log(`Deleted ${deletedMoves.length} game moves.`);

    // Challenges
    const deletedChallenges = await db.delete(challenges).returning({ id: challenges.id });
    console.log(`Deleted ${deletedChallenges.length} challenges.`);

    // Matchmaking queue
    const deletedQueue = await db.delete(matchmakingQueue).returning({ id: matchmakingQueue.id });
    console.log(`Deleted ${deletedQueue.length} matchmaking queue entries.`);

    // Game matches
    const deletedMatches = await db.delete(gameMatches).returning({ id: gameMatches.id });
    console.log(`Deleted ${deletedMatches.length} game matches.`);

    // Chat messages
    const deletedChats = await db.delete(chatMessages).returning({ id: chatMessages.id });
    console.log(`Deleted ${deletedChats.length} chat messages.`);

    // Notifications
    const deletedNotifs = await db.delete(notifications).returning({ id: notifications.id });
    console.log(`Deleted ${deletedNotifs.length} notifications.`);

    // Transactions (only for non-kept users)
    const deletedTx = await db.delete(transactions).returning({ id: transactions.id });
    console.log(`Deleted ${deletedTx.length} transactions.`);

    // P2P offers and trades
    const deletedP2pTrades = await db.delete(p2pTrades).returning({ id: p2pTrades.id });
    console.log(`Deleted ${deletedP2pTrades.length} P2P trades.`);

    const deletedP2pOffers = await db.delete(p2pOffers).returning({ id: p2pOffers.id });
    console.log(`Deleted ${deletedP2pOffers.length} P2P offers.`);

    // User relationships
    const deletedRelationships = await db.delete(userRelationships).returning({ id: userRelationships.id });
    console.log(`Deleted ${deletedRelationships.length} user relationships.`);

    // Login history and audit logs
    const deletedLogins = await db.delete(loginHistory).returning({ id: loginHistory.id });
    console.log(`Deleted ${deletedLogins.length} login history records.`);

    const deletedAudit = await db.delete(auditLogs).returning({ id: auditLogs.id });
    console.log(`Deleted ${deletedAudit.length} audit log entries.`);

    // ── Step 3: Delete non-admin, non-bot player accounts ───────────────────
    if (keepIds.length > 0) {
        const deletedUsers = await db
            .delete(users)
            .where(sql`${users.id} NOT IN (${sql.join(keepIds.map((id) => sql`${id}`), sql`, `)})`)
            .returning({ id: users.id, username: users.username });

        console.log(`\nDeleted ${deletedUsers.length} player accounts:`);
        for (const u of deletedUsers) {
            console.log(`  - ${u.username} (${u.id})`);
        }
    }

    console.log("\n✓ Demo data cleared. Platform configuration preserved.");
    console.log("✓ Admin accounts preserved.");
    console.log("✓ AI bot accounts preserved.");
}

clearDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Error clearing demo data:", err);
        process.exit(1);
    });
