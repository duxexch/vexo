/**
 * Validation tests for the admin per-currency balance-adjust endpoint
 * (Task #105). The route is the single tool an admin uses to credit or
 * debit a user's primary OR sub-wallet, so the input gates that reject
 * malformed currencies and off-allow-list currencies must never regress.
 *
 * We boot a tiny Express app in-process, mock auth + storage + db, and
 * drive the real handler over HTTP using node's built-in fetch.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Replace adminAuthMiddleware with a passthrough that injects a fake admin.
vi.mock("../server/admin-routes/helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/admin-routes/helpers")>();
  return {
    ...actual,
    adminAuthMiddleware: (req: any, _res: any, next: any) => {
      req.admin = { id: "admin-1", username: "admin", role: "admin" };
      next();
    },
    logAdminAction: async () => undefined,
  };
});

const fakeUsers = new Map<string, any>();

vi.mock("../server/storage", () => ({
  storage: {
    getUser: async (id: string) => fakeUsers.get(id) ?? null,
  },
}));

// The handler runs `await db.transaction(async (tx) => { ... })` then
// `tx.select(...)...for("update")`, then calls adjustUserCurrencyBalance,
// which itself runs `tx.select`/`tx.update`. The mock below returns a tx
// object that behaves enough like Drizzle for the happy path; failure-path
// tests short-circuit before reaching db.transaction.
vi.mock("../server/db", () => {
  function buildTx() {
    const select = () => ({
      from: () => ({
        where: () => {
          const node: any = {
            for: () => Promise.resolve([{ id: "any" }]),
            then: (resolve: any) => resolve([]),
          };
          return node;
        },
      }),
    });
    const tx = {
      select,
      insert: () => ({
        values: () => ({ returning: () => Promise.resolve([{ id: "tx-1" }]) }),
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve(undefined) }),
      }),
    };
    return tx;
  }
  return {
    db: {
      transaction: async (fn: (tx: any) => any) => fn(buildTx()),
    },
  };
});

// Silence outbound notifications.
vi.mock("../server/websocket", () => ({
  sendNotification: async () => undefined,
}));

// Stub adjustUserCurrencyBalance to a controllable fake so we can verify
// what the route actually calls it with on the happy path. The real helper
// is exhaustively covered in tests/wallet-balances.test.ts.
const adjustCalls: Array<{ userId: string; currency: string | null; delta: number; opts: any }> = [];
vi.mock("../server/lib/wallet-balances", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/lib/wallet-balances")>();
  return {
    ...actual,
    adjustUserCurrencyBalance: async (
      _tx: any,
      userId: string,
      currency: string | null,
      delta: number,
      opts: any = {},
    ) => {
      adjustCalls.push({ userId, currency, delta, opts });
      return {
        currency: currency ?? "USD",
        isPrimary: currency === null || currency === "USD",
        balanceBefore: 100,
        balanceAfter: 100 + delta,
      };
    },
    bumpPrimaryDepositWithdrawalTotals: async () => undefined,
  };
});

import express from "express";
import { registerUserFinancialRoutes } from "../server/admin-routes/admin-users/financial";

let server: any;
let baseUrl = "";

beforeAll(async () => {
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function userId(suffix: string) {
  return `u-${suffix}`;
}

async function postAdjust(id: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/admin/users/${id}/balance-adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

describe("POST /api/admin/users/:id/balance-adjust — input validation", () => {
  it("rejects when type is missing or not add/subtract", async () => {
    fakeUsers.set(userId("v1"), {
      id: userId("v1"), balance: "0", balanceCurrency: "USD",
      multiCurrencyEnabled: true, allowedCurrencies: [],
    });
    const r = await postAdjust(userId("v1"), { amount: 5, reason: "ok reason" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Type must be 'add' or 'subtract'/);
  });

  it("rejects a non-positive or out-of-range amount", async () => {
    const r1 = await postAdjust(userId("v1"), { type: "add", amount: 0, reason: "ok reason" });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/Amount must be a positive number/);

    const r2 = await postAdjust(userId("v1"), { type: "add", amount: 2_000_000, reason: "ok reason" });
    expect(r2.status).toBe(400);
  });

  it("rejects a missing or too-short reason", async () => {
    const r = await postAdjust(userId("v1"), { type: "add", amount: 5, reason: "x" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/reason is required/i);
  });

  it("returns 404 when the user does not exist", async () => {
    const r = await postAdjust("ghost", { type: "add", amount: 5, reason: "valid reason" });
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/User not found/);
  });
});

describe("POST /api/admin/users/:id/balance-adjust — currency gating", () => {
  it("returns 400 with a clear message on a malformed currencyCode (no silent fallback)", async () => {
    fakeUsers.set(userId("c1"), {
      id: userId("c1"), balance: "100", balanceCurrency: "USD",
      multiCurrencyEnabled: true, allowedCurrencies: ["EGP"],
    });
    const r = await postAdjust(userId("c1"), {
      type: "add", amount: 10, reason: "valid reason", currencyCode: "🚫bad🚫",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid currency code/);
  });

  it("returns 400 when targeting a sub-wallet currency that is NOT on the user's allow-list", async () => {
    fakeUsers.set(userId("c2"), {
      id: userId("c2"), balance: "100", balanceCurrency: "USD",
      multiCurrencyEnabled: true, allowedCurrencies: ["SAR"],
    });
    const r = await postAdjust(userId("c2"), {
      type: "add", amount: 10, reason: "valid reason", currencyCode: "EGP",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/EGP is not on this user's allow-list/);
  });

  it("returns 400 when the user is single-currency but caller targets a non-primary code", async () => {
    fakeUsers.set(userId("c3"), {
      id: userId("c3"), balance: "100", balanceCurrency: "USD",
      multiCurrencyEnabled: false, allowedCurrencies: [],
    });
    const r = await postAdjust(userId("c3"), {
      type: "add", amount: 10, reason: "valid reason", currencyCode: "EGP",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not on this user's allow-list/);
  });

  it("HAPPY PATH: an allow-listed sub-wallet credit is forwarded to adjustUserCurrencyBalance with the right currency + sign + allowCreate=true", async () => {
    adjustCalls.length = 0;
    fakeUsers.set(userId("c4"), {
      id: userId("c4"), balance: "100", balanceCurrency: "USD",
      multiCurrencyEnabled: true, allowedCurrencies: ["EGP", "SAR"],
    });
    const r = await postAdjust(userId("c4"), {
      type: "add", amount: 25, reason: "promo top-up", currencyCode: "EGP",
    });
    expect(r.status).toBe(200);
    expect(adjustCalls).toHaveLength(1);
    expect(adjustCalls[0].userId).toBe(userId("c4"));
    expect(adjustCalls[0].currency).toBe("EGP");
    expect(adjustCalls[0].delta).toBeCloseTo(25, 6);
    expect(adjustCalls[0].opts).toMatchObject({ allowCreate: true });
  });

  it("HAPPY PATH: a 'subtract' on an allow-listed sub-wallet sends a negative delta and allowCreate=false (no auto-create on debit)", async () => {
    adjustCalls.length = 0;
    fakeUsers.set(userId("c5"), {
      id: userId("c5"), balance: "100", balanceCurrency: "USD",
      multiCurrencyEnabled: true, allowedCurrencies: ["EGP"],
    });
    const r = await postAdjust(userId("c5"), {
      type: "subtract", amount: 7.5, reason: "fee correction", currencyCode: "EGP",
    });
    expect(r.status).toBe(200);
    expect(adjustCalls).toHaveLength(1);
    expect(adjustCalls[0].currency).toBe("EGP");
    expect(adjustCalls[0].delta).toBeCloseTo(-7.5, 6);
    expect(adjustCalls[0].opts).toMatchObject({ allowCreate: false });
  });

  it("HAPPY PATH: omitting currencyCode targets the user's primary currency", async () => {
    adjustCalls.length = 0;
    fakeUsers.set(userId("c6"), {
      id: userId("c6"), balance: "100", balanceCurrency: "EGP",
      multiCurrencyEnabled: true, allowedCurrencies: ["USD"],
    });
    const r = await postAdjust(userId("c6"), {
      type: "add", amount: 12, reason: "valid reason",
    });
    expect(r.status).toBe(200);
    expect(adjustCalls[0].currency).toBe("EGP");
  });

  it("HAPPY PATH: a lowercase or padded currencyCode is normalized before being validated against the allow-list", async () => {
    adjustCalls.length = 0;
    fakeUsers.set(userId("c7"), {
      id: userId("c7"), balance: "100", balanceCurrency: "USD",
      multiCurrencyEnabled: true, allowedCurrencies: ["EGP"],
    });
    const r = await postAdjust(userId("c7"), {
      type: "add", amount: 5, reason: "valid reason", currencyCode: "  egp  ",
    });
    expect(r.status).toBe(200);
    expect(adjustCalls[0].currency).toBe("EGP");
  });
});
