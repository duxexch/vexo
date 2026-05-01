import type { Express, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, agentMiddleware, type AuthRequest } from "./middleware";
import { db } from "../db";
import { users, transactions, transactionStatusEnum } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { sendNotification } from "../websocket";
import { getErrorMessage } from "./helpers";
import { sanitizeNullablePlainText } from "../lib/input-security";
import { convertUsdAmountToCurrency, getDepositFxSnapshot } from "../lib/deposit-fx";
import { normalizeCurrencyCode } from "../lib/p2p-currency-controls";
import { selectAgentForRouting } from "../storage/agents";

type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];

export function registerTransactionAgentRoutes(app: Express): void {
  app.patch("/api/transactions/:id/process", authMiddleware, agentMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { status, adminNote } = req.body;

      const validStatuses = ["approved", "completed", "rejected"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
      }

      const safeAdminNote = sanitizeNullablePlainText(adminNote, 500) || undefined;

      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      if (transaction.status !== "pending") {
        return res.status(400).json({ error: `Transaction already ${transaction.status}. Cannot reprocess.` });
      }

      const userForCurrency = await storage.getUser(transaction.userId);
      const routing = await selectAgentForRouting({
        requestType: transaction.type === "withdrawal" ? "withdraw" : "deposit",
        currency: userForCurrency?.balanceCurrency ?? null,
        country: typeof req.body?.country === "string" ? req.body.country : null,
      });

      const processingAgent = (await storage.getAgentByUserId(req.user!.id)) ?? routing?.agent ?? null;

      const updated = await db.transaction(async (tx) => {
        const [txn] = await tx.select().from(transactions)
          .where(eq(transactions.id, req.params.id)).for("update");

        if (!txn || txn.status !== "pending") {
          throw new Error(`Transaction already ${txn?.status || "unknown"}. Cannot reprocess.`);
        }

        const [updatedTxn] = await tx.update(transactions).set({
          status: status as TransactionStatus,
          adminNote: safeAdminNote,
          processedBy: processingAgent?.id,
          processedAt: new Date(),
        }).where(eq(transactions.id, req.params.id)).returning();

        if (status === "approved" || status === "completed") {
          const [user] = await tx.select().from(users)
            .where(eq(users.id, txn.userId)).for("update");

          if (user) {
            if (txn.type === "deposit") {
              await tx.update(users).set({
                balance: sql`(CAST(${users.balance} AS DECIMAL) + ${parseFloat(txn.amount)})::TEXT`,
                totalDeposited: sql`(CAST(${users.totalDeposited} AS DECIMAL) + ${parseFloat(txn.amount)})::TEXT`,
                updatedAt: new Date(),
              }).where(eq(users.id, txn.userId));
            } else if (txn.type === "withdrawal") {
              const withdrawAmount = parseFloat(txn.amount);
              if (parseFloat(user.balance) < 0) {
                throw new Error("Insufficient balance — cannot approve withdrawal");
              }
              await tx.update(users).set({
                totalWithdrawn: sql`(CAST(${users.totalWithdrawn} AS DECIMAL) + ${withdrawAmount})::TEXT`,
                updatedAt: new Date(),
              }).where(eq(users.id, txn.userId));
            }
          }
        }

        if (status === "rejected" && txn.type === "withdrawal") {
          const [user] = await tx.select().from(users)
            .where(eq(users.id, txn.userId)).for("update");
          if (user) {
            await tx.update(users).set({
              balance: sql`(CAST(${users.balance} AS DECIMAL) + ${parseFloat(txn.amount)})::TEXT`,
              updatedAt: new Date(),
            }).where(eq(users.id, txn.userId));
          }
        }

        return updatedTxn;
      });

      const txType = transaction.type === "deposit"
        ? { en: "Deposit", ar: "إيداع" }
        : { en: "Withdrawal", ar: "سحب" };

      const transactionAmountUsd = parseFloat(transaction.amount);
      const displayAmountCurrency = normalizeCurrencyCode(userForCurrency?.balanceCurrency) || "USD";
      const fxSnapshot = await getDepositFxSnapshot([displayAmountCurrency]);
      const displayAmountQuote = convertUsdAmountToCurrency(transactionAmountUsd, displayAmountCurrency, fxSnapshot.usdRateByCurrency);
      const displayAmount = displayAmountQuote
        ? `${displayAmountQuote.convertedAmount.toFixed(2)} ${displayAmountCurrency}`
        : `${transactionAmountUsd.toFixed(2)} USD`;

      if (status === "approved" || status === "completed") {
        await sendNotification(transaction.userId, {
          type: "transaction",
          priority: "high",
          title: `${txType.en} Approved`,
          titleAr: `تمت الموافقة على ${txType.ar}`,
          message: `Your ${txType.en.toLowerCase()} of ${displayAmount} has been approved successfully.`,
          messageAr: `تمت الموافقة على ${txType.ar} بقيمة ${displayAmount} بنجاح.`,
          link: "/transactions",
          metadata: JSON.stringify({ transactionId: transaction.id, type: transaction.type, amount: transaction.amount }),
        }).catch(() => { });
      } else if (status === "rejected") {
        await sendNotification(transaction.userId, {
          type: "transaction",
          priority: "high",
          title: `${txType.en} Rejected`,
          titleAr: `تم رفض ${txType.ar}`,
          message: `Your ${txType.en.toLowerCase()} of ${displayAmount} has been rejected.${safeAdminNote ? " Reason: " + safeAdminNote : ""}`,
          messageAr: `تم رفض ${txType.ar} بقيمة ${displayAmount}.${safeAdminNote ? " السبب: " + safeAdminNote : ""}`,
          link: "/transactions",
          metadata: JSON.stringify({ transactionId: transaction.id, type: transaction.type, amount: transaction.amount }),
        }).catch(() => { });
      }

      return res.json(updated);
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/transactions/pending", authMiddleware, agentMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const pendingTransactions = await storage.getPendingTransactions();
      return res.json(pendingTransactions);
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
