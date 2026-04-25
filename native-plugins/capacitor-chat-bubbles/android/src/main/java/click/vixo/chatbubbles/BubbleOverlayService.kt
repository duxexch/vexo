package click.vixo.chatbubbles

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.hypot

/**
 * WindowManager-based fallback for devices that pre-date the Bubble API
 * (Android 10 and below). Renders a circular "chat head" that can be:
 *   • dragged anywhere on screen
 *   • released into the snap-to-edge dock
 *   • released onto the bottom dismiss target ("X") to remove the bubble
 *   • tapped to open the in-app chat surface
 *
 * The service is foreground-styled so OEMs (Xiaomi/Huawei) don't kill
 * it the moment the app is backgrounded.
 */
class BubbleOverlayService : Service() {

    private val bubbles = mutableMapOf<String, BubbleHandle>()
    private lateinit var wm: WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())

    // Drag-to-dismiss target — added/removed lazily during drag.
    private var dismissTarget: View? = null
    private var dismissLp: WindowManager.LayoutParams? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        startInForegroundIfNeeded()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                val peerId = intent.getStringExtra(EXTRA_PEER_ID) ?: return START_STICKY
                val name = intent.getStringExtra(EXTRA_NAME) ?: "Chat"
                val unread = intent.getIntExtra(EXTRA_UNREAD, 1)
                val avatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL)
                addOrUpdateBubble(peerId, name, unread, avatarUrl)
            }
            ACTION_DISMISS -> {
                val peerId = intent.getStringExtra(EXTRA_PEER_ID) ?: return START_STICKY
                removeBubble(peerId)
                if (bubbles.isEmpty()) stopSelf()
            }
            ACTION_DISMISS_ALL -> {
                bubbles.keys.toList().forEach { removeBubble(it) }
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        bubbles.keys.toList().forEach { removeBubble(it) }
        hideDismissTarget()
        super.onDestroy()
    }

    /* ─────────────────────── bubble views ─────────────────────── */

    private fun addOrUpdateBubble(peerId: String, name: String, unread: Int, avatarUrl: String?) {
        val existing = bubbles[peerId]
        if (existing != null) {
            existing.badge.text = if (unread > 0) unread.toString() else ""
            existing.badge.visibility = if (unread > 0) View.VISIBLE else View.GONE
            // If a fresh avatar URL came in, swap the icon.
            if (!avatarUrl.isNullOrBlank() && avatarUrl != existing.avatarUrl) {
                existing.avatarUrl = avatarUrl
                applyAvatar(existing.avatar, existing.initial, name, avatarUrl)
            }
            return
        }

        val container = FrameLayout(this)

        val avatar = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#F5A524"))
            }
        }
        container.addView(
            avatar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        val initial = TextView(this).apply {
            text = name.firstOrNull()?.uppercase() ?: "?"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
        }
        container.addView(
            initial,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER },
        )

        val badge = TextView(this).apply {
            text = if (unread > 0) unread.toString() else ""
            visibility = if (unread > 0) View.VISIBLE else View.GONE
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#DC2626"))
            }
            setPadding(dp(6f).toInt(), dp(2f).toInt(), dp(6f).toInt(), dp(2f).toInt())
            typeface = Typeface.DEFAULT_BOLD
        }
        container.addView(
            badge,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = Gravity.TOP or Gravity.END },
        )

        val sizePx = dp(56f).toInt()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val lp = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 32
            y = 220 + bubbles.size * (sizePx + 16)
        }

        attachDragHandler(container, lp, peerId)

        try {
            wm.addView(container, lp)
            val handle = BubbleHandle(container, avatar, initial, badge, lp, avatarUrl)
            bubbles[peerId] = handle
            applyAvatar(avatar, initial, name, avatarUrl)
        } catch (_: Exception) {
            // Permission revoked at runtime — bail out cleanly.
            stopSelf()
        }
    }

    private fun applyAvatar(view: ImageView, initial: TextView, name: String, url: String?) {
        // Cached avatar — apply immediately.
        AvatarCache.getCached(url)?.let {
            view.setImageBitmap(it)
            initial.visibility = View.GONE
            return
        }
        // Reset to placeholder while we fetch.
        view.setImageDrawable(null)
        initial.text = name.firstOrNull()?.uppercase() ?: "?"
        initial.visibility = View.VISIBLE
        if (url.isNullOrBlank()) return
        AvatarCache.fetchAsync(url) { bmp ->
            mainHandler.post {
                view.setImageBitmap(bmp)
                initial.visibility = View.GONE
            }
        }
    }

    /* ─────────────────────── drag + dismiss ───────────────────── */

    private fun attachDragHandler(view: View, lp: WindowManager.LayoutParams, peerId: String) {
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f
        var moved = false

        view.setOnTouchListener { v, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = lp.x
                    startY = lp.y
                    touchX = ev.rawX
                    touchY = ev.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (ev.rawX - touchX).toInt()
                    val dy = (ev.rawY - touchY).toInt()
                    if (abs(dx) > 12 || abs(dy) > 12) {
                        if (!moved) showDismissTarget()
                        moved = true
                    }
                    lp.x = startX + dx
                    lp.y = startY + dy
                    try { wm.updateViewLayout(v, lp) } catch (_: Throwable) {}
                    if (moved) updateDismissHighlight(lp, v.width, v.height)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!moved) {
                        openChat(peerId)
                    } else {
                        if (isOverDismissTarget(lp, v.width, v.height)) {
                            // Dropped onto the X — destroy this bubble.
                            BubbleNotifier.hideBubble(applicationContext, peerId)
                            removeBubble(peerId)
                            if (bubbles.isEmpty()) stopSelf()
                        } else {
                            snapToEdge(v, lp)
                        }
                    }
                    hideDismissTarget()
                    true
                }
                else -> false
            }
        }
    }

    private fun snapToEdge(view: View, lp: WindowManager.LayoutParams) {
        val display = wm.defaultDisplay
        val size = android.graphics.Point()
        @Suppress("DEPRECATION") display.getSize(size)
        lp.x = if (lp.x + view.width / 2 < size.x / 2) 0 else size.x - view.width
        try { wm.updateViewLayout(view, lp) } catch (_: Throwable) {}
    }

    private fun showDismissTarget() {
        if (dismissTarget != null) return
        val sizePx = dp(72f).toInt()

        val ring = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#CC1F1F1F"))
            }
        }
        val x = TextView(this).apply {
            text = "✕"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        ring.addView(
            x,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val lp = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = dp(48f).toInt()
        }

        try {
            wm.addView(ring, lp)
            dismissTarget = ring
            dismissLp = lp
        } catch (_: Throwable) {
            dismissTarget = null
            dismissLp = null
        }
    }

    private fun hideDismissTarget() {
        val v = dismissTarget ?: return
        try { wm.removeView(v) } catch (_: Throwable) {}
        dismissTarget = null
        dismissLp = null
    }

    private fun updateDismissHighlight(bubbleLp: WindowManager.LayoutParams, w: Int, h: Int) {
        val target = dismissTarget ?: return
        val highlight = isOverDismissTarget(bubbleLp, w, h)
        target.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(if (highlight) Color.parseColor("#CCDC2626") else Color.parseColor("#CC1F1F1F"))
        }
    }

    private fun isOverDismissTarget(bubbleLp: WindowManager.LayoutParams, w: Int, h: Int): Boolean {
        val lp = dismissLp ?: return false
        val display = wm.defaultDisplay
        val size = android.graphics.Point()
        @Suppress("DEPRECATION") display.getSize(size)
        val targetCenterX = size.x / 2f
        val targetCenterY = size.y - lp.y - lp.height / 2f
        val bubbleCenterX = bubbleLp.x + w / 2f
        val bubbleCenterY = bubbleLp.y + h / 2f
        val distance = hypot(
            (targetCenterX - bubbleCenterX).toDouble(),
            (targetCenterY - bubbleCenterY).toDouble(),
        )
        // Generous hit-radius so users don't have to land pixel-perfect.
        return distance < (lp.width / 2f + dp(20f))
    }

    /* ─────────────────────── lifecycle helpers ────────────────── */

    private fun openChat(peerId: String) {
        val intent = Intent(this, BubbleActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("vexapp://chat?user=$peerId")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(BubbleActivity.EXTRA_PEER_ID, peerId)
        }
        try { startActivity(intent) } catch (_: Throwable) {}
    }

    private fun removeBubble(peerId: String) {
        val handle = bubbles.remove(peerId) ?: return
        try { wm.removeView(handle.view) } catch (_: Throwable) {}
    }

    private fun startInForegroundIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        val channelId = "vex_chat_bubbles_overlay"
        if (nm.getNotificationChannel(channelId) == null) {
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Chat bubbles overlay", NotificationManager.IMPORTANCE_MIN)
            )
        }
        val n = Notification.Builder(this, channelId)
            .setContentTitle("Chat bubbles active")
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setOngoing(true)
            .build()
        startForeground(FOREGROUND_ID, n)
    }

    private fun dp(value: Float): Float =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics)

    private data class BubbleHandle(
        val view: View,
        val avatar: ImageView,
        val initial: TextView,
        val badge: TextView,
        val lp: WindowManager.LayoutParams,
        var avatarUrl: String?,
    )

    companion object {
        private const val ACTION_SHOW = "click.vixo.chatbubbles.SHOW"
        private const val ACTION_DISMISS = "click.vixo.chatbubbles.DISMISS"
        private const val ACTION_DISMISS_ALL = "click.vixo.chatbubbles.DISMISS_ALL"
        private const val EXTRA_PEER_ID = "peerId"
        private const val EXTRA_NAME = "name"
        private const val EXTRA_UNREAD = "unread"
        private const val EXTRA_AVATAR_URL = "avatarUrl"
        private const val FOREGROUND_ID = 4711

        fun show(
            ctx: Context,
            peerId: String,
            name: String,
            body: String,
            unread: Int,
            avatarUrl: String? = null,
        ): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
                return false
            }
            val intent = Intent(ctx, BubbleOverlayService::class.java).apply {
                action = ACTION_SHOW
                putExtra(EXTRA_PEER_ID, peerId)
                putExtra(EXTRA_NAME, name)
                putExtra(EXTRA_UNREAD, unread)
                if (!avatarUrl.isNullOrBlank()) putExtra(EXTRA_AVATAR_URL, avatarUrl)
            }
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ctx.startForegroundService(intent)
                } else {
                    ctx.startService(intent)
                }
                true
            } catch (_: Throwable) {
                false
            }
        }

        fun dismissPeer(ctx: Context, peerId: String) {
            val intent = Intent(ctx, BubbleOverlayService::class.java).apply {
                action = ACTION_DISMISS
                putExtra(EXTRA_PEER_ID, peerId)
            }
            try { ctx.startService(intent) } catch (_: Throwable) {}
        }

        fun stop(ctx: Context) {
            val intent = Intent(ctx, BubbleOverlayService::class.java).apply {
                action = ACTION_DISMISS_ALL
            }
            try { ctx.startService(intent) } catch (_: Throwable) {}
            try { ctx.stopService(Intent(ctx, BubbleOverlayService::class.java)) } catch (_: Throwable) {}
        }
    }
}
