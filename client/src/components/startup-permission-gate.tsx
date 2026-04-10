import { Capacitor } from "@capacitor/core";
import { Bell, Mic, RefreshCw, ShieldAlert, Smartphone, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
    ensureStartupPermissions,
    getStoredStartupPermissionSummary,
    isStartupPermissionSummaryReady,
    openNotificationSettings,
    requestRequiredStartupPermissions,
    shouldShowNotificationSettingsHint,
    type PermissionResult,
    type PermissionSummary,
} from "@/lib/startup-permissions";

type PermissionLine = {
    key: string;
    label: string;
    value: PermissionResult;
    required: boolean;
    icon: React.ComponentType<{ className?: string }>;
};

function statusClassName(value: PermissionResult): string {
    if (value === "granted") {
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    }
    if (value === "denied") {
        return "bg-rose-500/15 text-rose-300 border-rose-500/40";
    }
    return "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

function statusText(value: PermissionResult, t: (key: string) => string): string {
    if (value === "granted") {
        return t("permissions.gate.status.granted");
    }
    if (value === "denied") {
        return t("permissions.gate.status.denied");
    }
    return t("permissions.gate.status.unavailable");
}

export function StartupPermissionGate() {
    const { t, dir } = useI18n();
    const [summary, setSummary] = useState<PermissionSummary | null>(() => getStoredStartupPermissionSummary());
    const [isChecking, setIsChecking] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [hasError, setHasError] = useState(false);

    const isNative = Capacitor.isNativePlatform();
    const needsWebNotifications = typeof Notification !== "undefined";
    const needsMicrophone = Boolean(navigator.mediaDevices?.getUserMedia);
    const needsNativePush = isNative && Capacitor.isPluginAvailable("PushNotifications");
    const needsNativeLocal = isNative && Capacitor.isPluginAvailable("LocalNotifications");

    const isReady = useMemo(() => isStartupPermissionSummaryReady(summary), [summary]);
    const showSettingsShortcut = useMemo(() => shouldShowNotificationSettingsHint(summary), [summary]);

    const refreshSummary = useCallback(async () => {
        setIsChecking(true);
        setHasError(false);
        try {
            const next = await ensureStartupPermissions();
            setSummary(next);
        } catch {
            setHasError(true);
        } finally {
            setIsChecking(false);
        }
    }, []);

    const requestNotifications = useCallback(async () => {
        setIsRequesting(true);
        setHasError(false);
        try {
            const next = await requestRequiredStartupPermissions();
            setSummary(next);
        } catch {
            setHasError(true);
        } finally {
            setIsRequesting(false);
        }
    }, []);

    useEffect(() => {
        if (!summary) {
            void refreshSummary();
        }
    }, [summary, refreshSummary]);

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible" && !isReady) {
                void refreshSummary();
            }
        };

        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [isReady, refreshSummary]);

    if (isReady) {
        return null;
    }

    const fallbackSummary: PermissionSummary = summary ?? {
        notifications: "unavailable",
        microphone: "unavailable",
        nativePush: "unavailable",
        nativeLocalNotifications: "unavailable",
        checkedAt: "",
    };

    const lines: PermissionLine[] = [
        {
            key: "notifications",
            label: t("permissions.gate.notifications"),
            value: fallbackSummary.notifications,
            required: needsWebNotifications,
            icon: Bell,
        },
        {
            key: "microphone",
            label: t("permissions.gate.microphone"),
            value: fallbackSummary.microphone,
            required: false,
            icon: Mic,
        },
        {
            key: "nativePush",
            label: t("permissions.gate.nativePush"),
            value: fallbackSummary.nativePush,
            required: needsNativePush,
            icon: Smartphone,
        },
        {
            key: "nativeLocalNotifications",
            label: t("permissions.gate.nativeLocalNotifications"),
            value: fallbackSummary.nativeLocalNotifications,
            required: false,
            icon: Volume2,
        },
    ];

    return (
        <div className="fixed inset-0 z-[150] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4" dir={dir}>
            <div className="w-full max-w-xl rounded-2xl border border-amber-400/25 bg-slate-900/95 shadow-2xl">
                <div className="p-5 sm:p-6 border-b border-slate-700/70">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-amber-500/15 text-amber-300 p-2.5">
                            <ShieldAlert className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-100">{t("permissions.gate.title")}</h2>
                            <p className="text-sm text-slate-300">{t("permissions.gate.subtitle")}</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 sm:p-6 space-y-3">
                    {lines.map((line) => {
                        const Icon = line.icon;
                        return (
                            <div key={line.key} className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-2.5">
                                <div className="flex items-center gap-2.5">
                                    <Icon className="h-4 w-4 text-slate-300" />
                                    <span className="text-sm text-slate-100">{line.label}</span>
                                    {line.required && (
                                        <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-300 bg-amber-500/10">
                                            {t("permissions.gate.required")}
                                        </Badge>
                                    )}
                                    {!line.required && (line.key === "microphone" || line.key === "nativeLocalNotifications") && (
                                        <Badge variant="outline" className="text-[10px] border-slate-500/40 text-slate-300 bg-slate-500/10">
                                            {t("permissions.gate.onDemand")}
                                        </Badge>
                                    )}
                                </div>
                                <Badge variant="outline" className={`text-xs ${statusClassName(line.value)}`}>
                                    {statusText(line.value, t)}
                                </Badge>
                            </div>
                        );
                    })}

                    <p className="text-xs text-slate-400">{t(isNative ? "permissions.gate.hintNative" : "permissions.gate.hintWeb")}</p>
                    {(needsMicrophone || needsNativeLocal) && (
                        <p className="text-xs text-slate-400">{t("permissions.gate.onDemandHint")}</p>
                    )}
                    {hasError && <p className="text-xs text-rose-300">{t("permissions.gate.retryHint")}</p>}
                </div>

                <div className="p-5 sm:p-6 border-t border-slate-700/70 flex flex-col sm:flex-row gap-2.5">
                    <Button
                        className="w-full sm:flex-1"
                        onClick={() => void requestNotifications()}
                        disabled={isRequesting}
                        data-testid="button-permissions-allow"
                    >
                        {isRequesting ? t("common.loading") : t("permissions.gate.allowNotifications")}
                    </Button>

                    <Button
                        variant="outline"
                        className="w-full sm:w-auto border-slate-600 text-slate-100"
                        onClick={() => void refreshSummary()}
                        disabled={isChecking}
                        data-testid="button-permissions-recheck"
                    >
                        <RefreshCw className={`h-4 w-4 me-2 ${isChecking ? "animate-spin" : ""}`} />
                        {isChecking ? t("common.loading") : t("permissions.gate.recheck")}
                    </Button>

                    {showSettingsShortcut ? (
                        <Button
                            variant="outline"
                            className="w-full sm:w-auto border-slate-600 text-slate-100"
                            onClick={() => void openNotificationSettings()}
                            data-testid="button-permissions-open-settings"
                        >
                            {t(isNative ? "permissions.gate.openSettings" : "permissions.gate.openBrowserSettings")}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
