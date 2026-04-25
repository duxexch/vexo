import Foundation
import PushKit
import CallKit

/// PushKit / VoIP push entry point.
///
/// Apple's PushKit delivers VoIP wakes (`apns-push-type: voip`,
/// `apns-topic: <bundleId>.voip`) to a `PKPushRegistry` even when the
/// app has been killed. The delegate has ~5 seconds to call
/// `CallKitProvider.shared.reportIncomingCall(...)` or iOS will
/// terminate the app and may revoke the VoIP entitlement on repeat
/// offences.
///
/// `bootstrap()` is idempotent — the host app should call it from
/// `application(_:didFinishLaunchingWithOptions:)` so the registry
/// exists before the first VoIP push is delivered. The plugin's
/// `load()` also calls it as a safety net.
@objc public final class PushKitDelegate: NSObject {
    @objc public static let shared = PushKitDelegate()

    private let registry: PKPushRegistry
    private var bootstrapped = false

    private override init() {
        self.registry = PKPushRegistry(queue: .main)
        super.init()
    }

    /// Initialise PushKit. Safe to call multiple times.
    @objc public func bootstrap() {
        if bootstrapped { return }
        bootstrapped = true
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
    }

    /// The most recently issued VoIP token, hex-encoded. The host app
    /// should POST this to `/api/devices/voip-token` whenever it
    /// changes (and when the user signs in).
    @objc public private(set) var currentVoipToken: String?

    /// Optional hook called when the VoIP token is issued or rotated.
    /// Set this from `AppDelegate` to forward the token to the server.
    public var onTokenChanged: ((String) -> Void)?
}

extension PushKitDelegate: PKPushRegistryDelegate {
    public func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        currentVoipToken = token
        onTokenChanged?(token)
    }

    public func pushRegistry(
        _ registry: PKPushRegistry,
        didInvalidatePushTokenFor type: PKPushType
    ) {
        guard type == .voIP else { return }
        currentVoipToken = nil
    }

    public func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else { completion(); return }
        let dictionary = payload.dictionaryPayload
        let callId = (dictionary["sessionId"] as? String) ?? UUID().uuidString
        let handle = (dictionary["callerUsername"] as? String) ?? "Unknown caller"
        let callTypeRaw = (dictionary["callType"] as? String) ?? "voice"
        let conversationId = dictionary["callerId"] as? String

        // CRITICAL: must call reportNewIncomingCall before `completion`
        // returns, otherwise iOS terminates the process. Errors here
        // also count as a violation, so we always report the call (even
        // if data was malformed) and rely on CallKit's UI to make the
        // bad call obvious to the user.
        CallKitProvider.shared.reportIncomingCall(
            callId: callId,
            handle: handle,
            hasVideo: callTypeRaw == "video",
            conversationId: conversationId
        ) { _ in
            completion()
        }
    }
}
