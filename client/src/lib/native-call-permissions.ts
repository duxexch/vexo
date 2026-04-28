/**
 * Friend-call media permissions.
 *
 * Single responsibility: surface a definitive granted / denied decision
 * for the camera + microphone permissions a real-time call needs,
 * without ever rendering an in-app modal.
 *
 * Platform semantics:
 *  - **Native Android**: `requestCallMediaPermissions()` triggers
 *    `Activity#requestPermissions`, which is the OS dialog. The
 *    WebView's `getUserMedia` only obtains the device once the host
 *    app's runtime permission is `granted` — so we MUST resolve the
 *    plugin call before the caller invokes `getUserMedia`, otherwise
 *    Capacitor 8's `BridgeWebChromeClient` rejects the WebView's
 *    permission request silently and the user sees "permissions
 *    denied" even after granting. The plugin's permission alias
 *    bundles `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` + `CAMERA` —
 *    the audio-settings entry is mandatory because the bridge's
 *    `RequestMultiplePermissions` launcher fails the whole grant if
 *    any bundled permission is missing from the merged manifest, even
 *    though `MODIFY_AUDIO_SETTINGS` itself is "normal" and does not
 *    surface a runtime dialog.
 *  - **Native iOS**: the plugin asks `AVCaptureDevice` for
 *    authorisation, which surfaces the system dialog the first time.
 *  - **Web**: the browser fires its own permission prompt directly
 *    from `getUserMedia`, so we soft-pass unless the Permissions API
 *    has already recorded an explicit denial.
 *
 * Used by every call entry point:
 *   - `useCallSession.attachLocalMedia` (DM voice + video calls),
 *   - `private-call-layer.ensureLocalStream` (legacy DM call layer),
 *   - `VoiceChat.ensureLocalStream` (in-game voice rooms),
 *   - `permission-catalogue` (Settings → Permissions tab probes).
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
  /**
   * Android-only — true when the OS will no longer surface its runtime
   * dialog because the user previously selected "Don't ask again" or
   * device policy hard-blocked the permission. Undefined on web/iOS.
   */
  microphonePermanentlyDenied?: boolean;
  cameraPermanentlyDenied?: boolean;
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

export interface CallPermissionDecision {
  granted: boolean;
  status: CallMediaPermissionStatus;
  /**
   * True when the OS will no longer surface its runtime dialog for the
   * permissions this call kind needs. The caller should route the user
   * to system Settings instead of re-issuing a request that would be
   * a silent no-op. Always false on web and iOS.
   */
  permanentlyDenied: boolean;
}

/**
 * Acquire mic (and camera if needed) before `getUserMedia` is called.
 *
 * NEVER throws. NEVER calls `getUserMedia`. NEVER renders UI. The
 * caller is responsible for surfacing a toast + open-settings deep
 * link when the returned `granted` flag is false.
 */
export async function requestCallMediaForCall(
  kind: CallMediaKind,
): Promise<CallPermissionDecision> {
  if (Capacitor.isNativePlatform()) {
    const status = await safeRequestMedia();
    const micOk = status.microphone === "granted";
    const camOk = kind === "voice" ? true : status.camera === "granted";
    const granted = micOk && camOk;
    const permanentlyDenied =
      (!micOk && (status.microphonePermanentlyDenied ?? false)) ||
      (kind === "video" && !camOk && (status.cameraPermanentlyDenied ?? false));
    return { granted, status, permanentlyDenied };
  }

  // Web: browser fires its own `getUserMedia` prompt. Only block on a
  // confirmed `denied` state so first-time users still get the prompt.
  const status = await safeCheckMedia();
  const micBlocked = status.microphone === "denied";
  const camBlocked = kind === "video" && status.camera === "denied";
  return {
    granted: !micBlocked && !camBlocked,
    status,
    permanentlyDenied: false,
  };
}

/** Read-only snapshot used by the Settings tab and catalogue probes. */
export interface NativeCallPermissionsCheck {
  microphone: CallMediaPermissionState;
  camera: CallMediaPermissionState;
  overlay: OverlayPermissionStatus;
}

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
    const permissions = (typeof navigator !== "undefined"
      ? navigator.permissions
      : undefined) as
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
