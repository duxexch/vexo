package click.vixo.chatbubbles

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Expanded surface of the bubble.
 *
 * For the system Bubble API (Android 11+) this activity IS the bubble's
 * expanded UI — it must render real chat content inline rather than
 * redirect the user out to the full WebView. We render a minimal native
 * surface:
 *
 *   ┌─ header ──────────────────────────────────┐
 *   │ [avatar] {name}             [open] [×]    │
 *   ├───────────────────────────────────────────┤
 *   │  last few messages from the conversation  │
 *   │  (fetched in background once we open)     │
 *   ├───────────────────────────────────────────┤
 *   │ [text input ............] [send]          │
 *   └───────────────────────────────────────────┘
 *
 * The [open] button hands off to the host launcher activity (the old
 * deep-link behavior), so users can still escape to the full chat page.
 */
class BubbleActivity : Activity() {

    private lateinit var peerId: String
    private var peerName: String = "Chat"
    private var lastMessageBody: String = ""
    private var avatarUrl: String? = null

    private lateinit var messagesContainer: LinearLayout
    private lateinit var messagesScroll: ScrollView
    private lateinit var replyInput: EditText
    private lateinit var sendButton: Button
    private lateinit var avatarView: ImageView

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val data = intent?.data
        peerId = intent?.getStringExtra(EXTRA_PEER_ID)
            ?: data?.getQueryParameter("user")
            ?: ""
        peerName = intent?.getStringExtra(EXTRA_NAME) ?: "Chat"
        lastMessageBody = intent?.getStringExtra(EXTRA_BODY) ?: ""
        avatarUrl = intent?.getStringExtra(EXTRA_AVATAR_URL)

        if (peerId.isBlank()) {
            // Malformed — escape to the host app so the user isn't stuck.
            forwardToHostApp(data?.toString() ?: "vexapp://chat")
            finish()
            return
        }

