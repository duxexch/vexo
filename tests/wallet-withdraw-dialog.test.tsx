/**
 * Component test for <WithdrawDialog /> (Task #134).
 *
 * Replaces the source-text-matching sentinel
 * `tests/wallet-paths-source-sentinel.test.ts` with a real behaviour
 * test: when the user picks the SAR wallet and types an amount that
 * exceeds the SAR balance, the confirm button must stay disabled even
 * after picking a payment method and entering a receiver number.
 *
 * This proves the dialog's per-wallet balance gating is wired to the
 * currently-selected currency (not to a global fallback) and protects
 * against a future regression that would let users submit a withdraw
 * larger than the balance of the chosen wallet.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en" as const,
    dir: "ltr" as const,
  }),
}));

// useGuidedFocus calls element.scrollIntoView which jsdom doesn't
// implement; the focus side-effects aren't relevant to the gating
// behaviour under test, so stub them out to avoid an unhandled timeout
// rejection during teardown.
vi.mock("@/hooks/use-guided-focus", () => ({
  useGuidedFocus: () => ({
    focusAndScroll: () => {},
    queueFocus: () => {},
    focusFirstInteractiveIn: () => {},
  }),
}));

import { WithdrawDialog } from "@/components/wallet/WithdrawDialog";
import type { CountryPaymentMethod } from "@shared/schema";

afterEach(() => {
  cleanup();
});

const PAYMENT_METHODS: CountryPaymentMethod[] = [
  {
    id: "pm-bank",
    countryCode: "SA",
    name: "Bank Transfer",
    type: "bank_transfer",
    methodNumber: "SA-IBAN-1",
    enabled: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CountryPaymentMethod,
];

const WALLETS = [
  { currency: "USD", balance: "1000.00", isPrimary: true },
  { currency: "SAR", balance: "50.00", isPrimary: false },
];

function fillFormExcludingAmount() {
  fireEvent.click(screen.getByTestId("button-withdraw-payment-pm-bank"));
  const receiverInput = screen.getByTestId(
    "input-withdraw-receiver",
  ) as HTMLInputElement;
  fireEvent.change(receiverInput, { target: { value: "ACCT-1" } });
}

describe("<WithdrawDialog /> — per-wallet balance gating", () => {
  it("keeps confirm disabled when amount exceeds the SELECTED wallet's balance (SAR=50)", () => {
    const onSubmit = vi.fn();

    // Render with SAR as the active currency. The dialog's gate must
    // read the SAR wallet's balance (50.00), not the USD fallback
    // (1000.00) — that is the behaviour the deleted source-text
    // sentinel used to assert by regex.
    render(
      <WithdrawDialog
        open
        onOpenChange={() => {}}
        multiCurrencyEnabled
        wallets={WALLETS}
        defaultCurrency="SAR"
        fallbackBalance={1000}
        currencySymbolByCode={{ USD: "$", SAR: "SAR" }}
        paymentMethods={PAYMENT_METHODS}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    // 100 SAR is well over the SAR wallet's 50.00 balance, but it is
    // far under the USD wallet's 1000.00 — so this case can only fail
    // the gate if the dialog is using the SELECTED wallet's balance.
    const amountInput = screen.getByTestId(
      "input-withdraw-amount",
    ) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100" } });

    fillFormExcludingAmount();

    const confirm = screen.getByTestId(
      "button-confirm-withdraw",
    ) as HTMLButtonElement;

    expect(confirm.disabled).toBe(true);

    // The "exceeds balance" hint must be rendered to give the user a
    // recovery cue, not just silently disable the button.
    expect(screen.getByTestId("text-withdraw-exceeds")).toBeTruthy();

    fireEvent.click(confirm);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enables confirm when the same amount fits in the selected wallet's balance (USD=1000)", () => {
    const onSubmit = vi.fn();

    // Same 100 amount, but with USD selected — the USD wallet balance
    // is 1000, so the gate must NOT block the submission. This proves
    // the gate is per-wallet and not a global cap.
    render(
      <WithdrawDialog
        open
        onOpenChange={() => {}}
        multiCurrencyEnabled
        wallets={WALLETS}
        defaultCurrency="USD"
        fallbackBalance={1000}
        currencySymbolByCode={{ USD: "$", SAR: "SAR" }}
        paymentMethods={PAYMENT_METHODS}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    const amountInput = screen.getByTestId(
      "input-withdraw-amount",
    ) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100" } });

    fillFormExcludingAmount();

    const confirm = screen.getByTestId(
      "button-confirm-withdraw",
    ) as HTMLButtonElement;

    expect(confirm.disabled).toBe(false);
    expect(screen.queryByTestId("text-withdraw-exceeds")).toBeNull();
  });
});
