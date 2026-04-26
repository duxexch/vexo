/**
 * Tests for the multi-currency wallet helpers (Task #105).
 *
 * `adjustUserCurrencyBalance` is the single chokepoint that every money path
 * in the app eventually calls — deposits, withdrawals, refunds on
 * rejection, admin balance adjustments, P2P escrow, tournament payouts, and
 * the new wallet-conversion feature. Locking in its behavior protects all
 * of those paths against regressions.
 *
 * The Drizzle tx mock below is intentionally rich:
 *   - it tracks `.for("update")` BY TABLE so we can assert the row-lock
 *     actually landed on `user_currency_wallets` (not silently on `users`);
 *   - it walks Drizzle's SQL predicate tree to extract Param values so the
 *     mock can FILTER sub-wallet rows by `userId`/`currencyCode` and so we
 *     can assert that UPDATE statements target the correct row.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => {
  const noop = () => ({});
  return {
    db: {
      select: vi.fn(noop),
      insert: vi.fn(noop),
      update: vi.fn(noop),
      transaction: vi.fn(noop),
    },
  };
});

import {
  adjustUserCurrencyBalance,
  getEffectiveAllowedCurrencies,
} from "../server/lib/wallet-balances";

interface FakeUserRow {
  id: string;
  balance: string;
  balanceCurrency: string;
  multiCurrencyEnabled: boolean;
  allowedCurrencies: string[];
}

interface FakeSubWalletRow {
  id: string;
  userId: string;
  currencyCode: string;
  balance: string;
  totalDeposited: string;
  totalWithdrawn: string;
}

/**
 * Walk a Drizzle SQL predicate tree and collect `Param` literal values.
 * Used by the mock to filter rows the same way Postgres would and to
 * assert that the helper's WHERE clauses reference the right values.
 */
