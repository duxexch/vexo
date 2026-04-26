import { describe, it, expect } from "vitest";
import { normalizeTournamentPayload } from "../server/lib/tournament-utils";

const NOW = new Date(Date.UTC(2026, 3, 26, 12, 0, 0));

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Spring Cup",
    nameAr: "كأس الربيع",
    gameType: "chess",
    format: "single_elimination",
    maxPlayers: 16,
    minPlayers: 4,
    entryFee: "0",
    prizePool: "0",
    prizeDistributionMethod: "top_3",
    isPublished: true,
    ...overrides,
  };
}

describe("normalizeTournamentPayload — registration window defaults", () => {
  it("defaults registrationStartsAt to 'now' when omitted", () => {
    const result = normalizeTournamentPayload(basePayload(), NOW);
    expect(result.registrationStartsAt).toEqual(NOW);
  });

  it("defaults registrationEndsAt to startsAt when omitted but startsAt is provided", () => {
    const startsAt = new Date(Date.UTC(2026, 3, 28, 12, 0, 0)).toISOString();
    const result = normalizeTournamentPayload(basePayload({ startsAt }), NOW);
    expect(result.registrationEndsAt?.toISOString()).toEqual(startsAt);
  });

  it("leaves registrationEndsAt null when neither it nor startsAt are provided", () => {
    const result = normalizeTournamentPayload(basePayload(), NOW);
    expect(result.registrationEndsAt).toBeNull();
  });

  it("respects an explicit registrationStartsAt instead of defaulting", () => {
    const explicit = new Date(Date.UTC(2026, 3, 27, 9, 0, 0)).toISOString();
    const result = normalizeTournamentPayload(
      basePayload({
        registrationStartsAt: explicit,
        startsAt: new Date(Date.UTC(2026, 3, 28, 12, 0, 0)).toISOString(),
      }),
      NOW,
    );
    expect(result.registrationStartsAt?.toISOString()).toEqual(explicit);
  });

  it("respects an explicit registrationEndsAt instead of defaulting to startsAt", () => {
    const explicit = new Date(Date.UTC(2026, 3, 27, 23, 0, 0)).toISOString();
    const startsAt = new Date(Date.UTC(2026, 3, 28, 12, 0, 0)).toISOString();
    const result = normalizeTournamentPayload(
      basePayload({ registrationEndsAt: explicit, startsAt }),
      NOW,
    );
    expect(result.registrationEndsAt?.toISOString()).toEqual(explicit);
  });

  it("does not throw 'Registration cannot open after the tournament starts' when only the default fires and startsAt is in the past", () => {
    const startsAt = new Date(Date.UTC(2026, 3, 25, 12, 0, 0)).toISOString();
    expect(() => normalizeTournamentPayload(basePayload({ startsAt }), NOW)).not.toThrow();
  });

  it("still rejects an explicit registrationStartsAt that is after startsAt", () => {
    const startsAt = new Date(Date.UTC(2026, 3, 28, 12, 0, 0)).toISOString();
    const tooLate = new Date(Date.UTC(2026, 3, 28, 13, 0, 0)).toISOString();
    expect(() =>
      normalizeTournamentPayload(
        basePayload({ registrationStartsAt: tooLate, startsAt }),
        NOW,
      ),
    ).toThrow(/registration cannot open after the tournament starts/i);
  });

  it("still rejects an explicit registrationEndsAt that is after startsAt", () => {
    const startsAt = new Date(Date.UTC(2026, 3, 28, 12, 0, 0)).toISOString();
    const tooLate = new Date(Date.UTC(2026, 3, 28, 14, 0, 0)).toISOString();
    expect(() =>
      normalizeTournamentPayload(
        basePayload({ registrationEndsAt: tooLate, startsAt }),
        NOW,
      ),
    ).toThrow(/registration must close before the tournament starts/i);
  });
});
