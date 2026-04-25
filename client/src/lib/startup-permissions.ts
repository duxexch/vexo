import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

import {
    checkCallPermissions,
    type CallMediaPermissionState,
    type OverlayPermissionStatus,
} from "@/lib/native-call-permissions";

export type PermissionResult = "granted" | "denied" | "prompt" | "unavailable";

export type PermissionSummary = {
    notifications: PermissionResult;
    microphone: PermissionResult;
    camera: PermissionResult;
    overlay: PermissionResult;
    nativePush: PermissionResult;
    nativeLocalNotifications: PermissionResult;
    checkedAt: string;
};

const STORAGE_KEY = "vex_startup_permission_summary_v1";

const PushNotifications = registerPlugin<any>("PushNotifications");
const LocalNotifications = registerPlugin<any>("LocalNotifications");

let requestInFlight: Promise<PermissionSummary> | null = null;

function saveSummary(summary: PermissionSummary): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
    } catch {
        // Ignore storage failures.
    }
}

function requiresWebNotificationPermission(): boolean {
    return typeof Notification !== "undefined";
}

function requiresMicrophonePermission(): boolean {
    return Boolean(navigator.mediaDevices?.getUserMedia);
}

function requiresNativePushPermission(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");
}

function requiresNativeLocalNotificationsPermission(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
}

function checkWebNotificationPermission(): PermissionResult {
    if (!requiresWebNotificationPermission()) {
        return "unavailable";
    }

    if (Notification.permission === "granted") {
        return "granted";
    }

    if (Notification.permission === "denied") {
        return "denied";
    }

    return "prompt";
}

async function requestWebNotificationPermission(): Promise<PermissionResult> {
    if (!requiresWebNotificationPermission()) {
        return "unavailable";
    }

    if (Notification.permission === "granted") {
        return "granted";
    }

    if (Notification.permission === "denied") {
        return "denied";
    }

    try {
        const result = await Notification.requestPermission();
        if (result === "granted") {
            return "granted";
        }

        if (result === "denied") {
            return "denied";
        }

        return "prompt";
    } catch {
        return "denied";
    }
}

async function checkMicrophonePermission(): Promise<PermissionResult> {
    if (!requiresMicrophonePermission()) {
        return "unavailable";
    }

    try {
        if (navigator.permissions?.query) {
            const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
            if (status.state === "granted") {
                return "granted";
            }
            if (status.state === "denied") {
                return "denied";
            }

            return "prompt";
        }
    } catch {
        // Continue with best-effort fallback.
    }

    return "unavailable";
}

async function requestMicrophonePermission(): Promise<PermissionResult> {
    if (!requiresMicrophonePermission()) {
        return "unavailable";
    }

    const current = await checkMicrophonePermission();
    if (current === "granted" || current === "denied") {
        return current;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
        return "granted";
    } catch (error) {
        const errorName = typeof (error as { name?: string } | null)?.name === "string"
            ? ((error as { name?: string }).name as string)
            : "";

        if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(errorName)) {
            return "denied";
        }

        return "prompt";
    }
}

function normalizeNativePermission(value: unknown): PermissionResult {
    if (value === "granted") return "granted";
    if (value === "denied") return "denied";
    if (value === "prompt") return "prompt";
    return "unavailable";
}

async function checkNativePushPermission(): Promise<PermissionResult> {
    if (!requiresNativePushPermission()) {
        return "unavailable";
    }

    try {
        const current = await PushNotifications.checkPermissions?.();
        return normalizeNativePermission(current?.receive);
    } catch {
        return "denied";
    }
}

async function requestNativePushPermission(): Promise<PermissionResult> {
    if (!requiresNativePushPermission()) {
        return "unavailable";
    }

    try {
        const current = await PushNotifications.checkPermissions?.();
        const currentResult = normalizeNativePermission(current?.receive);
        if (currentResult === "granted") {
            await PushNotifications.register?.();
            return "granted";
        }

        const requested = await PushNotifications.requestPermissions?.();
        const requestedResult = normalizeNativePermission(requested?.receive);
        if (requestedResult === "granted") {
            await PushNotifications.register?.();
        }

        return requestedResult;
    } catch {
        return "denied";
    }
}

async function checkNativeLocalNotificationsPermission(): Promise<PermissionResult> {
    if (!requiresNativeLocalNotificationsPermission()) {
        return "unavailable";
    }

    try {
        const current = await LocalNotifications.checkPermissions?.();
        return normalizeNativePermission(current?.display);
    } catch {
        return "denied";
    }
}

async function requestNativeLocalNotificationsPermission(): Promise<PermissionResult> {
    if (!requiresNativeLocalNotificationsPermission()) {
        return "unavailable";
    }

    try {
        const current = await LocalNotifications.checkPermissions?.();
        const currentResult = normalizeNativePermission(current?.display);
        if (currentResult === "granted") {
            return "granted";
        }

        const requested = await LocalNotifications.requestPermissions?.();
        return normalizeNativePermission(requested?.display);
    } catch {
        return "denied";
    }
}

