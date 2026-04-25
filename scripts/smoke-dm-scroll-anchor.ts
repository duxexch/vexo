#!/usr/bin/env tsx
/**
 * Task #78 — lock the DM "load older" scroll-anchor guarantee.
 *
 * Task #27 fixed the viewport-jump bug that used to happen every time
 * a user scrolled to the top of a DM thread to load older messages:
 * before the fix, prepending a page of older rows grew the scroll
 * container's `scrollHeight`, which left `scrollTop` pointing at the
 * SAME pixel offset — meaning the message the user was reading
 * suddenly leapt downward by however many pixels the new page added
 * (commonly 300-700px). The fix is a delicate dance:
 *
 *   1. `handleScroll` snapshots `scrollHeight`, `scrollTop`, and the
 *      current oldest message id BEFORE firing `loadMoreMessages`.
 *   2. A `useLayoutEffect` watching `messages` runs after the prepend
 *      commits but BEFORE paint, and only restores when:
 *        (a) the oldest message id changed (guards against bottom-
 *            arriving messages racing the fetch), AND
 *        (b) `scrollHeight` actually grew (guards against empty/all-
 *            deduped pages).
 *   3. The restoration formula is:
 *        `newScrollTop = newScrollHeight - oldScrollHeight + oldScrollTop`
 *      so the formerly-top-visible message lands at the same screen Y.
 *   4. A `justRestoredAnchor` flag tells the auto-bottom-scroll effect
 *      to skip ONE tick so it doesn't immediately yank the viewport
 *      back down to the latest message.
 *
 * A future refactor — moving auto-scroll into a custom hook, switching
 * the message list to virtualization, or extracting the scroll
 * container — could silently re-introduce the jump. This smoke locks
 * in both the math (by simulating the scroll container with a pure
 * model and asserting viewport-relative Y stays stable across all the
 * tricky scenarios) AND the wiring (by structurally asserting
 * `client/src/pages/chat.tsx` still contains the snapshot, formula,
 * guards, and justRestoredAnchor gate).
 *
 * Why a simulation and not Playwright? The whole jitter happens in
 * one synchronous layout pass that pure JS can model exactly: there
 * is no animation, no async timing, and no browser-specific quirk
 * involved — the bug is a math/sequence bug. Simulating it lets the
 * smoke run in milliseconds, in CI, with no DB / Express / Socket.IO /
 * authenticated-second-client orchestration. The structural lock then
 * proves the production component still uses the formula we just
 * proved correct, so the two layers together catch the regression
 * categories the task lists (refactor into hook, virtualization swap).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers(
  "DmScrollAnchorSmokeError",
);

function logPass(step: string): void {
  console.log(`[smoke:dm-scroll-anchor] PASS ${step}`);
}

// Tolerance for "no jump" assertion. The production formula is exact
// integer math (no easing, no scroll-snap), so the real-world delta
// should be 0; we keep 4px slack to absorb any hypothetical sub-pixel
// rounding a future browser or wrapper component could introduce.
const Y_TOLERANCE_PX = 4;

// ---- Pure scroll-container model -----------------------------------------
//
// Mirrors the parts of the DOM scroll container that the chat.tsx
// scroll-anchor logic touches. Each "message" is a fixed-height block
// in the order it would render. `scrollHeight` is the sum of heights;
// `scrollTop` is the user-controlled viewport offset.

interface SimMessage {
  id: string;
  height: number;
}

interface SimContainer {
  messages: SimMessage[];
  scrollTop: number;
  clientHeight: number;
}

function getScrollHeight(c: SimContainer): number {
  return c.messages.reduce((acc, m) => acc + m.height, 0);
}

function getMessageOffsetY(c: SimContainer, id: string): number {
  let y = 0;
  for (const m of c.messages) {
    if (m.id === id) return y;
    y += m.height;
  }
  fail(`Message id ${id} not present in simulated container`);
}

function getMessageViewportY(c: SimContainer, id: string): number {
  return getMessageOffsetY(c, id) - c.scrollTop;
}

function findFirstVisibleMessage(c: SimContainer): SimMessage {
  let y = 0;
  for (const m of c.messages) {
    const bottom = y + m.height;
    if (bottom > c.scrollTop) return m;
    y = bottom;
  }
  return c.messages[0];
}

// ---- Anchor + restoration logic (mirrors chat.tsx exactly) ----------------

interface PrependAnchor {
  scrollHeight: number;
  scrollTop: number;
  firstMessageId: string | undefined;
}

/**
 * Mirror of the snapshot taken in chat.tsx `handleScroll` when the
 * user crosses the top threshold. Captured BEFORE the older fetch
 * starts.
 */
