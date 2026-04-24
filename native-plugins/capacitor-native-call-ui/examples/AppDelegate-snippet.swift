// Add the following to AppDelegate.swift after `npx cap add ios`. The
// PushKit registry must exist before the first VoIP push is delivered,
// so initialise it from `application(_:didFinishLaunchingWithOptions:)`.
//
// Also make sure to:
//   1. Enable the "Push Notifications" capability in Xcode.
//   2. Enable "Background Modes" → "Voice over IP" + "Background fetch"
//      + "Remote notifications" + "Audio, AirPlay, and Picture in Picture".
//   3. Generate an APNs Auth Key (.p8) at developer.apple.com →
//      Certificates, Identifiers & Profiles → Keys → "Apple Push
//      Notifications service (APNs)" — single key works for both alert
//      and VoIP topics. Provide the key id, team id and key contents
//      to the server via APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID and
//      APNS_PRIVATE_KEY environment variables.
//   4. The bundle's VoIP topic is `<bundleId>.voip` (NOT the bundle id
//      itself). The server module already appends `.voip` to whatever
//      `APNS_BUNDLE_ID` you set.

import UIKit
import Capacitor
import CapacitorNativeCallUI   // module name from Package.swift / podspec

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Bootstrap PushKit immediately so any VoIP push that arrives
        // while the app is launching is forwarded straight into
        // CallKit.
        PushKitDelegate.shared.bootstrap()

        // Forward the VoIP token to the server whenever it changes.
        PushKitDelegate.shared.onTokenChanged = { token in
            // Replace with whatever HTTP wrapper the host app uses;
            // include the user's auth header. The server endpoint is
            // `POST /api/devices/voip-token` documented in the plugin
            // README.
            VoipTokenSync.shared.upload(token: token)
        }

        return true
    }

    // ... rest of AppDelegate ...
}
