/**
 * Smoke coverage for the call-permission rationale modal — focuses on
 * the new permanently-denied UX (Task #124). The modal is the user-
 * visible side of the Android "Don't ask again" flow, so we verify the
 * three meaningful states render the right CTA layout:
 *
 *   1. Initial rationale (no flags)        → "Allow" + "Not now",
 *      no "Open settings".
 *   2. Soft denial (forced=true)           → "Allow" + "Open settings"
 *      both visible (one-off failure, OS may still prompt again).
 *   3. Permanent denial                    → "Open settings" only,
 *      "Allow" hidden because tapping it would be a silent no-op.
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
