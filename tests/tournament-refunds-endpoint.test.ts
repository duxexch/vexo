/**
 * HTTP integration test for the multi-refund tournament response shape
 * (Task #136).
 *
 * The pure picker `pickRefundsPerTournament` is exhaustively unit-tested
 * in `tests/tournament-refund-picker.test.ts`, but no test exercises the
 * real route handlers — `GET /api/tournaments` and
 * `GET /api/tournaments/:id` — with seeded DB data and asserts the wire
 * field is `userRefunds` (array, plural).
 *
 * Without this guard, a future refactor that re-introduces a single
 * `userRefund` field, or forgets to wire `userRefunds` into the response
 * envelope, would silently break the player-facing refund banner and
 * only surface as a customer-support ticket.
 *
 * Strategy: boot Express in-process with the REAL `registerTournamentListingRoutes`,
 * mock ONLY `optionalAuthMiddleware` so the test can drive `req.user` via
 * an `x-test-user-id` header, seed a real DB with a tournament + a
 * cancel-refund (older) and a delete-refund (newer) for the viewer, hit
 * both endpoints over HTTP, and assert the array shape + chronological
 * order + per-entry payload `{ amount, currency, reason }`.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Auth mock — must be hoisted by Vitest BEFORE the route module is imported.
// We keep all other middleware exports intact so unrelated route modules
// loaded transitively still work.
// ---------------------------------------------------------------------------
vi.mock("../server/routes/middleware", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/routes/middleware")>();
  return {
    ...actual,
    optionalAuthMiddleware: (req: any, _res: any, next: any) => {
      const headerId = req.headers["x-test-user-id"];
      if (typeof headerId === "string" && headerId.length > 0) {
        req.user = { id: headerId, username: headerId };
      }
      next();
    },
  };
});

// Imports below MUST come AFTER the vi.mock so the mock is in place when
// the route module is evaluated.
import express from "express";
import { db } from "../server/db";
import {
  projectCurrencyLedger,
  projectCurrencyWallets,
  tournaments,
  transactions,
  users,
} from "@shared/schema";
import { registerTournamentListingRoutes } from "../server/routes/tournaments/listing";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const TEST_PREFIX = `t136-${Date.now()}-${randomBytes(4).toString("hex")}`;
const createdUserIds = new Set<string>();
const createdTournamentIds = new Set<string>();
const createdTransactionIds = new Set<string>();
const createdLedgerIds = new Set<string>();
const createdWalletIds = new Set<string>();

let server: any;
let baseUrl = "";

function uid(label: string): string {
  return `${TEST_PREFIX}-${label}-${randomBytes(4).toString("hex")}`;
}

async function seedUser(): Promise<string> {
  const id = uid("user");
  await db.insert(users).values({
    id,
    username: id,
    password: "x",
    balance: "0.00",
    balanceCurrency: "USD",
  });
  createdUserIds.add(id);
  return id;
}

async function seedPublishedTournament(): Promise<string> {
  const id = uid("tour");
  await db.insert(tournaments).values({
    id,
    name: "Refund Wire-Shape Test Tournament",
    nameAr: "بطولة اختبار شكل الاسترداد",
    gameType: "chess",
    status: "completed",
    isPublished: true,
    publishedAt: new Date(),
    entryFee: "5.00",
    prizePool: "0.00",
    currency: "usd",
  });
  createdTournamentIds.add(id);
  return id;
}

async function seedRefundTxn(opts: {
  userId: string;
  referenceId: string;
  amount: string;
  createdAt: Date;
}): Promise<string> {
  const id = uid("tx");
  await db.insert(transactions).values({
    id,
    userId: opts.userId,
    type: "refund",
    status: "completed",
    amount: opts.amount,
    balanceBefore: "0.00",
    balanceAfter: opts.amount,
    referenceId: opts.referenceId,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  });
  createdTransactionIds.add(id);
  return id;
}

async function ensureProjectWallet(userId: string): Promise<string> {
  const id = uid("pwallet");
  await db.insert(projectCurrencyWallets).values({
    id,
    userId,
  });
  createdWalletIds.add(id);
  return id;
}

async function seedProjectRefundLedger(opts: {
  userId: string;
  walletId: string;
  referenceId: string;
  referenceType: "tournament_cancel_refund" | "tournament_delete_refund";
  amount: string;
  createdAt: Date;
}): Promise<string> {
  const id = uid("pl");
  await db.insert(projectCurrencyLedger).values({
    id,
    userId: opts.userId,
    walletId: opts.walletId,
    type: "refund",
    amount: opts.amount,
    balanceBefore: "0.00",
    balanceAfter: opts.amount,
    referenceId: opts.referenceId,
    referenceType: opts.referenceType,
    createdAt: opts.createdAt,
  });
  createdLedgerIds.add(id);
  return id;
}

describe.skipIf(!HAS_DB)("tournament listing endpoints — userRefunds wire shape (Task #136)", () => {
  beforeAll(async () => {
    if (!HAS_DB) return;
    const app = express();
    app.use(express.json());
    registerTournamentListingRoutes(app);
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
    if (createdLedgerIds.size > 0) {
      await db.delete(projectCurrencyLedger).where(inArray(projectCurrencyLedger.id, Array.from(createdLedgerIds)));
    }
    if (createdWalletIds.size > 0) {
      await db.delete(projectCurrencyWallets).where(inArray(projectCurrencyWallets.id, Array.from(createdWalletIds)));
    }
    if (createdTransactionIds.size > 0) {
      await db.delete(transactions).where(inArray(transactions.id, Array.from(createdTransactionIds)));
    }
    if (createdTournamentIds.size > 0) {
      await db.delete(tournaments).where(inArray(tournaments.id, Array.from(createdTournamentIds)));
    }
    if (createdUserIds.size > 0) {
      await db.delete(users).where(inArray(users.id, Array.from(createdUserIds)));
    }
  });

  it("GET /api/tournaments returns `userRefunds` as an array with both refund entries in chronological order", async () => {
    const userId = await seedUser();
    const tournamentId = await seedPublishedTournament();

    const cancelAt = new Date("2026-04-01T10:00:00Z");
    const deleteAt = new Date("2026-04-20T15:30:00Z");

    await seedRefundTxn({
      userId,
      referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
      amount: "10.00",
      createdAt: cancelAt,
    });
    await seedRefundTxn({
      userId,
      referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
      amount: "2.00",
      createdAt: deleteAt,
    });

    const res = await fetch(`${baseUrl}/api/tournaments`, {
      headers: { "x-test-user-id": userId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, any>>;

    const row = body.find((t) => t.id === tournamentId);
    expect(row).toBeDefined();

    // Wire field MUST be the plural array `userRefunds`. A regression
    // that re-introduces a single `userRefund` object (or drops the
    // field entirely) breaks the player-facing banner — fail loudly here.
    expect(Array.isArray(row!.userRefunds)).toBe(true);
    expect(row).not.toHaveProperty("userRefund");

    expect(row!.userRefunds).toHaveLength(2);
    // Chronological: cancel first, then delete.
    expect(row!.userRefunds[0]).toEqual({
      amount: "10.00",
      currency: "usd",
      reason: "cancelled",
    });
    expect(row!.userRefunds[1]).toEqual({
      amount: "2.00",
      currency: "usd",
      reason: "deleted",
    });
    // No createdAt or other internal fields leak into the wire payload.
    expect(Object.keys(row!.userRefunds[0]).sort()).toEqual(["amount", "currency", "reason"]);
  });

  it("GET /api/tournaments/:id returns `userRefunds` as an array with both refund entries in chronological order", async () => {
    const userId = await seedUser();
    const tournamentId = await seedPublishedTournament();

    const cancelAt = new Date("2026-04-05T09:00:00Z");
    const deleteAt = new Date("2026-04-22T18:45:00Z");

    await seedRefundTxn({
      userId,
      referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
      amount: "7.50",
      createdAt: cancelAt,
    });
    await seedRefundTxn({
      userId,
      referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
      amount: "3.25",
      createdAt: deleteAt,
    });

    const res = await fetch(`${baseUrl}/api/tournaments/${tournamentId}`, {
      headers: { "x-test-user-id": userId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;

    expect(body.id).toBe(tournamentId);
    expect(Array.isArray(body.userRefunds)).toBe(true);
    expect(body).not.toHaveProperty("userRefund");

    expect(body.userRefunds).toHaveLength(2);
    expect(body.userRefunds[0]).toEqual({
      amount: "7.50",
      currency: "usd",
      reason: "cancelled",
    });
    expect(body.userRefunds[1]).toEqual({
      amount: "3.25",
      currency: "usd",
      reason: "deleted",
    });
    expect(Object.keys(body.userRefunds[0]).sort()).toEqual(["amount", "currency", "reason"]);
  });

  it("GET /api/tournaments/:id returns an empty `userRefunds` array (still plural) for a viewer with no refunds", async () => {
    const userId = await seedUser();
    const tournamentId = await seedPublishedTournament();

    // No refund rows seeded for this viewer + tournament pair.
    const res = await fetch(`${baseUrl}/api/tournaments/${tournamentId}`, {
      headers: { "x-test-user-id": userId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;

    // Must still be the plural array field — never undefined, never the
    // legacy singular `userRefund` shape.
    expect(Array.isArray(body.userRefunds)).toBe(true);
    expect(body.userRefunds).toHaveLength(0);
    expect(body).not.toHaveProperty("userRefund");
  });

  it("GET /api/tournaments returns `userRefunds: []` for unauthenticated requests (still plural)", async () => {
    const tournamentId = await seedPublishedTournament();

    const res = await fetch(`${baseUrl}/api/tournaments`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, any>>;

    const row = body.find((t) => t.id === tournamentId);
    expect(row).toBeDefined();
    expect(Array.isArray(row!.userRefunds)).toBe(true);
    expect(row!.userRefunds).toHaveLength(0);
    expect(row).not.toHaveProperty("userRefund");
  });

  it("merges cross-table refunds: cancel in project ledger (VXC) + delete in transactions (USD) both surface in `userRefunds`", async () => {
    // This locks in the production wiring of `loadUserRefundsByTournament`,
    // which queries BOTH `transactions` (USD) and `project_currency_ledger`
    // (project / VXC) and merges them through the picker. A regression that
    // forgets one of the two queries — or wires only the USD path — would
    // silently drop half the refund history; this case fails it.
    const userId = await seedUser();
    const tournamentId = await seedPublishedTournament();
    const walletId = await ensureProjectWallet(userId);

    const cancelAt = new Date("2026-04-10T08:00:00Z");
    const deleteAt = new Date("2026-04-25T20:15:00Z");

    await seedProjectRefundLedger({
      userId,
      walletId,
      referenceId: `tournament-cancel-refund:${tournamentId}:${userId}`,
      referenceType: "tournament_cancel_refund",
      amount: "100.00",
      createdAt: cancelAt,
    });
    await seedRefundTxn({
      userId,
      referenceId: `tournament-delete-refund:${tournamentId}:${userId}`,
      amount: "8.00",
      createdAt: deleteAt,
    });

    const res = await fetch(`${baseUrl}/api/tournaments/${tournamentId}`, {
      headers: { "x-test-user-id": userId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;

    expect(Array.isArray(body.userRefunds)).toBe(true);
    expect(body.userRefunds).toHaveLength(2);
    expect(body.userRefunds[0]).toEqual({
      amount: "100.00",
      currency: "project",
      reason: "cancelled",
    });
    expect(body.userRefunds[1]).toEqual({
      amount: "8.00",
      currency: "usd",
      reason: "deleted",
    });
  });

  it("isolates refunds per viewer: another user's refund on the same tournament does NOT leak into the response", async () => {
    // A regression that forgets the `userId` filter in
    // `loadUserRefundsByTournament` would leak other users' refund history
    // into every viewer's response — both a privacy bug and a correctness
    // bug. This test seeds Bob's refund on the same tournament and asserts
    // Alice sees nothing.
    const aliceId = await seedUser();
    const bobId = await seedUser();
    const tournamentId = await seedPublishedTournament();

    await seedRefundTxn({
      userId: bobId,
      referenceId: `tournament-cancel-refund:${tournamentId}:${bobId}`,
      amount: "42.00",
      createdAt: new Date("2026-04-15T12:00:00Z"),
    });

    // Alice has no refund of her own.
    const res = await fetch(`${baseUrl}/api/tournaments/${tournamentId}`, {
      headers: { "x-test-user-id": aliceId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;

    expect(Array.isArray(body.userRefunds)).toBe(true);
    expect(body.userRefunds).toHaveLength(0);

    // Sanity: Bob still sees his own refund (proves the seed actually
    // landed and the test isn't passing because the seed was a no-op).
    const bobRes = await fetch(`${baseUrl}/api/tournaments/${tournamentId}`, {
      headers: { "x-test-user-id": bobId },
    });
    const bobBody = (await bobRes.json()) as Record<string, any>;
    expect(bobBody.userRefunds).toHaveLength(1);
    expect(bobBody.userRefunds[0]).toEqual({
      amount: "42.00",
      currency: "usd",
      reason: "cancelled",
    });
  });
});
