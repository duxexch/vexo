/**
 * Task #78 — Catch DM scroll-jump regressions with an automated test.
 *
 * What this test guards against
 * -----------------------------
 * The DM thread renders messages oldest-first inside a vertical
 * scroll container. When the user scrolls near the top, the chat
 * page calls `loadMoreMessages()` to fetch the next OLDER page and
 * prepends it to the messages array. Without scroll-anchoring this
 * prepend visually yanks the user from the message they were reading
 * down to a brand-new offset (the height of the just-prepended page,
 * commonly 600–1500 px), which feels like the thread "jumped". The
 * prior shipped fix (Task #27) used a `scrollHeight` snapshot-delta
 * formula, which kept the user pinned in the simple case but drifted
 * by exactly the height of any bottom-arriving message that landed
 * between the snapshot and the prepend (because the delta also
 * absorbed the bottom append).
 *
 * Task #78 introduces an id-based offsetTop hook
 * (`useScrollAnchorOnPrepend`) that is concurrent-safe by
 * construction: bottom appends never change the anchor message's
 * `offsetTop`, so the restore formula is independent of them. This
 * test exercises the real hook (not a re-implementation) inside a
 * tiny React harness mounted in jsdom, simulating the DM container
 * with controllable layout, and asserts the anchor message's
 * viewport-relative Y position is preserved within strict bounds
 * across every prepend scenario — including the concurrent
 * incoming-bottom-message case that the previous formula failed.
 *
 * Why a harness instead of mounting the real <Chat /> page?
 *   The DM page wires up auth, websockets, react-query, i18n, sound,
 *   route guards, file uploads, calls — none of which the scroll-
 *   anchor invariant depends on. Mounting it would require >20
 *   provider mocks and would not exercise the hook's contract any
 *   more rigorously than mounting the hook directly. The harness
 *   below uses the EXACT same hook the page does (verified via the
 *   import path), so a regression in the hook fails this test, and
 *   a regression in how chat.tsx wires the hook is caught by the
 *   call-site assertions at the bottom of this file.
 *
 * Why we patch jsdom layout
 *   jsdom does not implement layout — `offsetTop`, `offsetHeight`,
 *   `scrollHeight`, and `clientHeight` all return 0. We override
 *   them via `Object.defineProperty` so the harness behaves like a
 *   real browser for the hook's read-only geometry queries. The
 *   `scrollTop` setter is left as a real property because jsdom
 *   already supports it as mutable state — that's the property the
 *   hook writes to during restore, and the property our assertions
 *   read.
 *
 * Seeding helper
 *   `seedDmHistory(pages, msgsPerPage)` returns
 *   `{ allMessages, pageBoundaries }`. Each call to the harness's
 *   `loadOlderPage()` prepends one page worth of older rows from
 *   that pre-built array, mimicking the server returning the next
 *   older page. Three full pages are seeded by default to satisfy
 *   the task spec ("at least 3 pages of history").
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useRef, useState } from "react";
import { render, act } from "@testing-library/react";
import {
  useScrollAnchorOnPrepend,
  type ScrollAnchorApi,
} from "@/hooks/use-scroll-anchor-on-prepend";

// ---------------------------------------------------------------------------
// Test fixtures: messages and seeding
// ---------------------------------------------------------------------------

type FixtureMessage = {
  id: string;
  /** Layout height we'll claim for this message's row in jsdom (px). */
  height: number;
  /** Body — only used if you want to debug a failure visually. */
  body: string;
};

const VIEWPORT_HEIGHT = 600;
const DEFAULT_MSG_HEIGHT = 60;

/**
 * Pre-build N pages of history. Page 0 is the NEWEST (already on
 * screen at first render), pages 1..N-1 are progressively OLDER and
 * are revealed one at a time by `loadOlderPage()`.
 *
 * The id format `p<page>-m<index>` makes failures readable without
 * a separate id->label map.
 */
