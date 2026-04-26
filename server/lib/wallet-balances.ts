/**
 * Wallet balances helper — multi-currency aware abstraction over the user's
 * primary balance (`users.balance` in `users.balanceCurrency`) and the
 * additional sub-wallet rows in `user_currency_wallets`.
 *
 * Design:
 * - The PRIMARY currency wallet lives in `users.balance` / `users.balanceCurrency`.
 *   This stays the source of truth for legacy single-currency users and for
 *   features that operate on the primary balance only (P2P escrow, tournament
 *   stakes, game wagers).
 * - When `users.multiCurrencyEnabled = true`, the user may also hold balances
 *   in any code listed in `users.allowedCurrencies`. Those balances live in
 *   `user_currency_wallets`, one row per (userId, currencyCode), created
 *   lazily on first credit.
 * - All adjustments require a Drizzle transaction context. Callers MUST already
 *   hold a row-level lock on `users` (`SELECT ... FOR UPDATE`) before invoking
 *   `adjustUserCurrencyBalance` to keep concurrent deposits / withdrawals safe.
 */

import {
  users,
  userCurrencyWallets,
  type User,
  type UserCurrencyWallet,
} from "@shared/schema";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { normalizeCurrencyCode } from "./p2p-currency-controls";

export interface UserCurrencyWalletEntry {
  currency: string;
  balance: string;
  role: "primary" | "sub";
  totalDeposited: string;
  totalWithdrawn: string;
  isPrimary: boolean;
  // Whether this wallet is on the user's `allowedCurrencies` allow-list.
  // Always true for the primary wallet (since it always exists).
  isAllowed: boolean;
  walletId?: string;
}

