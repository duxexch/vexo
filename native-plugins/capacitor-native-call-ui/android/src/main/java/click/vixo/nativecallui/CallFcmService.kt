package click.vixo.nativecallui

import android.content.Intent
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FirebaseMessagingService that recognises VEX call wakes.
 *
 * The server sends a high-priority data-only message of shape:
 *   { type: "call", sessionId, callerId, callerUsername, callType, conversationId }
 *
 * Crucially this is a `data` message — not a `notification` message —
 * so this service runs even when the app is killed. Android then gives
 * us ~5 seconds to start a foreground service, which is exactly what
 * [IncomingCallForegroundService] does. From there
 * [CallConnectionService] takes over and Telecom presents the native
 * incoming-call UI on the lock screen.
 *
 * The host app must declare this service in `AndroidManifest.xml`
 * with the `com.google.firebase.MESSAGING_EVENT` intent filter, and
 * either inherit from this class or register it directly. See
 * `examples/AndroidManifest-snippet.xml`.
 */
open class CallFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] != "call") {
            super.onMessageReceived(message)
            return
        }

        val callId = data["sessionId"].orEmpty()
        val handle = data["callerUsername"].orEmpty()
        val callType = data["callType"] ?: "voice"
        val conversationId = data["callerId"]

        if (callId.isBlank() || handle.isBlank()) {
            // Malformed wake — nothing useful to display.
            return
        }

        val intent = Intent(this, IncomingCallForegroundService::class.java).apply {
            action = IncomingCallForegroundService.ACTION_PRESENT
            putExtra(IncomingCallForegroundService.EXTRA_CALL_ID, callId)
            putExtra(IncomingCallForegroundService.EXTRA_HANDLE, handle)
            putExtra(IncomingCallForegroundService.EXTRA_CALL_TYPE, callType)
            putExtra(IncomingCallForegroundService.EXTRA_CONVERSATION_ID, conversationId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    /**
     * The host app should POST this token to
     * `/api/devices/voip-token` whenever it changes (and when the user
     * signs in).
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Broadcast for the host app's own listener to pick up; the
        // plugin doesn't have direct access to the auth layer.
        val intent = Intent("click.vixo.nativecallui.FCM_TOKEN_REFRESH").apply {
            setPackage(packageName)
            putExtra("token", token)
        }
        sendBroadcast(intent)
    }
}
