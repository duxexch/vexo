import type { Express, Response } from "express";
import { storage } from "../../storage";
import { users, transactions, projectCurrencyWallets, projectCurrencyLedger } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { toSafeUser } from "../../lib/safe-user";

export function registerUserFinancialRoutes(app: Express) {

  const parseNumeric = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  // Adjust user balance (add or subtract)
  app.post("/api/admin/users/:id/balance-adjust", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, type, reason } = req.body;

      if (!type || !['add', 'subtract'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'add' or 'subtract'" });
      }

      const adjustAmount = parseFloat(amount);
      if (isNaN(adjustAmount) || adjustAmount <= 0 || adjustAmount > 1000000) {
        return res.status(400).json({ error: "Amount must be a positive number up to 1,000,000" });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({ error: "A reason is required (minimum 3 characters)" });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const adjustmentResult = await db.transaction(async (tx) => {
        const signedDelta = type === "add" ? adjustAmount : -adjustAmount;

        const updateQuery = type === "add"
          ? sql`
            UPDATE users
            SET balance = balance + ${adjustAmount}, updated_at = NOW()
            WHERE id = ${id}
            RETURNING *
          `
          : sql`
            UPDATE users
            SET balance = balance - ${adjustAmount}, updated_at = NOW()
            WHERE id = ${id} AND balance >= ${adjustAmount}
            RETURNING *
          `;

        const updateRows = await tx.execute(updateQuery);
        const updatedUser = (updateRows.rows as Record<string, unknown>[])[0];
        if (!updatedUser) {
          return { success: false as const, error: "Balance cannot be negative" };
        }

        const balanceAfter = parseNumeric(updatedUser.balance);
        const balanceBefore = balanceAfter - signedDelta;
        const internalReference = `admin_balance_adjust:${id}:${Date.now()}`;

        const [createdTransaction] = await tx.insert(transactions).values({
          userId: id,
          type: type === "add" ? "bonus" : "withdrawal",
          status: "completed",
          amount: adjustAmount.toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          description: `Admin adjustment: ${reason}`,
          adminNote: reason,
          referenceId: internalReference,
        }).returning();

        return {
          success: true as const,
          updatedUser,
          createdTransaction,
          balanceBefore,
          balanceAfter,
        };
      });

      if (!adjustmentResult.success) {
        return res.status(400).json({ error: adjustmentResult.error });
      }

      const updated = adjustmentResult.updatedUser;
      const createdTransaction = adjustmentResult.createdTransaction;
      const currentBalance = adjustmentResult.balanceBefore;
      const newBalance = adjustmentResult.balanceAfter;

      await logAdminAction(req.admin!.id, "user_balance_adjust", "user", id, {
        previousValue: String(currentBalance),
        newValue: String(newBalance),
        reason
      }, req);

      const adjustLabel = type === 'add' ? { en: 'credited to', ar: 'أضيفت إلى' } : { en: 'deducted from', ar: 'خصمت من' };
      await sendNotification(id, {
        type: 'transaction',
        priority: 'high',
        title: 'Balance Updated',
        titleAr: 'تحديث الرصيد',
        message: `$${adjustAmount.toFixed(2)} has been ${adjustLabel.en} your account. Reason: ${reason}`,
        messageAr: `$${adjustAmount.toFixed(2)} ${adjustLabel.ar} حسابك. السبب: ${reason}`,
        link: '/wallet',
        metadata: JSON.stringify({
          type: 'balance_adjust',
          amount: adjustAmount,
          balanceAfter: newBalance,
          transactionId: createdTransaction.id,
          referenceId: createdTransaction.publicReference,
          internalReferenceId: createdTransaction.referenceId,
        }),
      }).catch(() => { });

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Send reward to user
  app.post("/api/admin/users/:id/reward", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const rewardAmount = parseFloat(amount);

      if (isNaN(rewardAmount) || rewardAmount <= 0 || rewardAmount > 1000000) {
        return res.status(400).json({ error: "Reward amount must be a positive number up to 1,000,000" });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({ error: "A reason is required (minimum 3 characters)" });
      }

      const rewardResult = await db.transaction(async (tx) => {
        const updateRows = await tx.execute(sql`
          UPDATE users
          SET balance = balance + ${rewardAmount}, updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `);

        const updatedUser = (updateRows.rows as Record<string, unknown>[])[0];
        if (!updatedUser) {
          return { success: false as const, error: "User not found" };
        }

        const newBalance = parseNumeric(updatedUser.balance);
        const currentBalance = newBalance - rewardAmount;
        const internalReference = `admin_reward:${id}:${Date.now()}`;

        const [createdTransaction] = await tx.insert(transactions).values({
          userId: id,
          type: "bonus",
          status: "completed",
          amount: rewardAmount.toFixed(2),
          balanceBefore: currentBalance.toFixed(2),
          balanceAfter: newBalance.toFixed(2),
          description: `Reward: ${reason}`,
          adminNote: `Sent by admin: ${reason}`,
          referenceId: internalReference,
        }).returning();

        return {
          success: true as const,
          updatedUser,
          createdTransaction,
          currentBalance,
          newBalance,
        };
      });

      if (!rewardResult.success) {
        return res.status(404).json({ error: rewardResult.error });
      }

      const updated = rewardResult.updatedUser;
      const createdTransaction = rewardResult.createdTransaction;
      const currentBalance = rewardResult.currentBalance;
      const newBalance = rewardResult.newBalance;

      await logAdminAction(req.admin!.id, "reward_sent", "user", id, {
        newValue: String(rewardAmount),
        reason
      }, req);

      await sendNotification(id, {
        type: 'transaction',
        priority: 'high',
        title: 'Reward Received! 🎁',
        titleAr: 'حصلت على مكافأة! 🎁',
        message: `You received a $${rewardAmount.toFixed(2)} reward! Reason: ${reason}`,
        messageAr: `حصلت على مكافأة بقيمة $${rewardAmount.toFixed(2)}! السبب: ${reason}`,
        link: '/wallet',
        metadata: JSON.stringify({
          type: 'reward',
          amount: rewardAmount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionId: createdTransaction.id,
          referenceId: createdTransaction.publicReference,
          internalReferenceId: createdTransaction.referenceId,
        }),
      }).catch(() => { });

      res.json({ ...toSafeUser(updated), rewardSent: rewardAmount });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Adjust user's project currency (VXC) wallet — admin credit/debit
  app.post("/api/admin/users/:id/vxc-adjust", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, type, reason } = req.body;

      if (!type || !["add", "subtract"].includes(type)) {
        return res.status(400).json({ error: "Type must be 'add' or 'subtract'" });
      }

      const adjustAmount = parseFloat(amount);
      if (isNaN(adjustAmount) || adjustAmount <= 0 || adjustAmount > 1_000_000) {
        return res.status(400).json({ error: "Amount must be a positive number up to 1,000,000" });
      }

      if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        return res.status(400).json({ error: "A reason is required (minimum 3 characters)" });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const result = await db.transaction(async (tx) => {
        // Lock or lazily create the wallet row.
        let [wallet] = await tx.select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, id))
          .for("update");

        if (!wallet) {
          [wallet] = await tx.insert(projectCurrencyWallets).values({ userId: id }).returning();
        }

        const earnedBefore = parseNumeric(wallet.earnedBalance);
        const purchasedBefore = parseNumeric(wallet.purchasedBalance);
        const totalBefore = parseNumeric(wallet.totalBalance);

        if (type === "add") {
          // Credit goes into earnedBalance (admin grant treated as earned).
          const newEarned = earnedBefore + adjustAmount;
          const newTotal = totalBefore + adjustAmount;
          const [updated] = await tx.update(projectCurrencyWallets)
            .set({
              earnedBalance: newEarned.toFixed(2),
              totalBalance: newTotal.toFixed(2),
              totalEarned: (parseNumeric(wallet.totalEarned) + adjustAmount).toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(projectCurrencyWallets.id, wallet.id))
            .returning();
          return { success: true as const, wallet: updated, balanceBefore: totalBefore, balanceAfter: newTotal };
        }

        // Debit: take from earned first, then purchased.
        if (totalBefore < adjustAmount) {
          return { success: false as const, error: "Insufficient VXC balance" };
        }
        const fromEarned = Math.min(earnedBefore, adjustAmount);
        const fromPurchased = adjustAmount - fromEarned;
        const newEarned = earnedBefore - fromEarned;
        const newPurchased = purchasedBefore - fromPurchased;
        const newTotal = totalBefore - adjustAmount;

        const [updated] = await tx.update(projectCurrencyWallets)
          .set({
            earnedBalance: newEarned.toFixed(2),
            purchasedBalance: newPurchased.toFixed(2),
            totalBalance: newTotal.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(projectCurrencyWallets.id, wallet.id))
          .returning();

        return { success: true as const, wallet: updated, balanceBefore: totalBefore, balanceAfter: newTotal };
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const internalReference = `admin_vxc_adjust:${id}:${Date.now()}`;
      await db.insert(projectCurrencyLedger).values({
        userId: id,
        walletId: result.wallet.id,
        type: "admin_adjustment",
        amount: (type === "add" ? adjustAmount : -adjustAmount).toFixed(2),
        balanceBefore: result.balanceBefore.toFixed(2),
        balanceAfter: result.balanceAfter.toFixed(2),
        referenceId: internalReference,
        referenceType: "admin_adjustment",
        description: `Admin VXC adjustment: ${reason}`,
      });

      await logAdminAction(req.admin!.id, "user_balance_adjust", "user", id, {
        previousValue: String(result.balanceBefore),
        newValue: String(result.balanceAfter),
        reason: `[VXC] ${reason}`,
      }, req);

      const adjustLabel = type === "add"
        ? { en: "credited to", ar: "أضيفت إلى" }
        : { en: "deducted from", ar: "خصمت من" };
      await sendNotification(id, {
        type: "transaction",
        priority: "high",
        title: "VXC Balance Updated",
        titleAr: "تحديث رصيد VXC",
        message: `${adjustAmount.toFixed(2)} VXC has been ${adjustLabel.en} your wallet. Reason: ${reason}`,
        messageAr: `${adjustAmount.toFixed(2)} VXC ${adjustLabel.ar} محفظتك. السبب: ${reason}`,
        link: "/wallet",
        metadata: JSON.stringify({
          type: "vxc_adjust",
          amount: adjustAmount,
          balanceAfter: result.balanceAfter,
          referenceId: internalReference,
        }),
      }).catch(() => { });

      res.json({ wallet: result.wallet, balanceBefore: result.balanceBefore, balanceAfter: result.balanceAfter });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Toggle P2P trading ban
  app.post("/api/admin/users/:id/p2p-ban", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason, banned } = req.body;

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [updated] = await db.update(users)
        .set({
          p2pBanned: banned ?? true,
          p2pBanReason: banned ? reason : null,
          p2pBannedAt: banned ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();

      await logAdminAction(req.admin!.id, banned ? "p2p_ban" : "p2p_unban", "user", id, {
        previousValue: String(user.p2pBanned),
        newValue: String(banned),
        reason
      }, req);

      if (banned) {
        await sendNotification(id, {
          type: 'warning',
          priority: 'high',
          title: 'P2P Trading Restricted',
          titleAr: 'تم تقييد تداول P2P',
          message: `Your P2P trading access has been restricted.${reason ? ' Reason: ' + reason : ''} Contact support for assistance.`,
          messageAr: `تم تقييد وصولك لتداول P2P.${reason ? ' السبب: ' + reason : ''} تواصل مع الدعم للمساعدة.`,
          link: '/p2p',
        }).catch(() => { });
      } else {
        await sendNotification(id, {
          type: 'success',
          priority: 'normal',
          title: 'P2P Trading Restored',
          titleAr: 'تم استعادة تداول P2P',
          message: 'Your P2P trading access has been restored. You can now trade again.',
          messageAr: 'تم استعادة وصولك لتداول P2P. يمكنك التداول مرة أخرى.',
          link: '/p2p',
        }).catch(() => { });
      }

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
