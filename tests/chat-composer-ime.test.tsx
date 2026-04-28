/**
 * Mounts <GameChat /> and drives composition events directly against
 * its composer to lock in the Arabic-IME Send-button toggle:
 * compositionstart enables Send before any onChange fires; input
 * during composition keeps the value in sync; compositionend flushes
 * the buffered text so the first Send tap delivers it; an empty
 * cancel re-disables Send.
 */

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

const getInput = () => screen.getByTestId("input-game-chat") as HTMLInputElement;
const getSend = () => screen.getByTestId("button-send-game-chat") as HTMLButtonElement;

describe("<GameChat /> composer + Arabic IME composition", () => {
  it("disables Send when the composer is empty", () => {
    renderGameChat();
    expect(getSend().disabled).toBe(true);
  });

  it("enables Send the moment a composition starts (no committed value yet)", () => {
    renderGameChat();
    fireEvent.compositionStart(getInput());
    expect(getSend().disabled).toBe(false);
  });

  it("mirrors the buffered DOM value into state during composition", () => {
    renderGameChat();
    const input = getInput();
    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "مرحبا" } });
    expect(input.value).toBe("مرحبا");
    expect(getSend().disabled).toBe(false);
  });

  it("flushes the composed value on compositionend so Send delivers it", () => {
    const sent: string[] = [];
    renderGameChat((message) => sent.push(message));
    const input = getInput();
    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "مرحبا" } });
    fireEvent.compositionEnd(input, { data: "مرحبا", target: { value: "مرحبا" } });
    fireEvent.click(getSend());
    expect(sent).toEqual(["مرحبا"]);
  });

  it("re-disables Send when composition ends with no text", () => {
    renderGameChat();
    const input = getInput();
    fireEvent.compositionStart(input);
    expect(getSend().disabled).toBe(false);
    fireEvent.compositionEnd(input, { data: "", target: { value: "" } });
    expect(getSend().disabled).toBe(true);
  });
});
