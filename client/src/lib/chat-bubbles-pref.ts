/**
 * User preference for the floating chat-bubbles experience.
 *
 * Persisted per authenticated user under
 * `vex_chat_bubbles_enabled:{userId}` so a single shared device
 * (kiosk, family tablet, etc.) does not leak one user's choice to
 * another. When no user id is available (signed out / pre-auth bootstrap)
 * we fall back to the legacy global key for backwards compatibility.
 *
 * Defaults to ON for native Android (where the OS Bubble API gives
 * the closest thing to Messenger chat heads), and OFF on web + iOS
 * because the in-app fallback is best opt-in.
 */
import { Capacitor } from "@capacitor/core";

const LEGACY_GLOBAL_KEY = "vex_chat_bubbles_enabled";
const USER_KEY_PREFIX = "vex_chat_bubbles_enabled:";

function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function storageKeyFor(userId?: string | null): string {
  return userId ? `${USER_KEY_PREFIX}${userId}` : LEGACY_GLOBAL_KEY;
}

export function getChatBubblesDefault(): boolean {
  return isNativeAndroid();
}

export function getChatBubblesEnabled(userId?: string | null): boolean {
  if (typeof window === "undefined") return getChatBubblesDefault();
  try {
    // Prefer the user-scoped value; fall back to the legacy global so
    // existing users don't get reset the first time they sign in.
    const userScoped = userId
      ? window.localStorage.getItem(storageKeyFor(userId))
      : null;
    const raw = userScoped ?? window.localStorage.getItem(LEGACY_GLOBAL_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return getChatBubblesDefault();
  } catch {
    return getChatBubblesDefault();
  }
}

export function setChatBubblesEnabled(enabled: boolean, userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyFor(userId), enabled ? "1" : "0");
    window.dispatchEvent(
      new CustomEvent("vex-chat-bubbles-pref", { detail: { enabled, userId } }),
    );
  } catch {
    // Quota errors etc. — preference simply does not persist.
  }
}
