/**
 * Task #180 — config-drift guard for the chat composer keyboard inset.
 *
 * Two surfaces have to agree, or the chat composer janks visibly on Android
 * whenever the keyboard opens:
 *
 *   1. `capacitor.config.ts` Keyboard plugin block must set `resize: 'none'`,
 *      so the WebView itself does NOT reflow the body when the keyboard
 *      appears. (See Task #43 for the original investigation.)
 *
 *   2. `client/src/hooks/use-keyboard-inset.ts` must, given a synthetic
 *      `visualViewport` event with the keyboard "open", expose the
 *      correct keyboard inset on the `--keyboard-inset-bottom` CSS
 *      variable. The chat composer (`client/src/pages/chat.tsx`,
 *      `client/src/components/games/GameChat.tsx`) consumes that variable
 *      to lift itself above the keyboard.
 *
 * If either contract drifts, the WebView reflow + the JS-driven layout
 * animate at the same time and produce the visible "double-shift" jitter
 * Task #43 was meant to eliminate. This file pins both ends so a future
 * accidental change to `capacitor.config.ts` is caught immediately
 * instead of slipping out as a regression on a real Android phone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS_VAR_NAME = "--keyboard-inset-bottom";
const REPO_ROOT = resolve(__dirname, "../../../..");

interface FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;
  width: number;
  scale: number;
}

function makeFakeVisualViewport(height: number): FakeVisualViewport {
  const target = new EventTarget() as FakeVisualViewport;
  target.height = height;
  target.offsetTop = 0;
  target.width = 360;
  target.scale = 1;
  return target;
}

describe("Task #180: capacitor.config.ts Keyboard.resize contract", () => {
  it("pins capacitor.config.ts to `resize: 'none'` so the JS hook owns the inset", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "capacitor.config.ts"),
      "utf8",
    );

    const keyboardBlock = source.match(/Keyboard:\s*{([\s\S]*?)}/);
    expect(
      keyboardBlock,
      "capacitor.config.ts is missing a `Keyboard:` plugin block",
    ).not.toBeNull();

    const block = keyboardBlock![1];

    // Exact match: `resize: 'none'` (single OR double quotes). Anything
    // else — `'body'`, `'native'`, `'ionic'`, missing — is a drift.
    expect(
      block,
      "capacitor.config.ts Keyboard.resize MUST be 'none'. " +
        "If you change this, you MUST also remove `useKeyboardInset` " +
        "and rewrite every chat composer that depends on " +
        "--keyboard-inset-bottom — see comment in capacitor.config.ts.",
    ).toMatch(/resize:\s*['"]none['"]/);

    expect(block, "Keyboard.resize must NOT be set to 'body'").not.toMatch(
      /resize:\s*['"]body['"]/,
    );
    expect(block, "Keyboard.resize must NOT be set to 'native'").not.toMatch(
      /resize:\s*['"]native['"]/,
    );
  });
});

describe("Task #180: useKeyboardInset reacts to a synthetic visualViewport event", () => {
  const originalVisualViewport = Object.getOwnPropertyDescriptor(
    window,
    "visualViewport",
  );
  const originalInnerHeight = Object.getOwnPropertyDescriptor(
    window,
    "innerHeight",
  );

  let fakeVv: FakeVisualViewport;
  let useKeyboardInset: typeof import("../use-keyboard-inset").useKeyboardInset;

  beforeEach(async () => {
    vi.resetModules();

    fakeVv = makeFakeVisualViewport(800);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: fakeVv,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

    // Drive RAF synchronously via microtasks so we can assert immediately
    // after dispatching the event without sprinkling setTimeouts. Mirrors
    // the pattern in use-keyboard-inset.test.tsx so the two specs share
    // the same execution model.
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
      delete (window as unknown as { visualViewport?: unknown })
        .visualViewport;
    }
    if (originalInnerHeight) {
      Object.defineProperty(window, "innerHeight", originalInnerHeight);
    }
    document.documentElement.style.removeProperty(CSS_VAR_NAME);
  });

  it("writes the exact keyboard height to --keyboard-inset-bottom on a synthetic vv resize", async () => {
    renderHook(() => useKeyboardInset());

    // Initial mount: keyboard closed, inset should be 0.
    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("0px");

    // Simulate the keyboard opening: visualViewport shrinks from 800 to 480
    // (a 320 px software keyboard, typical for a Pixel-class Android phone
    // in portrait). The hook must surface 320px on the CSS variable so the
    // chat composer can lift itself.
    await act(async () => {
      fakeVv.height = 480;
      fakeVv.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("320px");

    // Simulate the keyboard closing again: visualViewport returns to 800.
    // The hook must reset the variable to 0 so we don't leave dead padding
    // under the composer.
    await act(async () => {
      fakeVv.height = 800;
      fakeVv.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("0px");
  });

  it("respects vv.offsetTop so a focused-input scroll does not double-count the inset", async () => {
    // Some Android keyboards push the visual viewport DOWN (offsetTop > 0)
    // when an input near the top of the page is focused, instead of (or
    // in addition to) shrinking it. The hook subtracts both so the
    // reported inset stays the actual gap between the inner window and
    // the bottom of the visual viewport.
    renderHook(() => useKeyboardInset());

    await act(async () => {
      fakeVv.height = 600;
      fakeVv.offsetTop = 50;
      fakeVv.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    // window.innerHeight (800) - vv.height (600) - vv.offsetTop (50) = 150.
    expect(
      document.documentElement.style.getPropertyValue(CSS_VAR_NAME),
    ).toBe("150px");
  });
});
