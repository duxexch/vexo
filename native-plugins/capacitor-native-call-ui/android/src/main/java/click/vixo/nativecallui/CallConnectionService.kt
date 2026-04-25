package click.vixo.nativecallui

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.annotation.RequiresApi
import com.getcapacitor.JSObject

/**
 * Self-managed Telecom ConnectionService.
 *
 * Self-managed (vs managed) means the app owns the call audio and UI;
 * Telecom only handles routing (Bluetooth/headset selection, hold-on-
 * GSM-call, etc.). This is the standard pattern WhatsApp and friends
 * use to surface VoIP calls on the native lock screen.
 */
@RequiresApi(Build.VERSION_CODES.O)
class CallConnectionService : ConnectionService() {

    companion object {
        private const val ACCOUNT_ID = "vex-native-call-ui"

        /** Active call connections keyed by JS callId. */
        private val activeCalls = mutableMapOf<String, CallConnection>()

        @SuppressLint("MissingPermission")
        fun placeIncoming(
            context: Context,
            callId: String,
            handle: String,
            callType: String,
            conversationId: String?,
        ) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val accountHandle = ensurePhoneAccount(context, telecom)
            val extras = Bundle().apply {
                putParcelable(
                    TelecomManager.EXTRA_INCOMING_CALL_ADDRESS,
                    Uri.fromParts("sip", handle, null),
                )
                val callExtras = Bundle().apply {
                    putString("callId", callId)
                    putString("handle", handle)
                    putString("callType", callType)
                    putString("conversationId", conversationId)
                }
                putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, callExtras)
            }
            try {
                telecom.addNewIncomingCall(accountHandle, extras)
            } catch (t: SecurityException) {
                // Phone account not enabled by the user; the JS layer
                // can fall back to its in-app ringer.
            }
        }

        fun updateCallState(callId: String, state: String) {
            val connection = activeCalls[callId] ?: return
            when (state) {
                "connected" -> connection.setActive()
                "connecting" -> connection.setDialing()
                "held" -> connection.setOnHold()
                "ended" -> {
                    connection.setDisconnected(DisconnectCause(DisconnectCause.REMOTE))
                    connection.destroy()
                    activeCalls.remove(callId)
                }
            }
        }

        fun endCall(callId: String) {
            val connection = activeCalls.remove(callId) ?: return
            connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            connection.destroy()
        }

        @SuppressLint("MissingPermission")
        private fun ensurePhoneAccount(context: Context, telecom: TelecomManager): PhoneAccountHandle {
            val componentName = ComponentName(context, CallConnectionService::class.java)
            val accountHandle = PhoneAccountHandle(componentName, ACCOUNT_ID)
            val existing = telecom.getPhoneAccount(accountHandle)
            if (existing == null) {
                val phoneAccount = PhoneAccount.builder(accountHandle, "VEX Calls")
                    .setCapabilities(
                        PhoneAccount.CAPABILITY_SELF_MANAGED
                            or PhoneAccount.CAPABILITY_VIDEO_CALLING
                            or PhoneAccount.CAPABILITY_SUPPORTS_VIDEO_CALLING,
                    )
                    .build()
                telecom.registerPhoneAccount(phoneAccount)
            }
            return accountHandle
        }
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ): Connection {
        val extras = request?.extras
        val callId = extras?.getString("callId").orEmpty()
        val handle = extras?.getString("handle").orEmpty()
        val callType = extras?.getString("callType") ?: "voice"
        val conversationId = extras?.getString("conversationId")
        val connection = CallConnection(callId, conversationId)
        connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
        connection.connectionCapabilities =
            Connection.CAPABILITY_MUTE or Connection.CAPABILITY_HOLD or Connection.CAPABILITY_SUPPORT_HOLD
        connection.videoState = if (callType == "video") {
            android.telecom.VideoProfile.STATE_BIDIRECTIONAL
        } else {
            android.telecom.VideoProfile.STATE_AUDIO_ONLY
        }
        connection.setAddress(Uri.fromParts("sip", handle, null), TelecomManager.PRESENTATION_ALLOWED)
        connection.setCallerDisplayName(handle, TelecomManager.PRESENTATION_ALLOWED)
        connection.setRinging()
        if (callId.isNotBlank()) activeCalls[callId] = connection
        return connection
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ): Connection {
        // Outgoing calls are launched from JS — we just record them in
        // the system recents.
        val callId = request?.extras?.getString("callId").orEmpty()
        val connection = CallConnection(callId, null)
        connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
        connection.setDialing()
        if (callId.isNotBlank()) activeCalls[callId] = connection
        return connection
    }

    private class CallConnection(
        val callId: String,
        val conversationId: String?,
    ) : Connection() {

        override fun onAnswer() {
            setActive()
            emit(NativeCallUIPlugin.EVENT_ANSWERED)
        }

        override fun onReject() {
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            emit(NativeCallUIPlugin.EVENT_ENDED, mapOf("reason" to "declined"))
            destroy()
            activeCalls.remove(callId)
        }

        override fun onDisconnect() {
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            emit(NativeCallUIPlugin.EVENT_ENDED, mapOf("reason" to "userHangup"))
            destroy()
            activeCalls.remove(callId)
        }

        override fun onAbort() {
            setDisconnected(DisconnectCause(DisconnectCause.UNKNOWN))
            emit(NativeCallUIPlugin.EVENT_ENDED, mapOf("reason" to "failed"))
            destroy()
            activeCalls.remove(callId)
        }

        override fun onCallAudioStateChanged(state: android.telecom.CallAudioState?) {
            // Forward mute changes to JS.
            val muted = state?.isMuted ?: return
            emit(NativeCallUIPlugin.EVENT_MUTED, mapOf("muted" to muted))
        }

        private fun emit(event: String, extras: Map<String, Any?> = emptyMap()) {
            val plugin = NativeCallUIPlugin.current() ?: return
            val data = JSObject().apply {
                put("callId", callId)
                if (conversationId != null) put("conversationId", conversationId)
                extras.forEach { (k, v) -> put(k, v) }
            }
            plugin.emitEvent(event, data)
        }
    }
}
