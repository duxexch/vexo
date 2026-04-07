/**
 * Shared payout settlement logic — used by BOTH websocket.ts and game-websocket.ts
 * Ensures consistent financial settlement regardless of which WS system handles the game
 */
import { db } from '../db';
import { storage } from '../storage';
import { challenges, users, transactions, projectCurrencyLedger, projectCurrencyWallets, liveGameSessions } from '@shared/schema';
import { and, eq, or } from 'drizzle-orm';
import { settleSpectatorSupports } from './support-settler';
import { refundPendingSupports } from './support-settler';
import { logger } from './logger';
import { getErrorMessage } from '../routes/helpers';

interface PayoutResult {
  success: boolean;
  error?: string;
  winnerId?: string;
  loserId?: string;
  stakeAmount?: string;
}

type ChallengeRecord = typeof challenges.$inferSelect;

function getChallengePlayerIds(challenge: ChallengeRecord): string[] {
  return [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id]
    .filter(Boolean) as string[];
}

function getChallengeTeams(challenge: ChallengeRecord): { team1: string[]; team2: string[] } {
  const requiredPlayers = Number(challenge.requiredPlayers || 2);
  if (requiredPlayers >= 4) {
    return {
      team1: [challenge.player1Id, challenge.player3Id].filter(Boolean) as string[],
      team2: [challenge.player2Id, challenge.player4Id].filter(Boolean) as string[],
    };
  }

  return {
    team1: [challenge.player1Id].filter(Boolean) as string[],
    team2: [challenge.player2Id].filter(Boolean) as string[],
  };
}

function resolveWinnerLoserTeams(challenge: ChallengeRecord, winnerId: string): { winners: string[]; losers: string[] } {
  const { team1, team2 } = getChallengeTeams(challenge);

  if (team1.includes(winnerId)) {
    return { winners: team1, losers: team2 };
  }

  if (team2.includes(winnerId)) {
    return { winners: team2, losers: team1 };
  }

  const allPlayers = getChallengePlayerIds(challenge);
  const fallbackLoser = allPlayers.find((id) => id !== winnerId);
  return {
    winners: [winnerId],
    losers: fallbackLoser ? [fallbackLoser] : [],
  };
}

function normalizeBackgammonCube(candidate: unknown): number | null {
  const cube = Number(candidate);
  if (!Number.isFinite(cube)) {
    return null;
  }

  const allowed = new Set([1, 2, 4, 8, 16, 32, 64]);
  if (!allowed.has(cube)) {
    return null;
  }

  return cube;
}

function resolveEffectiveStakeAmount(
  baseStakeAmount: string,
  gameType: string,
  settlementStateJson?: string,
): string {
  if (gameType !== 'backgammon' || !settlementStateJson) {
    return baseStakeAmount;
  }

  try {
    const parsed = JSON.parse(settlementStateJson) as { doublingCube?: unknown };
    const cube = normalizeBackgammonCube(parsed?.doublingCube);
    if (!cube || cube <= 1) {
      return baseStakeAmount;
    }

    const base = parseFloat(baseStakeAmount);
    if (!Number.isFinite(base) || base <= 0) {
      return baseStakeAmount;
    }

    return (base * cube).toFixed(2);
  } catch (error: unknown) {
    logger.warn(`[Payout] Failed to parse settlement state for cube multiplier: ${getErrorMessage(error)}`);
    return baseStakeAmount;
  }
}

async function hasWinnerPayoutRecord(referenceId: string, winnerId: string, currencyType: string): Promise<boolean> {
  if (currencyType === 'project') {
    const [existingLedger] = await db.select({ id: projectCurrencyLedger.id })
      .from(projectCurrencyLedger)
      .where(and(
        eq(projectCurrencyLedger.referenceId, referenceId),
        eq(projectCurrencyLedger.userId, winnerId),
        eq(projectCurrencyLedger.type, 'game_win'),
      ))
      .limit(1);

    return Boolean(existingLedger);
  }

  const [existingTx] = await db.select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.referenceId, referenceId),
      eq(transactions.userId, winnerId),
      eq(transactions.type, 'win'),
      eq(transactions.status, 'completed'),
    ))
    .limit(1);

  return Boolean(existingTx);
}

async function hasDrawRefundRecord(referenceId: string, currencyType: string): Promise<boolean> {
  if (currencyType === 'project') {
    const [existingLedger] = await db.select({ id: projectCurrencyLedger.id })
      .from(projectCurrencyLedger)
      .where(and(
        eq(projectCurrencyLedger.referenceId, referenceId),
        eq(projectCurrencyLedger.type, 'refund'),
        eq(projectCurrencyLedger.referenceType, 'challenge_draw_refund'),
      ))
      .limit(1);

    return Boolean(existingLedger);
  }

  const [existingTx] = await db.select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.referenceId, referenceId),
      eq(transactions.type, 'game_refund'),
      eq(transactions.status, 'completed'),
    ))
    .limit(1);

  return Boolean(existingTx);
}

