/**
 * Helper-level tests for `reverseWalletConversion` (Task #131) — REAL
 * Drizzle / Postgres, mirrors the pattern in
 * `tests/wallet-routing-end-to-end.test.ts`.
 *
 * Coverage:
 *   1. Happy path — both legs are reversed atomically; the source wallet
 *      regains the debited amount, the destination wallet loses the
 *      credited amount, and TWO new "Reversal:"-prefixed rows are
 *      written that point at the original legs via `referenceId`.
 *   2. Insufficient destination balance — when the user has spent the
 *      credited funds, the helper throws
 *      `INSUFFICIENT_DESTINATION_BALANCE` and (because Drizzle wraps the
 *      whole helper in a transaction) leaves balances + rows untouched.
 *   3. Idempotency — once reversed, calling the helper again on either
 *      original leg throws `ALREADY_REVERSED`.
 *
 * Test data is fully isolated under the per-run prefix `wcr131-<ts>-<rand>`
 * and cleaned up in `afterAll`. The shared `server/db` pool is intentionally
 * NOT closed — other test files in the same vitest worker import the same
 * pool.
 */

import {
  describe,
  it,
  expect,
  afterAll,
  beforeAll,
} from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { db } from "../server/db";
import {
  users,
  transactions,
  userCurrencyWallets,
} from "@shared/schema";
import {
  CONVERSION_REVERSAL_DESCRIPTION_PREFIX,
  WalletConversionReversalError,
  executeWalletConversion,
  reverseWalletConversion,
} from "../server/lib/currency-conversion";
import { adjustUserCurrencyBalance } from "../server/lib/wallet-balances";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const TEST_PREFIX = `wcr131-${Date.now()}-${randomBytes(4).toString("hex")}`;
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
    balance: "1000.00",
    balanceCurrency: "USD",
    multiCurrencyEnabled: true,
    allowedCurrencies: ["USD", "EUR"],
  });
  createdUserIds.add(id);
  return id;
}

async function readBalances(userId: string): Promise<{
  primary: number;
  eur: number;
}> {
  const [u] = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId));
  const subs = await db
    .select()
    .from(userCurrencyWallets)
    .where(eq(userCurrencyWallets.userId, userId));
  const eurRow = subs.find((row) => row.currencyCode === "EUR");
  return {
    primary: Number.parseFloat(u?.balance ?? "0"),
    eur: Number.parseFloat(eurRow?.balance ?? "0"),
  };
}

