import type { PluginListenerHandle } from "@capacitor/core";

export type NativeCallType = "voice" | "video";

export interface NativeCallEndedReason {
  /**
   * Why the call ended. Mirrors the WebRTC layer's vocabulary so the JS
   * call manager can react uniformly regardless of whether the user
   * hung up from inside the app, the lock-screen UI, the Bluetooth
   * headset, or CarPlay/Android Auto.
   */
  reason:
    | "remoteEnded"
    | "userHangup"
    | "declined"
    | "missed"
    | "failed"
    | "answeredElsewhere"
    | "unknown";
}

export interface ReportIncomingCallOptions {
  /**
   * Stable id for the call. The JS layer uses this to correlate the
   * native UI events back to the in-app call session and to dedupe
   * duplicate notifications (e.g. a VoIP push that arrives just as the
   * WebSocket invite does).
   */
  callId: string;
  /** Display name shown on the lock screen (e.g. the caller's username). */
  handle: string;
  /** Voice or video — drives the CallKit/ConnectionService capabilities. */
  callType: NativeCallType;
  /** Optional opaque conversation/session id forwarded back on every event. */
  conversationId?: string;
  /** Whether this call originated from a server-side push (true) or in-app socket (false). */
  fromPush?: boolean;
}

export interface ReportOutgoingCallOptions {
  callId: string;
  handle: string;
  callType: NativeCallType;
  conversationId?: string;
}

export interface EndCallOptions {
  callId: string;
  reason?: NativeCallEndedReason["reason"];
}

export interface UpdateCallStateOptions {
  callId: string;
  /**
   * Lifecycle phase of the call. The plugin maps this onto the platform
   * native equivalents (CXProvider report\* on iOS, Connection.set\* on
   * Android).
   */
  state: "ringing" | "connecting" | "connected" | "held" | "ended";
}

export interface NativeCallActionEvent {
  /** Same callId previously reported through reportIncoming/Outgoing. */
  callId: string;
  /** Conversation id forwarded from the original report, if any. */
  conversationId?: string;
}

export interface NativeCallEndedEvent extends NativeCallActionEvent {
  reason: NativeCallEndedReason["reason"];
}

export interface NativeCallMutedEvent extends NativeCallActionEvent {
  muted: boolean;
}

export interface NativeCallAvailabilityResult {
  /**
   * Whether the OS exposes a native call UI. True on iOS (CallKit) and
   * recent Android (Telecom + ConnectionService). False on web and on
   * Android < 6.0 where ConnectionService is unavailable.
   */
  available: boolean;
  platform: "ios" | "android" | "web";
}

/**
 * Per-permission state for the friend-call media permissions
 * (microphone + camera). Mirrors Capacitor's `PermissionState`
 * vocabulary so it slots into the existing rationale/gate UI.
 */
export type CallMediaPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

export interface CallMediaPermissionStatus {
  microphone: CallMediaPermissionState;
  camera: CallMediaPermissionState;
  /**
   * Optional Android-only signal. `true` when the OS will no longer
   * surface the runtime dialog for this permission because the user
   * ticked "Don't ask again" (or device policy hard-blocked it). The
   * JS layer should respond by routing the user to the system Settings
   * page rather than re-issuing the runtime request, which would be a
   * silent no-op.
   *
   * Only set on Android. Web and iOS leave these fields undefined.
   */
  microphonePermanentlyDenied?: boolean;
  cameraPermanentlyDenied?: boolean;
}

export interface OverlayPermissionStatus {
  /**
   * Whether SYSTEM_ALERT_WINDOW (display-over-other-apps) is currently
   * granted. On iOS and on the web this resolves to `true` because the
   * concept doesn't apply — callers can treat it as "always available".
   */
  granted: boolean;
  /** Whether the OS exposes the overlay-permission concept at all. */
  supported: boolean;
  platform: "ios" | "android" | "web";
  /**
   * Only set by `requestOverlayPermission()` when the plugin actually
   * launched the system settings screen. Lets the JS layer know it
   * should re-check the state after the app resumes.
   */
  opened?: boolean;
}

export interface NativeCallUIPlugin {
  /**
   * Resolves whether the runtime exposes the native call UI. The JS
   * caller should fall back to the in-app local-notification ringer
   * when this returns `available: false`.
   */
  isAvailable(): Promise<NativeCallAvailabilityResult>;

  /**
   * Tell the OS that an inbound call is ringing. On iOS this triggers
   * the full-screen CallKit incoming UI even when the app is killed
   * (provided a CallKit-bound VoIP push or in-app trigger fired). On
   * Android this places the call into the Telecom framework so the
   * incoming-call UI takes over the lock screen and Bluetooth headset
   * controls work.
   */
  reportIncomingCall(options: ReportIncomingCallOptions): Promise<void>;

  /**
   * Tell the OS that the user (or the JS layer) is starting an
   * outgoing call. Required so the call shows up in the system recents
   * list (iOS Phone app / Android dialer).
   */
  reportOutgoingCall(options: ReportOutgoingCallOptions): Promise<void>;

  /** Update the lifecycle state of an in-flight call. */
  updateCallState(options: UpdateCallStateOptions): Promise<void>;

  /** Tear down the native UI for this call (also stops the OS ringtone). */
  endCall(options: EndCallOptions): Promise<void>;

  /**
   * Returns the current grant state of the friend-call media
   * permissions (microphone + camera). On the web this reads
   * `navigator.permissions.query` when available and falls back to
   * "prompt" otherwise. On Android it reads from the underlying
   * runtime-permission system. iOS resolves to "granted" because the
   * actual prompts are surfaced by AVAudioSession / AVCaptureDevice
   * just-in-time when the WebRTC layer requests media.
   */
  checkCallMediaPermissions(): Promise<CallMediaPermissionStatus>;

  /**
   * Triggers the native runtime-permission dialog(s) for the
   * friend-call media permissions and resolves with the resulting
   * grant state. Already-granted permissions are skipped silently.
   */
  requestCallMediaPermissions(): Promise<CallMediaPermissionStatus>;

  /**
   * Returns whether the app currently has SYSTEM_ALERT_WINDOW
   * (display-over-other-apps) permission. Always reports `granted:true`
   * on platforms where the concept does not apply (iOS, web).
   */
  checkOverlayPermission(): Promise<OverlayPermissionStatus>;

  /**
   * Opens the system settings screen where the user can grant
   * SYSTEM_ALERT_WINDOW. Resolves with the state read immediately
   * before / after the screen was launched — JS callers should
   * re-check on app resume because the user's decision happens
   * outside of the app process.
   */
  requestOverlayPermission(): Promise<OverlayPermissionStatus>;

  /**
   * Emitted when the user taps "Accept" from CallKit / ConnectionService
   * (lock screen, Bluetooth headset, CarPlay, Android Auto).
   */
  addListener(
    eventName: "callAnswered",
    listenerFunc: (event: NativeCallActionEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Emitted on a native decline / hangup gesture. */
  addListener(
    eventName: "callEnded",
    listenerFunc: (event: NativeCallEndedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Emitted when the user toggles mute from the native UI. */
  addListener(
    eventName: "callMutedChanged",
    listenerFunc: (event: NativeCallMutedEvent) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
