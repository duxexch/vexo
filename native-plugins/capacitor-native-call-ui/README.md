# capacitor-native-call-ui

Capacitor 8 plugin that surfaces VEX voice/video calls through the OS
native call UI:

- **iOS** — CallKit (`CXProvider` + `CXCallController`). Incoming calls
  show the full-screen lock-screen UI, accept/decline works on
  Bluetooth headsets and CarPlay, and the call appears in the iOS Phone
  app's recents list.
- **Android** — Telecom framework via a self-managed
  `ConnectionService`. Incoming calls take over the lock screen
  (`USE_FULL_SCREEN_INTENT`), accept/decline works on Bluetooth headsets
  and Android Auto, and the call appears in the dialer recents.
- **Web** — no-op fallback. The JS layer keeps using the existing
  in-app modal + audio ringtone path.

## Why this lives in the repo

There is no widely-adopted, maintained Capacitor 8 plugin that wraps
both CallKit and Telecom. The plugin is small, app-specific (PhoneAccount
label, conversation-id forwarding, JS event vocabulary aligned with the
WebRTC layer) and is intentionally vendored so we can iterate without
publishing to npm.

## VoIP push wakes (calls when the app is closed)

The plugin ships everything required to ring a closed/backgrounded
device when an incoming call arrives. Two transports are wired:

- **iOS:** Apple PushKit / VoIP push.
  `PushKitDelegate.shared.bootstrap()` wires up `PKPushRegistry`, and
  any incoming VoIP push is forwarded straight into
  `CallKitProvider.shared.reportIncomingCall(...)`. The plugin's
  `load()` calls `bootstrap()` automatically, but the host app should
  also call it from `application(_:didFinishLaunchingWithOptions:)`
  so PushKit is initialised before the first push is delivered. See
  [`examples/AppDelegate-snippet.swift`](examples/AppDelegate-snippet.swift).
- **Android:** Firebase Cloud Messaging high-priority **data**
  message. `CallFcmService` recognises any payload with
  `data.type == "call"` and starts `IncomingCallForegroundService`,
  which in turn calls Telecom's self-managed
  `CallConnectionService` to take over the lock screen — all within
  the 5-second window enforced by Android Telecom. See
  [`examples/AndroidManifest-snippet.xml`](examples/AndroidManifest-snippet.xml)
  for the manifest entries that must land in the host app.

The server end of this is `server/lib/voip-push.ts`. Each chat call
invite (`POST /api/chat/calls/start`) publishes a VoIP push alongside
the existing in-app socket invite + alert push. Both Apple and Google
gateways use modern token auth (no `.p8` cert files committed to the
repo); credentials are supplied via env vars:

| Variable                        | Purpose                                 |
|---------------------------------|-----------------------------------------|
| `APNS_KEY_ID`                   | Apple `.p8` key id (10 chars)           |
| `APNS_TEAM_ID`                  | Apple developer team id                 |
| `APNS_BUNDLE_ID`                | iOS bundle id (the server appends `.voip`)|
| `APNS_PRIVATE_KEY`              | `.p8` file contents (`\n` literals OK)  |
| `APNS_HOST`                     | Optional: `https://api.sandbox.push.apple.com` for dev|
| `APNS_USE_SANDBOX`              | Optional shortcut: `true` flips host    |
| `FIREBASE_PROJECT_ID`           | GCP project id (`my-app-prod`)          |
| `FIREBASE_CLIENT_EMAIL`         | Service-account email                   |
| `FIREBASE_PRIVATE_KEY`          | Service-account private key (PEM)       |

When neither set is configured, `sendCallVoipPush` logs once and
returns `{ sent: 0 }` — the rest of the call experience keeps working
unchanged. This lets the cert work be staged independently of the
plugin landing in production.

### Device-token registration

Capacitor builds POST whichever tokens they receive (PushKit VoIP
token on iOS, FCM token on Android) to:

```
POST /api/devices/voip-token
{ "platform": "ios" | "android",
  "kind":     "voip" | "apns" | "fcm",
  "token":    "<64-char hex / FCM string>",
  "bundleId": "click.vixo.app",          // optional
  "appVersion": "1.4.2"                   // optional
}
```

`DELETE /api/devices/voip-token` deactivates a token on logout. Tokens
that the gateway reports as dead (APNs 410 `Unregistered`, FCM 404
`UNREGISTERED`) are deactivated automatically.

## Wiring on iOS (manual steps)

After running `npx cap add ios`:

1. Enable the **Push Notifications** capability in Xcode.
2. Enable **Background Modes**: *Voice over IP*, *Background fetch*,
   *Remote notifications* and *Audio, AirPlay, and Picture in Picture*.
3. Add an APNs Auth Key (`.p8`) at `developer.apple.com → Keys`. The
   same key works for both alert and VoIP topics. Provide it to the
   server via the env vars above.
4. Copy the snippet from
   [`examples/AppDelegate-snippet.swift`](examples/AppDelegate-snippet.swift)
   into `AppDelegate.swift`.
5. Forward the VoIP token (`PushKitDelegate.shared.onTokenChanged`)
   to `POST /api/devices/voip-token` whenever it changes.

## Wiring on Android (manual steps)

After running `npx cap add android`:

1. Add `google-services.json` to `android/app/` and apply the
   Google Services Gradle plugin (standard Firebase setup).
2. Merge the entries from
   [`examples/AndroidManifest-snippet.xml`](examples/AndroidManifest-snippet.xml)
   into `android/app/src/main/AndroidManifest.xml`. The
   `MANAGE_OWN_CALLS` permission and the
   `android.telecom.ConnectionService` intent filter are mandatory or
   self-managed Telecom refuses to register the phone account.
3. Forward the FCM token (broadcast on
   `click.vixo.nativecallui.FCM_TOKEN_REFRESH` from `CallFcmService`)
   to `POST /api/devices/voip-token`.
4. The first call triggers a one-time OS prompt asking the user to
   allow VEX to use the system call UI — required by Android for any
   self-managed `ConnectionService`.
