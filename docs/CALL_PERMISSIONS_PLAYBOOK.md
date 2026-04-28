# Friend-Call Permissions Playbook

_Tracking task #88 — wires camera + appear-on-top permissions for friend
voice/video calls on iOS, Android and PWA._

This document is for the developer who packages the Capacitor host apps
and is responsible for shipping the next signed Android (`.aab`) and
iOS (`.ipa`) build. The web/PWA path needs no manual configuration —
all the relevant permission prompts are issued from the JS layer.

---

## 1. Permissions added in this task

| Permission                              | Why we need it                                                                                  | Where it is wired                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `android.permission.RECORD_AUDIO`       | Voice + video calls. Without it the WebView's `getUserMedia({audio:true})` is denied silently. | Plugin manifest (auto-merged) + runtime request through `NativeCallUI`.          |
| `android.permission.CAMERA`             | Video calls. Without it `getUserMedia({video:true})` is denied silently.                       | Plugin manifest (auto-merged) + runtime request through `NativeCallUI`.          |
| `android.permission.SYSTEM_ALERT_WINDOW`| Lets ringing UI take over the lock screen even when another app is in front.                   | Plugin manifest (auto-merged). Granted by user via Settings; helper opens it.    |
| iOS `NSMicrophoneUsageDescription`      | Required by App Store review for voice calls.                                                  | Host app `Info.plist` — see section 3.                                            |
| iOS `NSCameraUsageDescription`          | Required by App Store review for video calls.                                                  | Host app `Info.plist` — see section 3.                                            |

The plugin's own `AndroidManifest.xml`
(`native-plugins/capacitor-native-call-ui/android/src/main/AndroidManifest.xml`)
declares the three Android entries above, and Gradle's manifest merger
copies them into the host app automatically. **You do not need to repeat
them in the host app's manifest.** The example snippet under
`native-plugins/capacitor-native-call-ui/examples/AndroidManifest-snippet.xml`
still lists them for documentation purposes.

---

## 2. Android: in-app rationale + runtime grant flow

1. The user taps "Call" or "Video call" inside the app.
2. The JS layer calls `ensureCallRationale("voice" | "video")` from
   `client/src/lib/call-permission-rationale.ts`. This shows the
   localized in-app dialog (EN + AR) explaining what the mic / camera
   are for. The user must tap **Allow**.
3. The JS layer then calls `ensureCallPermissions(kind)` from
   `client/src/lib/native-call-permissions.ts`, which delegates to the
   plugin's `requestCallMediaPermissions` Kotlin entry point. The
   plugin issues the runtime `Activity#requestPermissions(...)` for
   `RECORD_AUDIO` and (for video) `CAMERA`.
4. Only when both grants come back as `granted` does the JS layer call
   `navigator.mediaDevices.getUserMedia(...)` and wire up WebRTC.
5. If the user denies either permission, `attachLocalMedia` re-shows
   the rationale modal in `force: true` mode. That mode exposes a
   one-tap **Open settings** button.

The settings button is wired to `openAppSettings` in
`client/src/lib/startup-permissions.ts`, which uses the Capacitor `App`
plugin's `openSettings()` method on iOS and on Android Capacitor 8.

### SYSTEM_ALERT_WINDOW

Cannot be requested via a runtime dialog. The
`requestOverlayPermission` helper opens
`Settings.ACTION_MANAGE_OVERLAY_PERMISSION` for the host package so the
user can flip the switch in one tap. The new **Permissions** tab in
the settings page surfaces this with a contextual hint when the
permission is denied.

---

## 3. iOS host app — Info.plist additions

The host app's `Info.plist` MUST declare the following keys before the
app is submitted to the App Store. Without them, the call to
`AVCaptureDevice.requestAccess(...)` (issued by the WebView under the
hood when `getUserMedia` is called) will throw a runtime exception and
the app will be force-quit.

