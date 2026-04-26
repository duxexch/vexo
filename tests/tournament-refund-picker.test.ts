import { describe, it, expect } from "vitest";
import { __pickRefundsPerTournamentForTest } from "../server/routes/tournaments/listing";

describe("loadUserRefundsByTournament — per-(tournament,reason) picker", () => {
  const tournamentId = "abc-123";
  const userId = "user-1";

  it("keeps only the latest row when duplicates of the SAME reason exist", () => {
    const older = new Date("2026-04-01T10:00:00Z");
    const newer = new Date("2026-04-20T15:30:00Z");

    const map = __pickRefundsPerTournamentForTest([
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "10.00",
        currency: "usd",
        createdAt: older,
      },
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "12.50",
        currency: "usd",
        createdAt: newer,
      },
    ]);

    const list = map.get(tournamentId);
    expect(list).toBeDefined();
    expect(list).toHaveLength(1);
    expect(list?.[0].amount).toBe("12.50");
    expect(list?.[0].reason).toBe("cancelled");
  });

  it("returns BOTH a cancel-refund and a delete-refund when both exist (chronological)", () => {
    const cancelAt = new Date("2026-04-01T10:00:00Z");
    const deleteAt = new Date("2026-04-20T15:30:00Z");

    const map = __pickRefundsPerTournamentForTest([
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "2.00",
        currency: "usd",
        createdAt: deleteAt,
      },
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "10.00",
        currency: "usd",
        createdAt: cancelAt,
      },
    ]);

    const list = map.get(tournamentId);
    expect(list).toBeDefined();
    expect(list).toHaveLength(2);
    // Sorted chronologically — cancel happened first, then delete.
    expect(list?.[0].reason).toBe("cancelled");
    expect(list?.[0].amount).toBe("10.00");
    expect(list?.[1].reason).toBe("deleted");
    expect(list?.[1].amount).toBe("2.00");
  });

  it("returns just the cancel-refund when no delete-refund exists", () => {
    const map = __pickRefundsPerTournamentForTest([
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "15.00",
        currency: "usd",
        createdAt: new Date("2026-04-20T15:30:00Z"),
      },
    ]);

    const list = map.get(tournamentId);
    expect(list).toHaveLength(1);
    expect(list?.[0].reason).toBe("cancelled");
    expect(list?.[0].amount).toBe("15.00");
  });

  it("returns just the delete-refund when no cancel-refund exists", () => {
    const map = __pickRefundsPerTournamentForTest([
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "5.00",
        currency: "usd",
        createdAt: new Date("2026-04-20T15:30:00Z"),
      },
    ]);

    const list = map.get(tournamentId);
    expect(list).toHaveLength(1);
    expect(list?.[0].reason).toBe("deleted");
    expect(list?.[0].amount).toBe("5.00");
  });

  it("preserves both currencies when cancel is in project and delete is in USD", () => {
    const cancelAt = new Date("2026-04-01T10:00:00Z");
    const deleteAt = new Date("2026-04-20T15:30:00Z");

    const map = __pickRefundsPerTournamentForTest([
      {
        referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
        amount: "100.00",
        currency: "project",
        createdAt: cancelAt,
      },
      {
        referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
        amount: "8.00",
        currency: "usd",
        createdAt: deleteAt,
      },
    ]);

    const list = map.get(tournamentId);
    expect(list).toHaveLength(2);
    expect(list?.[0]).toEqual({ amount: "100.00", currency: "project", reason: "cancelled" });
    expect(list?.[1]).toEqual({ amount: "8.00", currency: "usd", reason: "deleted" });
  });

  it("keeps independent tournaments separate", () => {
    const t1 = "tournament-aaa";
    const t2 = "tournament-bbb";
    const date = new Date("2026-04-15T00:00:00Z");

    const map = __pickRefundsPerTournamentForTest([
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

    const list1 = map.get(t1);
    expect(list1).toHaveLength(1);
    expect(list1?.[0].amount).toBe("5.00");
    expect(list1?.[0].reason).toBe("cancelled");

    const list2 = map.get(t2);
    expect(list2).toHaveLength(1);
    expect(list2?.[0].amount).toBe("9.00");
    expect(list2?.[0].reason).toBe("deleted");
  });

  it("ignores rows with malformed or missing reference ids", () => {
    const date = new Date("2026-04-15T00:00:00Z");
    const map = __pickRefundsPerTournamentForTest([
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
    const list = map.get(tournamentId);
    expect(list).toHaveLength(1);
    expect(list?.[0].amount).toBe("7.00");
  });

  it("returns an empty map when given no rows", () => {
    const map = __pickRefundsPerTournamentForTest([]);
    expect(map.size).toBe(0);
  });
});
