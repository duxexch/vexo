import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { users, projectCurrencyWallets, challenges as challengesTable, liveGameSessions, transactions } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { broadcastChallengeUpdate } from "../../websocket";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";

export function registerWithdrawRoutes(app: Express) {
  app.post("/api/challenges/:id/withdraw", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const challengeId = req.params.id;
      
      // Atomic transaction: lock row, verify status, refund, cancel — all or nothing
      const result = await db.transaction(async (tx) => {
        // Lock the challenge row for update — allow ANY player to withdraw (not just creator)
        const [dbChallenge] = await tx.select().from(challengesTable)
          .where(eq(challengesTable.id, challengeId))
          .for('update');
        
        if (!dbChallenge) {
          throw new Error("Challenge not found");
        }
        
        // Verify the user is a player in this challenge
        const allPlayerIds = [dbChallenge.player1Id, dbChallenge.player2Id, dbChallenge.player3Id, dbChallenge.player4Id].filter(Boolean);
        if (!allPlayerIds.includes(userId)) {
          throw new Error("You are not a player in this challenge");
        }
        
        if (dbChallenge.status !== 'waiting' && dbChallenge.status !== 'active') {
          throw new Error("Can only withdraw waiting or active challenges");
        }
        
        const betAmount = parseFloat(dbChallenge.betAmount || '0');
        const currencyType = dbChallenge.currencyType || 'usd';
        const challengeConfig = await storage.getChallengeSettings(dbChallenge.gameType);
        
        // ========== CASE 1: WAITING — nobody accepted yet → full refund, no penalty ==========
        if (dbChallenge.status === 'waiting') {
          const refundAmount = betAmount;
          const penalty = 0;
          
          // Refund creator fully
          if (refundAmount > 0) {
            if (currencyType === 'project') {
              const [wallet] = await tx.select().from(projectCurrencyWallets)
                .where(eq(projectCurrencyWallets.userId, userId))
                .for('update');
              if (wallet) {
                const newEarned = (parseFloat(wallet.earnedBalance) + refundAmount).toFixed(8);
                const newTotal = (parseFloat(wallet.totalBalance) + refundAmount).toFixed(8);
                await tx.update(projectCurrencyWallets)
                  .set({ earnedBalance: newEarned, totalBalance: newTotal, updatedAt: new Date() })
                  .where(eq(projectCurrencyWallets.userId, userId));
              }
            } else {
              await tx.update(users)
                .set({ 
                  balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${refundAmount.toFixed(2)})::text`,
                  updatedAt: new Date() 
                })
                .where(eq(users.id, userId));
            }
          }
          
          const [cancelled] = await tx.update(challengesTable)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(and(eq(challengesTable.id, challengeId), eq(challengesTable.status, 'waiting')))
            .returning();
          
          if (!cancelled) throw new Error("Challenge was already processed");
          return { challenge: cancelled, penalty, refundAmount, otherPlayerRefund: 0, isActive: false };
        }
        
        // ========== CASE 2: ACTIVE — challenge accepted, game started → 70% penalty ==========
        const ACTIVE_PENALTY_PERCENT = 70;
        const penalty = betAmount * (ACTIVE_PENALTY_PERCENT / 100);
        const withdrawerRefund = betAmount - penalty; // 30% back to withdrawer
        
        // Other player(s) get full refund of their stake
        const otherPlayerIds = allPlayerIds.filter(id => id !== userId) as string[];
        
        // Refund withdrawing player 30% (they lose 70%)
        if (withdrawerRefund > 0) {
          if (currencyType === 'project') {
            const [wallet] = await tx.select().from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, userId))
              .for('update');
            if (wallet) {
              const newEarned = (parseFloat(wallet.earnedBalance) + withdrawerRefund).toFixed(8);
              const newTotal = (parseFloat(wallet.totalBalance) + withdrawerRefund).toFixed(8);
              await tx.update(projectCurrencyWallets)
                .set({ earnedBalance: newEarned, totalBalance: newTotal, updatedAt: new Date() })
                .where(eq(projectCurrencyWallets.userId, userId));
            }
          } else {
            await tx.update(users)
              .set({ 
                balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${withdrawerRefund.toFixed(2)})::text`,
                updatedAt: new Date() 
              })
              .where(eq(users.id, userId));
          }
        }
        
        // Refund other player(s) their full stake
        for (const otherPlayerId of otherPlayerIds) {
          if (currencyType === 'project') {
            const [wallet] = await tx.select().from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, otherPlayerId))
              .for('update');
            if (wallet) {
              const newEarned = (parseFloat(wallet.earnedBalance) + betAmount).toFixed(8);
              const newTotal = (parseFloat(wallet.totalBalance) + betAmount).toFixed(8);
              await tx.update(projectCurrencyWallets)
                .set({ earnedBalance: newEarned, totalBalance: newTotal, updatedAt: new Date() })
                .where(eq(projectCurrencyWallets.userId, otherPlayerId));
            }
          } else {
            await tx.update(users)
              .set({ 
                balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount.toFixed(2)})::text`,
                updatedAt: new Date() 
              })
              .where(eq(users.id, otherPlayerId));
          }
        }
        
        // Cancel the challenge
        const [cancelled] = await tx.update(challengesTable)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(challengesTable.id, challengeId), eq(challengesTable.status, 'active')))
          .returning();
        
        if (!cancelled) throw new Error("Challenge was already processed");
        
        // Close any live game session for this challenge
        await tx.update(liveGameSessions)
          .set({ status: 'completed', endedAt: new Date() })
          .where(and(eq(liveGameSessions.challengeId, challengeId), eq(liveGameSessions.status, 'in_progress')));
        
        // CRITICAL: Record penalty as platform revenue — prevents money leak
        if (penalty > 0) {
          await tx.insert(transactions).values({
            userId: userId,
            type: 'platform_fee',
            amount: penalty.toFixed(2),
            balanceBefore: '0',
            balanceAfter: '0',
            status: 'completed',
            description: `Withdrawal penalty (${ACTIVE_PENALTY_PERCENT}%) from active challenge ${challengeId}`,
            referenceId: challengeId,
            processedAt: new Date()
          });
        }
        
        // Record withdrawer refund transaction for audit trail
        await tx.insert(transactions).values({
          userId: userId,
          type: 'game_refund',
          amount: withdrawerRefund.toFixed(2),
          balanceBefore: (betAmount).toFixed(2),
          balanceAfter: withdrawerRefund.toFixed(2),
          status: 'completed',
          description: `Partial refund (${100 - ACTIVE_PENALTY_PERCENT}%) for active challenge withdrawal ${challengeId}`,
          referenceId: challengeId,
          processedAt: new Date()
        });
        
        // Record full refund transactions for other players
        for (const otherPlayerId of otherPlayerIds) {
          await tx.insert(transactions).values({
            userId: otherPlayerId,
            type: 'game_refund',
            amount: betAmount.toFixed(2),
            balanceBefore: '0',
            balanceAfter: betAmount.toFixed(2),
            status: 'completed',
            description: `Full refund — opponent withdrew from active challenge ${challengeId}`,
            referenceId: challengeId,
            processedAt: new Date()
          });
        }
        
        return { challenge: cancelled, penalty, refundAmount: withdrawerRefund, otherPlayerRefund: betAmount, isActive: true, otherPlayerIds };
      });
      
      // Broadcast outside transaction
      broadcastChallengeUpdate('cancelled', result.challenge);
      
      // Notify withdrawing player
      if (result.isActive) {
        // ACTIVE withdrawal — 70% penalty
        await sendNotification(userId, {
          type: 'warning',
          priority: 'high',
          title: 'Challenge Withdrawn — Penalty Applied',
          titleAr: 'تم سحب التحدي — تم تطبيق العقوبة',
          message: `You withdrew from an active challenge. Penalty: $${result.penalty.toFixed(2)} (70%). Refund: $${result.refundAmount.toFixed(2)}.`,
          messageAr: `انسحبت من تحدي نشط. الغرامة: $${result.penalty.toFixed(2)} (70%). الاسترداد: $${result.refundAmount.toFixed(2)}.`,
          link: '/challenges',
          metadata: JSON.stringify({ challengeId, penalty: result.penalty, refund: result.refundAmount, type: 'active_withdraw' }),
        }).catch(() => {});
        
        // Notify other player(s) — full refund
        const withdrawer = await storage.getUser(userId);
        for (const otherPlayerId of (result.otherPlayerIds || [])) {
          await sendNotification(otherPlayerId, {
            type: 'system',
            priority: 'high',
            title: 'Opponent Withdrew — Full Refund',
            titleAr: 'انسحب الخصم — استرداد كامل',
            message: `${withdrawer?.nickname || withdrawer?.username || 'Your opponent'} withdrew from the challenge. Your stake of $${result.otherPlayerRefund.toFixed(2)} has been fully refunded.`,
            messageAr: `انسحب ${withdrawer?.nickname || withdrawer?.username || 'خصمك'} من التحدي. تم استرداد رهانك بالكامل: $${result.otherPlayerRefund.toFixed(2)}.`,
            link: '/challenges',
            metadata: JSON.stringify({ challengeId, refund: result.otherPlayerRefund, type: 'opponent_withdraw' }),
          }).catch(() => {});
        }
      } else {
        // WAITING withdrawal — no penalty
        await sendNotification(userId, {
          type: 'system',
          priority: 'normal',
          title: 'Challenge Cancelled',
          titleAr: 'تم إلغاء التحدي',
          message: `Your challenge was cancelled. Full refund: $${result.refundAmount.toFixed(2)}.`,
          messageAr: `تم إلغاء التحدي. استرداد كامل: $${result.refundAmount.toFixed(2)}.`,
          link: '/challenges',
          metadata: JSON.stringify({ challengeId, refund: result.refundAmount, type: 'waiting_cancel' }),
        }).catch(() => {});
      }
      
      res.json({ ...result.challenge, penalty: result.penalty, refundAmount: result.refundAmount });
    } catch (error: unknown) {
      const status = getErrorMessage(error).includes('not found') || getErrorMessage(error).includes('not a player') ? 404 : 
                     getErrorMessage(error).includes('only withdraw') || getErrorMessage(error).includes('already processed') ? 400 : 500;
      res.status(status).json({ error: getErrorMessage(error) });
    }
  });
}