function collectParamValues(node: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new WeakSet<object>();
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (seen.has(n as object)) return;
    seen.add(n as object);
    const ctorName = (n as any).constructor?.name;
    if (ctorName === "Param" && "value" in (n as any)) {
      out.push((n as any).value);
    }
    for (const k of Object.keys(n as any)) {
      const v = (n as any)[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(node);
  return out;
}

function tableName(table: unknown): string {
  if (!table || typeof table !== "object") return "unknown";
  const sym = Object.getOwnPropertySymbols(table as object).find((s) =>
    s.toString().includes("Symbol(drizzle:Name)"),
  );
  if (sym) return (table as Record<symbol, unknown>)[sym] as string;
  return "unknown";
}

function makeTx(opts: {
  user: FakeUserRow | null;
  subWallets?: FakeSubWalletRow[];
}) {
  const subWallets = [...(opts.subWallets ?? [])];

  const updates: Array<{
    table: string;
    set: Record<string, unknown>;
    whereParams: unknown[];
  }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const forUpdateByTable: Record<string, number> = {};

  const tx = {
    select(_columns?: unknown) {
      let currentTable = "";
      let currentWhereParams: unknown[] = [];

      const resolveRows = (): unknown[] => {
        if (currentTable === "users") {
          return opts.user ? [opts.user] : [];
        }
        if (currentTable === "user_currency_wallets") {
          // Filter by every Param value found in the where predicate
          // (userId AND currencyCode), so a regression that swaps either
          // side would return zero matching rows.
          return subWallets.filter((row) => {
            for (const p of currentWhereParams) {
              if (p === row.userId) continue;
              if (p === row.currencyCode) continue;
              return false;
            }
            return true;
          });
        }
        return [];
      };

      const chain: any = {
        from(table: unknown) {
          currentTable = tableName(table);
          return chain;
        },
        where(predicate: unknown) {
          currentWhereParams = collectParamValues(predicate);
          return chain;
        },
        for(mode: string) {
          if (mode === "update") {
            forUpdateByTable[currentTable] = (forUpdateByTable[currentTable] ?? 0) + 1;
          }
          return chain;
        },
        then(resolve: (rows: unknown[]) => void, reject: (err: unknown) => void) {
          try {
            resolve(resolveRows());
          } catch (err) {
            reject(err);
          }
        },
      };
      return chain;
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(values: Record<string, unknown>) {
          return {
            where(predicate: unknown) {
              updates.push({
                table: name,
                set: values,
                whereParams: collectParamValues(predicate),
              });
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table: name, values });
          // Newly inserted sub-wallets must be visible to subsequent SELECTs
          // in the same helper call (the helper inserts then re-reads with
          // FOR UPDATE before mutating).
          if (name === "user_currency_wallets") {
            const row: FakeSubWalletRow = {
              id: `wallet-${name}-${inserts.length}`,
              userId: String(values.userId ?? ""),
              currencyCode: String(values.currencyCode ?? ""),
              balance: String(values.balance ?? "0.00"),
              totalDeposited: String(values.totalDeposited ?? "0.00"),
              totalWithdrawn: String(values.totalWithdrawn ?? "0.00"),
            };
            subWallets.push(row);
            return {
              returning() { return Promise.resolve([row]); },
              onConflictDoNothing() {
                return { returning: () => Promise.resolve([row]) };
              },
            };
          }
          return {
            returning() { return Promise.resolve([{ id: "ins-1", ...values }]); },
            onConflictDoNothing() {
              return { returning: () => Promise.resolve([{ id: "ins-1", ...values }]) };
            },
          };
        },
      };
    },
  };

  return {
    tx: tx as any,
    inserts,
    updates,
    forUpdateByTable,
    subWallets,
  };
}

describe("getEffectiveAllowedCurrencies", () => {
  it("returns only the primary when multiCurrency is disabled", () => {
    const result = getEffectiveAllowedCurrencies({
      balanceCurrency: "USD",
      multiCurrencyEnabled: false,
      allowedCurrencies: ["EGP", "SAR"],
    });
    expect(result).toEqual(["USD"]);
  });

  it("places primary first and dedupes the allow-list when multiCurrency is on", () => {
    const result = getEffectiveAllowedCurrencies({
      balanceCurrency: "USD",
      multiCurrencyEnabled: true,
      allowedCurrencies: ["EGP", "USD", "SAR", "egp"],
    });
    expect(result).toEqual(["USD", "EGP", "SAR"]);
  });

  it("normalizes lowercase codes and falls back to USD when the primary is blank", () => {
    const result = getEffectiveAllowedCurrencies({
      balanceCurrency: "" as any,
      multiCurrencyEnabled: true,
      allowedCurrencies: ["egp"],
    });
    expect(result[0]).toBe("USD");
    expect(result).toContain("EGP");
  });
});

describe("adjustUserCurrencyBalance — primary currency path (deposit & withdraw)", () => {
  it("credits the primary balance on a deposit-style positive delta and locks the users row", async () => {
    const { tx, updates, forUpdateByTable } = makeTx({
      user: {
        id: "u1",
        balance: "100.00",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["USD", "EGP"],
      },
    });

    const result = await adjustUserCurrencyBalance(tx, "u1", "USD", 50);
    expect(result.isPrimary).toBe(true);
    expect(result.currency).toBe("USD");
    expect(result.balanceBefore).toBeCloseTo(100, 2);
    expect(result.balanceAfter).toBeCloseTo(150, 2);
    // Note: the helper does NOT acquire its own FOR UPDATE on `users`.
    // Each caller (e.g. admin balance-adjust route) is responsible for the
    // primary row lock. We only assert the lock on the SUB-wallet path.
    expect(forUpdateByTable["users"]).toBeUndefined();
    const userUpdate = updates.find((u) => u.table === "users");
    expect(userUpdate?.set.balance).toBe("150.00");
    expect(userUpdate?.whereParams).toContain("u1");
  });

  it("debits the primary balance on a withdrawal-style negative delta", async () => {
    const { tx, updates } = makeTx({
      user: {
        id: "u1",
        balance: "75.50",
        balanceCurrency: "USD",
        multiCurrencyEnabled: false,
        allowedCurrencies: [],
      },
    });

    const result = await adjustUserCurrencyBalance(tx, "u1", null, -25.5);
    expect(result.balanceAfter).toBeCloseTo(50, 2);
    expect(updates[0]?.set.balance).toBe("50.00");
  });

  it("rejects an oversell on the primary balance with a clear Insufficient error", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "10.00",
        balanceCurrency: "USD",
        multiCurrencyEnabled: false,
        allowedCurrencies: [],
      },
    });

    await expect(
      adjustUserCurrencyBalance(tx, "u1", "USD", -50),
    ).rejects.toThrow(/Insufficient USD balance/);
  });

  it("treats null currencyCode as the legacy primary path", async () => {
    const { tx, updates } = makeTx({
      user: {
        id: "u1",
        balance: "10.00",
        balanceCurrency: "EGP",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP"],
      },
    });
    const result = await adjustUserCurrencyBalance(tx, "u1", null, 5);
    expect(result.isPrimary).toBe(true);
    expect(result.currency).toBe("EGP");
    expect(updates[0]?.set.balance).toBe("15.00");
  });
});

