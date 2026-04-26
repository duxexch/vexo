/**
 * Task #79 — Lock the four pagination boundaries of
 * `getDirectMessageHistory` against a real Postgres schema.
 *
 * Task #28 introduced the over-fetch-by-one trick so the storage
 * layer can return a *definitive* `hasMore` flag (in particular: the
 * "exactly-`limit` rows and no more" case must report
 * `hasMore: false`, not `true`). The boundary math is subtle enough
 * that a future refactor (keyset pagination, moving the limit clamp,
 * dropping the `+1` over-fetch) could silently break one boundary
 * while the other three keep working. This file pins all four:
 *
 *   1. 0 rows           → { messages: [], hasMore: false }
 *   2. N < limit        → { messages: N,  hasMore: false }
 *   3. N == limit       → { messages: N,  hasMore: false }   ← Task #28
 *   4. N > limit        → { messages: limit, hasMore: true } AND
 *                         the trimmed sentinel is the OLDEST row
 *                         excluded from this page, so the next
 *                         `before=page[0].createdAt` cursor returns it.
 *
 * Plus an ASC-order assertion on every returned page (the inbox UI
 * appends pages directly to its scroll buffer and relies on this).
 *
 * The test talks to the actual project Postgres via the same
 * `server/db` pool the production code uses — there is no in-memory
 * fake. We isolate by creating two throw-away test users with random
 * UUID-prefixed usernames, scope every assertion to messages between
 * those two users, and tear them (and their messages) down in
 * `afterAll`. `beforeEach` clears any messages from prior scenarios
 * so each spec starts from an empty conversation.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../../db";
import { chatMessages, users } from "../../../shared/schema";
import { getDirectMessageHistory } from "../direct-messages";

// Page size used for the "around the limit" boundary scenarios. Kept
// small so the test stays fast but big enough that off-by-one
// regressions (limit, limit-1, limit+1) are visible.
const PAGE_LIMIT = 5;

interface TestUser {
  id: string;
  username: string;
}

let userA: TestUser;
let userB: TestUser;
// Some other random user so we can assert the conversation filter
// excludes unrelated traffic from the page count.
let userC: TestUser;

async function createTestUser(label: string): Promise<TestUser> {
  const suffix = randomUUID();
  const username = `task79-${label}-${suffix}`;
  const [row] = await db
    .insert(users)
    .values({
      username,
      // `password` is notNull in the schema; value is irrelevant for
      // this test (we never authenticate). Use a placeholder marker
      // so the row is obviously synthetic if anyone inspects the DB.
      password: "task79-test-fixture-no-auth",
    })
    .returning({ id: users.id, username: users.username });
  return row;
}

async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  // Defence-in-depth: scrub any leftover messages first to satisfy
  // the FK from chat_messages.{sender,receiver}_id → users.id.
  await db
    .delete(chatMessages)
    .where(
      or(
        eq(chatMessages.senderId, user.id),
        eq(chatMessages.receiverId, user.id),
      ),
    );
  await db.delete(users).where(eq(users.id, user.id));
}

async function clearConversation(): Promise<void> {
  const ids = [userA.id, userB.id, userC.id];
  await db
    .delete(chatMessages)
    .where(
      and(
        inArray(chatMessages.senderId, ids),
        inArray(chatMessages.receiverId, ids),
      ),
    );
}

/**
 * Insert `count` text messages from `sender` to `receiver` with
 * monotonically increasing `createdAt` timestamps so DESC-order
 * pagination is fully deterministic regardless of clock resolution.
 *
 * `baseTime` is the timestamp of the OLDEST message; each subsequent
 * message is one second newer. Returns the inserted ids in
 * chronological (oldest → newest) order.
 *
 * Optional `flagsForIndex(i)` returns per-row deletion flags so a
 * single seeding pass can mix visible and soft-deleted rows. This
 * lets the deletion-filter scenarios in Task #114 reuse the same
 * timestamping/ordering logic as the pagination boundaries above.
 */
