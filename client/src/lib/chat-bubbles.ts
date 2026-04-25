/**
 * Thin JS bridge for the `ChatBubbles` Capacitor plugin.
 *
 * The native plugin lives at `native-plugins/capacitor-chat-bubbles/`
 * and is only meaningfully implemented on Android — see
 * `docs/CHAT_BUBBLES_PLAYBOOK.md`. On every other platform the methods
 * are no-ops that return `supported: false`, so callers can use this
 * module unconditionally without `Capacitor.isNativePlatform()` checks
 * sprinkled everywhere.
 *
 * Registered the same way as the call-UI plugin (registerPlugin) so
 * the project tsconfig — which only includes `client/src`, `shared`
 * and `server` — does not need to be widened.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ShowBubbleArgs {
  /** Stable ID for this bubble — usually the peer user id. */
  peerId: string;
  /** Display name shown next to the avatar in the OS Bubble. */
  name: string;
  /** Optional avatar URL. The native side will fall back to initials. */
  avatarUrl?: string;
  /** The latest message body to surface inside the bubble preview. */
  body: string;
  /** Number of unread messages from this peer (>=1). */
  unreadCount: number;
}

export interface BubblesSupport {
  supported: boolean;
  /**
   * `bubble` = Android 11+ Notification.BubbleMetadata,
   * `overlay` = pre-11 SYSTEM_ALERT_WINDOW WindowManager fallback,
   * `none`    = no native surface (web, iOS, denied perms, etc).
   */
  mode: "bubble" | "overlay" | "none";
}

export interface ConfigureBubblesArgs {
  /** Absolute API base URL (no trailing slash). */
  apiBaseUrl?: string;
  /** Bearer token used by the in-bubble native chat surface. */
  authToken?: string;
}

interface PluginShape {
  isBubblesSupported(): Promise<BubblesSupport>;
  configure(args: ConfigureBubblesArgs): Promise<void>;
  showBubble(args: ShowBubbleArgs): Promise<{ shown: boolean }>;
  hideBubble(args: { peerId: string }): Promise<void>;
  hideAllBubbles(): Promise<void>;
}

const ChatBubbles = registerPlugin<PluginShape>("ChatBubbles");

function isAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export async function isBubblesSupported(): Promise<BubblesSupport> {
  if (!isAndroid()) return { supported: false, mode: "none" };
  try {
    return await ChatBubbles.isBubblesSupported();
  } catch {
    return { supported: false, mode: "none" };
  }
}

/**
 * Persist API base URL + bearer token in the native plugin's
 * SharedPreferences so the in-bubble chat surface (which can launch
 * cold from an FCM push, after the WebView has been killed) can
 * fetch history and post quick replies. Call whenever the auth token
 * changes; safe to call as a no-op on web/iOS.
 */
export async function configureBubbles(args: ConfigureBubblesArgs): Promise<void> {
  if (!isAndroid()) return;
  try {
    await ChatBubbles.configure(args);
  } catch {
    // Ignore — bubbles will simply prompt the user to "Open in app"
    // when no auth context is available.
  }
}

export async function showBubble(args: ShowBubbleArgs): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const r = await ChatBubbles.showBubble(args);
    return !!r?.shown;
  } catch {
    return false;
  }
}

export async function hideBubble(peerId: string): Promise<void> {
  if (!isAndroid()) return;
  try {
    await ChatBubbles.hideBubble({ peerId });
  } catch {
    // ignore — bubble may already be gone
  }
}

export async function hideAllBubbles(): Promise<void> {
  if (!isAndroid()) return;
  try {
    await ChatBubbles.hideAllBubbles();
  } catch {
    // ignore
  }
}
