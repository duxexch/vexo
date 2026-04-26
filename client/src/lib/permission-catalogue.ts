/**
 * Single source of truth for the device permissions VEX surfaces to
 * the user. Both the startup probe (`startup-permissions.ts`) and the
 * Settings → Permissions tab consume this catalogue, so adding a new
 * permission means adding ONE entry here — never two parallel switch
 * statements that drift out of sync.
 *
 * Each entry knows:
 *  - which icon + translation keys to render,
 *  - how to probe the OS for its current state,
 *  - whether the platform supports the permission at all,
 *  - how to actively request it (when the OS allows in-page prompts),
 *  - how to deep-link to the OS / browser settings page.
 *
 * `request` and `openSettings` are optional for permissions where the
 * OS exposes neither prompt nor settings panel (e.g. Vibration API,
 * Fullscreen API — both are Web APIs that the platform either supports
 * or doesn't, with no per-site toggle).
 *
 * This file is intentionally free of TOP-LEVEL imports from
 * `startup-permissions.ts` to avoid a circular module dependency:
 * `startup-permissions.ts` imports the catalogue to drive its summary
 * probe, so any cross-call back into it has to be done lazily inside
 * function bodies.
 */

import type { ComponentType } from "react";
import {
  Bell,
  Camera,
  Clipboard,
  Layers,
  Maximize2,
  Mic,
  Monitor,
  PhoneIncoming,
  Vibrate,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";

export type PermissionResult = "granted" | "denied" | "prompt" | "unavailable";

export type PermissionId =
  | "microphone"
  | "camera"
  | "notifications"
  | "overlay"
  | "nativeCallUI"
  | "wakeLock"
  | "clipboardWrite"
  | "vibrate"
  | "fullscreen";

/**
 * The shape of one snapshot of every permission the catalogue tracks.
 * Kept structurally compatible with the legacy `PermissionSummary`
 * that older call sites still consume — every legacy field is still
 * here, alongside the new ones.
 */
export type CataloguePermissionSummary = Record<PermissionId, PermissionResult> & {
  nativePush: PermissionResult;
  nativeLocalNotifications: PermissionResult;
  checkedAt: string;
};

export interface PermissionEntry {
  id: PermissionId;
  icon: ComponentType<{ className?: string }>;
  titleKey: string;
  helperKey: string;
  /**
   * Probe the OS / browser for the current state. Must be hermetic:
   * never opens a prompt, never throws — returns "unavailable" when
   * the API is missing on the platform.
   */
  probe: () => Promise<PermissionResult>;
  /**
   * Read this permission's state from a (possibly stale) summary
   * snapshot.
   */
  getState: (summary: CataloguePermissionSummary | null) => PermissionResult;
  /** True when the runtime can actually surface this permission. */
  isAvailable: (summary: CataloguePermissionSummary | null) => boolean;
  /**
   * Trigger the OS / browser permission prompt and resolve to the new
   * state. Undefined for permissions that are either auto-granted or
   * can only be deep-linked (e.g. Android overlay).
   */
  request?: () => Promise<PermissionResult>;
  /** Deep-link to the relevant OS or browser settings screen. */
  openSettings?: () => Promise<void>;
}

// ---------------------------------------------------------------------
// Probes — must be safe to run at any moment without a user gesture.
// ---------------------------------------------------------------------

function normalizeNativePermission(value: unknown): PermissionResult {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  if (value === "prompt") return "prompt";
  return "unavailable";
}

async function probeMicrophone(): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unavailable";
  }
  // On native we trust the dedicated call-permissions probe — the
  // browser-style query returns "prompt" even when the OS toggle has
  // already been granted by the user.
  if (Capacitor.isNativePlatform()) {
    try {
      const { checkCallPermissions } = await import("@/lib/native-call-permissions");
      const perms = await checkCallPermissions();
      const v = perms.microphone;
      if (v === "granted") return "granted";
      if (v === "denied") return "denied";
      return "prompt";
    } catch {
      return "unavailable";
    }
  }
  if (!navigator.permissions?.query) return "unavailable";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