interface SeedRowFlags {
  deletedAt?: Date;
  deletedForUsers?: string[];
  contentSuffix?: string;
}

async function seedMessages(
  sender: TestUser,
  receiver: TestUser,
  count: number,
  baseTime: Date,
  flagsForIndex?: (i: number) => SeedRowFlags | undefined,
): Promise<string[]> {
  if (count === 0) return [];
  const rows = Array.from({ length: count }, (_, i) => {
    const flags = flagsForIndex?.(i);
    const suffix = flags?.contentSuffix ?? "task79";
    return {
      senderId: sender.id,
      receiverId: receiver.id,
      content: `${suffix}-msg-${i.toString().padStart(3, "0")}`,
      messageType: "text",
      createdAt: new Date(baseTime.getTime() + i * 1_000),
      ...(flags?.deletedAt ? { deletedAt: flags.deletedAt } : {}),
      ...(flags?.deletedForUsers
        ? { deletedForUsers: flags.deletedForUsers }
        : {}),
    };
  });
  const inserted = await db
    .insert(chatMessages)
    .values(rows)
    .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });
  // Postgres preserves insert order in `RETURNING` for a single
  // multi-row VALUES, but we resort by createdAt to be defensive
  // against any future planner change.
  inserted.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return at - bt;
  });
  return inserted.map((r) => r.id);
}

beforeAll(async () => {
  userA = await createTestUser("a");
  userB = await createTestUser("b");
  userC = await createTestUser("c");
});

afterAll(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
  await deleteTestUser(userC);
});

beforeEach(async () => {
  await clearConversation();
});

