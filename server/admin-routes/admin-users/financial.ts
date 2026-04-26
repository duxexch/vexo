import type { Express, Response } from "express";
import { storage } from "../../storage";
import { users, transactions, projectCurrencyWallets, projectCurrencyLedger, userCurrencyWallets } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { and, eq, sql } from "drizzle-orm";
import {
  type AdminRequest,
  adminAuthMiddleware,
  createHttpError,
  getErrorMessage,
  logAdminAction,
  resolveErrorStatus,
} from "../helpers";
import { toSafeUser } from "../../lib/safe-user";
import { adjustUserCurrencyBalance, bumpPrimaryDepositWithdrawalTotals, getUserWalletSummary, getEffectiveAllowedCurrencies } from "../../lib/wallet-balances";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";

export function registerUserFinancialRoutes(app: Express) {

  const parseNumeric = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  // ==================== MULTI-CURRENCY WALLETS ====================

  // List all wallets (primary + sub) for a single user — admin financial view.
  app.get("/api/admin/users/:id/currency-wallets", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const summary = await getUserWalletSummary(req.params.id);
      if (!summary) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(summary);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Toggle multi-currency mode + manage allow-list for a user.
  app.patch("/api/admin/users/:id/multi-currency", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { enabled, allowedCurrencies } = req.body ?? {};

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "`enabled` (boolean) is required" });
      }

      const incomingList = Array.isArray(allowedCurrencies) ? allowedCurrencies : [];
      const seen = new Set<string>();
      const normalizedAllowed: string[] = [];
      for (const code of incomingList) {
        const normalized = normalizeCurrencyCode(code);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          normalizedAllowed.push(normalized);
        }
      }
      if (normalizedAllowed.length > 32) {
        return res.status(400).json({ error: "At most 32 allowed currencies per user" });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const previousAllowed = Array.isArray(user.allowedCurrencies) ? [...user.allowedCurrencies] : [];

      const [updated] = await db.update(users).set({
        multiCurrencyEnabled: enabled,
        allowedCurrencies: normalizedAllowed,
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning();

      await logAdminAction(req.admin!.id, "user_balance_adjust", "user", id, {
        previousValue: JSON.stringify({ multi: user.multiCurrencyEnabled, allowed: previousAllowed }),
        newValue: JSON.stringify({ multi: enabled, allowed: normalizedAllowed }),
        reason: "Multi-currency wallet settings updated",
      }, req);

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Adjust user balance (add or subtract). Now currency-aware: the optional
  // `currencyCode` body field selects which sub-wallet to target. Defaults to
  // the user's primary currency for backward compatibility.
  app.post("/api/admin/users/:id/balance-adjust", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, type, reason, currencyCode } = req.body;

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

      const primaryCurrency = normalizeCurrencyCode(user.balanceCurrency) || "USD";

      // If the caller provided a currencyCode, it MUST normalize to a valid
      // currency. We refuse to silently fall back to primary on garbage input
      // because that could misroute funds to the wrong wallet.
      let targetCurrency = primaryCurrency;
      if (currencyCode !== undefined && currencyCode !== null && String(currencyCode).trim() !== "") {
        const normalized = normalizeCurrencyCode(currencyCode);
        if (!normalized) {
          return res.status(400).json({ error: `Invalid currency code: ${currencyCode}` });
        }
        targetCurrency = normalized;
      }

      // Sub-wallet adjustments must target a currency on the user's allow-list.
      if (targetCurrency !== primaryCurrency) {
        const allowed = getEffectiveAllowedCurrencies(user);
        if (!allowed.includes(targetCurrency)) {
          return res.status(400).json({
            error: `Currency ${targetCurrency} is not on this user's allow-list`,
          });
        }
      }

      const isPrimaryAdjustment = targetCurrency === primaryCurrency;
      const signedDelta = type === "add" ? adjustAmount : -adjustAmount;

      // CRITICAL: every operation that mutates money below MUST stay inside
      // this transaction callback, and any failure MUST throw (not return a
      // failure envelope). Drizzle only rolls back when the callback rejects;
      // returning `{ success: false }` after a partial mutation would commit
      // the work that already ran (e.g. wallet credited but the audit row
      // insert failed) and leave the ledger out of sync with the wallet.
      const adjustmentResult = await db.transaction(async (tx) => {
        // Lock the user row (required by adjustUserCurrencyBalance contract)
        await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for("update");

        let adjusted;
        try {
          adjusted = await adjustUserCurrencyBalance(tx, id, targetCurrency, signedDelta, { allowCreate: type === "add" });
        } catch (err) {
          // adjustUserCurrencyBalance throws plain Errors for caller-fixable
          // problems (insufficient balance, currency not on allow-list, no
          // sub-wallet on a debit, etc.). Surface them as 400s without losing
          // the rollback — re-throwing aborts the whole transaction.
          throw createHttpError(400, err instanceof Error ? err.message : "Adjustment failed");
        }

        // Mirror the legacy `transactions` row only for primary-currency
        // adjustments. Sub-wallet adjustments are recorded in the audit log
        // (admin actions) and via the `userCurrencyWallets` row updates.
        let createdTransaction: typeof transactions.$inferSelect | undefined;
        if (isPrimaryAdjustment) {
          const internalReference = `admin_balance_adjust:${id}:${Date.now()}`;
          const [tx0] = await tx.insert(transactions).values({
            userId: id,
            type: type === "add" ? "bonus" : "withdrawal",
            status: "completed",
            amount: adjustAmount.toFixed(2),
            balanceBefore: adjusted.balanceBefore.toFixed(2),
            balanceAfter: adjusted.balanceAfter.toFixed(2),
            description: `Admin adjustment: ${reason}`,
            adminNote: reason,
            referenceId: internalReference,
          }).returning();
          createdTransaction = tx0;
        }

        return { adjusted, createdTransaction };
      });

      const { adjusted, createdTransaction } = adjustmentResult;

      await logAdminAction(req.admin!.id, "user_balance_adjust", "user", id, {
        previousValue: String(adjusted.balanceBefore),
        newValue: String(adjusted.balanceAfter),
        reason: `[${targetCurrency}] ${reason}`,
      }, req);

      const adjustLabel = type === 'add' ? { en: 'credited to', ar: 'أضيفت إلى' } : { en: 'deducted from', ar: 'خصمت من' };
      await sendNotification(id, {
        type: 'transaction',
        priority: 'high',
        title: 'Balance Updated',
        titleAr: 'تحديث الرصيد',
        message: `${adjustAmount.toFixed(2)} ${targetCurrency} has been ${adjustLabel.en} your account. Reason: ${reason}`,
        messageAr: `${adjustAmount.toFixed(2)} ${targetCurrency} ${adjustLabel.ar} حسابك. السبب: ${reason}`,
        link: '/wallet',
        metadata: JSON.stringify({
          type: 'balance_adjust',
          amount: adjustAmount,
          currency: targetCurrency,
          balanceAfter: adjusted.balanceAfter,
          transactionId: createdTransaction?.id,
          referenceId: createdTransaction?.publicReference,
          internalReferenceId: createdTransaction?.referenceId,
        }),
      }).catch(() => { });

      // For primary currency we keep returning the safe user shape (callers expect that).
      // For sub-wallet we return a richer payload describing the affected wallet.
      if (isPrimaryAdjustment) {
        const refreshed = await storage.getUser(id);
        return res.json(toSafeUser(refreshed!));
      }

      res.json({
        success: true,
        wallet: {
          currency: adjusted.currency,
          balanceBefore: adjusted.balanceBefore,
          balanceAfter: adjusted.balanceAfter,
          isPrimary: false,
        },
      });
    } catch (error: unknown) {
      // Errors thrown from inside `db.transaction` propagate here AFTER the
      // transaction has rolled back, so it is safe to translate them into a
      // user-visible response without worrying about partial commits.
      res.status(resolveErrorStatus(error)).json({ error: getErrorMessage(error) });
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

      const internalReference = `admin_vxc_adjust:${id}:${Date.now()}`;

      // CRITICAL: the wallet update AND the matching ledger insert are part
      // of the same atomic operation. They must run on `tx` (not `db`) and
      // any failure must throw so Drizzle rolls the whole thing back. The
      // previous version inserted the ledger row OUTSIDE the transaction,
      // which meant a ledger-insert failure left the user's VXC balance
      // adjusted with no audit trail (or vice versa).
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

        let updated: typeof projectCurrencyWallets.$inferSelect;
        let balanceAfter: number;

        if (type === "add") {
          // Credit goes into earnedBalance (admin grant treated as earned).
          const newEarned = earnedBefore + adjustAmount;
          const newTotal = totalBefore + adjustAmount;
          [updated] = await tx.update(projectCurrencyWallets)
            .set({
              earnedBalance: newEarned.toFixed(2),
              totalBalance: newTotal.toFixed(2),
              totalEarned: (parseNumeric(wallet.totalEarned) + adjustAmount).toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(projectCurrencyWallets.id, wallet.id))
            .returning();
          balanceAfter = newTotal;
        } else {
          // Debit: take from earned first, then purchased. Throwing here
          // (rather than returning a failure envelope) ensures the wallet
          // row we may have just inserted above gets rolled back too.
          if (totalBefore < adjustAmount) {
            throw createHttpError(400, "Insufficient VXC balance");
          }
          const fromEarned = Math.min(earnedBefore, adjustAmount);
          const fromPurchased = adjustAmount - fromEarned;
          const newEarned = earnedBefore - fromEarned;
          const newPurchased = purchasedBefore - fromPurchased;
          const newTotal = totalBefore - adjustAmount;

          [updated] = await tx.update(projectCurrencyWallets)
            .set({
              earnedBalance: newEarned.toFixed(2),
              purchasedBalance: newPurchased.toFixed(2),
              totalBalance: newTotal.toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(projectCurrencyWallets.id, wallet.id))
            .returning();
          balanceAfter = newTotal;
        }

        await tx.insert(projectCurrencyLedger).values({
          userId: id,
          walletId: updated.id,
          type: "admin_adjustment",
          amount: (type === "add" ? adjustAmount : -adjustAmount).toFixed(2),
          balanceBefore: totalBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          referenceId: internalReference,
          referenceType: "admin_adjustment",
          description: `Admin VXC adjustment: ${reason}`,
        });

        return { wallet: updated, balanceBefore: totalBefore, balanceAfter };
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
      res.status(resolveErrorStatus(error)).json({ error: getErrorMessage(error) });
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
