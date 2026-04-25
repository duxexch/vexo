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
</array>
```

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
