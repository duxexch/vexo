import type { Express, Response } from "express";
import { challenges, projectCurrencyLedger, projectCurrencyWallets, users } from "@shared/schema";
import { db } from "../../db";
import { and, eq, sql } from "drizzle-orm";
import { sendNotification } from "../../websocket";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerChallengeCancelRoutes(app: Express) {

  app.post("/api/admin/challenges/:id/cancel", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const result = await db.transaction(async (tx) => {
        const [challenge] = await tx.select().from(challenges)
          .where(eq(challenges.id, id))
          .for('update');

        if (!challenge) throw new Error("Challenge not found");
        if (challenge.status === 'completed' || challenge.status === 'cancelled') {
          throw new Error("Challenge is already finished or cancelled");
        }

        const betAmount = parseFloat(challenge.betAmount || '0');
        const currencyType = challenge.currencyType || 'usd';

        const participants = [
          challenge.player1Id,
          challenge.player2Id,
          challenge.player3Id,
          challenge.player4Id,
        ].filter((value): value is string => Boolean(value));

        if (betAmount > 0) {
          if (currencyType === 'project') {
            for (const playerId of participants) {
              const refundReferenceId = `challenge_cancel_refund:${id}:${playerId}`;

              const [existingRefund] = await tx.select({ id: projectCurrencyLedger.id })
                .from(projectCurrencyLedger)
                .where(and(
                  eq(projectCurrencyLedger.userId, playerId),
                  eq(projectCurrencyLedger.referenceId, refundReferenceId),
                  eq(projectCurrencyLedger.referenceType, "challenge_cancel_refund"),
                ))
                .for('update')
                .limit(1);

              if (existingRefund) {
                continue;
              }

              await tx.execute(sql`
                INSERT INTO project_currency_wallets (user_id)
                VALUES (${playerId})
                ON CONFLICT (user_id) DO NOTHING
              `);

              const [wallet] = await tx.select()
                .from(projectCurrencyWallets)
                .where(eq(projectCurrencyWallets.userId, playerId))
                .for('update')
                .limit(1);

              if (!wallet) {
                throw new Error(`Project currency wallet not found for user ${playerId}`);
              }

              const earnedBefore = parseFloat(wallet.earnedBalance || "0");
              const balanceBefore = parseFloat(wallet.totalBalance || "0");
              const earnedAfter = (earnedBefore + betAmount).toFixed(2);
              const balanceAfter = (balanceBefore + betAmount).toFixed(2);

              await tx.update(projectCurrencyWallets)
                .set({
                  earnedBalance: earnedAfter,
                  totalBalance: balanceAfter,
                  updatedAt: new Date(),
                })
                .where(eq(projectCurrencyWallets.id, wallet.id));

              await tx.insert(projectCurrencyLedger).values({
                userId: playerId,
                walletId: wallet.id,
                type: "refund",
                amount: betAmount.toFixed(2),
                balanceBefore: balanceBefore.toFixed(2),
                balanceAfter,
                referenceId: refundReferenceId,
                referenceType: "challenge_cancel_refund",
                description: `Admin challenge cancellation refund for challenge ${id}`,
                metadata: JSON.stringify({
                  challengeId: id,
                  adminId: req.admin!.id,
                  reason: reason || "admin_force_cancel",
                }),
              });
            }
          } else {
            for (const playerId of participants) {
              await tx.update(users)
                .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount})::text` })
                .where(eq(users.id, playerId));
            }
          }
        }

        // Cancel the challenge
        const [cancelled] = await tx.update(challenges)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(challenges.id, id))
          .returning();

        return cancelled;
      });

      await logAdminAction(req.admin!.id, "settings_change", "challenge", id, {
        previousValue: JSON.stringify({ status: 'active' }),
        newValue: JSON.stringify({ status: 'cancelled' }),
        reason: reason || "Admin force-cancelled challenge",
      }, req);

      // Notify players
      sendNotification(result.player1Id, {
        type: 'warning',
        priority: 'high',
        title: 'Challenge Cancelled',
        titleAr: 'تم إلغاء التحدي',
        message: `Your challenge was cancelled by an administrator. Full refund applied.`,
        messageAr: `تم إلغاء التحدي بواسطة المسؤول. تم استرداد المبلغ كاملاً.`,
        link: '/challenges',
      }).catch(() => {});
      
      if (result.player2Id) {
        sendNotification(result.player2Id, {
          type: 'warning',
          priority: 'high',
          title: 'Challenge Cancelled',
          titleAr: 'تم إلغاء التحدي',
          message: `A challenge you joined was cancelled by an administrator. Full refund applied.`,
          messageAr: `تم إلغاء تحدي انضممت إليه بواسطة المسؤول. تم استرداد المبلغ كاملاً.`,
          link: '/challenges',
        }).catch(() => {});
      }
      
      for (const pKey of ['player3Id', 'player4Id'] as const) {
        const pid = result[pKey];
        if (pid) {
          sendNotification(pid, {
            type: 'warning',
            priority: 'high',
            title: 'Challenge Cancelled',
            titleAr: 'تم إلغاء التحدي',
            message: `A challenge you joined was cancelled by an administrator. Full refund applied.`,
            messageAr: `تم إلغاء تحدي انضممت إليه بواسطة المسؤول. تم استرداد المبلغ كاملاً.`,
            link: '/challenges',
          }).catch(() => {});
        }
      }

      res.json({ success: true, challenge: result });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      const status = msg.includes('not found') ? 404 : msg.includes('already') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });
}
