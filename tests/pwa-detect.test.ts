/**
 * Unit coverage for the iOS PWA / Safari detection helpers used by the
 * Settings → Permissions tab (Task #143).
 *
 * The contract of `isIOSSafariTab()` is "show me the iOS Safari window
 * where web push is impossible without installing to Home Screen" —
 * meaning every other configuration must return false:
 *
 *   - non-iOS browsers
 *   - iOS standalone PWA
 *   - iOS Capacitor wrapper
 *   - iOS Chrome / Firefox / Edge (CriOS / FxiOS / EdgiOS markers)
 *   - iOS in-app browsers (Facebook, Instagram, Line, …)
 *
 * The tests stub `navigator.userAgent`, `navigator.maxTouchPoints`,
 * `navigator.standalone`, `window.matchMedia` and the Capacitor
 * runtime global so they can drive every branch without booting a
 * real WebKit instance.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { isIOSDevice, isIOSSafariTab, isIOSStandalone } from "@/lib/pwa-detect";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_FACEBOOK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2]";
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

interface NavigatorOverrides {
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}

function setNavigator(overrides: NavigatorOverrides) {
  vi.stubGlobal("navigator", {
    userAgent: overrides.userAgent ?? "",
    maxTouchPoints: overrides.maxTouchPoints ?? 0,
    standalone: overrides.standalone ?? false,
  });
}

function setMatchMedia(matches: boolean) {
  vi.stubGlobal("window", {
    ...(globalThis.window ?? {}),
    matchMedia: () => ({ matches }),
    Capacitor: undefined,
  });
}

function setCapacitorNative(isNative: boolean) {
  vi.stubGlobal("window", {
    ...(globalThis.window ?? {}),
    matchMedia: () => ({ matches: false }),
    Capacitor: { isNativePlatform: () => isNative },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isIOSDevice()", () => {
  it("returns true for an iPhone UA", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA });
    expect(isIOSDevice()).toBe(true);
  });

  it("returns true for an iPadOS-on-Mac UA with multi-touch", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
      maxTouchPoints: 5,
    });
    expect(isIOSDevice()).toBe(true);
  });

  it("returns false for an Android UA", () => {
    setNavigator({ userAgent: ANDROID_CHROME_UA });
    expect(isIOSDevice()).toBe(false);
  });

  it("returns false for a desktop Mac without multi-touch", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      maxTouchPoints: 0,
    });
    expect(isIOSDevice()).toBe(false);
  });
});

describe("isIOSStandalone()", () => {
  it("returns true when navigator.standalone is set", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA, standalone: true });
    setMatchMedia(false);
    expect(isIOSStandalone()).toBe(true);
  });

  it("returns true when display-mode media query matches", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA });
    setMatchMedia(true);
    expect(isIOSStandalone()).toBe(true);
  });

  it("returns false on iOS Safari tab", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA });
    setMatchMedia(false);
    expect(isIOSStandalone()).toBe(false);
  });
});

describe("isIOSSafariTab()", () => {
  it("returns true for vanilla iOS Safari (not standalone, not Capacitor)", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA });
    setMatchMedia(false);
    expect(isIOSSafariTab()).toBe(true);
  });

  it("returns false on Android Chrome", () => {
    setNavigator({ userAgent: ANDROID_CHROME_UA });
    setMatchMedia(false);
    expect(isIOSSafariTab()).toBe(false);
  });

  it("returns false when running inside an installed PWA", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA, standalone: true });
    setMatchMedia(false);
    expect(isIOSSafariTab()).toBe(false);
  });

  it("returns false when running inside the Capacitor native shell", () => {
    setNavigator({ userAgent: IPHONE_SAFARI_UA });
    setCapacitorNative(true);
    expect(isIOSSafariTab()).toBe(false);
  });

  it("returns false on iOS Chrome (CriOS marker)", () => {
    setNavigator({ userAgent: IPHONE_CHROME_UA });
    setMatchMedia(false);
    expect(isIOSSafariTab()).toBe(false);
  });

  it("returns false inside the Facebook in-app browser", () => {
    setNavigator({ userAgent: IPHONE_FACEBOOK_UA });
    setMatchMedia(false);
    expect(isIOSSafariTab()).toBe(false);
  });
});
