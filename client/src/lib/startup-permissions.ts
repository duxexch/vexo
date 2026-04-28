import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

import {
    PERMISSION_CATALOGUE,
    probeAllPermissions,
    type PermissionId,
    type PermissionResult,
} from "@/lib/permission-catalogue";

// Re-export `PermissionResult` so existing imports from this module
// continue to compile.
export type { PermissionResult } from "@/lib/permission-catalogue";

/**
 * Snapshot of every device permission VEX surfaces in the Settings tab.
 * Catalogue-derived fields plus two Capacitor-only signals.
 */
export type PermissionSummary = Record<PermissionId, PermissionResult> & {
    nativePush: PermissionResult;
    nativeLocalNotifications: PermissionResult;
    checkedAt: string;
};

const STORAGE_KEY = "vex_startup_permission_summary_v1";

const PushNotifications = registerPlugin<{
    checkPermissions?: () => Promise<{ receive?: string }>;
    requestPermissions?: () => Promise<{ receive?: string }>;
    register?: () => Promise<void>;
}>("PushNotifications");

const LocalNotifications = registerPlugin<{
    checkPermissions?: () => Promise<{ display?: string }>;
    requestPermissions?: () => Promise<{ display?: string }>;
}>("LocalNotifications");

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

/**
 * Trigger every notification-related runtime permission in one batch
 * and return the aggregated result the catalogue's "Allow" CTA reports
 * back to the user. Used by:
 *   - the Settings → Permissions tab (`requestNotificationsPrompt`),
 *   - the post-login scheduler is intentionally NOT routed through
 *     here — it talks to the plugins directly to keep the on-demand
 *     path and the scheduled burst from sharing mutable state.
 */
export async function requestAllNotificationPermissions(): Promise<{
    web: PermissionResult;
    nativePush: PermissionResult;
    nativeLocalNotifications: PermissionResult;
}> {
    let web: PermissionResult = "unavailable";
    if (typeof Notification !== "undefined") {
        if (Notification.permission === "granted") {
            web = "granted";
        } else if (Notification.permission === "denied") {
            web = "denied";
        } else {
            try {
                const result = await Notification.requestPermission();
                web = result === "granted"
                    ? "granted"
                    : result === "denied"
                        ? "denied"
                        : "prompt";
            } catch {
                web = "denied";
            }
        }
    }

    let nativePush: PermissionResult = "unavailable";
    if (requiresNativePushPermission()) {
        try {
            const current = await PushNotifications.checkPermissions?.();
            const currentResult = normalizeNativePermission(current?.receive);
            if (currentResult === "granted") {
                await PushNotifications.register?.();
                nativePush = "granted";
            } else {
                const requested = await PushNotifications.requestPermissions?.();
                nativePush = normalizeNativePermission(requested?.receive);
                if (nativePush === "granted") {
                    await PushNotifications.register?.();
                }
            }
        } catch {
            nativePush = "denied";
        }
    }

    let nativeLocalNotifications: PermissionResult = "unavailable";
    if (requiresNativeLocalNotificationsPermission()) {
        try {
            const current = await LocalNotifications.checkPermissions?.();
            const currentResult = normalizeNativePermission(current?.display);
            if (currentResult === "granted") {
                nativeLocalNotifications = "granted";
            } else {
                const requested = await LocalNotifications.requestPermissions?.();
                nativeLocalNotifications = normalizeNativePermission(requested?.display);
            }
        } catch {
            nativeLocalNotifications = "denied";
        }
    }

    return { web, nativePush, nativeLocalNotifications };
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
        // Ignore open-settings failures.
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

/**
 * Build a `PermissionSummary` by delegating every catalogue field to
 * `probeAllPermissions()` (the single source of truth) and layering
 * the Capacitor-only `nativePush` / `nativeLocalNotifications`
 * signals on top.
 */
async function collectPermissionSummary(): Promise<PermissionSummary> {
    const [catalogueResults, nativePush, nativeLocalNotifications] = await Promise.all([
        probeAllPermissions(),
        checkNativePushPermission(),
        checkNativeLocalNotificationsPermission(),
    ]);

    const summary: PermissionSummary = {
        ...catalogueResults,
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
 * then trigger {@link refreshPermissionSummary} for a fresh snapshot.
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