function seedDmHistory(
  pages: number,
  msgsPerPage: number,
): {
  /** All messages flat, ordered oldest -> newest. */
  allMessages: FixtureMessage[];
  /**
   * `pageBoundaries[i]` = number of messages NEWER than (or equal to
   * the start of) page i. So `allMessages.slice(pageBoundaries[1])`
   * is the initially-rendered newest page.
   */
  pageBoundaries: number[];
} {
  const allMessages: FixtureMessage[] = [];
  const pageBoundaries: number[] = [];
  // Build oldest -> newest so prepending an older page is a simple
  // `slice` on the front.
  for (let p = pages - 1; p >= 0; p--) {
    pageBoundaries.unshift(allMessages.length);
    for (let m = 0; m < msgsPerPage; m++) {
      allMessages.push({
        id: `p${p}-m${m}`,
        height: DEFAULT_MSG_HEIGHT,
        body: `page ${p} msg ${m}`,
      });
    }
  }
  // pageBoundaries currently lists offsets to the START of each page
  // in NEWEST-first order. Reverse so index 0 = newest page start
  // (where rendering begins), index N-1 = oldest page start.
  return { allMessages, pageBoundaries };
}

// ---------------------------------------------------------------------------
// Layout patcher: make jsdom report real geometry
// ---------------------------------------------------------------------------

/**
 * Stamp deterministic layout onto a scroll container and its message
 * children. Must be re-run after every render that changes the set
 * of children (React commit -> hook layout effect -> our restore).
 *
 * Cumulative offsetTop is computed from each child's recorded
 * height; total scrollHeight is the sum.
 */
function patchLayout(
  container: HTMLElement,
  heightById: Map<string, number>,
): void {
  let cursor = 0;
  // Use children (not childNodes) so text nodes don't shift offsets.
  for (const child of Array.from(container.children)) {
    const id = child.getAttribute("data-message-id");
    const h = id !== null ? heightById.get(id) ?? DEFAULT_MSG_HEIGHT : 0;
    // CRITICAL: capture `cursor` in a per-iteration const. Without
    // this the getter would close over the mutable loop variable and
    // every child would report the final total scrollHeight as its
    // offsetTop — silently wrong, and indistinguishable from a real
    // restore in some scenarios. Using a const-bound snapshot per
    // iteration locks each child's offsetTop to its actual cumulative
    // y at definition time.
    const offsetTopValue = cursor;
    Object.defineProperty(child, "offsetTop", {
      configurable: true,
      get: () => offsetTopValue,
    });
    Object.defineProperty(child, "offsetHeight", {
      configurable: true,
      get: () => h,
    });
    Object.defineProperty(child, "offsetParent", {
      configurable: true,
      get: () => container,
    });
    cursor += h;
  }
  const totalHeight = cursor;
  Object.defineProperty(container, "scrollHeight", {
    configurable: true,
    get: () => totalHeight,
  });
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    get: () => VIEWPORT_HEIGHT,
  });
}

// ---------------------------------------------------------------------------
// Harness: a minimal DM-like component that uses the real hook
// ---------------------------------------------------------------------------

interface HarnessHandle {
  /** Current rendered messages (oldest -> newest), mirrors hook input. */
  getMessages: () => FixtureMessage[];
  /** The scroll container DOM node. */
  getContainer: () => HTMLElement;
  /** Set scrollTop, then call the hook's snapshot. Mirrors the real handleScroll. */
  scrollAndSnapshot: (newScrollTop: number) => void;
  /** Mutate the messages list (compose prepend + concurrent append however the test wants). */
  setMessages: (updater: (prev: FixtureMessage[]) => FixtureMessage[]) => void;
}

