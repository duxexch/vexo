import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  getCachedPermissionSummary,
  refreshPermissionSummary,
  type PermissionSummary,
} from "@/lib/startup-permissions";

const SESSION_DISMISSED_KEY = "vixo:perm-banner-dismissed";

function summaryNeedsAttention(summary: PermissionSummary | null): boolean {
  if (!summary) return false;
  return (
    summary.microphone === "denied" ||
    summary.camera === "denied" ||
    summary.overlay === "denied"
  );
}

export function PermissionsBanner() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    const cached = getCachedPermissionSummary();
    if (summaryNeedsAttention(cached)) {
      setVisible(true);
    }
    void refreshPermissionSummary()
      .then((fresh) => {
        if (cancelled) return;
        setVisible(summaryNeedsAttention(fresh));
      })
      .catch(() => {
        // Probe failures should never surface UI noise — if we can't
        // tell the state, stay silent rather than nagging the user.
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  // Hide on the settings page itself — the user is already in the
  // right place to fix things, so the banner would just add noise.
  if (location.startsWith("/settings")) return null;
  if (!visible || dismissed) return null;

  const handleReview = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    } catch {
      // ignore — at worst the banner re-appears once next session
    }
    navigate("/settings?tab=permissions");
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="status"
      data-testid="banner-permissions"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 shadow-lg dark:border-amber-500/40 dark:bg-amber-950/70"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="flex-1 space-y-2">
        <div>
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {t("settings.permissions.banner.title")}
          </div>
          <div className="text-xs text-amber-800/90 dark:text-amber-100/80">
            {t("settings.permissions.banner.body")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleReview}
            data-testid="btn-perm-banner-review"
          >
            {t("settings.permissions.banner.action")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            data-testid="btn-perm-banner-dismiss"
          >
            {t("settings.permissions.banner.dismiss")}
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label={t("settings.permissions.banner.dismiss")}
        onClick={handleDismiss}
        className="rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export default PermissionsBanner;
