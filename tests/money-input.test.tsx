/**
 * Component test for <MoneyInput />.
 *
 * The DOM event carries whatever the user (or their IME) actually
 * typed — Arabic-Indic digits, Persian digits, an Arabic decimal
 * separator, etc. The contract we need to keep alive is:
 *
 *   Whatever lands in the DOM, the parent's `onChange` handler must
 *   receive an ASCII-only string it can safely `parseFloat`.
 *
 * If this regresses, every `Number(value)` in the wallet / P2P /
 * tournament / admin flows silently becomes `NaN`.
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MoneyInput } from "@/components/ui/money-input";

function ControlledHarness({ onValue }: { onValue: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <MoneyInput
      data-testid="money-input"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onValue(event.target.value);
      }}
    />
  );
}

describe("<MoneyInput />", () => {
  it("renders as a text input with a decimal numeric keyboard hint", () => {
    render(<MoneyInput data-testid="money-input" defaultValue="" onChange={() => {}} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("decimal");
  });

  it("uses inputMode='numeric' and rejects '.' when allowDecimal is false", () => {
    const onChange = vi.fn();
    render(<MoneyInput data-testid="money-input" allowDecimal={false} value="" onChange={onChange} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;
    expect(input.inputMode).toBe("numeric");

    fireEvent.change(input, { target: { value: "12.5" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("125");
  });

  it("forwards an ASCII-only string when the DOM event carries Arabic-Indic digits", () => {
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "١٢٣" } });

    expect(onValue).toHaveBeenLastCalledWith("123");
  });

  it("forwards ASCII for Persian digits", () => {
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "۲۵۰" } });

    expect(onValue).toHaveBeenLastCalledWith("250");
  });

  it("normalizes the Arabic decimal separator (U+066B) and drops the thousands separator (U+066C)", () => {
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "١٬٢٣٤٫٥٠" } });

    expect(onValue).toHaveBeenLastCalledWith("1234.50");
  });

  it("rewrites the DOM input value so the user immediately sees ASCII", () => {
    render(<ControlledHarness onValue={() => {}} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "٤٢" } });

    // After React commits, the controlled value is the ASCII form.
    expect(input.value).toBe("42");
  });

  it("survives `userEvent.type` of Arabic digits and yields ASCII end-to-end", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    await user.type(input, "٧٥");

    // Final committed value, regardless of intermediate keystrokes, is ASCII.
    expect(input.value).toBe("75");
    expect(onValue).toHaveBeenLastCalledWith("75");
  });

  it("rewrites pasted Arabic strings to ASCII without flashing the original", () => {
    render(<ControlledHarness onValue={() => {}} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;
    input.focus();

    const dataTransfer = {
      getData: (type: string) => (type === "text" ? "حوالة ١٬٢٣٤٫٥٠ ريال" : ""),
    };

    fireEvent.paste(input, { clipboardData: dataTransfer });

    expect(input.value).toBe("1234.50");
  });

  it("works as a controlled input under react-hook-form's `{...field}` shape", () => {
    const onChange = vi.fn();
    // Mimic the object react-hook-form's `field` spreads onto a child:
    // { name, value, onChange, onBlur, ref }.
    const fieldLike = {
      name: "amount",
      value: "",
      onChange,
      onBlur: () => {},
    };
    render(<MoneyInput data-testid="money-input" {...fieldLike} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "٩٩٫٩٩" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    // react-hook-form reads from `event.target.value` to update its store —
    // that value must already be ASCII.
    expect(onChange.mock.calls[0][0].target.value).toBe("99.99");
  });
});
