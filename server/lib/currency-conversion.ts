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

import { transactions, users, type Transaction } from "@shared/schema";
import { db } from "../db";
import { and, eq, inArray, like } from "drizzle-orm";
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

// ---------------------------------------------------------------------------
// Reversal — admin-initiated undo of a completed conversion (Task #131).
// ---------------------------------------------------------------------------

/**
 * Marker that the description on a reversal-leg row starts with so we can
 * (a) detect "this conversion has already been reversed" and (b) hide /
 * disable the Reverse button on the UI for rows that ARE reversal legs.
 */
export const CONVERSION_REVERSAL_DESCRIPTION_PREFIX = "Reversal:";

export interface ReverseConversionInput {
  /** Either of the two paired conversion legs is acceptable. */
  transactionId: string;
  /** Admin id for the audit log; the helper itself does not write the log. */
  adminId: string;
  /** Mandatory free-text reason; surfaces in admin audit + the new rows. */
  reason: string;
}

export interface ReverseConversionResult {
  /** The two original legs we just reversed. */
  reversedSourceLegId: string;
  reversedDestinationLegId: string;
  /** The two NEW rows inserted as the reversal. */
  newSourceCreditLegId: string;
  newDestinationDebitLegId: string;
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount: number;
  sourceBalanceAfter: number;
  destinationBalanceAfter: number;
}

export class WalletConversionReversalError extends Error {
  readonly code:
    | "TRANSACTION_NOT_FOUND"
    | "NOT_A_CONVERSION"
    | "PAIR_NOT_FOUND"
    | "ALREADY_REVERSED"
    | "INSUFFICIENT_DESTINATION_BALANCE";
  readonly statusCode: number;
  constructor(
    code: WalletConversionReversalError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "WalletConversionReversalError";
  }
}

/**
 * Determines which of two paired conversion legs was the debit (source) and
 * which was the credit (destination). The debit leg's wallet balance went
 * down so `balanceAfter < balanceBefore`; the credit leg's went up. This is
 * used instead of relying on description string parsing because descriptions
 * are admin-customisable and i18n'd.
 */
function classifyLegs(
  legA: Transaction,
  legB: Transaction,
): { debit: Transaction; credit: Transaction } {
  const aBefore = Number.parseFloat(legA.balanceBefore ?? "0");
  const aAfter = Number.parseFloat(legA.balanceAfter ?? "0");
  const aDelta = aAfter - aBefore;
  if (aDelta < 0) {
    return { debit: legA, credit: legB };
  }
  return { debit: legB, credit: legA };
}

/**
 * Atomic two-leg balance reversal of an existing completed conversion.
 *
 * Looks up the transaction by id, finds its paired leg via `referenceId`,
 * locks the user row FOR UPDATE, refunds the source wallet, debits the
 * destination wallet (will throw `INSUFFICIENT_DESTINATION_BALANCE` if the
 * user has spent the credited amount), and inserts two NEW
 * `currency_conversion` rows whose description starts with the marker
 * `Reversal:` and whose `referenceId` points at the original legs they
 * undo. The original legs are intentionally left as `status = "completed"`
 * for audit-trail accuracy — the reversal is recorded as new entries, not
 * by re-writing history.
 *
 * Idempotency: if a row with `referenceId` matching either of the original
 * legs and a "Reversal:"-prefixed description already exists, the helper
 * throws `ALREADY_REVERSED` so admins cannot double-reverse.
 */
