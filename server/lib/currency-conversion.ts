/**
 * Multi-currency wallet conversion (Task #104).
 *
 * Lets a player move funds between two wallets they already own (e.g. EGP →
 * SAR) without going through deposit + withdrawal. Uses the admin-managed FX
 * rates already populated in the `currencies` table (X-per-USD), and applies
 * an optional spread/fee from the global setting `wallet_conversion.fee_pct`.
 *
 * Atomicity: every conversion runs inside a single Drizzle transaction. The
 * source wallet is debited, the destination wallet credited, and TWO
 * `transactions` rows of type `currency_conversion` are inserted (one per
 * leg). All four operations either succeed together or roll back. The user
 * row is locked FOR UPDATE before any balance touch.
 */

import { transactions, users } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { adjustUserCurrencyBalance } from "./wallet-balances";
import {
  convertDepositAmountToUsd,
  convertUsdAmountToCurrency,
  getDepositFxSnapshot,
} from "./deposit-fx";
import { normalizeCurrencyCode } from "./p2p-currency-controls";

export const WALLET_CONVERSION_ENABLED_KEY = "wallet_conversion.enabled";
export const WALLET_CONVERSION_FEE_PCT_KEY = "wallet_conversion.fee_pct";

export interface WalletConversionQuote {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  amountUsd: number;
  grossToAmount: number;
  feePct: number;
  feeAmount: number;
  netToAmount: number;
  fromToUsdRate: number;
  usdToTargetRate: number;
}

export interface WalletConversionResult {
  fromTransactionId: string;
  toTransactionId: string;
  quote: WalletConversionQuote;
  fromBalanceAfter: number;
  toBalanceAfter: number;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampFeePct(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  // Cap at 100% to avoid configuration foot-guns.
  return Math.min(parsed, 100);
}

/**
 * Computes a conversion quote without touching balances. Returns null when
 * the rate table does not cover one of the currencies, or the result rounds
 * to zero.
 */
export function quoteWalletConversion(
  fromCurrency: string,
  toCurrency: string,
  fromAmount: number,
  feePct: number,
  usdRateByCurrency: Record<string, number>,
): WalletConversionQuote | null {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (!from || !to || from === to) return null;

  if (!Number.isFinite(fromAmount) || fromAmount <= 0) return null;

  const fromQuote = convertDepositAmountToUsd(fromAmount, from, usdRateByCurrency);
  if (!fromQuote) return null;

  const toQuote = convertUsdAmountToCurrency(fromQuote.creditedAmountUsd, to, usdRateByCurrency);
  if (!toQuote) return null;

  const safeFeePct = clampFeePct(feePct);
  const grossToAmount = roundCents(toQuote.convertedAmount);
  const feeAmount = roundCents(grossToAmount * (safeFeePct / 100));
  const netToAmount = roundCents(grossToAmount - feeAmount);

  if (!Number.isFinite(netToAmount) || netToAmount <= 0) return null;

  return {
    fromCurrency: from,
    toCurrency: to,
    fromAmount: roundCents(fromAmount),
    amountUsd: fromQuote.creditedAmountUsd,
    grossToAmount,
    feePct: safeFeePct,
    feeAmount,
    netToAmount,
    fromToUsdRate: fromQuote.depositToUsdRate,
    usdToTargetRate: toQuote.usdToCurrencyRate,
  };
}

/**
 * Loads a fresh FX snapshot covering both legs of the conversion. Useful for
 * the quote endpoint which needs both rates resolved before the user submits.
 */
export async function loadConversionFx(currencies: string[]): Promise<Record<string, number>> {
  const snapshot = await getDepositFxSnapshot(currencies);
  return snapshot.usdRateByCurrency;
}

export interface ExecuteConversionInput {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  feePct: number;
  usdRateByCurrency: Record<string, number>;
}

/**
 * Atomic two-leg balance move. Caller is expected to have already validated:
 *   - user is allowed to use the feature (global toggle + per-user flag)
 *   - both currencies are on the user's allow-list
 *   - the user has multi-currency mode enabled
 *   - the source balance covers `fromAmount`
 * This helper still re-checks balances inside the locked row to prevent races,
 * but the policy checks above SHOULD live in the route to give friendlier
 * error messages.
 */
export async function executeWalletConversion(input: ExecuteConversionInput): Promise<WalletConversionResult> {
  const quote = quoteWalletConversion(
    input.fromCurrency,
    input.toCurrency,
    input.fromAmount,
    input.feePct,
    input.usdRateByCurrency,
  );
  if (!quote) {
    throw new Error("Conversion quote is unavailable for the requested currencies");
  }

  return await db.transaction(async (tx) => {
    // Lock the user row so concurrent debits cannot oversell the source wallet.
    const [locked] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update");
    if (!locked) {
      throw new Error("User not found");
    }

    const debit = await adjustUserCurrencyBalance(
      tx,
      input.userId,
      quote.fromCurrency,
      -quote.fromAmount,
    );
    const credit = await adjustUserCurrencyBalance(
      tx,
      input.userId,
      quote.toCurrency,
      quote.netToAmount,
      { allowCreate: true },
    );

    // Audit rows — one debit-leg and one credit-leg, both type
    // `currency_conversion`. We point each row's referenceId at the OTHER
    // row's id once both ids are known.
    const description = `Convert ${quote.fromAmount.toFixed(2)} ${quote.fromCurrency} → ${quote.netToAmount.toFixed(2)} ${quote.toCurrency} (rate ${quote.usdToTargetRate.toFixed(6)} ${quote.toCurrency}/USD, fee ${quote.feePct.toFixed(2)}%)`;

    const [fromRow] = await tx.insert(transactions).values({
      userId: input.userId,
      type: "currency_conversion",
      status: "completed",
      amount: quote.fromAmount.toFixed(2),
      balanceBefore: debit.balanceBefore.toFixed(2),
      balanceAfter: debit.balanceAfter.toFixed(2),
      description,
      walletCurrencyCode: quote.fromCurrency,
    }).returning();

    const [toRow] = await tx.insert(transactions).values({
      userId: input.userId,
      type: "currency_conversion",
      status: "completed",
      amount: quote.netToAmount.toFixed(2),
      balanceBefore: credit.balanceBefore.toFixed(2),
      balanceAfter: credit.balanceAfter.toFixed(2),
      description,
      walletCurrencyCode: quote.toCurrency,
      referenceId: fromRow!.id,
    }).returning();

    // Back-fill the source-leg referenceId so the two rows point at each
    // other. This makes admin investigations one-hop.
    await tx
      .update(transactions)
      .set({ referenceId: toRow!.id })
      .where(eq(transactions.id, fromRow!.id));

    return {
      fromTransactionId: fromRow!.id,
      toTransactionId: toRow!.id,
      quote,
      fromBalanceAfter: debit.balanceAfter,
      toBalanceAfter: credit.balanceAfter,
    };
  });
}
