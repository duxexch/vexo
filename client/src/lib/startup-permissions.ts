import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

import {
    PERMISSION_CATALOGUE,
    probeAllPermissions,
    type PermissionId,
    type PermissionResult,
} from "@/lib/permission-catalogue";

// Re-export `PermissionResult` so existing imports from this module
// continue to compile after the refactor.
export type { PermissionResult } from "@/lib/permission-catalogue";

/**
 * Snapshot of every device permission VEX cares about. The first eight
 * fields are derived from {@link PERMISSION_CATALOGUE}; the trailing
 * `nativePush` and `nativeLocalNotifications` fields are kept as
 * separate signals because they only apply on Capacitor builds and
 * existing call sites already read them by name.
 *
 * Adding a new permission means adding ONE entry to the catalogue and
 * letting TypeScript flag every place that needs to handle the new
 * field — no parallel switch to maintain.
 */
export type PermissionSummary = Record<PermissionId, PermissionResult> & {
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

function requiresNativePushPermission(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");
}

function requiresNativeLocalNotificationsPermission(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
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

/**
 * Build a PermissionSummary by delegating every catalogue field to
 * `probeAllPermissions()` (the single source of truth) and then
 * layering the Capacitor-only `nativePush` / `nativeLocalNotifications`
 * signals on top.
 *
 * `options.requestNotificationPermission` and
 * `options.requestMicrophonePermission` cause the function to actively
 * trigger the relevant prompts in addition to probing — used by
 * `requestPostSignupNotificationPermissions` after sign-up so the user
 * sees the OS dialogs once, in a coordinated batch, instead of one
 * per surface they happen to navigate to.
 */
async function collectPermissionSummary(options: CollectOptions = {}): Promise<PermissionSummary> {
    const requestNotificationPermission = options.requestNotificationPermission === true;
    const requestMicrophonePermissionFlag = options.requestMicrophonePermission === true;

    const [catalogueResults, nativePush, nativeLocalNotifications] = await Promise.all([
        probeAllPermissions(),
        requestNotificationPermission ? requestNativePushPermission() : checkNativePushPermission(),
        requestNotificationPermission
            ? requestNativeLocalNotificationsPermission()
            : checkNativeLocalNotificationsPermission(),
    ]);

    let notifications = catalogueResults.notifications;
    if (requestNotificationPermission && typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
            try {
                const result = await Notification.requestPermission();
                notifications =
                    result === "granted"
                        ? "granted"
                        : result === "denied"
                            ? "denied"
                            : "prompt";
            } catch {
                notifications = "denied";
            }
        }
    }

    let microphone = catalogueResults.microphone;
    if (requestMicrophonePermissionFlag && navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach((track) => track.stop());
            microphone = "granted";
        } catch (error) {
            const errorName = (error as { name?: string } | null)?.name ?? "";
            if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(errorName)) {
                microphone = "denied";
            }
        }
    }

    const summary: PermissionSummary = {
        ...catalogueResults,
        notifications,
        microphone,
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
 *
 * The catalogue-derived fields are populated from
 * {@link PERMISSION_CATALOGUE} so adding a new entry there
 * automatically extends the cached shape with a sensible
 * `"unavailable"` default — no parallel maintenance.
 */
export function getCachedPermissionSummary(): PermissionSummary | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PermissionSummary> | null;
        if (!parsed) return null;
        const summary = {
            nativePush: parsed.nativePush ?? "unavailable",
            nativeLocalNotifications: parsed.nativeLocalNotifications ?? "unavailable",
            checkedAt: parsed.checkedAt ?? new Date(0).toISOString(),
        } as PermissionSummary;
        for (const entry of PERMISSION_CATALOGUE) {
            const stored = (parsed as Record<string, PermissionResult | undefined>)[entry.id];
            (summary as Record<string, PermissionResult>)[entry.id] = stored ?? "unavailable";
        }
        return summary;
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
