package click.vixo.chatbubbles

import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the chat-bubbles surface.
 *
 *  ┌─────────────────────────────┬───────────────────────────────┐
 *  │ Android version             │ Surface used                  │
 *  ├─────────────────────────────┼───────────────────────────────┤
 *  │ 11+ (API 30+)               │ Notification.BubbleMetadata    │
 *  │ 10 and below (API 24..29)   │ TYPE_APPLICATION_OVERLAY svc  │
 *  └─────────────────────────────┴───────────────────────────────┘
 *
 * The actual rendering lives in [BubbleNotifier] so that the
 * background FCM service ([ChatBubblesFcmService]) can use the same
 * code path when the WebView is not running.
 */
@CapacitorPlugin(name = "ChatBubbles")
class ChatBubblesPlugin : Plugin() {

    private val activeBubbleIds = mutableSetOf<String>()

    override fun load() {
        BubbleNotifier.ensureChannel(context)
    }

    @PluginMethod
    fun isBubblesSupported(call: PluginCall) {
        val ctx = context
        val canDrawOverlays = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            Settings.canDrawOverlays(ctx)

        val mode = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && BubbleNotifier.bubblesAllowedByUser(ctx) -> "bubble"
            canDrawOverlays -> "overlay"
            else -> "none"
        }

        val ret = JSObject().apply {
            put("supported", mode != "none")
            put("mode", mode)
        }
        call.resolve(ret)
    }

    /**
     * Persist the API base URL + bearer token so that the in-bubble
     * chat surface (BubbleActivity, possibly launched cold by the OS
     * after the WebView is gone) can fetch history and post quick
     * replies. The host JS calls this whenever the auth token rotates.
     */
    @PluginMethod
    fun configure(call: PluginCall) {
        val apiBaseUrl = call.getString("apiBaseUrl")
        val authToken = call.getString("authToken")
        val bubblesEnabled = if (call.data.has("bubblesEnabled")) call.getBoolean("bubblesEnabled") else null
        val mutedPeerIds: Collection<String>? = call.getArray("mutedPeerIds")?.let { arr ->
            val out = ArrayList<String>(arr.length())
            for (i in 0 until arr.length()) {
                val s = arr.optString(i)
                if (!s.isNullOrBlank()) out.add(s)
            }
            out
        }
        BubbleConfig.setConfig(
            ctx = context,
            apiBaseUrl = apiBaseUrl,
            authToken = authToken,
            bubblesEnabled = bubblesEnabled,
            mutedPeerIds = mutedPeerIds,
        )
        call.resolve()
    }

    @PluginMethod
    fun showBubble(call: PluginCall) {
        val peerId = call.getString("peerId")
        val name = call.getString("name") ?: "Chat"
        val body = call.getString("body") ?: ""
        val unread = call.getInt("unreadCount") ?: 1
        val avatarUrl = call.getString("avatarUrl")

        if (peerId.isNullOrBlank()) {
            call.reject("peerId is required")
            return
        }

        val shown = BubbleNotifier.showBubble(context, peerId, name, body, unread, avatarUrl)
        if (shown) activeBubbleIds.add(peerId)

        val ret = JSObject().apply { put("shown", shown) }
        call.resolve(ret)
    }

    @PluginMethod
    fun hideBubble(call: PluginCall) {
        val peerId = call.getString("peerId") ?: run { call.resolve(); return }
        BubbleNotifier.hideBubble(context, peerId)
        activeBubbleIds.remove(peerId)
        call.resolve()
    }

    @PluginMethod
    fun hideAllBubbles(call: PluginCall) {
        BubbleNotifier.hideAll(context, activeBubbleIds.toList())
        activeBubbleIds.clear()
        call.resolve()
    }
}