export interface UserWalletSummary {
  userId: string;
  primaryCurrency: string;
  multiCurrencyEnabled: boolean;
  allowedCurrencies: string[];
  wallets: UserCurrencyWalletEntry[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function safeParseDecimal(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeCurrencyArray(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const code = normalizeCurrencyCode(value);
    if (!code) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Returns the canonical normalized list of currencies this user may transact in.
 * Primary currency is always the first element. For non-multi-currency users
 * the result is `[primaryCurrency]` only.
 */
export function getEffectiveAllowedCurrencies(user: Pick<User, "balanceCurrency" | "multiCurrencyEnabled" | "allowedCurrencies">): string[] {
  const primary = normalizeCurrencyCode(user.balanceCurrency) || "USD";
  if (!user.multiCurrencyEnabled) {
    return [primary];
  }
  const allowed = Array.isArray(user.allowedCurrencies) ? user.allowedCurrencies : [];
  return dedupeCurrencyArray([primary, ...allowed]);
}

/**
 * Returns every wallet (primary + sub) for the given user. The primary wallet is
 * always returned even when its balance is zero so the wallet UI can render it.
 */
export async function getUserWalletSummary(userId: string): Promise<UserWalletSummary | null> {
  const [user] = await db.select({
    id: users.id,
    balance: users.balance,
    balanceCurrency: users.balanceCurrency,
    totalDeposited: users.totalDeposited,
    totalWithdrawn: users.totalWithdrawn,
    multiCurrencyEnabled: users.multiCurrencyEnabled,
    allowedCurrencies: users.allowedCurrencies,
  }).from(users).where(eq(users.id, userId));

  if (!user) return null;

  const primaryCurrency = normalizeCurrencyCode(user.balanceCurrency) || "USD";
  const allowedList = getEffectiveAllowedCurrencies({
    balanceCurrency: user.balanceCurrency,
    multiCurrencyEnabled: user.multiCurrencyEnabled,
    allowedCurrencies: user.allowedCurrencies,
  });
  const allowedSet = new Set(allowedList);

  const subWallets = await db.select().from(userCurrencyWallets).where(eq(userCurrencyWallets.userId, userId));

  const wallets: UserCurrencyWalletEntry[] = [];
  wallets.push({
    currency: primaryCurrency,
    balance: user.balance,
    role: "primary",
    totalDeposited: user.totalDeposited,
    totalWithdrawn: user.totalWithdrawn,
    isPrimary: true,
    isAllowed: true,
  });

  const seen = new Set<string>([primaryCurrency]);
  for (const sub of subWallets) {
    const code = normalizeCurrencyCode(sub.currencyCode);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    wallets.push({
      currency: code,
      balance: sub.balance,
      role: "sub",
      totalDeposited: sub.totalDeposited,
      totalWithdrawn: sub.totalWithdrawn,
      isPrimary: false,
      isAllowed: allowedSet.has(code),
      walletId: sub.id,
    });
  }

  return {
    userId,
    primaryCurrency,
    multiCurrencyEnabled: user.multiCurrencyEnabled,
    allowedCurrencies: allowedList,
    wallets,
  };
}

export interface AdjustWalletOptions {
  /**
   * Allow the helper to create a sub-wallet row when crediting a currency the
   * user has never held before. Required for first-time deposits in a new
   * sub-currency. Defaults to `false` for safety on debit paths.
   */
  allowCreate?: boolean;
  /**
   * Allow operating on a sub-wallet currency that is no longer on the user's
   * `allowedCurrencies` list. Required for refunds/payouts of historical rows
   * (tournament cancellation refunds, P2P trade settlement, prize distribution)
   * because admins may have removed a currency from the allow-list AFTER the
   * user paid into it. Without this flag, a policy change would strand funds.
   * Should NEVER be set on debit paths — only on credits/refunds.
   */
  allowOutsideAllowList?: boolean;
}

export interface AdjustWalletResult {
  currency: string;
  isPrimary: boolean;
  balanceBefore: number;
  balanceAfter: number;
  walletId?: string;
}

/**
 * Atomic per-currency wallet adjustment. Caller MUST already hold the user
 * row lock (`SELECT ... FOR UPDATE`) inside the same transaction.
 *
 * - For the user's primary currency, this updates `users.balance` directly so
 *   legacy code paths (P2P, tournaments, games) continue to work unchanged.
 * - For non-primary allowed currencies, this updates the matching row in
 *   `user_currency_wallets` (creating it if `allowCreate` is true and the row
 *   does not yet exist).
 *
 * Returns the before/after balance in plain numbers (caller should string-format
 * for `transactions.balanceBefore` / `balanceAfter`).
 */
export async function adjustUserCurrencyBalance(
  tx: Tx,
  userId: string,
  currencyCode: string | null,
  signedDelta: number,
  options: AdjustWalletOptions = {},
): Promise<AdjustWalletResult> {
  if (!Number.isFinite(signedDelta) || signedDelta === 0) {
    throw new Error("signedDelta must be a non-zero finite number");
  }

  // Re-read user row to determine the primary currency. The caller is
  // expected to have already acquired the FOR UPDATE lock on this row.
  const [user] = await tx.select({
    id: users.id,
    balance: users.balance,
    balanceCurrency: users.balanceCurrency,
    multiCurrencyEnabled: users.multiCurrencyEnabled,
    allowedCurrencies: users.allowedCurrencies,
  }).from(users).where(eq(users.id, userId));

  if (!user) {
    throw new Error("User not found");
  }

  const primaryCurrency = normalizeCurrencyCode(user.balanceCurrency) || "USD";

  // NULL currencyCode = caller wants the legacy primary-balance path. Used by
  // tournament refunds / P2P escrow paths whose stored walletCurrency is NULL
  // for legacy single-currency rows.
  const normalizedCurrency = currencyCode === null
    ? primaryCurrency
    : normalizeCurrencyCode(currencyCode);
  if (!normalizedCurrency) {
    throw new Error("Invalid currency code");
  }

  if (normalizedCurrency === primaryCurrency) {
    const balanceBefore = safeParseDecimal(user.balance);
    const balanceAfter = balanceBefore + signedDelta;
    if (balanceAfter < 0) {
      throw new Error(`Insufficient ${primaryCurrency} balance`);
    }
    await tx.update(users).set({
      balance: balanceAfter.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    return {
      currency: primaryCurrency,
      isPrimary: true,
      balanceBefore,
      balanceAfter,
    };
  }

  // Non-primary path. Multi-currency must be enabled and the currency must
  // be on the user's allow-list — UNLESS this is a refund/payout for a
  // historical row whose wallet currency was removed from the allow-list
  // after the fact (allowOutsideAllowList).
  const isCredit = signedDelta > 0;
  const bypassAllowList = options.allowOutsideAllowList === true && isCredit;

  if (!user.multiCurrencyEnabled && !bypassAllowList) {
    throw new Error(`User is not enabled for multi-currency wallets (requested ${normalizedCurrency})`);
  }
  const allowed = Array.isArray(user.allowedCurrencies) ? user.allowedCurrencies.map((code) => normalizeCurrencyCode(code)) : [];
  if (!allowed.includes(normalizedCurrency) && !bypassAllowList) {
    throw new Error(`Currency ${normalizedCurrency} is not on this user's allow-list`);
  }

  // Lock the sub-wallet row (or create it on credit).
  let [wallet] = await tx.select().from(userCurrencyWallets)
    .where(and(eq(userCurrencyWallets.userId, userId), eq(userCurrencyWallets.currencyCode, normalizedCurrency)))
    .for("update");

  if (!wallet) {
    if (signedDelta < 0) {
      throw new Error(`Insufficient ${normalizedCurrency} balance`);
    }
    if (!options.allowCreate) {
      throw new Error(`No ${normalizedCurrency} sub-wallet exists for this user`);
    }
    // Two concurrent first-time credits (Task #135) would both miss the
    // SELECT above and race to INSERT here. The unique index
    // (userId, currencyCode) on `user_currency_wallets` would then make
    // the loser raise a confusing constraint error to the user instead of
    // merging both credits onto the same row.
    //
    // ON CONFLICT DO NOTHING lets the loser quietly observe the partner's
    // row, after which we re-read it with FOR UPDATE and apply our own
    // credit on top of whatever balance the partner just committed.
    const [inserted] = await tx
      .insert(userCurrencyWallets)
      .values({
        userId,
        currencyCode: normalizedCurrency,
        balance: "0.00",
        totalDeposited: "0.00",
        totalWithdrawn: "0.00",
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      wallet = inserted;
    } else {
      // Lost the race against a concurrent first-time credit. Re-read with
      // FOR UPDATE so we serialize behind the winning tx and credit on top
      // of its committed balance.
      [wallet] = await tx.select().from(userCurrencyWallets)
        .where(and(eq(userCurrencyWallets.userId, userId), eq(userCurrencyWallets.currencyCode, normalizedCurrency)))
        .for("update");
      if (!wallet) {
        throw new Error(`Failed to acquire ${normalizedCurrency} sub-wallet row after conflict`);
      }
    }
  }

  const balanceBefore = safeParseDecimal(wallet.balance);
  const balanceAfter = balanceBefore + signedDelta;
  if (balanceAfter < 0) {
    throw new Error(`Insufficient ${normalizedCurrency} balance`);
  }

  const totalDeposited = safeParseDecimal(wallet.totalDeposited) + (signedDelta > 0 ? signedDelta : 0);
  const totalWithdrawn = safeParseDecimal(wallet.totalWithdrawn) + (signedDelta < 0 ? -signedDelta : 0);

  await tx.update(userCurrencyWallets).set({
    balance: balanceAfter.toFixed(2),
    totalDeposited: totalDeposited.toFixed(2),
    totalWithdrawn: totalWithdrawn.toFixed(2),
    updatedAt: new Date(),
  }).where(eq(userCurrencyWallets.id, wallet.id));

  return {
    currency: normalizedCurrency,
    isPrimary: false,
    balanceBefore,
    balanceAfter,
    walletId: wallet.id,
  };
}

/**
 * Reads a single wallet balance (primary or sub). Returns 0 when the sub-wallet
 * row does not exist. NOT transaction-locked — for read-only display.
 */
export async function getWalletBalance(userId: string, currencyCode: string): Promise<number | null> {
  const normalized = normalizeCurrencyCode(currencyCode);
  if (!normalized) return null;

  const [user] = await db.select({
    balance: users.balance,
    balanceCurrency: users.balanceCurrency,
  }).from(users).where(eq(users.id, userId));
  if (!user) return null;

  if (normalized === (normalizeCurrencyCode(user.balanceCurrency) || "USD")) {
    return safeParseDecimal(user.balance);
  }

  const [sub] = await db.select({ balance: userCurrencyWallets.balance })
    .from(userCurrencyWallets)
    .where(and(eq(userCurrencyWallets.userId, userId), eq(userCurrencyWallets.currencyCode, normalized)));
  return sub ? safeParseDecimal(sub.balance) : 0;
}

/**
 * Updates the totalDeposited / totalWithdrawn aggregates on the primary user row
 * after an admin-approved deposit / withdrawal in the primary currency. Sub-wallet
 * counters are bumped automatically by `adjustUserCurrencyBalance`.
 */
export async function bumpPrimaryDepositWithdrawalTotals(
  tx: Tx,
  userId: string,
  delta: { deposited?: number; withdrawn?: number },
): Promise<void> {
  const [user] = await tx.select({
    totalDeposited: users.totalDeposited,
    totalWithdrawn: users.totalWithdrawn,
  }).from(users).where(eq(users.id, userId));
  if (!user) return;

  const newTotalDeposited = safeParseDecimal(user.totalDeposited) + (delta.deposited ?? 0);
  const newTotalWithdrawn = safeParseDecimal(user.totalWithdrawn) + (delta.withdrawn ?? 0);

  await tx.update(users).set({
    totalDeposited: newTotalDeposited.toFixed(2),
    totalWithdrawn: newTotalWithdrawn.toFixed(2),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
}

export type UserCurrencyWalletRow = UserCurrencyWallet;
