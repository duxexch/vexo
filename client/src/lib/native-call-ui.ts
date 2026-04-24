import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { dispatchCallAction } from "@/lib/call-actions";

/**
 * Thin TypeScript wrapper around the local `capacitor-native-call-ui`
 * plugin. The plugin itself ships under `native-plugins/` and exposes
 * CallKit on iOS and a self-managed `ConnectionService` on Android, so
 * incoming calls take over the lock screen the way WhatsApp / Messenger
 * do, accept/decline works on Bluetooth headsets and CarPlay, and the
 * call shows up in the OS recents list.
 *
 * On the web (and on any native platform that doesn't expose a true
 * call UI — e.g. very old Android), `isNativeCallUIAvailable()` returns
 * `false` and the existing `LocalNotifications`-based ringtone fallback
 * in `call-ringtone.ts` keeps working unchanged.
 */

export type NativeCallType = "voice" | "video";

export type NativeCallEndedReason =
  | "remoteEnded"
  | "userHangup"
  | "declined"
  | "missed"
  | "failed"
  | "answeredElsewhere"
  | "unknown";

export type NativeCallLifecycleState = "ringing" | "connecting" | "connected" | "held" | "ended";

interface IncomingPayload {
  callId: string;
  handle: string;
  callType: NativeCallType;
  conversationId?: string;
  fromPush?: boolean;
}

interface OutgoingPayload {
  callId: string;
  handle: string;
  callType: NativeCallType;
  conversationId?: string;
}

interface NativeCallActionPayload {
  callId: string;
  conversationId?: string;
}

interface NativeCallEndedPayload extends NativeCallActionPayload {
  reason: NativeCallEndedReason;
}

interface NativeCallMutedPayload extends NativeCallActionPayload {
  muted: boolean;
}

interface AvailabilityResult {
  available: boolean;
  platform: "ios" | "android" | "web";
}

interface PluginShape {
  isAvailable(): Promise<AvailabilityResult>;
  reportIncomingCall(opts: IncomingPayload): Promise<void>;
  reportOutgoingCall(opts: OutgoingPayload): Promise<void>;
  updateCallState(opts: { callId: string; state: NativeCallLifecycleState }): Promise<void>;
  endCall(opts: { callId: string; reason?: NativeCallEndedReason }): Promise<void>;
  addListener(eventName: string, fn: (event: unknown) => void): Promise<PluginListenerHandle>;
  removeAllListeners?(): Promise<void>;
}

const NativeCallUI = registerPlugin<PluginShape>("NativeCallUI");

let cachedAvailability: AvailabilityResult | null = null;
let availabilityPromise: Promise<AvailabilityResult> | null = null;
let listenersAttached = false;
let muteListeners: Array<(event: NativeCallMutedPayload) => void> = [];

async function detectAvailability(): Promise<AvailabilityResult> {
  if (cachedAvailability) return cachedAvailability;
  if (availabilityPromise) return availabilityPromise;

  availabilityPromise = (async () => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("NativeCallUI")) {
      const fallback: AvailabilityResult = { available: false, platform: "web" };
      cachedAvailability = fallback;
      return fallback;
    }
    try {
      const result = await NativeCallUI.isAvailable();
      cachedAvailability = result;
      return result;
    } catch {
      const fallback: AvailabilityResult = { available: false, platform: "web" };
      cachedAvailability = fallback;
      return fallback;
    } finally {
      availabilityPromise = null;
    }
  })();

  return availabilityPromise;
}

/**
 * Resolves to true when the OS exposes a real native call UI we can
 * drive (CallKit on iOS, Telecom on recent Android). Resolves to false
 * on the web and on any platform where the plugin is not registered.
 */
export async function isNativeCallUIAvailable(): Promise<boolean> {
  const result = await detectAvailability();
  return result.available;
}

/**
 * Synchronous best-effort version. Only returns true if a previous
 * `isNativeCallUIAvailable()` (or `presentIncomingCall()` etc.) has
 * already resolved. Used by the ringtone module to decide whether to
 * suppress the local-notification fallback before the async probe
 * finishes.
 */
export function isNativeCallUIAvailableSync(): boolean {
  return cachedAvailability?.available === true;
}

