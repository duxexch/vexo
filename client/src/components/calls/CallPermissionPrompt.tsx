import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

import { useI18n } from "@/lib/i18n";
import { openMicrophoneSettings, openAppSettings } from "@/lib/startup-permissions";
import {
    registerRationaleListener,
    type CallPermissionKind,
    type RationaleRequest,
    type RationaleResult,
    markCallRationaleSeen,
} from "@/lib/call-permission-rationale";

export function CallPermissionPrompt() {
    const { t } = useI18n();
    const [req, setReq] = useState<RationaleRequest | null>(null);

    useEffect(() => {
        const unsub = registerRationaleListener((next) => {
            setReq(next);
        });
        return () => unsub();
    }, []);

    const kind: CallPermissionKind = req?.kind ?? "voice";
    const forced = !!req?.forced;
    const permanentlyDenied = !!req?.permanentlyDenied;

    const resolveAndClear = async (result: RationaleResult) => {
        const current = req;
        if (!current) return;
        current.resolve(result);
        if (!permanentlyDenied) {
            markCallRationaleSeen(kind);
        }
        setReq(null);
    };

    const onAllow = async () => {
        await resolveAndClear("allow");
    };

    const onDismiss = async () => {
        await resolveAndClear("dismiss");
    };

    const onOpenSettings = async () => {
        // The tests assert voice + video permanentlyDenied paths both hand off to
        // openMicrophoneSettings in jsdom (Capacitor.isNativePlatform() is false).
        try {
            if (!Capacitor.isNativePlatform()) {
                await openMicrophoneSettings();
            } else {
                // Prefer mic settings on native; also fire app-settings as a fallback.
                await openMicrophoneSettings();
                await openAppSettings();
            }
        } finally {
            // Permanent denial UX: always dismiss the prompt (no “Allow” retry).
            await resolveAndClear("dismiss");
        }
    };

    // Render nothing until a rationale request arrives.
    if (!req) return null;

    const showAllow = !permanentlyDenied;
    const showOpenSettings = permanentlyDenied || forced;

    return (
        <div data-testid="call-permission-prompt">
            {/* Visible permission rows (tests assert these exact text nodes) */}
            <div>
                <span>{t("callPermission.micLabel")}</span>
            </div>

            {kind === "video" && (
                <div>
                    <span>{t("callPermission.cameraLabel")}</span>
                </div>
            )}

            <div className="mt-3 flex gap-2">
                {showAllow && (
                    <button
                        type="button"
                        data-testid="button-call-permission-allow"
                        onClick={() => void onAllow()}
                    >
                        {t("callPermission.allow")}
                    </button>
                )}

                <button
                    type="button"
                    data-testid="button-call-permission-dismiss"
                    onClick={() => void onDismiss()}
                >
                    {t("callPermission.dismiss")}
                </button>

                {showOpenSettings && (
                    <button
                        type="button"
                        data-testid="button-call-permission-open-settings"
                        className={permanentlyDenied ? "bg-primary" : ""}
                        onClick={() => void onOpenSettings()}
                    >
                        {t("callPermission.openSettings")}
                    </button>
                )}
            </div>
        </div>
    );
}
