/**
 * High-level wrapper around the NativeCallUI plugin's permission
 * methods. Centralises the "is the runtime even capable of this
 * permission?" branching so callers don't have to repeat
 * `Capacitor.isNativePlatform()` checks everywhere.
 *
 * Used by:
 *  - the post-rationale flow in `useCallSession` (mic + camera grant
 *    must be confirmed before getUserMedia is called on Android),
 *  - the new Permissions tab inside the settings page,
 *  - the startup-permissions probe that surfaces a one-time banner
 *    when required permissions are still missing.
 *
 * The plugin is registered the same way as in `native-call-ui.ts` —
 * via Capacitor's `registerPlugin` — instead of importing the plugin
 * source directly, so the project tsconfig (which only includes
 * `client/src/`, `shared/`, and `server/`) does not need to be widened.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type CallMediaKind = "voice" | "video";

export type CallMediaPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

export interface CallMediaPermissionStatus {
  microphone: CallMediaPermissionState;
  camera: CallMediaPermissionState;
}

export interface OverlayPermissionStatus {
  granted: boolean;
  supported: boolean;
  platform: "ios" | "android" | "web";
  opened?: boolean;
}

interface PluginShape {
  checkCallMediaPermissions(): Promise<CallMediaPermissionStatus>;
  requestCallMediaPermissions(): Promise<CallMediaPermissionStatus>;
  checkOverlayPermission(): Promise<OverlayPermissionStatus>;
  requestOverlayPermission(): Promise<OverlayPermissionStatus>;
}

const NativeCallUI = registerPlugin<PluginShape>("NativeCallUI");

export interface NativeCallPermissionsCheck {
  microphone: CallMediaPermissionState;
  camera: CallMediaPermissionState;
  overlay: OverlayPermissionStatus;
}

/** Read all friend-call related permissions in a single call. */
export async function checkCallPermissions(): Promise<NativeCallPermissionsCheck> {
  const [media, overlay] = await Promise.all([
    safeCheckMedia(),
    safeCheckOverlay(),
  ]);
  return {
    microphone: media.microphone,
    camera: media.camera,
    overlay,
  };
}

/**
 * Ensure the runtime permissions required to actually start a call of
 * the requested kind are granted.
 *
 * Platform semantics:
 *  - **Native Android**: hard-gate. The WebView only gets mic/camera
 *    access if the host app has been granted the matching runtime
 *    permission, so we MUST confirm a "granted" state before letting
 *    `getUserMedia` run. A "denied" or non-granted result returns
 *    `granted: false` so the caller can re-show the rationale modal.
 *  - **Web + iOS**: soft-pass. The browser / iOS WebView fires its
 *    own permission prompt directly from `getUserMedia`, so blocking
 *    here on a `prompt`/`unavailable` state would prevent that
 *    dialog from ever appearing on first-time use. We only return
 *    `granted: false` when the platform reports an explicit
 *    `denied` for a permission the call actually needs — every
 *    other state is allowed through.
 *
 * Safe to call on any platform — never throws.
 */
export async function ensureCallPermissions(
  kind: CallMediaKind,
): Promise<{ granted: boolean; status: CallMediaPermissionStatus }> {
  const isNativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  if (isNativeAndroid) {
    const status = await safeRequestMedia();
    const micOk = status.microphone === "granted";
    const camOk = kind === "voice" ? true : status.camera === "granted";
    return { granted: micOk && camOk, status };
  }

  // Soft check on web + iOS: only block on a confirmed denial.
  const status = await safeCheckMedia();
  const micBlocked = status.microphone === "denied";
  const camBlocked = kind === "video" && status.camera === "denied";
  return { granted: !micBlocked && !camBlocked, status };
}

/** Open the system overlay-permission screen (Android only). */
export async function requestOverlayPermission(): Promise<OverlayPermissionStatus> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return {
      granted: true,
      supported: false,
      platform: Capacitor.getPlatform() as OverlayPermissionStatus["platform"],
    };
  }
  try {
    return await NativeCallUI.requestOverlayPermission();
  } catch {
    return { granted: false, supported: true, platform: "android" };
  }
}

async function safeCheckMedia(): Promise<CallMediaPermissionStatus> {
  try {
    return await NativeCallUI.checkCallMediaPermissions();
  } catch {
    return await browserMediaFallback();
  }
}

async function safeRequestMedia(): Promise<CallMediaPermissionStatus> {
  try {
    return await NativeCallUI.requestCallMediaPermissions();
  } catch {
    return await browserMediaFallback();
  }
}

async function safeCheckOverlay(): Promise<OverlayPermissionStatus> {
  try {
    return await NativeCallUI.checkOverlayPermission();
  } catch {
    const platform = Capacitor.getPlatform() as OverlayPermissionStatus["platform"];
    return {
      granted: platform !== "android",
      supported: platform === "android",
      platform,
    };
  }
}

async function browserMediaFallback(): Promise<CallMediaPermissionStatus> {
  return {
    microphone: await queryBrowserPermission("microphone"),
    camera: await queryBrowserPermission("camera"),
  };
}

async function queryBrowserPermission(
  name: "microphone" | "camera",
): Promise<CallMediaPermissionState> {
  try {
    const permissions = (typeof navigator !== "undefined" ? navigator.permissions : undefined) as
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

export function isMissingForCall(
  kind: CallMediaKind,
  status: CallMediaPermissionStatus,
): boolean {
  if (status.microphone !== "granted") return true;
  if (kind === "video" && status.camera !== "granted") return true;
  return false;
}
