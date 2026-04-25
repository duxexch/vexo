/**
 * Regression tests for `useKeyboardInset`.
 *
 * Task #43 hardened the hook against three subtle attach/detach races
 * — listener leaks on early unmount, StrictMode double-invoke leaving a
 * screen with no listeners, and partial-attach failure leaving zombie
 * listeners. Task #81 locks those fixes behind unit tests.
 *
 * NOTE on scope: the task description mentions mocking
 * `@capacitor/keyboard.addListener` to return a controllable, delayed
 * Promise. The current implementation of the hook does not import or
 * use `@capacitor/keyboard` — Task #43 simplified it to a pure web
 * hook driven synchronously by `window.visualViewport`. The four
 * scenarios are therefore adapted to the synchronous code that
 * actually exists; the *regression intent* (no leaked listeners, no
 * empty-listener state after StrictMode, ref-counted teardown,
 * graceful behaviour when the underlying API isn't usable) is
 * preserved 1:1.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StrictMode } from "react";

const CSS_VAR_NAME = "--keyboard-inset-bottom";

interface FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;
  width: number;
  scale: number;
}

let fakeVv: FakeVisualViewport;
let vvAddSpy: MockInstance;
let vvRemoveSpy: MockInstance;
let winAddSpy: MockInstance;
let winRemoveSpy: MockInstance;
let useKeyboardInset: typeof import("../use-keyboard-inset").useKeyboardInset;
const originalVisualViewport = Object.getOwnPropertyDescriptor(
  window,
  "visualViewport",
);
const originalInnerHeight = Object.getOwnPropertyDescriptor(
  window,
  "innerHeight",
);

function makeFakeVisualViewport(height = 800): FakeVisualViewport {
  const target = new EventTarget() as FakeVisualViewport;
  target.height = height;
  target.offsetTop = 0;
  target.width = 360;
  target.scale = 1;
  return target;
}

function installVisualViewport(vv: FakeVisualViewport | undefined): void {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: vv,
  });
}

function netListenerCount(
  addSpy: MockInstance,
  removeSpy: MockInstance,
  eventName: string,
): number {
  const adds = addSpy.mock.calls.filter((c) => c[0] === eventName).length;
  const removes = removeSpy.mock.calls.filter((c) => c[0] === eventName).length;
  return adds - removes;
}

beforeEach(async () => {
  vi.resetModules();
  fakeVv = makeFakeVisualViewport(800);
  installVisualViewport(fakeVv);

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: 800,
  });

  vvAddSpy = vi.spyOn(fakeVv, "addEventListener");
  vvRemoveSpy = vi.spyOn(fakeVv, "removeEventListener");
  winAddSpy = vi.spyOn(window, "addEventListener");
  winRemoveSpy = vi.spyOn(window, "removeEventListener");

  // Make rAF run on the microtask queue so the spy returns a non-zero
  // id BEFORE the callback fires (matches real browser semantics; the
  // hook stores the id in `frame` and the callback resets it to 0).
  let rafIdSeed = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(
    (cb: FrameRequestCallback) => {
      const id = ++rafIdSeed;
      queueMicrotask(() => cb(performance.now()));
      return id;
    },
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
    () => undefined,
  );

  document.documentElement.style.removeProperty(CSS_VAR_NAME);

  ({ useKeyboardInset } = await import("../use-keyboard-inset"));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalVisualViewport) {
    Object.defineProperty(window, "visualViewport", originalVisualViewport);
  } else {
    delete (window as unknown as { visualViewport?: unknown }).visualViewport;
  }
  if (originalInnerHeight) {
    Object.defineProperty(window, "innerHeight", originalInnerHeight);
  }
});

describe("useKeyboardInset", () => {
  describe("regression: mount then unmount must not leak listeners", () => {
    // Adapts task scenario 1: in the original async-attach world this
    // covered "unmount before attach resolves". The synchronous hook
    // can never stall mid-attach, but the regression intent — every
    // listener that was added gets removed on unmount — is the same.
    it("removes every listener it attached when the consumer unmounts", () => {
      const { unmount } = renderHook(() => useKeyboardInset());

      // Mount installed exactly one set of listeners.
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(1);
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(1);
      expect(
        netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
      ).toBe(1);

      unmount();

      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(0);
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(0);
      expect(
        netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
      ).toBe(0);
    });
  });

  describe("regression: StrictMode dev double-invoke must not leave the screen with no listeners", () => {
    // Adapts task scenario 2. With React's StrictMode wrapper the
    // effect runs mount → cleanup → mount in a single synchronous
    // burst. Without the ref-counted attach this could end with no
    // listeners installed; the test locks the corrected behaviour.
    it("ends with exactly one set of listeners attached and the CSS variable still updates from viewport events", async () => {
      renderHook(() => useKeyboardInset(), { wrapper: StrictMode });

      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(1);
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(1);
      expect(
        netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
      ).toBe(1);

      // Lock the exact dev double-invoke pattern so the test only
      // passes if StrictMode actually ran mount → cleanup → mount.
      // Under that timeline the hook attaches twice and detaches
      // once per listener type. If a future React or Vitest config
      // silently disables the dev double-invoke this fails loudly
      // (1 / 0) and we re-evaluate the test, rather than silently
      // degrading to a single-mount assertion that no longer
      // verifies the regression intent.
      const totalResizeAdds = vvAddSpy.mock.calls.filter(
        (c) => c[0] === "resize",
      ).length;
      const totalResizeRemoves = vvRemoveSpy.mock.calls.filter(
        (c) => c[0] === "resize",
      ).length;
      const totalScrollAdds = vvAddSpy.mock.calls.filter(
        (c) => c[0] === "scroll",
      ).length;
      const totalScrollRemoves = vvRemoveSpy.mock.calls.filter(
        (c) => c[0] === "scroll",
      ).length;
      const totalOrientationAdds = winAddSpy.mock.calls.filter(
        (c) => c[0] === "orientationchange",
      ).length;
      const totalOrientationRemoves = winRemoveSpy.mock.calls.filter(
        (c) => c[0] === "orientationchange",
      ).length;
      expect(totalResizeAdds).toBe(2);
      expect(totalResizeRemoves).toBe(1);
      expect(totalScrollAdds).toBe(2);
      expect(totalScrollRemoves).toBe(1);
      expect(totalOrientationAdds).toBe(2);
      expect(totalOrientationRemoves).toBe(1);

      // Simulate the on-screen keyboard opening: viewport height
      // shrinks by 300px from a window inner-height of 800.
      await act(async () => {
        fakeVv.height = 500;
        fakeVv.dispatchEvent(new Event("resize"));
        // Flush the rAF microtask the hook schedules.
        await Promise.resolve();
      });

      expect(
        document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
      ).toBe("300px");
    });
  });

  describe("regression: two consumers share one listener set; only the last unmount detaches", () => {
    // Adapts task scenario 3 directly: ref-counting must hold so a
    // second consumer mounting doesn't double-attach and the first
    // consumer unmounting doesn't strand the second one.
    it("only attaches once for two consumers, keeps listeners after the first unmount, and removes them on the second", () => {
      const first = renderHook(() => useKeyboardInset());

      // Snapshot after the first mount: exactly one set installed.
      const addsAfterFirst = vvAddSpy.mock.calls.filter(
        (c) => c[0] === "resize",
      ).length;

      const second = renderHook(() => useKeyboardInset());

      // Second consumer must NOT trigger another addEventListener
      // call — it just bumps the ref count.
      const addsAfterSecond = vvAddSpy.mock.calls.filter(
        (c) => c[0] === "resize",
      ).length;
      expect(addsAfterSecond).toBe(addsAfterFirst);

      // Unmounting only the first consumer must keep the listeners
      // alive for the second.
      first.unmount();
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(1);
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(1);
      expect(
        netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
      ).toBe(1);

      // Unmounting the last consumer detaches.
      second.unmount();
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(0);
      expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(0);
      expect(
        netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
      ).toBe(0);
    });
  });

  describe("regression: partial-attach failure must not leave zombie listeners", () => {
    // Adapts task scenario 4 in spirit. The original phrasing
    // ("addListener rejects on the third call out of four") assumes
    // the async `@capacitor/keyboard.addListener` Promise API the
    // hook no longer uses. The synchronous web equivalent is an
    // `addEventListener` call throwing mid-sequence (e.g. a hostile
    // host shim, a CSP violation, or a future polyfill bug). The
    // hook's `attachListeners` already wired the first two viewport
    // listeners by the time the third call throws — those zombies
    // must be rolled back so a remount starts from a clean slate.
    it("rolls back the first two attaches when window.addEventListener throws on the orientationchange call", () => {
      // React 18 rethrows useEffect errors on a microtask after our
      // `expect(...).toThrow(...)` already caught the synchronous
      // throw. Vitest treats that microtask rethrow as an
      // "unhandled error" and fails the run unless we filter it.
      // Scope the filter to ONLY our synthetic error so a real
      // unhandled error in any other test still surfaces.
      const swallowSynthetic = (err: unknown): void => {
        if (
          err instanceof Error &&
          err.message === "synthetic addListener failure"
        ) {
          return;
        }
        throw err;
      };
      process.prependListener("uncaughtException", swallowSynthetic);

      try {
        // Scope the failure to "orientationchange" only — React,
        // jsdom and the testing-library cleanup hook all attach
        // unrelated window listeners during render and we don't
        // want to break them.
        winAddSpy.mockImplementation((type: string) => {
          if (type === "orientationchange") {
            throw new Error("synthetic addListener failure");
          }
        });

        expect(() => renderHook(() => useKeyboardInset())).toThrow(
          /synthetic addListener failure/,
        );

        // The hardening must have removed the two viewport
        // listeners that were wired before the throw. Net count
        // of 0 proves no zombies remain on
        // `window.visualViewport`.
        expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(0);
        expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(0);
      } finally {
        process.removeListener("uncaughtException", swallowSynthetic);
      }
    });
  });

  describe("regression: graceful fallback when the viewport API is unavailable", () => {
    // Adapts task scenario 4. The original "addListener rejects on
    // the third call out of four" can't happen in the current
    // synchronous code (no Promise, no third call beyond the three
    // event listeners). The only "attach can fail" mode that exists
    // is `window.visualViewport` being undefined — which is exactly
    // the situation on browsers that don't ship the Visual Viewport
    // API. The hook must NOT install any listeners in that case and
    // must publish 0px to the CSS variable so the composer doesn't
    // hover over empty space.
    it("does not attach any listeners and writes 0px to the CSS variable when visualViewport is unavailable", () => {
      installVisualViewport(undefined);

      // Re-arm spies after the install so we observe only what the
      // hook does next, not setup churn.
      winAddSpy.mockClear();
      winRemoveSpy.mockClear();

      const { unmount } = renderHook(() => useKeyboardInset());

      expect(
        document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
      ).toBe("0px");

      // No orientationchange listener, no viewport listeners — the
      // fakeVv was replaced with `undefined` so the hook's early
      // return short-circuits before any addEventListener call.
      const orientationAdds = winAddSpy.mock.calls.filter(
        (c) => c[0] === "orientationchange",
      ).length;
      expect(orientationAdds).toBe(0);

      // Unmount must be a no-op too: nothing to remove, no throw.
      expect(() => unmount()).not.toThrow();
      const orientationRemoves = winRemoveSpy.mock.calls.filter(
        (c) => c[0] === "orientationchange",
      ).length;
      expect(orientationRemoves).toBe(0);
    });
  });
});
