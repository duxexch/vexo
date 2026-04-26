import { describe, expect, it } from "vitest";
import { quoteWalletConversion } from "../server/lib/currency-conversion";

const RATES: Record<string, number> = {
  USD: 1,
  EGP: 50,
  SAR: 3.75,
};

describe("quoteWalletConversion", () => {
  it("converts EGP → SAR using USD as the bridge currency with no fee", () => {
    const q = quoteWalletConversion("EGP", "SAR", 500, 0, RATES);
    expect(q).not.toBeNull();
    expect(q!.fromCurrency).toBe("EGP");
    expect(q!.toCurrency).toBe("SAR");
    expect(q!.fromAmount).toBe(500);
    expect(q!.amountUsd).toBeCloseTo(10, 5);
    expect(q!.feePct).toBe(0);
    expect(q!.feeAmount).toBe(0);
    expect(q!.grossToAmount).toBeCloseTo(37.5, 2);
    expect(q!.netToAmount).toBeCloseTo(37.5, 2);
  });

  it("applies the fee on the destination side and preserves principal precision", () => {
    const q = quoteWalletConversion("EGP", "SAR", 500, 1, RATES);
    expect(q).not.toBeNull();
    expect(q!.feePct).toBe(1);
    expect(q!.feeAmount).toBeCloseTo(0.38, 2);
    expect(q!.netToAmount).toBeCloseTo(37.12, 2);
  });

  it("clamps absurdly high fee values to 100% but never lets net go negative", () => {
    const q = quoteWalletConversion("EGP", "SAR", 500, 99999, RATES);
    expect(q).toBeNull();
  });

  it("returns null for the same source and destination currency", () => {
    expect(quoteWalletConversion("EGP", "EGP", 100, 0, RATES)).toBeNull();
  });

  it("returns null when the rate table is missing one side", () => {
    expect(quoteWalletConversion("EGP", "JPY", 100, 0, RATES)).toBeNull();
    expect(quoteWalletConversion("JPY", "SAR", 100, 0, RATES)).toBeNull();
  });

  it("returns null for non-positive amounts", () => {
    expect(quoteWalletConversion("EGP", "SAR", 0, 0, RATES)).toBeNull();
    expect(quoteWalletConversion("EGP", "SAR", -10, 0, RATES)).toBeNull();
    expect(quoteWalletConversion("EGP", "SAR", Number.NaN, 0, RATES)).toBeNull();
  });

  it("normalizes lowercase currency codes", () => {
    const q = quoteWalletConversion("egp", "sar", 500, 0, RATES);
    expect(q).not.toBeNull();
    expect(q!.fromCurrency).toBe("EGP");
    expect(q!.toCurrency).toBe("SAR");
  });
});