export async function reverseWalletConversion(
  input: ReverseConversionInput,
): Promise<ReverseConversionResult> {
  return await db.transaction(async (tx) => {
    const [seed] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, input.transactionId));

    if (!seed) {
      throw new WalletConversionReversalError(
        "TRANSACTION_NOT_FOUND",
        "Transaction not found",
        404,
      );
    }

    if (seed.type !== "currency_conversion") {
      throw new WalletConversionReversalError(
        "NOT_A_CONVERSION",
        "Only currency_conversion transactions can be reversed",
        400,
      );
    }

    if (seed.description?.startsWith(CONVERSION_REVERSAL_DESCRIPTION_PREFIX)) {
      throw new WalletConversionReversalError(
        "NOT_A_CONVERSION",
        "Cannot reverse a reversal-leg row — locate the original conversion instead",
        400,
      );
    }

    // Only completed conversions are reversible. Anything else (pending,
    // rejected, cancelled) was never applied to balances and must not be
    // double-undone.
    if (seed.status !== "completed") {
      throw new WalletConversionReversalError(
        "NOT_A_CONVERSION",
        `Only completed conversions can be reversed (status was '${seed.status}')`,
        400,
      );
    }

    if (!seed.referenceId) {
      throw new WalletConversionReversalError(
        "PAIR_NOT_FOUND",
        "Conversion is missing its paired leg reference",
        400,
      );
    }

    // CRITICAL: acquire FOR UPDATE on the user row BEFORE the duplicate
    // check, so two concurrent reverse calls serialize on this lock.
    // Without this, both could read "no existing reversal" and proceed
    // to insert two reversal pairs (and double-move balances). With the
    // lock, the second caller waits, then re-runs the duplicate check
    // and sees the rows committed by the first caller.
    const [locked] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, seed.userId))
      .for("update");
    if (!locked) {
      throw new WalletConversionReversalError(
        "TRANSACTION_NOT_FOUND",
        "User no longer exists",
        404,
      );
    }

    const [pair] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, seed.referenceId));

    if (!pair || pair.type !== "currency_conversion" || pair.userId !== seed.userId) {
      throw new WalletConversionReversalError(
        "PAIR_NOT_FOUND",
        "Paired conversion leg not found or belongs to a different user",
        400,
      );
    }

    if (pair.status !== "completed") {
      throw new WalletConversionReversalError(
        "NOT_A_CONVERSION",
        `Paired leg is not in a reversible state (status was '${pair.status}')`,
        400,
      );
    }

    // Idempotency check (now under user FOR UPDATE — see lock comment
    // above). If either original leg already has a "Reversal:"-prefixed
    // row pointing at it, refuse to reverse again.
    const existingReversal = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          inArray(transactions.referenceId, [seed.id, pair.id]),
          eq(transactions.type, "currency_conversion"),
          like(transactions.description, `${CONVERSION_REVERSAL_DESCRIPTION_PREFIX}%`),
        ),
      )
      .limit(1);

    if (existingReversal.length > 0) {
      throw new WalletConversionReversalError(
        "ALREADY_REVERSED",
        "This conversion has already been reversed",
        409,
      );
    }

    const { debit: sourceLeg, credit: destinationLeg } = classifyLegs(seed, pair);
    const sourceCurrency = normalizeCurrencyCode(sourceLeg.walletCurrencyCode) ||
      sourceLeg.walletCurrencyCode || "USD";
    const destinationCurrency = normalizeCurrencyCode(destinationLeg.walletCurrencyCode) ||
      destinationLeg.walletCurrencyCode || "USD";
    const sourceAmount = Number.parseFloat(sourceLeg.amount);
    const destinationAmount = Number.parseFloat(destinationLeg.amount);

    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0 ||
        !Number.isFinite(destinationAmount) || destinationAmount <= 0) {
      throw new WalletConversionReversalError(
        "PAIR_NOT_FOUND",
        "Conversion legs have invalid amounts",
        400,
      );
    }

    // Refund source wallet first (always succeeds — adding funds), then
    // debit destination wallet (may fail if user has spent the credit).
    const sourceCredit = await adjustUserCurrencyBalance(
      tx,
      sourceLeg.userId,
      sourceCurrency,
      sourceAmount,
      { allowCreate: true },
    );

    let destinationDebit;
    try {
      destinationDebit = await adjustUserCurrencyBalance(
        tx,
        destinationLeg.userId,
        destinationCurrency,
        -destinationAmount,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/^Insufficient/.test(message)) {
        throw new WalletConversionReversalError(
          "INSUFFICIENT_DESTINATION_BALANCE",
          `Cannot reverse: user no longer has ${destinationAmount.toFixed(2)} ${destinationCurrency} in their wallet (${message})`,
          409,
        );
      }
      throw err;
    }

    const safeReason = (input.reason || "").trim().slice(0, 500) || "(no reason given)";
    const reversalDescription = `${CONVERSION_REVERSAL_DESCRIPTION_PREFIX} reversal of conversion ${sourceLeg.publicReference || sourceLeg.id} ↔ ${destinationLeg.publicReference || destinationLeg.id}. Reason: ${safeReason}`;

    const [newSourceCredit] = await tx.insert(transactions).values({
      userId: sourceLeg.userId,
      type: "currency_conversion",
      status: "completed",
      amount: sourceAmount.toFixed(2),
      balanceBefore: sourceCredit.balanceBefore.toFixed(2),
      balanceAfter: sourceCredit.balanceAfter.toFixed(2),
      description: reversalDescription,
      walletCurrencyCode: sourceCurrency,
      referenceId: sourceLeg.id,
      processedBy: input.adminId || null,
      processedAt: new Date(),
    }).returning();

    const [newDestinationDebit] = await tx.insert(transactions).values({
      userId: destinationLeg.userId,
      type: "currency_conversion",
      status: "completed",
      amount: destinationAmount.toFixed(2),
      balanceBefore: destinationDebit.balanceBefore.toFixed(2),
      balanceAfter: destinationDebit.balanceAfter.toFixed(2),
      description: reversalDescription,
      walletCurrencyCode: destinationCurrency,
      referenceId: destinationLeg.id,
      processedBy: input.adminId || null,
      processedAt: new Date(),
    }).returning();

    return {
      reversedSourceLegId: sourceLeg.id,
      reversedDestinationLegId: destinationLeg.id,
      newSourceCreditLegId: newSourceCredit!.id,
      newDestinationDebitLegId: newDestinationDebit!.id,
      sourceCurrency,
      destinationCurrency,
      sourceAmount,
      destinationAmount,
      sourceBalanceAfter: sourceCredit.balanceAfter,
      destinationBalanceAfter: destinationDebit.balanceAfter,
    };
  });
}
