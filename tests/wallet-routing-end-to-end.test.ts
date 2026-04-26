/**
 * End-to-end wallet-routing coverage (Task #127).
 *
 * Tournament entry fees, P2P escrow, refunds, and prize payouts now route
 * through `adjustUserCurrencyBalance` with a stored `walletCurrency` per
 * participant / offer / trade. These tests lock in the routing decision
 * (which wallet currency is debited / credited) made by:
 *   - POST   /api/tournaments/:id/register
 *   - DELETE /api/tournaments/:id/register
 *   - createP2PTradeAtomic (escrow debit on the seller's chosen wallet)
 *   - completeP2PTradeAtomic (release credit on the buyer's matching wallet)
 *   - cancelP2PTradeAtomic (escrow refund back to the seller's wallet)
 *   - resolveP2PDisputedTradeAtomic (winner gets the right wallet)
 *
 * The wallet-helper itself is exhaustively tested in
 * `tests/wallet-balances.test.ts` against a row-level mocked Drizzle
 * transaction. Here we spy on `adjustUserCurrencyBalance` so we can
 * assert WHICH (userId, currencyCode, signedDelta) the production
 * code passes through it — that is the routing decision the user
 * cares about. Combined with the wallet-balances suite, these two
 * files together cover every leg of the multi-currency money path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mutable state for the fake Drizzle tx. Each test resets it via
// `setTxState(...)` in beforeEach so spies + state are isolated per test.
// ---------------------------------------------------------------------------

interface TxState {
  users: Record<string, any>;
  tournaments: Record<string, any>;
  participants: Record<string, any[]>; // tournamentId -> participant rows
  offers: Record<string, any>;
  trades: Record<string, any>;
  traderProfiles: Record<string, any>;
  projectWallets: Record<string, any>;
  subWallets: Record<string, any>; // `${userId}:${code}` -> {balance}
}

let state: TxState;
const inserts: Array<{ table: string; values: any }> = [];
const updates: Array<{ table: string; set: any; whereParams: unknown[] }> = [];
const deletes: Array<{ table: string; whereParams: unknown[]; returnedRows: any[] }> = [];

function resetTx(initial: Partial<TxState> = {}) {
  state = {
    users: { ...(initial.users ?? {}) },
    tournaments: { ...(initial.tournaments ?? {}) },
    participants: { ...(initial.participants ?? {}) },
    offers: { ...(initial.offers ?? {}) },
    trades: { ...(initial.trades ?? {}) },
    traderProfiles: { ...(initial.traderProfiles ?? {}) },
    projectWallets: { ...(initial.projectWallets ?? {}) },
    subWallets: { ...(initial.subWallets ?? {}) },
  };
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
}

function tableName(table: unknown): string {
  if (!table || typeof table !== "object") return "unknown";
  const sym = Object.getOwnPropertySymbols(table as object).find((s) =>
    s.toString().includes("Symbol(drizzle:Name)"),
  );
  if (sym) return (table as Record<symbol, unknown>)[sym] as string;
  return "unknown";
}

/**
 * Walks a Drizzle SQL predicate tree and pulls every Param literal out so
 * the fake select / update / delete chain can locate the targeted row by
 * primary key (or compound key) without re-implementing Drizzle's
 * predicate language.
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

function makeTx() {
  function makeSelect(columns?: any) {
    let currentTable = "";
    let currentWhereParams: unknown[] = [];
    let currentLimit: number | null = null;

    const resolveRows = (): unknown[] => {
      switch (currentTable) {
        case "users": {
          const userId = currentWhereParams.find((p) => typeof p === "string") as string | undefined;
          const u = userId ? state.users[userId] : null;
          return u ? [u] : [];
        }
        case "tournaments": {
          for (const p of currentWhereParams) {
            if (typeof p === "string" && state.tournaments[p]) return [state.tournaments[p]];
          }
          return [];
        }
        case "tournament_participants": {
          // Determine targeted tournament + (optional) user from where params
          let tournamentId: string | null = null;
          let userId: string | null = null;
          for (const p of currentWhereParams) {
            if (typeof p !== "string") continue;
            if (state.tournaments[p]) tournamentId = p;
            else if (state.users[p]) userId = p;
          }
          if (!tournamentId) return [];
          const list = state.participants[tournamentId] ?? [];
          if (columns && "count" in columns) {
            return [{ count: list.length }];
          }
          if (userId) return list.filter((row) => row.userId === userId);
          return list;
        }
        case "p2p_offers": {
          for (const p of currentWhereParams) {
            if (typeof p === "string" && state.offers[p]) return [state.offers[p]];
          }
          return [];
        }
        case "p2p_trades": {
          for (const p of currentWhereParams) {
            if (typeof p === "string" && state.trades[p]) return [state.trades[p]];
          }
          if (columns && "total" in columns) return [{ total: "0" }];
          return [];
        }
        case "p2p_trader_profiles": {
          for (const p of currentWhereParams) {
            if (typeof p === "string" && state.traderProfiles[p]) {
              return [state.traderProfiles[p]];
            }
          }
          return [];
        }
        case "user_badges": {
          // The query joins user_badges + badge_catalog and aggregates with
          // bool_or / max — return one synthetic empty-aggregate row so the
          // route's destructure (`const [badgeEntitlements] = ...`) succeeds.
          return [{ grantsP2pPrivileges: false, maxP2PMonthlyLimit: null }];
        }
        case "project_currency_wallets": {
          for (const p of currentWhereParams) {
            if (typeof p === "string" && state.projectWallets[p]) {
              return [state.projectWallets[p]];
            }
          }
          return [];
        }
        case "user_currency_wallets": {
          // Compound key: (userId, currencyCode). Try every pair.
          for (const u of currentWhereParams) {
            if (typeof u !== "string") continue;
            for (const c of currentWhereParams) {
              if (typeof c !== "string" || c === u) continue;
              const key = `${u}:${c}`;
              if (state.subWallets[key]) return [state.subWallets[key]];
            }
          }
          return [];
        }
        default:
          return [];
      }
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
      innerJoin(_table: unknown, _on: unknown) {
        return chain;
      },
      for(_mode: string) {
        return chain;
      },
      limit(n: number) {
        currentLimit = n;
        return chain;
      },
      then(resolve: (rows: unknown[]) => void, reject: (err: unknown) => void) {
        try {
          let rows = resolveRows();
          if (currentLimit !== null) rows = rows.slice(0, currentLimit);
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      },
    };
    return chain;
  }

  function applyInsert(name: string, values: any): any {
    const id = `id-ins-${inserts.length}`;
    const row = { id, ...values };
    if (name === "tournament_participants") {
      const list = state.participants[values.tournamentId] ?? [];
      list.push(row);
      state.participants[values.tournamentId] = list;
    } else if (name === "p2p_trades") {
      state.trades[id] = row;
    } else if (name === "project_currency_wallets") {
      // upsert-style: only set if not already present
      if (!state.projectWallets[values.userId]) {
        state.projectWallets[values.userId] = row;
      }
    }
    return row;
  }

  function applyDelete(name: string, whereParams: unknown[]): any[] {
    if (name === "tournament_participants") {
      let tournamentId: string | null = null;
      let userId: string | null = null;
      for (const p of whereParams) {
        if (typeof p !== "string") continue;
        if (state.tournaments[p]) tournamentId = p;
        else if (state.users[p]) userId = p;
      }
      if (!tournamentId || !userId) return [];
      const list = state.participants[tournamentId] ?? [];
      const removed: any[] = [];
      const remaining = list.filter((row) => {
        if (row.userId === userId) {
          removed.push(row);
          return false;
        }
        return true;
      });
      state.participants[tournamentId] = remaining;
      return removed;
    }
    return [];
  }

  return {
    select(columns?: any) {
      return makeSelect(columns);
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(values: Record<string, unknown>) {
          return {
            where(predicate: unknown) {
              const wp = collectParamValues(predicate);
              updates.push({ table: name, set: values, whereParams: wp });
              // Apply update to in-memory state so a subsequent `.returning()`
              // can hand back the merged row (the trade-settle paths chain
              // `.update(...).set(...).where(...).returning()` to read the
              // updated trade back).
              let updatedRow: any = { ...values };
              if (name === "p2p_trades") {
                for (const p of wp) {
                  if (typeof p === "string" && state.trades[p]) {
                    state.trades[p] = { ...state.trades[p], ...values };
                    updatedRow = { ...state.trades[p] };
                    break;
                  }
                }
              }
              const result: any = Promise.resolve(undefined);
              result.returning = () => Promise.resolve([updatedRow]);
              return result;
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
          const row = applyInsert(name, values);
          // Both `.returning()` and `.onConflictDoNothing()` (with or without
          // a chained `.returning()`) need to be awaitable.
          const conflict: any = Promise.resolve(undefined);
          conflict.returning = () => Promise.resolve([row]);
          return {
            returning() {
              return Promise.resolve([row]);
            },
            onConflictDoNothing() {
              return conflict;
            },
          };
        },
      };
    },
    delete(table: unknown) {
      const name = tableName(table);
      return {
        where(predicate: unknown) {
          const wp = collectParamValues(predicate);
          const removed = applyDelete(name, wp);
          deletes.push({ table: name, whereParams: wp, returnedRows: removed });
          return {
            returning() {
              return Promise.resolve(removed);
            },
          };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Module mocks. Order matters: register them BEFORE importing the units
// under test so the mocked exports are picked up by the real modules.
// ---------------------------------------------------------------------------

vi.mock("../server/db", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = makeTx();
      return await fn(tx);
    }),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../server/lib/wallet-balances", async () => {
  const actual = await vi.importActual<typeof import("../server/lib/wallet-balances")>(
    "../server/lib/wallet-balances",
  );
  return {
    ...actual,
    adjustUserCurrencyBalance: vi.fn(),
  };
});

vi.mock("../server/lib/user-badge-entitlements", async () => {
  const actual = await vi.importActual<
    typeof import("../server/lib/user-badge-entitlements")
  >("../server/lib/user-badge-entitlements");
  return {
    ...actual,
    // Force null monthly limit so the trade-create path skips the
    // monthly-usage SUM query (which we don't simulate).
    resolveEffectiveP2PMonthlyLimit: vi.fn(() => null),
  };
});

vi.mock("../server/websocket", () => ({
  sendNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../server/routes/middleware", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next?.(),
  sensitiveRateLimiter: (_req: any, _res: any, next: any) => next?.(),
}));

// Avoid kicking off the real auto-start work after a successful register.
vi.mock("../server/lib/tournament-utils", async () => {
  const actual = await vi.importActual<typeof import("../server/lib/tournament-utils")>(
    "../server/lib/tournament-utils",
  );
  return {
    ...actual,
    tryAutoStartTournament: vi.fn(async () => ({ success: false })),
  };
});

import * as walletBalancesModule from "../server/lib/wallet-balances";
import { registerTournamentRegistrationRoutes } from "../server/routes/tournaments/registration";
import { createP2PTradeAtomic } from "../server/storage/p2p/trade-create-atomic";
import {
  completeP2PTradeAtomic,
  cancelP2PTradeAtomic,
  resolveP2PDisputedTradeAtomic,
} from "../server/storage/p2p/trade-settle-atomic";

const mockAdjust = walletBalancesModule.adjustUserCurrencyBalance as unknown as ReturnType<typeof vi.fn>;

/**
 * Default impl for the wallet-balance spy: routes "is primary" off the
 * primary-currency stored on `state.users[userId]`. Each test can override
 * via mockImplementationOnce when it needs to simulate failure.
 */
