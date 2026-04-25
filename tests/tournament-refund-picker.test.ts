import { describe, it, expect } from "vitest";
import { __pickLatestRefundPerTournamentForTest } from "../server/routes/tournaments/listing";

describe("loadUserRefundsByTournament — latest-wins dedup", () => {
  const tournamentId = "abc-123";
  const userId = "user-1";

  it("returns the row with the most recent createdAt when duplicates exist", () => {
    const older = new Date("2026-04-01T10:00:00Z");
    const newer = new Date("2026-04-20T15:30:00Z");

    const map = __pickLatestRefundPerTournamentForTest([
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "10.00",
        currency: "usd",
        createdAt: older,
      },
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "12.50",
        currency: "usd",
        createdAt: newer,
      },
    ]);

    const picked = map.get(tournamentId);
    expect(picked).toBeDefined();
    expect(picked?.amount).toBe("12.50");
    expect(picked?.reason).toBe("deleted");
  });

  it("prefers the newer row even when input order is reversed", () => {
    const older = new Date("2026-04-01T10:00:00Z");
    const newer = new Date("2026-04-20T15:30:00Z");

    const map = __pickLatestRefundPerTournamentForTest([
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "12.50",
        currency: "usd",
        createdAt: newer,
      },
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "10.00",
        currency: "usd",
        createdAt: older,
      },
    ]);

    expect(map.get(tournamentId)?.amount).toBe("12.50");
    expect(map.get(tournamentId)?.reason).toBe("deleted");
  });

  it("prefers cancel-refund when it is the most recent record", () => {
    const older = new Date("2026-04-01T10:00:00Z");
    const newer = new Date("2026-04-20T15:30:00Z");

    const map = __pickLatestRefundPerTournamentForTest([
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "5.00",
        currency: "usd",
        createdAt: older,
      },
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "15.00",
        currency: "usd",
        createdAt: newer,
      },
    ]);

    expect(map.get(tournamentId)?.amount).toBe("15.00");
    expect(map.get(tournamentId)?.reason).toBe("cancelled");
  });

  it("resolves cross-currency duplicates by createdAt as well", () => {
    const older = new Date("2026-04-01T10:00:00Z");
    const newer = new Date("2026-04-20T15:30:00Z");

    const map = __pickLatestRefundPerTournamentForTest([
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "100.00",
        currency: "project",
        createdAt: newer,
      },
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "8.00",
        currency: "usd",
        createdAt: older,
      },
    ]);

    const picked = map.get(tournamentId);
    expect(picked?.currency).toBe("project");
    expect(picked?.amount).toBe("100.00");
    expect(picked?.reason).toBe("cancelled");
  });

  it("keeps independent tournaments separate", () => {
    const t1 = "tournament-aaa";
    const t2 = "tournament-bbb";
    const date = new Date("2026-04-15T00:00:00Z");

    const map = __pickLatestRefundPerTournamentForTest([
      {
        referenceId: `tournament-cancel-refund:${t1}:${userId}`,
        amount: "5.00",
        currency: "usd",
        createdAt: date,
      },
      {
        referenceId: `tournament-delete-refund:${t2}:${userId}`,
        amount: "9.00",
        currency: "project",
        createdAt: date,
      },
    ]);

    expect(map.get(t1)?.amount).toBe("5.00");
    expect(map.get(t1)?.reason).toBe("cancelled");
    expect(map.get(t2)?.amount).toBe("9.00");
    expect(map.get(t2)?.reason).toBe("deleted");
  });

  it("ignores rows with malformed or missing reference ids", () => {
    const date = new Date("2026-04-15T00:00:00Z");
    const map = __pickLatestRefundPerTournamentForTest([
      { referenceId: null, amount: "1", currency: "usd", createdAt: date },
      { referenceId: "garbage-no-prefix", amount: "1", currency: "usd", createdAt: date },
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "7.00",
        currency: "usd",
        createdAt: date,
      },
    ]);

    expect(map.size).toBe(1);
    expect(map.get(tournamentId)?.amount).toBe("7.00");
  });
});
