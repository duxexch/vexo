import { WebPlugin } from "@capacitor/core";

import type {
  CallMediaPermissionState,
  CallMediaPermissionStatus,
  EndCallOptions,
  NativeCallAvailabilityResult,
  NativeCallUIPlugin,
  OverlayPermissionStatus,
  ReportIncomingCallOptions,
  ReportOutgoingCallOptions,
  UpdateCallStateOptions,
} from "./definitions";

/**
 * Web fallback for the NativeCallUI plugin.
 *
 * There is no equivalent of CallKit / Telecom on the web platform —
 * the closest the browser exposes is the Notifications API, which is
 * already covered by the existing `LocalNotifications`-based ringer
 * fallback in `client/src/lib/call-ringtone.ts`. So the call-UI stubs
 * are deliberate no-ops that always report the OS-native UI as
 * unavailable; the JS caller is expected to keep using the existing
 * in-app modal + audio ringtone path on web.
 *
 * The permission stubs mirror what the browser can actually answer:
 * `navigator.permissions.query` is honoured when present so the same
 * settings UI works in both PWA and native shells.
 */
export class NativeCallUIWeb extends WebPlugin implements NativeCallUIPlugin {
  async isAvailable(): Promise<NativeCallAvailabilityResult> {
    return { available: false, platform: "web" };
  }

  async reportIncomingCall(_options: ReportIncomingCallOptions): Promise<void> {
    return;
  }

  async reportOutgoingCall(_options: ReportOutgoingCallOptions): Promise<void> {
    return;
  }

  async updateCallState(_options: UpdateCallStateOptions): Promise<void> {
    return;
  }

  async endCall(_options: EndCallOptions): Promise<void> {
    return;
  }

  async checkCallMediaPermissions(): Promise<CallMediaPermissionStatus> {
    return {
      microphone: await queryBrowserPermission("microphone"),
      camera: await queryBrowserPermission("camera"),
      // The "permanently denied with Don't ask again" concept does not
      // exist on the web — the browser never shows a runtime dialog
      // when the host code did not call `getUserMedia`. We leave both
      // flags undefined so the JS callers fall back to their default
      // (re-promptable) behaviour.
      microphonePermanentlyDenied: false,
      cameraPermanentlyDenied: false,
    };
  }

  async requestCallMediaPermissions(): Promise<CallMediaPermissionStatus> {
    // The browser only prompts when getUserMedia is actually called —
    // the rationale + getUserMedia path already lives in the JS call
    // session, so on the web we just report the latest known state.
    return this.checkCallMediaPermissions();
  }

  async checkOverlayPermission(): Promise<OverlayPermissionStatus> {
    return { granted: true, supported: false, platform: "web" };
  }

  async requestOverlayPermission(): Promise<OverlayPermissionStatus> {
    return { granted: true, supported: false, platform: "web" };
  }
}

async function queryBrowserPermission(
  name: "microphone" | "camera",
): Promise<CallMediaPermissionState> {
  try {
    const permissions = (
      typeof navigator !== "undefined" ? navigator.permissions : undefined
    ) as
      | { query: (descriptor: { name: string }) => Promise<{ state: string }> }
      | undefined;
    if (!permissions?.query) return "prompt";
    const result = await permissions.query({ name });
    if (result.state === "granted") return "granted";
    if (result.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}
