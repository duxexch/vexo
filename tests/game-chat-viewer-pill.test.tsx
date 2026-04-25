import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatViewerCountPill } from "../client/src/components/games/GameChat";

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

describe("ChatViewerCountPill — Task #75 UI contract", () => {
  it("shows the count + inline avatars and a +N overflow chip when spectators exceed the visible cap", () => {
    render(
      <ChatViewerCountPill
        spectatorCount={5}
        spectatorViewers={[
          { userId: "u1", username: "alice", avatarUrl: null },
          { userId: "u2", username: "bob", avatarUrl: null },
          { userId: "u3", username: "carol", avatarUrl: null },
          { userId: "u4", username: "dan", avatarUrl: null },
        ]}
        language="en"
      />,
    );

    const pill = screen.getByTestId("game-chat-viewer-count");
    expect(pill).not.toBeNull();
    expect(pill.textContent ?? "").toContain("5");

    expect(screen.getByTestId("game-chat-viewer-stack")).not.toBeNull();
    expect(screen.getByTestId("game-chat-viewer-avatar-u1")).not.toBeNull();
    expect(screen.getByTestId("game-chat-viewer-avatar-u2")).not.toBeNull();
    expect(screen.getByTestId("game-chat-viewer-avatar-u3")).not.toBeNull();
    // 4th viewer + the missing 5th roll into the overflow chip.
    expect(screen.queryByTestId("game-chat-viewer-avatar-u4")).toBeNull();

    const overflow = screen.getByTestId("game-chat-viewer-stack-overflow");
    expect(overflow.textContent).toBe("+2");
  });

  it("opens the popover on click and renders profile-linked rows for every visible viewer", () => {
    render(
      <ChatViewerCountPill
        spectatorCount={2}
        spectatorViewers={[
          { userId: "u1", username: "alice", avatarUrl: null },
          { userId: "u2", username: "bob", avatarUrl: null },
        ]}
        language="en"
      />,
    );

    fireEvent.click(screen.getByTestId("game-chat-viewer-count"));

    expect(screen.getByTestId("game-chat-viewer-popover")).not.toBeNull();

    const aliceRow = screen.getByTestId("game-chat-viewer-row-u1");
    const bobRow = screen.getByTestId("game-chat-viewer-row-u2");
    expect(aliceRow.getAttribute("href")).toBe("/player/alice");
    expect(bobRow.getAttribute("href")).toBe("/player/bob");
  });

  it("hides the avatar stack when the visible viewer list is empty but still shows the count", () => {
    render(
      <ChatViewerCountPill
        spectatorCount={3}
        spectatorViewers={[]}
        language="en"
      />,
    );

    const pill = screen.getByTestId("game-chat-viewer-count");
    expect(pill.textContent ?? "").toContain("3");
    expect(screen.queryByTestId("game-chat-viewer-stack")).toBeNull();
    expect(screen.queryByTestId("game-chat-viewer-stack-overflow")).toBeNull();
  });

  it("renders Arabic copy when the language prop is 'ar'", () => {
    render(
      <ChatViewerCountPill
        spectatorCount={4}
        spectatorViewers={[
          { userId: "u1", username: "alice", avatarUrl: null },
        ]}
        language="ar"
      />,
    );

    const pill = screen.getByTestId("game-chat-viewer-count");
    expect(pill.textContent ?? "").toContain("يشاهد");
    expect(pill.textContent ?? "").toContain("4");
  });
});
