/**
 * End-to-end wallet-routing coverage (Task #127) — REAL Drizzle / Postgres.
 *
 * Tournament entry fees, P2P escrow, refunds, and prize payouts now route
 * through `adjustUserCurrencyBalance` with a stored `walletCurrency` per
 * participant / offer / trade. These tests exercise the real production
 * code against the project's Postgres (`DATABASE_URL`) so we can read back
 * `users.balance` and `user_currency_wallets.balance` AFTER each operation
 * and prove (a) the chosen sub-wallet was actually debited / credited and
 * (b) the OTHER wallet (primary or sub) was NOT touched.
 *
 * Why state-level assertions: a future regression that simultaneously
 * called the helper correctly AND mutated `users.balance` directly would
 * silently double-spend. Asserting persisted balances on both sides
 * catches that.
 *
 * Test data is fully isolated: every row carries the per-run prefix
 * `wrt127-<ts>-<rand>` and the `afterEach` hook deletes it in reverse-FK
 * order. The pool is closed in `afterAll` so the test runner exits cleanly.
 *
 * The wallet helper itself is exhaustively unit-tested in
 * `tests/wallet-balances.test.ts` against a row-level mocked Drizzle tx;
 * this file does NOT duplicate those internals — it only verifies the
 * routing decision (which wallet code is debited / credited) and the
 * persisted state at every call site.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Module mocks. Only mock collaborators that are irrelevant to wallet
// routing (auth middleware, websocket notifications, post-tx auto-start).
// `server/db` and `server/lib/wallet-balances` stay REAL.
// ---------------------------------------------------------------------------

vi.mock("../server/websocket", () => ({
  sendNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../server/routes/middleware", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next?.(),
  sensitiveRateLimiter: (_req: any, _res: any, next: any) => next?.(),
}));

vi.mock("../server/lib/tournament-utils", async () => {
  const actual = await vi.importActual<typeof import("../server/lib/tournament-utils")>(
    "../server/lib/tournament-utils",
  );
  return {
    ...actual,
    // Avoid kicking off real bracket / match work after the registration
    // transaction commits; routing is verified before this hook fires.
    tryAutoStartTournament: vi.fn(async () => ({ success: false })),
  };
});

import { db, pool } from "../server/db";
import {
  users,
  tournaments,
  tournamentParticipants,
  transactions,
  userCurrencyWallets,
  p2pOffers,
  p2pTrades,
  p2pTraderProfiles,
} from "@shared/schema";
import { registerTournamentRegistrationRoutes } from "../server/routes/tournaments/registration";
import { createP2PTradeAtomic } from "../server/storage/p2p/trade-create-atomic";
import {
  completeP2PTradeAtomic,
  cancelP2PTradeAtomic,
  resolveP2PDisputedTradeAtomic,
} from "../server/storage/p2p/trade-settle-atomic";

// ---------------------------------------------------------------------------
// Test-data tracking. Per-run prefix keeps rows scoped + cleanable even
// when concurrent CI workers share the same database.
// ---------------------------------------------------------------------------

const TEST_PREFIX = `wrt127-${Date.now()}-${randomBytes(4).toString("hex")}`;

const createdUserIds = new Set<string>();
const createdTournamentIds = new Set<string>();
const createdOfferIds = new Set<string>();
const createdTradeIds = new Set<string>();

function uid(label: string): string {
  return `${TEST_PREFIX}-${label}-${randomBytes(4).toString("hex")}`;
}

interface SubWalletSeed {
  code: string;
  balance: string;
}

async function createUser(opts: {
  primary?: string;
  initialBalance?: string;
  multiCurrency?: boolean;
  allowed?: string[];
  subWallets?: SubWalletSeed[];
  withTraderProfile?: boolean;
}): Promise<string> {
  const id = uid("user");
  await db.insert(users).values({
    id,
    // Username + password are NOT NULL on the users table; uniqueness is
    // satisfied by the per-run prefix + random suffix.
    username: id,
    password: "x",
    balance: opts.initialBalance ?? "0.00",
    balanceCurrency: opts.primary ?? "USD",
    multiCurrencyEnabled: opts.multiCurrency ?? false,
    allowedCurrencies: opts.allowed ?? [],
  });
  createdUserIds.add(id);

  for (const sub of opts.subWallets ?? []) {
    await db.insert(userCurrencyWallets).values({
      userId: id,
      currencyCode: sub.code,
      balance: sub.balance,
      totalDeposited: sub.balance,
    });
  }

  if (opts.withTraderProfile) {
    await db.insert(p2pTraderProfiles).values({
      userId: id,
      canTradeP2P: true,
      // Null monthly limit + no badges → `resolveEffectiveP2PMonthlyLimit`
      // returns null and the monthly-usage check inside trade-create is
      // skipped (so we don't have to seed historical trades).
      monthlyTradeLimit: null,
    });
  }

  return id;
}

async function readBalances(userId: string): Promise<{
  primary: string;
  primaryCurrency: string;
  subs: Record<string, string>;
}> {
  const [u] = await db
    .select({ balance: users.balance, currency: users.balanceCurrency })
    .from(users)
    .where(eq(users.id, userId));
  const subs = await db
    .select()
    .from(userCurrencyWallets)
    .where(eq(userCurrencyWallets.userId, userId));
  const subMap: Record<string, string> = {};
  for (const s of subs) subMap[s.currencyCode] = s.balance;
  return {
    primary: u?.balance ?? "0.00",
    primaryCurrency: u?.currency ?? "",
    subs: subMap,
  };
}

async function createTournament(opts: { entryFee: string }): Promise<string> {
  const id = uid("tour");
  await db.insert(tournaments).values({
    id,
    name: "T127",
    nameAr: "ت127",
    gameType: "chess",
    status: "registration",
    maxPlayers: 16,
    entryFee: opts.entryFee,
    currency: "usd",
  });
  createdTournamentIds.add(id);
  return id;
}

async function createOffer(opts: {
  sellerId: string;
  walletCurrency: string | null;
  available?: string;
}): Promise<string> {
  const id = uid("offer");
  await db.insert(p2pOffers).values({
    id,
    userId: opts.sellerId,
    type: "sell",
    status: "active",
    cryptoCurrency: opts.walletCurrency ?? "USDT",
    fiatCurrency: "USD",
    walletCurrency: opts.walletCurrency,
    price: "1.00",
    availableAmount: opts.available ?? "100.00000000",
    minLimit: "1.00",
    maxLimit: "1000.00",
  });
  createdOfferIds.add(id);
  return id;
}

async function createTrade(opts: {
  offerId: string;
  buyerId: string;
  sellerId: string;
  status: "pending" | "paid" | "confirmed" | "disputed";
  walletCurrency: string | null;
  escrow?: string;
  fee?: string;
}): Promise<string> {
  const id = uid("trade");
  await db.insert(p2pTrades).values({
    id,
    offerId: opts.offerId,
    buyerId: opts.buyerId,
    sellerId: opts.sellerId,
    status: opts.status,
    amount: opts.escrow ?? "25.00",
    fiatAmount: "25.00",
    price: "1.00",
    paymentMethod: "bank",
    escrowAmount: opts.escrow ?? "25.00",
    platformFee: opts.fee ?? "0.50",
    walletCurrency: opts.walletCurrency,
  });
  createdTradeIds.add(id);
  return id;
}

async function cleanup(): Promise<void> {
  // Reverse-FK order: transactions → trades → offers → traderProfiles →
  // tournament_participants → tournaments → users (userCurrencyWallets
  // and tournamentParticipants cascade-delete on the user / tournament FK
  // but we delete participants explicitly so tournament deletes succeed).
  if (createdUserIds.size > 0) {
    const userIdList = Array.from(createdUserIds);
    await db.delete(transactions).where(inArray(transactions.userId, userIdList));
  }
  if (createdTradeIds.size > 0) {
    await db
      .delete(p2pTrades)
      .where(inArray(p2pTrades.id, Array.from(createdTradeIds)));
  }
  if (createdOfferIds.size > 0) {
    await db
      .delete(p2pOffers)
      .where(inArray(p2pOffers.id, Array.from(createdOfferIds)));
  }
  if (createdUserIds.size > 0) {
    const userIdList = Array.from(createdUserIds);
    await db
      .delete(p2pTraderProfiles)
      .where(inArray(p2pTraderProfiles.userId, userIdList));
  }
  if (createdTournamentIds.size > 0) {
    const tIds = Array.from(createdTournamentIds);
    await db
      .delete(tournamentParticipants)
      .where(inArray(tournamentParticipants.tournamentId, tIds));
    await db.delete(tournaments).where(inArray(tournaments.id, tIds));
  }
  if (createdUserIds.size > 0) {
    await db
      .delete(users)
      .where(inArray(users.id, Array.from(createdUserIds)));
  }
  createdTradeIds.clear();
  createdOfferIds.clear();
  createdTournamentIds.clear();
  createdUserIds.clear();
}

// ---------------------------------------------------------------------------
// Capture the tournament Express handlers via a fake `app` recorder so we
// can invoke them directly with a mock `req` / `res` (no supertest /
// real network). Captured at module-load time after mocks are wired.
// ---------------------------------------------------------------------------

const tournamentHandlers: Record<string, Function> = {};
{
  const fakeApp: any = {
    post(path: string, ...handlers: any[]) {
      tournamentHandlers[`POST ${path}`] = handlers[handlers.length - 1];
    },
    delete(path: string, ...handlers: any[]) {
      tournamentHandlers[`DELETE ${path}`] = handlers[handlers.length - 1];
    },
  };
  registerTournamentRegistrationRoutes(fakeApp);
}

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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for wallet-routing-end-to-end tests (real DB).",
    );
  }
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  // Final sweep in case a test threw before its `afterEach` registered a
  // row, then close the pool so vitest can exit cleanly.
  await cleanup();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tournament register: wallet routing
// ---------------------------------------------------------------------------

describe("Tournament register (real DB): wallet routing", () => {
  it("debits the chosen EUR sub-wallet, leaves the primary USD untouched, and stamps walletCurrency on the participant", async () => {
    const userId = await createUser({
      primary: "USD",
      initialBalance: "500.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      subWallets: [{ code: "EUR", balance: "200.00" }],
    });
    const tournamentId = await createTournament({ entryFee: "10.00" });

    const result = await callRoute("POST", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      body: { walletCurrency: "EUR" },
      user: { id: userId },
    });
    expect(result.status).toBe(200);

    const after = await readBalances(userId);
    // EUR sub-wallet was debited the full entry fee.
    expect(after.subs.EUR).toBe("190.00");
    // Primary USD balance was NOT touched — this catches a regression that
    // would silently double-spend by mutating both wallets.
    expect(after.primary).toBe("500.00");

    const [participant] = await db
      .select()
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      );
    expect(participant?.walletCurrency).toBe("EUR");
  });

  it("regression: a single-currency user with no wallet picker still hits users.balance and stores walletCurrency = NULL", async () => {
    const userId = await createUser({
      primary: "USD",
      initialBalance: "50.00",
      multiCurrency: false,
      allowed: [],
    });
    const tournamentId = await createTournament({ entryFee: "5.00" });

    const result = await callRoute("POST", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      body: {},
      user: { id: userId },
    });
    expect(result.status).toBe(200);

    const after = await readBalances(userId);
    // Legacy primary path: USD balance debited, no sub-wallet rows touched.
    expect(after.primary).toBe("45.00");
    expect(after.subs).toEqual({});

    const [participant] = await db
      .select()
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      );
    expect(participant?.walletCurrency).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tournament unregister: wallet routing
// ---------------------------------------------------------------------------

describe("Tournament unregister (real DB): wallet routing", () => {
  it("refunds the entry fee back to the EUR sub-wallet recorded on the participant row (primary USD untouched)", async () => {
    const userId = await createUser({
      primary: "USD",
      initialBalance: "500.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      subWallets: [{ code: "EUR", balance: "200.00" }],
    });
    const tournamentId = await createTournament({ entryFee: "10.00" });

    // Register first so there's a participant row with walletCurrency="EUR"
    // and the EUR balance is at the post-debit value.
    await callRoute("POST", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      body: { walletCurrency: "EUR" },
      user: { id: userId },
    });
    const afterRegister = await readBalances(userId);
    expect(afterRegister.subs.EUR).toBe("190.00");
    expect(afterRegister.primary).toBe("500.00");

    const unregResult = await callRoute("DELETE", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      user: { id: userId },
    });
    expect(unregResult.status).toBe(200);

    const afterUnregister = await readBalances(userId);
    // EUR sub-wallet refunded back to the original 200.
    expect(afterUnregister.subs.EUR).toBe("200.00");
    // Primary USD never moved — proves the refund did not leak into it.
    expect(afterUnregister.primary).toBe("500.00");
  });

  it("regression: a single-currency participant with walletCurrency = NULL is refunded through the legacy primary balance", async () => {
    const userId = await createUser({
      primary: "USD",
      initialBalance: "50.00",
      multiCurrency: false,
      allowed: [],
    });
    const tournamentId = await createTournament({ entryFee: "5.00" });
    await callRoute("POST", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      body: {},
      user: { id: userId },
    });
    const afterRegister = await readBalances(userId);
    expect(afterRegister.primary).toBe("45.00");

    await callRoute("DELETE", "/api/tournaments/:id/register", {
      params: { id: tournamentId },
      user: { id: userId },
    });
    const afterUnregister = await readBalances(userId);
    expect(afterUnregister.primary).toBe("50.00");
    // No sub-wallet row should have been opportunistically created.
    expect(afterUnregister.subs).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// P2P trade create (escrow debit) — wallet routing
// ---------------------------------------------------------------------------

describe("createP2PTradeAtomic (real DB): escrow debit routing", () => {
  it("debits the seller's EUR sub-wallet (primary USD untouched) and stamps walletCurrency on the trade when the offer is in EUR", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "500.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      subWallets: [{ code: "EUR", balance: "200.00" }],
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: "EUR" });

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
    if (result.trade) createdTradeIds.add(result.trade.id);

    const sellerAfter = await readBalances(sellerId);
    // Escrow held in EUR sub-wallet, primary USD untouched.
    expect(sellerAfter.subs.EUR).toBe("175.00");
    expect(sellerAfter.primary).toBe("500.00");
    // Buyer is unchanged at create time (escrow is on the seller side only).
    const buyerAfter = await readBalances(buyerId);
    expect(buyerAfter.primary).toBe("0.00");
    expect(buyerAfter.subs).toEqual({});

    expect(result.trade?.walletCurrency).toBe("EUR");
  });

  it("regression: an offer with walletCurrency = NULL still flows through the legacy primary balance and stores walletCurrency = NULL on the trade", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "100.00",
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: null });

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
    if (result.trade) createdTradeIds.add(result.trade.id);

    const sellerAfter = await readBalances(sellerId);
    expect(sellerAfter.primary).toBe("90.00");
    // No sub-wallet was opportunistically created when the offer is legacy.
    expect(sellerAfter.subs).toEqual({});
    expect(result.trade?.walletCurrency).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2P trade complete (release credit) — wallet routing
// ---------------------------------------------------------------------------

describe("completeP2PTradeAtomic (real DB): release credit routing", () => {
  it("releases escrow (minus platform fee) into the buyer's EUR sub-wallet when the trade was held in EUR", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: "EUR" });
    const tradeId = await createTrade({
      offerId,
      buyerId,
      sellerId,
      status: "confirmed",
      walletCurrency: "EUR",
      escrow: "25.00",
      fee: "0.50",
    });

    const result = await completeP2PTradeAtomic(tradeId, sellerId);
    expect(result.success).toBe(true);

    const buyerAfter = await readBalances(buyerId);
    // Escrow (25) - fee (0.50) = 24.50 credited to the buyer's EUR wallet.
    expect(buyerAfter.subs.EUR).toBe("24.50");
    // Buyer's primary USD was NOT touched.
    expect(buyerAfter.primary).toBe("0.00");
    // Seller's balances unchanged on completion (escrow already debited at create).
    const sellerAfter = await readBalances(sellerId);
    expect(sellerAfter.primary).toBe("0.00");
    expect(sellerAfter.subs).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// P2P trade cancel (escrow refund) — wallet routing
// ---------------------------------------------------------------------------

describe("cancelP2PTradeAtomic (real DB): escrow refund routing", () => {
  it("refunds the full escrow back to the seller's EUR sub-wallet (NOT primary USD) when the trade was held in EUR", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      subWallets: [{ code: "EUR", balance: "175.00" }],
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: "EUR" });
    const tradeId = await createTrade({
      offerId,
      buyerId,
      sellerId,
      status: "pending",
      walletCurrency: "EUR",
      escrow: "25.00",
      fee: "0.50",
    });

    const result = await cancelP2PTradeAtomic(tradeId, sellerId, "test cancel");
    expect(result.success).toBe(true);

    const sellerAfter = await readBalances(sellerId);
    // EUR refunded 175 + 25 = 200; primary USD untouched.
    expect(sellerAfter.subs.EUR).toBe("200.00");
    expect(sellerAfter.primary).toBe("0.00");
  });

  it("regression: a legacy null-wallet trade refunds escrow through the seller's primary balance", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "75.00",
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: null });
    const tradeId = await createTrade({
      offerId,
      buyerId,
      sellerId,
      status: "pending",
      walletCurrency: null,
      escrow: "25.00",
      fee: "0.50",
    });

    const result = await cancelP2PTradeAtomic(tradeId, sellerId, "regression");
    expect(result.success).toBe(true);

    const sellerAfter = await readBalances(sellerId);
    // 75 + 25 = 100 refunded to primary; no sub-wallet created.
    expect(sellerAfter.primary).toBe("100.00");
    expect(sellerAfter.subs).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// P2P trade dispute resolution — wallet routing
// ---------------------------------------------------------------------------

describe("resolveP2PDisputedTradeAtomic (real DB): dispute payout routing", () => {
  it("returns full escrow to the seller's EUR sub-wallet (primary USD untouched) when the dispute is resolved in the seller's favor", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      subWallets: [{ code: "EUR", balance: "175.00" }],
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: "EUR" });
    const tradeId = await createTrade({
      offerId,
      buyerId,
      sellerId,
      status: "disputed",
      walletCurrency: "EUR",
      escrow: "25.00",
      fee: "0.50",
    });

    const result = await resolveP2PDisputedTradeAtomic(
      tradeId,
      sellerId,
      "seller wins",
    );
    expect(result.success).toBe(true);

    const sellerAfter = await readBalances(sellerId);
    expect(sellerAfter.subs.EUR).toBe("200.00"); // 175 + full escrow 25
    expect(sellerAfter.primary).toBe("0.00");
    const buyerAfter = await readBalances(buyerId);
    expect(buyerAfter.primary).toBe("0.00");
    expect(buyerAfter.subs).toEqual({});
  });

  it("releases escrow (minus platform fee) into the buyer's EUR sub-wallet when the dispute is resolved in the buyer's favor", async () => {
    const sellerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      withTraderProfile: true,
    });
    const buyerId = await createUser({
      primary: "USD",
      initialBalance: "0.00",
      multiCurrency: true,
      allowed: ["USD", "EUR"],
      withTraderProfile: true,
    });
    const offerId = await createOffer({ sellerId, walletCurrency: "EUR" });
    const tradeId = await createTrade({
      offerId,
      buyerId,
      sellerId,
      status: "disputed",
      walletCurrency: "EUR",
      escrow: "25.00",
      fee: "0.50",
    });

    const result = await resolveP2PDisputedTradeAtomic(
      tradeId,
      buyerId,
      "buyer wins",
    );
    expect(result.success).toBe(true);

    const buyerAfter = await readBalances(buyerId);
    expect(buyerAfter.subs.EUR).toBe("24.50");
    expect(buyerAfter.primary).toBe("0.00");
    const sellerAfter = await readBalances(sellerId);
    expect(sellerAfter.primary).toBe("0.00");
    expect(sellerAfter.subs).toEqual({});
  });
});
