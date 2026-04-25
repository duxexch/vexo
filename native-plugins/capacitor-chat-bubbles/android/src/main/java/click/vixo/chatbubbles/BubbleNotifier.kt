package click.vixo.chatbubbles

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Shared bubble-rendering helper used by both the foreground plugin
 * (`ChatBubblesPlugin`, when the WebView is open and reacts to
 * `vex-incoming-dm`) and the background FCM service
 * (`ChatBubblesFcmService`, which is invoked by the OS even when the
 * app is killed). Centralising the channel, shortcut, avatar and
 * notification builders here is what makes the system-bubble path work
 * end-to-end without an active WebView client.
 */
object BubbleNotifier {

    const val CHANNEL_ID = "vex_chat_bubbles"
    const val NOTIFICATION_TAG = "vex-chat-bubble"

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = nm(ctx)
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Chat bubbles",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Floating chat heads for incoming direct messages"
            setAllowBubbles(true)
        }
        nm.createNotificationChannel(channel)
    }

    /**
     * Render a bubble for the given peer. Returns `true` when a system
     * bubble or overlay was successfully presented; `false` if neither
     * surface is currently usable (e.g. SYSTEM_ALERT_WINDOW not granted
     * AND notification bubbles disabled by the user).
     */
    fun showBubble(
        ctx: Context,
        peerId: String,
        name: String,
        body: String,
        unread: Int,
        avatarUrl: String? = null,
    ): Boolean {
        // Honor user-side suppression even on the FCM-killed path so a
        // muted peer (or a user who turned the toggle off) never sees a
        // bubble pop up just because the WebView wasn't around to gate
        // the request itself. The web `ChatBubblesLayer` mirrors the
        // current toggle + mute list down via `ChatBubbles.configure`.
        if (!BubbleConfig.bubblesEnabled(ctx)) return false
        if (BubbleConfig.isPeerMuted(ctx, peerId)) return false

        ensureChannel(ctx)
        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && bubblesAllowedByUser(ctx) ->
                showSystemBubble(ctx, peerId, name, body, unread, avatarUrl)
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx) ->
                BubbleOverlayService.show(ctx, peerId, name, body, unread, avatarUrl)
            else -> false
        }
    }

    fun hideBubble(ctx: Context, peerId: String) {
        nm(ctx).cancel(NOTIFICATION_TAG, peerId.hashCode())
        BubbleOverlayService.dismissPeer(ctx, peerId)
    }

    fun hideAll(ctx: Context, peerIds: Collection<String>) {
        val nm = nm(ctx)
        for (peer in peerIds) {
            nm.cancel(NOTIFICATION_TAG, peer.hashCode())
        }
        BubbleOverlayService.stop(ctx)
    }

    fun bubblesAllowedByUser(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        return nm(ctx).bubblePreference != NotificationManager.BUBBLE_PREFERENCE_NONE
    }

    fun shortcutId(peerId: String): String = "vex_chat_$peerId"

    /* ─────────────────────────── internals ────────────────────────── */

    private fun showSystemBubble(
        ctx: Context,
        peerId: String,
        name: String,
        body: String,
        unread: Int,
        avatarUrl: String?,
    ): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false

        // Sender avatar — fetched synchronously (with timeout) so the
        // bubble can be built with a real face. Falls back to the
        // generic chat icon if the URL is missing or the fetch fails.
        val avatarBitmap = AvatarCache.getBlocking(avatarUrl)
        val personIcon: Icon = avatarBitmap?.let(AvatarCache::toIcon)
            ?: Icon.createWithResource(ctx, android.R.drawable.sym_action_chat)

        publishConversationShortcut(ctx, peerId, name, personIcon)

        // BubbleMetadata's intent IS the bubble's expanded UI surface —
        // BubbleActivity now renders a real native chat panel (header,
        // last message, reply input, "open in app" button) inside that
        // surface, instead of redirecting to the WebView.
        val targetIntent = Intent(ctx, BubbleActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("vexapp://chat?user=$peerId")
            putExtra(BubbleActivity.EXTRA_PEER_ID, peerId)
            putExtra(BubbleActivity.EXTRA_NAME, name)
            putExtra(BubbleActivity.EXTRA_BODY, body)
            putExtra(BubbleActivity.EXTRA_AVATAR_URL, avatarUrl)
            flags = Intent.FLAG_ACTIVITY_NEW_DOCUMENT or Intent.FLAG_ACTIVITY_MULTIPLE_TASK
        }
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        val pending = PendingIntent.getActivity(ctx, peerId.hashCode(), targetIntent, pendingFlags)

        val person = Person.Builder().setName(name).setIcon(personIcon).setKey(peerId).build()

        val bubbleData = Notification.BubbleMetadata.Builder(pending, personIcon)
            .setDesiredHeight(600)
            .setAutoExpandBubble(false)
            .setSuppressNotification(false)
            .build()

        val n = Notification.Builder(ctx, CHANNEL_ID)
            .setContentTitle(name)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setLargeIcon(personIcon)
            .setBubbleMetadata(bubbleData)
            .setShortcutId(shortcutId(peerId))
            .setLocusId(android.content.LocusId(shortcutId(peerId)))
            .addPerson(person)
            .setStyle(
                Notification.MessagingStyle(person)
                    .addMessage(body, System.currentTimeMillis(), person)
            )
            .setNumber(unread.coerceAtLeast(1))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setShowWhen(true)
            .build()

        nm(ctx).notify(NOTIFICATION_TAG, peerId.hashCode(), n)
        return true
    }

    private fun publishConversationShortcut(
        ctx: Context,
        peerId: String,
        name: String,
        icon: Icon,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val sm = ctx.getSystemService(ShortcutManager::class.java) ?: return

        // Background FCM path doesn't have a known foreground activity;
        // fall back to the host app's launcher component so the bubble
        // shortcut still binds to the correct task affinity.
        val launchComponent: ComponentName? = ctx.packageManager
            .getLaunchIntentForPackage(ctx.packageName)
            ?.component

        val openIntent = Intent(ctx, BubbleActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("vexapp://chat?user=$peerId")
            putExtra(BubbleActivity.EXTRA_PEER_ID, peerId)
            putExtra(BubbleActivity.EXTRA_NAME, name)
        }
        val builder = ShortcutInfo.Builder(ctx, shortcutId(peerId))
            .setLocusId(android.content.LocusId(shortcutId(peerId)))
            .setShortLabel(name)
            .setLongLived(true)
            .setIcon(icon)
            .setIntent(openIntent)
            .setCategories(setOf("android.shortcut.conversation"))

        if (launchComponent != null) {
            builder.setActivity(launchComponent)
        }

        try {
            sm.pushDynamicShortcut(builder.build())
        } catch (_: Throwable) {
            // OEM throttling — non-fatal; the bubble still renders.
        }
    }

    private fun nm(ctx: Context): NotificationManager =
        ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
