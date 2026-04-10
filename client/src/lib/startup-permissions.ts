import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

export type PermissionResult = "granted" | "denied" | "unavailable";

export type PermissionSummary = {
    notifications: PermissionResult;
    microphone: PermissionResult;
    nativePush: PermissionResult;
    nativeLocalNotifications: PermissionResult;
    checkedAt: string;
};

const STORAGE_KEY = "vex_startup_permission_summary_v1";

const PushNotifications = registerPlugin<any>("PushNotifications");
const LocalNotifications = registerPlugin<any>("LocalNotifications");

let ensureInFlight: Promise<PermissionSummary> | null = null;

function saveSummary(summary: PermissionSummary): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
    } catch {
        // Ignore storage failures.
    }
}

export function getStoredStartupPermissionSummary(): PermissionSummary | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as PermissionSummary;
        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        if (!parsed.checkedAt) {
            return null;
        }

        return parsed;
    } catch {
        return null;
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

async function ensureWebNotificationPermission(): Promise<PermissionResult> {
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
        return result === "granted" ? "granted" : "denied";
    } catch {
        return "denied";
    }
}

async function ensureMicrophonePermission(): Promise<PermissionResult> {
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
        }
    } catch {
        // Continue to active request fallback.
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return "granted";
    } catch {
        return "denied";
    }
}

function normalizeNativePermission(value: unknown): PermissionResult {
    if (value === "granted") return "granted";
    if (value === "denied") return "denied";
    return "unavailable";
}

async function ensureNativePushPermission(): Promise<PermissionResult> {
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

async function ensureNativeLocalNotificationsPermission(): Promise<PermissionResult> {
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

export function isStartupPermissionSummaryReady(summary: PermissionSummary | null): boolean {
    if (!summary) {
        return false;
    }

    const notificationsReady = !requiresWebNotificationPermission() || summary.notifications === "granted";
    const microphoneReady = !requiresMicrophonePermission() || summary.microphone === "granted";
    const nativePushReady = !requiresNativePushPermission() || summary.nativePush === "granted";
    const nativeLocalReady =
        !requiresNativeLocalNotificationsPermission() || summary.nativeLocalNotifications === "granted";

    return notificationsReady && microphoneReady && nativePushReady && nativeLocalReady;
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

async function ensureStartupPermissionsInternal(): Promise<PermissionSummary> {
    const [notifications, microphone, nativePush, nativeLocalNotifications] = await Promise.all([
        ensureWebNotificationPermission(),
        ensureMicrophonePermission(),
        ensureNativePushPermission(),
        ensureNativeLocalNotificationsPermission(),
    ]);

    const summary: PermissionSummary = {
        notifications,
        microphone,
        nativePush,
        nativeLocalNotifications,
        checkedAt: new Date().toISOString(),
    };

    saveSummary(summary);
    return summary;
}

export async function ensureStartupPermissions(): Promise<PermissionSummary> {
    if (ensureInFlight) {
        return ensureInFlight;
    }

    ensureInFlight = ensureStartupPermissionsInternal().finally(() => {
        ensureInFlight = null;
    });

    return ensureInFlight;
}
