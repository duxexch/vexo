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
