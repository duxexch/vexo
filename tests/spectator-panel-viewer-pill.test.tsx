import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpectatorPanel } from "../client/src/components/games/SpectatorPanel";

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../client/src/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en",
    dir: "ltr",
  }),
}));

vi.mock("../client/src/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../client/src/lib/queryClient", () => ({
  apiRequest: vi.fn(async () => ({})),
  queryClient: new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
}));

function renderPanel(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SpectatorPanel — Task #109 viewer pill plumbing", () => {
  it("renders the shared 'who's watching' pill (not the legacy badge) when realtime viewers are provided", () => {
    renderPanel(
      <SpectatorPanel
        challengeId="match-1"
        spectatorCount={3}
        spectatorViewers={[
          { userId: "u1", username: "alice", avatarUrl: null },
          { userId: "u2", username: "bob", avatarUrl: null },
        ]}
      />,
    );

    const pill = screen.getByTestId("game-chat-viewer-count");
    expect(pill).not.toBeNull();
    expect(pill.textContent ?? "").toContain("3");

    expect(screen.getByTestId("game-chat-viewer-stack")).not.toBeNull();
    expect(screen.getByTestId("game-chat-viewer-avatar-u1")).not.toBeNull();
    expect(screen.getByTestId("game-chat-viewer-avatar-u2")).not.toBeNull();

    // Authoritative spectatorCount (3) - visible viewers (2) = +1 overflow.
    const overflow = screen.getByTestId("game-chat-viewer-stack-overflow");
    expect(overflow.textContent).toBe("+1");
  });

  it("falls back to the legacy plain count badge when no viewer identities are supplied", () => {
    renderPanel(
      <SpectatorPanel
        challengeId="match-1"
        spectatorCount={2}
      />,
    );

    expect(screen.queryByTestId("game-chat-viewer-count")).toBeNull();
    expect(screen.queryByTestId("game-chat-viewer-stack")).toBeNull();
  });

  it("renders the shared pill with count-only (no avatars) when realtime is wired but the viewer list is empty (e.g. all blocked) — parity with challenge GameChat", () => {
    renderPanel(
      <SpectatorPanel
        challengeId="match-1"
        spectatorCount={4}
        spectatorViewers={[]}
      />,
    );

    // Parity contract: realtime caller wired (prop is supplied, even
    // if empty) → still show the pill so the count surface and popover
    // affordance match challenge in-game chat. Visible avatars are
    // simply absent because the privacy filter hid every viewer.
    const pill = screen.getByTestId("game-chat-viewer-count");
    expect(pill).not.toBeNull();
    expect(pill.textContent ?? "").toContain("4");
    expect(screen.queryByTestId("game-chat-viewer-stack")).toBeNull();
  });

  it("renders neither pill nor avatar stack when there are zero spectators (even if realtime is wired) — locks the count=0 boundary", () => {
    renderPanel(
      <SpectatorPanel
        challengeId="match-1"
        spectatorCount={0}
        spectatorViewers={[]}
      />,
    );

    // At zero count there is nothing to surface — the header still
    // shows the legacy badge with "0" rather than rendering an empty
    // pill, matching the challenge in-game chat dialog (which only
    // mounts the pill when spectatorCount > 0). This protects against
    // future regressions that would render a misleading empty pill on
    // matches with no spectators.
    expect(screen.queryByTestId("game-chat-viewer-count")).toBeNull();
    expect(screen.queryByTestId("game-chat-viewer-stack")).toBeNull();
  });
});