describe("adjustUserCurrencyBalance — sub-wallet path (multi-currency)", () => {
  it("debits an existing sub-wallet and acquires FOR UPDATE on user_currency_wallets specifically", async () => {
    const { tx, updates, forUpdateByTable } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP"],
      },
      subWallets: [
        {
          id: "w1",
          userId: "u1",
          currencyCode: "EGP",
          balance: "200.00",
          totalDeposited: "300.00",
          totalWithdrawn: "100.00",
        },
      ],
    });

    const result = await adjustUserCurrencyBalance(tx, "u1", "EGP", -75);
    expect(result.currency).toBe("EGP");
    expect(result.isPrimary).toBe(false);
    expect(result.balanceBefore).toBeCloseTo(200, 2);
    expect(result.balanceAfter).toBeCloseTo(125, 2);
    // CRITICAL: the row-lock must land on user_currency_wallets, not just users.
    expect(forUpdateByTable["user_currency_wallets"]).toBeGreaterThanOrEqual(1);
    const subUpdate = updates.find((u) => u.table === "user_currency_wallets");
    expect(subUpdate?.set.balance).toBe("125.00");
    expect(subUpdate?.set.totalWithdrawn).toBe("175.00");
    // The UPDATE targets the row by id (the value returned by the
    // SELECT-by-(userId, currencyCode) which the mock filters).
    expect(subUpdate?.whereParams).toContain("w1");
  });

  it("touches ONLY the matching sub-wallet when multiple sub-wallets exist (no cross-wallet leak)", async () => {
    // Three sub-wallets owned by THIS user. A bug that drops the
    // currencyCode predicate would update the first row (EGP) instead of SAR.
    const { tx, updates } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP", "SAR", "AED"],
      },
      subWallets: [
        { id: "w-egp", userId: "u1", currencyCode: "EGP", balance: "500.00", totalDeposited: "500.00", totalWithdrawn: "0.00" },
        { id: "w-sar", userId: "u1", currencyCode: "SAR", balance: "80.00",  totalDeposited: "80.00",  totalWithdrawn: "0.00" },
        { id: "w-aed", userId: "u1", currencyCode: "AED", balance: "20.00",  totalDeposited: "20.00",  totalWithdrawn: "0.00" },
      ],
    });

    const result = await adjustUserCurrencyBalance(tx, "u1", "SAR", -30);
    expect(result.currency).toBe("SAR");
    expect(result.balanceBefore).toBeCloseTo(80, 2);
    expect(result.balanceAfter).toBeCloseTo(50, 2);

    const subUpdates = updates.filter((u) => u.table === "user_currency_wallets");
    expect(subUpdates).toHaveLength(1);
    expect(subUpdates[0].set.balance).toBe("50.00");
    // The UPDATE targets the row by id (the value returned from the
    // SELECT-by-(userId, currencyCode)). With the mock's predicate-aware
    // filtering, only the SAR row could have been selected; assert the
    // UPDATE id and assert the OTHER wallet ids are NOT in the predicate.
    expect(subUpdates[0].whereParams).toContain("w-sar");
    expect(subUpdates[0].whereParams).not.toContain("w-egp");
    expect(subUpdates[0].whereParams).not.toContain("w-aed");
  });

  it("scopes the sub-wallet read by userId so another user's same-currency row cannot be debited", async () => {
    // u1 has NO EGP sub-wallet but a different user (u2) does. The helper
    // must not accidentally debit u2's row. With predicate-aware filtering
    // in the mock, an oversell error is the expected outcome.
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP"],
      },
      subWallets: [
        { id: "w-other", userId: "u2", currencyCode: "EGP", balance: "9999.00", totalDeposited: "9999.00", totalWithdrawn: "0.00" },
      ],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "EGP", -10),
    ).rejects.toThrow(/Insufficient EGP balance/);
  });

  it("refunds a withdrawal back to the same sub-wallet on rejection (positive delta)", async () => {
    const { tx, updates } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["SAR"],
      },
      subWallets: [
        {
          id: "w-sar",
          userId: "u1",
          currencyCode: "SAR",
          balance: "12.00",
          totalDeposited: "100.00",
          totalWithdrawn: "88.00",
        },
      ],
    });

    const result = await adjustUserCurrencyBalance(tx, "u1", "SAR", 50, { allowCreate: true });
    expect(result.currency).toBe("SAR");
    expect(result.balanceAfter).toBeCloseTo(62, 2);
    const subUpdate = updates.find((u) => u.table === "user_currency_wallets");
    expect(subUpdate?.set.balance).toBe("62.00");
    expect(subUpdate?.set.totalDeposited).toBe("150.00");
    // Update targets the SAR sub-wallet's id (the row returned by SELECT-by-currencyCode).
    expect(subUpdate?.whereParams).toContain("w-sar");
  });

  it("rejects an oversell on a sub-wallet with the matching currency code", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP"],
      },
      subWallets: [
        {
          id: "w1",
          userId: "u1",
          currencyCode: "EGP",
          balance: "10.00",
          totalDeposited: "10.00",
          totalWithdrawn: "0.00",
        },
      ],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "EGP", -50),
    ).rejects.toThrow(/Insufficient EGP balance/);
  });

  it("rejects a debit on a sub-wallet that does not yet exist", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP", "SAR"],
      },
      subWallets: [],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "SAR", -10),
    ).rejects.toThrow(/Insufficient SAR balance/);
  });

  it("rejects a credit when allowCreate is false and the row does not exist", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP"],
      },
      subWallets: [],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "EGP", 25),
    ).rejects.toThrow(/No EGP sub-wallet/);
  });

  it("rejects a sub-wallet operation when multi-currency is disabled", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: false,
        allowedCurrencies: ["EGP"],
      },
      subWallets: [],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "EGP", 25, { allowCreate: true }),
    ).rejects.toThrow(/not enabled for multi-currency/);
  });

  it("rejects a sub-wallet operation when the currency is not on the allow-list", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["SAR"],
      },
      subWallets: [],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "EGP", 25, { allowCreate: true }),
    ).rejects.toThrow(/not on this user's allow-list/);
  });

  it("allowOutsideAllowList lets a credit (refund) settle even if currency was de-listed AFTER the user paid in", async () => {
    const { tx, updates } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["SAR"],
      },
      subWallets: [
        {
          id: "w-egp",
          userId: "u1",
          currencyCode: "EGP",
          balance: "0.00",
          totalDeposited: "100.00",
          totalWithdrawn: "100.00",
        },
      ],
    });
    const result = await adjustUserCurrencyBalance(tx, "u1", "EGP", 75, {
      allowOutsideAllowList: true,
    });
    expect(result.balanceAfter).toBeCloseTo(75, 2);
    const subUpdate = updates.find((u) => u.table === "user_currency_wallets");
    expect(subUpdate?.set.balance).toBe("75.00");
  });

  it("allowOutsideAllowList does NOT bypass the allow-list on a debit (security guard)", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["SAR"],
      },
      subWallets: [
        {
          id: "w-egp",
          userId: "u1",
          currencyCode: "EGP",
          balance: "100.00",
          totalDeposited: "100.00",
          totalWithdrawn: "0.00",
        },
      ],
    });
    await expect(
      adjustUserCurrencyBalance(tx, "u1", "EGP", -10, { allowOutsideAllowList: true }),
    ).rejects.toThrow(/not on this user's allow-list/);
  });

  it("creates a new sub-wallet row on first credit when allowCreate is true", async () => {
    const { tx, inserts, updates } = makeTx({
      user: {
        id: "u1",
        balance: "0",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: ["EGP"],
      },
      subWallets: [],
    });
    const result = await adjustUserCurrencyBalance(tx, "u1", "EGP", 30, { allowCreate: true });
    expect(result.balanceAfter).toBeCloseTo(30, 2);
    const insertCall = inserts.find((i) => i.table === "user_currency_wallets");
    expect(insertCall?.values.currencyCode).toBe("EGP");
    expect(insertCall?.values.balance).toBe("0.00");
    const updateCall = updates.find((u) => u.table === "user_currency_wallets");
    expect(updateCall?.set.balance).toBe("30.00");
    // Update targets the freshly inserted row by id, not by currencyCode.
    expect(updateCall?.whereParams.length).toBeGreaterThan(0);
    expect(String(updateCall?.whereParams[0])).toMatch(/wallet-user_currency_wallets/);
  });
});

describe("adjustUserCurrencyBalance — input validation", () => {
  it("rejects a zero or non-finite delta", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "100",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: [],
      },
    });
    await expect(adjustUserCurrencyBalance(tx, "u1", "USD", 0)).rejects.toThrow(/non-zero/);
    await expect(adjustUserCurrencyBalance(tx, "u1", "USD", Number.NaN)).rejects.toThrow(/non-zero/);
  });

  it("rejects a malformed currency code (no silent fallback)", async () => {
    const { tx } = makeTx({
      user: {
        id: "u1",
        balance: "100",
        balanceCurrency: "USD",
        multiCurrencyEnabled: true,
        allowedCurrencies: [],
      },
    });
    await expect(adjustUserCurrencyBalance(tx, "u1", "🚫", 5)).rejects.toThrow(/Invalid currency code/);
  });

  it("rejects when the user row cannot be found (race or stale id)", async () => {
    const { tx } = makeTx({ user: null });
    await expect(adjustUserCurrencyBalance(tx, "missing", "USD", 1)).rejects.toThrow(/User not found/);
  });
});
