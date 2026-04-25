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

```
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
```

`ChatBubblesLayer` also listens to `serviceWorker.controller` messages of
type `SHOW_CHAT_BUBBLE` so a push that arrives while the page is open in
the background still produces a bubble.

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
