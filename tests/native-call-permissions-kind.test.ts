/**
 * Helper-level coverage for the call-permission "kind" routing
 * (Task #128). The two routing helpers used by every friend-call
 * entrypoint must read the right field of the plugin's status object
 * depending on whether the call is voice (microphone only) or video
 * (microphone + camera). A regression that mis-routes video to the
 * voice-only checks would silently let a call start without camera
 * access — which is exactly the failure mode that motivated this task
 * being filed for video after Task #124 fixed it for voice.
 *
 * These tests exercise the helpers directly with synthetic
 * `CallMediaPermissionStatus` shapes so we don't have to spin up the
 * Capacitor plugin runtime.
 */

import { describe, expect, it } from "vitest";
import {
  isMissingForCall,
  isPermanentlyDeniedForCall,
  type CallMediaPermissionStatus,
} from "@/lib/native-call-permissions";

function status(overrides: Partial<CallMediaPermissionStatus>): CallMediaPermissionStatus {
  return {
    microphone: "granted",
    camera: "granted",
    ...overrides,
  };
}

describe("isPermanentlyDeniedForCall", () => {
  it("voice: only the microphone permanent-denial flag matters", () => {
    expect(
      isPermanentlyDeniedForCall(
        "voice",
        status({ microphonePermanentlyDenied: true }),
      ),
    ).toBe(true);
    // Camera permanent-denial must NOT block a voice call.
    expect(
      isPermanentlyDeniedForCall(
        "voice",
        status({ cameraPermanentlyDenied: true }),
      ),
    ).toBe(false);
    expect(isPermanentlyDeniedForCall("voice", status({}))).toBe(false);
  });

  it("video: BOTH the microphone and camera permanent-denial flags route to the modal's Open Settings state", () => {
    expect(
      isPermanentlyDeniedForCall(
        "video",
        status({ microphonePermanentlyDenied: true }),
      ),
    ).toBe(true);
    expect(
      isPermanentlyDeniedForCall(
        "video",
        status({ cameraPermanentlyDenied: true }),
      ),
    ).toBe(true);
    expect(
      isPermanentlyDeniedForCall(
        "video",
        status({
          microphonePermanentlyDenied: true,
          cameraPermanentlyDenied: true,
        }),
      ),
    ).toBe(true);
    expect(isPermanentlyDeniedForCall("video", status({}))).toBe(false);
  });
});

describe("isMissingForCall", () => {
  it("voice: only flags the microphone as required", () => {
    expect(
      isMissingForCall("voice", status({ microphone: "denied" })),
    ).toBe(true);
    expect(isMissingForCall("voice", status({ microphone: "prompt" }))).toBe(true);
    // Camera being missing must NOT fail a voice call.
    expect(isMissingForCall("voice", status({ camera: "denied" }))).toBe(false);
    expect(isMissingForCall("voice", status({}))).toBe(false);
  });

  it("video: flags either microphone OR camera as required", () => {
    expect(
      isMissingForCall("video", status({ microphone: "denied" })),
    ).toBe(true);
    expect(isMissingForCall("video", status({ camera: "denied" }))).toBe(true);
    expect(isMissingForCall("video", status({ camera: "prompt" }))).toBe(true);
    expect(isMissingForCall("video", status({}))).toBe(false);
  });
});
