/**
 * Real-DB concurrency test for `adjustUserCurrencyBalance` (Task #135).
 *
 * Two concurrent first-time credits to the same (userId, currencyCode)
 * sub-wallet would both miss the SELECT-FOR-UPDATE inside their own
 * transaction and race to INSERT. Without an `ON CONFLICT DO NOTHING`
 * guard + post-insert re-read, the loser of the race would surface the
 * unique-index violation as a confusing `duplicate key value` error
 * to the caller (and skip applying the credit), instead of merging
 * both deposits onto a single row.
 *
 * This test fires two parallel `db.transaction` blocks that each call
 * `adjustUserCurrencyBalance(tx, userId, "EUR", X, { allowCreate: true })`
 * for a fresh user with no existing EUR sub-wallet, and asserts:
 *   - both calls return successfully (no thrown error);
 *   - the database ends up with EXACTLY ONE row in `user_currency_wallets`
 *     for that (userId, "EUR") pair;
 *   - the row's final balance equals the sum of the two credits.
 *
 * Test data is isolated under a per-run prefix and torn down in
 * `afterAll`. The shared `server/db` pool is intentionally not closed —
 * other test files in the same vitest worker import the same pool.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { db } from "../server/db";
import { users, userCurrencyWallets } from "@shared/schema";
import { adjustUserCurrencyBalance } from "../server/lib/wallet-balances";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const TEST_PREFIX = `wbc135-${Date.now()}-${randomBytes(4).toString("hex")}`;
const createdUserIds = new Set<string>();

function uid(label: string): string {
  return `${TEST_PREFIX}-${label}-${randomBytes(4).toString("hex")}`;
}

async function createMultiCurrencyUser(): Promise<string> {
  const id = uid("user");
  await db.insert(users).values({
    id,
    username: id,
    password: "x",
    balance: "0.00",
    balanceCurrency: "USD",
    multiCurrencyEnabled: true,
    allowedCurrencies: ["USD", "EUR"],
  });
  createdUserIds.add(id);
  return id;
}

describe.skipIf(!HAS_DB)("adjustUserCurrencyBalance — concurrent first-time credits (real DB)", () => {
  beforeAll(() => {
    if (!HAS_DB) return;
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    const ids = Array.from(createdUserIds);
    if (ids.length === 0) return;
    await db.delete(userCurrencyWallets).where(inArray(userCurrencyWallets.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });

  it("merges two simultaneous first-time credits onto a single sub-wallet row without raising", async () => {
    const userId = await createMultiCurrencyUser();

    // Each call runs in its own transaction — mirroring real callers
    // (deposit-approve route + admin balance-adjust route, etc).
    const creditA = 25;
    const creditB = 17.5;

    // Force the race deterministically: tx A holds its row + unique-index
    // lock by `pg_sleep`-ing for 600ms BEFORE committing. Tx B starts
    // 100ms later, so it is guaranteed to:
    //   (1) miss the initial SELECT FOR UPDATE (A hasn't committed yet),
    //   (2) block on its INSERT (A holds the unique-index slot),
    //   (3) when A commits, see ON CONFLICT DO NOTHING return no row,
    //   (4) re-read with FOR UPDATE and credit on top of A's balance.
    //
    // We measure tx B's wall-clock to confirm it actually blocked; if my
    // fix were wrong (or the partner tx never held the lock), B would
    // finish in ~10ms instead of ~500ms+.
    const promiseA = db.transaction(async (tx) => {
      const r = await adjustUserCurrencyBalance(tx, userId, "EUR", creditA, { allowCreate: true });
      // Hold the row + index lock for 0.6s before commit.
      await tx.execute(sql`select pg_sleep(0.6)`);
      return r;
    });

    const startB = Date.now();
    const promiseB = (async () => {
      // Give A a 100ms head start so it has issued its INSERT before B runs.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return db.transaction(async (tx) => {
        return adjustUserCurrencyBalance(tx, userId, "EUR", creditB, { allowCreate: true });
      });
    })();

    const [a, b] = await Promise.allSettled([promiseA, promiseB]);
    const elapsedB = Date.now() - startB;

    // Both calls must succeed. Without the ON CONFLICT DO NOTHING fix,
    // one of them would reject with a unique-violation error.
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");

    // Tx B must have BLOCKED on tx A's lock (≳400ms). If B finished in
    // <300ms, the two txs serialized naturally and the conflict path was
    // not exercised — defeating the purpose of this test.
    expect(elapsedB).toBeGreaterThan(400);

    // Exactly one sub-wallet row exists for (userId, "EUR") — no duplicates.
    const rows = await db
      .select()
      .from(userCurrencyWallets)
      .where(
        and(
          eq(userCurrencyWallets.userId, userId),
          eq(userCurrencyWallets.currencyCode, "EUR"),
        ),
      );
    expect(rows).toHaveLength(1);

    // Final balance equals the sum of both credits, and the deposit
    // counter aggregates both as well.
    const finalBalance = Number.parseFloat(rows[0]!.balance);
    expect(finalBalance).toBeCloseTo(creditA + creditB, 2);
    const totalDeposited = Number.parseFloat(rows[0]!.totalDeposited);
    expect(totalDeposited).toBeCloseTo(creditA + creditB, 2);
  });

  it("a single first-time credit still creates the row and applies the credit (regression)", async () => {
    const userId = await createMultiCurrencyUser();

    await db.transaction(async (tx) => {
      const r = await adjustUserCurrencyBalance(tx, userId, "EUR", 12.34, { allowCreate: true });
      expect(r.balanceAfter).toBeCloseTo(12.34, 2);
      expect(r.balanceBefore).toBeCloseTo(0, 2);
    });

    const rows = await db
      .select()
      .from(userCurrencyWallets)
      .where(
        and(
          eq(userCurrencyWallets.userId, userId),
          eq(userCurrencyWallets.currencyCode, "EUR"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(Number.parseFloat(rows[0]!.balance)).toBeCloseTo(12.34, 2);
  });
});
