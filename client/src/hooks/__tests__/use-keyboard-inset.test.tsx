/**
 * Regression tests for `useKeyboardInset` (Task #81).
 *
 * Scope note: the brief assumed the hook still wraps an async
 * `@capacitor/keyboard.addListener`. After Task #43 it is a fully
 * synchronous web-only hook over `window.visualViewport`, so the four
 * scenarios are translated to the synchronous code that actually runs.
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

  let rafIdSeed = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(
    (cb: FrameRequestCallback) => {
      const id = ++rafIdSeed;
      queueMicrotask(() => cb(performance.now()));
      return id;
    },
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

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
  it("removes every listener it attached when the consumer unmounts", () => {
    const { unmount } = renderHook(() => useKeyboardInset());

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

  it("ends StrictMode mount→cleanup→mount with exactly one listener set and a working CSS update path", async () => {
    renderHook(() => useKeyboardInset(), { wrapper: StrictMode });

    expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(1);
    expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(1);
    expect(
      netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
    ).toBe(1);

    // Lock the exact dev double-invoke pattern (2 adds + 1 remove per
    // listener type) so a future React/Vitest combo silently dropping
    // the dev double-invoke fails loudly here instead of degrading to
    // a weaker single-mount assertion.
    expect(
      vvAddSpy.mock.calls.filter((c) => c[0] === "resize").length,
    ).toBe(2);
    expect(
      vvRemoveSpy.mock.calls.filter((c) => c[0] === "resize").length,
    ).toBe(1);
    expect(
      vvAddSpy.mock.calls.filter((c) => c[0] === "scroll").length,
    ).toBe(2);
    expect(
      vvRemoveSpy.mock.calls.filter((c) => c[0] === "scroll").length,
    ).toBe(1);
    expect(
      winAddSpy.mock.calls.filter((c) => c[0] === "orientationchange").length,
    ).toBe(2);
    expect(
      winRemoveSpy.mock.calls.filter((c) => c[0] === "orientationchange")
        .length,
    ).toBe(1);

    await act(async () => {
      fakeVv.height = 500;
      fakeVv.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("300px");
  });

  it("shares one listener set across two consumers and only detaches on the last unmount", () => {
    const first = renderHook(() => useKeyboardInset());
    const addsAfterFirst = vvAddSpy.mock.calls.filter(
      (c) => c[0] === "resize",
    ).length;

    const second = renderHook(() => useKeyboardInset());
    expect(
      vvAddSpy.mock.calls.filter((c) => c[0] === "resize").length,
    ).toBe(addsAfterFirst);

    first.unmount();
    expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(1);
    expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(1);
    expect(
      netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
    ).toBe(1);

    second.unmount();
    expect(netListenerCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(0);
    expect(netListenerCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(0);
    expect(
      netListenerCount(winAddSpy, winRemoveSpy, "orientationchange"),
    ).toBe(0);
    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("0px");
  });

  it("writes 0px and attaches no listeners when window.visualViewport is unavailable", () => {
    installVisualViewport(undefined);
    winAddSpy.mockClear();
    winRemoveSpy.mockClear();

    const { unmount } = renderHook(() => useKeyboardInset());

    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("0px");
    expect(
      winAddSpy.mock.calls.filter((c) => c[0] === "orientationchange").length,
    ).toBe(0);

    expect(() => unmount()).not.toThrow();
    expect(
      winRemoveSpy.mock.calls.filter((c) => c[0] === "orientationchange")
        .length,
    ).toBe(0);
  });
});
