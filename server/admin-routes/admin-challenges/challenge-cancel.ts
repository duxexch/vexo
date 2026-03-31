import type { Express, Response } from "express";
import { challenges, users } from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
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

        // Full refund to player 1
        if (betAmount > 0) {
          if (currencyType === 'project') {
            await tx.execute(sql`
              UPDATE project_currency_wallets 
              SET earned_balance = (CAST(earned_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  total_balance = (CAST(total_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  updated_at = NOW()
              WHERE user_id = ${challenge.player1Id}
            `);
          } else {
            await tx.update(users)
              .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount})::text` })
              .where(eq(users.id, challenge.player1Id));
          }
        }

        // If player2 already joined, refund them too
        if (challenge.player2Id && betAmount > 0) {
          if (currencyType === 'project') {
            await tx.execute(sql`
              UPDATE project_currency_wallets 
              SET earned_balance = (CAST(earned_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  total_balance = (CAST(total_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  updated_at = NOW()
              WHERE user_id = ${challenge.player2Id}
            `);
          } else {
            await tx.update(users)
              .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount})::text` })
              .where(eq(users.id, challenge.player2Id!));
          }
        }

        // Refund player3 and player4 for 4-player challenges
        if (challenge.player3Id && betAmount > 0) {
          if (currencyType === 'project') {
            await tx.execute(sql`
              UPDATE project_currency_wallets 
              SET earned_balance = (CAST(earned_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  total_balance = (CAST(total_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  updated_at = NOW()
              WHERE user_id = ${challenge.player3Id}
            `);
          } else {
            await tx.update(users)
              .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount})::text` })
              .where(eq(users.id, challenge.player3Id));
          }
        }
        if (challenge.player4Id && betAmount > 0) {
          if (currencyType === 'project') {
            await tx.execute(sql`
              UPDATE project_currency_wallets 
              SET earned_balance = (CAST(earned_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  total_balance = (CAST(total_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                  updated_at = NOW()
              WHERE user_id = ${challenge.player4Id}
            `);
          } else {
            await tx.update(users)
              .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount})::text` })
              .where(eq(users.id, challenge.player4Id));
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
