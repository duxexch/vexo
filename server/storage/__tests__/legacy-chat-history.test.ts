/**
 * Task #80 — Lock the four pagination boundaries of the legacy
 * chat-history helper (`getLegacyChatHistoryPage`) against the real
 * Postgres schema.
 *
 * Mirrors the Task #79 boundary lock for the realtime DM history
 * (`getDirectMessageHistory`). Same four boundaries, same `hasMore`
 * semantics, same Task #28 "exactly-full last page" regression
 * guard. We test the legacy helper specifically because both the
 * legacy HTTP route (`GET /api/chat/:userId/messages`) and the
 * legacy WebSocket `chat_history` event handler now go through it,
 * so a single boundary regression here would simultaneously break
 * both fallback paths consumed by stale clients and by the WS
 * bridge when the realtime DM transport is unavailable.
 *
 * Two filter modes exist on the helper:
 *   - `applyDeletionFilters: false` — preserves the historical HTTP
 *     route behaviour (no soft-delete filtering).
 *   - `applyDeletionFilters: true`  — pushes both `deleted_at` and
 *     per-user `deleted_for_users` filters into SQL so the over-fetch
 *     math stays accurate (matches the WS handler's pre-Task-#80
 *     visible row set).
 *
 * Both modes are exercised below. Test isolation, seeding, and
 * cleanup follow the same pattern as Task #79's test (uuid-suffixed
 * throw-away users; explicit monotonic createdAt; FK-safe teardown).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../../db";
import { chatMessages, users } from "../../../shared/schema";
import { getLegacyChatHistoryPage } from "../legacy-chat-history";

const PAGE_LIMIT = 5;

interface TestUser {
  id: string;
  username: string;
}

let userA: TestUser;
let userB: TestUser;
let userC: TestUser;

async function createTestUser(label: string): Promise<TestUser> {
  const suffix = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      username: `task80-${label}-${suffix}`,
      password: "task80-test-fixture-no-auth",
    })
    .returning({ id: users.id, username: users.username });
  return row;
}

async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
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

async function seedMessages(
  sender: TestUser,
  receiver: TestUser,
  count: number,
  baseTime: Date,
  extras: Partial<{
    deletedAt: Date;
    deletedForUsers: string[];
    messageType: string;
  }> = {},
): Promise<string[]> {
  if (count === 0) return [];
  const rows = Array.from({ length: count }, (_, i) => ({
    senderId: sender.id,
    receiverId: receiver.id,
    content: `task80-msg-${i.toString().padStart(3, "0")}`,
    messageType: extras.messageType ?? "text",
    createdAt: new Date(baseTime.getTime() + i * 1_000),
    deletedAt: extras.deletedAt ?? null,
    deletedForUsers: extras.deletedForUsers ?? [],
  }));
  const inserted = await db
    .insert(chatMessages)
    .values(rows)
    .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });
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

describe("getLegacyChatHistoryPage — pagination boundaries (Task #80)", () => {
  it("boundary 1: empty conversation returns no messages and hasMore=false", async () => {
    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });
    expect(page.messages).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it("boundary 2: partial page (N < limit) returns N rows in ASC order with hasMore=false", async () => {
    const N = PAGE_LIMIT - 2;
    const baseTime = new Date(Date.UTC(2026, 1, 1, 12, 0, 0));
    await seedMessages(userA, userB, N, baseTime);

    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(N);
    expect(page.hasMore).toBe(false);
    for (let i = 1; i < page.messages.length; i += 1) {
      const prev = page.messages[i - 1].createdAt!.getTime();
      const cur = page.messages[i].createdAt!.getTime();
      expect(cur).toBeGreaterThan(prev);
    }
    expect(page.messages[0].content).toBe("task80-msg-000");
  });

  it("boundary 3 (Task #28 regression lock): exactly-full last page (N == limit) reports hasMore=false, not true", async () => {
    // The bug Task #28 fixed for the realtime path — and that this
    // helper now also fixes for the legacy HTTP + WS paths: when the
    // last page is exactly `limit` rows and there is *nothing* older,
    // the old `hasMore = (rows.length === limit)` heuristic wrongly
    // lit up "load older" forever. Over-fetch-by-one resolves it.
    const N = PAGE_LIMIT;
    const baseTime = new Date(Date.UTC(2026, 1, 2, 12, 0, 0));
    await seedMessages(userA, userB, N, baseTime);

    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(N);
    expect(page.hasMore).toBe(false); // ← Task #28 / Task #80 invariant
    const times = page.messages.map((m) => m.createdAt!.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("boundary 4: over-full conversation (N > limit) returns the newest `limit`, hasMore=true, and the next offset cursor includes the trimmed sentinel", async () => {
    const N = PAGE_LIMIT + 3;
    const baseTime = new Date(Date.UTC(2026, 1, 3, 12, 0, 0));
    await seedMessages(userA, userB, N, baseTime);

    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
    });

    expect(page.messages).toHaveLength(PAGE_LIMIT);
    expect(page.hasMore).toBe(true);
    const expectedNewestContents = Array.from(
      { length: PAGE_LIMIT },
      (_, i) => `task80-msg-${(N - PAGE_LIMIT + i).toString().padStart(3, "0")}`,
    );
    expect(page.messages.map((m) => m.content)).toEqual(expectedNewestContents);

    // Legacy paths page by `offset` (not `before=` cursor). Asking
    // for the next page with offset = PAGE_LIMIT must yield the rows
    // that were trimmed from the over-fetch — i.e. starting with the
    // sentinel — and hasMore must drop to false because the
    // remaining `N - PAGE_LIMIT` rows fit in one page.
    const olderPage = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
      offset: PAGE_LIMIT,
    });

    const expectedOlderContents = Array.from(
      { length: N - PAGE_LIMIT },
      (_, i) => `task80-msg-${i.toString().padStart(3, "0")}`,
    );
    expect(olderPage.messages.map((m) => m.content)).toEqual(
      expectedOlderContents,
    );
    // Sentinel = row at seed index `N - PAGE_LIMIT - 1`, which is the
    // newest row of the older page after ASC reverse.
    const sentinelContent = `task80-msg-${(N - PAGE_LIMIT - 1)
      .toString()
      .padStart(3, "0")}`;
    expect(olderPage.messages[olderPage.messages.length - 1].content).toBe(
      sentinelContent,
    );
    expect(olderPage.hasMore).toBe(false);
  });
});

describe("getLegacyChatHistoryPage — applyDeletionFilters semantics (Task #80)", () => {
  it("applyDeletionFilters=false: returns soft-deleted rows (preserves legacy HTTP behaviour)", async () => {
    const baseTime = new Date(Date.UTC(2026, 1, 4, 12, 0, 0));
    // Two visible rows + one globally-tombstoned row.
    await seedMessages(userA, userB, 2, baseTime);
    await seedMessages(userA, userB, 1, new Date(baseTime.getTime() + 5_000), {
      deletedAt: new Date(),
    });

    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
      applyDeletionFilters: false,
    });

    // All 3 rows visible — including the deleted one — because the
    // legacy HTTP route never filtered.
    expect(page.messages).toHaveLength(3);
    expect(page.hasMore).toBe(false);
  });

  it("applyDeletionFilters=true: hides globally-deleted rows AND viewer's per-user-deleted rows, keeps definitive hasMore", async () => {
    const baseTime = new Date(Date.UTC(2026, 1, 5, 12, 0, 0));
    // Visible row 1
    await seedMessages(userA, userB, 1, baseTime);
    // Globally tombstoned row — should be hidden in both viewers
    await seedMessages(
      userA,
      userB,
      1,
      new Date(baseTime.getTime() + 1_000),
      { deletedAt: new Date() },
    );
    // "Delete for me" by userA — hidden from userA, visible to userB
    await seedMessages(
      userB,
      userA,
      1,
      new Date(baseTime.getTime() + 2_000),
      { deletedForUsers: [userA.id] },
    );
    // "Delete for me" by userB — visible to userA, hidden from userB
    await seedMessages(
      userA,
      userB,
      1,
      new Date(baseTime.getTime() + 3_000),
      { deletedForUsers: [userB.id] },
    );
    // Visible row 2
    await seedMessages(userB, userA, 1, new Date(baseTime.getTime() + 4_000));

    const pageA = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
      applyDeletionFilters: true,
    });
    // userA sees: visible1 + visible_for_userA_only + visible2 = 3
    expect(pageA.messages).toHaveLength(3);
    expect(pageA.hasMore).toBe(false);
    // None of the returned rows are tombstoned or deleted-for-userA.
    for (const m of pageA.messages) {
      expect(m.deletedAt).toBeNull();
      expect(m.deletedForUsers ?? []).not.toContain(userA.id);
    }

    const pageB = await getLegacyChatHistoryPage({
      userId: userB.id,
      peerId: userA.id,
      limit: PAGE_LIMIT,
      applyDeletionFilters: true,
    });
    // userB sees: visible1 + visible_for_userB_only + visible2 = 3
    expect(pageB.messages).toHaveLength(3);
    expect(pageB.hasMore).toBe(false);
    for (const m of pageB.messages) {
      expect(m.deletedAt).toBeNull();
      expect(m.deletedForUsers ?? []).not.toContain(userB.id);
    }
  });

  it("applyDeletionFilters=true: page composition is the corrected SQL-filtered set, not the pre-Task-#80 short-page output", async () => {
    // Pre-Task-#80, the WS handler called SQL with limit/offset and
    // *then* dropped `deleted_for_users` rows in JavaScript. So a
    // request for (limit=3, offset=0) over a window that contained
    // [visible, deleted-for-me, visible, deleted-for-me, visible]
    // would return a short 3-row window from SQL with two trimmed
    // out -> only the FIRST row visible to the viewer. The fix
    // pushes the filter into SQL so the same request now returns 3
    // visible rows. This test locks the corrected behaviour so a
    // future "hey, let's restore the JS trim" refactor would fail.
    const baseTime = new Date(Date.UTC(2026, 1, 7, 12, 0, 0));
    // Interleaved seed pattern (oldest -> newest):
    //   v0  d1  v2  d3  v4  v5
    // where dN are "deleted for userA". All rows are A↔B traffic.
    await seedMessages(userA, userB, 1, baseTime); // v0
    await seedMessages(
      userA,
      userB,
      1,
      new Date(baseTime.getTime() + 1_000),
      { deletedForUsers: [userA.id] },
    ); // d1
    await seedMessages(userA, userB, 1, new Date(baseTime.getTime() + 2_000)); // v2
    await seedMessages(
      userA,
      userB,
      1,
      new Date(baseTime.getTime() + 3_000),
      { deletedForUsers: [userA.id] },
    ); // d3
    await seedMessages(userA, userB, 1, new Date(baseTime.getTime() + 4_000)); // v4
    await seedMessages(userA, userB, 1, new Date(baseTime.getTime() + 5_000)); // v5

    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: 3,
      offset: 0,
      applyDeletionFilters: true,
    });
    // Corrected behaviour: 3 visible rows = [v2, v4, v5] (DESC then
    // reversed -> ASC). Pre-#80 would have returned [v4, v5] only
    // (2 rows, short page) and `hasMore` would have been wrong.
    // We discriminate by createdAt because every single-row seed
    // call uses content index 0 (i.e. all six seeded rows share
    // content "task80-msg-000"), so timestamps are the unique tag.
    expect(page.messages).toHaveLength(3);
    const times = page.messages.map((m) => m.createdAt!.getTime());
    expect(times).toEqual([
      baseTime.getTime() + 2_000, // v2
      baseTime.getTime() + 4_000, // v4
      baseTime.getTime() + 5_000, // v5
    ]);
    // None of the returned rows are deleted-for-userA.
    for (const m of page.messages) {
      expect(m.deletedForUsers ?? []).not.toContain(userA.id);
    }
    // hasMore is true because v0 is older and visible.
    expect(page.hasMore).toBe(true);

    // Next page should yield v0 alone with hasMore=false.
    const olderPage = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: 3,
      offset: 3,
      applyDeletionFilters: true,
    });
    expect(olderPage.messages).toHaveLength(1);
    expect(olderPage.messages[0].createdAt!.getTime()).toBe(baseTime.getTime());
    expect(olderPage.hasMore).toBe(false);
  });

  it("Task #116 — legacy HTTP route `GET /api/chat/:userId/messages` arg shape hides BOTH globally-tombstoned and viewer-deleted rows", async () => {
    // Lock the corrected behaviour for the legacy HTTP route
    // specifically. Pre-Task-#116 the route called the helper with
    // `applyDeletionFilters: false` and would re-surface deleted
    // messages back into the inbox via the fallback / sync surfaces
    // (`ChatBubblesLayer.tsx` ~lines 475/515 and `use-chat.tsx`
    // ~line 952). After Task #116 the route calls the helper with
    // `applyDeletionFilters: true` — same as the realtime DM endpoint
    // and the WS `chat_history` handler — so the union of rows the
    // route returns must equal {visible-to-viewer} \ {tombstoned ∪
    // deleted-for-viewer}, regardless of whether the deleted row is
    // older, newer, or interleaved with visible ones.
    const baseTime = new Date(Date.UTC(2026, 1, 8, 12, 0, 0));
    // Visible row from A (oldest)
    await seedMessages(userA, userB, 1, baseTime);
    // Globally tombstoned row — must be hidden from BOTH viewers
    await seedMessages(
      userA,
      userB,
      1,
      new Date(baseTime.getTime() + 1_000),
      { deletedAt: new Date() },
    );
    // "Delete for me" by userA — must be hidden from userA's call,
    // visible to userB's call
    await seedMessages(
      userB,
      userA,
      1,
      new Date(baseTime.getTime() + 2_000),
      { deletedForUsers: [userA.id] },
    );
    // Visible row from B (newest)
    await seedMessages(userB, userA, 1, new Date(baseTime.getTime() + 3_000));

    // Mirrors the route handler's call exactly (default limit/offset,
    // applyDeletionFilters: true). The route returns `page.messages`
    // directly to the client, so we assert against that array.
    const routeArgs = {
      limit: 50,
      offset: 0,
      applyDeletionFilters: true as const,
    };

    const aPage = await getLegacyChatHistoryPage({
      ...routeArgs,
      userId: userA.id,
      peerId: userB.id,
    });
    // userA should see exactly the two undeleted A↔B rows.
    expect(aPage.messages).toHaveLength(2);
    expect(aPage.hasMore).toBe(false);
    for (const m of aPage.messages) {
      expect(m.deletedAt).toBeNull();
      expect(m.deletedForUsers ?? []).not.toContain(userA.id);
    }
    // The deleted-for-userA row's timestamp must NOT appear in userA's
    // page — guards against a regression where the route reverts to
    // `applyDeletionFilters: false` (which would re-surface it).
    const aTimes = aPage.messages.map((m) => m.createdAt!.getTime());
    expect(aTimes).not.toContain(baseTime.getTime() + 2_000);
    // Tombstoned row also absent.
    expect(aTimes).not.toContain(baseTime.getTime() + 1_000);

    const bPage = await getLegacyChatHistoryPage({
      ...routeArgs,
      userId: userB.id,
      peerId: userA.id,
    });
    // userB sees the two visible rows AND the row userA "deleted for
    // me" (because per-user tombstones are viewer-scoped). Globally
    // deleted row is still hidden.
    expect(bPage.messages).toHaveLength(3);
    expect(bPage.hasMore).toBe(false);
    for (const m of bPage.messages) {
      expect(m.deletedAt).toBeNull();
      expect(m.deletedForUsers ?? []).not.toContain(userB.id);
    }
    const bTimes = bPage.messages.map((m) => m.createdAt!.getTime());
    expect(bTimes).toContain(baseTime.getTime() + 2_000);
    expect(bTimes).not.toContain(baseTime.getTime() + 1_000);
  });

  it("applyDeletionFilters=true: SQL filter keeps hasMore definitive even when over-fetched rows would otherwise be JS-filtered out", async () => {
    // Pre-Task-#80 the WS handler filtered deleted_for_users in JS
    // *after* the SQL fetch. With limit=5, an over-fetch would pull
    // 6 rows; if 2 of those 6 were deleted-for-userA, the JS trim
    // would leave 4 visible rows AND mis-report hasMore. The fix
    // pushes the filter into SQL so this scenario behaves correctly.
    const baseTime = new Date(Date.UTC(2026, 1, 6, 12, 0, 0));
    // Seed exactly PAGE_LIMIT visible rows for userA.
    await seedMessages(userA, userB, PAGE_LIMIT, baseTime);
    // Seed 2 deleted-for-userA rows interleaved at newer timestamps.
    await seedMessages(
      userA,
      userB,
      2,
      new Date(baseTime.getTime() + PAGE_LIMIT * 1_000 + 1_000),
      { deletedForUsers: [userA.id] },
    );

    const page = await getLegacyChatHistoryPage({
      userId: userA.id,
      peerId: userB.id,
      limit: PAGE_LIMIT,
      applyDeletionFilters: true,
    });
    expect(page.messages).toHaveLength(PAGE_LIMIT);
    // Critical: definitive `hasMore=false`. With JS-after-fetch the
    // old code would have returned hasMore=true here.
    expect(page.hasMore).toBe(false);
  });
});
