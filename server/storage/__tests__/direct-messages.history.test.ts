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
 */
async function seedMessages(
  sender: TestUser,
  receiver: TestUser,
  count: number,
  baseTime: Date,
): Promise<string[]> {
  if (count === 0) return [];
  const rows = Array.from({ length: count }, (_, i) => ({
    senderId: sender.id,
    receiverId: receiver.id,
    content: `task79-msg-${i.toString().padStart(3, "0")}`,
    messageType: "text",
    createdAt: new Date(baseTime.getTime() + i * 1_000),
  }));
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
