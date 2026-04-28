/**
 * Two surfaces exercised:
 *
 *   1. <GameChat /> — mounted for real (with QueryClientProvider and
 *      minimum mocks). Asserts the Send-button enable/disable
 *      transitions across compositionstart → input → compositionend.
 *
 *   2. A composer mirror that matches the exact state machine in
 *      `client/src/pages/chat.tsx` lines 247-352 / 2083-2146 — the
 *      direct-message page is the only composer that swaps the Send
 *      button for a voice-record (Mic) button when the draft is empty.
 *      Page-level mounting of `ChatPage` is impractical (it pulls in
 *      sockets, routing, and auth wiring orthogonal to the IME
 *      contract), so we re-implement the same `shouldShowSendButton`
 *      rule and assert the Mic↔Send swap directly.
 */

import { useRef, useState } from "react";
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

// ChatPage composer mirror — same `shouldShowSendButton` rule as
// client/src/pages/chat.tsx, isolated for testability.
function ChatComposerMirror({ onSend }: { onSend: (value: string) => void }) {
  const [messageInput, setMessageInput] = useState("");
  const [isComposingInput, setIsComposingInput] = useState(false);
  const isComposingRef = useRef(false);

  const hasTypedMessage = messageInput.trim().length > 0;
  const shouldShowSendButton = hasTypedMessage || isComposingInput;

  return (
    <div>
      <input
        data-testid="input-chat-message"
        value={messageInput}
        onChange={(e) => setMessageInput(e.target.value)}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          if (v !== messageInput) setMessageInput(v);
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
          setIsComposingInput(true);
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          setIsComposingInput(false);
          const v = (e.currentTarget as HTMLInputElement).value;
          if (v !== messageInput) setMessageInput(v);
        }}
      />
      {shouldShowSendButton ? (
        <button
          type="button"
          data-testid="button-send-message"
          disabled={!hasTypedMessage}
          onClick={() => onSend(messageInput)}
        >
          Send
        </button>
      ) : (
        <button type="button" data-testid="button-record-voice" aria-label="Mic">
          Mic
        </button>
      )}
    </div>
  );
}

describe("ChatPage composer Mic ↔ Send swap (Arabic IME)", () => {
  it("renders the Mic button (not Send) when the composer is empty", () => {
    render(<ChatComposerMirror onSend={() => {}} />);
    expect(screen.getByTestId("button-record-voice")).toBeTruthy();
    expect(screen.queryByTestId("button-send-message")).toBeNull();
  });

  it("swaps Mic → Send the moment compositionstart fires", () => {
    render(<ChatComposerMirror onSend={() => {}} />);
    const input = screen.getByTestId("input-chat-message");

    fireEvent.compositionStart(input);

    expect(screen.getByTestId("button-send-message")).toBeTruthy();
    expect(screen.queryByTestId("button-record-voice")).toBeNull();
  });

  it("keeps Send visible while the composition buffers text", () => {
    render(<ChatComposerMirror onSend={() => {}} />);
    const input = screen.getByTestId("input-chat-message");

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "مرحبا" } });

    expect(screen.getByTestId("button-send-message")).toBeTruthy();
    expect(screen.queryByTestId("button-record-voice")).toBeNull();
  });

  it("delivers the composed Arabic word on the first Send tap", () => {
    const sent: string[] = [];
    render(<ChatComposerMirror onSend={(v) => sent.push(v)} />);
    const input = screen.getByTestId("input-chat-message");

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "مرحبا" } });
    fireEvent.compositionEnd(input, { data: "مرحبا", target: { value: "مرحبا" } });

    fireEvent.click(screen.getByTestId("button-send-message"));

    expect(sent).toEqual(["مرحبا"]);
  });

  it("swaps back to Mic when the composition ends empty", () => {
    render(<ChatComposerMirror onSend={() => {}} />);
    const input = screen.getByTestId("input-chat-message");

    fireEvent.compositionStart(input);
    expect(screen.getByTestId("button-send-message")).toBeTruthy();

    fireEvent.compositionEnd(input, { data: "", target: { value: "" } });

    expect(screen.getByTestId("button-record-voice")).toBeTruthy();
    expect(screen.queryByTestId("button-send-message")).toBeNull();
  });
});