        setContentView(buildContent())
        showStaticPreview()
        loadHistoryAsync()
    }

    /* ─────────────────────────── view tree ───────────────────────── */

    private fun buildContent(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#FFFFFF"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        root.addView(buildHeader())
        root.addView(buildMessagesArea())
        root.addView(buildReplyBar())
        return root
    }

    private fun buildHeader(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#F5F5F5"))
            setPadding(dp(12), dp(10), dp(8), dp(10))
            gravity = Gravity.CENTER_VERTICAL
        }

        avatarView = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).apply {
                rightMargin = dp(10)
            }
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#F5A524"))
            }
            contentDescription = peerName
        }
        bar.addView(avatarView)
        // Initial placeholder — the cached avatar (if any) is applied below;
        // otherwise we render the first letter of the name as a fallback.
        bindAvatarPlaceholder()

        val nameView = TextView(this).apply {
            text = peerName
            setTextColor(Color.parseColor("#111111"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        bar.addView(nameView)

        val openBtn = Button(this).apply {
            text = "Open"
            setOnClickListener { openInHostApp() }
            minWidth = dp(64)
        }
        bar.addView(openBtn)

        val closeBtn = ImageButton(this).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
            contentDescription = "Close"
        }
        bar.addView(closeBtn)

        return bar
    }

    private fun buildMessagesArea(): View {
        messagesContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        messagesScroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
            isFillViewport = true
            addView(
                messagesContainer,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        return messagesScroll
    }

    private fun buildReplyBar(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#FAFAFA"))
            setPadding(dp(8), dp(8), dp(8), dp(8))
            gravity = Gravity.CENTER_VERTICAL
        }
        replyInput = EditText(this).apply {
            hint = "Reply…"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            maxLines = 4
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = dp(8)
            }
        }
        bar.addView(replyInput)
        sendButton = Button(this).apply {
            text = "Send"
            setOnClickListener { handleSend() }
        }
        bar.addView(sendButton)
        return bar
    }

    private fun bindAvatarPlaceholder() {
        val cached = AvatarCache.getCached(avatarUrl)
        if (cached != null) {
            avatarView.setImageBitmap(cached)
            return
        }
        // Render initial onto a circular bitmap as the placeholder.
        avatarView.setImageBitmap(initialBitmap(peerName))
        // Try to fetch the real avatar in the background.
        val url = avatarUrl ?: return
        AvatarCache.fetchAsync(url) { bmp ->
            mainHandler.post { avatarView.setImageBitmap(bmp) }
        }
    }

    private fun initialBitmap(name: String): Bitmap {
        val size = dp(36)
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val bg = Paint().apply {
            isAntiAlias = true
            color = Color.parseColor("#F5A524")
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bg)
        val text = name.firstOrNull()?.uppercase() ?: "?"
        val tp = Paint().apply {
            isAntiAlias = true
            color = Color.WHITE
            textSize = size * 0.5f
            textAlign = Paint.Align.CENTER
            typeface = Typeface.DEFAULT_BOLD
        }
        val baseline = size / 2f - (tp.descent() + tp.ascent()) / 2
        canvas.drawText(text, size / 2f, baseline, tp)
        return bmp
    }

    /* ─────────────────────────── messages ────────────────────────── */

    private fun showStaticPreview() {
        if (lastMessageBody.isBlank()) return
        addMessageRow(lastMessageBody, mine = false)
    }

    private fun addMessageRow(content: String, mine: Boolean) {
        val tv = TextView(this).apply {
            text = content
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(10), dp(6), dp(10), dp(6))
            setTextColor(if (mine) Color.WHITE else Color.parseColor("#111111"))
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(if (mine) Color.parseColor("#3B82F6") else Color.parseColor("#EFEFEF"))
            }
            maxWidth = dp(240)
        }
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            gravity = if (mine) Gravity.END else Gravity.START
            topMargin = dp(4)
        }
        messagesContainer.addView(tv, lp)
        messagesScroll.post { messagesScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun loadHistoryAsync() {
        val baseUrl = BubbleConfig.apiBaseUrl(applicationContext) ?: return
        val token = BubbleConfig.authToken(applicationContext) ?: return
        executor.submit {
            val url = "$baseUrl/api/chat/$peerId/messages?limit=20&offset=0"
            val items = httpGetMessages(url, token)
            if (items.isNotEmpty()) {
                mainHandler.post {
                    // Replace the static preview with the real history.
                    messagesContainer.removeAllViews()
                    for ((content, mine) in items) {
                        addMessageRow(content, mine)
                    }
                }
            }
        }
    }

    private fun httpGetMessages(url: String, token: String): List<Pair<String, Boolean>> {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 4000
                readTimeout = 4000
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode !in 200..299) return emptyList()
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val arr: JSONArray = when {
                body.startsWith("[") -> JSONArray(body)
                else -> {
                    val obj = JSONObject(body)
                    obj.optJSONArray("messages") ?: JSONArray()
                }
            }
            val out = ArrayList<Pair<String, Boolean>>(arr.length())
            for (i in 0 until arr.length()) {
                val m = arr.optJSONObject(i) ?: continue
                val content = m.optString("content", "")
                if (content.isBlank()) continue
                val sender = m.optString("senderId", "")
                // We don't know "self" id in the bubble — but messages whose
                // sender equals our peerId are inbound; everything else is
                // treated as outbound.
                val mine = sender != peerId
                out.add(content to mine)
            }
            out
        } catch (_: Throwable) {
            emptyList()
        } finally {
            try { conn?.disconnect() } catch (_: Throwable) {}
        }
    }

    /* ─────────────────────────── send ────────────────────────────── */

    private fun handleSend() {
        val text = replyInput.text.toString().trim()
        if (text.isEmpty()) return
        val baseUrl = BubbleConfig.apiBaseUrl(applicationContext)
        val token = BubbleConfig.authToken(applicationContext)
        if (baseUrl == null || token == null) {
            // Cannot post without auth — escape to full app.
            openInHostApp()
            return
        }
        replyInput.setText("")
        sendButton.isEnabled = false
        addMessageRow(text, mine = true)

        val url = "$baseUrl/api/chat/$peerId/messages"
        val payload = JSONObject().apply {
            put("clientMessageId", "bubble-native-${UUID.randomUUID()}")
            put("content", text)
            put("messageType", "text")
        }.toString()

        executor.submit {
            val ok = httpPostJson(url, token, payload)
            mainHandler.post {
                sendButton.isEnabled = true
                if (!ok) {
                    // Surface the failure inline.
                    addMessageRow("Failed to send. Tap Open to retry.", mine = true)
                }
            }
        }
    }

    private fun httpPostJson(url: String, token: String, json: String): Boolean {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 4000
                readTimeout = 4000
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(json) }
            conn.responseCode in 200..299
        } catch (_: Throwable) {
            false
        } finally {
            try { conn?.disconnect() } catch (_: Throwable) {}
        }
    }

    /* ─────────────────────────── escape ──────────────────────────── */

    private fun openInHostApp() {
        forwardToHostApp("vexapp://chat?user=$peerId")
        finish()
    }

    private fun forwardToHostApp(deepLink: String) {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(deepLink)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        } ?: return
        try { startActivity(launch) } catch (_: Throwable) { /* host missing */ }
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_PEER_ID = "click.vixo.chatbubbles.PEER_ID"
        const val EXTRA_NAME = "click.vixo.chatbubbles.NAME"
        const val EXTRA_BODY = "click.vixo.chatbubbles.BODY"
        const val EXTRA_AVATAR_URL = "click.vixo.chatbubbles.AVATAR_URL"
    }
}
