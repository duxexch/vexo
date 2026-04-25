package click.vixo.chatbubbles

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FirebaseMessagingService that turns server-side DM pushes into
 * floating chat bubbles — even when the WebView is closed and the app
 * has been swiped away.
 *
 * The server is expected to send a high-priority *data* message
 * (NOT a notification message — those bypass FirebaseMessagingService
 * when the app is backgrounded) of shape:
 *
 *   {
 *     type: "dm",
 *     senderId: "<peer user id>",
 *     senderName: "<display name>",
 *     body: "<message preview>",
 *     unreadCount: "<integer string, optional>"
 *   }
 *
 * The host app must declare this service in its `AndroidManifest.xml`
 * with the `com.google.firebase.MESSAGING_EVENT` intent filter.
 * If the host already has its own FirebaseMessagingService for general
 * notifications, it can either:
 *   (a) route DM pushes here by `super.onMessageReceived(message)` after
 *       its own handling, or
 *   (b) inline the bubble call by invoking `BubbleNotifier.showBubble(...)`
 *       directly from its own service.
 *
 * See `docs/CHAT_BUBBLES_PLAYBOOK.md` for manifest snippets.
 */
open class ChatBubblesFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] != "dm") {
            super.onMessageReceived(message)
            return
        }

        val senderId = data["senderId"].orEmpty()
        if (senderId.isBlank()) {
            // Malformed push — nothing useful to render.
            return
        }

        val name = data["senderName"]?.takeIf { it.isNotBlank() } ?: "Chat"
        val body = data["body"].orEmpty()
        val unread = data["unreadCount"]?.toIntOrNull()?.coerceAtLeast(1) ?: 1
        val avatarUrl = data["avatarUrl"]?.takeIf { it.isNotBlank() }

        BubbleNotifier.showBubble(
            ctx = applicationContext,
            peerId = senderId,
            name = name,
            body = body,
            unread = unread,
            avatarUrl = avatarUrl,
        )
    }
}
