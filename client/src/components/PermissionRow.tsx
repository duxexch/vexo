/**
 * One row inside the redesigned Settings → Permissions tab (Task #143).
 *
 * Renders the icon + name + helper text of a single permission, plus a
 * status pill and a context-appropriate primary CTA:
 *
 *   - state="granted"     → pill only (no action needed)
 *   - state="prompt"      → "Allow" button that triggers the OS prompt
 *   - state="denied"      → "Open settings" button (the OS no longer
 *                            surfaces in-page prompts after a denial)
 *   - state="unavailable" → muted "Not supported" hint, no action
 *
 * Pulled out of `settings.tsx` so the same component can be exercised
 * from a focused unit test (no need to mount the whole 3000-line
 * settings page just to verify a row's state machine).
 */

import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { PermissionResult } from "@/lib/startup-permissions";

export interface PermissionRowProps {
  /** Stable identifier — used to derive `data-testid` selectors. */
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  helper: string;
  state: PermissionResult;
  /** Triggered by the "Allow" CTA when state === "prompt". */
  onAllow?: () => void;
  /** Triggered by the "Open settings" CTA when state === "denied". */
  onOpenSettings?: () => void;
  /** Disables the CTA while an outbound request is pending. */
  busy?: boolean;
  /** Optional helper card rendered below the row (e.g. iOS PWA hint). */
  extraHint?: ReactNode;
}

const STATE_PILL: Record<
  PermissionResult,
  { variant: "default" | "destructive" | "secondary" | "outline"; labelKey: string }
> = {
  granted: { variant: "default", labelKey: "permissions.gate.status.granted" },
  denied: { variant: "destructive", labelKey: "permissions.gate.status.denied" },
  prompt: { variant: "secondary", labelKey: "permissions.gate.status.prompt" },
  unavailable: { variant: "outline", labelKey: "permissions.gate.status.unavailable" },
};

export function PermissionRow({
  id,
  icon: Icon,
  title,
  helper,
  state,
  onAllow,
  onOpenSettings,
  busy,
  extraHint,
}: PermissionRowProps) {
  const { t } = useI18n();
  const pill = STATE_PILL[state];

  let action: ReactNode = null;
  if (state === "prompt" && onAllow) {
    action = (
      <Button
        size="sm"
        disabled={busy}
        onClick={onAllow}
        data-testid={`btn-perm-${id}-allow`}
      >
        {t("settings.permissions.cta.allow")}
      </Button>
    );
  } else if (state === "denied") {
    action = (
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={onOpenSettings}
        data-testid={`btn-perm-${id}-settings`}
      >
        {t("settings.permissions.cta.openSettings")}
      </Button>
    );
  } else if (state === "unavailable") {
    action = (
      <span
        className="text-xs text-muted-foreground"
        data-testid={`hint-perm-${id}-unavailable`}
      >
        {t("settings.permissions.cta.unavailable")}
      </span>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border/60 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      data-testid={`row-perm-${id}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-muted p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium leading-tight">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug">{helper}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-center">
        <Badge variant={pill.variant} data-testid={`status-perm-${id}-${state}`}>
          {t(pill.labelKey)}
        </Badge>
        {action}
      </div>
      {extraHint ? <div className="basis-full">{extraHint}</div> : null}
    </div>
  );
}

export default PermissionRow;
