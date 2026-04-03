import type { Express, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, sensitiveRateLimiter, type AuthRequest } from "./middleware";
import { emitSystemAlert } from "../lib/admin-alerts";
import { sendNotification } from "../websocket";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { getErrorMessage } from "./helpers";
import { sanitizePlainText } from "../lib/input-security";
import { paymentIpGuard, paymentOperationTokenGuard } from "../lib/payment-security";

export function registerTransactionUserRoutes(app: Express): void {
  app.get("/api/transactions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { type, status, page, pageSize } = req.query;
      const userId = req.user!.role === "admin" ? undefined : req.user!.id;
      const pg = Math.max(1, parseInt(page as string) || 1);
      const ps = Math.min(200, Math.max(1, parseInt(pageSize as string) || 50));
      const { data, total } = await storage.listTransactionsPaginated(userId, type as string, status as string, pg, ps);
      res.json({ data, total, page: pg, pageSize: ps, totalPages: Math.ceil(total / ps) });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post(
    "/api/transactions/deposit",
    authMiddleware,
    paymentIpGuard("deposit"),
    paymentOperationTokenGuard("deposit"),
    sensitiveRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount, paymentMethod, paymentReference, walletNumber } = req.body;
        const user = await storage.getUser(req.user!.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        if (!amount || typeof amount !== 'string' && typeof amount !== 'number') {
          return res.status(400).json({ error: "Amount is required" });
        }

        const totalAmount = parseFloat(String(amount));
        if (isNaN(totalAmount) || totalAmount <= 0 || totalAmount > 1000000) {
          return res.status(400).json({ error: "Amount must be between 0.01 and 1,000,000" });
        }

        if (!paymentReference || typeof paymentReference !== 'string') {
          return res.status(400).json({ error: "Payment reference is required" });
        }

        // Sanitize string inputs to prevent stored XSS
        const safePaymentMethod = sanitizePlainText(paymentMethod, { maxLength: 100 });
        const safeWalletNumber = sanitizePlainText(walletNumber, { maxLength: 100 });

        const transaction = await storage.createTransaction({
          userId: user.id,
          type: "deposit",
          status: "pending",
          amount: totalAmount.toFixed(2),
          balanceBefore: user.balance,
          balanceAfter: (parseFloat(user.balance) + totalAmount).toFixed(2),
          referenceId: String(paymentReference).slice(0, 200),
          description: `${safePaymentMethod}${safeWalletNumber ? ` | Sender: ${safeWalletNumber}` : ''}`,
        });

        await storage.createAuditLog({
          userId: user.id,
          action: "deposit",
          entityType: "transaction",
          entityId: transaction.id,
          details: JSON.stringify({ amount: totalAmount, paymentMethod, paymentReference }),
        });

        // Emit admin alert for new deposit
        emitSystemAlert({
          title: 'New Deposit Request',
          titleAr: 'طلب إيداع جديد',
          message: `User ${user.username} requested a deposit of $${totalAmount.toFixed(2)} via ${safePaymentMethod || 'unknown'}`,
          messageAr: `طلب المستخدم ${user.username} إيداع بقيمة $${totalAmount.toFixed(2)}`,
          severity: 'info',
          deepLink: '/admin/users',
          entityType: 'transaction',
          entityId: transaction.id,
        }).catch(() => { });

        // Notify user: deposit request received
        await sendNotification(user.id, {
          type: 'transaction',
          priority: 'normal',
          title: 'Deposit Request Submitted',
          titleAr: 'تم إرسال طلب الإيداع',
          message: `Your deposit request of $${totalAmount.toFixed(2)} has been submitted and is pending review.`,
          messageAr: `تم إرسال طلب الإيداع بقيمة $${totalAmount.toFixed(2)} وهو قيد المراجعة.`,
          link: '/transactions',
          metadata: JSON.stringify({ transactionId: transaction.id, type: 'deposit', amount: totalAmount }),
        }).catch(() => { });

        res.status(201).json(transaction);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );

  app.post(
    "/api/transactions/withdraw",
    authMiddleware,
    paymentIpGuard("withdraw"),
    paymentOperationTokenGuard("withdraw"),
    sensitiveRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount } = req.body;

        // CRITICAL: Validate amount is positive number
        if (!amount || (typeof amount !== 'string' && typeof amount !== 'number')) {
          return res.status(400).json({ error: "Amount is required" });
        }

        const withdrawAmount = parseFloat(String(amount));
        if (isNaN(withdrawAmount) || withdrawAmount <= 0 || withdrawAmount > 1000000) {
          return res.status(400).json({ error: "Amount must be between 0.01 and 1,000,000" });
        }

        // SECURITY: Atomic withdrawal with FOR UPDATE lock to prevent concurrent double-withdrawal
        const result = await db.transaction(async (tx) => {
          // Lock user row to prevent concurrent withdrawals
          const [user] = await tx.select().from(users)
            .where(eq(users.id, req.user!.id)).for('update');

          if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

          const currentBalance = parseFloat(user.balance);
          if (withdrawAmount > currentBalance) {
            throw Object.assign(new Error("Insufficient balance"), { statusCode: 400 });
          }

          const newBalance = (currentBalance - withdrawAmount).toFixed(2);

          // SECURITY: Atomically deduct balance (escrow) to prevent double-spend
          await tx.update(users).set({
            balance: newBalance,
            updatedAt: new Date(),
          }).where(eq(users.id, req.user!.id));

          return { user, newBalance };
        });

        const transaction = await storage.createTransaction({
          userId: result.user.id,
          type: "withdrawal",
          status: "pending",
          amount: withdrawAmount.toFixed(2),
          balanceBefore: result.user.balance,
          balanceAfter: result.newBalance,
          description: "Withdrawal request",
        });

        await storage.createAuditLog({
          userId: result.user.id,
          action: "withdrawal",
          entityType: "transaction",
          entityId: transaction.id,
          details: JSON.stringify({ amount }),
        });

        // Emit admin alert for new withdrawal
        emitSystemAlert({
          title: 'New Withdrawal Request',
          titleAr: 'طلب سحب جديد',
          message: `User ${result.user.username} requested a withdrawal of $${withdrawAmount.toFixed(2)}`,
          messageAr: `طلب المستخدم ${result.user.username} سحب بقيمة $${withdrawAmount.toFixed(2)}`,
          severity: 'warning',
          deepLink: '/admin/users',
          entityType: 'transaction',
          entityId: transaction.id,
        }).catch(() => { });

        // Notify user: withdrawal request received
        await sendNotification(result.user.id, {
          type: 'transaction',
          priority: 'normal',
          title: 'Withdrawal Request Submitted',
          titleAr: 'تم إرسال طلب السحب',
          message: `Your withdrawal request of $${withdrawAmount.toFixed(2)} has been submitted and is pending review. Amount has been held from your balance.`,
          messageAr: `تم إرسال طلب السحب بقيمة $${withdrawAmount.toFixed(2)} وهو قيد المراجعة. تم حجز المبلغ من رصيدك.`,
          link: '/transactions',
          metadata: JSON.stringify({ transactionId: transaction.id, type: 'withdrawal', amount: withdrawAmount }),
        }).catch(() => { });

        res.status(201).json(transaction);
      } catch (error: unknown) {
        const statusCode = (error as any)?.statusCode;
        if (statusCode === 400 || statusCode === 404) {
          return res.status(statusCode).json({ error: getErrorMessage(error) });
        }
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );
}
