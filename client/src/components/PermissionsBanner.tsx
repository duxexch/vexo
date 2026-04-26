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

// Selector that matches every Radix-based modal surface this app uses
// (Dialog, AlertDialog, Sheet, Drawer all set role="dialog" or
// role="alertdialog" with data-state="open" on their content node).
// Keeping it generic means new modals are covered automatically without
// having to wire them into a global counter.
const OPEN_MODAL_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * Returns true while ANY modal-style surface is currently open in the
 * DOM. Used by the permissions banner to step out of the way of
 * dialogs / sheets so the two layers can never visually overlap.
 *
 * Implemented as a MutationObserver on document.body so it picks up
 * Radix portals as soon as they mount or change their open state,
 * without requiring every dialog call site to opt in.
 */
function useIsAnyModalOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => {
      setIsOpen(!!document.querySelector(OPEN_MODAL_SELECTOR));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    });
    return () => observer.disconnect();
  }, []);

  return isOpen;
}

export function PermissionsBanner() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const isModalOpen = useIsAnyModalOpen();
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
  // Step out of the way whenever any dialog / sheet is open. Radix
  // dialog overlays sit at z-50, which used to clip the banner
  // diagonally; rather than fighting the stacking context we simply
  // unmount the banner while a modal owns the screen.
  if (isModalOpen) return null;

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
      // z-40 keeps the banner above the page + nav dock (which sit
      // at default / lower stacking) but strictly BELOW Radix dialog,
      // alert-dialog, sheet, and drawer overlays (z-50 / z-[100]).
      // Toaster (z-[100]) and OfflineBanner (z-[100]) also stay on
      // top so urgent notices are never hidden by this card.
      //
      // On phones (≤ sm) the card spans the full safe-area width so it
      // doesn't get pushed under the status-bar notch on the left side
      // and pinned by a sliver of margin on the right. The desktop
      // layout (sm+) keeps the centered floating-card look.
      className="fixed inset-x-0 top-0 z-40 mx-auto flex max-w-2xl items-start gap-3 border-b border-amber-300/60 bg-amber-50 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-lg dark:border-amber-500/40 dark:bg-amber-950/70 sm:inset-x-3 sm:top-3 sm:rounded-xl sm:border sm:pt-3"
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
