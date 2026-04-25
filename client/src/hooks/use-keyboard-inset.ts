import { useEffect } from "react";

const CSS_VAR_NAME = "--keyboard-inset-bottom";

let consumerCount = 0;
let frame = 0;
let listenersAttached = false;

function update(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  const inset = Math.max(
    0,
    Math.round(window.innerHeight - vv.height - vv.offsetTop),
  );
  document.documentElement.style.setProperty(CSS_VAR_NAME, `${inset}px`);
}

function schedule(): void {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    update();
  });
}

function attachListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  let resizeOk = false;
  let scrollOk = false;
  try {
    vv.addEventListener("resize", schedule);
    resizeOk = true;
    vv.addEventListener("scroll", schedule);
    scrollOk = true;
    window.addEventListener("orientationchange", schedule);
    listenersAttached = true;
  } catch (err) {
    if (resizeOk) vv.removeEventListener("resize", schedule);
    if (scrollOk) vv.removeEventListener("scroll", schedule);
    throw err;
  }
}

function detachListeners(): void {
  if (!listenersAttached || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
  }
  window.removeEventListener("orientationchange", schedule);
  listenersAttached = false;
  if (frame) {
    window.cancelAnimationFrame(frame);
    frame = 0;
  }
}

/**
 * Drives the `--keyboard-inset-bottom` CSS variable on the document
 * root from `window.visualViewport`, so sticky chat composers can use
 * it (e.g.
 * `pb-[max(0.75rem,env(safe-area-inset-bottom),var(--keyboard-inset-bottom,0px))]`)
 * to stay above the on-screen keyboard. Falls back to 0 when no
 * `visualViewport` is available. Reference-counted so multiple
 * consumers can mount safely.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    if (!window.visualViewport) {
      root.style.setProperty(CSS_VAR_NAME, "0px");
      return;
    }

    consumerCount += 1;
    if (consumerCount === 1) {
      try {
        attachListeners();
        update();
      } catch (err) {
        // A thrown effect never registers its cleanup, so roll back
        // the count AND tear down whatever managed to attach before
        // the throw — otherwise the next mount sees consumerCount
        // === 1 and skips the (now-needed) attach call, or worse,
        // leaves zombie listeners installed if `update()` was the
        // thrower.
        detachListeners();
        consumerCount -= 1;
        throw err;
      }
    }

    return () => {
      consumerCount = Math.max(0, consumerCount - 1);
      if (consumerCount === 0) {
        detachListeners();
        root.style.setProperty(CSS_VAR_NAME, "0px");
      }
    };
  }, []);
}

/**
 * Test-only exports. Vitest uses these to drive the listener
 * lifecycle directly so partial-attach failure paths can be exercised
 * without going through React's commit phase (which rethrows on a
 * microtask in dev and trips vitest's unhandled-error guard).
 *
 * Not part of the public API. Do not import outside `__tests__/`.
 */
export const __TEST_ONLY__ = {
  attachListeners,
  detachListeners,
  isAttached: (): boolean => listenersAttached,
  reset: (): void => {
    detachListeners();
    listenersAttached = false;
    consumerCount = 0;
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  },
};