async function probeCamera(): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unavailable";
  }
  // Same reasoning as the microphone probe — the call-permissions
  // helper is the authoritative answer on native.
  if (Capacitor.isNativePlatform()) {
    try {
      const { checkCallPermissions } = await import("@/lib/native-call-permissions");
      const perms = await checkCallPermissions();
      const v = perms.camera;
      if (v === "granted") return "granted";
      if (v === "denied") return "denied";
      return "prompt";
    } catch {
      return "unavailable";
    }
  }
  if (!navigator.permissions?.query) return "unavailable";
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

async function probeNotifications(): Promise<PermissionResult> {
  if (typeof Notification === "undefined") return "unavailable";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "prompt";
}

async function probeOverlay(): Promise<PermissionResult> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    const { checkCallPermissions } = await import("@/lib/native-call-permissions");
    const perms = await checkCallPermissions();
    const status = perms.overlay;
    if (!status.supported) return "unavailable";
    return status.granted ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

async function probeWakeLock(): Promise<PermissionResult> {
  if (typeof navigator === "undefined") return "unavailable";
  // We deliberately check the value (not just presence) — many runtime
  // stubs declare `wakeLock` as `undefined` and the `in` operator
  // alone would mistakenly report the API as supported.
  const nav = navigator as { wakeLock?: { request?: unknown } };
  if (nav.wakeLock == null || typeof nav.wakeLock.request !== "function") {
    return "unavailable";
  }
  // Wake Lock has no separate user prompt — if the API exists, calling
  // it succeeds silently (subject to user activation). Treat it as
  // "granted" so the row reflects "this device can keep the screen on
  // during a game" rather than a misleading prompt CTA.
  return "granted";
}

async function probeClipboardWrite(): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return "unavailable";
  }
  if (!navigator.permissions?.query) return "granted";
  try {
    const status = await navigator.permissions.query({
      name: "clipboard-write" as PermissionName,
    });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    // Some browsers throw on unknown permission names — treat that as
    // "the API is there, just call it directly when the user clicks".
    return "granted";
  }
}

async function probeVibrate(): Promise<PermissionResult> {
  if (typeof navigator === "undefined") return "unavailable";
  return typeof navigator.vibrate === "function" ? "granted" : "unavailable";
}

async function probeFullscreen(): Promise<PermissionResult> {
  if (typeof document === "undefined") return "unavailable";
  const el = document.documentElement as unknown as {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  const supported = Boolean(
    el?.requestFullscreen ?? el?.webkitRequestFullscreen ?? el?.msRequestFullscreen,
  );
  return supported ? "granted" : "unavailable";
}

// ---------------------------------------------------------------------
// Active request handlers (lazy imports to avoid circular module deps).
// ---------------------------------------------------------------------

async function requestMicrophonePrompt(): Promise<PermissionResult> {
  if (!navigator.mediaDevices?.getUserMedia) return probeMicrophone();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
      return "denied";
    }
    return probeMicrophone();
  }
}

async function requestCameraPrompt(): Promise<PermissionResult> {
  if (!navigator.mediaDevices?.getUserMedia) return probeCamera();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
      return "denied";
    }
    return probeCamera();
  }
}

async function requestNotificationsPrompt(): Promise<PermissionResult> {
  // Re-use the post-signup helper so a single tap handles BOTH the
  // web notification permission AND the native push registration when
  // the app is wrapped in Capacitor.
  const mod = await import("@/lib/startup-permissions");
  const summary = await mod.requestPostSignupNotificationPermissions();
  if (Capacitor.isNativePlatform() && summary.nativePush !== "unavailable") {
    return summary.nativePush;
  }
  return summary.notifications;
}

async function requestOverlayPromptOrDeepLink(): Promise<PermissionResult> {
  const { requestOverlayPermission } = await import("@/lib/native-call-permissions");
  const result = await requestOverlayPermission();
  if (!result.supported) return "unavailable";
  return result.granted ? "granted" : "denied";
}

