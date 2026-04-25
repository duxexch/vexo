/**
 * Public API for the ChatBubbles Capacitor plugin.
 *
 * Implementation parity:
 *   • Android API 30+ (R / Android 11+) → uses Notification.BubbleMetadata
 *     + a long-lived ShortcutInfo so the bubble qualifies for the
 *     "conversation" prioritization in the system shade.
 *   • Android API 29 and below → falls back to a WindowManager
 *     TYPE_APPLICATION_OVERLAY service (requires SYSTEM_ALERT_WINDOW,
 *     which the host app already declares + prompts for via the
 *     companion call-UI plugin shipped in task #88).
 *   • iOS + Web → no-ops; calls resolve with `supported: false`.
 */
export type BubblesMode = "bubble" | "overlay" | "none";

export interface BubblesSupport {
  supported: boolean;
  mode: BubblesMode;
}

export interface ShowBubbleOptions {
  /** Stable key — usually the peer user id. Passing the same key replaces
   *  the existing bubble in place rather than spawning a new one. */
  peerId: string;
  /** Display name shown next to the avatar. */
  name: string;
  /** Optional avatar URL (https). The native side falls back to initials. */
  avatarUrl?: string;
  /** Latest message preview line surfaced in the bubble. */
  body: string;
  /** Total unread count from this peer (>=1) — drives the badge. */
  unreadCount: number;
}

export interface ConfigureOptions {
  /** Absolute base URL of the API (no trailing slash). Used by the
   *  in-bubble chat surface to fetch history and post quick replies. */
  apiBaseUrl?: string;
  /** Bearer token for the chat API. Stored in private SharedPreferences
   *  on Android — same trust boundary as the WebView's localStorage.
   *
   *  Pass `null` (NOT `undefined`) on logout / account switch so the
   *  native side wipes any cached token. `undefined` means "no
   *  change", which intentionally leaves the previous value alone. */
  authToken?: string | null;
  /** Mirror of the JS-side chat-bubbles toggle. The native FCM-killed
   *  path consults this so a disabled user never sees a bubble even
   *  when the WebView isn't around to gate the request. */
  bubblesEnabled?: boolean;
  /** Peer ids the current user has muted. The native FCM-killed path
   *  drops bubbles for any peer in this list, matching the in-app
   *  suppression rules. */
  mutedPeerIds?: string[];
  /** Whether the user is currently in a voice/video call. The native
   *  bubble surface stays hidden while a call is active, mirroring
   *  the in-app suppression rule. */
  inActiveCall?: boolean;
}

export interface ChatBubblesPlugin {
  isBubblesSupported(): Promise<BubblesSupport>;
  /** Persist API base URL + auth token so the bubble's expanded surface
   *  can talk to the backend even when the WebView is gone. Call this
   *  whenever the auth token rotates. */
  configure(options: ConfigureOptions): Promise<void>;
  showBubble(options: ShowBubbleOptions): Promise<{ shown: boolean }>;
  hideBubble(options: { peerId: string }): Promise<void>;
  hideAllBubbles(): Promise<void>;
}
