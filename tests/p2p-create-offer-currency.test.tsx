/**
 * Component test for <CreateOfferCurrencyField /> (Task #137).
 *
 * Locks the new sell-offer wallet wording added in Task #126:
 *   - per-currency dropdown hint  `p2p.balanceHint`
 *       EN: "USD — 100 USD available"
 *       AR: "USD — ١٠٠ USD متاح"
 *   - helper line under the picker `p2p.escrowFromWallet`
 *       EN: "Escrow will be held from your USD wallet."
 *       AR: "سيتم حجز الضمان من محفظة USD الخاصة بك."
 *
 * The hint must only render when the user actually has a wallet for
 * that currency — currencies without a wallet entry must show the
 * bare code so we never display "0 available" for a currency the
 * user does not hold. The helper line must update when the picker
 * changes currency.
 *
 * Mirrors the prop-driven render pattern of
 * `tests/tournament-refund-banner.test.tsx` and the i18n / Radix
 * trigger.textContent pattern of
 * `tests/admin-balance-adjust-dialog.test.tsx`.
 */

import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

const { langRef } = vi.hoisted(() => ({
  langRef: { current: "en" as "en" | "ar" },
}));

vi.mock("@/lib/i18n", async () => {
  const enModule = await import("@/locales/en");
  const arModule = await import("@/locales/ar");
  const enDict = (enModule as { default: Record<string, string> }).default;
  const arDict = (arModule as { default: Record<string, string> }).default;

  const interpolate = (text: string, params?: Record<string, string | number>) => {
    if (!params) return text;
    return text.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, p1, p2) => {
      const key = p1 || p2;
      return params[key] !== undefined ? String(params[key]) : match;
    });
  };

  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) => {
        const dict = langRef.current === "ar" ? arDict : enDict;
        const value = dict[key] ?? enDict[key] ?? key;
        return interpolate(value, params);
      },
      language: langRef.current,
      dir: (langRef.current === "ar" ? "rtl" : "ltr") as "ltr" | "rtl",
      setLanguage: () => {},
      isLoading: false,
    }),
  };
});

import { Form } from "@/components/ui/form";
import { CreateOfferCurrencyField, type CreateOfferForm } from "@/pages/p2p";

const FORM_DEFAULTS: CreateOfferForm = {
  type: "sell",
  dealKind: "standard_asset",
  digitalProductType: "",
  exchangeOffered: "",
  exchangeRequested: "",
  supportMediationRequested: false,
  requestedAdminFeePercentage: "",
  visibility: "public",
  targetUserId: "",
  amount: "1",
  price: "1",
  currency: "USD",
  fiatCurrency: "USD",
  minLimit: "1",
  maxLimit: "1",
  paymentMethodIds: ["bank_transfer"],
  paymentTimeLimit: "30",
  terms: "test terms",
  autoReply: "test auto reply",
};

type HarnessProps = {
  initialCurrency?: string;
  selectedOfferType?: string;
  availableOfferCurrencies: string[];
  walletBalanceByCurrency: Map<string, number>;
  numberLocale?: string;
  serverWalletErrorMessage?: string | null;
};

function Harness(props: HarnessProps) {
  const {
    initialCurrency = "USD",
    selectedOfferType = "sell",
    availableOfferCurrencies,
    walletBalanceByCurrency,
    numberLocale = "en-US",
    serverWalletErrorMessage = null,
  } = props;

  const form = useForm<CreateOfferForm>({
    defaultValues: { ...FORM_DEFAULTS, currency: initialCurrency },
  });

  const [, forceRender] = useState(0);

  return (
    <Form {...form}>
      <CreateOfferCurrencyField
        control={form.control}
        selectedOfferType={selectedOfferType}
        availableOfferCurrencies={availableOfferCurrencies}
        walletBalanceByCurrency={walletBalanceByCurrency}
        numberLocale={numberLocale}
        serverWalletErrorMessage={serverWalletErrorMessage}
      />
      {/* Test-only switcher used to drive `field.onChange` without
          having to drive Radix's portal-based dropdown in jsdom. */}
      <button
        type="button"
        data-testid="set-currency-eur"
        onClick={() => {
          form.setValue("currency", "EUR");
          forceRender((n) => n + 1);
        }}
      >
        switch to EUR
      </button>
    </Form>
  );
}