function snapshotAnchor(c: SimContainer): PrependAnchor {
  return {
    scrollHeight: getScrollHeight(c),
    scrollTop: c.scrollTop,
    firstMessageId: c.messages[0]?.id,
  };
}

interface RestoreOutcome {
  restored: boolean;
  reason:
    | "ok"
    | "no-anchor"
    | "first-id-unchanged"
    | "scroll-height-not-grown";
}

/**
 * Mirror of the chat.tsx `useLayoutEffect` restoration body. Runs
 * after a `messages` commit. Returns whether a restore happened so
 * scenarios can also assert the false-positive guards behaved.
 */
function tryRestoreAnchor(
  c: SimContainer,
  anchor: PrependAnchor | null,
): RestoreOutcome {
  if (!anchor) return { restored: false, reason: "no-anchor" };
  const currentFirstId = c.messages[0]?.id;
  const currentScrollHeight = getScrollHeight(c);
  if (
    anchor.firstMessageId === undefined ||
    currentFirstId === undefined ||
    currentFirstId === anchor.firstMessageId
  ) {
    return { restored: false, reason: "first-id-unchanged" };
  }
  if (!(currentScrollHeight > anchor.scrollHeight)) {
    return { restored: false, reason: "scroll-height-not-grown" };
  }
  c.scrollTop =
    currentScrollHeight - anchor.scrollHeight + anchor.scrollTop;
  return { restored: true, reason: "ok" };
}

// ---- Page builders --------------------------------------------------------

function makeInitialPage(opts: {
  count: number;
  startId: number;
  height: number;
}): SimMessage[] {
  return Array.from({ length: opts.count }, (_, i) => ({
    id: `msg-${opts.startId + i}`,
    height: opts.height,
  }));
}

function prependOlderPage(
  c: SimContainer,
  count: number,
  startId: number,
  height: number,
): void {
  const older = Array.from({ length: count }, (_, i) => ({
    id: `msg-${startId + i}`,
    height,
  }));
  c.messages = [...older, ...c.messages];
}

function appendNewBottomMessage(
  c: SimContainer,
  id: string,
  height: number,
): void {
  c.messages = [...c.messages, { id, height }];
}

// ---- Scenario 1: plain 3-page back-pagination ----------------------------
//
// User scrolls to the top of a thread with one page already loaded,
// then triggers two more "load older" cycles. After each cycle the
// formerly-first-visible message must stay at the same viewport Y.

