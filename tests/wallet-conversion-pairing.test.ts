import { describe, expect, it } from "vitest";
import {
  groupConversionPairs,
  isConversionPair,
  parseFeePctFromDescription,
} from "../client/src/lib/conversion-pairing";
import type { Transaction } from "../shared/schema";

function tx(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: partial.id,
    publicReference: partial.publicReference ?? `TXN-${partial.id}`,
    userId: partial.userId ?? "user-1",
    type: partial.type ?? "currency_conversion",
    status: partial.status ?? "completed",
    amount: partial.amount ?? "0.00",
    balanceBefore: partial.balanceBefore ?? "0.00",
    balanceAfter: partial.balanceAfter ?? "0.00",
    description: partial.description ?? null,
    referenceId: partial.referenceId ?? null,
    walletCurrencyCode: partial.walletCurrencyCode ?? null,
    processedBy: partial.processedBy ?? null,
    processedAt: partial.processedAt ?? null,
    adminNote: partial.adminNote ?? null,
    createdAt: partial.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: partial.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  } as Transaction;
}

describe("parseFeePctFromDescription", () => {
  it("extracts the fee percent from the standard conversion description", () => {
    const desc = "Convert 100.00 EGP → 5.20 SAR (rate 0.052000 SAR/USD, fee 1.50%)";
    expect(parseFeePctFromDescription(desc)).toBe(1.5);
  });

  it("handles a 0% fee", () => {
    const desc = "Convert 100.00 EGP → 5.20 SAR (rate 0.052000 SAR/USD, fee 0.00%)";
    expect(parseFeePctFromDescription(desc)).toBe(0);
  });

  it("returns null when the description does not contain a fee", () => {
    expect(parseFeePctFromDescription("anything else")).toBeNull();
    expect(parseFeePctFromDescription(null)).toBeNull();
    expect(parseFeePctFromDescription(undefined)).toBeNull();
  });
});

