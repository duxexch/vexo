/**
 * User preference for the floating chat-bubbles experience.
 *
 * Defaults to ON for native Android (where the OS Bubble API gives
 * the closest thing to Messenger chat heads), and OFF on web + iOS
 * because the in-app fallback is best opt-in.
 *
 * Persisted to localStorage under `vex_chat_bubbles_enabled`.
 */
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "vex_chat_bubbles_enabled";

function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export function getChatBubblesDefault(): boolean {
  return isNativeAndroid();
}

export function getChatBubblesEnabled(): boolean {
  if (typeof window === "undefined") return getChatBubblesDefault();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return getChatBubblesDefault();
  } catch {
    return getChatBubblesDefault();
  }
}

export function setChatBubblesEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    window.dispatchEvent(
      new CustomEvent("vex-chat-bubbles-pref", { detail: { enabled } }),
    );
  } catch {
    // Quota errors etc. — preference simply does not persist.
  }
}
