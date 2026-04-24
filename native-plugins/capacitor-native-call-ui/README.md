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

## Wiring on iOS

After running `npx cap add ios`, edit `ios/App/App/AppDelegate.swift` to
forward VoIP pushes into the plugin so calls wake the device when the
app is killed:

```swift
import PushKit
import CapacitorNativeCallUI

extension AppDelegate: PKPushRegistryDelegate {
  func pushRegistry(_ registry: PKPushRegistry,
                    didReceiveIncomingPushWith payload: PKPushPayload,
                    for type: PKPushType,
                    completion: @escaping () -> Void) {
    guard type == .voIP,
          let callId = payload.dictionaryPayload["callId"] as? String,
          let handle = payload.dictionaryPayload["handle"] as? String else {
      completion(); return
    }
    let isVideo = (payload.dictionaryPayload["callType"] as? String) == "video"
    let convId = payload.dictionaryPayload["conversationId"] as? String
    NativeCallUIPlugin.shared?.reportIncoming(callId: callId,
                                              handle: handle,
                                              isVideo: isVideo,
                                              conversationId: convId) { _ in
      completion()
    }
  }
}
```

You also need a VoIP push certificate from Apple and to register
`UIBackgroundModes` `voip` in `Info.plist`.

## Wiring on Android

After running `npx cap add android`, the plugin's `AndroidManifest.xml`
is auto-merged so the `VexConnectionService` and required permissions
(`MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`, etc.) end up in the host
app. The first call triggers a one-time prompt where the user agrees
that VEX may use the system call UI — this is required by Android for
self-managed `ConnectionService`s.