```xml
<key>NSMicrophoneUsageDescription</key>
<string>VEX uses your microphone only during voice and video calls so the other person can hear you. Audio is never recorded or stored.</string>

<key>NSCameraUsageDescription</key>
<string>VEX uses your camera only during video calls so the other person can see you. Video is never recorded or stored.</string>
```

Already present from earlier work (kept here for completeness):

```xml
<key>UIBackgroundModes</key>
<array>
  <string>voip</string>
  <string>audio</string>
  <string>remote-notification</string>
  <string>fetch</string>
</array>
```

The four entries above mirror the four "Background Modes" capability
toggles enabled in Xcode (see step 2 of
`native-plugins/capacitor-native-call-ui/examples/AppDelegate-snippet.swift`)
and match the canonical snippet referenced below.

A copy-paste-ready version of all the keys above (including the
existing `UIBackgroundModes` array) lives at
`native-plugins/capacitor-native-call-ui/examples/Info-plist-snippet.xml`
so future iOS builds can pull from a single source of truth instead of
re-typing the wording. **Unlike the Android plugin manifest, the iOS
host app's `Info.plist` is NOT auto-merged from the plugin** — these
keys must be added by hand (or by a build script) into
`ios/App/App/Info.plist` after `npx cap add ios`.

CallKit on iOS handles the actual mic/camera prompt at the moment the
call is reported as connected — the in-app rationale serves as a
courtesy explainer before that happens.

---

## 4. Two-phone smoke test

1. Install the latest signed Android APK on two physical Android
   phones (Android 10+ recommended). Sign in with two accounts that
   are mutual friends.
2. From phone A, start a **video** call to phone B.
3. Phone A should show the in-app rationale → after tapping Allow,
   the OS dialog asks for mic + camera in one batch.
4. Phone B should ring on the lock screen via the existing CallKit /
   ConnectionService bridge. Answering should also issue the mic +
   camera prompt on phone B.
5. Once both sides have granted, the call should connect with
   bidirectional audio + video.

Negative test:

1. On phone B, deny the camera prompt.
2. Phone B's call session should fail with the rationale modal
   re-opening in `force: true` mode and offering **Open settings**.
3. Phone A should see the call go to "failed" / be disconnected; the
   existing telemetry counters should record one
   `permission_denied` event for the callee.

### 4.1 Video friend-call permanent-denial smoke (Task #128)

The voice-call path was validated on a physical Android device under
Task #124. The video-call path uses the same JS layer
(`use-call-session.tsx` and `private-call-layer.tsx` both invoke
`ensureCallPermissions("video")` and forward the result through
`isPermanentlyDeniedForCall("video", ...)`) but, because the OS asks
for **two** permissions in a single batch, the "Don't ask again" flow
benefits from its own dedicated checklist:

1. **Fresh install** the latest signed APK on a physical phone (or
   wipe app data on an existing install). Sign in with an account
   that has at least one mutual friend.
2. Open the friend chat and tap **Video call**.
3. Confirm the in-app rationale modal lists **both** the microphone
   and camera rows, then tap **Allow**.
4. Confirm the OS surfaces a **single combined** dialog asking for
   microphone + camera. Granting it should let the call proceed.
5. End the call. Open Settings → Apps → VEX → Permissions and revoke
   both microphone and camera. Restart the app.
6. Tap **Video call** again. Tap **Allow** on the in-app rationale.
   On the OS dialog, tap **Don't allow** twice (Android requires two
   consecutive denials before it ticks the internal "permanently
   denied" flag).
7. Tap **Video call** a third time. Confirm:
   - The rationale modal now shows **Open Settings** as the primary
     CTA.
   - The **Allow** button is hidden entirely.
   - Tapping **Open Settings** lands you on the app's permission
     screen for VEX (not the home Settings root).

A regression in any of these steps means the video path has fallen
out of sync with the voice path. The JS-side behaviour is locked in
by `tests/call-permission-prompt.test.tsx` (modal CTA layout for
video kind) and `tests/native-call-permissions-kind.test.ts`
(`isPermanentlyDeniedForCall("video", ...)` and
`isMissingForCall("video", ...)` routing).

#### Device-test log

