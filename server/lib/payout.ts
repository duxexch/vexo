/**
 * Shared payout settlement logic — used by BOTH websocket.ts and game-websocket.ts
 * Ensures consistent financial settlement regardless of which WS system handles the game
 */
import { db } from '../db';
import { storage } from '../storage';
import { challenges, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
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

async function settleHeadToHeadPayout(
  challenge: ChallengeRecord,
  winnerId: string,
  loserId: string,
  gameType: string,
  sessionId?: string,
): Promise<{ success: boolean; error?: string }> {
  const betAmount = parseFloat(challenge.betAmount);

  if (betAmount <= 0) {
    await storage.updateGameStats(
      sessionId || challenge.id,
      gameType,
      winnerId,
      winnerId,
      loserId,
      false,
      '0'
    );
    return { success: true };
  }

  if (challenge.currencyType === 'project') {
    return storage.settleProjectCurrencyGamePayout(
      sessionId || challenge.id,
      winnerId,
      loserId,
      challenge.betAmount,
      0,
      gameType
    );
  }

  return storage.settleGamePayout(
    sessionId || challenge.id,
    winnerId,
    loserId,
    challenge.betAmount,
    0,
    gameType
  );
}

async function updateDrawStatsForPlayers(playerIds: string[], gameType: string): Promise<void> {
  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot'];
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
  sessionId?: string
): Promise<PayoutResult> {
  try {
    // Get challenge to read amount and currency
    const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
    if (!challenge) {
      return { success: false, error: 'Challenge not found' };
    }

    const { winners, losers } = resolveWinnerLoserTeams(challenge, winnerId);
    if (winners.length === 0 || losers.length === 0) {
      return { success: false, error: 'Unable to resolve winners/losers for payout' };
    }

    const pairCount = Math.min(winners.length, losers.length);
    for (let i = 0; i < pairCount; i += 1) {
      const settleResult = await settleHeadToHeadPayout(
        challenge,
        winners[i],
        losers[i],
        gameType,
        sessionId,
      );

      if (!settleResult.success) {
        logger.error(`[Payout] Settlement failed for challenge ${challengeId}: ${settleResult.error}`);
        return { success: false, error: settleResult.error };
      }
    }

    logger.info(`[Payout] Settled: challenge=${challengeId}, winner=${winnerId}, stake=${challenge.betAmount}, currency=${challenge.currencyType || 'usd'}`);

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

    return { success: true, winnerId, loserId, stakeAmount: challenge.betAmount };
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

    const allPlayerIds = Array.from(new Set([
      player1Id,
      player2Id,
      ...additionalPlayerIds,
    ].filter(Boolean)));

    const betAmount = parseFloat(challenge.betAmount);
    if (betAmount > 0) {
      // Refund all seated players their entries
      for (const playerId of allPlayerIds) {
        await storage.updateUserBalanceWithCheck(playerId, challenge.betAmount, 'add');
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
