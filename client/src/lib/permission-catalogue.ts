/**
 * Single source of truth for the device permissions VEX surfaces to the
 * user. Drives both the startup probe (already exposed via
 * `startup-permissions.ts`) and the redesigned Permissions tab inside
 * Settings — adding a new permission means adding one entry here, not
 * editing two parallel switch statements.
 *
 * Each entry knows:
 *  - which icon + translation keys to render,
 *  - how to read its current state from a `PermissionSummary`,
 *  - whether the platform supports the permission at all,
 *  - how to actively request it (when the OS allows in-page prompts),
 *  - how to deep-link to the OS / browser settings page.
 *
 * `request` is optional — for permissions like Android draw-over-other
 * apps (overlay), the OS does not allow in-page granting and we instead
 * deep-link straight to the relevant settings panel.
 */

import type { ComponentType } from "react";
import { Bell, Camera, Layers, Mic } from "lucide-react";
import { Capacitor } from "@capacitor/core";

import {
  openAppSettings,
  openMicrophoneSettings,
  openNotificationSettings,
  refreshPermissionSummary,
  requestPostSignupNotificationPermissions,
  type PermissionResult,
  type PermissionSummary,
} from "@/lib/startup-permissions";

export type PermissionId =
  | "microphone"
  | "camera"
  | "notifications"
  | "overlay";

export interface PermissionEntry {
  id: PermissionId;
  icon: ComponentType<{ className?: string }>;
  titleKey: string;
  helperKey: string;
  /** Read this permission's state from a (possibly stale) probe summary. */
  getState: (summary: PermissionSummary | null) => PermissionResult;
  /** True when the runtime can actually surface this permission. */
  isAvailable: (summary: PermissionSummary | null) => boolean;
  /**
   * Trigger the OS / browser permission prompt and resolve to the new
   * state. Undefined for permissions that can only be deep-linked
   * (e.g. Android overlay).
   */
  request?: () => Promise<PermissionResult>;
  /** Deep-link to the relevant OS or browser settings screen. */
  openSettings: () => Promise<void>;
}

async function requestMicrophonePrompt(): Promise<PermissionResult> {
  // The web prompt only fires from a real `getUserMedia` call. Run a
  // throwaway capture so the browser surfaces its native chooser, then
  // immediately stop the tracks so we don't leak the mic.
  if (!navigator.mediaDevices?.getUserMedia) {
    return (await refreshPermissionSummary()).microphone;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    const fresh = await refreshPermissionSummary();
    return fresh.microphone === "granted" ? "granted" : "granted";
  } catch (error) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
      await refreshPermissionSummary();
      return "denied";
    }
    return (await refreshPermissionSummary()).microphone;
  }
}

async function requestCameraPrompt(): Promise<PermissionResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return (await refreshPermissionSummary()).camera;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    await refreshPermissionSummary();
    return "granted";
  } catch (error) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
      await refreshPermissionSummary();
      return "denied";
    }
    return (await refreshPermissionSummary()).camera;
  }
}

async function requestNotificationsPrompt(): Promise<PermissionResult> {
  // Re-use the post-signup helper so a single tap handles BOTH the web
  // notification permission AND the native push registration when the
  // app is wrapped in Capacitor.
  const summary = await requestPostSignupNotificationPermissions();
  // Prefer the more authoritative state for the platform we're on.
  if (Capacitor.isNativePlatform() && summary.nativePush !== "unavailable") {
    return summary.nativePush;
  }
  return summary.notifications;
}

async function openCameraSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await openAppSettings();
    return;
  }
  // Chromium-family browsers group camera + microphone settings on the
  // same page; sending the user to the mic page lands them next to the
  // camera toggle as well.
  await openMicrophoneSettings();
}

async function requestOrOpenOverlay(): Promise<PermissionResult> {
  const { requestOverlayPermission } = await import("@/lib/native-call-permissions");
  const result = await requestOverlayPermission();
  if (!result.supported) return "unavailable";
  return result.granted ? "granted" : "denied";
}

async function openOverlaySettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { requestOverlayPermission } = await import("@/lib/native-call-permissions");
  await requestOverlayPermission();
}

export const PERMISSION_CATALOGUE: PermissionEntry[] = [
  {
    id: "microphone",
    icon: Mic,
    titleKey: "settings.permissions.microphone.title",
    helperKey: "settings.permissions.microphone.helper",
    getState: (s) => s?.microphone ?? "unavailable",
    isAvailable: (s) => (s?.microphone ?? "unavailable") !== "unavailable",
    request: requestMicrophonePrompt,
    openSettings: openMicrophoneSettings,
  },
  {
    id: "camera",
    icon: Camera,
    titleKey: "settings.permissions.camera.title",
    helperKey: "settings.permissions.camera.helper",
    getState: (s) => s?.camera ?? "unavailable",
    isAvailable: (s) => (s?.camera ?? "unavailable") !== "unavailable",
    request: requestCameraPrompt,
    openSettings: openCameraSettings,
  },
  {
    id: "notifications",
    icon: Bell,
    titleKey: "settings.permissions.notifications.title",
    helperKey: "settings.permissions.notifications.helper",
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
    getState: (s) => s?.overlay ?? "unavailable",
    isAvailable: (s) => (s?.overlay ?? "unavailable") !== "unavailable",
    request: requestOrOpenOverlay,
    openSettings: openOverlaySettings,
  },
];

export function getPermissionEntry(id: PermissionId): PermissionEntry {
  const entry = PERMISSION_CATALOGUE.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown permission id: ${id}`);
  return entry;
}
