import {
  users, transactions, liveGameSessions,
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

// ==================== RESIGNATION PAYOUT (70/30 SPLIT) ====================

export async function settleResignationPayout(
  sessionId: string,
  winnerId: string,
  loserId: string,
  stakeAmount: string,
  commissionPercent: number,
  surrenderWinnerPercent: number,
  surrenderLoserRefundPercent: number,
  gameType: string = 'chess'
): Promise<{ success: boolean; error?: string; winnerPayout?: number; loserRefund?: number; commission?: number }> {
  const stake = parseFloat(stakeAmount);
  if (isNaN(stake) || stake <= 0) {
    return { success: false, error: 'Invalid entry amount' };
  }

  // SECURITY: Validate percentages
  if (commissionPercent < 0 || commissionPercent > 50) {
    return { success: false, error: 'Invalid commission percent' };
  }
  if (surrenderWinnerPercent + surrenderLoserRefundPercent > 100) {
    return { success: false, error: 'Winner + loser percentages exceed 100%' };
  }

  const totalPot = stake * 2;
  const commission = totalPot * (commissionPercent / 100);
  const potAfterCommission = totalPot - commission;
  // Loser gets back their refund percentage of THEIR OWN stake
  const loserRefund = stake * (surrenderLoserRefundPercent / 100);
  // Winner gets the rest of the pot after commission and loser refund
  const winnerPayout = potAfterCommission - loserRefund;
  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot', 'languageduel'];

  // SECURITY: Ensure no negative payouts
  if (winnerPayout < 0 || loserRefund < 0) {
    return { success: false, error: 'Invalid payout calculation — negative values' };
  }

  return await db.transaction(async (tx) => {
    // Lock rows in deterministic order to prevent deadlocks
    const [id1, id2] = [winnerId, loserId].sort();
    const [user1] = await tx.select().from(users).where(eq(users.id, id1)).for('update');
    const [user2] = await tx.select().from(users).where(eq(users.id, id2)).for('update');

    const winner = id1 === winnerId ? user1 : user2;
    const loser = id1 === winnerId ? user2 : user1;

    if (!winner || !loser) {
      return { success: false, error: 'User not found' };
    }

    // WINNER: credit payout
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
      winnerStatsUpdates[`${gameType}Played`] = (winner as unknown as Record<string, number>)[`${gameType}Played`] + 1;
      winnerStatsUpdates[`${gameType}Won`] = (winner as unknown as Record<string, number>)[`${gameType}Won`] + 1;
    }
    await tx.update(users).set(winnerStatsUpdates).where(eq(users.id, winnerId));

    // LOSER: credit partial refund
    const loserBalance = parseFloat(loser.balance);
    const loserNewBalance = (loserBalance + loserRefund).toFixed(2);
    const loserStatsUpdates: Record<string, unknown> = {
      balance: loserNewBalance,
      gamesPlayed: loser.gamesPlayed + 1,
      gamesLost: loser.gamesLost + 1,
      currentWinStreak: 0,
      updatedAt: new Date()
    };
    if (validGameTypes.includes(gameType)) {
      loserStatsUpdates[`${gameType}Played`] = (loser as unknown as Record<string, number>)[`${gameType}Played`] + 1;
    }
    await tx.update(users).set(loserStatsUpdates).where(eq(users.id, loserId));

    // Transaction records for audit trail
    await tx.insert(transactions).values({
      userId: winnerId,
      type: 'win',
      amount: winnerPayout.toFixed(2),
      balanceBefore: winnerBalance.toFixed(2),
      balanceAfter: winnerNewBalance,
      status: 'completed',
      description: `Resignation win (${surrenderWinnerPercent}% of pot) from session ${sessionId}`,
      referenceId: sessionId,
      processedAt: new Date()
    });

    await tx.insert(transactions).values({
      userId: loserId,
      type: 'game_refund',
      amount: loserRefund.toFixed(2),
      balanceBefore: loserBalance.toFixed(2),
      balanceAfter: loserNewBalance,
      status: 'completed',
      description: `Surrender refund (${surrenderLoserRefundPercent}% of stake) from session ${sessionId}`,
      referenceId: sessionId,
      processedAt: new Date()
    });

    // PLATFORM COMMISSION transaction record
    if (commission > 0) {
      await tx.insert(transactions).values({
        userId: winnerId,
        type: 'platform_fee',
        amount: commission.toFixed(2),
        balanceBefore: '0',
        balanceAfter: '0',
        status: 'completed',
        description: `Platform commission (${commissionPercent}%) on resignation game ${sessionId}`,
        referenceId: sessionId,
        processedAt: new Date()
      });
    }

    // Update session
    await tx.update(liveGameSessions)
      .set({ status: 'completed', winnerId, endedAt: new Date() })
      .where(eq(liveGameSessions.id, sessionId));

    return { success: true, winnerPayout, loserRefund, commission };
  });
}
