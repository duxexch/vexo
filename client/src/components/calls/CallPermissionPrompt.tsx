import { useEffect, useState } from "react";
import { Camera, Mic, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
    registerRationaleListener,
    type CallMediaKind,
    type RationaleRequest,
} from "@/lib/call-permission-rationale";
import { openMicrophoneSettings, openAppSettings } from "@/lib/startup-permissions";
import { Capacitor } from "@capacitor/core";

/**
 * Shared rationale modal — mounted once at the auth-protected layout. When
 * any caller asks `ensureCallRationale(kind)` we surface this dialog,
 * explain what we need access to, and resolve the promise based on the
 * user's choice.
 */
export function CallPermissionPrompt() {
    const { t } = useI18n();
    const [request, setRequest] = useState<RationaleRequest | null>(null);

    useEffect(() => {
        return registerRationaleListener((next) => {
            setRequest(next);
        });
    }, []);

    if (!request) return null;

    const isVideo = request.kind === "video";

    const handleAllow = () => {
        request.resolve("allow");
        setRequest(null);
    };

    const handleDismiss = () => {
        request.resolve("dismiss");
        setRequest(null);
    };

    const handleOpenSettings = async () => {
        request.resolve("dismiss");
        setRequest(null);
        if (Capacitor.isNativePlatform()) {
            await openAppSettings();
            return;
        }
        await openMicrophoneSettings();
    };

    // Permanent denial implies the modal is forced — even if the user
    // previously acknowledged the rationale we still want to surface
    // the "Open Settings" path because re-tapping Allow would silently
    // do nothing.
    const isBlocked = request.permanentlyDenied || request.forced;

    const title = isBlocked
        ? t("callPermission.deniedTitle")
        : isVideo
            ? t("callPermission.videoTitle")
            : t("callPermission.voiceTitle");

    const description = isBlocked
        ? t("callPermission.deniedDescription")
        : isVideo
            ? t("callPermission.videoDescription")
            : t("callPermission.voiceDescription");

    return (
        <Dialog open onOpenChange={(open) => { if (!open) handleDismiss(); }}>
            <DialogContent className="max-w-md" data-testid="dialog-call-permission">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-sky-500" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 pt-2">
                    <PermissionRow
                        icon={<Mic className="h-4 w-4" />}
                        label={t("callPermission.micLabel")}
                        helper={t("callPermission.micHelper")}
                    />
                    {isVideo && (
                        <PermissionRow
                            icon={<Camera className="h-4 w-4" />}
                            label={t("callPermission.cameraLabel")}
                            helper={t("callPermission.cameraHelper")}
                        />
                    )}
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleDismiss}
                        data-testid="button-call-permission-dismiss"
                    >
                        {t("callPermission.notNow")}
                    </Button>
                    {/*
                      When the OS will no longer surface the runtime
                      dialog (Android "Don't ask again"), re-tapping
                      Allow is a silent no-op. Promote Open Settings to
                      the primary action and hide Allow entirely so the
                      user is steered onto the only path that actually
                      unblocks the call. In the soft "forced" state
                      (we just got a one-off NotAllowedError but the OS
                      is still re-promptable) we keep both options
                      available.
                    */}
                    {isBlocked && (
                        <Button
                            type="button"
                            variant={request.permanentlyDenied ? "default" : "outline"}
                            onClick={() => void handleOpenSettings()}
                            data-testid="button-call-permission-open-settings"
                        >
                            {t("callPermission.openSettings")}
                        </Button>
                    )}
                    {!request.permanentlyDenied && (
                        <Button
                            type="button"
                            onClick={handleAllow}
                            data-testid="button-call-permission-allow"
                        >
                            {t("callPermission.allow")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PermissionRow({ icon, label, helper }: { icon: React.ReactNode; label: string; helper: string }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="mt-0.5 rounded-full bg-background p-2 text-sky-600 dark:text-sky-400">
                {icon}
            </div>
            <div className="space-y-0.5">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{helper}</p>
            </div>
        </div>
    );
}
