/**
 * Real-database rollback test for the admin balance-adjust endpoints
 * (Task #192). The mock-based atomicity test in
 * `admin-balance-adjust-validation.test.ts` proves the route stops
 * SWALLOWING inner failures, but it stubs `db.transaction` end-to-end and
 * therefore cannot catch a future regression where someone moves a
 * money-mutating step OUTSIDE `db.transaction` again — exactly the bug
 * we just fixed in the VXC adjust route.
 *
 * Strategy:
 *   - Boot a tiny Express app wired to the REAL `db` (the same Postgres
 *     pool the app uses), so the wallet UPDATE and the audit-row INSERT
 *     run inside a real Postgres transaction.
 *   - Wrap `db.transaction` via a spy that hands the route a Proxy over
 *     the real `tx`. The Proxy intercepts inserts targeting a single,
 *     test-selected table and makes them throw, simulating a constraint
 *     violation on the audit row AFTER the wallet has already been
 *     mutated inside the same transaction.
 *   - Assert that the request fails AND that the wallet row in Postgres
 *     is byte-identical to its pre-request value. If a future refactor
 *     moves the audit insert OUT of the transaction, the wallet would
 *     stay credited even though the audit insert threw — and that
 *     assertion would flip and fail this test.
 *
 * Skipped automatically when no `DATABASE_URL` is configured, mirroring
 * `wallet-balances-concurrency.test.ts`.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import express from "express";

// Inject a fake admin so the route's `adminAuthMiddleware` is a no-op,
// and silence the audit-log writer so it never touches Postgres itself.
vi.mock("../server/admin-routes/helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/admin-routes/helpers")>();
  return {
    ...actual,
    adminAuthMiddleware: (req: any, _res: any, next: any) => {
      req.admin = { id: "admin-test", username: "admin", role: "admin" };
      next();
    },
    logAdminAction: async () => undefined,
  };
});

vi.mock("../server/websocket", () => ({
  sendNotification: async () => undefined,
}));

import { db } from "../server/db";
import {
  users,
  transactions,
  projectCurrencyWallets,
  projectCurrencyLedger,
} from "@shared/schema";
import { registerUserFinancialRoutes } from "../server/admin-routes/admin-users/financial";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const TEST_PREFIX = `t192-${Date.now()}-${randomBytes(4).toString("hex")}`;
const createdUserIds = new Set<string>();

let server: any;
let baseUrl = "";

/**
 * Test knob: when set, the next `db.transaction` call's `tx.insert(<table>)`
 * (matched by Drizzle's pgTable name) will reject from inside the
 * transaction. Reset to `null` between tests so unrelated transactions
 * (e.g. seeding helpers, cleanup) are never affected.
 */
const failOnTable: { name: string | null } = { name: null };

function drizzleTableName(table: unknown): string | null {
  if (!table || typeof table !== "object") return null;
  const sym = Object.getOwnPropertySymbols(table as object).find((s) =>
    s.toString().includes("Symbol(drizzle:Name)"),
  );
  if (!sym) return null;
  const name = (table as Record<symbol, unknown>)[sym];
  return typeof name === "string" ? name : null;
}

/**
 * Build a thenable that always rejects with the simulated audit-row
 * failure. Both `await tx.insert(t).values(v)` (used by the VXC route
 * for the ledger insert) and `await tx.insert(t).values(v).returning()`
 * (used by the balance-adjust route for the transactions insert) must
 * propagate the rejection so Postgres rolls back the whole transaction.
 */
function buildFailingValuesBuilder() {
  const failure = () => Promise.reject(new Error("simulated audit-row insert failure"));
  const builder: any = {
    returning: () => failure(),
    then: (onF: any, onR: any) => failure().then(onF, onR),
    catch: (onR: any) => failure().catch(onR),
    finally: (onF: any) => failure().finally(onF),
  };
  return builder;
}

