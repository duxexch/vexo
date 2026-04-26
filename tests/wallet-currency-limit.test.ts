import { describe, it, expect } from "vitest";
import { formatLimitInLocalCurrency, convertUsdToCurrencyAmount } from "../client/src/lib/wallet-currency";

describe("formatLimitInLocalCurrency", () => {
  it("returns null for missing input", () => {
    expect(formatLimitInLocalCurrency(null, "USD", { USD: 1 })).toBeNull();
    expect(formatLimitInLocalCurrency(undefined, "USD", { USD: 1 })).toBeNull();
    expect(formatLimitInLocalCurrency("", "USD", { USD: 1 })).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(formatLimitInLocalCurrency("abc", "USD", { USD: 1 })).toBeNull();
  });

  it("converts USD limit to local currency using rate", () => {
    const result = formatLimitInLocalCurrency("10", "EGP", { EGP: 31 });
    expect(result).not.toBeNull();
    expect(result!.localAmount).toBeCloseTo(310);
    expect(result!.usdAmount).toBe(10);
    expect(result!.usd).toBe("$10.00");
    expect(result!.local).toBe("EGP310.00");
  });

  it("falls back to USD value when rate is missing", () => {
    const result = formatLimitInLocalCurrency("10", "ZZZ", {});
    expect(result!.localAmount).toBe(10);
  });

  it("uses symbol map when provided and appends code when distinct", () => {
    const result = formatLimitInLocalCurrency("10", "USD", { USD: 1 }, { USD: "$" });
    expect(result!.local).toBe("$10.00 USD");
  });
});

describe("convertUsdToCurrencyAmount", () => {
  it("multiplies by rate", () => {
    expect(convertUsdToCurrencyAmount(10, "EGP", { EGP: 31 })).toBeCloseTo(310);
  });
  it("returns USD when rate missing", () => {
    expect(convertUsdToCurrencyAmount(10, "ZZZ")).toBe(10);
  });
  it("handles non-finite USD as 0", () => {
    expect(convertUsdToCurrencyAmount(NaN, "USD", { USD: 1 })).toBe(0);
  });
});
