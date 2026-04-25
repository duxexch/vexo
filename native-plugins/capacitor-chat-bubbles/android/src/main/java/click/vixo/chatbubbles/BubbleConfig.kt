package click.vixo.chatbubbles

import android.content.Context

/**
 * Tiny config store shared between the foreground plugin, the
 * background FCM service and `BubbleActivity`. Holds the API base URL
 * and bearer token used by the in-bubble chat surface, plus the
 * currently signed-in user's preferences (chat-bubbles toggle,
 * per-peer mute list, active-call state) so that the killed-app FCM
 * path enforces the same suppression rules as the in-app web layer
 * instead of rendering a bubble for someone the user has muted, or
 * during an ongoing voice/video call.
 *
 * The store is just `SharedPreferences` (private, app-scoped) — same
 * trust boundary as the WebView's localStorage that already holds the
 * token. The host app refreshes these values via
 * `ChatBubbles.configure({...})` whenever they change.
 */
object BubbleConfig {

    private const val PREFS_NAME = "vex_chat_bubbles_config"
    private const val KEY_API_BASE_URL = "api_base_url"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_BUBBLES_ENABLED = "bubbles_enabled"
    private const val KEY_MUTED_PEERS = "muted_peers"
    private const val KEY_IN_ACTIVE_CALL = "in_active_call"

    /**
     * Three-state writes:
     *   • `null`           → field is absent in the configure() call,
     *                         leave the previously persisted value alone.
     *   • `Optional.empty` → field was explicitly cleared (e.g. logout
     *                         passes `authToken: null` from JS), wipe it.
     *   • value present    → overwrite.
     *
     * For Java/Kotlin ergonomics we use a small sealed wrapper rather
     * than an actual `Optional`.
     */
    fun setConfig(
        ctx: Context,
        apiBaseUrl: String? = null,
        authToken: TokenUpdate = TokenUpdate.Unchanged,
        bubblesEnabled: Boolean? = null,
        mutedPeerIds: Collection<String>? = null,
        inActiveCall: Boolean? = null,
    ) {
        val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        if (apiBaseUrl != null) prefs.putString(KEY_API_BASE_URL, apiBaseUrl.trimEnd('/'))
        when (authToken) {
            is TokenUpdate.Unchanged -> { /* leave as-is */ }
            is TokenUpdate.Clear -> prefs.remove(KEY_AUTH_TOKEN)
            is TokenUpdate.Set -> {
                if (authToken.value.isBlank()) {
                    prefs.remove(KEY_AUTH_TOKEN)
                } else {
                    prefs.putString(KEY_AUTH_TOKEN, authToken.value)
                }
            }
        }
        if (bubblesEnabled != null) prefs.putBoolean(KEY_BUBBLES_ENABLED, bubblesEnabled)
        if (mutedPeerIds != null) {
            // SharedPreferences mutates the stored Set in place, so copy.
            prefs.putStringSet(KEY_MUTED_PEERS, HashSet(mutedPeerIds))
        }
        if (inActiveCall != null) prefs.putBoolean(KEY_IN_ACTIVE_CALL, inActiveCall)
        prefs.apply()
    }

    sealed class TokenUpdate {
        object Unchanged : TokenUpdate()
        object Clear : TokenUpdate()
        data class Set(val value: String) : TokenUpdate()
    }

    fun apiBaseUrl(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_API_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }

    fun authToken(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_AUTH_TOKEN, null)
            ?.takeIf { it.isNotBlank() }

    /**
     * Whether the current user has chat-bubbles enabled. Defaults to
     * `true` for backwards compatibility with installs that never
     * called `configure({ bubblesEnabled })` — the native default
     * matches the JS-side default for native Android.
     */
    fun bubblesEnabled(ctx: Context): Boolean =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_BUBBLES_ENABLED, true)

    fun isPeerMuted(ctx: Context, peerId: String): Boolean {
        val set = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getStringSet(KEY_MUTED_PEERS, emptySet()) ?: return false
        return set.contains(peerId)
    }

    fun inActiveCall(ctx: Context): Boolean =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_IN_ACTIVE_CALL, false)

    fun clear(ctx: Context) {
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_MUTED_PEERS)
            .remove(KEY_IN_ACTIVE_CALL)
            .apply()
    }
}