function scenarioPlainPrepend(): void {
  const c: SimContainer = {
    messages: makeInitialPage({ count: 30, startId: 70, height: 60 }),
    // User scrolled all the way to the top.
    scrollTop: 0,
    clientHeight: 600,
  };
  // For each pagination cycle, the formerly-first-visible message
  // must be pinned within tolerance.
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const topMsgBefore = findFirstVisibleMessage(c);
    const yBefore = getMessageViewportY(c, topMsgBefore.id);
    const anchor = snapshotAnchor(c);
    // Older page lands.
    prependOlderPage(c, 30, 70 - 30 * cycle, 60);
    const outcome = tryRestoreAnchor(c, anchor);
    assertCondition(
      outcome.restored,
      `Cycle ${cycle}: anchor restoration must fire on a real prepend (got reason=${outcome.reason})`,
    );
    const yAfter = getMessageViewportY(c, topMsgBefore.id);
    const delta = Math.abs(yAfter - yBefore);
    if (delta > Y_TOLERANCE_PX) {
      fail(
        `Cycle ${cycle}: expected message Y delta < ${Y_TOLERANCE_PX}px, got ${delta}px`,
        { topMsgId: topMsgBefore.id, yBefore, yAfter },
      );
    }
  }
  logPass("3-page back-pagination keeps formerly-top message pinned");
}

// ---- Scenario 2: concurrent incoming message during the older fetch ------
//
// The user scrolled to the top, the older-page request is in flight,
// and a brand-new message lands at the bottom from the peer. Two sub-
// behaviours must hold:
//
//   (Tick A) When ONLY the bottom message has landed (older page
//     still in flight), the restoration MUST NOT fire — the snapshot's
//     `firstMessageId` is unchanged, so the false-positive guard
//     correctly skips it. The viewport must not move on this tick
//     because no content was inserted above it.
//
//   (Tick B) When the older page then lands too, restoration fires.
//     The Task #27 snapshot-delta formula over-corrects by exactly
//     the bottom-arriving message's height (it cannot distinguish
//     prepend-grown height from append-grown height), so the
//     formerly-top message ends up shifted upward by at most
//     `bottomMessageHeight` pixels — a bounded, single-row drift,
//     NOT the original ~hundreds-of-pixels page-sized jump that
//     Task #27 was created to fix.
//
//     We assert the drift stays bounded by `bottomHeight + tolerance`,
//     which both:
//       (i) catches a regression of the original bug (full page
//           shift), and
//       (ii) documents the known small limitation of the current
//            snapshot-delta approach. The fix — switch to id-based
//            restoration that re-finds the formerly-first DOM node
//            after commit — is tracked as a follow-up; if that
//            ships, this scenario should tighten its tolerance to
//            `Y_TOLERANCE_PX`.

function scenarioConcurrentBottomMessage(): void {
  const c: SimContainer = {
    messages: makeInitialPage({ count: 30, startId: 70, height: 60 }),
    scrollTop: 0,
    clientHeight: 600,
  };
  const topMsgBefore = findFirstVisibleMessage(c);
  const yBefore = getMessageViewportY(c, topMsgBefore.id);
  const anchor = snapshotAnchor(c);
  const bottomHeight = 60;

  // Tick A: bottom-arriving message lands FIRST, before the older
  // page. The restoration must NOT fire (firstId unchanged), and the
  // anchor must still be considered valid for the next commit.
  appendNewBottomMessage(c, "msg-incoming-1", bottomHeight);
  const outcomeA = tryRestoreAnchor(c, anchor);
  assertCondition(
    !outcomeA.restored && outcomeA.reason === "first-id-unchanged",
    "Bottom-arriving message during fetch must not trigger anchor restore",
    outcomeA,
  );
  const yAfterA = getMessageViewportY(c, topMsgBefore.id);
  if (Math.abs(yAfterA - yBefore) > Y_TOLERANCE_PX) {
    fail(
      `Bottom-arriving tick: expected message Y delta < ${Y_TOLERANCE_PX}px, got ${Math.abs(
        yAfterA - yBefore,
      )}px`,
      { yBefore, yAfterA },
    );
  }

  // Tick B: the older page actually lands. Restoration fires; the
  // formula over-corrects by exactly `bottomHeight`. Anything larger
  // than `bottomHeight + tolerance` would mean Task #27 has regressed
  // and the user is back to losing entire pages of context.
  const PREPEND_PAGE_HEIGHT = 30 * 60; // page that's about to land
  const REGRESSION_BUDGET = bottomHeight + Y_TOLERANCE_PX;
  prependOlderPage(c, 30, 40, 60);
  const outcomeB = tryRestoreAnchor(c, anchor);
  assertCondition(
    outcomeB.restored,
    `Real older-page commit must restore anchor (got reason=${outcomeB.reason})`,
  );
  const yAfterB = getMessageViewportY(c, topMsgBefore.id);
  const deltaB = Math.abs(yAfterB - yBefore);
  if (deltaB > REGRESSION_BUDGET) {
    fail(
      `Concurrent-message scenario: drift must stay bounded by one bottom message (${REGRESSION_BUDGET}px), got ${deltaB}px — Task #27 has likely regressed back to a full-page jump`,
      {
        yBefore,
        yAfterB,
        REGRESSION_BUDGET,
        PREPEND_PAGE_HEIGHT_FOR_REFERENCE: PREPEND_PAGE_HEIGHT,
      },
    );
  }
  // Sanity: the drift must also be much smaller than the full
  // prepended-page height — the original bug shifted by the entire
  // prepend.
  assertCondition(
    deltaB < PREPEND_PAGE_HEIGHT / 4,
    `Drift ${deltaB}px is too close to a full-page jump (${PREPEND_PAGE_HEIGHT}px) — Task #27 has regressed`,
    { deltaB, PREPEND_PAGE_HEIGHT },
  );
  logPass(
    `concurrent bottom-arriving message during fetch keeps drift bounded (Δ=${deltaB}px ≤ ${REGRESSION_BUDGET}px, vs full-page ${PREPEND_PAGE_HEIGHT}px)`,
  );
}

