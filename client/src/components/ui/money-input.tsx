import * as React from "react";
import { Input } from "@/components/ui/input";
import { sanitizeMoneyInput, type SanitizeMoneyOptions } from "@/lib/numerals";

export interface MoneyInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "inputMode"> {
  /**
   * Allow a single decimal point. When false, only integers (e.g. whole-coin
   * counts) are accepted. Defaults to true.
   */
  allowDecimal?: boolean;
  /** Allow a leading minus sign. Defaults to false. */
  allowNegative?: boolean;
  /** Maximum number of fractional digits to keep. */
  maxFractionDigits?: number;
}

/**
 * A drop-in replacement for `<Input type="number" />` for money fields.
 *
 * Why we don't just keep `type="number"`:
 *  - On mobile keyboards set to Arabic (or Persian / Urdu), `type="number"`
 *    happily accepts ٠١٢٣٤٥٦٧٨٩, but the resulting string fails `parseFloat`
 *    on the server and silently becomes NaN. The user sees their balance
 *    refuse to update with no error.
 *  - Some Android browsers also dispatch `change` events with the raw
 *    Arabic string before any HTML5 numeric coercion can run.
 *
 * What this component does:
 *  - Forces `inputMode="decimal"` (numeric pad on mobile) plus `pattern`
 *    so the browser surfaces the native numeric keyboard.
 *  - Intercepts `onChange` and `onPaste`, runs `sanitizeMoneyInput` to
 *    transliterate Arabic-Indic / Persian digits to ASCII, drops every
 *    non-numeric character, and collapses multiple decimal points.
 *  - Forwards the sanitized value through the parent's `onChange` handler
 *    so callers (controlled state, react-hook-form `field`, etc.) receive
 *    a string they can safely `parseFloat`.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { allowDecimal = true, allowNegative = false, maxFractionDigits, onChange, onPaste, value, defaultValue, ...rest },
    ref,
  ) {
    const sanitizeOptions: SanitizeMoneyOptions = { allowDecimal, allowNegative, maxFractionDigits };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        pattern={allowDecimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
        autoComplete="off"
        value={value as React.ComponentProps<"input">["value"]}
        defaultValue={defaultValue as React.ComponentProps<"input">["defaultValue"]}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          const cleaned = sanitizeMoneyInput(raw, sanitizeOptions);
          if (cleaned !== raw) {
            // Sync the DOM so the cursor sits in a sensible position even
            // though we're feeding back a different string.
            event.currentTarget.value = cleaned;
          }
          // Re-dispatch with the sanitized value so callers see ASCII only.
          onChange?.({
            ...event,
            target: { ...event.target, value: cleaned } as EventTarget & HTMLInputElement,
            currentTarget: { ...event.currentTarget, value: cleaned } as EventTarget & HTMLInputElement,
          });
        }}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented) return;
          const text = event.clipboardData?.getData("text") ?? "";
          if (!text) return;
          const cleaned = sanitizeMoneyInput(text, sanitizeOptions);
          if (cleaned === text) return;
          // Replace the pasted text with the sanitized version manually so
          // the user never sees the Arabic-numeral form flash on screen.
          event.preventDefault();
          const target = event.currentTarget;
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? target.value.length;
          const before = target.value.slice(0, start);
          const after = target.value.slice(end);
          const next = sanitizeMoneyInput(before + cleaned + after, sanitizeOptions);
          target.value = next;
          // Notify React.
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }}
        {...rest}
      />
    );
  },
);
