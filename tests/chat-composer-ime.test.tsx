/**
 * Composer IME regression test.
 *
 * On Android, the Arabic Gboard keeps every keystroke inside an open
 * IME composition until the user taps the spacebar / picks a candidate.
 * While that composition is active, React's controlled `onChange` does
 * not fire — the input element holds the buffered text via
 * `compositionupdate` events but `value` (the React-tracked value) stays
 * stale.
 *
 * The bug it caused: every chat composer disabled the Send button
 * (showing the Mic / record button instead) because the controlled
 * state was still "empty" even though the user was clearly typing
 * Arabic.
 *
 * The fix the production code applies, and that this test pins down:
 *
 *   1. Track an `isComposingInput` boolean that flips on
 *      `compositionstart` and back on `compositionend`.
 *   2. Mirror the DOM value into state on `onInput` (in case the
 *      browser fires `input` before `change` during composition).
 *   3. Treat the Send button as enabled when EITHER the controlled
 *      string is non-empty OR a composition is in progress.
 *   4. Flush the final composed value on `compositionend` so the
 *      first tap of Send picks it up.
 *
 * We exercise that contract here against a minimal harness — a full
 * GameChat / ChatPage mount drags in queries, sockets, and i18n that
 * are orthogonal to the IME plumbing. The harness mirrors the exact
 * pattern used in client/src/pages/chat.tsx, GameChat.tsx,
 * SpectatorPanel.tsx, and support-chat-widget.tsx.
 */

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

function ComposerHarness({ onSend }: { onSend: (value: string) => void }) {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const hasDraft = value.trim().length > 0;
  const showSend = hasDraft || isComposing;

  return (
    <div>
      <input
        data-testid="composer-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onInput={(event) => {
          const next = (event.currentTarget as HTMLInputElement).value;
          if (next !== value) setValue(next);
        }}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={(event) => {
          setIsComposing(false);
          const next = (event.currentTarget as HTMLInputElement).value;
          if (next !== value) setValue(next);
        }}
      />
      {showSend ? (
        <button
          type="button"
          data-testid="button-send"
          disabled={!hasDraft && !isComposing}
          onClick={() => onSend(value)}
        >
          Send
        </button>
      ) : (
        <button type="button" data-testid="button-mic">
          Mic
        </button>
      )}
    </div>
  );
}

describe("chat composer + Arabic IME composition", () => {
  it("starts with the mic button when the composer is empty", () => {
    render(<ComposerHarness onSend={() => {}} />);
    expect(screen.getByTestId("button-mic")).toBeTruthy();
    expect(screen.queryByTestId("button-send")).toBeNull();
  });

  it("switches to the Send button as soon as a composition starts, before any commit", () => {
    render(<ComposerHarness onSend={() => {}} />);
    const input = screen.getByTestId("composer-input") as HTMLInputElement;

    // Simulate Gboard opening a composition for an Arabic word — the
    // browser dispatches compositionstart but `value` is still "".
    fireEvent.compositionStart(input);

    // The Send button must already be visible / enabled, even though
    // no `change` event has fired and the controlled value is empty.
    const send = screen.getByTestId("button-send") as HTMLButtonElement;
    expect(send).toBeTruthy();
    expect(send.disabled).toBe(false);
    expect(screen.queryByTestId("button-mic")).toBeNull();
  });

  it("syncs DOM-only `input` events into state while the composition is open", () => {
    render(<ComposerHarness onSend={() => {}} />);
    const input = screen.getByTestId("composer-input") as HTMLInputElement;

    fireEvent.compositionStart(input);
    // The IME has buffered an Arabic word in the DOM but not committed.
    fireEvent.input(input, { target: { value: "مرحبا" } });

    expect(input.value).toBe("مرحبا");
    expect((screen.getByTestId("button-send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("flushes the composed value on compositionend so the first Send tap picks it up", () => {
    const sent: string[] = [];
    render(<ComposerHarness onSend={(v) => sent.push(v)} />);
    const input = screen.getByTestId("composer-input") as HTMLInputElement;

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "مرحبا" } });
    fireEvent.compositionEnd(input, { data: "مرحبا", target: { value: "مرحبا" } });

    fireEvent.click(screen.getByTestId("button-send"));

    expect(sent).toEqual(["مرحبا"]);
  });

  it("falls back to the mic button when the composition ends with no text", () => {
    render(<ComposerHarness onSend={() => {}} />);
    const input = screen.getByTestId("composer-input") as HTMLInputElement;

    fireEvent.compositionStart(input);
    expect(screen.getByTestId("button-send")).toBeTruthy();

    // User cancels the IME suggestion without committing anything.
    fireEvent.compositionEnd(input, { data: "", target: { value: "" } });

    expect(screen.getByTestId("button-mic")).toBeTruthy();
    expect(screen.queryByTestId("button-send")).toBeNull();
  });
});