async function requestClipboardWritePrompt(): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return "unavailable";
  }
  // Modern Chromium and Safari grant `clipboard-write` automatically
  // when the call originates from a user gesture, so the click that
  // actually copies a value (e.g. "Copy invite link") is itself the
  // permission prompt. Triggering a side-effect-free write here would
  // either clobber the user's clipboard or, in Firefox, raise a
  // NotAllowedError outside a gesture — so the safest thing the
  // Settings row can do is consult the Permissions API when available
  // and otherwise report the API as supported (`granted`).
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: "clipboard-write" as PermissionName,
      });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
      return "prompt";
    }
  } catch {
    // Some browsers throw on unknown permission names — fall through.
  }
  return "granted";
}

async function requestVibratePrompt(): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return "unavailable";
  }
  try {
    navigator.vibrate(1);
    return "granted";
  } catch {
    return "unavailable";
  }
}

// ---------------------------------------------------------------------
// Settings deep-link handlers (lazy imports for circular-dep safety).
// ---------------------------------------------------------------------

async function openMicrophoneSettings(): Promise<void> {
  const mod = await import("@/lib/startup-permissions");
  await mod.openMicrophoneSettings();
}

async function openCameraSettings(): Promise<void> {
  const mod = await import("@/lib/startup-permissions");
  if (Capacitor.isNativePlatform()) {
    await mod.openAppSettings();
    return;
  }
  // Chromium-family browsers group camera + microphone settings on the
  // same page; sending the user to the mic page lands them next to the
  // camera toggle as well.
  await mod.openMicrophoneSettings();
}

async function openNotificationSettings(): Promise<void> {
  const mod = await import("@/lib/startup-permissions");
  await mod.openNotificationSettings();
}

async function openOverlaySettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { requestOverlayPermission } = await import("@/lib/native-call-permissions");
  await requestOverlayPermission();
}

/**
 * Probe the native call UI (CallKit on iOS, Telecom on Android) and
 * resolve to "granted" only when the OS exposes a real native call
 * surface that we can drive. On the web — and on iOS Safari tabs that
 * have not been installed as a PWA — there is no CallKit/Telecom
 * binding to manage, so we report "unavailable" to keep the row
 * accurate (no misleading Allow CTA).
 */
async function probeNativeCallUI(): Promise<PermissionResult> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    const mod = await import("@/lib/native-call-ui");
    const available = await mod.isNativeCallUIAvailable();
    return available ? "granted" : "unavailable";
  } catch {
    return "unavailable";
  }
}

// ---------------------------------------------------------------------
// Catalogue.
// ---------------------------------------------------------------------

function readSummary(
  s: CataloguePermissionSummary | null,
  id: PermissionId,
): PermissionResult {
  if (!s) return "unavailable";
  return s[id] ?? "unavailable";
}

