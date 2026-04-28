/**
 * Unit tests for the digit-script helpers used by every money input
 * (`client/src/lib/numerals.ts`).
 *
 * These guard the behaviour that lets Arabic-speaking users on Android
 * Gboard / iOS Arabic keyboards type Arabic-Indic (٠-٩) or Persian
 * (۰-۹) digits and still produce ASCII strings the backend can parse
 * with `parseFloat`.
 */

import { describe, expect, it } from "vitest";
import { sanitizeMoneyInput, toLatinDigits } from "@/lib/numerals";

describe("toLatinDigits", () => {
  it("returns empty input untouched", () => {
    expect(toLatinDigits("")).toBe("");
  });

  it("passes ASCII through unchanged", () => {
    expect(toLatinDigits("123.45")).toBe("123.45");
    expect(toLatinDigits("abc-7")).toBe("abc-7");
  });

  it("transliterates every Arabic-Indic digit to ASCII", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("transliterates every Persian (Extended Arabic-Indic) digit to ASCII", () => {
    expect(toLatinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("handles mixed Arabic + Latin strings without losing structure", () => {
    expect(toLatinDigits("USD ١٢٣.٤٥")).toBe("USD 123.45");
  });

  it("leaves non-digit characters intact even if surrounded by Arabic digits", () => {
    // U+066B (Arabic decimal) and U+066C (Arabic thousands) are NOT digits;
    // toLatinDigits is digit-only, the separators are normalized later.
    expect(toLatinDigits("١٬٢٣٤٫٥٦")).toBe("1\u066c234\u066b56");
  });
});

describe("sanitizeMoneyInput", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeMoneyInput("")).toBe("");
  });

  it("strips currency symbols and whitespace", () => {
    expect(sanitizeMoneyInput("$ 1,234.50")).toBe("1234.50");
    expect(sanitizeMoneyInput("100 USD")).toBe("100");
  });

  it("converts Arabic-Indic digits to ASCII", () => {
    expect(sanitizeMoneyInput("١٢٣")).toBe("123");
    expect(sanitizeMoneyInput("٩٩٫٩٩")).toBe("99.99");
  });

  it("converts Persian digits to ASCII", () => {
    expect(sanitizeMoneyInput("۲۵۰")).toBe("250");
    expect(sanitizeMoneyInput("۱۰۰۰۰")).toBe("10000");
  });

  it("normalizes Arabic decimal separator (U+066B) to '.'", () => {
    expect(sanitizeMoneyInput("12\u066b34")).toBe("12.34");
    expect(sanitizeMoneyInput("١٢٫٣٤")).toBe("12.34");
  });

  it("drops Arabic thousands separator (U+066C) entirely", () => {
    expect(sanitizeMoneyInput("1\u066c234\u066c567")).toBe("1234567");
    expect(sanitizeMoneyInput("١٬٠٠٠")).toBe("1000");
  });

  it("collapses multiple decimal points down to the first", () => {
    expect(sanitizeMoneyInput("1.2.3.4")).toBe("1.234");
    expect(sanitizeMoneyInput("..5")).toBe(".5");
  });

  it("rejects negatives by default", () => {
    expect(sanitizeMoneyInput("-12.5")).toBe("12.5");
  });

  it("preserves a single leading minus when allowNegative is true", () => {
    expect(sanitizeMoneyInput("-12.5", { allowNegative: true })).toBe("-12.5");
    expect(sanitizeMoneyInput("--12", { allowNegative: true })).toBe("-12");
  });

  it("strips the decimal point entirely when allowDecimal is false", () => {
    expect(sanitizeMoneyInput("12.5", { allowDecimal: false })).toBe("125");
    expect(sanitizeMoneyInput("١٢٫٥", { allowDecimal: false })).toBe("125");
  });

  it("clamps fractional digits when maxFractionDigits is set", () => {
    expect(sanitizeMoneyInput("1.23456789", { maxFractionDigits: 2 })).toBe("1.23");
    expect(sanitizeMoneyInput("١٫٢٣٤٥", { maxFractionDigits: 3 })).toBe("1.234");
  });

  it("handles realistic paste-from-clipboard payloads", () => {
    // Copy-paste from a bank SMS: "حوالة بمبلغ ١٬٢٣٤٫٥٠ ريال"
    expect(sanitizeMoneyInput("حوالة بمبلغ ١٬٢٣٤٫٥٠ ريال")).toBe("1234.50");
    // Copy-paste of a Persian price tag: "قیمت: ۲۵٬۰۰۰ تومان"
    expect(sanitizeMoneyInput("قیمت: ۲۵٬۰۰۰ تومان")).toBe("25000");
  });

  it("returns ASCII-only output for every supported input script", () => {
    for (const sample of ["١٢٣", "۱۲۳", "1\u066c234\u066b56", "12.34"]) {
      const out = sanitizeMoneyInput(sample);
      expect(out).toMatch(/^[0-9.]*$/);
    }
  });
});
