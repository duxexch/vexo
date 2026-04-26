/**
 * HTTP-level tests for the wallet-conversion route surface (Task #132).
 *
 *   GET  /api/wallet/convert/quote
 *   POST /api/wallet/convert
 *   GET  /api/admin/wallet-conversion/settings
 *   PATCH /api/admin/wallet-conversion/settings
 *   PATCH /api/admin/users/:id/currency-conversion-disabled
 *   POST /api/admin/wallet-conversion/transactions/:id/reverse
 *
 * The pure helper `quoteWalletConversion` is exhaustively unit-tested in
 * `tests/wallet-conversion-quote.test.ts`, and the helper
 * `reverseWalletConversion` has end-to-end DB tests in
 * `tests/wallet-conversion-reverse.test.ts`. This file fills the gap that
 * the route layer (auth, payment-token guard, IP guard, rate limiter,
 * global+per-user kill switches, FX availability, response shape) was
 * previously covered only by manual exercise.
 *
 * Strategy: boot a tiny Express app in-process, mock auth/guards/storage/
 * db/wallet-balances/deposit-fx/notifications/conversion-helpers so we can
 * drive the real handler over HTTP via the global fetch and toggle each
 * gate independently. Mirrors the pattern in
 * `tests/admin-balance-adjust-validation.test.ts`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level state that the mocks read from. Tests mutate `state` to
// flip global toggles, swap the current user, change FX availability, and
// switch helper success/failure outcomes.
// ---------------------------------------------------------------------------
type FakeUser = {
  id: string;
  username: string;
  balance: string;
  balanceCurrency: string;
  multiCurrencyEnabled: boolean;
  allowedCurrencies: string[];
  currencyConversionDisabled?: boolean;
};

type FakeFx = {
  usdRateByCurrency: Record<string, number>;
  operationalCurrencies: string[];
  missingRateCurrencies: string[];
  currencySymbolByCode: Record<string, string>;
};

const state: {
  enabled: string | null;
  feePct: string | null;
  user: FakeUser | null;
  fx: FakeFx;
  executeOutcome:
    | { kind: "ok"; result: any }
    | { kind: "throw"; message: string };
  reverseOutcome:
    | { kind: "ok"; result: any }
    | { kind: "throw"; error: any };
  paymentTokenGuardResponse: { statusCode: number; body: any } | null;
  paymentIpGuardResponse: { statusCode: number; body: any } | null;
  capturedReverseInput: any;
  loggedAdminActions: any[];
  upsertedSettings: Array<{ op: "insert" | "update"; key: string | null; value: string }>;
  perUserToggleUpdates: Array<{ id: string; disabled: boolean }>;
  appSettingsRowExists: boolean;
} = {
  enabled: "true",
  feePct: "0",
  user: null,
  fx: {
    usdRateByCurrency: { USD: 1, EGP: 50, SAR: 3.75 },
    operationalCurrencies: ["USD", "EGP", "SAR"],
    missingRateCurrencies: [],
    currencySymbolByCode: { USD: "$", EGP: "£", SAR: "﷼" },
  },
  executeOutcome: {
    kind: "ok",
    result: {
      fromTransactionId: "tx-from-1",
      toTransactionId: "tx-to-1",
      quote: {
        fromCurrency: "EGP",
        toCurrency: "SAR",
        fromAmount: 500,
        amountUsd: 10,
        grossToAmount: 37.5,
        feePct: 0,
        feeAmount: 0,
        netToAmount: 37.5,
        fromToUsdRate: 0.02,
        usdToTargetRate: 3.75,
      },
      fromBalanceAfter: 500,
      toBalanceAfter: 37.5,
    },
  },
  reverseOutcome: {
    kind: "ok",
    result: {
      reversedSourceLegId: "src-leg-1",
      reversedDestinationLegId: "dst-leg-1",
      newSourceCreditLegId: "new-src-1",
      newDestinationDebitLegId: "new-dst-1",
      sourceCurrency: "USD",
      destinationCurrency: "EGP",
      sourceAmount: 100,
      destinationAmount: 5000,
      sourceBalanceAfter: 1000,
      destinationBalanceAfter: 0,
    },
  },
  paymentTokenGuardResponse: null,
  paymentIpGuardResponse: null,
  capturedReverseInput: null,
  loggedAdminActions: [],
  upsertedSettings: [],
  perUserToggleUpdates: [],
  appSettingsRowExists: false,
};

// ---------------------------------------------------------------------------
// Module mocks. All are hoisted by Vitest before the route module is imported.
// ---------------------------------------------------------------------------

vi.mock("../server/routes/middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = state.user ? { id: state.user.id, username: state.user.username } : undefined;
    next();
  },
  sensitiveRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../server/admin-routes/helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/admin-routes/helpers")>();
  return {
    ...actual,
    adminAuthMiddleware: (req: any, _res: any, next: any) => {
      req.admin = { id: "admin-1", username: "admin", role: "admin" };
      next();
    },
    logAdminAction: async (
      adminId: string,
      action: string,
      entityType: string,
      entityId: string,
      details: any,
    ) => {
      state.loggedAdminActions.push({ adminId, action, entityType, entityId, details });
    },
  };
});

vi.mock("../server/lib/payment-security", () => ({
  paymentIpGuard: (_op: string) => async (_req: any, res: any, next: any) => {
    if (state.paymentIpGuardResponse) {
      return res.status(state.paymentIpGuardResponse.statusCode).json(state.paymentIpGuardResponse.body);
    }
    next();
  },
  paymentOperationTokenGuard: (_op: string) => async (_req: any, res: any, next: any) => {
    if (state.paymentTokenGuardResponse) {
      return res.status(state.paymentTokenGuardResponse.statusCode).json(state.paymentTokenGuardResponse.body);
    }
    next();
  },
}));

vi.mock("../server/websocket", () => ({
  sendNotification: async () => undefined,
}));

vi.mock("../server/storage", () => ({
  storage: {
    getUser: async (id: string) => (state.user && state.user.id === id ? state.user : null),
  },
}));

vi.mock("../server/lib/wallet-balances", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/lib/wallet-balances")>();
  return {
    ...actual,
    // Used by the /settings endpoint. Returns a tiny summary derived from
    // the current fake user.
    getUserWalletSummary: async (id: string) => {
      if (!state.user || state.user.id !== id) return null;
      const wallets = state.user.allowedCurrencies.map((code) => ({
        currency: code,
        balance: code === state.user!.balanceCurrency ? state.user!.balance : "0.00",
      }));
      return {
        primaryCurrency: state.user.balanceCurrency,
        multiCurrencyEnabled: state.user.multiCurrencyEnabled,
        allowedCurrencies: state.user.allowedCurrencies,
        wallets,
      };
    },
    // Real `getEffectiveAllowedCurrencies` includes the primary currency
    // plus the user's allow-list; we keep the real impl by re-exporting
    // `actual` first so this only overrides the named functions above.
  };
});

vi.mock("../server/lib/deposit-fx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/lib/deposit-fx")>();
  return {
    ...actual,
    getDepositFxSnapshot: async (_currencies: string[]) => state.fx,
  };
});

vi.mock("../server/lib/currency-conversion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/lib/currency-conversion")>();
  return {
    ...actual,
    // Keep `quoteWalletConversion` real so the route's quote endpoint
    // exercises the real math. Only mock the helpers that touch the DB.
    executeWalletConversion: async (_input: any) => {
      if (state.executeOutcome.kind === "throw") {
        throw new Error(state.executeOutcome.message);
      }
      return state.executeOutcome.result;
    },
    reverseWalletConversion: async (input: any) => {
      state.capturedReverseInput = input;
      if (state.reverseOutcome.kind === "throw") {
        throw state.reverseOutcome.error;
      }
      return state.reverseOutcome.result;
    },
  };
});

// `db` is used by loadGlobalSettings (read app_settings),
// upsertSetting (read/write app_settings), and the per-user toggle
// route (read/update users). Provide a chainable mock that branches on
// the table reference.
vi.mock("../server/db", async () => {
  const schema = await import("@shared/schema");
  const { appSettings, users } = schema as any;

  function selectChainWithExisting(table: any) {
    return {
      from: (_t: any) => ({
        where: (_cond: any) => {
          const rows =
            table === appSettings
              ? [
                  { key: "wallet_conversion.enabled", value: state.enabled },
                  { key: "wallet_conversion.fee_pct", value: state.feePct },
                ]
              : [];
          const promise: any = Promise.resolve(rows);
          promise.limit = (_n: number) => {
            // upsertSetting calls .limit(1) on appSettings to decide
            // update-vs-insert; respect `state.appSettingsRowExists` so
            // tests can drive both branches.
            if (table === appSettings) {
              return Promise.resolve(state.appSettingsRowExists ? [{ id: "row-1" }] : []);
            }
            if (table === users && state.user) {
              return Promise.resolve([{ id: state.user.id }]);
            }
            return Promise.resolve([]);
          };
          return promise;
        },
      }),
    };
  }

  const dbMock = {
    select: (..._cols: any[]) => ({
      from: (table: any) => selectChainWithExisting(table).from(table),
    }),
    insert: (table: any) => ({
      values: async (vals: any) => {
        if (table === appSettings) {
          state.upsertedSettings.push({ op: "insert", key: vals.key, value: vals.value });
        }
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => ({
        where: async (_cond: any) => {
          if (table === appSettings) {
            state.upsertedSettings.push({ op: "update", key: null, value: vals.value });
          }
          if (table === users && typeof vals.currencyConversionDisabled === "boolean") {
            // Capture the actual route param target via the WHERE clause
            // would be ideal, but Drizzle conditions are opaque. The route
            // proves the param is plumbed through by also reading via
            // select+limit(1) above; here we just record the flip.
            state.perUserToggleUpdates.push({
              id: state.user?.id ?? "(unknown)",
              disabled: vals.currencyConversionDisabled,
            });
          }
        },
      }),
    }),
  };

  return { db: dbMock };
});

// ---------------------------------------------------------------------------
// Boot the express app once. Routes are imported AFTER mocks are declared.
// ---------------------------------------------------------------------------
import express from "express";
import { registerWalletConversionRoutes } from "../server/routes/payments/wallet-conversion-routes";
import { WalletConversionReversalError } from "../server/lib/currency-conversion";

let server: any;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerWalletConversionRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  state.enabled = "true";
  state.feePct = "0";
  state.user = {
    id: "user-1",
    username: "alice",
    balance: "1000.00",
    balanceCurrency: "USD",
    multiCurrencyEnabled: true,
    allowedCurrencies: ["USD", "EGP", "SAR"],
    currencyConversionDisabled: false,
  };
  state.fx = {
    usdRateByCurrency: { USD: 1, EGP: 50, SAR: 3.75 },
    operationalCurrencies: ["USD", "EGP", "SAR"],
    missingRateCurrencies: [],
    currencySymbolByCode: { USD: "$", EGP: "£", SAR: "﷼" },
  };
  state.executeOutcome = {
    kind: "ok",
    result: {
      fromTransactionId: "tx-from-1",
      toTransactionId: "tx-to-1",
      quote: {
        fromCurrency: "EGP",
        toCurrency: "SAR",
        fromAmount: 500,
        amountUsd: 10,
        grossToAmount: 37.5,
        feePct: 0,
        feeAmount: 0,
        netToAmount: 37.5,
        fromToUsdRate: 0.02,
        usdToTargetRate: 3.75,
      },
      fromBalanceAfter: 500,
      toBalanceAfter: 37.5,
    },
  };
  state.reverseOutcome = {
    kind: "ok",
    result: {
      reversedSourceLegId: "src-leg-1",
      reversedDestinationLegId: "dst-leg-1",
      newSourceCreditLegId: "new-src-1",
      newDestinationDebitLegId: "new-dst-1",
      sourceCurrency: "USD",
      destinationCurrency: "EGP",
      sourceAmount: 100,
      destinationAmount: 5000,
      sourceBalanceAfter: 1000,
      destinationBalanceAfter: 0,
    },
  };
  state.paymentIpGuardResponse = null;
  state.paymentTokenGuardResponse = null;
  state.capturedReverseInput = null;
  state.loggedAdminActions = [];
  state.upsertedSettings = [];
  state.perUserToggleUpdates = [];
  state.appSettingsRowExists = false;
});

// ---------------------------------------------------------------------------
// Test helpers.
// ---------------------------------------------------------------------------

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

async function patchJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

// ===========================================================================
// POST /api/wallet/convert
// ===========================================================================
describe("POST /api/wallet/convert", () => {
  it("happy path returns 200 with the formatted result and notifies the user", async () => {
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/successfully/i);
    expect(r.body.fromTransactionId).toBe("tx-from-1");
    expect(r.body.toTransactionId).toBe("tx-to-1");
    expect(r.body.quote.fromCurrency).toBe("EGP");
    expect(r.body.quote.toCurrency).toBe("SAR");
    // Numbers are returned as zero-padded strings.
    expect(r.body.fromBalanceAfter).toBe("500.00");
    expect(r.body.toBalanceAfter).toBe("37.50");
  });

  it("returns 403 with CONVERSION_GLOBALLY_DISABLED when the global toggle is off", async () => {
    state.enabled = "false";
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("CONVERSION_GLOBALLY_DISABLED");
  });

  it("returns 403 with CONVERSION_USER_DISABLED when the per-user kill switch is set", async () => {
    state.user!.currencyConversionDisabled = true;
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("CONVERSION_USER_DISABLED");
  });

  it("returns 403 with MULTI_CURRENCY_DISABLED when the user is single-currency", async () => {
    state.user!.multiCurrencyEnabled = false;
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("MULTI_CURRENCY_DISABLED");
  });

  it("returns 400 when source and destination currencies are equal", async () => {
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "EGP",
      amount: 500,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/must differ/i);
  });

  it("returns 400 when amount is missing or non-positive", async () => {
    const r1 = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 0,
    });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/positive number/i);

    const r2 = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: -10,
    });
    expect(r2.status).toBe(400);
  });

  it("returns 400 when the requested currency is not on the user's allow-list", async () => {
    state.user!.allowedCurrencies = ["USD"]; // primary only
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("WALLET_NOT_ALLOWED");
  });

  it("returns 400 with RATE_UNAVAILABLE when FX is missing one of the two currencies", async () => {
    state.fx = {
      usdRateByCurrency: { USD: 1, EGP: 50 },
      operationalCurrencies: ["USD", "EGP"], // SAR missing
      missingRateCurrencies: ["SAR"],
      currencySymbolByCode: { USD: "$", EGP: "£" },
    };
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("RATE_UNAVAILABLE");
  });

  it("maps INSUFFICIENT-balance throws from the helper to 400 INSUFFICIENT_BALANCE", async () => {
    state.executeOutcome = { kind: "throw", message: "Insufficient EGP balance" };
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INSUFFICIENT_BALANCE");
    expect(r.body.error).toMatch(/Insufficient/);
  });

  it("maps an oversized amount (above the user's balance) to 400 INSUFFICIENT_BALANCE", async () => {
    // The route has no hard upper cap; oversize is detected inside
    // `executeWalletConversion` → `adjustUserCurrencyBalance`, which throws
    // "Insufficient X balance". The route catches /^Insufficient/ and
    // surfaces it as 400 INSUFFICIENT_BALANCE for the client.
    state.executeOutcome = { kind: "throw", message: "Insufficient EGP balance" };
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 9_999_999_999, // far above the seeded 1000 USD balance
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("returns 401 when the payment-operation-token guard rejects a missing token", async () => {
    state.paymentTokenGuardResponse = {
      statusCode: 401,
      body: { error: "Missing payment operation token", errorCode: "PAYMENT_TOKEN_MISSING" },
    };
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(401);
    expect(r.body.errorCode).toBe("PAYMENT_TOKEN_MISSING");
  });

  it("returns 403 when the payment-operation-token guard rejects an invalid token", async () => {
    state.paymentTokenGuardResponse = {
      statusCode: 403,
      body: { error: "Invalid payment operation token", errorCode: "PAYMENT_TOKEN_INVALID" },
    };
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(403);
    expect(r.body.errorCode).toBe("PAYMENT_TOKEN_INVALID");
  });

  it("returns 403 when the IP guard blocks the request", async () => {
    state.paymentIpGuardResponse = {
      statusCode: 403,
      body: { error: "This IP is blocked", errorCode: "PAYMENT_IP_BLOCKED" },
    };
    const r = await postJson("/api/wallet/convert", {
      fromCurrency: "EGP",
      toCurrency: "SAR",
      amount: 500,
    });
    expect(r.status).toBe(403);
    expect(r.body.errorCode).toBe("PAYMENT_IP_BLOCKED");
  });
});

// ===========================================================================
// GET /api/wallet/convert/settings — smoke
// ===========================================================================
describe("GET /api/wallet/convert/settings", () => {
  it("returns the merged global + per-user view on the happy path", async () => {
    state.enabled = "true";
    state.feePct = "1.5";
    const r = await getJson("/api/wallet/convert/settings");
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(true);
    expect(r.body.feePct).toBeCloseTo(1.5, 2);
    expect(r.body.userDisabled).toBe(false);
    expect(r.body.multiCurrencyEnabled).toBe(true);
    expect(r.body.primaryCurrency).toBe("USD");
    expect(r.body.eligibleCurrencies).toEqual(expect.arrayContaining(["USD", "EGP", "SAR"]));
    expect(r.body.balances).toEqual(
      expect.objectContaining({ USD: "1000.00", EGP: "0.00", SAR: "0.00" }),
    );
  });

  it("surfaces the per-user kill switch in the response", async () => {
    state.user!.currencyConversionDisabled = true;
    const r = await getJson("/api/wallet/convert/settings");
    expect(r.status).toBe(200);
    expect(r.body.userDisabled).toBe(true);
  });

  it("filters out currencies that have no FX rate from `eligibleCurrencies`", async () => {
    state.fx = {
      usdRateByCurrency: { USD: 1, EGP: 50 },
      operationalCurrencies: ["USD", "EGP"], // SAR missing
      missingRateCurrencies: ["SAR"],
      currencySymbolByCode: { USD: "$", EGP: "£" },
    };
    const r = await getJson("/api/wallet/convert/settings");
    expect(r.status).toBe(200);
    expect(r.body.eligibleCurrencies).toEqual(expect.arrayContaining(["USD", "EGP"]));
    expect(r.body.eligibleCurrencies).not.toContain("SAR");
    expect(r.body.missingRateCurrencies).toEqual(["SAR"]);
  });
});

describe("GET /api/wallet/convert/quote", () => {
  it("returns a quote on the happy path", async () => {
    const r = await getJson("/api/wallet/convert/quote?from=EGP&to=SAR&amount=500");
    expect(r.status).toBe(200);
    expect(r.body.fromCurrency).toBe("EGP");
    expect(r.body.toCurrency).toBe("SAR");
    expect(r.body.fromAmount).toBe(500);
    expect(r.body.netToAmount).toBeCloseTo(37.5, 2);
  });

  it("rejects when from === to with 400", async () => {
    const r = await getJson("/api/wallet/convert/quote?from=EGP&to=EGP&amount=500");
    expect(r.status).toBe(400);
  });

  it("rejects with 400 when amount is missing", async () => {
    const r = await getJson("/api/wallet/convert/quote?from=EGP&to=SAR");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/positive number/i);
  });

  it("returns 403 with CONVERSION_GLOBALLY_DISABLED when the toggle is off", async () => {
    state.enabled = "false";
    const r = await getJson("/api/wallet/convert/quote?from=EGP&to=SAR&amount=500");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("CONVERSION_GLOBALLY_DISABLED");
  });
});

// ===========================================================================
// Admin endpoints — smoke
// ===========================================================================
describe("Admin wallet-conversion endpoints", () => {
  it("GET /api/admin/wallet-conversion/settings returns the current global config", async () => {
    state.enabled = "true";
    state.feePct = "1.5";
    const r = await getJson("/api/admin/wallet-conversion/settings");
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(true);
    expect(r.body.feePct).toBeCloseTo(1.5, 2);
  });

  it("PATCH /api/admin/wallet-conversion/settings rejects a non-boolean enabled", async () => {
    const r = await patchJson("/api/admin/wallet-conversion/settings", { enabled: "yes" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/`enabled` must be a boolean/);
  });

  it("PATCH /api/admin/wallet-conversion/settings rejects feePct out of range", async () => {
    const r = await patchJson("/api/admin/wallet-conversion/settings", { feePct: 150 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/`feePct` must be a number between 0 and 100/);
  });

  it("PATCH /api/admin/wallet-conversion/settings INSERTs both rows when no setting exists yet", async () => {
    state.appSettingsRowExists = false;
    const r = await patchJson("/api/admin/wallet-conversion/settings", {
      enabled: false,
      feePct: 2,
    });
    expect(r.status).toBe(200);
    // Both keys must take the insert branch.
    expect(state.upsertedSettings).toEqual(
      expect.arrayContaining([
        { op: "insert", key: "wallet_conversion.enabled", value: "false" },
        { op: "insert", key: "wallet_conversion.fee_pct", value: "2" },
      ]),
    );
    expect(state.upsertedSettings.every((s) => s.op === "insert")).toBe(true);
    expect(state.loggedAdminActions[0]?.action).toBe("wallet_conversion_settings_update");
  });

  it("PATCH /api/admin/wallet-conversion/settings UPDATEs existing rows when they exist", async () => {
    state.appSettingsRowExists = true;
    const r = await patchJson("/api/admin/wallet-conversion/settings", {
      enabled: false,
      feePct: 2,
    });
    expect(r.status).toBe(200);
    // Both keys must take the update branch (no inserts).
    expect(state.upsertedSettings.every((s) => s.op === "update")).toBe(true);
    expect(state.upsertedSettings.map((s) => s.value).sort()).toEqual(["2", "false"]);
  });

  it("PATCH /api/admin/users/:id/currency-conversion-disabled rejects non-boolean disabled", async () => {
    const r = await patchJson("/api/admin/users/user-1/currency-conversion-disabled", {
      disabled: "true",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/disabled.*boolean/i);
  });

  it("PATCH /api/admin/users/:id/currency-conversion-disabled flips the flag and audits", async () => {
    const r = await patchJson("/api/admin/users/user-1/currency-conversion-disabled", {
      disabled: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.currencyConversionDisabled).toBe(true);
    expect(state.perUserToggleUpdates).toEqual([{ id: "user-1", disabled: true }]);
    expect(state.loggedAdminActions[0]?.action).toBe("user_currency_conversion_toggle");
  });

  it("POST /api/admin/wallet-conversion/transactions/:id/reverse rejects an empty reason", async () => {
    const r = await postJson(
      "/api/admin/wallet-conversion/transactions/some-tx/reverse",
      { reason: "   " },
    );
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/reason/i);
    expect(state.capturedReverseInput).toBeNull();
  });

  it("POST /api/admin/wallet-conversion/transactions/:id/reverse forwards reason and audits success", async () => {
    const r = await postJson(
      "/api/admin/wallet-conversion/transactions/some-tx/reverse",
      { reason: "Refund per ticket #42" },
    );
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/reversed successfully/i);
    expect(state.capturedReverseInput).toMatchObject({
      transactionId: "some-tx",
      adminId: "admin-1",
      reason: "Refund per ticket #42",
    });
    const audit = state.loggedAdminActions[0];
    expect(audit?.action).toBe("wallet_conversion_reverse");
    expect(audit?.details?.reason).toBe("Refund per ticket #42");
  });

  it("POST /api/admin/wallet-conversion/transactions/:id/reverse maps WalletConversionReversalError to its statusCode + code", async () => {
    state.reverseOutcome = {
      kind: "throw",
      error: new WalletConversionReversalError(
        "ALREADY_REVERSED",
        "This conversion has already been reversed",
        409,
      ),
    };
    const r = await postJson(
      "/api/admin/wallet-conversion/transactions/some-tx/reverse",
      { reason: "second attempt" },
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ALREADY_REVERSED");
    expect(r.body.error).toMatch(/already been reversed/);
  });
});
