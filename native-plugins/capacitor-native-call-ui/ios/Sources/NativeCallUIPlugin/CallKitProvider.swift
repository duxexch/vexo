import Foundation
import CallKit
import AVFoundation

/// Owns the CallKit `CXProvider` + `CXCallController` for the lifetime
/// of the process. Exposed via `shared` so PushKit can call into it
/// from `AppDelegate` even before the Capacitor plugin loads.
@objc public final class CallKitProvider: NSObject {
    @objc public static let shared = CallKitProvider()

    /// Set by `NativeCallUIPlugin.load()` so we can forward CallKit
    /// gestures back to JS.
    public var eventEmitter: ((_ name: String, _ payload: [String: Any]) -> Void)?

    private let provider: CXProvider
    private let callController = CXCallController()

    /// Map of CXCall UUID -> JS-side callId so the bridge round-trips.
    private var callIdByUUID: [UUID: String] = [:]
    private var conversationIdByCallId: [String: String] = [:]

    private override init() {
        let configuration = CXProviderConfiguration(localizedName: "VEX")
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        if let icon = UIImage(named: "CallKitIcon") {
            configuration.iconTemplateImageData = icon.pngData()
        }
        self.provider = CXProvider(configuration: configuration)
        super.init()
        self.provider.setDelegate(self, queue: nil)
    }

    /// Called from PushKit (background/killed) and the plugin (foreground).
    /// Apple kills the app within ~5 seconds of receiving a VoIP push if
    /// `reportNewIncomingCall` is not invoked, so this MUST be called
    /// synchronously from `pushRegistry(_:didReceiveIncomingPushWith:for:completion:)`.
    @objc public func reportIncomingCall(
        callId: String,
        handle: String,
        hasVideo: Bool,
        conversationId: String?,
        completion: ((Error?) -> Void)? = nil
    ) {
        let uuid = UUID()
        callIdByUUID[uuid] = callId
        if let conversationId = conversationId {
            conversationIdByCallId[callId] = conversationId
        }
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handle)
        update.hasVideo = hasVideo
        update.localizedCallerName = handle
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            completion?(error)
        }
    }

    @objc public func reportOutgoingCall(
        callId: String,
        handle: String,
        hasVideo: Bool,
        conversationId: String?
    ) {
        let uuid = UUID()
        callIdByUUID[uuid] = callId
        if let conversationId = conversationId {
            conversationIdByCallId[callId] = conversationId
        }
        let cxHandle = CXHandle(type: .generic, value: handle)
        let startCallAction = CXStartCallAction(call: uuid, handle: cxHandle)
        startCallAction.isVideo = hasVideo
        let transaction = CXTransaction(action: startCallAction)
        callController.request(transaction) { _ in /* swallow — JS reflects state */ }
    }

    @objc public func updateCallState(callId: String, state: String) {
        guard let uuid = uuidFor(callId: callId) else { return }
        switch state {
        case "connected":
            provider.reportOutgoingCall(with: uuid, connectedAt: Date())
        case "connecting":
            provider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
        case "ended":
            provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            forget(callId: callId)
        default:
            break
        }
    }

    @objc public func endCall(callId: String, reason: String) {
        guard let uuid = uuidFor(callId: callId) else { return }
        let endAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endAction)
        callController.request(transaction) { _ in /* swallow */ }
        forget(callId: callId)
    }

    private func uuidFor(callId: String) -> UUID? {
        return callIdByUUID.first(where: { $0.value == callId })?.key
    }

    private func forget(callId: String) {
        if let uuid = uuidFor(callId: callId) {
            callIdByUUID.removeValue(forKey: uuid)
        }
        conversationIdByCallId.removeValue(forKey: callId)
    }

    fileprivate func payload(for uuid: UUID) -> [String: Any] {
        guard let callId = callIdByUUID[uuid] else { return [:] }
        var payload: [String: Any] = ["callId": callId]
        if let conversationId = conversationIdByCallId[callId] {
            payload["conversationId"] = conversationId
        }
        return payload
    }
}

extension CallKitProvider: CXProviderDelegate {
    public func providerDidReset(_ provider: CXProvider) {
        callIdByUUID.removeAll()
        conversationIdByCallId.removeAll()
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let payload = self.payload(for: action.callUUID)
        eventEmitter?("callAnswered", payload)
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        var payload = self.payload(for: action.callUUID)
        payload["reason"] = "userHangup"
        eventEmitter?("callEnded", payload)
        action.fulfill()
        if let callId = callIdByUUID[action.callUUID] {
            forget(callId: callId)
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        var payload = self.payload(for: action.callUUID)
        payload["muted"] = action.isMuted
        eventEmitter?("callMutedChanged", payload)
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Hook reserved for the WebRTC layer to start audio after CallKit
        // grants the session.
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // Hook reserved for tearing down WebRTC audio.
    }
}

#if canImport(UIKit)
import UIKit
#endif
