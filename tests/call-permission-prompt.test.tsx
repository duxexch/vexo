/**
 * Smoke coverage for the call-permission rationale modal — focuses on
 * the new permanently-denied UX (Task #124) and the matching video
 * variant (Task #128). The modal is the user-visible side of the
 * Android "Don't ask again" flow, so we verify each meaningful state
 * renders the right CTA layout for BOTH voice (mic only) and video
 * (mic + camera in a single batch):
 *
 *   1. Initial rationale (no flags)        → "Allow" + "Not now",
 *      no "Open settings".
 *   2. Soft denial (forced=true)           → "Allow" + "Open settings"
 *      both visible (one-off failure, OS may still prompt again).
 *   3. Permanent denial                    → "Open settings" only,
 *      "Allow" hidden because tapping it would be a silent no-op.
 *
 * For video specifically, we also assert that BOTH the microphone and
 * the camera permission rows are rendered — this is the visible cue
 * that the OS will be asked for two permissions in one batch when the
 * user taps Allow.
 *
 * Strategy: drive the production component by capturing the listener
 * it registers via `registerRationaleListener` and replaying a
 * `RationaleRequest` directly. This keeps the test free of the heavy
 * provider stack while still exercising the real JSX of the modal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, lang: "en" as const }),
}));

const openMicrophoneSettings = vi.fn(async () => {});
const openAppSettings = vi.fn(async () => {});
vi.mock("@/lib/startup-permissions", () => ({
  openMicrophoneSettings: () => openMicrophoneSettings(),
  openAppSettings: () => openAppSettings(),
}));

let capturedListener:
  | ((req: import("@/lib/call-permission-rationale").RationaleRequest) => void)
  | null = null;

vi.mock("@/lib/call-permission-rationale", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/call-permission-rationale")
  >("@/lib/call-permission-rationale");
  return {
    ...actual,
    registerRationaleListener: (
      listener: (
        req: import("@/lib/call-permission-rationale").RationaleRequest,
      ) => void,
    ) => {
      capturedListener = listener;
      return () => {
        if (capturedListener === listener) capturedListener = null;
      };
    },
  };
});

import { CallPermissionPrompt } from "@/components/calls/CallPermissionPrompt";
import type { RationaleRequest } from "@/lib/call-permission-rationale";

function pushRequest(partial: Partial<RationaleRequest> = {}) {
  const resolve = vi.fn();
  const req: RationaleRequest = {
    kind: "voice",
    resolve,
    ...partial,
  };
  act(() => {
    capturedListener?.(req);
  });
  return resolve;
}

describe("CallPermissionPrompt — permanently-denied UX", () => {
  beforeEach(() => {
    openMicrophoneSettings.mockClear();
    openAppSettings.mockClear();
    capturedListener = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("first-time rationale shows Allow + Not now, no Open settings", () => {
    render(<CallPermissionPrompt />);
    pushRequest();

    expect(screen.getByTestId("button-call-permission-allow")).toBeTruthy();
    expect(screen.getByTestId("button-call-permission-dismiss")).toBeTruthy();
    expect(
      screen.queryByTestId("button-call-permission-open-settings"),
    ).toBeNull();
  });

  it("soft denial (forced) shows Allow alongside Open settings", () => {
    render(<CallPermissionPrompt />);
    pushRequest({ forced: true });

    expect(screen.getByTestId("button-call-permission-allow")).toBeTruthy();
    expect(
      screen.getByTestId("button-call-permission-open-settings"),
    ).toBeTruthy();
  });

  it("permanent denial hides Allow and exposes Open settings only", async () => {
    render(<CallPermissionPrompt />);
    const resolve = pushRequest({ permanentlyDenied: true });

    expect(screen.queryByTestId("button-call-permission-allow")).toBeNull();
    const settingsBtn = screen.getByTestId(
      "button-call-permission-open-settings",
    );
    expect(settingsBtn).toBeTruthy();

    fireEvent.click(settingsBtn);
    // Settings handoff fires for voice kind (microphone-only path).
    expect(openMicrophoneSettings).toHaveBeenCalledTimes(1);
    // Awaiting one microtask gives the modal's async click handler a
    // chance to flush its dismiss-resolution before we assert on it.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolve).toHaveBeenCalledWith("dismiss");
  });
});

// ---------------------------------------------------------------------------
// Video kind (Task #128) — locks in that the video friend-call path goes
// through the SAME modal states as voice, plus renders a camera row so
// the user has a visual cue that the next OS prompt will ask for two
// permissions in one batch.
// ---------------------------------------------------------------------------

describe("CallPermissionPrompt — video kind (Task #128)", () => {
  beforeEach(() => {
    openMicrophoneSettings.mockClear();
    openAppSettings.mockClear();
    capturedListener = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("first-time video rationale shows mic + camera rows and Allow + Not now (no Open settings)", () => {
    render(<CallPermissionPrompt />);
    pushRequest({ kind: "video" });

    // Both permission rows visible — proves the user is being told the
    // OS will ask for mic AND camera in one batch when they tap Allow.
    expect(
      screen.getByText("callPermission.micLabel"),
    ).toBeTruthy();
    expect(
      screen.getByText("callPermission.cameraLabel"),
    ).toBeTruthy();
    // Standard CTA layout for the initial state.
    expect(screen.getByTestId("button-call-permission-allow")).toBeTruthy();
    expect(screen.getByTestId("button-call-permission-dismiss")).toBeTruthy();
    expect(
      screen.queryByTestId("button-call-permission-open-settings"),
    ).toBeNull();
  });

  it("soft-denied video (forced) keeps Allow alongside Open settings — OS may still re-prompt", () => {
    render(<CallPermissionPrompt />);
    pushRequest({ kind: "video", forced: true });

    expect(screen.getByTestId("button-call-permission-allow")).toBeTruthy();
    expect(
      screen.getByTestId("button-call-permission-open-settings"),
    ).toBeTruthy();
    // Camera row remains visible in the forced state too — the user
    // needs to know what they are about to be asked for again.
    expect(
      screen.getByText("callPermission.cameraLabel"),
    ).toBeTruthy();
  });

  it("permanently-denied video hides Allow and steers the user to system settings", async () => {
    render(<CallPermissionPrompt />);
    const resolve = pushRequest({ kind: "video", permanentlyDenied: true });

    // Re-tapping Allow when the OS has stopped showing its dialog is a
    // silent no-op for video same as for voice — Allow must be hidden.
    expect(screen.queryByTestId("button-call-permission-allow")).toBeNull();
    const settingsBtn = screen.getByTestId(
      "button-call-permission-open-settings",
    );
    expect(settingsBtn).toBeTruthy();
    // Open Settings must be the PRIMARY action in this state, not the
    // outline-styled secondary it is during soft-denial. The component
    // toggles `variant="default"` which applies the `bg-primary` class.
    // Catching a swap back to outline here protects the "Open Settings
    // primary" half of the Task #128 acceptance criteria.
    expect(settingsBtn.className).toContain("bg-primary");

    fireEvent.click(settingsBtn);
    // Web fallback path (Capacitor.isNativePlatform() === false in jsdom)
    // calls `openMicrophoneSettings` for both voice and video — the
    // browser-side permissions tab covers both mic and camera there.
    expect(openMicrophoneSettings).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolve).toHaveBeenCalledWith("dismiss");
  });
});
