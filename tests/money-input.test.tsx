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

  it("forwards ASCII when the DOM event carries Arabic-Indic digits", () => {
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    fireEvent.change(screen.getByTestId("money-input"), { target: { value: "١٢٣" } });
    expect(onValue).toHaveBeenLastCalledWith("123");
  });

  it("forwards ASCII for Persian digits", () => {
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    fireEvent.change(screen.getByTestId("money-input"), { target: { value: "۲۵۰" } });
    expect(onValue).toHaveBeenLastCalledWith("250");
  });

  it("normalizes the Arabic decimal (U+066B) and drops the thousands separator (U+066C)", () => {
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    fireEvent.change(screen.getByTestId("money-input"), { target: { value: "١٬٢٣٤٫٥٠" } });
    expect(onValue).toHaveBeenLastCalledWith("1234.50");
  });

  it("rewrites the DOM input value so the user immediately sees ASCII", () => {
    render(<ControlledHarness onValue={() => {}} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "٤٢" } });
    expect(input.value).toBe("42");
  });

  it("yields ASCII end-to-end under userEvent.type of Arabic digits", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledHarness onValue={onValue} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;

    await user.type(input, "٧٥");

    expect(input.value).toBe("75");
    expect(onValue).toHaveBeenLastCalledWith("75");
  });

  it("rewrites pasted Arabic strings to ASCII", () => {
    render(<ControlledHarness onValue={() => {}} />);
    const input = screen.getByTestId("money-input") as HTMLInputElement;
    input.focus();

    fireEvent.paste(input, {
      clipboardData: { getData: (type: string) => (type === "text" ? "حوالة ١٬٢٣٤٫٥٠ ريال" : "") },
    });

    expect(input.value).toBe("1234.50");
  });

  it("works under react-hook-form's `{...field}` shape", () => {
    const onChange = vi.fn();
    const fieldLike = { name: "amount", value: "", onChange, onBlur: () => {} };
    render(<MoneyInput data-testid="money-input" {...fieldLike} />);

    fireEvent.change(screen.getByTestId("money-input"), { target: { value: "٩٩٫٩٩" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("99.99");
  });
});
