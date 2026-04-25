import type { Express, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, sensitiveRateLimiter, type AuthRequest } from "./middleware";
import { emitSystemAlert } from "../lib/admin-alerts";
import { sendNotification } from "../websocket";
import { db } from "../db";
import { p2pSettings, users, userCurrencyWallets } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getErrorMessage } from "./helpers";
import { sanitizePlainText } from "../lib/input-security";
import { paymentIpGuard, paymentOperationTokenGuard } from "../lib/payment-security";
import { normalizeCurrencyCode, resolveP2PCurrencyControls } from "../lib/p2p-currency-controls";
import { convertDepositAmountToUsd, convertUsdAmountToCurrency, getDepositFxSnapshot } from "../lib/deposit-fx";
import {
  adjustUserCurrencyBalance,
  getEffectiveAllowedCurrencies,
  getUserWalletSummary,
} from "../lib/wallet-balances";

export function registerTransactionUserRoutes(app: Express): void {
  app.get("/api/transactions/deposit-config", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const normalizedBalanceCurrency = normalizeCurrencyCode(user.balanceCurrency) || "USD";
      const isBalanceCurrencyLocked = Boolean(user.balanceCurrencyLockedAt);
      const isMultiCurrency = Boolean(user.multiCurrencyEnabled);
      const userAllowedCurrencies = getEffectiveAllowedCurrencies(user);

      const [settings] = await db
        .select({
          depositEnabledCurrencies: p2pSettings.depositEnabledCurrencies,
          p2pBuyCurrencies: p2pSettings.p2pBuyCurrencies,
          p2pSellCurrencies: p2pSettings.p2pSellCurrencies,
        })
        .from(p2pSettings)
        .limit(1);

      const currencyControls = resolveP2PCurrencyControls(settings);

      // For multi-currency users we use their personal allow-list (primary +
      // allowedCurrencies) instead of the global P2P deposit policy. We still
      // rely on FX availability so we can convert each currency to the USD base.
      const policyCurrencies = isMultiCurrency
        ? userAllowedCurrencies
        : isBalanceCurrencyLocked
          ? [...currencyControls.depositEnabledCurrencies, normalizedBalanceCurrency]
          : currencyControls.depositEnabledCurrencies;
      const fxSnapshot = await getDepositFxSnapshot(policyCurrencies);

      const allowedDepositCurrencies = isMultiCurrency
        ? userAllowedCurrencies.filter((code) => fxSnapshot.operationalCurrencies.includes(code))
        : isBalanceCurrencyLocked
          ? fxSnapshot.operationalCurrencies.includes(normalizedBalanceCurrency)
            ? [normalizedBalanceCurrency]
            : []
          : fxSnapshot.operationalCurrencies;

      const defaultDepositCurrency = isMultiCurrency
        ? allowedDepositCurrencies.includes(normalizedBalanceCurrency)
          ? normalizedBalanceCurrency
          : allowedDepositCurrencies[0] || normalizedBalanceCurrency
        : isBalanceCurrencyLocked
          ? normalizedBalanceCurrency
          : allowedDepositCurrencies[0] || "USD";

      res.json({
        allowedDepositCurrencies,
        defaultDepositCurrency,
        disabledDepositCurrencies: fxSnapshot.missingRateCurrencies,
        balanceCurrency: normalizedBalanceCurrency,
        isBalanceCurrencyLocked,
        multiCurrencyEnabled: isMultiCurrency,
        usdRateByCurrency: fxSnapshot.usdRateByCurrency,
        currencySymbolByCode: fxSnapshot.currencySymbolByCode,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // List the user's per-currency wallets (primary + sub-wallets).
  // Always returns the primary row even when balance is zero.
  app.get("/api/wallet/currency-wallets", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const summary = await getUserWalletSummary(req.user!.id);
      if (!summary) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(summary);
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

        const isMultiCurrency = Boolean(user.multiCurrencyEnabled);
        const userAllowedCurrencies = getEffectiveAllowedCurrencies(user);

        const [settings] = await db
          .select({
            depositEnabledCurrencies: p2pSettings.depositEnabledCurrencies,
            p2pBuyCurrencies: p2pSettings.p2pBuyCurrencies,
            p2pSellCurrencies: p2pSettings.p2pSellCurrencies,
          })
          .from(p2pSettings)
          .limit(1);

        const currencyControls = resolveP2PCurrencyControls(settings);
        const policyCurrencies = isMultiCurrency
          ? userAllowedCurrencies
          : currencyControls.depositEnabledCurrencies;
        const fxSnapshot = await getDepositFxSnapshot(policyCurrencies);

        if (fxSnapshot.operationalCurrencies.length === 0) {
          return res.status(403).json({ error: "Deposits are currently disabled for all currencies" });
        }

        if (!fxSnapshot.operationalCurrencies.includes(normalizedDepositCurrency)) {
          return res.status(400).json({
            error: isMultiCurrency
              ? `Deposit currency must be one of your allowed currencies: ${fxSnapshot.operationalCurrencies.join(", ")}`
              : `Deposit currency must be one of: ${fxSnapshot.operationalCurrencies.join(", ")}`,
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

        // For legacy single-currency users we still lock balanceCurrency on first
        // deposit. Multi-currency users keep their primary fixed (set by admin)
        // and may deposit in any currency from their allow-list.
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

          if (isMultiCurrency) {
            // Primary currency is admin-managed for multi-currency users. We
            // never auto-lock based on a deposit choice.
            return {
              balanceCurrency: currentWalletCurrency,
              isLocked: true,
            };
          }

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

        // Multi-currency users may deposit any allowed currency. Single-currency
        // users must deposit in their locked currency.
        if (!isMultiCurrency && lockedWalletState.balanceCurrency !== normalizedDepositCurrency) {
          return res.status(400).json({
            error: `Wallet currency is locked to ${lockedWalletState.balanceCurrency}. Deposits must use the same currency.`,
          });
        }

        // Sanitize string inputs to prevent stored XSS
        const safePaymentMethod = sanitizePlainText(paymentMethod, { maxLength: 100 });
        const safeWalletNumber = sanitizePlainText(walletNumber, { maxLength: 100 });

        // Determine the post-credit balance preview shown on the transaction row.
        // For primary-currency deposits this is the primary balance + creditedAmountUsd
        // (matching legacy behavior). For sub-wallet deposits it's the sub-wallet
        // balance + the deposited amount in its own currency. Sub-wallet rows may
        // not yet exist; default to 0.
        const isPrimaryDeposit = normalizedDepositCurrency === lockedWalletState.balanceCurrency;
        let balanceBefore: string;
        let balanceAfter: string;
        let storedAmount: string;
        if (isPrimaryDeposit) {
          balanceBefore = user.balance;
          balanceAfter = (parseFloat(user.balance) + creditedAmountUsd).toFixed(2);
          storedAmount = creditedAmountUsd.toFixed(2);
        } else {
          const [existingSub] = await db.select({ balance: userCurrencyWallets.balance })
            .from(userCurrencyWallets)
            .where(and(
              eq(userCurrencyWallets.userId, user.id),
              eq(userCurrencyWallets.currencyCode, normalizedDepositCurrency),
            ));
          const subBefore = existingSub ? parseFloat(existingSub.balance) : 0;
          balanceBefore = subBefore.toFixed(2);
          balanceAfter = (subBefore + walletCreditQuote.convertedAmount).toFixed(2);
          storedAmount = walletCreditQuote.convertedAmount.toFixed(2);
        }

        const transaction = await storage.createTransaction({
          userId: user.id,
          type: "deposit",
          status: "pending",
          amount: storedAmount,
          balanceBefore,
          balanceAfter,
          referenceId: String(paymentReference).slice(0, 200),
          walletCurrencyCode: normalizedDepositCurrency,
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
            primaryCurrency: lockedWalletState.balanceCurrency,
            isMultiCurrency,
            isPrimaryDeposit,
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
        const { amount, paymentMethodId, paymentMethod, receiverMethodNumber, currency } = req.body;

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

        const isMultiCurrency = Boolean(userForCurrency.multiCurrencyEnabled);
        const primaryCurrency = normalizeCurrencyCode(userForCurrency.balanceCurrency) || "USD";
        const userAllowedCurrencies = getEffectiveAllowedCurrencies(userForCurrency);

        // Resolve withdrawal currency. Default to primary; multi-currency users
        // may pass `currency` to withdraw from a sub-wallet.
        const requestedWithdrawCurrencyRaw = typeof currency === "string" && currency.trim().length > 0
          ? currency
          : primaryCurrency;
        const withdrawCurrency = normalizeCurrencyCode(requestedWithdrawCurrencyRaw) || primaryCurrency;

        if (withdrawCurrency !== primaryCurrency) {
          if (!isMultiCurrency) {
            return res.status(400).json({ error: "Multi-currency wallet not enabled for this account" });
          }
          if (!userAllowedCurrencies.includes(withdrawCurrency)) {
            return res.status(400).json({
              error: `Currency ${withdrawCurrency} is not on your allow-list`,
            });
          }
        }

        const fxSnapshot = await getDepositFxSnapshot([primaryCurrency, withdrawCurrency]);
        const withdrawConversion = convertDepositAmountToUsd(
          withdrawAmountRequested,
          withdrawCurrency,
          fxSnapshot.usdRateByCurrency,
        );
        if (!withdrawConversion) {
          return res.status(400).json({ error: `Exchange rate for ${withdrawCurrency} is unavailable` });
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
        const requestedReceiverNumber = typeof receiverMethodNumber === "string"
          ? receiverMethodNumber.trim()
          : "";

        if (!requestedReceiverNumber) {
          return res.status(400).json({ error: "Receiver method number is required" });
        }

        const safeReceiverMethodNumber = sanitizePlainText(requestedReceiverNumber, { maxLength: 100 });
        if (!safeReceiverMethodNumber) {
          return res.status(400).json({ error: "Receiver method number is required" });
        }

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

        // CRITICAL: Wallet-currency unit consistency.
        // - Sub-wallets store balances in their own native currency, so the
        //   debit must be in the requested native amount.
        // - The PRIMARY balance (`users.balance`) is stored in USD by legacy
        //   convention (deposits credit `creditedAmountUsd`). To keep deposits
        //   and withdrawals in the same unit, primary withdrawals must debit
        //   the USD-converted amount.
        // The persisted `transactions.amount` follows the same rule so that
        // admin-side refunds/approvals re-credit the wallet in matching units.
        const isPrimaryWithdraw = withdrawCurrency === primaryCurrency;
        const walletDebitAmount = isPrimaryWithdraw ? withdrawAmountUsd : withdrawAmountRequested;

        // SECURITY: Atomic withdrawal with FOR UPDATE lock to prevent concurrent
        // double-withdrawal. The deduction is applied to the chosen currency
        // wallet (primary -> users.balance; sub -> user_currency_wallets row).
        const result = await db.transaction(async (tx) => {
          // Lock user row first (required by adjustUserCurrencyBalance contract)
          const [user] = await tx.select().from(users)
            .where(eq(users.id, req.user!.id)).for('update');

          if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

          let adjusted;
          try {
            adjusted = await adjustUserCurrencyBalance(
              tx,
              req.user!.id,
              withdrawCurrency,
              -walletDebitAmount,
              { allowCreate: false },
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Withdrawal failed";
            throw Object.assign(new Error(message), { statusCode: 400 });
          }

          return { user, adjusted };
        });

        const transaction = await storage.createTransaction({
          userId: result.user.id,
          type: "withdrawal",
          status: "pending",
          amount: walletDebitAmount.toFixed(2),
          balanceBefore: result.adjusted.balanceBefore.toFixed(2),
          balanceAfter: result.adjusted.balanceAfter.toFixed(2),
          walletCurrencyCode: withdrawCurrency,
          description: `Withdrawal request via ${selectedMethod.name} | Receiver: ${safeReceiverMethodNumber} | Requested: ${withdrawAmountRequested.toFixed(2)} ${withdrawCurrency} | Base: ${withdrawAmountUsd.toFixed(2)} USD${isPrimaryWithdraw ? ' (debited primary in USD)' : ''}`,
        });

        await storage.createAuditLog({
          userId: result.user.id,
          action: "withdrawal",
          entityType: "transaction",
          entityId: transaction.id,
          details: JSON.stringify({
            amountRequested: withdrawAmountRequested,
            amountRequestedCurrency: withdrawCurrency,
            primaryCurrency,
            isPrimaryWithdrawal: withdrawCurrency === primaryCurrency,
            amountUsd: withdrawAmountUsd,
            paymentMethodId: selectedMethod.id,
            paymentMethod: selectedMethod.name,
            receiverMethodNumber: safeReceiverMethodNumber,
            usdToWalletRate: withdrawConversion.usdToDepositRate,
          }),
        });

        // Emit admin alert for new withdrawal
        emitSystemAlert({
          title: 'New Withdrawal Request',
          titleAr: 'طلب سحب جديد',
          message: `User ${result.user.username} requested a withdrawal of ${withdrawAmountRequested.toFixed(2)} ${withdrawCurrency} (~${withdrawAmountUsd.toFixed(2)} USD)`,
          messageAr: `طلب المستخدم ${result.user.username} سحب بقيمة ${withdrawAmountRequested.toFixed(2)} ${withdrawCurrency} (حوالي ${withdrawAmountUsd.toFixed(2)} USD)`,
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
          message: `Your withdrawal request of ${withdrawAmountRequested.toFixed(2)} ${withdrawCurrency} has been submitted and is pending review. Amount has been held from your balance.`,
          messageAr: `تم إرسال طلب السحب بقيمة ${withdrawAmountRequested.toFixed(2)} ${withdrawCurrency} وهو قيد المراجعة. تم حجز المبلغ من رصيدك.`,
          link: '/transactions',
          metadata: JSON.stringify({
            transactionId: transaction.id,
            type: 'withdrawal',
            amountRequested: withdrawAmountRequested,
            amountRequestedCurrency: withdrawCurrency,
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