// ---- Scenario 3: empty page (server returned 0 deduped rows) -------------
//
// The user scrolled up and pagination fired, but the server's response
// got fully dedup'd by `loadMoreMessages` (or returned an empty list).
// The first id is unchanged AND scrollHeight didn't grow. Restoration
// must NOT fire — otherwise it would compute a bogus delta and shove
// the viewport.

function scenarioEmptyPage(): void {
  const c: SimContainer = {
    messages: makeInitialPage({ count: 30, startId: 70, height: 60 }),
    scrollTop: 0,
    clientHeight: 600,
  };
  const anchor = snapshotAnchor(c);
  // No prepend, no append — the messages reference identity changed
  // (e.g. the hook re-set state with a new array of the same items)
  // but content is identical.
  c.messages = [...c.messages];
  const outcome = tryRestoreAnchor(c, anchor);
  assertCondition(
    !outcome.restored,
    "Empty/all-deduped page must NOT trigger anchor restore",
    outcome,
  );
  assertCondition(
    outcome.reason === "first-id-unchanged" ||
      outcome.reason === "scroll-height-not-grown",
    `Empty page should fail one of the two guards, got reason=${outcome.reason}`,
  );
  logPass("empty / all-deduped page leaves viewport untouched");
}

// ---- Scenario 4: server-id reuse (defensive) -----------------------------
//
// Hypothetical: the server returned older rows whose first message
// id collides with the previously-first id (shouldn't happen, but if
// the dedup logic ever changes, the guard saves us). scrollHeight
// grew but firstId is unchanged → no restore.

function scenarioFirstIdCollision(): void {
  const c: SimContainer = {
    messages: makeInitialPage({ count: 30, startId: 70, height: 60 }),
    scrollTop: 0,
    clientHeight: 600,
  };
  const anchor = snapshotAnchor(c);
  // Add older rows but keep `messages[0].id` the same as the snapshot
  // — i.e. the prepended rows are inserted AFTER the old first row,
  // which is a server bug we want the guard to swallow.
  c.messages = [
    c.messages[0],
    { id: "msg-extra-a", height: 60 },
    { id: "msg-extra-b", height: 60 },
    ...c.messages.slice(1),
  ];
  const outcome = tryRestoreAnchor(c, anchor);
  assertCondition(
    !outcome.restored && outcome.reason === "first-id-unchanged",
    "First-id collision must NOT trigger anchor restore",
    outcome,
  );
  logPass("first-id collision is rejected by the guard");
}

