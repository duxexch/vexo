/**
 * Integration coverage for the public tournament listing endpoint
 * (GET /api/tournaments). Task #141 made tournaments default to a
 * registerable window when admins omit the timestamps, and added a
 * shared `getTournamentRegistrationState` helper so the public page
 * can render an explicit "open / opens-soon / closed / full" state
 * for every card.
 *
 * This test seeds four tournaments — one in each state — through the
 * mocked Drizzle chain, drives the actual Express handler that
 * `registerTournamentListingRoutes` registers, and asserts that:
 *   1) the response shape includes every timestamp the client
 *      classifier needs (registrationStartsAt, registrationEndsAt,
 *      startsAt) plus the participant counts;
 *   2) running the same shared helper over each returned row
 *      produces exactly the expected state.
 *
 * That second step is the user-visible parity check: it proves that
 * what comes off the wire is enough for the public listing card to
 * render the right badge for each tournament.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const seededRows: Array<Record<string, unknown>> = [];

// Mock `db` so we don't need a Postgres instance. Drizzle's chain on
// the listing endpoint is `db.select(shape).from(t).orderBy(...).$dynamic().where(...).limit(50)`,
// so the chain stub returns `this` for every step and finally resolves
// to the seeded rows when the chain is awaited via `.limit()`.
function makeQueryChain(rowsRef: { current: Array<Record<string, unknown>> }) {
  const chain: any = {};
  chain.from = () => chain;
  chain.orderBy = () => chain;
  chain.$dynamic = () => chain;
  chain.where = () => chain;
  chain.leftJoin = () => chain;
  chain.limit = async () => rowsRef.current;
  // For the refund-loader sub-queries the chain is awaited directly
  // after `.where(...)`. Make `.where` thenable too so an awaited
  // chain without `.limit()` still resolves to an empty list.
  (chain as any).then = (resolve: (v: unknown) => void) => resolve([]);
  return chain;
}

const rowsRef = { current: seededRows };

vi.mock("../server/db", () => ({
  db: {
    select: () => makeQueryChain(rowsRef),
  },
}));

// The optional-auth middleware is invoked but we don't seed a user,
// so a no-op pass-through middleware is enough to drive the public
// (unauthenticated) branch — exactly what a brand-new visitor hits.
vi.mock("../server/routes/middleware", () => ({
  optionalAuthMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import express from "express";
import { registerTournamentListingRoutes } from "../server/routes/tournaments/listing";
import { getTournamentRegistrationState } from "../shared/tournament-registration-state";

let server: any;
let baseUrl = "";

const NOW = new Date("2026-04-26T12:00:00Z");
const FUTURE = new Date("2026-04-26T15:00:00Z").toISOString();
const FAR_FUTURE = new Date("2026-04-27T12:00:00Z").toISOString();
const PAST_OPEN = new Date("2026-04-26T11:00:00Z").toISOString();
const PAST_CLOSE = new Date("2026-04-26T11:30:00Z").toISOString();

beforeAll(async () => {
  // Seed four tournaments, one per registration state. The shape
  // mirrors what the listing handler selects (id, status, the three
  // timestamp fields, participantCount, maxPlayers, etc.).
  seededRows.length = 0;
  seededRows.push(
    {
      id: "t-open",
      name: "Open Tournament",
      status: "registration",
      registrationStartsAt: PAST_OPEN,
      registrationEndsAt: FAR_FUTURE,
      startsAt: FAR_FUTURE,
      participantCount: 4,
      maxPlayers: 16,
      isPublished: true,
    },
    {
      id: "t-opens-soon",
      name: "Opens Soon",
      status: "upcoming",
      registrationStartsAt: FUTURE,
      registrationEndsAt: FAR_FUTURE,
      startsAt: FAR_FUTURE,
      participantCount: 0,
      maxPlayers: 16,
      isPublished: true,
    },
    {
      id: "t-closed",
      name: "Closed Tournament",
      status: "registration",
      registrationStartsAt: PAST_OPEN,
      registrationEndsAt: PAST_CLOSE,
      startsAt: FAR_FUTURE,
      participantCount: 2,
      maxPlayers: 16,
      isPublished: true,
    },
    {
      id: "t-full",
      name: "Full Tournament",
      status: "registration",
      registrationStartsAt: PAST_OPEN,
      registrationEndsAt: FAR_FUTURE,
      startsAt: FAR_FUTURE,
      participantCount: 16,
      maxPlayers: 16,
      isPublished: true,
    },
  );

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
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getList(): Promise<Array<Record<string, any>>> {
  const res = await fetch(`${baseUrl}/api/tournaments`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  return body;
}

describe("GET /api/tournaments — exposes enough fields for the client to classify each registration state", () => {
  it("includes the three registration-window timestamps and roster counts on every row", async () => {
    const rows = await getList();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      // These five fields are exactly what `getTournamentRegistrationState`
      // reads. If the listing endpoint ever stops projecting any of
      // them, the public list cards lose their state badges silently —
      // this assertion fails loudly first.
      expect(row).toHaveProperty("status");
      expect(row).toHaveProperty("registrationStartsAt");
      expect(row).toHaveProperty("registrationEndsAt");
      expect(row).toHaveProperty("startsAt");
      expect(row).toHaveProperty("participantCount");
      expect(row).toHaveProperty("maxPlayers");
    }
  });

  it("classifies the seeded 'open' tournament as open from the listing payload alone", async () => {
    const rows = await getList();
    const open = rows.find((r) => r.id === "t-open")!;
    const state = getTournamentRegistrationState(
      {
        status: open.status,
        registrationStartsAt: open.registrationStartsAt,
        registrationEndsAt: open.registrationEndsAt,
        startsAt: open.startsAt,
        participantCount: open.participantCount,
        maxPlayers: open.maxPlayers,
      },
      NOW,
    );
    expect(state).toBe("open");
  });

  it("classifies a future-open tournament as opens-soon from the listing payload alone", async () => {
    const rows = await getList();
    const soon = rows.find((r) => r.id === "t-opens-soon")!;
    const state = getTournamentRegistrationState(
      {
        status: soon.status,
        registrationStartsAt: soon.registrationStartsAt,
        registrationEndsAt: soon.registrationEndsAt,
        startsAt: soon.startsAt,
        participantCount: soon.participantCount,
        maxPlayers: soon.maxPlayers,
      },
      NOW,
    );
    expect(state).toBe("opens-soon");
  });

  it("classifies a closed-window tournament as closed from the listing payload alone", async () => {
    const rows = await getList();
    const closed = rows.find((r) => r.id === "t-closed")!;
    const state = getTournamentRegistrationState(
      {
        status: closed.status,
        registrationStartsAt: closed.registrationStartsAt,
        registrationEndsAt: closed.registrationEndsAt,
        startsAt: closed.startsAt,
        participantCount: closed.participantCount,
        maxPlayers: closed.maxPlayers,
      },
      NOW,
    );
    expect(state).toBe("closed");
  });

  it("classifies a roster-full tournament as full from the listing payload alone", async () => {
    const rows = await getList();
    const full = rows.find((r) => r.id === "t-full")!;
    const state = getTournamentRegistrationState(
      {
        status: full.status,
        registrationStartsAt: full.registrationStartsAt,
        registrationEndsAt: full.registrationEndsAt,
        startsAt: full.startsAt,
        participantCount: full.participantCount,
        maxPlayers: full.maxPlayers,
      },
      NOW,
    );
    expect(state).toBe("full");
  });

  it("returns userRefunds=[] when no viewer is authenticated (regression guard for unauth path)", async () => {
    const rows = await getList();
    for (const row of rows) {
      expect(row.userRefunds).toEqual([]);
    }
  });
});