describe("CreateOfferCurrencyField — English copy (Task #126 wording lock)", () => {
  it("renders the per-currency balance hint for the selected currency when the user holds a wallet (EN)", () => {
    langRef.current = "en";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR", "EGP"]}
        walletBalanceByCurrency={new Map([
          ["USD", 100],
          ["EGP", 250.5],
        ])}
        numberLocale="en-US"
      />,
    );

    // The Radix SelectTrigger mirrors the selected SelectItem's children
    // through <SelectValue />, so the trigger's text content reflects
    // exactly what the dropdown renders for the selected currency.
    const trigger = screen.getByTestId("select-offer-currency");
    expect(trigger.textContent || "").toContain("USD — 100 USD available");
  });

  it("renders the helper line 'Escrow will be held from your USD wallet.' when sell + USD is selected (EN)", () => {
    langRef.current = "en";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="en-US"
      />,
    );

    const helper = screen.getByTestId("sell-currency-helper");
    expect(helper.textContent).toBe("Escrow will be held from your USD wallet.");
  });

  it("falls back to the bare currency code (no '— available' hint) for currencies without a wallet entry (EN)", () => {
    langRef.current = "en";

    render(
      <Harness
        initialCurrency="EUR"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="en-US"
      />,
    );

    const trigger = screen.getByTestId("select-offer-currency");
    const triggerText = trigger.textContent || "";

    // Bare code — never the "0 available" mistake for a currency the
    // user does not hold.
    expect(triggerText).toContain("EUR");
    expect(triggerText).not.toContain("available");
    expect(triggerText).not.toContain("—");
    expect(triggerText).not.toMatch(/EUR\s+0/);
  });

  it("hides the dropdown hint for buy offers even when the user has a wallet for the currency (EN)", () => {
    langRef.current = "en";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="buy"
        availableOfferCurrencies={["USD"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="en-US"
      />,
    );

    const trigger = screen.getByTestId("select-offer-currency");
    expect(trigger.textContent || "").not.toContain("available");
    expect(screen.queryByTestId("sell-currency-helper")).toBeNull();
  });

  it("updates the helper line when the picker switches from USD to EUR (EN)", () => {
    langRef.current = "en";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="en-US"
      />,
    );

    expect(screen.getByTestId("sell-currency-helper").textContent).toBe(
      "Escrow will be held from your USD wallet.",
    );

    fireEvent.click(screen.getByTestId("set-currency-eur"));

    expect(screen.getByTestId("sell-currency-helper").textContent).toBe(
      "Escrow will be held from your EUR wallet.",
    );
  });

  it("renders the server-side wallet error message when provided (EN)", () => {
    langRef.current = "en";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="en-US"
        serverWalletErrorMessage="No wallet currencies available."
      />,
    );

    expect(screen.getByTestId("sell-currency-server-error").textContent).toBe(
      "No wallet currencies available.",
    );
  });
});

describe("CreateOfferCurrencyField — Arabic copy (Task #126 wording lock)", () => {
  it("renders the Arabic balance hint with Arabic-Indic digits for the selected currency", () => {
    langRef.current = "ar";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="ar-SA-u-nu-arab"
      />,
    );

    const trigger = screen.getByTestId("select-offer-currency");
    const triggerText = trigger.textContent || "";

    // "USD — ١٠٠ USD متاح" — Arabic digits + Arabic suffix from p2p.balanceHint.
    expect(triggerText).toContain("USD");
    expect(triggerText).toContain("متاح");
    expect(triggerText).toContain("١٠٠");
    expect(triggerText).not.toContain("available");
  });

  it("renders the Arabic escrow helper line under the picker", () => {
    langRef.current = "ar";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="ar-SA-u-nu-arab"
      />,
    );

    expect(screen.getByTestId("sell-currency-helper").textContent).toBe(
      "سيتم حجز الضمان من محفظة USD الخاصة بك.",
    );
  });

  it("falls back to the bare currency code for currencies without a wallet entry (AR)", () => {
    langRef.current = "ar";

    render(
      <Harness
        initialCurrency="EUR"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="ar-SA-u-nu-arab"
      />,
    );

    const triggerText = screen.getByTestId("select-offer-currency").textContent || "";
    expect(triggerText).toContain("EUR");
    expect(triggerText).not.toContain("متاح");
    expect(triggerText).not.toContain("—");
  });

  it("updates the Arabic helper line when the picker switches from USD to EUR", () => {
    langRef.current = "ar";

    render(
      <Harness
        initialCurrency="USD"
        selectedOfferType="sell"
        availableOfferCurrencies={["USD", "EUR"]}
        walletBalanceByCurrency={new Map([["USD", 100]])}
        numberLocale="ar-SA-u-nu-arab"
      />,
    );

    expect(screen.getByTestId("sell-currency-helper").textContent).toBe(
      "سيتم حجز الضمان من محفظة USD الخاصة بك.",
    );

    fireEvent.click(screen.getByTestId("set-currency-eur"));

    expect(screen.getByTestId("sell-currency-helper").textContent).toBe(
      "سيتم حجز الضمان من محفظة EUR الخاصة بك.",
    );
  });
});