| Date (YYYY-MM-DD) | Device                | Android version | Result | Notes              |
| ----------------- | --------------------- | --------------- | ------ | ------------------ |
| _pending_         | _to be filled in_     | _to be filled_  | _—_    | _engineer's name_  |

After completing the checklist on a real device, append a row above
with the device model, Android version, pass/fail outcome and any
follow-up observations.

---

## 5. Permissions-tab UI

Settings → Permissions exposes the live state of microphone, camera,
notifications and overlay permission. The UI:

- Re-checks state on mount and when the user taps **Re-check**.
- Offers **Open settings** for any denied permission.
- Surfaces an amber hint specifically for SYSTEM_ALERT_WINDOW because
  it has to be flipped from a separate Settings screen.

The same probe drives the optional one-time startup banner that
prompts users to review their permissions when one of the call-related
ones is missing.

---

## 6. Native build & ship (Android AAB + APK)

The Replit container intentionally does **not** carry the JDK 21 +
Android SDK + signing keystore needed to produce a signed release.
Builds happen on a developer workstation, then the artifacts are
committed under `client/public/downloads/` so the in-app installer and
the public download links stay in sync.

### 6.1. Workstation prerequisites

- JDK 21 on `JAVA_HOME` (Android Gradle Plugin 8.x requires it).
- Android command-line tools + platform-tools 35.
- The release keystore at `android/keystore/vex-release-official.jks`.
  This file is git-ignored — keep it in 1Password / a hardware token,
  never inside the repo.
- The two passwords (store + key) in environment variables, never in
  shell history:

  ```bash
  export VEX_KEYSTORE_PASSWORD='...'
  export VEX_KEY_PASSWORD='...'
  ```

  `capacitor.config.ts` reads these via the Gradle `signingConfigs`
  block; if they are unset the build deliberately fails fast instead of
  producing an unsigned binary.

### 6.2. Build steps

```bash
# 1. Sync the latest web bundle into the native project.
npm run build
npx cap sync android

# 2. Produce a signed AAB (for Play Store) and APK (for sideload).
cd android
./gradlew bundleRelease assembleRelease
cd ..

# 3. Copy the artifacts back into the served downloads directory using
#    the canonical filenames — install-app.tsx, admin-app-settings.tsx
#    and server/health.ts all hard-code these names.
cp android/app/build/outputs/bundle/release/app-release.aab \
   client/public/downloads/app.aab
cp android/app/build/outputs/apk/release/app-release.apk \
   client/public/downloads/app.apk
```

### 6.3. Verify the signature

Before committing, confirm the APK was signed with the official key —
the SHA-1 fingerprint must match the value registered with Google Play
and any social login OAuth clients:

```bash
keytool -printcert -jarfile client/public/downloads/app.apk \
  | grep 'SHA1:'
# expect: SHA1: 7F:8D:A0:CB:12:42:1A:7F:90:6D:43:2E:6C:C2:96:1A:DD:AE:C8:B8
```

If the fingerprint differs, **stop** — installing a mismatched APK over
an existing install will fail with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
on every user's device.

### 6.4. Ship to production

```bash
git add client/public/downloads/app.aab \
        client/public/downloads/app.apk
git commit -m "chore(android): rebuild signed AAB+APK"
git push origin main

# On the VPS (/docker/vex):
ssh vex 'cd /docker/vex && ./prod-update.sh'
```

`prod-update.sh` pulls main, rebuilds the web container, and reloads
Traefik so the new download links go live without dropping in-flight
requests.

### 6.5. Manual smoke after install

1. Sideload the new APK on a fresh test device (or wipe app data).
2. Open the app, navigate to a friend chat, tap **Voice call**.
3. The native rationale modal must appear, followed by the **Android OS
   microphone permission dialog**. If the OS dialog does not appear,
   the regression that motivated Task #124 has returned — re-check
   that `VoiceChat.tsx` still calls `ensureCallPermissions("voice")`
   before invoking `getUserMedia`.