export const PERMISSION_CATALOGUE: PermissionEntry[] = [
  {
    id: "microphone",
    icon: Mic,
    titleKey: "settings.permissions.microphone.title",
    helperKey: "settings.permissions.microphone.helper",
    probe: probeMicrophone,
    getState: (s) => readSummary(s, "microphone"),
    isAvailable: (s) => readSummary(s, "microphone") !== "unavailable",
    request: requestMicrophonePrompt,
    openSettings: openMicrophoneSettings,
  },
  {
    id: "camera",
    icon: Camera,
    titleKey: "settings.permissions.camera.title",
    helperKey: "settings.permissions.camera.helper",
    probe: probeCamera,
    getState: (s) => readSummary(s, "camera"),
    isAvailable: (s) => readSummary(s, "camera") !== "unavailable",
    request: requestCameraPrompt,
    openSettings: openCameraSettings,
  },
  {
    id: "notifications",
    icon: Bell,
    titleKey: "settings.permissions.notifications.title",
    helperKey: "settings.permissions.notifications.helper",
    probe: probeNotifications,
    getState: (s) => {
      if (!s) return "unavailable";
      // On native devices the OS push permission is the authoritative
      // signal — the in-WebView Notification API may report "granted"
      // even when the user has muted notifications system-wide.
      if (s.nativePush !== "unavailable") return s.nativePush;
      return s.notifications;
    },
    isAvailable: (s) => {
      if (!s) return true;
      return s.notifications !== "unavailable" || s.nativePush !== "unavailable";
    },
    request: requestNotificationsPrompt,
    openSettings: openNotificationSettings,
  },
  {
    id: "overlay",
    icon: Layers,
    titleKey: "settings.permissions.overlay.title",
    helperKey: "settings.permissions.overlay.helper",
    probe: probeOverlay,
    getState: (s) => readSummary(s, "overlay"),
    isAvailable: (s) => readSummary(s, "overlay") !== "unavailable",
    request: requestOverlayPromptOrDeepLink,
    openSettings: openOverlaySettings,
  },
  {
    // Native-only row that surfaces whether CallKit (iOS) or Telecom
    // (Android) is wired up for incoming-call UI. We deliberately keep
    // it read-only — there is no per-app prompt for these system
    // frameworks, only the underlying notification permission (already
    // covered by the `notifications` row).
    id: "nativeCallUI",
    icon: PhoneIncoming,
    titleKey: "settings.permissions.nativeCallUI.title",
    helperKey: "settings.permissions.nativeCallUI.helper",
    probe: probeNativeCallUI,
    getState: (s) => readSummary(s, "nativeCallUI"),
    isAvailable: (s) => readSummary(s, "nativeCallUI") !== "unavailable",
  },
  {
    id: "wakeLock",
    icon: Monitor,
    titleKey: "settings.permissions.wakeLock.title",
    helperKey: "settings.permissions.wakeLock.helper",
    probe: probeWakeLock,
    getState: (s) => readSummary(s, "wakeLock"),
    isAvailable: (s) => readSummary(s, "wakeLock") !== "unavailable",
    // The Wake Lock API has no separate prompt — the only interaction
    // is "use it from a click handler". No deep-link either.
  },
  {
    id: "clipboardWrite",
    icon: Clipboard,
    titleKey: "settings.permissions.clipboardWrite.title",
    helperKey: "settings.permissions.clipboardWrite.helper",
    probe: probeClipboardWrite,
    getState: (s) => readSummary(s, "clipboardWrite"),
    isAvailable: (s) => readSummary(s, "clipboardWrite") !== "unavailable",
    request: requestClipboardWritePrompt,
    // The Clipboard API has no per-site settings panel — Chromium and
    // Safari both grant `clipboard.writeText` automatically when the
    // call originates from a user gesture, so a "Open settings" deep
    // link would only mislead the user. We deliberately omit it.
  },
  {
    id: "vibrate",
    icon: Vibrate,
    titleKey: "settings.permissions.vibrate.title",
    helperKey: "settings.permissions.vibrate.helper",
    probe: probeVibrate,
    getState: (s) => readSummary(s, "vibrate"),
    isAvailable: (s) => readSummary(s, "vibrate") !== "unavailable",
    request: requestVibratePrompt,
    // No settings panel — vibration is a Web API toggle on the device,
    // not a per-site permission.
  },
  {
    id: "fullscreen",
    icon: Maximize2,
    titleKey: "settings.permissions.fullscreen.title",
    helperKey: "settings.permissions.fullscreen.helper",
    probe: probeFullscreen,
    getState: (s) => readSummary(s, "fullscreen"),
    isAvailable: (s) => readSummary(s, "fullscreen") !== "unavailable",
    // Fullscreen has no programmatic "request permission" — calling
    // requestFullscreen() from a user gesture either works or is
    // blocked by the OS. No settings panel either.
  },
];

export function getPermissionEntry(id: PermissionId): PermissionEntry {
  const entry = PERMISSION_CATALOGUE.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown permission id: ${id}`);
  return entry;
}

/**
 * Probe every catalogue entry in parallel and return a fully populated
 * summary. This is the primitive that `startup-permissions.ts` delegates
 * to so the runtime probe and the Settings UI cannot drift apart.
 */
export async function probeAllPermissions(): Promise<Record<PermissionId, PermissionResult>> {
  const entries = PERMISSION_CATALOGUE;
  const results = await Promise.all(
    entries.map((e) => e.probe().catch(() => "unavailable" as PermissionResult)),
  );
  return entries.reduce(
    (acc, entry, index) => {
      acc[entry.id] = results[index];
      return acc;
    },
    {} as Record<PermissionId, PermissionResult>,
  );
}

export { normalizeNativePermission };
