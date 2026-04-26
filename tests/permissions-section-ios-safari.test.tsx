/**
 * Task #221 — iOS-Safari fallback in the Settings → Permissions card.
 *
 * Mounts the real <PermissionsSection /> with `isIOSSafariTab()` mocked
 * both ways and asserts the override pins notifications to "unavailable"
 * + shows the install hint when iOS Safari, and otherwise lets the row
 * use its real cached state.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en" as const,
    dir: "ltr" as const,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

vi.mock("@/lib/pwa-detect", () => ({
  isIOSSafariTab: vi.fn(() => false),
  isIOSDevice: vi.fn(() => false),
  isIOSStandalone: vi.fn(() => false),
}));

// Deterministic summary so the notifications row has a stable rawState
// of "prompt" once hydrated. The microphone row is the hydration
// canary in the iOS=true test (its testid is unaffected by the override).
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
  nativePush: "unavailable" as const,
  nativeLocalNotifications: "unavailable" as const,
  checkedAt: new Date(0).toISOString(),
};

vi.mock("@/lib/startup-permissions", () => ({
  getCachedPermissionSummary: () => baseSummary,
  refreshPermissionSummary: async () => baseSummary,
  openAppSettings: vi.fn(async () => {}),
}));

import { PermissionsSection } from "@/pages/settings";
import { isIOSSafariTab } from "@/lib/pwa-detect";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Task #221: PermissionsSection — iOS Safari tab fallback", () => {
  it("on iOS Safari: shows install hint and forces notifications to 'unavailable' with no Allow button — even after hydration", async () => {
    vi.mocked(isIOSSafariTab).mockReturnValue(true);

    render(<PermissionsSection />);

    // Wait for the async summary hydration. Microphone is the canary —
    // its rawState ("prompt") is unaffected by the iOS override, so
    // seeing it confirms summary is no longer null.
    await waitFor(() => {
      expect(screen.getByTestId("status-perm-microphone-prompt")).toBeTruthy();
    });

    expect(screen.getByTestId("hint-ios-pwa")).toBeTruthy();
    expect(screen.getByTestId("status-perm-notifications-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("status-perm-notifications-prompt")).toBeNull();
    expect(screen.queryByTestId("btn-perm-notifications-allow")).toBeNull();
  });

  it("off iOS Safari: hides the install hint and keeps the notifications Allow CTA", async () => {
    vi.mocked(isIOSSafariTab).mockReturnValue(false);

    render(<PermissionsSection />);

    await waitFor(() => {
      expect(screen.getByTestId("status-perm-notifications-prompt")).toBeTruthy();
    });

    expect(screen.queryByTestId("hint-ios-pwa")).toBeNull();
    expect(screen.queryByTestId("status-perm-notifications-unavailable")).toBeNull();
    expect(screen.getByTestId("btn-perm-notifications-allow")).toBeTruthy();
  });
});
