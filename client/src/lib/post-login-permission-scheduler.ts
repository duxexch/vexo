/**
 * Schedule ONE coordinated native permission request burst exactly
 * 60 seconds after the user authenticates. The burst asks the OS for
 * camera + microphone + notifications in a single batch so the user
 * sees the OS dialogs (never an in-app modal or banner) and never
 * sees them again unless they manually tap "Allow" inside Settings.
 *
 * Behaviour:
 *  - Idempotent per device: once the burst has fired we set a flag in
 *    localStorage so the next sign-in on the same device does not
 *    re-prompt. The on-demand path (start a call, subscribe to push)
 *    re-issues the OS dialog whenever the relevant permission is
 *    still missing — that is the only "fallback" we ship.
 *  - Cancellable: `cancelStartupPermissionRequest` clears any pending
 *    timer (e.g. on sign-out) without consuming the one-time flag.
 *  - Safe to call repeatedly: subsequent calls inside the same window
 *    no-op until the timer fires or the flag is cleared.
 *  - Web safe: on the web platform the OS-level batch is skipped
 *    (browsers gate `getUserMedia` and `Notification.requestPermission`
 *    behind a user gesture); the on-demand call / Settings tab still
 *    work as the manual path.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { requestCallMediaForCall } from "@/lib/native-call-permissions";

const STORAGE_KEY = "vex_startup_permissions_requested_v2";
export const STARTUP_PERMISSION_DELAY_MS = 60_000;

let pendingTimer: number | null = null;

const PushNotifications = registerPlugin<{
  checkPermissions?: () => Promise<{ receive?: string }>;
  requestPermissions?: () => Promise<{ receive?: string }>;
  register?: () => Promise<void>;
}>("PushNotifications");

const LocalNotifications = registerPlugin<{
  checkPermissions?: () => Promise<{ display?: string }>;
  requestPermissions?: () => Promise<{ display?: string }>;
}>("LocalNotifications");

function hasAlreadyRequested(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markRequested(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable — accept the small risk of re-prompting once.
  }
}

export function clearStartupPermissionFlag(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function cancelStartupPermissionRequest(): void {
  if (pendingTimer != null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/**
 * Arm the one-time OS permission request. Call right after a
 * successful authentication. No-op when:
 *  - the burst has already run on this device,
 *  - a timer is already pending in the current page-load,
 *  - we are running outside a browser (SSR / tests).
 */
export function scheduleStartupPermissionRequest(): void {
  if (typeof window === "undefined") return;
  if (hasAlreadyRequested()) return;
  if (pendingTimer != null) return;

  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    void runStartupPermissionRequest();
  }, STARTUP_PERMISSION_DELAY_MS);
}

async function runStartupPermissionRequest(): Promise<void> {
  // A second tab may have raced past the timer — re-check the flag
  // before consuming the user's attention.
  if (hasAlreadyRequested()) return;
  // Mark BEFORE the awaits so a refresh during the OS dialog cannot
  // double-prompt — the user has already seen the dialog once.
  markRequested();

  // 1) Camera + microphone. On native this triggers `Activity#request-
  //    Permissions` (Android) / `AVCaptureDevice` (iOS), surfacing the
  //    OS dialog. We request `video` so a single batch covers both
  //    runtime permissions; if the user only ever does voice calls the
  //    extra camera grant is harmless and avoids a second dialog later.
  if (Capacitor.isNativePlatform()) {
    try {
      await requestCallMediaForCall("video");
    } catch {
      // Plugin failure — the on-demand path will re-issue when needed.
    }
  }

  // 2) Notifications (push + local) — native plugins on Capacitor,
  //    `Notification.requestPermission` on the web. On iOS Safari the
  //    web call is gesture-restricted and resolves to "denied"
  //    silently; that's expected — the Settings tab covers that case.
  await requestNotificationsBurst();
}

async function requestNotificationsBurst(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      if (Capacitor.isPluginAvailable("PushNotifications")) {
        const current = await PushNotifications.checkPermissions?.();
        if (current?.receive !== "granted") {
          const result = await PushNotifications.requestPermissions?.();
          if (result?.receive === "granted") {
            await PushNotifications.register?.();
          }
        } else {
          await PushNotifications.register?.();
        }
      }
    } catch {
      // Plugin error — Settings tab still works as the manual path.
    }
    try {
      if (Capacitor.isPluginAvailable("LocalNotifications")) {
        const current = await LocalNotifications.checkPermissions?.();
        if (current?.display !== "granted") {
          await LocalNotifications.requestPermissions?.();
        }
      }
    } catch {
      // Plugin error — Settings tab still works as the manual path.
    }
    return;
  }

  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // Some embedded browsers reject programmatic prompts — silent.
  }
}
