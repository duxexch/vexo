import { storage } from '../storage';
import { db } from '../db';
import { liveGameSessions, challenges, users, transactions, type TransactionType, type TransactionStatus } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { settleSpectatorSupports } from '../lib/support-settler';
import { broadcastNotification } from '../websocket';
import { logger } from '../lib/logger';
import type { GameRoom } from './types';
import type { GameStatus } from '../game-engines/types';
import { broadcastToRoom } from './utils';

export async function handleGameOver(room: GameRoom, status: GameStatus) {
  try {
    // STEP 1: Atomically lock session + mark completed to prevent double-payout
    // This is a SEPARATE transaction that commits first, so settle functions
    // can safely create their own transactions without deadlocking on this row.
    const session = await db.transaction(async (tx) => {
      // Lock the session row to prevent concurrent handleGameOver calls
      const [sess] = await tx.select().from(liveGameSessions)
        .where(eq(liveGameSessions.id, room.sessionId)).for('update');
      
      if (!sess) {
        console.error('[WS] Session not found for game over:', room.sessionId);
        return null;
      }

      // Guard: prevent double-finish race condition (now under row lock within transaction)
      if (sess.status === 'completed' || (sess.status as string) === 'finished') {
        logger.warn(`[WS] handleGameOver called for already-finished session ${room.sessionId}, skipping`);
        return null;
      }

      // Mark completed immediately to prevent double-payout (commits with this transaction)
      await tx.update(liveGameSessions)
        .set({ status: 'completed' as any, winnerId: status.winner, winningTeam: status.winningTeam, endedAt: new Date(), updatedAt: new Date() })
        .where(eq(liveGameSessions.id, room.sessionId));

      return sess;
    });

    // Guard: session not found or already completed
    if (!session) return;

    // Determine winner and loser for payout
    // FIX: Handle both 2-player and 4-player team games
    const winnerId = status.winner;
    const allPlayerIds = [session.player1Id, session.player2Id, session.player3Id, session.player4Id].filter(Boolean) as string[];
    const loserId = winnerId ? allPlayerIds.find(id => id !== winnerId) || null : null;

    const gameType = session.gameType || 'chess';
    const isDraw = status.isDraw || (status as unknown as Record<string, unknown>).status === 'draw' || (status.winner === null && !status.winningTeam);
    let statsUpdatedInPayout = false;

    // Handle draw payout for paid games — refund both players
    if (session.challengeId && isDraw) {
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, session.challengeId));
      if (challenge && parseFloat(challenge.betAmount) > 0) {
        try {
          const betAmount = challenge.betAmount;
          const parsedBetAmount = parseFloat(betAmount);
          const currencyType = challenge.currencyType || 'usd';
          const player1Id = session.player1Id;
          const player2Id = session.player2Id;
          
          // SECURITY: Atomic draw refund in a single transaction
          await db.transaction(async (drawTx) => {
            const allDrawPlayers = [player1Id, player2Id, session.player3Id, session.player4Id].filter(Boolean) as string[];
            
            if (currencyType === 'project') {
              // PROJECT CURRENCY draw refund
              for (const pid of allDrawPlayers) {
                await drawTx.execute(sql`
                  UPDATE project_currency_wallets 
                  SET earned_balance = (CAST(earned_balance AS DECIMAL(18,8)) + ${parsedBetAmount})::text,
                      total_balance = (CAST(total_balance AS DECIMAL(18,8)) + ${parsedBetAmount})::text,
                      updated_at = NOW()
                  WHERE user_id = ${pid}
                `);
                logger.info(`[WS] Draw refund (project): ${betAmount} credited to player ${pid}`);
              }
            } else {
              // USD draw refund
              for (const pid of allDrawPlayers) {
                await drawTx.update(users)
                  .set({ balance: sql`CAST(CAST(${users.balance} AS DECIMAL(18,2)) + ${parsedBetAmount} AS TEXT)` })
                  .where(eq(users.id, pid));
                logger.info(`[WS] Draw refund (USD): ${betAmount} credited to player ${pid}`);
              }
            }
            
            // Record refund transactions
            const refundRecords: { userId: string; type: TransactionType; amount: string; status: TransactionStatus; description: string; metadata: string; balanceBefore: string; balanceAfter: string }[] = [];
            for (const pid of allDrawPlayers) {
              const player = await storage.getUser(pid);
              const pBalance = parseFloat(player?.balance || '0');
              refundRecords.push({
                userId: pid,
                type: 'game_refund',
                amount: betAmount,
                status: 'completed',
                balanceBefore: (pBalance - parsedBetAmount).toFixed(2),
                balanceAfter: pBalance.toFixed(2),
                description: `Draw refund for game ${room.sessionId}`,
                metadata: JSON.stringify({ sessionId: room.sessionId, reason: 'draw', currency: currencyType })
              });
            }
            if (refundRecords.length > 0) {
              await drawTx.insert(transactions).values(refundRecords);
            }
          });
        } catch (refundError) {
          console.error('[WS] Error refunding draw game:', refundError);
        }
      }
    }

    // STEP 2: Settle payouts — each function has its own atomic transaction
    // No deadlock risk because the session row is already committed as 'completed' above
    if (session.challengeId && winnerId && loserId && !isDraw) {
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, session.challengeId));
      
      if (challenge && parseFloat(challenge.betAmount) > 0) {
        let payoutResult: { success: boolean; error?: string; winnerPayout?: number; loserRefund?: number; commission?: number };
        
        // FIX: For backgammon, multiply bet by doubling cube value
        let effectiveBetAmount = challenge.betAmount;
        if (gameType === 'backgammon' && room.gameState) {
          try {
            const bgState = JSON.parse(room.gameState);
            if (bgState.doublingCube && bgState.doublingCube > 1) {
              const multiplied = parseFloat(challenge.betAmount) * bgState.doublingCube;
              effectiveBetAmount = multiplied.toFixed(2);
              logger.info(`[WS] Backgammon doubling cube x${bgState.doublingCube}: bet ${challenge.betAmount} → ${effectiveBetAmount}`);
            }
          } catch {
            // If state parsing fails, use original bet amount
          }
        }
        
        // SECURITY: Fetch commission from challenge_settings (not hardcoded 0)
        const challengeConfig = await storage.getChallengeSettings(gameType);
        const commissionPercent = parseFloat(challengeConfig.commissionPercent);
        
        // Determine if this is a resignation/surrender/timeout/disconnect/abandonment
        const isResignation = ['resignation', 'timeout', 'disconnect', 'abandonment'].includes(status.reason || '');
        
        if (isResignation && challenge.currencyType !== 'project') {
          // SURRENDER PAYOUT: 70/30 split (configurable from admin)
          const surrenderWinnerPercent = parseFloat(challengeConfig.surrenderWinnerPercent);
          const surrenderLoserRefundPercent = parseFloat(challengeConfig.surrenderLoserRefundPercent);
          
          payoutResult = await storage.settleResignationPayout(
            room.sessionId,
            winnerId,
            loserId,
            effectiveBetAmount,
            commissionPercent,
            surrenderWinnerPercent,
            surrenderLoserRefundPercent,
            gameType
          );
          
          if (payoutResult.success) {
            statsUpdatedInPayout = true;
            logger.info(`[WS] Resignation payout settled: winner=${winnerId} gets $${payoutResult.winnerPayout?.toFixed(2)}, loser=${loserId} refund $${payoutResult.loserRefund?.toFixed(2)}, commission=$${payoutResult.commission?.toFixed(2)}`);
          }
        } else if (challenge.currencyType === 'project') {
          // Project currency payout (with actual commission)
          payoutResult = await storage.settleProjectCurrencyGamePayout(
            room.sessionId,
            winnerId,
            loserId,
            effectiveBetAmount,
            commissionPercent,
            gameType
          );
          logger.info(`[WS] Using project currency payout for game ${room.sessionId}, commission=${commissionPercent}%`);
        } else {
          // Normal win payout (with actual commission)
          payoutResult = await storage.settleGamePayout(
            room.sessionId,
            winnerId,
            loserId,
            effectiveBetAmount,
            commissionPercent,
            gameType
          );
        }

        if (!payoutResult.success) {
          console.error('[WS] Payout failed:', payoutResult.error);
        } else {
          statsUpdatedInPayout = true;
          logger.info(`[WS] Game payout settled: winner=${winnerId}, stake=${challenge.betAmount}, commission=${commissionPercent}%, currency=${challenge.currencyType || 'usd'}, reason=${status.reason || 'normal'}`);
        }
      }

      // Settle spectator supports for this challenge
      try {
        const winnerSupportPlayerIds = status.winningTeam !== undefined
          ? (status.winningTeam === 0
              ? [session.player1Id, session.player3Id].filter(Boolean) as string[]
              : [session.player2Id, session.player4Id].filter(Boolean) as string[])
          : (winnerId ? [winnerId] : []);

        const settlementResult = await settleSpectatorSupports(session.challengeId, winnerId, winnerSupportPlayerIds);
        if (!settlementResult.success) {
          console.error('[WS] Spectator support settlement had errors:', settlementResult.errors);
        } else {
          logger.info(`[WS] Spectator supports settled: ${settlementResult.settledMatches} matches, ${settlementResult.refundedSupports} refunded`);
        }
      } catch (settleError) {
        console.error('[WS] Error settling spectator supports:', settleError);
      }
    }

    // STEP 3: Update challenge status to 'completed' so it's removed from Arena active list
    if (session.challengeId) {
      await db.update(challenges)
        .set({ 
          status: 'completed',
          winnerId: winnerId || undefined,
          endedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(challenges.id, session.challengeId));
    }

    // Update stats for non-paid games or draws only (skip if paid game payout was attempted)
    const isPaidGame = session.challengeId && !isDraw;
    if (!statsUpdatedInPayout && !isPaidGame) {
      try {
        await storage.updateGameStats(
          room.sessionId,
          gameType,
          status.winner || null,
          session.player1Id!,
          session.player2Id ?? null,
          isDraw,
          '0'
        );
        logger.info(`[WS] Game stats updated for session ${room.sessionId}`);
      } catch (statsError) {
        console.error('[WS] Error updating game stats:', statsError);
      }
    } else if (isPaidGame && !statsUpdatedInPayout) {
      console.error(`[WS] Stats not updated for paid game ${room.sessionId} due to payout failure`);
    }

    // Post-payout: broadcast and notifications (these don't need atomicity)

    broadcastToRoom(room, {
      type: 'game_over',
      payload: status
    });

    // Send notifications to winner and loser
    try {
      const gameName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
      const allNotifPlayerIds = [session.player1Id, session.player2Id, session.player3Id, session.player4Id].filter(Boolean) as string[];
      const loserIds = winnerId ? allNotifPlayerIds.filter(id => id !== winnerId) : [];
      const winner = winnerId ? await storage.getUser(winnerId) : null;
      
      if (winner && winnerId && !isDraw) {
        // FIX: For team games, notify all winners (0-indexed: team0=p1+p3, team1=p2+p4)
        const winnerIds = status.winningTeam !== undefined
          ? (status.winningTeam === 0 
            ? [session.player1Id, session.player3Id].filter(Boolean) as string[]
            : [session.player2Id, session.player4Id].filter(Boolean) as string[])
          : [winnerId];
        
        await broadcastNotification({
          type: 'transaction',
          priority: 'normal',
          title: 'Victory!',
          titleAr: 'فوز!',
          message: `Congratulations! You won the ${gameName} match!`,
          messageAr: `مبروك! فزت في مباراة ${gameName}!`,
          link: `/history`,
          metadata: JSON.stringify({ sessionId: room.sessionId, gameType: gameType, result: 'win' })
        }, winnerIds);

        // FIX: Send loser notification (was missing entirely)
        if (loserIds.length > 0) {
          const loserNotifIds = status.winningTeam !== undefined
            ? (status.winningTeam === 0
              ? [session.player2Id, session.player4Id].filter(Boolean) as string[]
              : [session.player1Id, session.player3Id].filter(Boolean) as string[])
            : loserIds;
          
          await broadcastNotification({
            type: 'transaction',
            priority: 'normal',
            title: 'Defeat',
            titleAr: 'خسارة',
            message: `You lost the ${gameName} match. Better luck next time!`,
            messageAr: `خسرت في مباراة ${gameName}. حظ أوفر في المرة القادمة!`,
            link: `/history`,
            metadata: JSON.stringify({ sessionId: room.sessionId, gameType: gameType, result: 'loss' })
          }, loserNotifIds);
        }
      }
      
      if (isDraw) {
        const drawPlayerIds = allNotifPlayerIds.length > 0 ? allNotifPlayerIds : Array.from(room.players.keys());
        if (drawPlayerIds.length > 0) {
          await broadcastNotification({
            type: 'transaction',
            priority: 'normal',
            title: 'Draw!',
            titleAr: 'تعادل!',
            message: `The ${gameName} match ended in a draw.`,
            messageAr: `انتهت مباراة ${gameName} بالتعادل.`,
            link: `/history`,
            metadata: JSON.stringify({ sessionId: room.sessionId, gameType: gameType, result: 'draw' })
          }, drawPlayerIds);
        }
      }
    } catch (notifError) {
      console.error('[WS] Error sending game over notifications:', notifError);
    }
  } catch (error) {
    console.error('[WS] Error handling game over:', error);
  }
}
