# Chat Bubbles Playbook (Task #89)

This document captures how the Messenger-style floating chat bubbles
ship across the VEX stack.

## Surfaces

| Surface | Where it lives | When it runs |
| --- | --- | --- |
| **Android system bubble** | `native-plugins/capacitor-chat-bubbles` (Kotlin) | Android 11+ (API 30+) **and** the user has not disabled bubbles for the channel |
| **Android overlay fallback** | Same plugin, `BubbleOverlayService` | Android 6–10, or 11+ when bubbles are disabled by the user but `SYSTEM_ALERT_WINDOW` is granted |
| **In-app web bubble** | `client/src/components/ChatBubblesLayer.tsx` | Browsers, iOS, and Android when no native surface is available |

## Data flow

There are **three** independent triggers for an Android system bubble,
matching the three states the app can be in:

```
APP IN FOREGROUND (WebView active)
   incoming DM
       │
       ├─ socket.io  ──► useChat hook updates the open conversation
       │
       └─ /ws        ──► NotificationProvider receives `new_notification`
                           │
                           ├─ shows the toast
                           ├─ pings the SW for native push
                           └─ dispatches `vex-incoming-dm` ──► ChatBubblesLayer
                                                                 │
                                                                 ├─ Android native: ChatBubbles.showBubble(...)
                                                                 └─ Web fallback: floating draggable bubble

APP IN BACKGROUND (WebView paused, page still alive)
   FCM push  ──► browser SW (`SHOW_CHAT_BUBBLE` postMessage)
                   └─ ChatBubblesLayer routes it identically to the foreground path

APP KILLED (process not running)
   FCM data push  ──► ChatBubblesFcmService (Android, runs without WebView)
                       └─ BubbleNotifier.showBubble(...) — system bubble appears in the shade
```

The third path is the critical one for Messenger parity: a bubble must
appear even when the user has swiped the app away. It is implemented by
`native-plugins/capacitor-chat-bubbles/.../ChatBubblesFcmService.kt`
(see "FCM push contract" below).

### Web fallback drag interaction

The in-app fallback (`ChatBubblesLayer.tsx`) implements the full
chat-head interaction model:

* Each bubble is draggable via pointer events.
* On release, the bubble snaps to the nearest left/right edge.
* During drag, a centered bottom dismiss target appears; releasing the
  bubble inside it removes it (matches the Messenger UX).
* Tap (no movement) toggles the inline mini chat panel.

## Suppression rules

A bubble is **never** shown when any of these are true:

1. The user disabled the Settings → Notifications → "Floating chat bubbles" toggle.
2. The peer is in the auth user's `notificationMutedUsers` or `mutedUsers` array.
3. `usePrivateCallLayer().hasActiveCall` is true (avoid stomping on the call UI).
4. The user is currently looking at that conversation (`/chat?user={peer}` and tab is visible).

## Permissions

| Permission | Path | Source of declaration |
| --- | --- | --- |
| `SYSTEM_ALERT_WINDOW` | overlay fallback | `capacitor-native-call-ui` (declared in task #88, manifest-merged across modules) |
| `POST_NOTIFICATIONS` | system bubble path | `capacitor-chat-bubbles` AndroidManifest |
| Bubble channel preference | system bubble path | Created on plugin `load()`; user can override in Settings → Apps → VEX → Notifications |

The "Display over other apps" prompt is reused from the existing
`PermissionsBanner` (task #88). No new prompt was added.

## FCM push contract (background path)

The server's DM push must be a **data-only** FCM message (a
`notification` payload would bypass `FirebaseMessagingService` when the
app is killed). Required shape:

```json
{
  "type": "dm",
  "senderId": "<peer user id>",
  "senderName": "<display name>",
  "body": "<message preview>",
  "unreadCount": "<integer string, optional>"
}
```

The host Android app must register the bubble FCM service in its own
`AndroidManifest.xml` (Firebase only resolves messaging services from
the host manifest, not from merged plugin manifests):

```xml
<service
    android:name="click.vixo.chatbubbles.ChatBubblesFcmService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

If the host app already ships its own `FirebaseMessagingService`, it
should either subclass `ChatBubblesFcmService` (and call
`super.onMessageReceived(...)` for non-DM messages) or invoke
`BubbleNotifier.showBubble(applicationContext, ...)` directly when it
sees `data["type"] == "dm"`.

## Settings

`Settings → Notifications → Floating chat bubbles`. Backed by
`client/src/lib/chat-bubbles-pref.ts`:

* localStorage key: `vex_chat_bubbles_enabled` (`"1"` / `"0"`)
* Default: **on for native Android**, **off for web + iOS**
* Toggle dispatches a `vex-chat-bubbles-pref` window event so the layer
  picks it up immediately without a reload.

## iOS

Out of scope. iOS does not allow third-party apps to draw over other
apps, and PiP-style chat heads are not approvable. The plugin's iOS
target is intentionally absent — the JS bridge resolves
`{ supported: false }` so callers fail soft.

## Manual smoke test

1. **Web**: open the site in two tabs as two users, send a DM from tab A
   while tab B is on `/games`. The bubble should appear in tab B.
2. **Web mute**: mute the sender from tab B's chat menu, send another DM
   — no bubble should appear.
3. **Web active call**: start a private call in tab B, send a DM from
   tab A — no bubble.
4. **Web preference off**: toggle the setting off, send another DM — no
   bubble.
5. **Web active conversation**: open the conversation in tab B, send a
   DM from tab A — no bubble (the conversation pane handles it).
6. **Android 11+ (when device available)**: install a debug APK,
   background the app, send a DM — system bubble should appear in the
   shade with conversation styling.
7. **Android 10 (when device available)**: the WindowManager overlay
   should appear instead and snap to the nearest edge on drag-release.
