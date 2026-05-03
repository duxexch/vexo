import type { ComponentType, ReactNode } from "react";
import { CheckCircle2, BadgeCheck, Clock3, ExternalLink, History, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Trade = {
    id: string;
    status: string;
    role: "buyer" | "seller";
    amount: number;
    currency: string;
    fee: number;
    completedAt: string;
    settlementId: string;
    counterparty: {
        username: string;
        verified: boolean;
        reliabilityLabel: string;
    };
    trust: {
        completionRate: number;
    };
    runtime?: {
        escrowState?: string;
        ledgerState?: string;
        idempotencyConfirmed?: boolean;
        finalityHash?: string;
        ledgerCommitId?: string;
        escrowReleaseTx?: string;
    };
};

export interface TradeCompletionScreenProps {
    trade: Trade | null | undefined;
    onGoToDashboard: () => void;
    onRateCounterparty: () => void;
    onViewHistory: () => void;
    onDone?: () => void;
    disputeResolved?: boolean;
    disputeOutcome?: "full_release" | "full_refund" | "partial_settlement";
    partialSettlement?: {
        releasedAmount: number;
        refundedAmount: number;
        currency?: string;
    };
    className?: string;
}

function formatCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function formatCompletionRate(rate: number): string {
    return `${Math.max(0, Math.min(rate, 100)).toFixed(1)}%`;
}

function MaskedSettlementId({ settlementId }: { settlementId: string }) {
    const visiblePrefix = settlementId.slice(0, 8);
    const visibleSuffix = settlementId.slice(-2);
    return <span>{`${visiblePrefix}••••${visibleSuffix}`}</span>;
}

export function TradeCompletionScreen({
    trade,
    onGoToDashboard,
    onRateCounterparty,
    onViewHistory,
    onDone,
    disputeResolved = false,
    disputeOutcome,
    partialSettlement,
    className,
}: TradeCompletionScreenProps) {
    if (!trade) {
        return null;
    }

    if (
        trade.status !== "completed"
        || trade.runtime?.escrowState !== "released"
        || trade.runtime?.ledgerState !== "committed"
        || trade.runtime?.idempotencyConfirmed !== true
        || !trade.runtime?.finalityHash
        || !trade.runtime?.ledgerCommitId
        || !trade.runtime?.escrowReleaseTx
    ) {
        return null;
    }

    const amountLabel = formatCurrency(trade.amount, trade.currency);
    const feeLabel = formatCurrency(trade.fee, trade.currency);
    const settlementCurrency = partialSettlement?.currency || trade.currency;
    const hasPartialSettlement = disputeOutcome === "partial_settlement" || Boolean(partialSettlement);

    const handleAction = (action: () => void) => {
        action();
        onDone?.();
    };

    return (
        <div className={cn("min-h-[100svh] bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-3 py-4 text-slate-950 dark:from-emerald-950/20 dark:via-slate-950 dark:to-slate-950 sm:px-6 sm:py-8", className)}>
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                {disputeResolved && (
                    <div className="flex items-center gap-2">
                        <Badge className="rounded-full bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-600">
                            Dispute resolved
                        </Badge>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Final outcome
                        </span>
                    </div>
                )}

                <Card className="overflow-hidden border-emerald-200/80 bg-white/95 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.35)] dark:border-emerald-900/60 dark:bg-slate-950/90">
                    <CardContent className="p-4 sm:p-6">
                        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                            <section className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                                        <CheckCircle2 className="h-8 w-8" />
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                            Trade Completed Successfully
                                        </h1>
                                        <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300 sm:text-base">
                                            {trade.role === "buyer"
                                                ? "Payment confirmed. Funds released."
                                                : "Funds received and trade settled."}
                                        </p>
                                        <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                                            This trade is finalized and cannot be modified.
                                        </p>
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                            Amount
                                        </div>
                                        <div className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                            {amountLabel}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                            <span className="rounded-full bg-slate-200/70 px-2.5 py-1 font-medium dark:bg-slate-800">
                                                {trade.role === "buyer" ? "Buyer" : "Seller"}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {formatDateTime(trade.completedAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                            Receipt
                                        </div>
                                        <div className="mt-3 space-y-2 text-sm">
                                            <Row label="Trade ID" value={trade.id} />
                                            <Row label="Fee" value={feeLabel} />
                                            <Row label="Settlement ID" value={<MaskedSettlementId settlementId={trade.settlementId} />} />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                        Finality
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <FinalityItem icon={ShieldCheck} label="Funds released" />
                                        <FinalityItem icon={BadgeCheck} label="Transaction recorded" />
                                        <FinalityItem icon={BadgeCheck} label="Balance updated" />
                                        {disputeResolved ? (
                                            <FinalityItem icon={BadgeCheck} label={disputeOutcomeLabel(disputeOutcome)} />
                                        ) : null}
                                    </div>
                                </div>

                                {hasPartialSettlement && partialSettlement ? (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                                            Partial settlement
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <Row label="Released amount" value={formatCurrency(partialSettlement.releasedAmount, settlementCurrency)} compact />
                                            <Row label="Refunded amount" value={formatCurrency(partialSettlement.refundedAmount, settlementCurrency)} compact />
                                        </div>
                                    </div>
                                ) : null}
                            </section>

                            <aside className="space-y-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                        Trust updated
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                                            <Star className="h-5 w-5 fill-current" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                                Completion rate
                                            </div>
                                            <div className="text-2xl font-bold text-slate-950 dark:text-white">
                                                {formatCompletionRate(trade.trust.completionRate)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                        Counterparty
                                    </div>
                                    <div className="mt-3 flex items-start gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                            <span className="text-sm font-bold">@</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-slate-950 dark:text-white">
                                                    {trade.counterparty.username}
                                                </span>
                                                {trade.counterparty.verified ? (
                                                    <Badge className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-white hover:bg-emerald-600">
                                                        Verified
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                {trade.counterparty.reliabilityLabel}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                        Actions
                                    </div>
                                    <div className="mt-3 flex flex-col gap-2">
                                        <Button
                                            className="min-h-11 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                                            onClick={() => handleAction(onGoToDashboard)}
                                            data-testid="button-go-dashboard"
                                        >
                                            Go to Dashboard
                                            <ExternalLink className="ms-2 h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="min-h-11 w-full rounded-xl"
                                            onClick={() => handleAction(onRateCounterparty)}
                                            data-testid="button-rate-counterparty"
                                        >
                                            Rate Counterparty
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="min-h-11 w-full rounded-xl"
                                            onClick={() => handleAction(onViewHistory)}
                                            data-testid="button-view-history"
                                        >
                                            View History
                                            <History className="ms-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </CardContent>
                </Card>

                <div className="sticky bottom-0 z-10 -mx-3 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:mx-0 sm:hidden sm:border-none sm:bg-transparent sm:p-0">
                    <Button
                        className="min-h-12 w-full rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => handleAction(onDone || onGoToDashboard)}
                        data-testid="button-done"
                    >
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}

function Row({
    label,
    value,
    compact = false,
}: {
    label: string;
    value: ReactNode;
    compact?: boolean;
}) {
    return (
        <div className={cn("flex items-center justify-between gap-3", compact ? "text-sm" : "text-sm")}>
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="font-medium text-slate-950 dark:text-white">{value}</span>
        </div>
    );
}

function FinalityItem({
    icon: Icon,
    label,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
}) {
    return (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 dark:border-emerald-900/60 dark:bg-slate-950 dark:text-slate-100">
            <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>{label}</span>
        </div>
    );
}

function disputeOutcomeLabel(outcome?: "full_release" | "full_refund" | "partial_settlement"): string {
    if (outcome === "full_release") return "Full release";
    if (outcome === "full_refund") return "Full refund";
    if (outcome === "partial_settlement") return "Partial settlement";
    return "Dispute resolved";
}

export default TradeCompletionScreen;
