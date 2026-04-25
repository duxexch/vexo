/**
 * Non-React unit tests for the listener-management helpers behind
 * `useKeyboardInset` (Task #81 partial-attach hardening).
 *
 * These exercise `attachListeners` directly so a synthetic
 * `addEventListener` failure on the third (window) call can be
 * observed without going through React's commit phase.
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
let helpers: typeof import("../use-keyboard-inset").__TEST_ONLY__;
const originalVisualViewport = Object.getOwnPropertyDescriptor(
  window,
  "visualViewport",
);

function makeFakeVisualViewport(): FakeVisualViewport {
  const target = new EventTarget() as FakeVisualViewport;
  target.height = 800;
  target.offsetTop = 0;
  target.width = 360;
  target.scale = 1;
  return target;
}

function netCount(
  add: MockInstance,
  remove: MockInstance,
  type: string,
): number {
  const a = add.mock.calls.filter((c) => c[0] === type).length;
  const r = remove.mock.calls.filter((c) => c[0] === type).length;
  return a - r;
}

beforeEach(async () => {
  vi.resetModules();
  fakeVv = makeFakeVisualViewport();
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: fakeVv,
  });
  vvAddSpy = vi.spyOn(fakeVv, "addEventListener");
  vvRemoveSpy = vi.spyOn(fakeVv, "removeEventListener");
  winAddSpy = vi.spyOn(window, "addEventListener");
  vi.spyOn(window, "removeEventListener");

  ({ __TEST_ONLY__: helpers } = await import("../use-keyboard-inset"));
});

afterEach(() => {
  helpers.reset();
  vi.restoreAllMocks();
  if (originalVisualViewport) {
    Object.defineProperty(window, "visualViewport", originalVisualViewport);
  } else {
    delete (window as unknown as { visualViewport?: unknown }).visualViewport;
  }
});

describe("useKeyboardInset listener helpers", () => {
  it("rolls back the first two attaches when the third addEventListener throws", () => {
    winAddSpy.mockImplementation((type: string) => {
      if (type === "orientationchange") {
        throw new Error("synthetic addListener failure");
      }
    });

    expect(() => helpers.attachListeners()).toThrow(
      "synthetic addListener failure",
    );

    expect(netCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(0);
    expect(netCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(0);
    expect(helpers.isAttached()).toBe(false);
  });

  it("lets a subsequent successful attach proceed normally after a failed one", () => {
    winAddSpy.mockImplementation((type: string) => {
      if (type === "orientationchange") {
        throw new Error("synthetic addListener failure");
      }
    });
    expect(() => helpers.attachListeners()).toThrow();

    winAddSpy.mockImplementation(() => undefined);
    helpers.attachListeners();

    expect(netCount(vvAddSpy, vvRemoveSpy, "resize")).toBe(1);
    expect(netCount(vvAddSpy, vvRemoveSpy, "scroll")).toBe(1);
    expect(helpers.isAttached()).toBe(true);
  });
});
