package click.vixo.chatbubbles

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.os.Build
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Downloads + caches sender avatars used by both the system Bubble path
 * and the WindowManager overlay fallback. Bitmaps are decoded once,
 * round-cropped, and reused for every notification update for the same
 * URL. The fetch blocks (with a short timeout) when called from the
 * synchronous notify path because Android requires the avatar Icon
 * to be present at notify-time; for the overlay surface the async
 * variant is used so the bubble appears immediately and updates when
 * the bitmap arrives.
 */
object AvatarCache {

    private const val MAX_DIM_PX = 192
    private const val FETCH_TIMEOUT_MS = 3500
    private const val CACHE_LIMIT = 32

    private val executor = Executors.newSingleThreadExecutor()
    private val cache = Collections.synchronizedMap(LinkedHashMap<String, Bitmap>(16, 0.75f, true))

    fun getCached(url: String?): Bitmap? {
        if (url.isNullOrBlank()) return null
        return cache[url]
    }

    /**
     * Synchronously fetch (or read from cache). Returns null on any
     * failure — callers should fall back to a static icon.
     */
    fun getBlocking(url: String?): Bitmap? {
        if (url.isNullOrBlank()) return null
        cache[url]?.let { return it }
        return try {
            executor.submit<Bitmap?> { downloadAndCircle(url) }
                .get(FETCH_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS)
                ?.also { put(url, it) }
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * Async fetch; the callback runs on the executor thread when the
     * bitmap is ready (or never if the download fails).
     */
    fun fetchAsync(url: String?, onReady: (Bitmap) -> Unit) {
        if (url.isNullOrBlank()) return
        cache[url]?.let {
            onReady(it)
            return
        }
        executor.submit {
            val bmp = downloadAndCircle(url) ?: return@submit
            put(url, bmp)
            try { onReady(bmp) } catch (_: Throwable) { /* swallow */ }
        }
    }

    fun toIcon(bitmap: Bitmap): Icon = Icon.createWithBitmap(bitmap)

    /* ─────────────────────── internals ─────────────────────── */

    private fun put(url: String, bmp: Bitmap) {
        synchronized(cache) {
            cache[url] = bmp
            if (cache.size > CACHE_LIMIT) {
                val it = cache.entries.iterator()
                if (it.hasNext()) {
                    it.next()
                    it.remove()
                }
            }
        }
    }

    private fun downloadAndCircle(url: String): Bitmap? {
        var conn: HttpURLConnection? = null
        var input: InputStream? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = FETCH_TIMEOUT_MS
                readTimeout = FETCH_TIMEOUT_MS
                instanceFollowRedirects = true
                requestMethod = "GET"
            }
            val code = conn.responseCode
            if (code !in 200..299) return null
            input = conn.inputStream
            val raw = BitmapFactory.decodeStream(input) ?: return null
            roundCrop(downscale(raw, MAX_DIM_PX))
        } catch (_: Throwable) {
            null
        } finally {
            try { input?.close() } catch (_: Throwable) {}
            try { conn?.disconnect() } catch (_: Throwable) {}
        }
    }

    private fun downscale(src: Bitmap, maxDim: Int): Bitmap {
        val w = src.width
        val h = src.height
        if (w <= maxDim && h <= maxDim) return src
        val ratio = maxDim.toFloat() / maxOf(w, h)
        return Bitmap.createScaledBitmap(src, (w * ratio).toInt(), (h * ratio).toInt(), true)
    }

    private fun roundCrop(src: Bitmap): Bitmap {
        val size = minOf(src.width, src.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint().apply {
            isAntiAlias = true
            color = -0x1
        }
        val rect = Rect(0, 0, size, size)
        val rectF = RectF(rect)
        canvas.drawARGB(0, 0, 0, 0)
        canvas.drawOval(rectF, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        // Center-crop the source square into the rect.
        val srcRect = Rect(
            (src.width - size) / 2,
            (src.height - size) / 2,
            (src.width - size) / 2 + size,
            (src.height - size) / 2 + size,
        )
        canvas.drawBitmap(src, srcRect, rect, paint)
        // Reference Build to avoid lint complaints about unused Build import.
        @Suppress("UNUSED_VARIABLE") val sdk = Build.VERSION.SDK_INT
        return output
    }
}