export async function openAppSettings(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    try {
        const appWithSettings = CapacitorApp as unknown as {
            openSettings?: () => Promise<void>;
        };

        if (typeof appWithSettings.openSettings === "function") {
            await appWithSettings.openSettings();
            return;
        }

        window.location.assign("app-settings:");
    } catch {
        // Ignore open settings failures.
    }
}

export async function openNotificationSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
        await openAppSettings();
        return;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    const targets: string[] = [];

    if (userAgent.includes("edg/")) {
        targets.push("edge://settings/content/notifications");
    }
    if (userAgent.includes("chrome/")) {
        targets.push("chrome://settings/content/notifications");
    }
    if (userAgent.includes("firefox/")) {
        targets.push("about:preferences#privacy");
    }

    for (const url of targets) {
        try {
            const opened = window.open(url, "_blank", "noopener,noreferrer");
            if (opened) {
                return;
            }
        } catch {
            // Continue to fallback.
        }
    }

    window.open("https://support.google.com/chrome/answer/3220216", "_blank", "noopener,noreferrer");
}

export async function openMicrophoneSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
        await openAppSettings();
        return;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    const targets: string[] = [];

    if (userAgent.includes("edg/")) {
        targets.push("edge://settings/content/microphone");
    }
    if (userAgent.includes("chrome/")) {
        targets.push("chrome://settings/content/microphone");
    }
    if (userAgent.includes("firefox/")) {
        targets.push("about:preferences#privacy");
    }

    for (const url of targets) {
        try {
            const opened = window.open(url, "_blank", "noopener,noreferrer");
            if (opened) {
                return;
            }
        } catch {
            // Continue to fallback.
        }
    }

    window.open("https://support.google.com/chrome/answer/2693767", "_blank", "noopener,noreferrer");
}

type CollectOptions = {
    requestNotificationPermission?: boolean;
    requestMicrophonePermission?: boolean;
};

function callMediaStateToResult(state: CallMediaPermissionState): PermissionResult {
    if (state === "granted") return "granted";
    if (state === "denied") return "denied";
    return "prompt";
}

function overlayStatusToResult(status: OverlayPermissionStatus): PermissionResult {
    if (!status.supported) return "unavailable";
    return status.granted ? "granted" : "denied";
}

async function collectPermissionSummary(options: CollectOptions = {}): Promise<PermissionSummary> {
    const requestNotificationPermission = options.requestNotificationPermission === true;
    const requestMicrophonePermissionFlag = options.requestMicrophonePermission === true;

    const [notifications, microphone, nativePush, nativeLocalNotifications, callPerms] = await Promise.all([
        requestNotificationPermission
            ? requestWebNotificationPermission()
            : Promise.resolve(checkWebNotificationPermission()),
        requestMicrophonePermissionFlag ? requestMicrophonePermission() : checkMicrophonePermission(),
        requestNotificationPermission ? requestNativePushPermission() : checkNativePushPermission(),
        requestNotificationPermission
            ? requestNativeLocalNotificationsPermission()
            : checkNativeLocalNotificationsPermission(),
        checkCallPermissions().catch(() => null),
    ]);

    // Trust the dedicated call-permissions probe for camera state, and
    // prefer it for microphone too on native (where the runtime
    // permission is more authoritative than the browser-style query).
    let cameraResult: PermissionResult = "unavailable";
    let overlayResult: PermissionResult = "unavailable";
    let microphoneResult = microphone;
    if (callPerms) {
        cameraResult = callMediaStateToResult(callPerms.camera);
        overlayResult = overlayStatusToResult(callPerms.overlay);
        if (Capacitor.isNativePlatform()) {
            microphoneResult = callMediaStateToResult(callPerms.microphone);
        }
    }

    const summary: PermissionSummary = {
        notifications,
        microphone: microphoneResult,
        camera: cameraResult,
        overlay: overlayResult,
        nativePush,
        nativeLocalNotifications,
        checkedAt: new Date().toISOString(),
    };

    saveSummary(summary);
    return summary;
}

/**
 * Read the cached permission summary written by the most recent probe.
 * Returns `null` when nothing has been persisted yet — the caller can
 * then trigger {@link refreshPermissionSummary} to fetch a fresh one.
 */
export function getCachedPermissionSummary(): PermissionSummary | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PermissionSummary> | null;
        if (!parsed) return null;
        return {
            notifications: parsed.notifications ?? "unavailable",
            microphone: parsed.microphone ?? "unavailable",
            camera: parsed.camera ?? "unavailable",
            overlay: parsed.overlay ?? "unavailable",
            nativePush: parsed.nativePush ?? "unavailable",
            nativeLocalNotifications: parsed.nativeLocalNotifications ?? "unavailable",
            checkedAt: parsed.checkedAt ?? new Date(0).toISOString(),
        };
    } catch {
        return null;
    }
}

/** Re-run the read-only probe and return the freshly persisted summary. */
export function refreshPermissionSummary(): Promise<PermissionSummary> {
    return collectPermissionSummary();
}

export async function requestPostSignupNotificationPermissions(): Promise<PermissionSummary> {
    if (requestInFlight) {
        return requestInFlight;
    }

    requestInFlight = collectPermissionSummary({
        requestNotificationPermission: true,
        requestMicrophonePermission: false,
    }).finally(() => {
        requestInFlight = null;
    });

    return requestInFlight;
}
