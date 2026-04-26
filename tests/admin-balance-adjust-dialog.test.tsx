/**
 * Component test for <AdminBalanceAdjustDialog /> + <PerCurrencyWalletsTable />
 * (Task #134).
 *
 * Replaces the source-text-matching sentinel
 * `tests/wallet-paths-source-sentinel.test.ts` with a real behaviour
 * test: clicking the per-row "Adjust" button on the EGP row must open
 * the adjust dialog with EGP pre-selected in the currency picker (not
 * the user's primary currency).
 *
 * This proves the per-currency table is wired to the dialog's
 * `initialCurrency` re-seeding effect — the contract that lets admins
 * adjust a non-primary wallet without manually re-picking the currency.
 */

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en" as const,
    dir: "ltr" as const,
  }),
}));

import {
  AdminBalanceAdjustDialog,
  type AdminBalanceAdjustSubmitPayload,
} from "@/components/admin/AdminBalanceAdjustDialog";
import { PerCurrencyWalletsTable } from "@/components/admin/PerCurrencyWalletsTable";

afterEach(() => {
  cleanup();
});

const WALLETS = [
  { currency: "USD", balance: "100.00", isPrimary: true, isAllowed: true },
  { currency: "EGP", balance: "250.00", isPrimary: false, isAllowed: true },
  { currency: "SAR", balance: "50.00", isPrimary: false, isAllowed: true },
];

function Harness({
  onSubmit,
}: {
  onSubmit: (payload: AdminBalanceAdjustSubmitPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState("");

  return (
    <>
      <PerCurrencyWalletsTable
        wallets={WALLETS}
        onAdjust={(currency) => {
          setPendingCurrency(currency);
          setOpen(true);
        }}
      />
      <AdminBalanceAdjustDialog
        open={open}
        onOpenChange={setOpen}
        selectedUser={{
          id: "user-1",
          username: "alice",
          balance: "100.00",
        }}
        currencyWalletsData={{
          primaryCurrency: "USD",
          allowedCurrencies: ["USD", "EGP", "SAR"],
        }}
        initialCurrency={pendingCurrency}
        initialWallet="usd"
        isSubmitting={false}
        onSubmit={onSubmit}
      />
    </>
  );
}

describe("Admin per-currency Adjust → AdminBalanceAdjustDialog wiring", () => {
  it("clicking Adjust on the EGP row opens the dialog with EGP pre-selected", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    // The dialog isn't open yet — confirm button shouldn't be in the tree.
    expect(screen.queryByTestId("button-confirm-action")).toBeNull();

    // Click the Adjust button on the EGP row.
    fireEvent.click(screen.getByTestId("button-adjust-EGP"));

    // Dialog is now open.
    const currencyTrigger = screen.getByTestId("select-adjust-currency");
    expect(currencyTrigger).toBeTruthy();

    // The Radix SelectTrigger renders the selected option's text inside
    // the trigger via <SelectValue />. So the trigger's text content
    // must include "EGP" — proving the row click seeded the dialog with
    // EGP rather than the user's primary (USD) currency.
    expect(currencyTrigger.textContent || "").toContain("EGP");
    expect(currencyTrigger.textContent || "").not.toContain("USD");
  });

  it("re-seeds when a different row is clicked after closing the dialog", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    // Open with EGP first.
    fireEvent.click(screen.getByTestId("button-adjust-EGP"));
    expect(
      screen.getByTestId("select-adjust-currency").textContent || "",
    ).toContain("EGP");

    // Close the dialog by clicking Cancel.
    fireEvent.click(screen.getByText("Cancel"));

    // Re-open by clicking the SAR row.
    fireEvent.click(screen.getByTestId("button-adjust-SAR"));

    // Currency select should now reflect SAR, not the previous EGP.
    expect(
      screen.getByTestId("select-adjust-currency").textContent || "",
    ).toContain("SAR");
    expect(
      screen.getByTestId("select-adjust-currency").textContent || "",
    ).not.toContain("EGP");
  });
});