async function settleHeadToHeadPayout(
  challenge: ChallengeRecord,
  winnerId: string,
  loserId: string,
  gameType: string,
  sessionId?: string,
  effectiveStakeAmount?: string,
): Promise<{ success: boolean; error?: string }> {
  const stakeAmount = effectiveStakeAmount || challenge.betAmount;
  const betAmount = parseFloat(stakeAmount);

  if (betAmount <= 0) {
    await storage.updateGameStats(
      sessionId || challenge.id,
      gameType,
      winnerId,
      winnerId,
      loserId,
      false,
      '0',
    );
    return { success: true };
  }

  if (challenge.currencyType === 'project') {
    return storage.settleProjectCurrencyGamePayout(
      sessionId || challenge.id,
      winnerId,
      loserId,
      stakeAmount,
      0,
      gameType,
    );
  }

  return storage.settleGamePayout(
    sessionId || challenge.id,
    winnerId,
    loserId,
    stakeAmount,
    0,
    gameType,
  );
}

async function updateDrawStatsForPlayers(playerIds: string[], gameType: string): Promise<void> {
  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot', 'languageduel'];
  const isValidGameType = validGameTypes.includes(gameType);
  const uniquePlayerIds = Array.from(new Set(playerIds));

  if (uniquePlayerIds.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    const sortedIds = [...uniquePlayerIds].sort();
    const lockedUsers: Record<string, typeof users.$inferSelect> = {};

    for (const id of sortedIds) {
      const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (user) lockedUsers[id] = user;
    }

    for (const playerId of uniquePlayerIds) {
      const user = lockedUsers[playerId];
      if (!user) continue;

      const updates: Record<string, unknown> = {
        gamesPlayed: user.gamesPlayed + 1,
        gamesDraw: user.gamesDraw + 1,
        currentWinStreak: 0,
        updatedAt: new Date(),
      };

      if (isValidGameType) {
        const playedField = `${gameType}Played`;
        updates[playedField] = (user as unknown as Record<string, number>)[playedField] + 1;
      }

      await tx.update(users).set(updates).where(eq(users.id, playerId));
    }
  });
}

/**
 * Settle payout for a challenge game — works with both session table types
 * Called from: websocket.ts (challenge games) and game-websocket.ts (live sessions)
 */