describe("getDirectMessageHistory — pagination boundaries (Task #79)", () => {
  it("boundary 1: empty conversation returns no messages and hasMore=false", async () => {
    const page = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it("boundary 2: partial page (N < limit) returns N rows in ASC order with hasMore=false", async () => {
    const N = PAGE_LIMIT - 2; // 3 messages, limit 5
    const baseTime = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    await seedMessages(userA, userB, N, baseTime);

    const page = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(N);
    expect(page.hasMore).toBe(false);
    // ASC: oldest first, newest last.
    for (let i = 1; i < page.messages.length; i += 1) {
      const prev = page.messages[i - 1].createdAt!.getTime();
      const cur = page.messages[i].createdAt!.getTime();
      expect(cur).toBeGreaterThan(prev);
    }
    // Content sanity check — first message should be the oldest seeded.
    expect(page.messages[0].content).toBe("task79-msg-000");
  });

  it("boundary 3 (Task #28 regression lock): exactly-full last page (N == limit) reports hasMore=false, not true", async () => {
    // This is THE bug Task #28 fixed: the old code reported
    // `hasMore = rows.length === limit`, which lit up the "load
    // older" affordance even when there was nothing older. We seed
    // exactly `limit` rows and expect the storage layer to return
    // all of them WITH `hasMore: false` because the over-fetch sees
    // no extra row.
    const N = PAGE_LIMIT;
    const baseTime = new Date(Date.UTC(2026, 0, 2, 12, 0, 0));
    await seedMessages(userA, userB, N, baseTime);

    const page = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(N);
    expect(page.hasMore).toBe(false); // ← Task #28 invariant
    // ASC order check.
    const times = page.messages.map((m) => m.createdAt!.getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("boundary 4: over-full conversation (N > limit) returns the newest `limit`, hasMore=true, and the trimmed sentinel is the next `before=` row", async () => {
    const N = PAGE_LIMIT + 3; // 8 messages, limit 5 → 3 trimmed
    const baseTime = new Date(Date.UTC(2026, 0, 3, 12, 0, 0));
    await seedMessages(userA, userB, N, baseTime);

    const page = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(PAGE_LIMIT);
    expect(page.hasMore).toBe(true);
    // ASC order in returned page.
    const times = page.messages.map((m) => m.createdAt!.getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);

    // The page should contain the `PAGE_LIMIT` *newest* messages —
    // i.e. indexes [N-PAGE_LIMIT .. N-1] from the seed.
    const expectedNewestContents = Array.from(
      { length: PAGE_LIMIT },
      (_, i) => `task79-msg-${(N - PAGE_LIMIT + i).toString().padStart(3, "0")}`,
    );
    expect(page.messages.map((m) => m.content)).toEqual(expectedNewestContents);

    // Now use `before = page[0].createdAt` to fetch the next older
    // page. The OLDEST row excluded by the first call (the trimmed
    // sentinel — i.e. index `N - PAGE_LIMIT - 1` from the seed)
    // MUST appear as the newest row of this next page, proving the
    // sentinel was correctly classified as "still belongs to the
    // not-yet-shown history" rather than dropped on the floor.
    const olderPage = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
      before: page.messages[0].createdAt!,
    });

    const expectedOlderContents = Array.from(
      { length: N - PAGE_LIMIT },
      (_, i) => `task79-msg-${i.toString().padStart(3, "0")}`,
    );
    expect(olderPage.messages.map((m) => m.content)).toEqual(
      expectedOlderContents,
    );
    // Sentinel row from the first call = newest of the older page.
    const sentinelContent = `task79-msg-${(N - PAGE_LIMIT - 1)
      .toString()
      .padStart(3, "0")}`;
    expect(olderPage.messages[olderPage.messages.length - 1].content).toBe(
      sentinelContent,
    );
    // Conversation has `N - PAGE_LIMIT` rows older than `page[0]`,
    // which is `< PAGE_LIMIT` here, so we've reached the start.
    expect(olderPage.hasMore).toBe(false);
  });

  it("conversation filter: messages to/from unrelated users do not inflate the page count or hasMore flag", async () => {
    // Seed exactly `limit` messages in the A↔B conversation (so
    // hasMore should be false) AND a noisy trailing batch from C to
    // both A and B at strictly newer timestamps. If the filter
    // leaks, the over-fetch will see those extra rows and either
    // bump hasMore to true OR crowd out a real A↔B row.
    const baseTime = new Date(Date.UTC(2026, 0, 4, 12, 0, 0));
    await seedMessages(userA, userB, PAGE_LIMIT, baseTime);
    const noiseTime = new Date(baseTime.getTime() + PAGE_LIMIT * 1_000 + 60_000);
    await seedMessages(userC, userA, 4, noiseTime);
    await seedMessages(userC, userB, 4, noiseTime);

    const page = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(PAGE_LIMIT);
    expect(page.hasMore).toBe(false);
    expect(
      page.messages.every(
        (m) =>
          (m.senderId === userA.id && m.receiverId === userB.id) ||
          (m.senderId === userB.id && m.receiverId === userA.id),
      ),
    ).toBe(true);
  });
});

/**
 * Task #114 — Lock both deletion-filter branches of
 * `getDirectMessageHistory` against a real Postgres schema.
 *
 * The conversation predicate filters out two distinct classes of
 * "deleted" messages, both of which exist on every chat surface in
 * the product:
 *
 *   1. Globally tombstoned rows — `deleted_at` is set, typically by
 *      the disappearing-message sweep or an "unsend for everyone"
 *      action. These rows must NEVER be returned to either party.
 *
 *   2. Per-user "delete for me" rows — `deleted_for_users` is a
 *      Postgres text[] containing the viewer ids who chose to hide
 *      this row from THEIR history while leaving it visible to the
 *      counterparty. The filter is therefore viewer-scoped: a row
 *      with `deleted_for_users = [userA.id]` is hidden from userA
 *      but still visible to userB.
 *
 * The Task #79 boundary tests above never seed deleted rows, so a
 * future refactor (swap `isNull(deleted_at)` for the wrong column,
 * drop the array predicate, regress on COALESCE for NULL arrays,
 * accidentally make the array predicate user-agnostic, etc.) would
 * silently land as one of two user-visible bugs:
 *
 *   - "messages I deleted are back in my history" (per-user filter
 *     regressed),
 *   - "messages someone else deleted leaked into my history" (per-user
 *     filter became user-agnostic), or
 *   - "tombstoned/expired messages reappeared after refresh" (global
 *     filter regressed).
 *
 * Each scenario seeds the offending row alongside one or more
 * always-visible rows, then asserts BOTH directional viewers
 * (userA's history and userB's history) see exactly the right rows.
 * The pagination invariants (ASC order, hasMore math) are re-checked
 * on every assertion so a regression cannot trade one invariant for
 * another and silently pass.
 */
describe("getDirectMessageHistory — deleted-message filtering (Task #114)", () => {
  /**
   * Helper: assert a page contains exactly the expected message
   * contents in oldest→newest order, and that the ASC invariant on
   * `createdAt` still holds. Centralised so each scenario reads as a
   * declaration of "viewer X should see exactly these contents".
   */
  function expectPageContents(
    page: { messages: { content: string; createdAt: Date | null }[] },
    expectedAscContents: string[],
    label: string,
  ): void {
    expect(
      page.messages.map((m) => m.content),
      `${label}: visible message contents`,
    ).toEqual(expectedAscContents);
    for (let i = 1; i < page.messages.length; i += 1) {
      const prev = page.messages[i - 1].createdAt!.getTime();
      const cur = page.messages[i].createdAt!.getTime();
      expect(
        cur,
        `${label}: ASC order at index ${i}`,
      ).toBeGreaterThanOrEqual(prev);
    }
  }

  it("globally tombstoned rows (deleted_at set) are excluded from BOTH viewers' histories", async () => {
    // Seed three rows from userA → userB at strictly increasing
    // timestamps, with the MIDDLE row globally tombstoned. Both
    // viewers must see only the first and third rows; the tombstone
    // must never leak in either direction.
    const baseTime = new Date(Date.UTC(2026, 1, 1, 12, 0, 0));
    await seedMessages(userA, userB, 3, baseTime, (i) =>
      i === 1
        ? {
            deletedAt: new Date(baseTime.getTime() + 30_000),
            contentSuffix: "task114-tombstoned",
          }
        : { contentSuffix: "task114-visible" },
    );

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromA,
      ["task114-visible-msg-000", "task114-visible-msg-002"],
      "userA",
    );
    expect(fromA.hasMore, "userA: hasMore").toBe(false);

    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromB,
      ["task114-visible-msg-000", "task114-visible-msg-002"],
      "userB",
    );
    expect(fromB.hasMore, "userB: hasMore").toBe(false);
  });

  it("'delete for me by userA' is hidden from userA but STILL VISIBLE to userB (viewer-scoped filter)", async () => {
    // Per-user filter is the most regression-prone of the two: a
    // refactor that makes it user-agnostic (e.g. drops the
    // `ARRAY[userId]` parameter) would simultaneously hide the row
    // from BOTH viewers, breaking userB's history. We assert the
    // asymmetry explicitly: same row, two viewers, two outcomes.
    const baseTime = new Date(Date.UTC(2026, 1, 2, 12, 0, 0));
    await seedMessages(userA, userB, 3, baseTime, (i) =>
      i === 1
        ? {
            deletedForUsers: [userA.id],
            contentSuffix: "task114-deletedForA",
          }
        : { contentSuffix: "task114-visible" },
    );

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromA,
      ["task114-visible-msg-000", "task114-visible-msg-002"],
      "userA (deleted-for-me)",
    );
    expect(fromA.hasMore, "userA (deleted-for-me): hasMore").toBe(false);

    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromB,
      [
        "task114-visible-msg-000",
        "task114-deletedForA-msg-001",
        "task114-visible-msg-002",
      ],
      "userB (counterparty still sees the row)",
    );
    expect(fromB.hasMore, "userB: hasMore").toBe(false);
  });

  it("'delete for me by userB' is hidden from userB but STILL VISIBLE to userA (symmetric viewer-scoping)", async () => {
    // Symmetric to the previous test, with sender=userB. Both
    // directions must share the same viewer-scoping logic — a
    // regression that asymmetrically applies the filter (e.g. only
    // checks the receiver, or only checks the sender) would pass
    // one of these two tests and fail the other.
    const baseTime = new Date(Date.UTC(2026, 1, 3, 12, 0, 0));
    await seedMessages(userB, userA, 3, baseTime, (i) =>
      i === 1
        ? {
            deletedForUsers: [userB.id],
            contentSuffix: "task114-deletedForB",
          }
        : { contentSuffix: "task114-visibleB" },
    );

    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromB,
      ["task114-visibleB-msg-000", "task114-visibleB-msg-002"],
      "userB (deleted-for-me)",
    );
    expect(fromB.hasMore, "userB (deleted-for-me): hasMore").toBe(false);

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromA,
      [
        "task114-visibleB-msg-000",
        "task114-deletedForB-msg-001",
        "task114-visibleB-msg-002",
      ],
      "userA (counterparty still sees the row)",
    );
    expect(fromA.hasMore, "userA: hasMore").toBe(false);
  });

  it("a row deleted-for-userA AND globally tombstoned is excluded from BOTH viewers (defense-in-depth)", async () => {
    // The two filters compose with AND, not OR: tombstoned-and-also-
    // deleted-for-A is hidden everywhere. This asserts neither filter
    // can be silently dropped in favour of the other (e.g. someone
    // notices the global tombstone "already covers" this row and
    // deletes the per-user check, regressing the asymmetric scenario
    // above).
    const baseTime = new Date(Date.UTC(2026, 1, 4, 12, 0, 0));
    await seedMessages(userA, userB, 2, baseTime, (i) =>
      i === 0
        ? {
            deletedAt: new Date(baseTime.getTime()),
            deletedForUsers: [userA.id],
            contentSuffix: "task114-doublyDeleted",
          }
        : { contentSuffix: "task114-survivor" },
    );

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromA,
      ["task114-survivor-msg-001"],
      "userA (doubly-deleted excluded)",
    );

    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromB,
      ["task114-survivor-msg-001"],
      "userB (doubly-deleted excluded by global filter even though not in user list)",
    );
  });

  it("multi-element deleted_for_users array hides the row only from listed viewers, never from others", async () => {
    // The `@> ARRAY[userId]` containment check must hide a row whose
    // `deleted_for_users` array contains the viewer alongside other
    // ids — and conversely, must NOT hide it from a viewer not
    // listed. This guards against a regression that compares the
    // array for equality with `[userId]` instead of containment.
    const baseTime = new Date(Date.UTC(2026, 1, 5, 12, 0, 0));
    // We need a third party in the array to make the multi-element
    // check meaningful — userC is set up in beforeAll for exactly
    // this kind of cross-traffic scenario.
    await seedMessages(userA, userB, 2, baseTime, (i) =>
      i === 0
        ? {
            deletedForUsers: [userA.id, userC.id],
            contentSuffix: "task114-deletedForAandC",
          }
        : { contentSuffix: "task114-control" },
    );

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromA,
      ["task114-control-msg-001"],
      "userA (in the per-user list, hidden)",
    );

    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromB,
      [
        "task114-deletedForAandC-msg-000",
        "task114-control-msg-001",
      ],
      "userB (NOT in the per-user list, still sees the row)",
    );
  });

  it("hasMore over-fetch ignores deleted rows: PAGE_LIMIT visible + deleted noise reports hasMore=false", async () => {
    // The `+1` over-fetch trick from Task #28 runs at the SQL level
    // — soft-deleted rows must be filtered out by the WHERE clause,
    // not by a post-query JS filter that would let the over-fetch
    // overcount. We seed exactly PAGE_LIMIT visible rows AND several
    // deleted rows interleaved between them. If the deletion filters
    // were dropped or applied post-query, the over-fetch would see
    // > PAGE_LIMIT rows and report `hasMore: true` — silently
    // resurrecting the "exactly-full last page" Task #28 bug for
    // any conversation that contains deletions.
    const baseTime = new Date(Date.UTC(2026, 1, 6, 12, 0, 0));
    // 8 rows total: indices [0,2,4,5,7] visible (5 rows = PAGE_LIMIT),
    //               indices [1,3,6] deleted (1 tombstone, 2 per-user-A).
    const visibleIdx = new Set([0, 2, 4, 5, 7]);
    const tombstoneIdx = new Set([1]);
    const perUserAIdx = new Set([3, 6]);
    await seedMessages(userA, userB, 8, baseTime, (i) => {
      if (visibleIdx.has(i)) {
        return { contentSuffix: "task114-pagecount-visible" };
      }
      if (tombstoneIdx.has(i)) {
        return {
          deletedAt: new Date(baseTime.getTime() + i * 1_000),
          contentSuffix: "task114-pagecount-tombstone",
        };
      }
      if (perUserAIdx.has(i)) {
        return {
          deletedForUsers: [userA.id],
          contentSuffix: "task114-pagecount-deletedForA",
        };
      }
      return undefined;
    });

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expect(
      fromA.messages,
      "userA: should see exactly the 5 visible rows",
    ).toHaveLength(PAGE_LIMIT);
    expect(
      fromA.messages.map((m) => m.content),
      "userA: only visible rows, in ASC order",
    ).toEqual([
      "task114-pagecount-visible-msg-000",
      "task114-pagecount-visible-msg-002",
      "task114-pagecount-visible-msg-004",
      "task114-pagecount-visible-msg-005",
      "task114-pagecount-visible-msg-007",
    ]);
    expect(
      fromA.hasMore,
      "userA: hasMore must be false — deleted rows must be filtered at SQL level, not post-query",
    ).toBe(false);

    // Sanity: userB sees the per-user-deleted-for-A rows too.
    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT + 5, // give B enough room for all visible-to-B rows
    });
    // userB sees 7 rows total: 5 visible-to-everyone + 2 deletedForA
    // (still visible to B because B is not in the per-user list).
    // The 1 globally-tombstoned row is hidden from B too.
    expect(
      fromB.messages.map((m) => m.content).sort(),
      "userB sees visible + deletedForA rows, but NOT the tombstoned row",
    ).toEqual([
      "task114-pagecount-deletedForA-msg-003",
      "task114-pagecount-deletedForA-msg-006",
      "task114-pagecount-visible-msg-000",
      "task114-pagecount-visible-msg-002",
      "task114-pagecount-visible-msg-004",
      "task114-pagecount-visible-msg-005",
      "task114-pagecount-visible-msg-007",
    ]);
  });

  it("rows with NULL deleted_for_users (not just []) are still visible — guards the COALESCE branch", async () => {
    // The SQL uses
    //   NOT (COALESCE(deleted_for_users, ARRAY[]::text[]) @> ARRAY[$1])
    // The COALESCE is necessary because pre-default-migration rows
    // can have NULL in this column, and `NULL @> anything` is NULL
    // in Postgres — which would flip `NOT NULL` to UNKNOWN and
    // exclude the row from the result set. We assert here that a
    // NULL row is treated as "not deleted for anyone" and stays
    // visible. A regression that drops the COALESCE would hide
    // every legacy row in production and only show as a "history is
    // empty" bug for affected conversations.
    const baseTime = new Date(Date.UTC(2026, 1, 7, 12, 0, 0));
    // Insert a row with deleted_for_users explicitly set to NULL.
    await db.insert(chatMessages).values({
      senderId: userA.id,
      receiverId: userB.id,
      content: "task114-nullArray-msg-000",
      messageType: "text",
      createdAt: baseTime,
      deletedForUsers: null,
    });

    const fromA = await getDirectMessageHistory({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromA,
      ["task114-nullArray-msg-000"],
      "userA (NULL array means 'not deleted for anyone')",
    );

    const fromB = await getDirectMessageHistory({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
    });
    expectPageContents(
      fromB,
      ["task114-nullArray-msg-000"],
      "userB (NULL array means 'not deleted for anyone')",
    );
  });
});