beforeAll(async () => {
  if (!HAS_DB) return;

  const realTransaction = db.transaction.bind(db);

  // Spy on db.transaction so every transaction the routes start hands
  // the callback a Proxy over the real `tx`. The Proxy is transparent
  // unless `failOnTable.name` is set, in which case insert(<that table>)
  // throws — letting Postgres exercise its real ROLLBACK path.
  vi.spyOn(db, "transaction").mockImplementation(((cb: any, opts: any) => {
    return realTransaction(async (tx: any) => {
      const wrapped = new Proxy(tx, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (prop === "insert" && failOnTable.name) {
            return (table: unknown) => {
              if (drizzleTableName(table) === failOnTable.name) {
                return { values: () => buildFailingValuesBuilder() };
              }
              return (value as any).call(target, table);
            };
          }
          return typeof value === "function" ? (value as any).bind(target) : value;
        },
      });
      return cb(wrapped);
    }, opts);
  }) as any);

  const app = express();
  app.use(express.json());
  registerUserFinancialRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (!HAS_DB) return;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.restoreAllMocks();
  const ids = Array.from(createdUserIds);
  if (ids.length === 0) return;
  // Order matters: child rows must go before the user row because of FKs.
  await db.delete(projectCurrencyLedger).where(inArray(projectCurrencyLedger.userId, ids));
  await db.delete(projectCurrencyWallets).where(inArray(projectCurrencyWallets.userId, ids));
  await db.delete(transactions).where(inArray(transactions.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

function uid(label: string): string {
  return `${TEST_PREFIX}-${label}-${randomBytes(4).toString("hex")}`;
}

async function seedPrimaryUser(initialBalance: string): Promise<string> {
  const id = uid("u");
  await db.insert(users).values({
    id,
    username: id,
    password: "x",
    balance: initialBalance,
    balanceCurrency: "USD",
    multiCurrencyEnabled: false,
    allowedCurrencies: [],
  });
  createdUserIds.add(id);
  return id;
}

async function seedVxcWallet(userId: string, earned: string, total: string): Promise<void> {
  await db.insert(projectCurrencyWallets).values({
    userId,
    earnedBalance: earned,
    purchasedBalance: "0.00",
    totalBalance: total,
    totalEarned: earned,
  });
}

async function readUserBalance(userId: string): Promise<string | null> {
  const rows = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
  return rows[0]?.balance ?? null;
}

async function readVxcTotal(userId: string): Promise<string | null> {
  const rows = await db
    .select({ total: projectCurrencyWallets.totalBalance })
    .from(projectCurrencyWallets)
    .where(eq(projectCurrencyWallets.userId, userId));
  return rows[0]?.total ?? null;
}

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

describe.skipIf(!HAS_DB)("admin balance-adjust — real-DB rollback (Task #192)", () => {
  it("POST /balance-adjust rolls the wallet UPDATE back when the transactions audit insert fails", async () => {
    const userId = await seedPrimaryUser("100.00");
    expect(await readUserBalance(userId)).toBe("100.00");

    failOnTable.name = "transactions";
    try {
      const r = await postJson(`/api/admin/users/${userId}/balance-adjust`, {
        type: "add",
        amount: 50,
        reason: "task-192 rollback probe",
      });

      // The route must surface a non-2xx and must NOT swallow the inner
      // failure into a `{ success: false }` envelope. The audit row
      // failure is a programming error from the route's perspective, so
      // 500 (default) is the expected status.
      expect(r.status).toBeGreaterThanOrEqual(500);
    } finally {
      failOnTable.name = null;
    }

    // The decisive assertion: Postgres rolled the wallet update back.
    // If a future refactor pulls the `tx.insert(transactions)` out of
    // the `db.transaction` block (or back to using `db` instead of
    // `tx`), the credit would survive the audit failure and this would
    // flip to "150.00".
    expect(await readUserBalance(userId)).toBe("100.00");
  });

  it("POST /vxc-adjust rolls the wallet UPDATE back when the projectCurrencyLedger audit insert fails", async () => {
    const userId = await seedPrimaryUser("0.00");
    await seedVxcWallet(userId, "200.00", "200.00");
    expect(await readVxcTotal(userId)).toBe("200.00");

    failOnTable.name = "project_currency_ledger";
    try {
      const r = await postJson(`/api/admin/users/${userId}/vxc-adjust`, {
        type: "add",
        amount: 75,
        reason: "task-192 vxc rollback probe",
      });

      // The VXC route was the original offender — its ledger insert used
      // to live OUTSIDE the transaction. After the fix, a ledger-insert
      // failure must propagate, the route must respond with a non-2xx,
      // and the wallet update must be rolled back below.
      expect(r.status).toBeGreaterThanOrEqual(500);
    } finally {
      failOnTable.name = null;
    }

    expect(await readVxcTotal(userId)).toBe("200.00");
  });
});