async function ensureListeners(): Promise<void> {
  if (listenersAttached) return;
  const available = await detectAvailability();
  if (!available.available) return;
  listenersAttached = true;

  await NativeCallUI.addListener("callAnswered", (event) => {
    const payload = event as NativeCallActionPayload;
    if (!payload?.callId) return;
    void dispatchCallAction({
      action: "accept",
      callId: payload.callId,
      conversationId: payload.conversationId,
    });
  });

  await NativeCallUI.addListener("callEnded", (event) => {
    const payload = event as NativeCallEndedPayload;
    if (!payload?.callId) return;
    // Both "declined while still ringing" and "hung up an active call"
    // arrive on this channel — the existing call-action registry owns
    // the disambiguation. We dispatch "decline" first (will only match
    // a manager that still has the invite as an unresolved inbound
    // ring); if no manager claims it, we fall through to "hangup" so
    // an active call gets torn down too.
    void (async () => {
      const handled = await dispatchCallAction({
        action: "decline",
        callId: payload.callId,
        conversationId: payload.conversationId,
      });
      if (handled) return;
      await dispatchCallAction({
        action: "hangup",
        callId: payload.callId,
        conversationId: payload.conversationId,
      });
    })();
  });

  await NativeCallUI.addListener("callMutedChanged", (event) => {
    const payload = event as NativeCallMutedPayload;
    if (!payload?.callId) return;
    for (const fn of muteListeners) {
      try {
        fn(payload);
      } catch {
        // Don't let one buggy listener break the others.
      }
    }
  });
}

/**
 * Subscribe to native mute-toggle events (Bluetooth / CarPlay / native
 * lock-screen mute button). Returns an unsubscribe function. Calling
 * this implicitly attaches the global plugin listeners if they aren't
 * already.
 */
export function subscribeNativeMuteEvents(
  fn: (event: NativeCallMutedPayload) => void,
): () => void {
  muteListeners.push(fn);
  void ensureListeners();
  return () => {
    muteListeners = muteListeners.filter((listener) => listener !== fn);
  };
}

/**
 * Show the OS-native incoming-call UI. Resolves to `true` when the OS
 * accepted the request, `false` if the platform doesn't expose a
 * native UI (web / very old Android) so the caller can fall back to the
 * existing local-notification ringer.
 */
export async function presentIncomingCall(payload: IncomingPayload): Promise<boolean> {
  const available = await detectAvailability();
  if (!available.available) return false;
  await ensureListeners();
  try {
    await NativeCallUI.reportIncomingCall(payload);
    return true;
  } catch {
    // Most common failure: Android user revoked MANAGE_OWN_CALLS or the
    // OEM rejected SELF_MANAGED registration. Fall back so the user
    // still hears something.
    return false;
  }
}

/** Mark an outgoing call as in-flight so it shows up in the OS recents list. */
export async function reportOutgoingCall(payload: OutgoingPayload): Promise<boolean> {
  const available = await detectAvailability();
  if (!available.available) return false;
  await ensureListeners();
  try {
    await NativeCallUI.reportOutgoingCall(payload);
    return true;
  } catch {
    return false;
  }
}

/** Push a lifecycle update (e.g. ringing → connecting → connected) to the OS. */
export async function updateNativeCallState(callId: string, state: NativeCallLifecycleState): Promise<void> {
  const available = await detectAvailability();
  if (!available.available) return;
  try {
    await NativeCallUI.updateCallState({ callId, state });
  } catch {
    // No-op — the in-app UI remains the source of truth.
  }
}

/** Tear down the OS-native UI for a call. Stops the system ringtone too. */
export async function endNativeCall(callId: string, reason: NativeCallEndedReason = "userHangup"): Promise<void> {
  const available = await detectAvailability();
  if (!available.available) return;
  try {
    await NativeCallUI.endCall({ callId, reason });
  } catch {
    // No-op — already ended on the OS side.
  }
}

/** Test-only: reset the cached availability so unit tests can re-probe. */
export function __resetNativeCallUIForTest(): void {
  cachedAvailability = null;
  availabilityPromise = null;
  listenersAttached = false;
  muteListeners = [];
}
