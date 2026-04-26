package click.vixo.nativecallui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Capacitor bridge for the native call UI on Android.
 *
 * Most of the actual ringing is performed by [CallConnectionService]
 * (a self-managed Telecom ConnectionService) and by
 * [IncomingCallForegroundService] (which is what [CallFcmService]
 * starts the moment a high-priority FCM data message with `type=call`
 * arrives — even when the app is killed).
 *
 * The plugin keeps a static reference to its current instance so the
 * FCM/foreground services can dispatch lifecycle events back to JS via
 * [notifyListeners].
 */
@CapacitorPlugin(
    name = "NativeCallUI",
    permissions = [
        Permission(
            alias = NativeCallUIPlugin.PERMISSION_ALIAS_CALL_MEDIA,
            strings = [
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA,
            ],
        ),
    ],
)
class NativeCallUIPlugin : Plugin() {

    companion object {
        @Volatile
        private var instance: NativeCallUIPlugin? = null

        fun current(): NativeCallUIPlugin? = instance

        const val EVENT_ANSWERED = "callAnswered"
        const val EVENT_ENDED = "callEnded"
        const val EVENT_MUTED = "callMutedChanged"

        /** Single alias that bundles the runtime permissions a friend call needs. */
        const val PERMISSION_ALIAS_CALL_MEDIA = "callMedia"

        /**
         * Persists the "have we ever issued a runtime request for this
         * permission name?" bit. We need it to disambiguate the two
         * cases that `shouldShowRequestPermissionRationale` returns
         * `false` for:
         *  - first launch, never asked  → still re-promptable
         *  - asked, denied, "Don't ask again" ticked → permanently denied
         * Without this tracker we would mark every freshly-installed
         * device as "permanently denied" and skip straight to Settings,
         * which would be the worst possible first-run UX.
         */
        private const val PREFS_NAME = "vex_native_call_ui_permission_history"
        private const val PREFS_KEY_REQUESTED_PREFIX = "requested:"
    }

    override fun load() {
        instance = this
    }

    private fun historyPrefs(): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun markPermissionRequested(name: String) {
        historyPrefs().edit().putBoolean("$PREFS_KEY_REQUESTED_PREFIX$name", true).apply()
    }

