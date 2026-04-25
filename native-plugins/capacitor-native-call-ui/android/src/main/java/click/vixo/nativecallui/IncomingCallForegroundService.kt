package click.vixo.nativecallui

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Short-lived foreground service that holds the OS in the foreground
 * for the few seconds it takes Telecom to take over with the
 * self-managed [CallConnectionService] UI.
 *
 * Started by:
 *   - [CallFcmService] when an FCM data-message with `type=call`
 *     arrives. Android only allows ~5 seconds of background work after
 *     the message is delivered, so the service must be promoted to
 *     foreground IMMEDIATELY (`startForeground` within
 *     `Service.onCreate`).
 *   - [NativeCallUIPlugin.reportIncomingCall] for in-app rings (so the
 *     same code path drives both flows).
 */
class IncomingCallForegroundService : Service() {

    companion object {
        const val ACTION_PRESENT = "click.vixo.nativecallui.PRESENT"
        const val ACTION_DISMISS = "click.vixo.nativecallui.DISMISS"
        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_HANDLE = "handle"
        const val EXTRA_CALL_TYPE = "callType"
        const val EXTRA_CONVERSATION_ID = "conversationId"
        private const val CHANNEL_ID = "vex_incoming_calls"
        private const val NOTIFICATION_ID = 47104
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
        // Must promote to foreground in onCreate to satisfy Android 12+
        // background-start restrictions when launched from FCM.
        startForeground(NOTIFICATION_ID, buildPlaceholderNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PRESENT -> {
                val callId = intent.getStringExtra(EXTRA_CALL_ID).orEmpty()
                val handle = intent.getStringExtra(EXTRA_HANDLE).orEmpty()
                val callType = intent.getStringExtra(EXTRA_CALL_TYPE) ?: "voice"
                val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID)
                if (callId.isNotBlank() && handle.isNotBlank()) {
                    CallConnectionService.placeIncoming(
                        applicationContext,
                        callId = callId,
                        handle = handle,
                        callType = callType,
                        conversationId = conversationId,
                    )
                }
                // Once Telecom has taken over the screen we can drop
                // back out of the foreground.
                stopSelfDelayed()
            }
            ACTION_DISMISS -> {
                stopSelfDelayed()
            }
            else -> stopSelfDelayed()
        }
        return START_NOT_STICKY
    }

    private fun stopSelfDelayed() {
        // Give Telecom a moment to bind the connection before tearing
        // down the wake notification.
        android.os.Handler(mainLooper).postDelayed({
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }, 1500)
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Incoming calls",
            NotificationManager.IMPORTANCE_HIGH,
        )
        channel.description = "Wakes the device when an incoming call arrives."
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
    }

    private fun buildPlaceholderNotification() =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Connecting call…")
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
}
