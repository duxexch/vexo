import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TournamentRegistrationStateBadge } from "../client/src/pages/tournaments";

/**
 * Component-level coverage for the inline registration-state badge that
 * the tournament list (and detail page) renders next to each card's
 * status pill. Task #141 introduced this so that "opens-soon", "full",
 * and "closed" tournaments tell the player WHY they can't register
 * instead of silently hiding the CTA.
 *
 * The four cases (open / opens-soon / closed / full) are the same four
 * states the server gates registration on, so this test is the user-
 * visible parity check that the unit tests for
 * `getTournamentRegistrationState` cannot give us on their own.
 */
describe("TournamentRegistrationStateBadge — list/detail card UI per state", () => {
  const futureOpensAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it("renders no badge when registration is open (the open state stays calm)", () => {
    const { container } = render(
      <TournamentRegistrationStateBadge
        state="open"
        opensAt={null}
        en={true}
        testIdPrefix="t-open"
      />,
    );
    // The badge component returns null for the 'open' state — no badge
    // should be in the DOM at all so the existing card layout doesn't
    // shift for tournaments that are currently registerable.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("t-open-state-opens-soon")).toBeNull();
    expect(screen.queryByTestId("t-open-state-full")).toBeNull();
    expect(screen.queryByTestId("t-open-state-closed")).toBeNull();
  });

  it("renders an 'Opens in …' badge in English for the opens-soon state", () => {
    render(
      <TournamentRegistrationStateBadge
        state="opens-soon"
        opensAt={futureOpensAt}
        en={true}
        testIdPrefix="t-soon-en"
      />,
    );
    const badge = screen.getByTestId("t-soon-en-state-opens-soon");
    expect(badge.getAttribute("data-registration-state")).toBe("opens-soon");
    // The countdown formatter returns something like "1h 0m" / "59m";
    // we only assert the prefix so the test stays robust against the
    // exact countdown string the helper produces at runtime.
    expect(badge.textContent ?? "").toMatch(/^Opens (in |soon)/);
  });

  it("renders the Arabic 'يفتح خلال …' badge for the opens-soon state", () => {
    render(
      <TournamentRegistrationStateBadge
        state="opens-soon"
        opensAt={futureOpensAt}
        en={false}
        testIdPrefix="t-soon-ar"
      />,
    );
    const badge = screen.getByTestId("t-soon-ar-state-opens-soon");
    expect(badge.textContent ?? "").toMatch(/يفتح/);
  });

  it("renders the 'Full' badge in English when the roster is full", () => {
    render(
      <TournamentRegistrationStateBadge
        state="full"
        opensAt={null}
        en={true}
        testIdPrefix="t-full-en"
      />,
    );
    const badge = screen.getByTestId("t-full-en-state-full");
    expect(badge.textContent ?? "").toContain("Full");
    expect(badge.getAttribute("data-registration-state")).toBe("full");
  });

  it("renders the Arabic 'مكتمل' badge for the full state", () => {
    render(
      <TournamentRegistrationStateBadge
        state="full"
        opensAt={null}
        en={false}
        testIdPrefix="t-full-ar"
      />,
    );
    const badge = screen.getByTestId("t-full-ar-state-full");
    expect(badge.textContent ?? "").toContain("مكتمل");
  });

  it("renders the 'Closed' badge in English for the closed state", () => {
    render(
      <TournamentRegistrationStateBadge
        state="closed"
        opensAt={null}
        en={true}
        testIdPrefix="t-closed-en"
      />,
    );
    const badge = screen.getByTestId("t-closed-en-state-closed");
    expect(badge.textContent ?? "").toContain("Closed");
    expect(badge.getAttribute("data-registration-state")).toBe("closed");
  });

  it("renders the Arabic 'مغلق' badge for the closed state", () => {
    render(
      <TournamentRegistrationStateBadge
        state="closed"
        opensAt={null}
        en={false}
        testIdPrefix="t-closed-ar"
      />,
    );
    const badge = screen.getByTestId("t-closed-ar-state-closed");
    expect(badge.textContent ?? "").toContain("مغلق");
  });
});
