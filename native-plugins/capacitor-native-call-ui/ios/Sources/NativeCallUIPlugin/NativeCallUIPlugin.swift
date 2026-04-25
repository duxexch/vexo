import Foundation
import AVFoundation
import Capacitor

/// Capacitor bridge for the native call UI. Most of the work is delegated
/// to `CallKitProvider.shared`, which owns the `CXProvider` /
/// `CXCallController` pair, and to `PushKitDelegate.shared`, which
/// receives Apple PushKit / VoIP wakes when the app is backgrounded or
/// killed.
@objc(NativeCallUIPlugin)
public class NativeCallUIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCallUIPlugin"
    public let jsName = "NativeCallUI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportIncomingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportOutgoingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateCallState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkCallMediaPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCallMediaPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkOverlayPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestOverlayPermission", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        // Wire CallKit -> JS event bridge once the plugin is attached.
        CallKitProvider.shared.eventEmitter = { [weak self] eventName, payload in
            self?.notifyListeners(eventName, data: payload)
        }
        // Make sure PushKit is initialised even if the host app didn't
        // already do so from `AppDelegate`. This is a no-op if it is.
        PushKitDelegate.shared.bootstrap()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true, "platform": "ios"])
    }

    @objc func reportIncomingCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"),
              let handle = call.getString("handle"),
              let callTypeRaw = call.getString("callType") else {
            call.reject("callId, handle and callType are required")
            return
        }
        let hasVideo = (callTypeRaw == "video")
        let conversationId = call.getString("conversationId")
        CallKitProvider.shared.reportIncomingCall(
            callId: callId,
            handle: handle,
            hasVideo: hasVideo,
            conversationId: conversationId
        ) { error in
            if let error = error {
                call.reject("Failed to report incoming call: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func reportOutgoingCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"),
              let handle = call.getString("handle"),
              let callTypeRaw = call.getString("callType") else {
            call.reject("callId, handle and callType are required")
            return
        }
        let hasVideo = (callTypeRaw == "video")
        CallKitProvider.shared.reportOutgoingCall(
            callId: callId,
            handle: handle,
            hasVideo: hasVideo,
            conversationId: call.getString("conversationId")
        )
        call.resolve()
    }

    @objc func updateCallState(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"),
              let state = call.getString("state") else {
            call.reject("callId and state are required")
            return
        }
        CallKitProvider.shared.updateCallState(callId: callId, state: state)
        call.resolve()
    }

    @objc func endCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else {
            call.reject("callId is required")
            return
        }
        let reason = call.getString("reason") ?? "userHangup"
        CallKitProvider.shared.endCall(callId: callId, reason: reason)
        call.resolve()
    }

    // MARK: - Call media permissions
    //
    // On iOS, AVFoundation drives the actual permission prompt the
    // first time `getUserMedia` runs inside the WebView. The methods
    // below let the JS layer probe the *current* AVAuthorizationStatus
    // so the in-app rationale + Permissions tab can show accurate
    // state, but they intentionally never block the call: requests
    // simply mirror the current status instead of forcing a prompt
    // here, because forcing a prompt outside of getUserMedia would
    // leave the WKWebView with no media stream even after grant.

    private func mapAuthStatus(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    private func currentMediaStatus() -> [String: String] {
        return [
            "microphone": mapAuthStatus(AVCaptureDevice.authorizationStatus(for: .audio)),
            "camera": mapAuthStatus(AVCaptureDevice.authorizationStatus(for: .video)),
        ]
    }

    @objc func checkCallMediaPermissions(_ call: CAPPluginCall) {
        call.resolve(currentMediaStatus())
    }

    @objc func requestCallMediaPermissions(_ call: CAPPluginCall) {
        // We don't proactively call requestAccess here — see comment
        // above. The JS layer treats `prompt` as a soft pass on iOS
        // so the WKWebView's own getUserMedia call surfaces the OS
        // dialog at the right moment. We just re-read current state.
        call.resolve(currentMediaStatus())
    }

    @objc func checkOverlayPermission(_ call: CAPPluginCall) {
        call.resolve([
            "granted": true,
            "supported": false,
            "platform": "ios",
        ])
    }

    @objc func requestOverlayPermission(_ call: CAPPluginCall) {
        // iOS has no SYSTEM_ALERT_WINDOW equivalent for third-party
        // apps; CallKit handles incoming-call UI natively.
        call.resolve([
            "granted": true,
            "supported": false,
            "platform": "ios",
            "opened": false,
        ])
    }
}
