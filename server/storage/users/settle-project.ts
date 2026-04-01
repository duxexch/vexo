import {
  users, liveGameSessions,
  projectCurrencyWallets, projectCurrencyLedger,
} from "@shared/schema";
import { db } from "../../db";
import { and, eq } from "drizzle-orm";

// ==================== PROJECT CURRENCY GAME PAYOUTS ====================

export async function settleProjectCurrencyGamePayout(
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

  const totalPot = stake * 2;
  const platformFee = totalPot * (platformFeePercent / 100);
  const winnerPayout = totalPot - platformFee;
  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot'];

  return await db.transaction(async (tx) => {
    const [existingSettlement] = await tx.select({ id: projectCurrencyLedger.id })
      .from(projectCurrencyLedger)
      .where(and(
        eq(projectCurrencyLedger.referenceId, sessionId),
        eq(projectCurrencyLedger.userId, winnerId),
        eq(projectCurrencyLedger.type, 'game_win'),
      ))
      .limit(1);

    if (existingSettlement) {
      return { success: true };
    }

    const [id1, id2] = [winnerId, loserId].sort();

    const [wallet1] = await tx.select().from(projectCurrencyWallets)
      .where(eq(projectCurrencyWallets.userId, id1)).for('update');
    const [wallet2] = await tx.select().from(projectCurrencyWallets)
      .where(eq(projectCurrencyWallets.userId, id2)).for('update');

    const winnerWallet = id1 === winnerId ? wallet1 : wallet2;
    const loserWallet = id1 === winnerId ? wallet2 : wallet1;

    if (!winnerWallet || !loserWallet) {
      return { success: false, error: 'Project currency wallet not found' };
    }

    const winnerEarned = parseFloat(winnerWallet.earnedBalance);
    const winnerTotalBalance = parseFloat(winnerWallet.totalBalance);
    const winnerNewEarned = (winnerEarned + winnerPayout).toFixed(8);
    const winnerNewTotal = (winnerTotalBalance + winnerPayout).toFixed(8);

    await tx.update(projectCurrencyWallets).set({
      earnedBalance: winnerNewEarned,
      totalBalance: winnerNewTotal,
      totalEarned: (parseFloat(winnerWallet.totalEarned) + winnerPayout).toFixed(8),
      updatedAt: new Date()
    }).where(eq(projectCurrencyWallets.userId, winnerId));

    await tx.insert(projectCurrencyLedger).values({
      walletId: winnerWallet.id,
      userId: winnerId,
      type: 'game_win',
      amount: winnerPayout.toFixed(8),
      balanceBefore: winnerEarned.toFixed(8),
      balanceAfter: winnerNewEarned,
      description: `${gameType} game win from session ${sessionId}`,
      referenceId: sessionId,
      metadata: JSON.stringify({ balanceType: 'earned' })
    });

    const [winnerUser] = await tx.select().from(users).where(eq(users.id, winnerId)).for('update');
    const [loserUser] = await tx.select().from(users).where(eq(users.id, loserId)).for('update');

    if (winnerUser && loserUser) {
      const winnerStatsUpdates: Record<string, unknown> = {
        gamesPlayed: winnerUser.gamesPlayed + 1,
        gamesWon: winnerUser.gamesWon + 1,
        currentWinStreak: winnerUser.currentWinStreak + 1,
        longestWinStreak: Math.max(winnerUser.longestWinStreak, winnerUser.currentWinStreak + 1),
        updatedAt: new Date()
      };

      if (validGameTypes.includes(gameType)) {
        const playedField = `${gameType}Played`;
        const wonField = `${gameType}Won`;
        winnerStatsUpdates[playedField] = (winnerUser as unknown as Record<string, number>)[playedField] + 1;
        winnerStatsUpdates[wonField] = (winnerUser as unknown as Record<string, number>)[wonField] + 1;
      }

      await tx.update(users).set(winnerStatsUpdates).where(eq(users.id, winnerId));

      const loserStatsUpdates: Record<string, unknown> = {
        gamesPlayed: loserUser.gamesPlayed + 1,
        gamesLost: loserUser.gamesLost + 1,
        currentWinStreak: 0,
        updatedAt: new Date()
      };

      if (validGameTypes.includes(gameType)) {
        const playedField = `${gameType}Played`;
        loserStatsUpdates[playedField] = (loserUser as unknown as Record<string, number>)[playedField] + 1;
      }

      await tx.update(users).set(loserStatsUpdates).where(eq(users.id, loserId));
    }

    await tx.update(liveGameSessions)
      .set({
        status: 'completed',
        winnerId: winnerId,
        endedAt: new Date()
      })
      .where(eq(liveGameSessions.id, sessionId));

    return { success: true };
  });
}
