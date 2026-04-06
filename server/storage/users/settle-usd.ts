import {
  users, transactions, liveGameSessions,
} from "@shared/schema";
import { db } from "../../db";
import { and, eq, or } from "drizzle-orm";

// ==================== USD GAME PAYOUTS ====================

// Settle game payout with full transactional integrity (includes stats update)
export async function settleGamePayout(
  sessionId: string,
  winnerId: string,
  loserId: string,
  stakeAmount: string,
  platformFeePercent: number = 0,
  gameType: string = 'chess'
): Promise<{ success: boolean; error?: string }> {
  const stake = parseFloat(stakeAmount);
  if (isNaN(stake) || stake <= 0) {
    return { success: false, error: 'Invalid entry amount' };
  }

  // Total pot = stake from each player = stake * 2
  // Platform fee is calculated on the total pot
  const totalPot = stake * 2;
  const platformFee = totalPot * (platformFeePercent / 100);
  // Winner gets their original stake back + loser's stake - platform fee
  const winnerPayout = totalPot - platformFee;
  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot'];

  return await db.transaction(async (tx) => {
    const [existingSettlement] = await tx.select({ id: transactions.id })
      .from(transactions)
      .where(and(
        eq(transactions.referenceId, sessionId),
        eq(transactions.userId, winnerId),
        eq(transactions.type, 'win'),
        eq(transactions.status, 'completed'),
      ))
      .limit(1);

    if (existingSettlement) {
      return { success: true };
    }

    const [id1, id2] = [winnerId, loserId].sort();
    const [user1] = await tx.select().from(users).where(eq(users.id, id1)).for('update');
    const [user2] = await tx.select().from(users).where(eq(users.id, id2)).for('update');

    const winner = id1 === winnerId ? user1 : user2;
    const loser = id1 === winnerId ? user2 : user1;

    if (!winner || !loser) {
      return { success: false, error: 'User not found' };
    }

    const winnerBalance = parseFloat(winner.balance);
    const winnerNewBalance = (winnerBalance + winnerPayout).toFixed(2);

    const winnerStatsUpdates: Record<string, unknown> = {
      balance: winnerNewBalance,
      gamesPlayed: winner.gamesPlayed + 1,
      gamesWon: winner.gamesWon + 1,
      currentWinStreak: winner.currentWinStreak + 1,
      longestWinStreak: Math.max(winner.longestWinStreak, winner.currentWinStreak + 1),
      totalEarnings: (parseFloat(winner.totalEarnings) + winnerPayout).toFixed(2),
      updatedAt: new Date()
    };

    if (validGameTypes.includes(gameType)) {
      const playedField = `${gameType}Played`;
      const wonField = `${gameType}Won`;
      winnerStatsUpdates[playedField] = (winner as unknown as Record<string, number>)[playedField] + 1;
      winnerStatsUpdates[wonField] = (winner as unknown as Record<string, number>)[wonField] + 1;
    }

    await tx.update(users).set(winnerStatsUpdates).where(eq(users.id, winnerId));

    const loserStatsUpdates: Record<string, unknown> = {
      gamesPlayed: loser.gamesPlayed + 1,
      gamesLost: loser.gamesLost + 1,
      currentWinStreak: 0,
      updatedAt: new Date()
    };

    if (validGameTypes.includes(gameType)) {
      const playedField = `${gameType}Played`;
      loserStatsUpdates[playedField] = (loser as unknown as Record<string, number>)[playedField] + 1;
    }

    await tx.update(users).set(loserStatsUpdates).where(eq(users.id, loserId));

    await tx.insert(transactions).values({
      userId: winnerId,
      type: 'win',
      amount: winnerPayout.toFixed(2),
      balanceBefore: winnerBalance.toFixed(2),
      balanceAfter: winnerNewBalance,
      status: 'completed',
      description: `Game winnings from session ${sessionId}`,
      referenceId: sessionId,
      processedAt: new Date()
    });

    const loserBalance = parseFloat(loser.balance);
    await tx.insert(transactions).values({
      userId: loserId,
      type: 'stake',
      amount: stakeAmount,
      balanceBefore: (loserBalance + stake).toFixed(2),
      balanceAfter: loserBalance.toFixed(2),
      status: 'completed',
      description: `Game entry loss in session ${sessionId}`,
      referenceId: sessionId,
      processedAt: new Date()
    });

    // PLATFORM COMMISSION audit trail
    if (platformFee > 0) {
      await tx.insert(transactions).values({
        userId: winnerId,
        type: 'platform_fee',
        amount: platformFee.toFixed(2),
        balanceBefore: '0',
        balanceAfter: '0',
        status: 'completed',
        description: `Platform commission (${platformFeePercent}%) on game ${sessionId}`,
        referenceId: sessionId,
        processedAt: new Date()
      });
    }

    await tx.update(liveGameSessions)
      .set({
        status: 'completed',
        winnerId: winnerId,
        endedAt: new Date()
      })
      .where(or(
        eq(liveGameSessions.id, sessionId),
        eq(liveGameSessions.challengeId, sessionId)
      ));

    return { success: true };
  });
}
