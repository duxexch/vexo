import { useQuery } from "@tanstack/react-query";
import { Wallet, Clock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/hooks/useBalance";
import { financialQueryOptions } from "@/lib/queryClient";
import { formatWalletAmountFromUsd } from "@/lib/wallet-currency";

interface DepositConfigForBalance {
  balanceCurrency?: string;
  usdRateByCurrency?: Record<string, number>;
  currencySymbolByCode?: Record<string, string>;
}

/**
 * Compact balance pill for the unified game HUD. Reads the current user's
 * balance and respects the global "hide balance" toggle.
 */
export function GameHUDBalance({ className }: { className?: string }) {
  const { user } = useAuth();
  const { isHidden } = useBalance();
  const { data: depositConfig } = useQuery<DepositConfigForBalance>({
    queryKey: ["/api/transactions/deposit-config"],
    ...financialQueryOptions,
  });
  const formatted = isHidden
    ? "******"
    : formatWalletAmountFromUsd(user?.balance || "0", {
        balanceCurrency: depositConfig?.balanceCurrency,
        usdRateByCurrency: depositConfig?.usdRateByCurrency,
        currencySymbolByCode: depositConfig?.currencySymbolByCode,
      }, { withCode: false });
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/70 px-2 py-1 text-xs font-bold text-primary",
        className,
      )}
      data-testid="hud-balance"
    >
      <Wallet className="h-3.5 w-3.5" />
      <span>{formatted}</span>
    </div>
  );
}

/**
 * Simple timer pill — pass formatted display from useGameTimer().
 */
export function GameHUDTimer({
  display,
  low,
  active,
  className,
}: {
  display: string;
  low?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-mono font-bold tabular-nums transition-colors",
        active ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 bg-card/70 text-muted-foreground",
        low && active && "border-destructive/60 bg-destructive/10 text-destructive animate-pulse",
        className,
      )}
      data-testid="hud-timer"
      aria-live={low && active ? "polite" : "off"}
    >
      <Clock className="h-3.5 w-3.5" />
      <span>{display}</span>
    </div>
  );
}

/**
 * Score / points pill. Shows two values with a separator (e.g. "120 : 80").
 */
export function GameHUDScore({
  left,
  right,
  label,
  className,
}: {
  left: number | string;
  right?: number | string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400",
        className,
      )}
      data-testid="hud-score"
      aria-label={label}
    >
      <Trophy className="h-3.5 w-3.5" />
      <span className="tabular-nums">{left}</span>
      {right !== undefined && (
        <>
          <span className="opacity-60">:</span>
          <span className="tabular-nums">{right}</span>
        </>
      )}
    </div>
  );
}