describe.skipIf(!HAS_DB)("reverseWalletConversion (real DB)", () => {
  beforeAll(() => {
    if (!HAS_DB) return;
    expect(typeof CONVERSION_REVERSAL_DESCRIPTION_PREFIX).toBe("string");
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    const ids = Array.from(createdUserIds);
    if (ids.length === 0) return;
    await db.delete(transactions).where(inArray(transactions.userId, ids));
    await db
      .delete(userCurrencyWallets)
      .where(inArray(userCurrencyWallets.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });

  it("reverses both legs and inserts two Reversal: rows linked to the originals", async () => {
    const userId = await createMultiCurrencyUser();

    const exec = await executeWalletConversion({
      userId,
      fromCurrency: "USD",
      toCurrency: "EUR",
      fromAmount: 100,
      feePct: 0,
      usdRateByCurrency: { USD: 1, EUR: 1 },
    });

    const balancesAfterConvert = await readBalances(userId);
    expect(balancesAfterConvert.primary).toBeCloseTo(900, 2);
    expect(balancesAfterConvert.eur).toBeCloseTo(100, 2);

    const result = await reverseWalletConversion({
      transactionId: exec.fromTransactionId,
      adminId: "", // any non-empty string is fine for processedBy
      reason: "Test reversal — happy path",
    });

    expect(result.sourceCurrency).toBe("USD");
    expect(result.destinationCurrency).toBe("EUR");
    expect(result.sourceAmount).toBeCloseTo(100, 2);
    expect(result.destinationAmount).toBeCloseTo(100, 2);
    expect(result.sourceBalanceAfter).toBeCloseTo(1000, 2);
    expect(result.destinationBalanceAfter).toBeCloseTo(0, 2);

    const balancesAfterReverse = await readBalances(userId);
    expect(balancesAfterReverse.primary).toBeCloseTo(1000, 2);
    expect(balancesAfterReverse.eur).toBeCloseTo(0, 2);

    // Verify the two NEW reversal rows exist, point at the originals via
    // referenceId, and carry the marker prefix in their description.
    const reversalRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "currency_conversion"),
          like(
            transactions.description,
            `${CONVERSION_REVERSAL_DESCRIPTION_PREFIX}%`,
          ),
        ),
      );
    expect(reversalRows).toHaveLength(2);
    const referenceIds = new Set(reversalRows.map((r) => r.referenceId));
    expect(referenceIds.has(exec.fromTransactionId)).toBe(true);
    expect(referenceIds.has(exec.toTransactionId)).toBe(true);

    // Original legs intentionally remain `completed` for audit trail.
    const originals = await db
      .select({ id: transactions.id, status: transactions.status })
      .from(transactions)
      .where(
        inArray(transactions.id, [
          exec.fromTransactionId,
          exec.toTransactionId,
        ]),
      );
    expect(originals).toHaveLength(2);
    for (const row of originals) {
      expect(row.status).toBe("completed");
    }
  });

  it("rejects with INSUFFICIENT_DESTINATION_BALANCE when the credited funds were spent", async () => {
    const userId = await createMultiCurrencyUser();

    const exec = await executeWalletConversion({
      userId,
      fromCurrency: "USD",
      toCurrency: "EUR",
      fromAmount: 100,
      feePct: 0,
      usdRateByCurrency: { USD: 1, EUR: 1 },
    });

    // Drain 60 EUR out of the user's destination wallet (simulates them
    // spending the converted funds before the admin reverses).
    await db.transaction(async (tx) => {
      await adjustUserCurrencyBalance(tx, userId, "EUR", -60);
    });

    const beforeBalances = await readBalances(userId);
    expect(beforeBalances.primary).toBeCloseTo(900, 2);
    expect(beforeBalances.eur).toBeCloseTo(40, 2);

    await expect(
      reverseWalletConversion({
        transactionId: exec.toTransactionId,
        adminId: "",
        reason: "Should fail",
      }),
    ).rejects.toMatchObject({
      name: "WalletConversionReversalError",
      code: "INSUFFICIENT_DESTINATION_BALANCE",
      statusCode: 409,
    });

    // Failed transaction must leave balances + rows unchanged.
    const afterBalances = await readBalances(userId);
    expect(afterBalances.primary).toBeCloseTo(900, 2);
    expect(afterBalances.eur).toBeCloseTo(40, 2);

    const reversalRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          like(
            transactions.description,
            `${CONVERSION_REVERSAL_DESCRIPTION_PREFIX}%`,
          ),
        ),
      );
    expect(reversalRows).toHaveLength(0);
  });

  it("throws ALREADY_REVERSED on a second reversal attempt against either leg", async () => {
    const userId = await createMultiCurrencyUser();

    const exec = await executeWalletConversion({
      userId,
      fromCurrency: "USD",
      toCurrency: "EUR",
      fromAmount: 50,
      feePct: 0,
      usdRateByCurrency: { USD: 1, EUR: 1 },
    });

    await reverseWalletConversion({
      transactionId: exec.fromTransactionId,
      adminId: "",
      reason: "First reversal",
    });

    // Second attempt against the OTHER paired leg must still be detected
    // as a duplicate via the shared idempotency check.
    await expect(
      reverseWalletConversion({
        transactionId: exec.toTransactionId,
        adminId: "",
        reason: "Second reversal",
      }),
    ).rejects.toBeInstanceOf(WalletConversionReversalError);

    await expect(
      reverseWalletConversion({
        transactionId: exec.toTransactionId,
        adminId: "",
        reason: "Second reversal",
      }),
    ).rejects.toMatchObject({
      code: "ALREADY_REVERSED",
      statusCode: 409,
    });
  });

  it("serializes concurrent reverse calls so exactly one wins", async () => {
    const userId = await createMultiCurrencyUser();

    const exec = await executeWalletConversion({
      userId,
      fromCurrency: "USD",
      toCurrency: "EUR",
      fromAmount: 75,
      feePct: 0,
      usdRateByCurrency: { USD: 1, EUR: 1 },
    });

    // Fire two reverse calls in parallel against the same user. Each
    // call opens its own DB transaction; the FOR UPDATE lock on the
    // user row (acquired BEFORE the duplicate check) must serialize
    // them so exactly one commits a reversal and the other observes
    // the committed reversal rows and throws ALREADY_REVERSED.
    const [a, b] = await Promise.allSettled([
      reverseWalletConversion({
        transactionId: exec.fromTransactionId,
        adminId: "",
        reason: "Concurrent A",
      }),
      reverseWalletConversion({
        transactionId: exec.toTransactionId,
        adminId: "",
        reason: "Concurrent B",
      }),
    ]);

    const fulfilled = [a, b].filter((s) => s.status === "fulfilled");
    const rejected = [a, b].filter((s) => s.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(WalletConversionReversalError);
    expect((rejection.reason as WalletConversionReversalError).code).toBe(
      "ALREADY_REVERSED",
    );

    // Final ledger has exactly two reversal rows — one per leg —
    // and balances match a single reversal (USD back to 1000, EUR to 0).
    const reversalRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "currency_conversion"),
          like(
            transactions.description,
            `${CONVERSION_REVERSAL_DESCRIPTION_PREFIX}%`,
          ),
        ),
      );
    expect(reversalRows).toHaveLength(2);

    const finalBalances = await readBalances(userId);
    expect(finalBalances.primary).toBeCloseTo(1000, 2);
    expect(finalBalances.eur).toBeCloseTo(0, 2);
  });

  it("refuses to reverse a leg whose status is not completed", async () => {
    const userId = await createMultiCurrencyUser();

    const exec = await executeWalletConversion({
      userId,
      fromCurrency: "USD",
      toCurrency: "EUR",
      fromAmount: 25,
      feePct: 0,
      usdRateByCurrency: { USD: 1, EUR: 1 },
    });

    // Force the seed leg into a non-reversible state.
    await db
      .update(transactions)
      .set({ status: "cancelled" })
      .where(eq(transactions.id, exec.fromTransactionId));

    await expect(
      reverseWalletConversion({
        transactionId: exec.fromTransactionId,
        adminId: "",
        reason: "Should be refused",
      }),
    ).rejects.toMatchObject({
      code: "NOT_A_CONVERSION",
      statusCode: 400,
    });
  });
});
