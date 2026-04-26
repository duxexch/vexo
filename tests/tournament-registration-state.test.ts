import { describe, it, expect } from "vitest";
import {
  getTournamentRegistrationState,
  type TournamentRegistrationStateInput,
} from "../shared/tournament-registration-state";

const NOW = Date.UTC(2026, 3, 26, 12, 0, 0); // 2026-04-26T12:00:00Z

function build(overrides: Partial<TournamentRegistrationStateInput>): TournamentRegistrationStateInput {
  return {
    status: "registration",
    registrationStartsAt: null,
    registrationEndsAt: null,
    startsAt: null,
    participantCount: 0,
    maxPlayers: 16,
    ...overrides,
  };
}

describe("getTournamentRegistrationState", () => {
  it("returns 'open' when status is 'registration' with no window restrictions", () => {
    expect(getTournamentRegistrationState(build({}), NOW)).toBe("open");
  });

  it("returns 'open' when status is 'upcoming' and the window has started", () => {
    expect(
      getTournamentRegistrationState(
        build({
          status: "upcoming",
          registrationStartsAt: new Date(NOW - 60_000).toISOString(),
          startsAt: new Date(NOW + 3_600_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe("open");
  });

  it("returns 'opens-soon' when registrationStartsAt is in the future", () => {
    expect(
      getTournamentRegistrationState(
        build({
          registrationStartsAt: new Date(NOW + 3_600_000).toISOString(),
          startsAt: new Date(NOW + 7_200_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe("opens-soon");
  });

  it("returns 'closed' once the registration window has elapsed", () => {
    expect(
      getTournamentRegistrationState(
        build({
          registrationStartsAt: new Date(NOW - 7_200_000).toISOString(),
          registrationEndsAt: new Date(NOW - 60_000).toISOString(),
          startsAt: new Date(NOW + 3_600_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe("closed");
  });

  it("returns 'closed' once the tournament itself has started, regardless of window", () => {
    expect(
      getTournamentRegistrationState(
        build({
          startsAt: new Date(NOW - 60_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe("closed");
  });

  it("returns 'closed' for in_progress / completed / cancelled tournaments", () => {
    for (const status of ["in_progress", "completed", "cancelled"]) {
      expect(getTournamentRegistrationState(build({ status }), NOW)).toBe("closed");
    }
  });

  it("returns 'closed' for any unrecognized / future status to keep parity with the server gate", () => {
    for (const status of ["", "draft", "archived", "paused", "weird-future-status"]) {
      expect(
        getTournamentRegistrationState(build({ status }), NOW),
      ).toBe("closed");
    }
  });

  it("returns 'full' when participantCount has reached maxPlayers and the window is otherwise open", () => {
    expect(
      getTournamentRegistrationState(
        build({
          participantCount: 16,
          maxPlayers: 16,
        }),
        NOW,
      ),
    ).toBe("full");
  });

  it("prioritizes 'closed' over 'full' when the window has elapsed", () => {
    expect(
      getTournamentRegistrationState(
        build({
          participantCount: 16,
          maxPlayers: 16,
          registrationStartsAt: new Date(NOW - 7_200_000).toISOString(),
          registrationEndsAt: new Date(NOW - 60_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe("closed");
  });

  it("prioritizes 'opens-soon' over 'full' so admins see why the tournament is not open yet", () => {
    expect(
      getTournamentRegistrationState(
        build({
          participantCount: 16,
          maxPlayers: 16,
          registrationStartsAt: new Date(NOW + 3_600_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe("opens-soon");
  });

  it("treats Date instances and ISO strings interchangeably", () => {
    expect(
      getTournamentRegistrationState(
        build({
          registrationStartsAt: new Date(NOW - 1_000),
          startsAt: new Date(NOW + 60_000),
        }),
        NOW,
      ),
    ).toBe("open");
  });

  it("ignores empty-string timestamps without throwing", () => {
    expect(
      getTournamentRegistrationState(
        build({
          registrationStartsAt: "" as unknown as string,
          registrationEndsAt: "" as unknown as string,
          startsAt: "" as unknown as string,
        }),
        NOW,
      ),
    ).toBe("open");
  });
});
