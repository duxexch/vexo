/**
 * Task #221 — iOS-Safari fallback in the Settings → Permissions card.
 *
 * On iPhone Safari (when the site is opened in a browser tab, NOT
 * installed to the home screen) the Permissions card is supposed to:
 *
 *   1. Show the blue "Add to Home Screen" hint (`hint-ios-pwa`) at the
 *      top of the card, because the user can't actually receive web
 *      push from a Safari tab on iOS — they have to install the PWA.
 *
 *   2. Force the Notifications row into the "unavailable" state and
 *      hide its "Allow" CTA. Without this override the row would
 *      render its normal Allow button, the user would tap it,
 *      `Notification.requestPermission()` would resolve to "denied"
 *      silently on iOS Safari, and we'd be left looking broken.
 *
 * The override is a small but load-bearing branch in
 * `client/src/pages/settings.tsx` (around the
 * `showIOSPwaHint && entry.id === "notifications"` checks). The
 * generic permission-row matrix in `permission-row.test.tsx` does NOT
 * cover it — that suite tests the row in isolation. This file mounts
 * the actual <PermissionsSection /> with `isIOSSafariTab()` mocked
 * both ways and pins the iOS-specific behaviour from the outside in.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------
// Mocks. All defined before the import of <PermissionsSection /> so
// the module graph picks them up.
// ---------------------------------------------------------------------

// i18n — pass-through so assertions can target raw keys / testids
// instead of having to load the full translation provider.
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en" as const,
    dir: "ltr" as const,
  }),
}));

// Toast — a no-op surface so the section doesn't try to mount the
// real provider.
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

// Capacitor — the catalogue's notifications entry imports
// `@capacitor/core`. Force a non-native runtime so the catalogue
// stays on its web-API code path.
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

// pwa-detect — the helper under test. Each test below uses
// `vi.mocked(isIOSSafariTab).mockReturnValueOnce(...)` to pick the
// branch.
vi.mock("@/lib/pwa-detect", () => ({
  isIOSSafariTab: vi.fn(() => false),
  isIOSDevice: vi.fn(() => false),
  isIOSStandalone: vi.fn(() => false),
}));

// startup-permissions — the section dynamically imports this module
// to fetch the cached / fresh permission summary and to drive
// `openAppSettings`. Return a deterministic summary so the
// notifications row has a stable rawState ("prompt") to fall back to
// when the iOS override is OFF, which is the half of the contract that
// proves we're not just always rendering "unavailable".
const baseSummary = {
  microphone: "prompt" as const,
  camera: "prompt" as const,
  notifications: "prompt" as const,
  overlay: "unavailable" as const,
  nativeCallUI: "unavailable" as const,
  wakeLock: "prompt" as const,
  clipboardWrite: "prompt" as const,
  vibrate: "granted" as const,
  fullscreen: "granted" as const,
  // The notifications entry's getState reads nativePush first; keep
  // it "unavailable" so the row resolves to s.notifications.
  nativePush: "unavailable" as const,
  nativeLocalNotifications: "unavailable" as const,
  checkedAt: new Date(0).toISOString(),
};

vi.mock("@/lib/startup-permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/startup-permissions")>(
      "@/lib/startup-permissions",
    );
  return {
    ...actual,
    getCachedPermissionSummary: () => baseSummary,
    refreshPermissionSummary: async () => baseSummary,
    openAppSettings: vi.fn(async () => {}),
  };
});

// ---------------------------------------------------------------------
// Imports below the mocks.
// ---------------------------------------------------------------------

import { PermissionsSection } from "@/pages/settings";
import { isIOSSafariTab } from "@/lib/pwa-detect";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Task #221: PermissionsSection — iOS Safari tab fallback", () => {
  it("renders the 'Add to Home Screen' hint AND forces the notifications row to unavailable when isIOSSafariTab() is true", async () => {
    vi.mocked(isIOSSafariTab).mockReturnValue(true);

    render(<PermissionsSection />);

    // Wait for the dynamic-import-driven useEffect to settle the
    // summary state into the rendered tree.
    await waitFor(() => {
      expect(screen.getByTestId("card-permissions")).toBeTruthy();
    });

    // 1. The blue install hint card MUST be at the top.
    expect(
      screen.getByTestId("hint-ios-pwa"),
      "When isIOSSafariTab() returns true the Permissions card MUST render " +
        "the [data-testid=\"hint-ios-pwa\"] block — it's the only path the " +
        "user has to enabling web push on an iPhone (Add to Home Screen, " +
        "then re-grant from the installed PWA).",
    ).toBeTruthy();

    // 2. The notifications row MUST resolve to "unavailable" — even
    //    though baseSummary.notifications = "prompt", the iOS override
    //    must win.
    expect(
      screen.getByTestId("status-perm-notifications-unavailable"),
      "On iOS Safari tab the notifications row MUST be forced into the " +
        "'unavailable' state regardless of the cached prompt/granted/denied " +
        "value, because Notification.requestPermission() resolves to 'denied' " +
        "silently in that environment.",
    ).toBeTruthy();

    // 3. AND there must be NO Allow button — that's the whole point of
    //    the override (a doomed Allow button is the regression).
    expect(
      screen.queryByTestId("btn-perm-notifications-allow"),
      "The notifications row MUST NOT render an 'Allow' button on iOS " +
        "Safari tab — tapping it would be a silent no-op for the user. " +
        "This is the regression Task #221 prevents.",
    ).toBeNull();
  });

  it("hides the hint AND keeps the notifications Allow CTA when isIOSSafariTab() is false", async () => {
    vi.mocked(isIOSSafariTab).mockReturnValue(false);

    render(<PermissionsSection />);

    await waitFor(() => {
      expect(screen.getByTestId("card-permissions")).toBeTruthy();
    });

    // 1. No install hint on non-iOS-Safari runtimes.
    expect(
      screen.queryByTestId("hint-ios-pwa"),
      "The 'Add to Home Screen' hint is iOS-Safari-only — every other " +
        "runtime (Capacitor native, installed PWA, Chrome on Android, " +
        "desktop browsers) supports web push directly and the hint would " +
        "just be confusing.",
    ).toBeNull();

    // 2. The notifications row resolves to its rawState ("prompt"
    //    from baseSummary) — proving the override only fires when
    //    isIOSSafariTab() is true.
    expect(
      screen.getByTestId("status-perm-notifications-prompt"),
      "Off iOS Safari tab the notifications row MUST reflect its cached " +
        "rawState ('prompt' here) — if it always rendered 'unavailable' " +
        "the iOS override would be hiding a real bug.",
    ).toBeTruthy();

    // 3. Allow CTA is back — the user has a working path to grant
    //    notifications without leaving the page.
    expect(
      screen.getByTestId("btn-perm-notifications-allow"),
      "Off iOS Safari tab the notifications row MUST render its 'Allow' " +
        "button so users can grant the permission inline. Hiding it would " +
        "force every non-iOS-Safari user through 'Open settings' for no " +
        "reason.",
    ).toBeTruthy();
  });
});
