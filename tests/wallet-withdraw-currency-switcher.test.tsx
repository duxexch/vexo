/**
 * Component test for <WithdrawDialog /> currency switcher (Task #199).
 *
 * The earlier per-wallet balance test (`wallet-withdraw-dialog.test.tsx`)
 * relies on `defaultCurrency` to seed the active wallet, because driving
 * the Radix Select popover under jsdom is flaky. That left the
 * `onValueChange` branch in `WithdrawDialog`'s currency picker — which
 * also resets the amount field — without direct coverage.
 *
 * This test closes that gap. It opens the dialog with USD active, types
 * an amount, then drives the Radix Select with a real
 * `@testing-library/user-event` interaction to switch to SAR. It then
 * asserts:
 *   1. The amount input is cleared (the `setWithdrawAmount("")` branch
 *      ran).
 *   2. The available-balance line now reflects the SAR wallet's balance
 *      (proving the picker actually changed the selected currency).
 *
 * Radix Select in jsdom needs a few pointer-event APIs polyfilled before
 * the popover will open, so they are added here rather than globally to
 * keep the existing setup file minimal.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en" as const,
    dir: "ltr" as const,
  }),
}));

vi.mock("@/hooks/use-guided-focus", () => ({
  useGuidedFocus: () => ({
    focusAndScroll: () => {},
    queueFocus: () => {},
    focusFirstInteractiveIn: () => {},
  }),
}));

import { WithdrawDialog } from "@/components/wallet/WithdrawDialog";
import type { CountryPaymentMethod } from "@shared/schema";

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

beforeAll(() => {
  // Radix Select uses Pointer Events / setPointerCapture under the hood;
  // jsdom doesn't ship them, so the popover never opens unless we stub
  // the few APIs Radix actually calls. Using a typed cast instead of
  // `as any` keeps the test file clean of escape hatches.
  type ElementWithPointerCapture = Element & {
    hasPointerCapture: (id: number) => boolean;
    setPointerCapture: (id: number) => void;
    releasePointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  };
  const proto = Element.prototype as ElementWithPointerCapture;
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
});

describe("<WithdrawDialog /> — currency switcher resets amount and balance", () => {
  it(
    "switching from USD to SAR clears the amount and updates available-balance",
    async () => {
      const user = userEvent.setup();

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
          onSubmit={vi.fn()}
          isSubmitting={false}
        />,
      );

      // Sanity: the dialog starts on USD with the USD wallet's balance
      // shown so we know the switcher actually has somewhere to switch
      // to.
      const balanceLine = screen.getByTestId(
        "text-withdraw-available",
      ) as HTMLElement;
      expect(balanceLine.textContent).toContain("USD");
      expect(balanceLine.textContent).toContain("1000.00");

      // Type an amount BEFORE switching currency. The whole point of
      // the onValueChange branch is to clear this when the user picks a
      // different wallet, so we need it to be non-empty first.
      const amountInput = screen.getByTestId(
        "input-withdraw-amount",
      ) as HTMLInputElement;
      await user.type(amountInput, "75");
      expect(amountInput.value).toBe("75");

      // Real user-event interaction with the Radix Select: clicking the
      // trigger opens the popover, then clicking the SAR option commits
      // the new value. If Radix's pointer-event polyfills above are
      // missing, this is where the test would hang/fail.
      const trigger = screen.getByTestId("select-withdraw-currency");
      await user.click(trigger);

      const sarOption = await screen.findByRole("option", { name: /SAR/ });
      await user.click(sarOption);

      // The onValueChange branch must have cleared the amount input.
      await waitFor(() => {
        expect(
          (screen.getByTestId("input-withdraw-amount") as HTMLInputElement)
            .value,
        ).toBe("");
      });

      // And the available-balance line must now reflect the SAR wallet.
      // We assert on both the currency code and the SAR balance value
      // so a regression that swaps either piece in isolation still
      // fails.
      await waitFor(() => {
        const updated = screen.getByTestId(
          "text-withdraw-available",
        ) as HTMLElement;
        expect(updated.textContent).toContain("SAR");
        expect(updated.textContent).toContain("50.00");
        expect(updated.textContent).not.toContain("1000.00");
      });
    },
    15000,
  );
});
