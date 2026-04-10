import type { Express, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, sensitiveRateLimiter, type AuthRequest } from "./middleware";
import { emitSystemAlert } from "../lib/admin-alerts";
import { sendNotification } from "../websocket";
import { db } from "../db";
import { p2pSettings, users } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getErrorMessage } from "./helpers";
import { sanitizePlainText } from "../lib/input-security";
import { paymentIpGuard, paymentOperationTokenGuard } from "../lib/payment-security";
import { normalizeCurrencyCode, resolveP2PCurrencyControls } from "../lib/p2p-currency-controls";
import { convertDepositAmountToUsd, convertUsdAmountToCurrency, getDepositFxSnapshot } from "../lib/deposit-fx";

export function registerTransactionUserRoutes(app: Express): void {
  app.get("/api/transactions/deposit-config", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const normalizedBalanceCurrency = normalizeCurrencyCode(user.balanceCurrency) || "USD";
      const isBalanceCurrencyLocked = Boolean(user.balanceCurrencyLockedAt);

      const [settings] = await db
        .select({
          depositEnabledCurrencies: p2pSettings.depositEnabledCurrencies,
          p2pBuyCurrencies: p2pSettings.p2pBuyCurrencies,
          p2pSellCurrencies: p2pSettings.p2pSellCurrencies,
        })
        .from(p2pSettings)
        .limit(1);

      const currencyControls = resolveP2PCurrencyControls(settings);
      const policyCurrencies = isBalanceCurrencyLocked
        ? [...currencyControls.depositEnabledCurrencies, normalizedBalanceCurrency]
        : currencyControls.depositEnabledCurrencies;
      const fxSnapshot = await getDepositFxSnapshot(policyCurrencies);

      const allowedDepositCurrencies = isBalanceCurrencyLocked
        ? fxSnapshot.operationalCurrencies.includes(normalizedBalanceCurrency)
          ? [normalizedBalanceCurrency]
          : []
        : fxSnapshot.operationalCurrencies;

      const defaultDepositCurrency = isBalanceCurrencyLocked
        ? normalizedBalanceCurrency
        : allowedDepositCurrencies[0] || "USD";

      res.json({
        allowedDepositCurrencies,
        defaultDepositCurrency,
        disabledDepositCurrencies: fxSnapshot.missingRateCurrencies,
        balanceCurrency: normalizedBalanceCurrency,
        isBalanceCurrencyLocked,
        usdRateByCurrency: fxSnapshot.usdRateByCurrency,
        currencySymbolByCode: fxSnapshot.currencySymbolByCode,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

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
        const { amount, paymentMethod, paymentReference, walletNumber, currency } = req.body;
        const user = await storage.getUser(req.user!.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const requestedCurrency = currency === undefined ? "USD" : currency;
        const normalizedDepositCurrency = normalizeCurrencyCode(requestedCurrency);
        if (!normalizedDepositCurrency) {
          return res.status(400).json({ error: "Invalid deposit currency" });
        }

        const [settings] = await db
          .select({
            depositEnabledCurrencies: p2pSettings.depositEnabledCurrencies,
            p2pBuyCurrencies: p2pSettings.p2pBuyCurrencies,
            p2pSellCurrencies: p2pSettings.p2pSellCurrencies,
          })
          .from(p2pSettings)
          .limit(1);

        const currencyControls = resolveP2PCurrencyControls(settings);
        const fxSnapshot = await getDepositFxSnapshot(currencyControls.depositEnabledCurrencies);

        if (fxSnapshot.operationalCurrencies.length === 0) {
          return res.status(403).json({ error: "Deposits are currently disabled for all currencies" });
        }

        if (!fxSnapshot.operationalCurrencies.includes(normalizedDepositCurrency)) {
          return res.status(400).json({
            error: `Deposit currency must be one of: ${fxSnapshot.operationalCurrencies.join(", ")}`,
          });
        }

        if (!amount || typeof amount !== 'string' && typeof amount !== 'number') {
          return res.status(400).json({ error: "Amount is required" });
        }

        const totalAmount = parseFloat(String(amount));
        if (isNaN(totalAmount) || totalAmount <= 0 || totalAmount > 1000000) {
          return res.status(400).json({ error: "Amount must be between 0.01 and 1,000,000" });
        }

        const conversionQuote = convertDepositAmountToUsd(totalAmount, normalizedDepositCurrency, fxSnapshot.usdRateByCurrency);
        if (!conversionQuote) {
          return res.status(400).json({ error: "Exchange rate for this deposit currency is unavailable" });
        }

        const creditedAmountUsd = conversionQuote.creditedAmountUsd;
        if (!Number.isFinite(creditedAmountUsd) || creditedAmountUsd <= 0 || creditedAmountUsd > 1000000) {
          return res.status(400).json({ error: "Converted amount must be between 0.01 and 1,000,000 USD" });
        }

        const walletCreditQuote = convertUsdAmountToCurrency(creditedAmountUsd, normalizedDepositCurrency, fxSnapshot.usdRateByCurrency);
        if (!walletCreditQuote) {
          return res.status(400).json({ error: "Unable to map credited amount to wallet currency" });
        }

        if (!paymentReference || typeof paymentReference !== 'string') {
          return res.status(400).json({ error: "Payment reference is required" });
        }

        const lockedWalletState = await db.transaction(async (tx) => {
          const [lockedUser] = await tx.select({
            id: users.id,
            balanceCurrency: users.balanceCurrency,
            balanceCurrencyLockedAt: users.balanceCurrencyLockedAt,
          }).from(users)
            .where(eq(users.id, user.id))
            .for("update");

          if (!lockedUser) {
            throw Object.assign(new Error("User not found"), { statusCode: 404 });
          }

          const currentWalletCurrency = normalizeCurrencyCode(lockedUser.balanceCurrency) || "USD";
          if (lockedUser.balanceCurrencyLockedAt) {
            return {
              balanceCurrency: currentWalletCurrency,
              isLocked: true,
            };
          }

          const lockAt = new Date();
          await tx.update(users).set({
            balanceCurrency: normalizedDepositCurrency,
            balanceCurrencyLockedAt: lockAt,
            updatedAt: lockAt,
          }).where(and(
            eq(users.id, user.id),
            isNull(users.balanceCurrencyLockedAt),
          ));

          return {
            balanceCurrency: normalizedDepositCurrency,
            isLocked: true,
          };
        });

        if (lockedWalletState.balanceCurrency !== normalizedDepositCurrency) {
          return res.status(400).json({
            error: `Wallet currency is locked to ${lockedWalletState.balanceCurrency}. Deposits must use the same currency.`,
          });
        }

        // Sanitize string inputs to prevent stored XSS
        const safePaymentMethod = sanitizePlainText(paymentMethod, { maxLength: 100 });
        const safeWalletNumber = sanitizePlainText(walletNumber, { maxLength: 100 });

        const transaction = await storage.createTransaction({
          userId: user.id,
          type: "deposit",
          status: "pending",
          amount: creditedAmountUsd.toFixed(2),
          balanceBefore: user.balance,
          balanceAfter: (parseFloat(user.balance) + creditedAmountUsd).toFixed(2),
          referenceId: String(paymentReference).slice(0, 200),
          description: `${safePaymentMethod}${safeWalletNumber ? ` | Sender: ${safeWalletNumber}` : ''} | Deposit: ${totalAmount.toFixed(2)} ${normalizedDepositCurrency} | FX: 1 USD = ${conversionQuote.usdToDepositRate.toFixed(6)} ${normalizedDepositCurrency} | Wallet Credit: ${walletCreditQuote.convertedAmount.toFixed(2)} ${normalizedDepositCurrency} | Base Credit: ${creditedAmountUsd.toFixed(2)} USD`,
        });

        await storage.createAuditLog({
          userId: user.id,
          action: "deposit",
          entityType: "transaction",
          entityId: transaction.id,
          details: JSON.stringify({
            requestedAmount: totalAmount,
            requestedCurrency: normalizedDepositCurrency,
            walletCurrency: normalizedDepositCurrency,
            creditedAmountUsd,
            creditedAmountWallet: walletCreditQuote.convertedAmount,
            usdToDepositRate: conversionQuote.usdToDepositRate,
            depositToUsdRate: conversionQuote.depositToUsdRate,
            paymentMethod,
            paymentReference,
          }),
        });

        // Emit admin alert for new deposit
        emitSystemAlert({
          title: 'New Deposit Request',
          titleAr: 'طلب إيداع جديد',
          message: `User ${user.username} requested a deposit of ${totalAmount.toFixed(2)} ${normalizedDepositCurrency} (~${creditedAmountUsd.toFixed(2)} USD) via ${safePaymentMethod || 'unknown'}`,
          messageAr: `طلب المستخدم ${user.username} إيداع بقيمة ${totalAmount.toFixed(2)} ${normalizedDepositCurrency} (حوالي ${creditedAmountUsd.toFixed(2)} USD)`,
          severity: 'info',
          deepLink: '/admin/transactions',
          entityType: 'transaction',
          entityId: transaction.id,
        }).catch(() => { });

        // Notify user: deposit request received
        await sendNotification(user.id, {
          type: 'transaction',
          priority: 'normal',
          title: 'Deposit Request Submitted',
          titleAr: 'تم إرسال طلب الإيداع',
          message: `Your deposit request of ${totalAmount.toFixed(2)} ${normalizedDepositCurrency} (~${creditedAmountUsd.toFixed(2)} USD) has been submitted and is pending review.`,
          messageAr: `تم إرسال طلب الإيداع بقيمة ${totalAmount.toFixed(2)} ${normalizedDepositCurrency} (حوالي ${creditedAmountUsd.toFixed(2)} USD) وهو قيد المراجعة.`,
          link: '/transactions',
          metadata: JSON.stringify({
            transactionId: transaction.id,
            type: 'deposit',
            requestedAmount: totalAmount,
            requestedCurrency: normalizedDepositCurrency,
            creditedAmountUsd,
            usdToDepositRate: conversionQuote.usdToDepositRate,
          }),
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
        const { amount, paymentMethodId, paymentMethod } = req.body;

        // CRITICAL: Validate amount is positive number
        if (!amount || (typeof amount !== 'string' && typeof amount !== 'number')) {
          return res.status(400).json({ error: "Amount is required" });
        }

        const withdrawAmountRequested = parseFloat(String(amount));
        if (isNaN(withdrawAmountRequested) || withdrawAmountRequested <= 0 || withdrawAmountRequested > 1000000) {
          return res.status(400).json({ error: "Amount must be between 0.01 and 1,000,000" });
        }

        const userForCurrency = await storage.getUser(req.user!.id);
        if (!userForCurrency) {
          return res.status(404).json({ error: "User not found" });
        }

        const walletCurrency = normalizeCurrencyCode(userForCurrency.balanceCurrency) || "USD";
        const fxSnapshot = await getDepositFxSnapshot([walletCurrency]);
        const withdrawConversion = convertDepositAmountToUsd(
          withdrawAmountRequested,
          walletCurrency,
          fxSnapshot.usdRateByCurrency,
        );
        if (!withdrawConversion) {
          return res.status(400).json({ error: `Exchange rate for ${walletCurrency} is unavailable` });
        }

        const withdrawAmountUsd = withdrawConversion.creditedAmountUsd;
        if (!Number.isFinite(withdrawAmountUsd) || withdrawAmountUsd <= 0 || withdrawAmountUsd > 1000000) {
          return res.status(400).json({ error: "Converted amount must be between 0.01 and 1,000,000 USD" });
        }

        const withdrawalMethods = (await storage.listCountryPaymentMethods()).filter(
          (method) => method.isActive && method.isAvailable && method.isWithdrawalEnabled,
        );

        if (withdrawalMethods.length === 0) {
          return res.status(403).json({ error: "Withdrawals are currently unavailable. Please use P2P." });
        }

        const requestedMethodId = typeof paymentMethodId === "string" ? paymentMethodId.trim() : "";
        const requestedMethodValue = typeof paymentMethod === "string" ? paymentMethod.trim() : "";

        let selectedMethod = withdrawalMethods.find((method) => {
          if (requestedMethodId) {
            return method.id === requestedMethodId;
          }

          if (!requestedMethodValue) {
            return false;
          }

          return method.id === requestedMethodValue || method.name.toLowerCase() === requestedMethodValue.toLowerCase();
        });

        if (!selectedMethod && !requestedMethodId && !requestedMethodValue && withdrawalMethods.length === 1) {
          selectedMethod = withdrawalMethods[0];
        }

        if (!selectedMethod) {
          return res.status(400).json({ error: "Valid withdrawal payment method is required" });
        }

        // SECURITY: Atomic withdrawal with FOR UPDATE lock to prevent concurrent double-withdrawal
        const result = await db.transaction(async (tx) => {
          // Lock user row to prevent concurrent withdrawals
          const [user] = await tx.select().from(users)
            .where(eq(users.id, req.user!.id)).for('update');

          if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

          const currentBalance = parseFloat(user.balance);
          if (withdrawAmountUsd > currentBalance) {
            throw Object.assign(new Error("Insufficient balance"), { statusCode: 400 });
          }

          const newBalance = (currentBalance - withdrawAmountUsd).toFixed(2);

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
          amount: withdrawAmountUsd.toFixed(2),
          balanceBefore: result.user.balance,
          balanceAfter: result.newBalance,
          description: `Withdrawal request via ${selectedMethod.name} | Requested: ${withdrawAmountRequested.toFixed(2)} ${walletCurrency} | Base: ${withdrawAmountUsd.toFixed(2)} USD`,
        });

        await storage.createAuditLog({
          userId: result.user.id,
          action: "withdrawal",
          entityType: "transaction",
          entityId: transaction.id,
          details: JSON.stringify({
            amountRequested: withdrawAmountRequested,
            amountRequestedCurrency: walletCurrency,
            amountUsd: withdrawAmountUsd,
            paymentMethodId: selectedMethod.id,
            paymentMethod: selectedMethod.name,
            usdToWalletRate: withdrawConversion.usdToDepositRate,
          }),
        });

        // Emit admin alert for new withdrawal
        emitSystemAlert({
          title: 'New Withdrawal Request',
          titleAr: 'طلب سحب جديد',
          message: `User ${result.user.username} requested a withdrawal of ${withdrawAmountRequested.toFixed(2)} ${walletCurrency} (~${withdrawAmountUsd.toFixed(2)} USD)`,
          messageAr: `طلب المستخدم ${result.user.username} سحب بقيمة ${withdrawAmountRequested.toFixed(2)} ${walletCurrency} (حوالي ${withdrawAmountUsd.toFixed(2)} USD)`,
          severity: 'warning',
          deepLink: '/admin/transactions',
          entityType: 'transaction',
          entityId: transaction.id,
        }).catch(() => { });

        // Notify user: withdrawal request received
        await sendNotification(result.user.id, {
          type: 'transaction',
          priority: 'normal',
          title: 'Withdrawal Request Submitted',
          titleAr: 'تم إرسال طلب السحب',
          message: `Your withdrawal request of ${withdrawAmountRequested.toFixed(2)} ${walletCurrency} has been submitted and is pending review. Amount has been held from your balance.`,
          messageAr: `تم إرسال طلب السحب بقيمة ${withdrawAmountRequested.toFixed(2)} ${walletCurrency} وهو قيد المراجعة. تم حجز المبلغ من رصيدك.`,
          link: '/transactions',
          metadata: JSON.stringify({
            transactionId: transaction.id,
            type: 'withdrawal',
            amountRequested: withdrawAmountRequested,
            amountRequestedCurrency: walletCurrency,
            amountUsd: withdrawAmountUsd,
          }),
        }).catch(() => { });

        res.status(201).json(transaction);
      } catch (error: unknown) {
        const statusCode = (error as any)?.statusCode;
        if (statusCode === 400 || statusCode === 403 || statusCode === 404) {
          return res.status(statusCode).json({ error: getErrorMessage(error) });
        }
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );
}
