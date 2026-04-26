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
   client/public/downloads/VEX-official-release.aab
cp android/app/build/outputs/apk/release/app-release.apk \
   client/public/downloads/VEX-official-release.apk
```

### 6.3. Verify the signature

Before committing, confirm the APK was signed with the official key —
the SHA-1 fingerprint must match the value registered with Google Play
and any social login OAuth clients:

```bash
keytool -printcert -jarfile client/public/downloads/VEX-official-release.apk \
  | grep 'SHA1:'
# expect: SHA1: 7F:8D:A0:CB:12:42:1A:7F:90:6D:43:2E:6C:C2:96:1A:DD:AE:C8:B8
```

If the fingerprint differs, **stop** — installing a mismatched APK over
an existing install will fail with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
on every user's device.

### 6.4. Ship to production

```bash
git add client/public/downloads/VEX-official-release.aab \
        client/public/downloads/VEX-official-release.apk
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