describe("groupConversionPairs", () => {
  it("groups two mutually-referencing conversion legs into a single pair", () => {
    const debit = tx({
      id: "leg-debit",
      type: "currency_conversion",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "1000.00",
      balanceAfter: "500.00",
      description: "Convert 500.00 EGP → 37.13 SAR (rate 3.750000 SAR/USD, fee 1.00%)",
      referenceId: "leg-credit",
    });
    const credit = tx({
      id: "leg-credit",
      type: "currency_conversion",
      walletCurrencyCode: "SAR",
      amount: "37.13",
      balanceBefore: "0.00",
      balanceAfter: "37.13",
      description: "Convert 500.00 EGP → 37.13 SAR (rate 3.750000 SAR/USD, fee 1.00%)",
      referenceId: "leg-debit",
    });

    const items = groupConversionPairs([debit, credit]);
    expect(items).toHaveLength(1);
    const [pair] = items;
    expect(isConversionPair(pair)).toBe(true);
    if (!isConversionPair(pair)) return;

    expect(pair.debit.id).toBe("leg-debit");
    expect(pair.credit.id).toBe("leg-credit");
    expect(pair.feePct).toBe(1);
    expect(pair.feeAmount).toBeCloseTo(0.38, 2);
    // 37.13 / 500 = 0.07426
    expect(pair.effectiveRate).toBeCloseTo(0.07426, 5);
    expect(pair.isReversal).toBe(false);
  });

  it("classifies the debit leg by detecting a falling balance regardless of input order", () => {
    const credit = tx({
      id: "credit-id",
      walletCurrencyCode: "SAR",
      amount: "10.00",
      balanceBefore: "0.00",
      balanceAfter: "10.00",
      referenceId: "debit-id",
      description: "Convert 100.00 EGP → 10.00 SAR (rate 3.750000 SAR/USD, fee 0.00%)",
    });
    const debit = tx({
      id: "debit-id",
      walletCurrencyCode: "EGP",
      amount: "100.00",
      balanceBefore: "200.00",
      balanceAfter: "100.00",
      referenceId: "credit-id",
      description: "Convert 100.00 EGP → 10.00 SAR (rate 3.750000 SAR/USD, fee 0.00%)",
    });

    const [pair] = groupConversionPairs([credit, debit]);
    if (!isConversionPair(pair)) throw new Error("expected pair");

    expect(pair.debit.id).toBe("debit-id");
    expect(pair.credit.id).toBe("credit-id");
    expect(pair.feeAmount).toBe(0);
  });

  it("groups reversal legs by identical description even though referenceIds point at the originals", () => {
    const reversalDesc = "Reversal: reversal of conversion TXN-A ↔ TXN-B. Reason: oops";
    const sourceCredit = tx({
      id: "rev-src",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "0.00",
      balanceAfter: "500.00",
      // Reversal legs reference the ORIGINAL legs, not each other.
      referenceId: "orig-debit",
      description: reversalDesc,
    });
    const destinationDebit = tx({
      id: "rev-dst",
      walletCurrencyCode: "SAR",
      amount: "37.13",
      balanceBefore: "37.13",
      balanceAfter: "0.00",
      referenceId: "orig-credit",
      description: reversalDesc,
    });

    const items = groupConversionPairs([sourceCredit, destinationDebit]);
    expect(items).toHaveLength(1);
    const [pair] = items;
    if (!isConversionPair(pair)) throw new Error("expected pair");
    expect(pair.isReversal).toBe(true);
    expect(pair.debit.id).toBe("rev-dst");
    expect(pair.credit.id).toBe("rev-src");
  });

  it("leaves non-conversion transactions untouched and surrounding pair grouping unaffected", () => {
    const deposit = tx({ id: "dep", type: "deposit", amount: "100.00" });
    const withdrawal = tx({ id: "wd", type: "withdrawal", amount: "20.00" });
    const debit = tx({
      id: "leg-debit",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "1000.00",
      balanceAfter: "500.00",
      description: "Convert 500.00 EGP → 37.13 SAR (rate 3.750000 SAR/USD, fee 1.00%)",
      referenceId: "leg-credit",
    });
    const credit = tx({
      id: "leg-credit",
      walletCurrencyCode: "SAR",
      amount: "37.13",
      balanceBefore: "0.00",
      balanceAfter: "37.13",
      description: "Convert 500.00 EGP → 37.13 SAR (rate 3.750000 SAR/USD, fee 1.00%)",
      referenceId: "leg-debit",
    });

    const items = groupConversionPairs([deposit, debit, credit, withdrawal]);
    expect(items).toHaveLength(3);
    expect((items[0] as Transaction).id).toBe("dep");
    expect(isConversionPair(items[1])).toBe(true);
    expect((items[2] as Transaction).id).toBe("wd");
  });

  it("renders an orphan conversion leg when its partner is not in the loaded page", () => {
    const debit = tx({
      id: "leg-debit",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "1000.00",
      balanceAfter: "500.00",
      description: "Convert 500.00 EGP → 37.13 SAR (rate 3.750000 SAR/USD, fee 1.00%)",
      referenceId: "missing-leg",
    });

    const items = groupConversionPairs([debit]);
    expect(items).toHaveLength(1);
    expect(isConversionPair(items[0])).toBe(false);
    expect((items[0] as Transaction).id).toBe("leg-debit");
  });

  it("does not collapse two same-description orphans that have the same balance direction", () => {
    // Two unrelated debit-leg orphans with identical descriptions: their
    // partners (credit legs) fell off the loaded page. They must NOT collapse
    // into a single pair just because the description text matches.
    const debitA = tx({
      id: "debit-a",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "1000.00",
      balanceAfter: "500.00",
      description: "Convert 500.00 EGP → 10.00 USD (rate 1.000000 USD/USD, fee 0.00%)",
      referenceId: "missing-credit-a",
      createdAt: new Date("2026-01-01T10:00:00Z"),
    });
    const debitB = tx({
      id: "debit-b",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "500.00",
      balanceAfter: "0.00",
      description: "Convert 500.00 EGP → 10.00 USD (rate 1.000000 USD/USD, fee 0.00%)",
      referenceId: "missing-credit-b",
      createdAt: new Date("2026-01-01T10:00:30Z"),
    });

    const items = groupConversionPairs([debitA, debitB]);
    expect(items).toHaveLength(2);
    expect(isConversionPair(items[0])).toBe(false);
    expect(isConversionPair(items[1])).toBe(false);
  });

  it("does not collapse same-description legs created more than a minute apart", () => {
    const reversalDesc = "Reversal: reversal of conversion TXN-A ↔ TXN-B. Reason: oops";
    const earlyCredit = tx({
      id: "rev-src-old",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "0.00",
      balanceAfter: "500.00",
      referenceId: "missing",
      description: reversalDesc,
      createdAt: new Date("2026-01-01T10:00:00Z"),
    });
    const lateDebit = tx({
      id: "rev-dst-new",
      walletCurrencyCode: "SAR",
      amount: "37.13",
      balanceBefore: "37.13",
      balanceAfter: "0.00",
      referenceId: "missing-too",
      description: reversalDesc,
      createdAt: new Date("2026-01-01T11:00:00Z"),
    });

    const items = groupConversionPairs([earlyCredit, lateDebit]);
    // 1h apart, so even though descriptions match and directions are
    // opposite, we refuse to pair them.
    expect(items).toHaveLength(2);
    expect(isConversionPair(items[0])).toBe(false);
    expect(isConversionPair(items[1])).toBe(false);
  });

  it("does not pair a conversion leg whose partner only one-way references it", () => {
    // This guards against accidentally pairing an original conversion leg
    // with one of its reversal legs (which references the original but is
    // not referenced back).
    const orig = tx({
      id: "orig",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "1000.00",
      balanceAfter: "500.00",
      description: "Convert 500.00 EGP → 10.00 USD (rate 1.000000 USD/USD, fee 0.00%)",
      referenceId: "orig-credit",
    });
    const reversalRef = tx({
      id: "rev-leg",
      walletCurrencyCode: "EGP",
      amount: "500.00",
      balanceBefore: "0.00",
      balanceAfter: "500.00",
      description: "Reversal: reversal of conversion TXN-orig ↔ TXN-orig-credit. Reason: x",
      referenceId: "orig",
    });

    const items = groupConversionPairs([orig, reversalRef]);
    // Neither has a mutual partner in the page and they have different
    // descriptions so neither falls through into description-based pairing.
    expect(items).toHaveLength(2);
    expect(isConversionPair(items[0])).toBe(false);
    expect(isConversionPair(items[1])).toBe(false);
  });
});
