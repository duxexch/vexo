import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useBalance } from "@/hooks/useBalance";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Wallet } from "lucide-react";

interface BalanceDisplayProps {
  /** Raw balance string from user object (e.g. "125.50") */
  balance: string;
  /** Display variant */
  variant?: "sidebar" | "header" | "compact";
  /** Show deposit button */
  showDeposit?: boolean;
}

export function BalanceDisplay({
  balance,
  variant = "header",
  showDeposit = false,
}: BalanceDisplayProps) {
  const { t } = useI18n();
  const { isHidden, toggle } = useBalance();

  const formatted = isHidden ? "******" : `$${parseFloat(balance || "0").toFixed(2)}`;

  if (variant === "sidebar") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t("common.balance")}</span>
        <div className="flex items-center gap-1">
          <span className="font-bold text-primary balance-glow" data-testid="text-balance">
            {formatted}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggle}
            aria-label={isHidden ? "Show balance" : "Hide balance"}
            data-testid="button-sidebar-toggle-balance"
          >
            {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-primary text-sm" data-testid="text-compact-balance">
          {formatted}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={toggle} aria-label={isHidden ? "Show balance" : "Hide balance"}>
          {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      </div>
    );
  }

  // Default: header variant
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-card rounded-lg border text-[13px] font-extrabold">
      <Wallet className="h-4 w-4 text-primary" />
      <span className="text-sm text-muted-foreground">{t("common.balance")}:</span>
      <span className="font-bold text-primary" data-testid="text-header-balance">
        {formatted}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={toggle}
        aria-label={isHidden ? "Show balance" : "Hide balance"}
        data-testid="button-toggle-balance"
      >
        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      {showDeposit && (
        <Link href="/wallet">
          <Button size="sm" data-testid="button-quick-deposit">
            {t("common.deposit")}
          </Button>
        </Link>
      )}
    </div>
  );
}