    private fun hasRequestedPermissionBefore(name: String): Boolean =
        historyPrefs().getBoolean("$PREFS_KEY_REQUESTED_PREFIX$name", false)

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        if (instance === this) instance = null
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        // Self-managed ConnectionService requires API 26+.
        ret.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        ret.put("platform", "android")
        call.resolve(ret)
    }

    @PluginMethod
    fun reportIncomingCall(call: PluginCall) {
        val callId = call.getString("callId")
        val handle = call.getString("handle")
        val callType = call.getString("callType") ?: "voice"
        val conversationId = call.getString("conversationId")

        if (callId.isNullOrBlank() || handle.isNullOrBlank()) {
            call.reject("callId and handle are required")
            return
        }

        // Hand off to the foreground service so the OS UI surfaces
        // within the 5-second Telecom budget regardless of app state.
        val intent = Intent(context, IncomingCallForegroundService::class.java).apply {
            action = IncomingCallForegroundService.ACTION_PRESENT
            putExtra(IncomingCallForegroundService.EXTRA_CALL_ID, callId)
            putExtra(IncomingCallForegroundService.EXTRA_HANDLE, handle)
            putExtra(IncomingCallForegroundService.EXTRA_CALL_TYPE, callType)
            putExtra(IncomingCallForegroundService.EXTRA_CONVERSATION_ID, conversationId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve()
    }

    @PluginMethod
    fun reportOutgoingCall(call: PluginCall) {
        // Self-managed ConnectionService surfaces outgoing calls in
        // the OS recents — wired up in CallConnectionService. For now
        // the JS layer just records the call in-app.
        call.resolve()
    }

    @PluginMethod
    fun updateCallState(call: PluginCall) {
        val callId = call.getString("callId") ?: return call.reject("callId is required")
        val state = call.getString("state") ?: return call.reject("state is required")
        CallConnectionService.updateCallState(callId, state)
        call.resolve()
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        val callId = call.getString("callId") ?: return call.reject("callId is required")
        CallConnectionService.endCall(callId)
        // Stop the wake foreground service if it's still running for
        // this call.
        val intent = Intent(context, IncomingCallForegroundService::class.java).apply {
            action = IncomingCallForegroundService.ACTION_DISMISS
            putExtra(IncomingCallForegroundService.EXTRA_CALL_ID, callId)
        }
        context.startService(intent)
        call.resolve()
    }

    /** Invoked from the foreground service / ConnectionService. */
    fun emitEvent(eventName: String, data: JSObject) {
        notifyListeners(eventName, data)
    }

    // -----------------------------------------------------------------
    // Camera + microphone runtime permissions for friend calls.
    //
    // The Android WebView refuses to grant getUserMedia({video:true})
    // unless the host application has obtained the runtime permissions
    // via Activity#requestPermissions. We expose check + request entry
    // points here so the JS layer can wait for an explicit grant before
    // it ever calls into WebRTC.
    // -----------------------------------------------------------------

    @PluginMethod
    fun checkCallMediaPermissions(call: PluginCall) {
        call.resolve(buildCallMediaState())
    }

    @PluginMethod
    fun requestCallMediaPermissions(call: PluginCall) {
        val needsMic = !hasPermission(Manifest.permission.RECORD_AUDIO)
        val needsCam = !hasPermission(Manifest.permission.CAMERA)
        if (!needsMic && !needsCam) {
            call.resolve(buildCallMediaState())
            return
        }
        // Record that we are about to ask the OS for these permissions.
        // The result of `shouldShowRequestPermissionRationale` is only
        // meaningful AFTER a request has actually been issued, so the
        // history flag is what disambiguates "fresh install" from
        // "user permanently denied".
        if (needsMic) markPermissionRequested(Manifest.permission.RECORD_AUDIO)
        if (needsCam) markPermissionRequested(Manifest.permission.CAMERA)
        requestPermissionForAlias(PERMISSION_ALIAS_CALL_MEDIA, call, "callMediaPermissionsCallback")
    }

    @PermissionCallback
    private fun callMediaPermissionsCallback(call: PluginCall) {
        call.resolve(buildCallMediaState())
    }

    private fun buildCallMediaState(): JSObject {
        val ret = JSObject()
        ret.put("microphone", permissionStateString(Manifest.permission.RECORD_AUDIO))
        ret.put("camera", permissionStateString(Manifest.permission.CAMERA))
        // Permanent-denial flags drive the rationale modal's CTA: when
        // `microphonePermanentlyDenied` is true the JS layer should swap
        // its primary action from "Allow" (which the OS will silently
        // ignore) to "Open Settings".
        ret.put("microphonePermanentlyDenied", isPermanentlyDenied(Manifest.permission.RECORD_AUDIO))
        ret.put("cameraPermanentlyDenied", isPermanentlyDenied(Manifest.permission.CAMERA))
        return ret
    }

    private fun hasPermission(name: String): Boolean =
        ContextCompat.checkSelfPermission(context, name) == PackageManager.PERMISSION_GRANTED

    private fun permissionStateString(name: String): String =
        if (hasPermission(name)) PermissionState.GRANTED.toString()
        else PermissionState.DENIED.toString()

    /**
     * "Permanently denied" means: we have asked the user before, the
     * permission is still not granted, and the OS will no longer show
     * the runtime dialog (`shouldShowRequestPermissionRationale` is
     * false because the user ticked "Don't ask again", or because the
     * device policy has hard-blocked the permission). The only way out
     * is for the user to flip the switch in the system Settings page.
     *
     * If `bridge.activity` is unavailable we conservatively return
     * `false` — better to re-prompt and have the OS no-op than to
     * mislead the user into Settings on first launch.
     */
    private fun isPermanentlyDenied(name: String): Boolean {
        if (hasPermission(name)) return false
        if (!hasRequestedPermissionBefore(name)) return false
        val activity = bridge?.activity ?: return false
        return !ActivityCompat.shouldShowRequestPermissionRationale(activity, name)
    }

    // -----------------------------------------------------------------
    // SYSTEM_ALERT_WINDOW (display over other apps).
    //
    // Cannot be requested with a runtime dialog — the user must toggle
    // it on in Settings > Apps > <app> > Display over other apps. We
    // expose a check method plus a "request" method that opens the
    // system screen so the user can flip the switch in one tap.
    // -----------------------------------------------------------------

    @PluginMethod
    fun checkOverlayPermission(call: PluginCall) {
        call.resolve(buildOverlayState())
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            // Granted at install time on older Androids, nothing to ask for.
            call.resolve(buildOverlayState())
            return
        }
        if (Settings.canDrawOverlays(context)) {
            call.resolve(buildOverlayState())
            return
        }
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}"),
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            // We cannot synchronously observe the user's decision —
            // the JS layer should re-check when the app resumes.
            val ret = buildOverlayState()
            ret.put("opened", true)
            call.resolve(ret)
        } catch (err: Throwable) {
            call.reject("Could not open overlay-permission settings", err)
        }
    }

    private fun buildOverlayState(): JSObject {
        val ret = JSObject()
        val supported = true // we always support the API on Android
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            // Pre-M devices implicitly grant SYSTEM_ALERT_WINDOW at install.
            true
        }
        ret.put("supported", supported)
        ret.put("granted", granted)
        ret.put("platform", "android")
        return ret
    }
}