function defaultAdjustImpl() {
  mockAdjust.mockImplementation(async (_tx, userId, currency, delta) => {
    const u = state.users[userId];
    const primary = (u?.balanceCurrency ?? "USD").toUpperCase();
    const code = currency === null || currency === undefined
      ? primary
      : String(currency).toUpperCase();
    const isPrimary = code === primary;
    return {
      currency: code,
      isPrimary,
      balanceBefore: 1000,
      balanceAfter: 1000 + Number(delta),
      walletId: isPrimary ? undefined : `wallet-${code}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Tournament route handlers — captured at import time via a fake Express app.
// ---------------------------------------------------------------------------

const tournamentHandlers: Record<string, Function> = {};
function captureTournamentRoutes() {
  const fakeApp: any = {
    post(path: string, ..._handlers: any[]) {
      tournamentHandlers[`POST ${path}`] = _handlers[_handlers.length - 1];
    },
    delete(path: string, ..._handlers: any[]) {
      tournamentHandlers[`DELETE ${path}`] = _handlers[_handlers.length - 1];
    },
  };
  registerTournamentRegistrationRoutes(fakeApp);
}
captureTournamentRoutes();

function makeRes() {
  const captured: { status: number; json?: unknown } = { status: 200 };
  const res: any = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.json = body;
      return res;
    },
  };
  return { res, captured };
}

async function callRoute(
  method: "POST" | "DELETE",
  path: string,
  req: { params: Record<string, string>; body?: any; user: { id: string } },
) {
  const handler = tournamentHandlers[`${method} ${path}`];
  if (!handler) throw new Error(`No handler captured for ${method} ${path}`);
  const { res, captured } = makeRes();
  await handler({ ...req, body: req.body ?? {} }, res);
  return captured;
}

beforeEach(() => {
  resetTx();
  mockAdjust.mockReset();
  defaultAdjustImpl();
});

// ---------------------------------------------------------------------------
// Tournament wallet-routing tests
// ---------------------------------------------------------------------------

describe("Tournament register: wallet routing", () => {
  it("routes the entry-fee debit to the chosen EUR sub-wallet (primary USD untouched) and stamps walletCurrency on the participant", async () => {
    const tournamentId = "t-1";
    const userId = "u-multi";
    resetTx({
      users: {
        [userId]: {
          id: userId,
          balance: "500.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: "Cup",
          nameAr: "كأس",
          status: "registration",
          maxPlayers: 16,
          entryFee: "10.00",
          currency: "usd",
          registrationStartsAt: null,
          registrationEndsAt: null,
          startsAt: null,
          shareSlug: null,
          prizePool: "0.00",
        },
      },
      subWallets: {
        [`${userId}:EUR`]: {
          id: "w-eur",
          userId,
          currencyCode: "EUR",
          balance: "200.00",
          totalDeposited: "200.00",
          totalWithdrawn: "0.00",
        },
      },
    });
    defaultAdjustImpl();

    const result = await callRoute("POST", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      body: { walletCurrency: "EUR" },
      user: { id: userId },
    });

    expect(result.status).toBe(200);
    // Wallet helper saw EUR as the chosen currency, not the primary USD.
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(userId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(-10, 2);
    // No call ever targeted the primary USD wallet.
    const usdCalls = mockAdjust.mock.calls.filter((c: any[]) => c[2] === "USD");
    expect(usdCalls).toHaveLength(0);
    // Participant row carries the chosen wallet so refunds/payouts stay symmetric.
    const participantInsert = inserts.find((i) => i.table === "tournament_participants");
    expect(participantInsert?.values.walletCurrency).toBe("EUR");
  });

  it("regression: a single-currency user with no wallet picker still hits the primary balance and stores walletCurrency = null", async () => {
    const tournamentId = "t-2";
    const userId = "u-single";
    resetTx({
      users: {
        [userId]: {
          id: userId,
          balance: "100.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: false,
          allowedCurrencies: [],
        },
      },
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: "Cup",
          nameAr: "كأس",
          status: "registration",
          maxPlayers: 16,
          entryFee: "5.00",
          currency: "usd",
          registrationStartsAt: null,
          registrationEndsAt: null,
          startsAt: null,
          shareSlug: null,
          prizePool: "0.00",
        },
      },
    });
    defaultAdjustImpl();

    const result = await callRoute("POST", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      body: {}, // no walletCurrency
      user: { id: userId },
    });

    expect(result.status).toBe(200);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, , currency] = mockAdjust.mock.calls[0];
    // Primary path: route resolves to the user's primary currency code.
    expect(currency).toBe("USD");
    // Participant row stays NULL so existing single-currency rows are unaffected.
    const participantInsert = inserts.find((i) => i.table === "tournament_participants");
    expect(participantInsert?.values.walletCurrency).toBeNull();
  });
});

describe("Tournament unregister: wallet routing", () => {
  it("refunds the entry fee back to the EUR sub-wallet recorded on the participant row (primary USD untouched)", async () => {
    const tournamentId = "t-3";
    const userId = "u-multi";
    resetTx({
      users: {
        [userId]: {
          id: userId,
          balance: "500.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: "Cup",
          nameAr: "كأس",
          status: "registration",
          maxPlayers: 16,
          entryFee: "10.00",
          currency: "usd",
          registrationStartsAt: null,
          registrationEndsAt: null,
          startsAt: null,
          shareSlug: null,
          prizePool: "10.00",
        },
      },
      participants: {
        [tournamentId]: [
          { id: "p-1", tournamentId, userId, seed: 1, walletCurrency: "EUR" },
        ],
      },
    });
    defaultAdjustImpl();

    const result = await callRoute("DELETE", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      user: { id: userId },
    });

    expect(result.status).toBe(200);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(userId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(10, 2);
    // No wallet-helper call ever debited or credited USD.
    expect(mockAdjust.mock.calls.filter((c: any[]) => c[2] === "USD")).toHaveLength(0);
  });

  it("regression: when a single-currency participant unregisters, the refund flows through the legacy primary-balance path (currency = null)", async () => {
    const tournamentId = "t-4";
    const userId = "u-single";
    resetTx({
      users: {
        [userId]: {
          id: userId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: false,
          allowedCurrencies: [],
        },
      },
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: "Cup",
          nameAr: "كأس",
          status: "registration",
          maxPlayers: 16,
          entryFee: "5.00",
          currency: "usd",
          registrationStartsAt: null,
          registrationEndsAt: null,
          startsAt: null,
          shareSlug: null,
          prizePool: "5.00",
        },
      },
      participants: {
        [tournamentId]: [
          { id: "p-2", tournamentId, userId, seed: 1, walletCurrency: null },
        ],
      },
    });
    defaultAdjustImpl();

    await callRoute("DELETE", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      user: { id: userId },
    });

    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, , currency, delta] = mockAdjust.mock.calls[0];
    // Null routes the helper to the user's primary balance — exactly the
    // legacy single-currency path, unchanged.
    expect(currency).toBeNull();
    expect(delta).toBeCloseTo(5, 2);
  });
});

// ---------------------------------------------------------------------------
// P2P escrow / settlement wallet-routing tests
// ---------------------------------------------------------------------------

describe("createP2PTradeAtomic: escrow debit routing", () => {
  it("debits the seller's EUR sub-wallet when the offer carries walletCurrency = 'EUR' and stamps walletCurrency on the trade", async () => {
    const sellerId = "seller-eur";
    const buyerId = "buyer-eur";
    const offerId = "offer-eur";
    resetTx({
      users: {
        [sellerId]: {
          id: sellerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
        [buyerId]: {
          id: buyerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      offers: {
        [offerId]: {
          id: offerId,
          userId: sellerId,
          status: "active",
          availableAmount: "100.00000000",
          walletCurrency: "EUR",
        },
      },
      traderProfiles: {
        [sellerId]: { canTradeP2P: true, monthlyTradeLimit: null },
        [buyerId]: { canTradeP2P: true, monthlyTradeLimit: null },
      },
    });
    defaultAdjustImpl();

    const result = await createP2PTradeAtomic({
      offerId,
      buyerId,
      sellerId,
      amount: "25.00",
      fiatAmount: "25.00",
      price: "1.00",
      paymentMethod: "bank",
      platformFee: "0.50",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(sellerId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(-25, 2);
    // Created trade row carries walletCurrency for the matching settle path.
    const tradeInsert = inserts.find((i) => i.table === "p2p_trades");
    expect(tradeInsert?.values.walletCurrency).toBe("EUR");
  });

  it("regression: an offer with walletCurrency = null still flows through the legacy primary balance and stores walletCurrency = null on the trade", async () => {
    const sellerId = "seller-legacy";
    const buyerId = "buyer-legacy";
    const offerId = "offer-legacy";
    resetTx({
      users: {
        [sellerId]: {
          id: sellerId,
          balance: "100.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: false,
          allowedCurrencies: [],
        },
        [buyerId]: {
          id: buyerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: false,
          allowedCurrencies: [],
        },
      },
      offers: {
        [offerId]: {
          id: offerId,
          userId: sellerId,
          status: "active",
          availableAmount: "100.00000000",
          walletCurrency: null,
        },
      },
      traderProfiles: {
        [sellerId]: { canTradeP2P: true, monthlyTradeLimit: null },
        [buyerId]: { canTradeP2P: true, monthlyTradeLimit: null },
      },
    });
    defaultAdjustImpl();

    const result = await createP2PTradeAtomic({
      offerId,
      buyerId,
      sellerId,
      amount: "10.00",
      fiatAmount: "10.00",
      price: "1.00",
      paymentMethod: "bank",
      platformFee: "0.10",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, , currency] = mockAdjust.mock.calls[0];
    expect(currency).toBeNull();
    const tradeInsert = inserts.find((i) => i.table === "p2p_trades");
    expect(tradeInsert?.values.walletCurrency).toBeNull();
  });
});

/**
 * Tiny helper to keep the settle-path tests readable: builds users + a
 * trade row in the requested status / wallet currency.
 */
function seedSettleState(opts: {
  sellerId: string;
  buyerId: string;
  tradeId: string;
  status: string;
  walletCurrency: string | null;
  multiCurrencyEnabled?: boolean;
}) {
  const allowed = opts.multiCurrencyEnabled ? ["USD", "EUR"] : [];
  resetTx({
    users: {
      [opts.sellerId]: {
        id: opts.sellerId,
        balance: "0.00",
        balanceCurrency: "USD",
        multiCurrencyEnabled: !!opts.multiCurrencyEnabled,
        allowedCurrencies: allowed,
      },
      [opts.buyerId]: {
        id: opts.buyerId,
        balance: "0.00",
        balanceCurrency: "USD",
        multiCurrencyEnabled: !!opts.multiCurrencyEnabled,
        allowedCurrencies: allowed,
      },
    },
    trades: {
      [opts.tradeId]: {
        id: opts.tradeId,
        buyerId: opts.buyerId,
        sellerId: opts.sellerId,
        status: opts.status,
        escrowAmount: "25.00",
        platformFee: "0.50",
        amount: "25.00",
        offerId: null,
        walletCurrency: opts.walletCurrency,
      },
    },
  });
  defaultAdjustImpl();
}

describe("completeP2PTradeAtomic: release credit routing", () => {
  it("releases escrow (minus platform fee) into the buyer's EUR sub-wallet when the trade was held in EUR", async () => {
    const sellerId = "seller-eur";
    const buyerId = "buyer-eur";
    const tradeId = "trade-eur";
    resetTx({
      users: {
        [sellerId]: {
          id: sellerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
        [buyerId]: {
          id: buyerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      trades: {
        [tradeId]: {
          id: tradeId,
          buyerId,
          sellerId,
          status: "confirmed",
          escrowAmount: "25.00",
          platformFee: "0.50",
          amount: "25.00",
          walletCurrency: "EUR",
        },
      },
    });
    defaultAdjustImpl();

    const result = await completeP2PTradeAtomic(tradeId, sellerId);
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(buyerId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(24.5, 2);
  });
});

describe("cancelP2PTradeAtomic: escrow refund routing", () => {
  it("refunds escrow back to the seller's EUR sub-wallet (NOT the primary USD) when the trade was held in EUR", async () => {
    const sellerId = "seller-eur";
    const buyerId = "buyer-eur";
    const tradeId = "trade-eur-cancel";
    resetTx({
      users: {
        [sellerId]: {
          id: sellerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
        [buyerId]: {
          id: buyerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      trades: {
        [tradeId]: {
          id: tradeId,
          buyerId,
          sellerId,
          status: "pending",
          escrowAmount: "25.00",
          platformFee: "0.50",
          amount: "25.00",
          offerId: null,
          walletCurrency: "EUR",
        },
      },
    });
    defaultAdjustImpl();

    const result = await cancelP2PTradeAtomic(tradeId, sellerId, "test cancel");
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(sellerId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(25, 2);
    // No wallet-helper call ever touched USD on this path.
    expect(mockAdjust.mock.calls.filter((c: any[]) => c[2] === "USD")).toHaveLength(0);
  });
});

describe("resolveP2PDisputedTradeAtomic: dispute payout routing", () => {
  it("returns full escrow to the seller's EUR sub-wallet when the dispute is resolved in the seller's favor", async () => {
    const sellerId = "seller-eur";
    const buyerId = "buyer-eur";
    const tradeId = "trade-eur-dispute-seller";
    resetTx({
      users: {
        [sellerId]: {
          id: sellerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
        [buyerId]: {
          id: buyerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      trades: {
        [tradeId]: {
          id: tradeId,
          buyerId,
          sellerId,
          status: "disputed",
          escrowAmount: "25.00",
          platformFee: "0.50",
          amount: "25.00",
          offerId: null,
          walletCurrency: "EUR",
        },
      },
    });
    defaultAdjustImpl();

    const result = await resolveP2PDisputedTradeAtomic(tradeId, sellerId, "seller wins");
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(sellerId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(25, 2);
  });

  it("releases escrow (minus platform fee) into the buyer's EUR sub-wallet when the dispute is resolved in the buyer's favor", async () => {
    const sellerId = "seller-eur";
    const buyerId = "buyer-eur";
    const tradeId = "trade-eur-dispute-buyer";
    resetTx({
      users: {
        [sellerId]: {
          id: sellerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
        [buyerId]: {
          id: buyerId,
          balance: "0.00",
          balanceCurrency: "USD",
          multiCurrencyEnabled: true,
          allowedCurrencies: ["USD", "EUR"],
        },
      },
      trades: {
        [tradeId]: {
          id: tradeId,
          buyerId,
          sellerId,
          status: "disputed",
          escrowAmount: "25.00",
          platformFee: "0.50",
          amount: "25.00",
          offerId: null,
          walletCurrency: "EUR",
        },
      },
    });
    defaultAdjustImpl();

    const result = await resolveP2PDisputedTradeAtomic(tradeId, buyerId, "buyer wins");
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe(buyerId);
    expect(callCurrency).toBe("EUR");
    expect(callDelta).toBeCloseTo(24.5, 2);
  });
});

// ---------------------------------------------------------------------------
// Legacy / primary-balance regression tests for the settle paths. These guard
// against accidentally routing legacy single-currency trades (walletCurrency
// = null) into the sub-wallet branch — which would silently move money into
// a row that doesn't exist.
// ---------------------------------------------------------------------------

describe("settle paths: legacy primary-balance regression", () => {
  it("completeP2PTradeAtomic with trade.walletCurrency = null routes the buyer credit through the legacy primary balance", async () => {
    seedSettleState({
      sellerId: "s-legacy-1",
      buyerId: "b-legacy-1",
      tradeId: "t-legacy-complete",
      status: "confirmed",
      walletCurrency: null,
    });
    const result = await completeP2PTradeAtomic("t-legacy-complete", "s-legacy-1");
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe("b-legacy-1");
    expect(callCurrency).toBeNull();
  });

  it("cancelP2PTradeAtomic with trade.walletCurrency = null refunds escrow through the seller's primary balance", async () => {
    seedSettleState({
      sellerId: "s-legacy-2",
      buyerId: "b-legacy-2",
      tradeId: "t-legacy-cancel",
      status: "pending",
      walletCurrency: null,
    });
    const result = await cancelP2PTradeAtomic("t-legacy-cancel", "s-legacy-2", "test");
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const [, callUserId, callCurrency, callDelta] = mockAdjust.mock.calls[0];
    expect(callUserId).toBe("s-legacy-2");
    expect(callCurrency).toBeNull();
    expect(callDelta).toBeCloseTo(25, 2);
  });

  it("resolveP2PDisputedTradeAtomic with trade.walletCurrency = null and seller wins routes the refund through the seller's primary balance", async () => {
    seedSettleState({
      sellerId: "s-legacy-3",
      buyerId: "b-legacy-3",
      tradeId: "t-legacy-dispute-seller",
      status: "disputed",
      walletCurrency: null,
    });
    const result = await resolveP2PDisputedTradeAtomic(
      "t-legacy-dispute-seller",
      "s-legacy-3",
      "seller wins",
    );
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    expect(mockAdjust.mock.calls[0][1]).toBe("s-legacy-3");
    expect(mockAdjust.mock.calls[0][2]).toBeNull();
  });

  it("resolveP2PDisputedTradeAtomic with trade.walletCurrency = null and buyer wins routes the release through the buyer's primary balance", async () => {
    seedSettleState({
      sellerId: "s-legacy-4",
      buyerId: "b-legacy-4",
      tradeId: "t-legacy-dispute-buyer",
      status: "disputed",
      walletCurrency: null,
    });
    const result = await resolveP2PDisputedTradeAtomic(
      "t-legacy-dispute-buyer",
      "b-legacy-4",
      "buyer wins",
    );
    expect(result.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    expect(mockAdjust.mock.calls[0][1]).toBe("b-legacy-4");
    expect(mockAdjust.mock.calls[0][2]).toBeNull();
  });
});
