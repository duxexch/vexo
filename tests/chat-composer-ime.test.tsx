/**
 * Composer IME regression test (Task #237).
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
 * We exercise that contract directly against the real <GameChat />
 * component so a regression in the production composer wiring (state
 * variable rename, lost onInput handler, lost compositionEnd flush,
 * Send button disable rule changes) fails the test — not just a
 * regression in some local replica of the logic.
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "ar" as const,
    dir: "rtl" as const,
    setLanguage: () => {},
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => {}, dismiss: () => {}, toasts: [] }),
  toast: () => {},
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", username: "tester" },
    refreshUser: () => {},
    token: null,
  }),
}));

vi.mock("@/hooks/use-keyboard-inset", () => ({
  useKeyboardInset: () => {},
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/", () => {}],
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { GameChat } from "@/components/games/GameChat";

function renderGameChat(onSendMessage: (message: string) => void = () => {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GameChat
        messages={[]}
        onSendMessage={onSendMessage}
        quickMessages={[]}
        language="ar"
        currentUserId="user-1"
      />
    </QueryClientProvider>,
  );
}

function getComposerInput(): HTMLInputElement {
  return screen.getByTestId("input-game-chat") as HTMLInputElement;
}

function getSendButton(): HTMLButtonElement {
  return screen.getByTestId("button-send-game-chat") as HTMLButtonElement;
}

describe("<GameChat /> composer + Arabic IME composition", () => {
  it("starts with the Send button disabled when the composer is empty", () => {
    renderGameChat();
    expect(getSendButton().disabled).toBe(true);
  });

  it("enables the Send button as soon as a composition starts, before any commit", () => {
    renderGameChat();
    const input = getComposerInput();

    // Simulate Gboard opening a composition for an Arabic word — the
    // browser dispatches compositionstart but the controlled value is
    // still "" because no `change` event has fired yet.
    fireEvent.compositionStart(input);

    // The Send button must already be enabled. If a regression
    // forgets the `isComposingInput` branch in the disabled rule,
    // this assertion fails.
    expect(getSendButton().disabled).toBe(false);
  });

  it("syncs DOM-only `input` events into state while the composition is open", () => {
    renderGameChat();
    const input = getComposerInput();

    fireEvent.compositionStart(input);
    // The IME has buffered an Arabic word in the DOM but not committed.
    fireEvent.input(input, { target: { value: "مرحبا" } });

    // The onInput handler in production code mirrors the DOM value
    // back into React state; the input must reflect the buffered word
    // and Send must remain enabled.
    expect(input.value).toBe("مرحبا");
    expect(getSendButton().disabled).toBe(false);
  });

  it("flushes the composed value on compositionend so the first Send tap delivers it", () => {
    const sent: string[] = [];
    renderGameChat((message) => sent.push(message));
    const input = getComposerInput();

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "مرحبا" } });
    fireEvent.compositionEnd(input, { data: "مرحبا", target: { value: "مرحبا" } });

    fireEvent.click(getSendButton());

    expect(sent).toEqual(["مرحبا"]);
  });

  it("re-disables Send when the composition ends with no committed text", () => {
    renderGameChat();
    const input = getComposerInput();

    fireEvent.compositionStart(input);
    expect(getSendButton().disabled).toBe(false);

    // User cancels the IME suggestion without committing anything.
    fireEvent.compositionEnd(input, { data: "", target: { value: "" } });

    expect(getSendButton().disabled).toBe(true);
  });
});