function mountHarness(seedNewestPage: FixtureMessage[]): {
  handle: HarnessHandle;
  unmount: () => void;
} {
  // The handle object reference is stable across renders; only its
  // closure-captured methods are re-bound each commit so they see
  // the latest React state and hook API.
  const handle: Partial<HarnessHandle> = {};

  function Harness() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState<FixtureMessage[]>(seedNewestPage);
    const api: ScrollAnchorApi = useScrollAnchorOnPrepend({
      scrollContainerRef: containerRef,
      messages,
    });

    // Build the layout map fresh every render so the ref callback
    // below sees current message heights.
    const heightById = new Map(messages.map((m) => [m.id, m.height]));

    // Bind the handle methods every render so they observe the
    // latest `messages`, `api`, and `setMessages`. `act()` ensures
    // each test driver call is followed by a render before the next
    // assertion reads from the handle.
    handle.getMessages = () => messages;
    handle.getContainer = () => containerRef.current!;
    handle.scrollAndSnapshot = (newScrollTop: number) => {
      const c = containerRef.current!;
      c.scrollTop = newScrollTop;
      api.snapshotForPrepend();
    };
    handle.setMessages = setMessages;

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          // Re-stamp layout SYNCHRONOUSLY during commit. React runs
          // ref callbacks before any `useLayoutEffect`, so by the
          // time the hook's restore effect reads `offsetTop` on the
          // anchor message, the new geometry is already in place.
          // Without this ordering the hook would see all-zero layout
          // (jsdom default) and the restore math would be garbage.
          if (node) patchLayout(node, heightById);
        }}
        data-testid="dm-scroll-container"
        style={{ overflow: "auto", height: VIEWPORT_HEIGHT }}
      >
        {messages.map((m) => (
          <div key={m.id} data-message-id={m.id}>
            {m.body}
          </div>
        ))}
      </div>
    );
  }

  const result = render(<Harness />);
  return { handle: handle as HarnessHandle, unmount: result.unmount };
}

// ---------------------------------------------------------------------------
// Helper: drive a prepend (and optional concurrent bottom append) and
// return the anchor message's viewport-relative Y delta in pixels.
// ---------------------------------------------------------------------------

interface PrependResult {
  anchorViewportYBefore: number;
  anchorViewportYAfter: number;
  /** Absolute |delta| in pixels — what the user perceives as "jump". */
  yDeltaPx: number;
  /** scrollTop the hook restored to. */
  finalScrollTop: number;
  /** scrollHeight after the prepend. */
  finalScrollHeight: number;
}

function performPrependAndMeasure(
  handle: HarnessHandle,
  olderPage: FixtureMessage[],
  scrollTopAtTrigger: number,
  options: { concurrentBottom?: FixtureMessage } = {},
): PrependResult {
  // 1) Identify the anchor message — the formerly-first-rendered.
  const before = handle.getMessages();
  const anchorId = before[0]!.id;
  const container = handle.getContainer();
  const anchorBefore = container.querySelector<HTMLElement>(
    `[data-message-id="${anchorId}"]`,
  )!;

  // 2) Place the user's scroll position and snapshot via the hook.
  act(() => {
    handle.scrollAndSnapshot(scrollTopAtTrigger);
  });
  const anchorViewportYBefore =
    anchorBefore.offsetTop - container.scrollTop;

  // 3) Drive the state update — prepend older page (and optionally
  //    append a bottom-arriving message in the SAME commit, which is
  //    the concurrent-incoming-message scenario). Doing both in one
  //    setMessages call models the realistic case where multiple
  //    server events are batched into a single React render.
  act(() => {
    handle.setMessages((prev) => {
      const next = [...olderPage, ...prev];
      if (options.concurrentBottom) next.push(options.concurrentBottom);
      return next;
    });
  });

  // 4) After commit, the hook has restored scrollTop. Re-find the
  //    anchor (its DOM identity persists across commits because the
  //    React key is stable), and measure.
  const anchorAfter = container.querySelector<HTMLElement>(
    `[data-message-id="${anchorId}"]`,
  )!;
  const anchorViewportYAfter =
    anchorAfter.offsetTop - container.scrollTop;

  return {
    anchorViewportYBefore,
    anchorViewportYAfter,
    yDeltaPx: Math.abs(anchorViewportYAfter - anchorViewportYBefore),
    finalScrollTop: container.scrollTop,
    finalScrollHeight: container.scrollHeight,
  };
}

