import { useLayoutEffect, useRef } from "react";

/**
 * Task #27 (initial fix) + Task #78 (refactor): keep the user's view
 * pinned when older messages are prepended to a scroll container.
 *
 * Why a hook?
 *   The original chat.tsx implementation inlined three coordinated
 *   pieces — a `useLayoutEffect`, a snapshot taken inside the scroll
 *   handler, and a flag consumed by the auto-bottom-scroll effect.
 *   Pulling them into one named, testable hook makes the invariant
 *   easier to lock with an automated regression test (see
 *   `tests/dm-scroll-anchor-prepend.test.tsx`) and easier to reuse
 *   from any chat surface (DM, group rooms, etc.) without copy-paste
 *   drift.
 *
 * Why id-based offsetTop pinning (not snapshot-delta of scrollHeight)?
 *   The previous formula was
 *       newScrollTop = newScrollHeight - oldScrollHeight + oldScrollTop
 *   which works when ONLY a prepend happens between snapshot and
 *   restore — but if a brand-new message arrives at the bottom (from
 *   the peer) while the older-page request is still in flight, the
 *   delta also includes the bottom message's height, and the user's
 *   view drifts upward by exactly that height (single-row jump).
 *
 *   Anchoring to the formerly-first-rendered message itself avoids
 *   this entirely: we record the message's `offsetTop` and the
 *   container's `scrollTop` at snapshot time, then after the prepend
 *   commits we re-find that same message in the DOM (by
 *   `data-message-id`) and pin its viewport-relative position. Bottom-
 *   arriving messages do not change the anchor message's offsetTop
 *   (appends only shift positions BELOW the anchor), so the formula
 *   is concurrent-safe by construction.
 *
 * Failure modes deliberately handled:
 *   - Empty / all-deduped page response → the anchor message's
 *     `offsetTop` is unchanged, so the restore is a no-op.
 *   - Conversation switched mid-flight → the anchor message DOM node
 *     no longer exists; we drop the anchor and skip restore.
 *   - Snapshot taken when no messages were rendered yet → we bail
 *     from `snapshotForPrepend` instead of capturing a useless anchor.
 *
 * Caller contract:
 *   1. Render the scroll container with a forwarded `ref`.
 *   2. Render each message (including special types like missed-call
 *      entries) with a stable `data-message-id` attribute equal to
 *      the message id used by the `messages` array.
 *   3. Call `snapshotForPrepend()` from the scroll handler BEFORE
 *      invoking the older-page fetcher. The scroll handler also owns
 *      the trigger threshold (e.g. `scrollTop < 100`) and the
 *      `!loading` guard.
 *   4. Have the auto-bottom-scroll effect early-return when
 *      `consumeJustRestored()` returns true. This prevents the auto-
 *      scroll-to-bottom from immediately undoing the restore.
 */

export interface ScrollAnchorMessage {
  id: string | number;
}

export interface UseScrollAnchorOnPrependOpts<TMessage extends ScrollAnchorMessage> {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  messages: ReadonlyArray<TMessage>;
}

export interface ScrollAnchorApi {
  /**
   * Capture the formerly-first-rendered message's position. MUST be
   * called from the scroll handler BEFORE the older-page fetch is
   * dispatched, otherwise the snapshot would race the prepend commit.
   * No-ops if the container is not mounted, the messages list is
   * empty, or the anchor message DOM node cannot be found.
   */
  snapshotForPrepend: () => void;
  /**
   * Returns true exactly once per restore. The auto-bottom-scroll
   * effect should early-return when this is true so it doesn't yank
   * the viewport down to the latest message immediately after a
   * prepend pin.
   */
  consumeJustRestored: () => boolean;
}

interface Anchor {
  /** Stable id of the message we're anchoring to (the formerly-first). */
  anchorMessageId: string;
  /**
   * The anchor message's `offsetTop` within the scroll container at
   * snapshot time — i.e. before the older page is prepended. This is
   * the only piece of geometry we need from the DOM at snapshot time
   * because all subsequent restoration is expressed relative to the
   * SAME message after commit.
   */
  anchorOffsetTop: number;
  /** Container `scrollTop` at snapshot time. */
  anchorScrollTop: number;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  // Fallback for environments without CSS.escape (older jsdom builds).
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

export function useScrollAnchorOnPrepend<TMessage extends ScrollAnchorMessage>(
  opts: UseScrollAnchorOnPrependOpts<TMessage>,
): ScrollAnchorApi {
  const { scrollContainerRef, messages } = opts;
  const anchorRef = useRef<Anchor | null>(null);
  const justRestoredRef = useRef(false);

  // useLayoutEffect (not useEffect) — we need to write `scrollTop`
  // BEFORE the browser paints. Otherwise the user sees a flash of the
  // jumped-down position before our restore runs.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return;

    const selector = `[data-message-id="${cssEscape(anchor.anchorMessageId)}"]`;
    const node = container.querySelector<HTMLElement>(selector);
    if (!node) {
      // Anchor message left the DOM (conversation switched, message
      // deleted between snapshot and restore, etc.). Abandon the
      // anchor — there is nothing safe to pin to.
      anchorRef.current = null;
      return;
    }

    const newOffsetTop = node.offsetTop;
    if (newOffsetTop === anchor.anchorOffsetTop) {
      // The anchor message did not move: either no prepend has
      // landed yet (older page still in flight) or the response was
      // empty / fully deduped. Keep the anchor alive for the next
      // commit so a real prepend can still pin correctly.
      return;
    }

    // viewportY is the on-screen Y of the anchor message at snapshot
    // time, expressed relative to the container's top edge. It must
    // be unchanged after restore so the user sees the same line in
    // the same spot.
    const viewportY = anchor.anchorOffsetTop - anchor.anchorScrollTop;
    container.scrollTop = newOffsetTop - viewportY;
    anchorRef.current = null;
    justRestoredRef.current = true;
  }, [messages, scrollContainerRef]);

  const snapshotForPrepend = (): void => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const firstMsg = messages[0];
    if (firstMsg === undefined) return;
    const id = String(firstMsg.id);
    const node = container.querySelector<HTMLElement>(
      `[data-message-id="${cssEscape(id)}"]`,
    );
    if (!node) return;
    anchorRef.current = {
      anchorMessageId: id,
      anchorOffsetTop: node.offsetTop,
      anchorScrollTop: container.scrollTop,
    };
  };

  const consumeJustRestored = (): boolean => {
    if (justRestoredRef.current) {
      justRestoredRef.current = false;
      return true;
    }
    return false;
  };

  return { snapshotForPrepend, consumeJustRestored };
}