export async function settleChallengePayout(
  challengeId: string,
  winnerId: string,
  loserId: string,
  gameType: string,
  sessionId?: string,
  settlementStateJson?: string,
): Promise<PayoutResult> {
  try {
    // Get challenge to read amount and currency
    const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
    if (!challenge) {
      return { success: false, error: 'Challenge not found' };
    }

    const settlementReferenceId = sessionId || challenge.id;
    const effectiveStakeAmount = resolveEffectiveStakeAmount(
      challenge.betAmount,
      gameType,
      settlementStateJson,
    );
    const { winners, losers } = resolveWinnerLoserTeams(challenge, winnerId);
    if (winners.length === 0 || losers.length === 0) {
      return { success: false, error: 'Unable to resolve winners/losers for payout' };
    }

    const pairCount = Math.min(winners.length, losers.length);
    for (let i = 0; i < pairCount; i += 1) {
      const alreadySettled = await hasWinnerPayoutRecord(
        settlementReferenceId,
        winners[i],
        challenge.currencyType || 'usd',
      );

      if (alreadySettled) {
        logger.warn(`[Payout] Duplicate settlement prevented for challenge ${challengeId}, winner=${winners[i]}`);
        continue;
      }

      const settleResult = await settleHeadToHeadPayout(
        challenge,
        winners[i],
        losers[i],
        gameType,
        settlementReferenceId,
        effectiveStakeAmount,
      );

      if (!settleResult.success) {
        logger.error(`[Payout] Settlement failed for challenge ${challengeId}: ${settleResult.error}`);
        return { success: false, error: settleResult.error };
      }
    }

    logger.info(`[Payout] Settled: challenge=${challengeId}, winner=${winnerId}, stake=${effectiveStakeAmount}, currency=${challenge.currencyType || 'usd'}`);

    // Settle spectator supports
    try {
      const settlementResult = await settleSpectatorSupports(challengeId, winnerId, winners);
      if (!settlementResult.success) {
        logger.error(`[Payout] Spectator support settlement errors: ${JSON.stringify(settlementResult.errors)}`);
      } else {
        logger.info(`[Payout] Spectator supports settled: ${settlementResult.settledMatches} matches, ${settlementResult.refundedSupports} refunded`);
      }
    } catch (settleError) {
      logger.error(`[Payout] Error settling spectator supports: ${settleError}`);
    }

    return { success: true, winnerId, loserId, stakeAmount: effectiveStakeAmount };
  } catch (error: unknown) {
    logger.error(`[Payout] Unexpected error for challenge ${challengeId}: ${getErrorMessage(error)}`);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Handle draw payout — refund both players' entries
 */
export async function settleDrawPayout(
  challengeId: string,
  player1Id: string,
  player2Id: string,
  gameType: string,
  sessionId?: string,
  additionalPlayerIds: string[] = []
): Promise<PayoutResult> {
  try {
    const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
    if (!challenge) {
      return { success: false, error: 'Challenge not found' };
    }

    const settlementReferenceId = sessionId || challengeId;
    const alreadyRefunded = await hasDrawRefundRecord(
      settlementReferenceId,
      challenge.currencyType || 'usd',
    );

    if (alreadyRefunded) {
      logger.warn(`[Payout] Duplicate draw refund prevented for challenge ${challengeId}`);
      return { success: true, stakeAmount: challenge.betAmount };
    }

    const allPlayerIds = Array.from(new Set([
      player1Id,
      player2Id,
      ...additionalPlayerIds,
    ].filter(Boolean)));

    const betAmount = parseFloat(challenge.betAmount);
    if (betAmount > 0) {
      if ((challenge.currencyType || 'usd') === 'project') {
        await db.transaction(async (tx) => {
          const sortedPlayerIds = [...allPlayerIds].sort();
          const walletsByUserId = new Map<string, typeof projectCurrencyWallets.$inferSelect>();

          for (const playerId of sortedPlayerIds) {
            const [wallet] = await tx.select().from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, playerId))
              .for('update');

            if (!wallet) {
              throw new Error(`Project currency wallet not found for user ${playerId}`);
            }

            walletsByUserId.set(playerId, wallet);
          }

          for (const playerId of allPlayerIds) {
            const wallet = walletsByUserId.get(playerId);
            if (!wallet) continue;

            const earnedBefore = parseFloat(wallet.earnedBalance || '0');
            const totalBefore = parseFloat(wallet.totalBalance || '0');
            const earnedAfter = (earnedBefore + betAmount).toFixed(8);
            const totalAfter = (totalBefore + betAmount).toFixed(8);

            await tx.update(projectCurrencyWallets)
              .set({
                earnedBalance: earnedAfter,
                totalBalance: totalAfter,
                updatedAt: new Date(),
              })
              .where(eq(projectCurrencyWallets.userId, playerId));

            await tx.insert(projectCurrencyLedger).values({
              walletId: wallet.id,
              userId: playerId,
              type: 'refund',
              amount: challenge.betAmount,
              balanceBefore: earnedBefore.toFixed(8),
              balanceAfter: earnedAfter,
              referenceId: settlementReferenceId,
              referenceType: 'challenge_draw_refund',
              description: `Draw refund for challenge ${challengeId}`,
              metadata: JSON.stringify({ challengeId, reason: 'draw' }),
            });
          }
        });
      } else {
        await db.transaction(async (tx) => {
          const sortedPlayerIds = [...allPlayerIds].sort();
          const usersById = new Map<string, typeof users.$inferSelect>();

          for (const playerId of sortedPlayerIds) {
            const [user] = await tx.select().from(users)
              .where(eq(users.id, playerId))
              .for('update');

            if (!user) {
              throw new Error(`User not found for draw refund: ${playerId}`);
            }

            usersById.set(playerId, user);
          }

          for (const playerId of allPlayerIds) {
            const user = usersById.get(playerId);
            if (!user) continue;

            const balanceBefore = parseFloat(user.balance || '0');
            const balanceAfter = (balanceBefore + betAmount).toFixed(2);

            await tx.update(users)
              .set({ balance: balanceAfter, updatedAt: new Date() })
              .where(eq(users.id, playerId));

            await tx.insert(transactions).values({
              userId: playerId,
              type: 'game_refund',
              status: 'completed',
              amount: challenge.betAmount,
              balanceBefore: balanceBefore.toFixed(2),
              balanceAfter,
              description: `Draw refund for challenge ${challengeId}`,
              referenceId: settlementReferenceId,
              processedAt: new Date(),
            });
          }
        });
      }

      logger.info(`[Payout] Draw refund: challenge=${challengeId}, refunded ${challenge.betAmount} to ${allPlayerIds.length} players`);
    }

    // Update stats
    if (allPlayerIds.length <= 2) {
      await storage.updateGameStats(
        sessionId || challengeId,
        gameType,
        null,
        player1Id,
        player2Id,
        true,
        '0'
      );
    } else {
      await updateDrawStatsForPlayers(allPlayerIds, gameType);
    }

    // Keep live sessions in sync so profile match history reflects completed draws.
    await db.update(liveGameSessions)
      .set({
        status: 'completed',
        winnerId: null,
        endedAt: new Date(),
      })
      .where(or(
        eq(liveGameSessions.id, settlementReferenceId),
        eq(liveGameSessions.challengeId, challengeId),
      ));

    // Refund spectator supports (matched + pending)
    try {
      const settlementResult = await refundPendingSupports(challengeId);
      logger.info(`[Payout] Draw spectator refunds: ${settlementResult.refundedSupports} refunded`);
    } catch (e) {
      logger.error(`[Payout] Error refunding spectator supports on draw: ${e}`);
    }

    return { success: true, stakeAmount: challenge.betAmount };
  } catch (error: unknown) {
    logger.error(`[Payout] Draw settlement error: ${getErrorMessage(error)}`);
    return { success: false, error: getErrorMessage(error) };
  }
}