// ---------------------------------------------------------------------------
// Strict tolerance — the task spec calls for "no jump", which we
// operationalise as <4 px (sub-pixel rounding only). Any drift larger
// than this is user-visible.
// ---------------------------------------------------------------------------
const MAX_DRIFT_PX = 4;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DM scroll-anchor on prepend (Task #78)", () => {
  let history: ReturnType<typeof seedDmHistory>;

  beforeEach(() => {
    // 4 pages × 25 msgs = 100 messages of seeded history. The task
    // spec calls for "at least 3 pages"; we seed one extra so the
    // deep-history scenario can run THREE consecutive prepend cycles
    // (each consuming one older page) and still leave the newest
    // page rendered as the initial state.
    history = seedDmHistory(4, 25);
  });

  it("preserves the anchor message position when prepending one older page", () => {
    // Initial render = newest page (page 0).
    const newestPage = history.allMessages.slice(history.pageBoundaries[0]);
    const olderPage = history.allMessages.slice(
      history.pageBoundaries[1],
      history.pageBoundaries[0],
    );
    const { handle, unmount } = mountHarness(newestPage);

    try {
      // User has scrolled near the top — 60 px from top, well inside
      // the chat.tsx threshold (`scrollTop < 100`).
      const result = performPrependAndMeasure(handle, olderPage, 60);

      expect(result.yDeltaPx).toBeLessThan(MAX_DRIFT_PX);
      // Sanity: the prepended page actually grew the container.
      expect(result.finalScrollHeight).toBeGreaterThan(
        newestPage.length * DEFAULT_MSG_HEIGHT,
      );
    } finally {
      unmount();
    }
  });

  it("preserves the anchor position even when a brand-new bottom message arrives DURING the older-page fetch", () => {
    // This is the exact regression Task #78 was filed against and
    // the case the previous snapshot-delta formula failed:
    //   - User triggers loadMore at scrollTop=60.
    //   - The peer sends a new message; it lands at the bottom in
    //     the SAME React commit as the older page.
    //   - The previous formula computed
    //         delta = newScrollHeight - oldScrollHeight
    //     which over-counted by exactly the bottom message's height,
    //     pushing the user's view UP by 60 px.
    //   - The new id-based hook ignores bottom appends entirely
    //     because they don't perturb the anchor's offsetTop.
    const newestPage = history.allMessages.slice(history.pageBoundaries[0]);
    const olderPage = history.allMessages.slice(
      history.pageBoundaries[1],
      history.pageBoundaries[0],
    );
    const { handle, unmount } = mountHarness(newestPage);

    try {
      const concurrentBottom: FixtureMessage = {
        id: "concurrent-incoming-1",
        height: DEFAULT_MSG_HEIGHT,
        body: "peer message that arrived during the fetch",
      };

      const result = performPrependAndMeasure(handle, olderPage, 60, {
        concurrentBottom,
      });

      expect(result.yDeltaPx).toBeLessThan(MAX_DRIFT_PX);
      // Confirm the bottom message really did land — otherwise the
      // assertion above would be vacuously satisfied.
      const messages = handle.getMessages();
      expect(messages[messages.length - 1]!.id).toBe("concurrent-incoming-1");
    } finally {
      unmount();
    }
  });

  it("preserves the anchor position across THREE consecutive older-page prepends (deep history seek)", () => {
    // Walks back through every seeded older page (pages 1, 2, 3 — i.e.
    // three full prepend cycles), verifying the invariant holds for
    // each prepend independently. Guards against state accumulating
    // drift over multiple paginations: a buggy hook that drifts by
    // even a few pixels per cycle would compound to a visible jump
    // by the third page.
    const newestPage = history.allMessages.slice(history.pageBoundaries[0]);
    const { handle, unmount } = mountHarness(newestPage);

    try {
      const olderPages = [
        history.allMessages.slice(
          history.pageBoundaries[1],
          history.pageBoundaries[0],
        ),
        history.allMessages.slice(
          history.pageBoundaries[2],
          history.pageBoundaries[1],
        ),
        history.allMessages.slice(
          history.pageBoundaries[3],
          history.pageBoundaries[2],
        ),
      ];
      expect(olderPages).toHaveLength(3);

      for (const olderPage of olderPages) {
        const result = performPrependAndMeasure(handle, olderPage, 60);
        expect(result.yDeltaPx).toBeLessThan(MAX_DRIFT_PX);
      }
    } finally {
      unmount();
    }
  });

  it("is a no-op when the older-page response is empty (server returned 0 deduped rows)", () => {
    // The hook should not move scrollTop at all if no prepend lands.
    // This guards against false-positive restores that would push
    // the user away from where they were reading.
    const newestPage = history.allMessages.slice(history.pageBoundaries[0]);
    const { handle, unmount } = mountHarness(newestPage);

    try {
      const result = performPrependAndMeasure(handle, [], 60);

      expect(result.yDeltaPx).toBeLessThan(MAX_DRIFT_PX);
      // scrollTop should be exactly what we set it to (60), unchanged.
      expect(result.finalScrollTop).toBe(60);
    } finally {
      unmount();
    }
  });

  it("preserves the anchor position when the user is at the very top (scrollTop=0)", () => {
    // Edge case: the trigger threshold is `scrollTop < 100`, and the
    // most extreme position is 0. The viewport-Y of messages[0] is
    // exactly 0 here, so the post-prepend scrollTop must equal the
    // height of the prepended page.
    const newestPage = history.allMessages.slice(history.pageBoundaries[0]);
    const olderPage = history.allMessages.slice(
      history.pageBoundaries[1],
      history.pageBoundaries[0],
    );
    const { handle, unmount } = mountHarness(newestPage);

    try {
      const result = performPrependAndMeasure(handle, olderPage, 0);

      expect(result.yDeltaPx).toBeLessThan(MAX_DRIFT_PX);
      // The pinned message should now be EXACTLY at the top of the
      // viewport (its viewport-Y == 0).
      expect(result.anchorViewportYAfter).toBeLessThan(MAX_DRIFT_PX);
      // And the restored scrollTop should equal the older page's
      // total height (25 msgs × 60 px = 1500).
      expect(result.finalScrollTop).toBe(olderPage.length * DEFAULT_MSG_HEIGHT);
    } finally {
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// Call-site lock: chat.tsx must wire the hook correctly. A regression
// here (e.g. someone re-inlines the old snapshot-delta formula or
// drops the `data-message-id` attribute) breaks this test even if
// the hook itself remains correct.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("DM scroll-anchor wiring in chat.tsx", () => {
  const chatSrc = readFileSync(
    resolve(__dirname, "..", "client", "src", "pages", "chat.tsx"),
    "utf8",
  );

  it("imports useScrollAnchorOnPrepend from the hook module", () => {
    expect(chatSrc).toMatch(
      /from\s+["']@\/hooks\/use-scroll-anchor-on-prepend["']/,
    );
  });

  it("calls snapshotForPrepend() inside the scroll handler before loadMoreMessages()", () => {
    // The snapshot MUST happen before the fetch is dispatched,
    // otherwise the older page can land before we record the anchor.
    const handler = chatSrc.match(
      /handleScroll\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[/,
    );
    expect(handler, "handleScroll not found in chat.tsx").not.toBeNull();
    const body = handler![0];
    const snapIdx = body.indexOf("snapshotForPrepend(");
    const loadIdx = body.indexOf("loadMoreMessages(");
    expect(snapIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeGreaterThan(-1);
    expect(snapIdx).toBeLessThan(loadIdx);
  });

  it("guards the auto-bottom-scroll effect with consumeJustRestored()", () => {
    expect(chatSrc).toMatch(/if\s*\(\s*consumeJustRestored\(\s*\)\s*\)/);
  });

  it("renders message divs with data-message-id so the hook can find them", () => {
    // Both the regular bubble and the missed-call entry must carry
    // the attribute, since either can be the anchor message.
    const matches = chatSrc.match(/data-message-id=\{msg\.id\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT use the old snapshot-delta formula", () => {
    // Regressions tend to creep back as `scrollHeight - X.scrollHeight`.
    // The new approach never subtracts container scrollHeights.
    expect(chatSrc).not.toMatch(/scrollHeight\s*-\s*\w+\.scrollHeight/);
  });
});