// ---- Scenario 5: variable-height messages --------------------------------
//
// Real DM threads have media, voice, multi-line text — heights vary
// wildly. The formula is height-agnostic but worth a sanity check.

function scenarioVariableHeights(): void {
  const c: SimContainer = {
    messages: [
      { id: "msg-100", height: 40 },
      { id: "msg-101", height: 220 }, // tall image
      { id: "msg-102", height: 60 },
      { id: "msg-103", height: 90 },
      { id: "msg-104", height: 40 },
    ],
    scrollTop: 0,
    clientHeight: 600,
  };
  const topMsgBefore = findFirstVisibleMessage(c);
  const yBefore = getMessageViewportY(c, topMsgBefore.id);
  const anchor = snapshotAnchor(c);
  // Older page with mixed heights including a 300px voice waveform.
  c.messages = [
    { id: "msg-090", height: 110 },
    { id: "msg-091", height: 300 },
    { id: "msg-092", height: 55 },
    ...c.messages,
  ];
  const outcome = tryRestoreAnchor(c, anchor);
  assertCondition(
    outcome.restored,
    "Variable-height prepend must restore anchor",
  );
  const yAfter = getMessageViewportY(c, topMsgBefore.id);
  const delta = Math.abs(yAfter - yBefore);
  if (delta > Y_TOLERANCE_PX) {
    fail(
      `Variable-height scenario: expected message Y delta < ${Y_TOLERANCE_PX}px, got ${delta}px`,
      { yBefore, yAfter },
    );
  }
  logPass("variable-height prepend keeps the formerly-top message pinned");
}

// ---- Scenario 6: user already scrolled down a bit when fetch fires -------
//
// The trigger fires whenever scrollTop < 100, not only at exactly 0.
// Make sure the formula still pins correctly when scrollTop is mid-
// range (e.g. 60).

function scenarioMidScrollTop(): void {
  const c: SimContainer = {
    messages: makeInitialPage({ count: 30, startId: 70, height: 60 }),
    scrollTop: 60,
    clientHeight: 600,
  };
  const topMsgBefore = findFirstVisibleMessage(c);
  const yBefore = getMessageViewportY(c, topMsgBefore.id);
  const anchor = snapshotAnchor(c);
  prependOlderPage(c, 25, 45, 60);
  const outcome = tryRestoreAnchor(c, anchor);
  assertCondition(outcome.restored, "Mid-scroll prepend must restore anchor");
  const yAfter = getMessageViewportY(c, topMsgBefore.id);
  const delta = Math.abs(yAfter - yBefore);
  if (delta > Y_TOLERANCE_PX) {
    fail(
      `Mid-scrollTop scenario: expected message Y delta < ${Y_TOLERANCE_PX}px, got ${delta}px`,
      { yBefore, yAfter, scrollTopAfter: c.scrollTop },
    );
  }
  logPass(
    "mid-scrollTop prepend (trigger zone, not exactly 0) keeps message pinned",
  );
}

// ---- Structural lock on chat.tsx -----------------------------------------
//
// The simulation above proves the formula is correct in isolation.
// These checks prove the production component is still using that
// exact formula, the two false-positive guards, the snapshot site,
// and the justRestoredAnchor gate. A future refactor that moves the
// scroll container, swaps to virtualization, or extracts the logic
// into a hook MUST update this lock — at which point the author is
// forced to think about the invariant and re-prove it.

