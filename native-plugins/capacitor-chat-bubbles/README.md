# capacitor-chat-bubbles

Messenger-style floating chat bubbles for the VEX Capacitor app.

| Platform | Surface used |
| --- | --- |
| Android 11+ (API 30+) | `Notification.BubbleMetadata` + long-lived conversation `ShortcutInfo` |
| Android 6–10 (API 24–29) | `WindowManager` `TYPE_APPLICATION_OVERLAY` foreground service |
| iOS | _no-op_ — Apple does not allow third-party floating overlays |
| Web | _no-op_ — the React `ChatBubblesLayer` provides the in-page fallback |

## Permissions

* `SYSTEM_ALERT_WINDOW` — required for the WindowManager fallback. **Already declared by `capacitor-native-call-ui` (task #88)**, so this plugin does not redeclare it. The user-facing grant flow ("Display over other apps") is centralised in the call-UI plugin's `PermissionsBanner` integration.
* `POST_NOTIFICATIONS` — required for the system-bubble path on Android 13+.

## JS API

```ts
import { ChatBubbles } from "capacitor-chat-bubbles";

await ChatBubbles.isBubblesSupported();
// → { supported: true, mode: "bubble" | "overlay" | "none" }

await ChatBubbles.showBubble({
  peerId: "user_123",
  name: "Layla",
  avatarUrl: "https://…",
  body: "أهلاً!",
  unreadCount: 3,
});

await ChatBubbles.hideBubble({ peerId: "user_123" });
await ChatBubbles.hideAllBubbles();
```

## Notes

* The bundled `BubbleActivity` re-broadcasts a `vexapp://chat?user={peerId}` deep link to the host launcher activity — the host app already wires `appUrlOpen` through the Capacitor app plugin so the WebView lands on the correct conversation.
* The fallback service runs as a foreground service with the `specialUse / floating_chat_bubble` subtype to avoid OEM kill policies.
