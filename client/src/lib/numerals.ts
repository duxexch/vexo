/**
 * Digit-script helpers for financial inputs.
 *
 * Arabic-language users on Android/iOS frequently have their system keyboard
 * set to type Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) or, less commonly, Extended
 * Arabic-Indic / Persian numerals (۰۱۲۳۴۵۶۷۸۹). The backend, the
 * exchange-rate engine, and `parseFloat` all expect ASCII digits (0-9), so
 * any money input on the client must canonicalize to Latin digits before the
 * value reaches state, validation, or the wire.
 *
 * These helpers are intentionally pure (no React) so they can be reused from
 * MoneyInput, react-hook-form resolvers, and one-off paste handlers.
 */

const ARABIC_INDIC_ZERO = 0x0660; // ٠
const ARABIC_INDIC_NINE = 0x0669; // ٩
const PERSIAN_ZERO = 0x06f0; // ۰
const PERSIAN_NINE = 0x06f9; // ۹

/**
 * Replace Arabic-Indic and Persian digits with their ASCII equivalents.
 * Other characters pass through unchanged.
 */
export function toLatinDigits(value: string): string {
  if (!value) return value;
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= PERSIAN_ZERO && code <= PERSIAN_NINE) {
      return String(code - PERSIAN_ZERO);
    }
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_NINE) {
      return String(code - ARABIC_INDIC_ZERO);
    }
    return ch;
  });
}

export interface SanitizeMoneyOptions {
  /** Allow a single decimal point. Defaults to true. */
  allowDecimal?: boolean;
  /** Allow a leading minus sign. Defaults to false (financial inputs are positive). */
  allowNegative?: boolean;
  /** Maximum number of fractional digits. Defaults to undefined (unbounded). */
  maxFractionDigits?: number;
}

/**
 * Normalize a raw user-typed string to a clean ASCII-only money string.
 *
 * Steps:
 *  1. Convert Arabic-Indic / Persian digits to Latin.
 *  2. Convert Arabic decimal separator (٫ U+066B) to "." and drop the
 *     Arabic thousands separator (٬ U+066C).
 *  3. Strip every character that isn't a digit / "." / optional "-".
 *  4. Collapse multiple decimal points down to the first one.
 *  5. Optionally clamp the fractional length.
 *
 * Always returns a string (possibly empty) so it can be fed directly into a
 * controlled <input value={...} />.
 */
export function sanitizeMoneyInput(raw: string, options: SanitizeMoneyOptions = {}): string {
  const { allowDecimal = true, allowNegative = false, maxFractionDigits } = options;
  if (!raw) return "";

  let s = toLatinDigits(raw);
  s = s.replace(/\u066b/g, ".").replace(/\u066c/g, "");

  // Preserve a single leading minus sign before stripping non-numerics.
  let sign = "";
  if (allowNegative && s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  }

  const stripPattern = allowDecimal ? /[^0-9.]/g : /[^0-9]/g;
  s = s.replace(stripPattern, "");

  if (allowDecimal) {
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    }
    if (maxFractionDigits !== undefined && firstDot !== -1) {
      const [intPart, fracPart = ""] = s.split(".");
      s = `${intPart}.${fracPart.slice(0, maxFractionDigits)}`;
    }
  }

  return sign + s;
}