4. On the same device, deny the prompt with **Don't ask again** and
   retry. The modal should now hide **Allow** entirely and show only
   **Open settings** (this is the new permanently-denied UX).

### 6.6. WebView permission delegation — defence in depth

The Task #124 fix lives at two layers, in priority order:

1. **JS preflight (primary fix)** in
   `client/src/components/games/VoiceChat.tsx`,
   `client/src/hooks/use-call-session.tsx` and
   `client/src/components/chat/private-call-layer.tsx` — each call
   site invokes `ensureCallPermissions(kind)` (the native plugin's
   runtime permission request) BEFORE
   `navigator.mediaDevices.getUserMedia`. This guarantees the host
   already holds `RECORD_AUDIO` (and `CAMERA` for video) by the time
   the WebView issues its permission request, so the bridge's
   `onPermissionRequest` resolves to "grant" instead of silently
   auto-denying.
2. **Permanently-denied UX** — the plugin emits
   `microphonePermanentlyDenied` / `cameraPermanentlyDenied` whenever
   `shouldShowRequestPermissionRationale` reports the user has ticked
   "Don't ask again" (combined with a SharedPreferences "asked-before"
   tracker so first-launch is not mis-classified). The rationale
   modal hides "Allow" in that state and promotes "Open Settings" to
   the primary CTA.

We deliberately do NOT swap `WebView.webChromeClient` at runtime.
Capacitor's `BridgeWebChromeClient` already implements
`onPermissionRequest` correctly, and replacing it through reflection
would risk breaking other Bridge callbacks (file chooser, JS dialogs,
custom tabs). The host-app contract documented in
`native-plugins/capacitor-native-call-ui/examples/AndroidManifest-snippet.xml`
requires that `MainActivity` either keep `BridgeWebChromeClient` as-is,
or extend it (so `onPermissionRequest` reaches `super`).

Verify with logcat (Replit container does not have `adb`; run on the
workstation):

```bash
adb logcat -s Capacitor:I chromium:I AndroidRuntime:E
```

Tap **Voice call** on a fresh install and confirm:

- The in-app rationale modal appears.
- The OS runtime mic permission dialog appears within ~250 ms of
  tapping **Allow**.
- `getUserMedia` resolves with a real `MediaStream` (no
  `NotAllowedError` in logcat).

---

## 7. Background incoming-call wake (FCM on Android, PushKit on iOS)

Sections 1–6 cover **foreground** calls — the app is on screen, the
WebSocket is connected, the JS layer presents the incoming-call UI.
When the receiver's app is **backgrounded or killed** the WebSocket is
gone and the only thing the OS will allow is a high-priority push that
wakes a foreground service inside the OS-budgeted ~5 second window.

Without the credentials below, server logs print once at boot:

```
[voip-push] FCM not configured — Android background-call wake disabled
            until FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY are set.
[voip-push] APNs not configured — iOS lock-screen ringing disabled
            until APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID/APNS_PRIVATE_KEY are set.
```

…and `sendCallVoipPush` returns `{ sent: 0 }` instead of throwing, so
foreground-only calls still work. Friend calls to a killed device just
go unanswered until the receiver reopens the app.

### 7.1. Android — Firebase Cloud Messaging HTTP v1

#### One-time Firebase project setup

1. Create (or reuse) a Firebase project at <https://console.firebase.google.com>.
2. **Project settings → Service accounts → Generate new private key.**
   This downloads a JSON file containing `project_id`, `client_email`
   and `private_key`. Treat it as a production secret.
3. **Project settings → Your apps → Add Android app.** Use the host
   package id (`click.vixo.app`) and the SHA-1 from
   `keytool -printcert -jarfile client/public/downloads/app.apk`.
   Download the generated `google-services.json` and place it at
   `android/app/google-services.json` on the workstation that builds
   the APK. The Capacitor build picks it up automatically — no code
   changes needed.

#### Wire the credentials into the VPS

Edit `/docker/vex/.env` and add **(values from the JSON above)**:

```bash
FIREBASE_PROJECT_ID=vex-xxxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@vex-xxxxx.iam.gserviceaccount.com
# The private key spans many lines. Either paste it on a single line
# with literal `\n` separators OR use a $'...' quoted heredoc — the
# server normalises both forms in getFcmConfig().
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN...\n-----END PRIVATE KEY-----\n"
```

`docker-compose.prod.yml` already maps these three names through to
the `app` container's environment (added in this task). After editing
`.env`:

```bash
cd /docker/vex
docker compose -f docker-compose.prod.yml --env-file .env up -d app
docker logs vex-app --tail 100 | grep voip-push
# expect: NO "[voip-push] FCM not configured" line on the next boot
```

#### Verify the credentials before relying on them

The repo ships an offline + online doctor that signs a real
service-account JWT and (with `--ping-gateways`) hits the Google
OAuth2 endpoint to confirm acceptance, **without** sending a push or
needing a device:

```bash
# Offline (instant, no network):
npm run ops:voip-push-doctor

# Full handshake with Apple + Google:
npm run ops:voip-push-doctor:online
```

Exit code 0 means every configured transport passed.

#### Host-app registration (already wired)

The plugin ships `CallFcmService` (a `FirebaseMessagingService`
subclass) that recognises `type:"call"` data messages, hands them off
to `IncomingCallForegroundService`, and broadcasts every refreshed
token via `click.vixo.nativecallui.FCM_TOKEN_REFRESH`. The host app
must:

- Register the service in its merged `AndroidManifest.xml` — see
  `native-plugins/capacitor-native-call-ui/examples/AndroidManifest-snippet.xml`,
  the `CallFcmService` block under `<application>`.
- Listen for the `FCM_TOKEN_REFRESH` broadcast and POST the token to
  `/api/devices/voip-token` with `{ platform: "android", kind: "fcm",
  token }`. Server-side persistence and dedupe live in
  `server/routes/devices/voip-tokens.ts` and
  `server/storage/notifications.ts`.

### 7.2. iOS — Apple PushKit / VoIP push

1. <https://developer.apple.com/account> → **Certificates, IDs &
   Profiles → Keys → ➕**. Tick **Apple Push Notifications service
   (APNs)** and download the resulting `.p8` (you can only download
   it once). Note the 10-character Key ID.
2. Find the 10-character Team ID under **Membership**.
3. Edit `/docker/vex/.env`:

   ```bash
   APNS_KEY_ID=ABCDE12345
   APNS_TEAM_ID=ABCDE12345
   APNS_BUNDLE_ID=click.vixo.app
   APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...contents of AuthKey_ABCDE12345.p8...\n-----END PRIVATE KEY-----\n"
   # While testing TestFlight builds against the sandbox gateway:
   APNS_USE_SANDBOX=true
   ```

4. Restart the app container as in 7.1 and re-run
   `npm run ops:voip-push-doctor:online`.

The server appends `.voip` to `APNS_BUNDLE_ID` automatically when
building the `apns-topic` header — paste the plain bundle id only.

### 7.3. End-to-end smoke

1. Sign in on two phones (one caller, one receiver). Confirm both
   `/api/devices/voip-token` POSTs succeeded — there should be one row
   per device in `device_push_tokens` with the right `platform`/`kind`.
2. **Force-stop** the receiver's app from system settings (not just
   background it — Android's "swipe away" leaves the WebSocket alive
   for a few seconds).
3. Initiate a friend voice call from the caller.
4. Within ~5 seconds the receiver's lock screen should display the
   native CallKit/Telecom incoming-call UI. Tapping **Accept** must
   relaunch the app straight into the active call (the plugin emits
   `acceptedFromNative` which the JS layer rehydrates into a normal
   `useCallSession` connect).
5. If nothing happens, check `docker logs vex-app | grep voip-push`
   for either the not-configured warning or a non-2xx FCM/APNs
   response code (`UNREGISTERED` ⇒ stale device token, `404` ⇒ wrong
   `FIREBASE_PROJECT_ID`, `403` ⇒ service-account JWT signing failed).
