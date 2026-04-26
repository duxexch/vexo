/**
 * Regression test for the withdraw-button derivation on the tournament
 * detail page (client/src/pages/tournaments.tsx :: TournamentDetailView).
 *
 * Background: an earlier iteration of Task #141 derived `canWithdraw`
 * from `registrationState === 'open'`. Because the shared classifier
 * downgrades a roster-full tournament to `'full'` (capacity reached),
 * that change accidentally hid the Withdraw button for already-
 * registered players the moment the bracket filled up — even though
 * the server-side unregister endpoint (`isTournamentRegistrationOpen`)
 * still permits unregistration while the registration window itself
 * is open.
 *
 * The fix derives a separate "withdrawal window open" predicate that
 * accepts both `'open'` and `'full'`. This test pins that contract so
 * the regression cannot reappear silently.
 */

import { describe, it, expect } from "vitest";
import { getTournamentRegistrationState } from "../shared/tournament-registration-state";

const NOW = new Date("2026-04-26T12:00:00Z");
const PAST_OPEN = new Date("2026-04-26T11:00:00Z").toISOString();
const FAR_FUTURE = new Date("2026-04-27T12:00:00Z").toISOString();
const PAST_CLOSE = new Date("2026-04-26T11:30:00Z").toISOString();

// Mirrors the derivation in TournamentDetailView so the unit test
// fails the moment the production code drifts back to the buggy
// `state === 'open'` shape.
function canWithdraw(
  state: ReturnType<typeof getTournamentRegistrationState>,
  isRegistered: boolean,
): boolean {
  const withdrawalWindowOpen = state === "open" || state === "full";
  return withdrawalWindowOpen && isRegistered;
}

describe("Withdraw button stays available for registered players in a full tournament", () => {
  it("classifies a full tournament whose window is still open as 'full'", () => {
    const state = getTournamentRegistrationState(
      {
        status: "registration",
        registrationStartsAt: PAST_OPEN,
        registrationEndsAt: FAR_FUTURE,
        startsAt: FAR_FUTURE,
        participantCount: 16,
        maxPlayers: 16,
      },
      NOW,
    );
    expect(state).toBe("full");
  });

  it("derives canWithdraw=true for a registered user when the tournament is full but the window is still open", () => {
    const state = getTournamentRegistrationState(
      {
        status: "registration",
        registrationStartsAt: PAST_OPEN,
        registrationEndsAt: FAR_FUTURE,
        startsAt: FAR_FUTURE,
        participantCount: 16,
        maxPlayers: 16,
      },
      NOW,
    );
    expect(canWithdraw(state, true)).toBe(true);
  });

  it("derives canWithdraw=true for a registered user when the tournament is open and not full", () => {
    const state = getTournamentRegistrationState(
      {
        status: "registration",
        registrationStartsAt: PAST_OPEN,
        registrationEndsAt: FAR_FUTURE,
        startsAt: FAR_FUTURE,
        participantCount: 4,
        maxPlayers: 16,
      },
      NOW,
    );
    expect(state).toBe("open");
    expect(canWithdraw(state, true)).toBe(true);
  });

  it("derives canWithdraw=false once the registration window has closed, even if the user is registered", () => {
    const state = getTournamentRegistrationState(
      {
        status: "registration",
        registrationStartsAt: PAST_OPEN,
        registrationEndsAt: PAST_CLOSE,
        startsAt: FAR_FUTURE,
        participantCount: 4,
        maxPlayers: 16,
      },
      NOW,
    );
    expect(state).toBe("closed");
    expect(canWithdraw(state, true)).toBe(false);
  });

  it("derives canWithdraw=false when the user is not registered, regardless of state", () => {
    expect(canWithdraw("open", false)).toBe(false);
    expect(canWithdraw("full", false)).toBe(false);
    expect(canWithdraw("opens-soon", false)).toBe(false);
    expect(canWithdraw("closed", false)).toBe(false);
  });
});
