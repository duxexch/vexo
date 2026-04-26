/**
 * Source-shape regression sentinels for the multi-currency money UI
 * (Task #105). Both client pages are too monolithic to mount inside
 * jsdom without booting the entire React provider tree, so we instead
 * assert that the critical lines of code that route money to / from the
 * correct sub-wallet remain in place.
 *
 * If any of these lines ever drift, the test fails loudly and points
 * future developers to the exact regression risk: refunds going to the
 * wrong wallet, withdraw buttons enabling above the available balance,
 * or admin sub-wallet adjustments defaulting back to USD.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("wallet.tsx — per-wallet withdraw gating", () => {
  const src = readSource("client/src/pages/wallet.tsx");

  it("computes withdrawAvailableBalance from the SELECTED sub-wallet, not the primary balance", () => {
    // The selected sub-wallet entry is found by matching `effectiveWithdrawCurrency`
    // against `currencyWalletsData.wallets`, then its `.balance` is parsed.
    // If anyone replaces this with `user.balance` we have a critical money bug
    // (a SAR-only wallet would suddenly allow USD-equivalent withdrawals).
    expect(src).toMatch(/withdrawWalletEntry\s*=\s*useMemo/);
    expect(src).toMatch(/\.find\(\(w\)\s*=>\s*w\.currency\s*===\s*effectiveWithdrawCurrency\)/);
    expect(src).toMatch(/withdrawAvailableBalance\s*=\s*withdrawWalletEntry/);
  });

  it("disables the confirm-withdraw button when the requested amount exceeds the per-wallet balance", () => {
    expect(src).toMatch(/parseFloat\(withdrawAmount\)\s*>\s*withdrawAvailableBalance/);
    // Sentinel: the confirm button is the one enforcing the cap.
    expect(src).toMatch(/data-testid="button-confirm-withdraw"/);
  });

  it("submits the withdrawal with the SELECTED currency (not always the primary)", () => {
    // `currency: effectiveWithdrawCurrency` in the mutation body is what tells
    // the server which sub-wallet to debit. A regression here would silently
    // debit the wrong wallet on the server.
    expect(src).toMatch(/currency:\s*effectiveWithdrawCurrency/);
  });
});

describe("admin-users.tsx — per-currency adjust dialog", () => {
  const src = readSource("client/src/pages/admin/admin-users.tsx");

  it("pre-fills the dialog's adjustCurrency from the row the admin clicked", () => {
    // The Adjust button on the per-currency row must call setAdjustCurrency(w.currency)
    // BEFORE opening the dialog. Otherwise the dialog defaults back to the
    // primary currency and the admin silently credits / debits the wrong wallet.
    expect(src).toMatch(/setActionDialog\("balance"\)[\s\S]{0,200}setAdjustCurrency\(w\.currency\)/);
    expect(src).toMatch(/data-testid={`button-adjust-\$\{w\.currency\}`}/);
  });

  it("sends the chosen sub-wallet currencyCode in the balance-adjust mutation body", () => {
    // The body field must be `currencyCode` to match the server route's input
    // contract (server/admin-routes/admin-users/financial.ts).
    expect(src).toMatch(/currencyCode:\s*adjustWallet\s*===\s*"usd"/);
    expect(src).toMatch(/adjustCurrency\s*\|\|\s*currencyWalletsData\?\.primaryCurrency/);
  });

  it("renders one row per currency wallet with a stable test-id we can target", () => {
    expect(src).toMatch(/data-testid={`row-wallet-\$\{w\.currency\}`}/);
    expect(src).toMatch(/data-testid={`text-balance-\$\{w\.currency\}`}/);
  });
});

describe("server admin transaction approval — refund-to-same-wallet contract", () => {
  const src = readSource("server/admin-routes/admin-transactions.ts");

  it("refunds a rejected withdrawal back to the originating wallet currency (txCurrency, not primary)", () => {
    // The refund branch must pass the *transaction's* wallet currency to the
    // helper. If anyone changes this to the user's primary currency we'd
    // double-credit USD and leave the sub-wallet permanently short.
    expect(src).toMatch(
      /status\s*===\s*"rejected"\s*&&\s*transaction\.type\s*===\s*"withdrawal"[\s\S]{0,500}adjustUserCurrencyBalance\([\s\S]{0,200}txCurrency,[\s\S]{0,80}requestedAmount,[\s\S]{0,80}allowCreate:\s*true/,
    );
  });
});

describe("server deposit route — sub-wallet routing", () => {
  const src = readSource("server/routes/transaction-user.ts");

  it("credits sub-wallet deposits in the deposited currency, not silently in USD", () => {
    // `isPrimaryDeposit` selects between primary credit and sub-wallet credit.
    // A regression here (e.g. always using `creditedAmountUsd`) would mean
    // EGP deposits silently land on the USD primary balance.
    expect(src).toMatch(/isPrimaryDeposit\s*=\s*normalizedDepositCurrency\s*===\s*lockedWalletState\.balanceCurrency/);
    expect(src).toMatch(/storedAmount\s*=\s*walletCreditQuote\.convertedAmount\.toFixed\(2\)/);
  });

  it("rejects sub-wallet withdrawals against currencies not on the user's allow-list", () => {
    expect(src).toMatch(/userAllowedCurrencies\.includes\(withdrawCurrency\)/);
    expect(src).toMatch(/Currency \$\{withdrawCurrency\} is not on your allow-list/);
  });
});