function lockChatTsxWiring(): void {
  const path = resolve(process.cwd(), "client/src/pages/chat.tsx");
  const src = readFileSync(path, "utf8");

  // (a) Snapshot is taken in the scroll handler with the three fields
  //     the restoration depends on, AND the snapshot assignment
  //     happens BEFORE the loadMoreMessages() call. The ordering
  //     matters: if a refactor accidentally inverted them, the
  //     snapshot would capture post-fetch (or stale) metrics and the
  //     restoration math would silently produce nonsense — yet a
  //     non-ordered regex would still pass. The single combined
  //     regex below pins both presence and order.
  assertCondition(
    /prependAnchorRef\.current\s*=\s*\{[\s\S]*?scrollHeight:\s*target\.scrollHeight[\s\S]*?scrollTop:\s*target\.scrollTop[\s\S]*?firstMessageId:[\s\S]*?messages\[0\][\s\S]*?\}\s*;[\s\S]{0,200}loadMoreMessages\s*\(\s*\)/.test(
      src,
    ),
    "chat.tsx must snapshot {scrollHeight, scrollTop, firstMessageId} in handleScroll BEFORE calling loadMoreMessages() (order matters — post-fetch snapshot would silently break the restoration math)",
  );

  // (b) Trigger threshold + guards on the scroll handler are intact.
  assertCondition(
    /target\.scrollTop\s*<\s*100\s*&&\s*hasMoreMessages\s*&&\s*!loadingMore/.test(
      src,
    ),
    "chat.tsx must guard the snapshot+loadMore call with scrollTop<100, hasMoreMessages, !loadingMore",
  );

  // (c) Restoration formula is byte-for-byte the one this smoke just
  //     proved correct.
  assertCondition(
    /container\.scrollTop\s*=\s*\n?\s*container\.scrollHeight\s*-\s*anchor\.scrollHeight\s*\+\s*anchor\.scrollTop\s*;/.test(
      src,
    ),
    "chat.tsx must restore scrollTop with the formula: scrollHeight - anchor.scrollHeight + anchor.scrollTop",
  );

  // (d) Both false-positive guards in the restoration effect.
  assertCondition(
    /currentFirstId\s*!==\s*anchor\.firstMessageId/.test(src),
    "chat.tsx restoration must guard on firstMessageId change (concurrent bottom-message false-positive)",
  );
  assertCondition(
    /container\.scrollHeight\s*>\s*anchor\.scrollHeight/.test(src),
    "chat.tsx restoration must guard on scrollHeight growth (empty/deduped-page false-positive)",
  );

  // (e) Restoration runs in a layout effect (so it fires before paint
  //     — the difference between "no jump" and a visible flash).
  assertCondition(
    /useLayoutEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,1500}prependAnchorRef\.current/.test(
      src,
    ),
    "chat.tsx anchor restoration must run inside useLayoutEffect (pre-paint), not useEffect",
  );

  // (f) The justRestoredAnchor flag exists and is consumed by the
  //     auto-bottom-scroll effect — without this gate the bottom
  //     scroll fires on the same tick and undoes the restore.
  assertCondition(
    /justRestoredAnchorRef\.current\s*=\s*true/.test(src),
    "chat.tsx must set justRestoredAnchorRef=true after a successful restore",
  );
  assertCondition(
    /if\s*\(\s*justRestoredAnchorRef\.current\s*\)\s*\{[\s\S]{0,200}justRestoredAnchorRef\.current\s*=\s*false[\s\S]{0,200}return/.test(
      src,
    ),
    "chat.tsx auto-bottom-scroll effect must early-return when justRestoredAnchorRef is set, then clear it",
  );

  logPass(
    "chat.tsx still wires snapshot + formula + guards + layout-effect + bottom-scroll gate",
  );
}

// ---- Main ---------------------------------------------------------------

function main(): void {
  scenarioPlainPrepend();
  scenarioConcurrentBottomMessage();
  scenarioEmptyPage();
  scenarioFirstIdCollision();
  scenarioVariableHeights();
  scenarioMidScrollTop();
  lockChatTsxWiring();
  console.log("[smoke:dm-scroll-anchor] OK — all checks passed");
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
