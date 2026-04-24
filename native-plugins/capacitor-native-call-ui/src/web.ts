import { WebPlugin } from "@capacitor/core";

import type {
  EndCallOptions,
  NativeCallAvailabilityResult,
  NativeCallUIPlugin,
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
 * fallback in `client/src/lib/call-ringtone.ts`. So the web stub is a
 * deliberate no-op that always reports the OS-native UI as unavailable;
 * the JS caller is expected to keep using the existing in-app modal
 * + audio ringtone path on web.
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
}
