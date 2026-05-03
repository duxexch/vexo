import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Check, Clock, Eye, MoreVertical, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useUnreadAlertEntities, useMarkAlertReadByEntity } from "@/hooks/use-admin-alert-counts";
import { useI18n } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";

export interface P2PTrade {
    id: string;
    buyerUsername?: string;
    sellerUsername?: string;
    amount?: string;
    totalPrice?: string;
    status: string;
    createdAt?: string;
    [key: string]: unknown;
}

export interface P2PDispute {
    id: string;
    status: string;
    tradeAmount?: string;
    initiatorUsername?: string;
    respondentUsername?: string;
    initiatorName?: string;
    respondentName?: string;
    reason?: string;
    createdAt?: string;
    [key: string]: unknown;
}

type P2PActionDialog =
    | "resolveDispute"
    | "viewTrade"
    | "viewDispute"
    | "escalateDispute"
    | "closeDispute"
    | "viewLogs"
    | null;

export function useP2PTradeDisputeData(searchQuery: string, disputeStatus: string, disputeSortBy: string) {
    const { data: unreadData } = useUnreadAlertEntities("/admin/p2p");
    const unreadEntityIds = useMemo(() => new Set(unreadData?.entityIds || []), [unreadData?.entityIds]);
    const markAlertRead = useMarkAlertReadByEntity();

    const { data: trades = [], isLoading: tradesLoading } = useQuery<P2PTrade[]>({
        queryKey: ["/api/admin/p2p/trades"],
        queryFn: () => adminFetch("/api/admin/p2p/trades") as Promise<P2PTrade[]>,
    });

    const { data: disputes = [], isLoading: disputesLoading } = useQuery<P2PDispute[]>({
        queryKey: ["/api/admin/p2p/disputes", disputeStatus, disputeSortBy],
        queryFn: () => adminFetch(`/api/admin/p2p/disputes?status=${disputeStatus}&sortBy=${disputeSortBy}`) as Promise<P2PDispute[]>,
        refetchInterval: 15000,
    });

    const filteredTrades = useMemo(() => {
        return trades.filter((trade) =>
            trade.buyerUsername?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            trade.sellerUsername?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [trades, searchQuery]);

    const openDisputesCount = useMemo(() => disputes.filter((dispute) => dispute.status === "open").length, [disputes]);
    const investigatingDisputesCount = useMemo(() => disputes.filter((dispute) => dispute.status === "investigating").length, [disputes]);
    const resolvedDisputesCount = useMemo(() => disputes.filter((dispute) => dispute.status === "resolved").length, [disputes]);

    return {
        trades,
        tradesLoading,
        disputes,
        disputesLoading,
        filteredTrades,
        unreadEntityIds,
        markAlertRead,
        openDisputesCount,
        investigatingDisputesCount,
        resolvedDisputesCount,
    };
}

export function useP2PTradeDisputeActions() {
    const { toast } = useToast();
    const { t } = useI18n();
    const [actionDialog, setActionDialog] = useState<P2PActionDialog>(null);
    const [actionReason, setActionReason] = useState("");
    const [resolution, setResolution] = useState("");
    const [selectedTrade, setSelectedTrade] = useState<P2PTrade | P2PDispute | null>(null);
    const [liveUpdateHighlight, setLiveUpdateHighlight] = useState<string | null>(null);

    const closeDialog = useCallback(() => {
        setActionDialog(null);
        setSelectedTrade(null);
        setActionReason("");
        setResolution("");
    }, []);

    const handleDisputeAlert = useCallback((alert: { entityType?: string; entityId?: string; title?: string; message?: string; severity?: string }) => {
        if (alert.entityType !== "p2p_dispute") return;

        queryClient.invalidateQueries({
            predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/p2p/disputes",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/stats"] });

        toast({
            title: alert.title || t("admin.p2p.disputes.updateTitle"),
            description: alert.message || t("admin.p2p.disputes.updateDescription"),
            variant: alert.severity === "critical" ? "destructive" : "default",
        });

        if (alert.entityId) {
            setLiveUpdateHighlight(alert.entityId);
            setTimeout(() => setLiveUpdateHighlight(null), 5000);
        }
    }, [t, toast]);

    return {
        actionDialog,
        actionReason,
        resolution,
        selectedTrade,
        liveUpdateHighlight,
        setActionDialog,
        setActionReason,
        setResolution,
        setSelectedTrade,
        setLiveUpdateHighlight,
        closeDialog,
        handleDisputeAlert,
    };
}

type BadgeVariant = "default" | "destructive" | "secondary" | "outline";

export function P2PTradeCard({
    trade,
    hasUnreadAlert,
    onView,
    buttonClassName,
    getStatusColor,
    getStatusLabel,
    t,
}: {
    trade: P2PTrade;
    hasUnreadAlert: boolean;
    onView: () => void;
    buttonClassName: string;
    getStatusColor: (status: string) => BadgeVariant;
    getStatusLabel: (status: string) => string;
    t: (key: string) => string;
}) {
    return (
        <Card className={`${surfaceCardClass} transition-colors ${hasUnreadAlert ? "border-s-2 border-s-primary/40 bg-primary/5" : (trade.status === "pending" || trade.status === "awaiting_payment" ? "border-s-2 border-s-yellow-500/50 bg-yellow-500/5" : "")}`}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-full bg-primary/10">
                            <ArrowLeftRight className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{trade.buyerUsername}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-semibold">{trade.sellerUsername}</span>
                                <Badge variant={getStatusColor(trade.status)}>{getStatusLabel(trade.status)}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">{trade.amount} @ ${trade.totalPrice} total</div>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" className={buttonClassName} onClick={onView}>
                        <Eye className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

const disputeVariantMap: Partial<Record<P2PDispute["status"], "default" | "destructive" | "secondary" | "outline">> = {
    open: "destructive",
    investigating: "secondary",
    resolved: "default",
    closed: "outline",
};

const getDisputeBadgeVariant = (status: P2PDispute["status"]): BadgeVariant => disputeVariantMap[status] ?? "outline";

export function P2PDisputeCard({
    dispute,
    hasUnreadAlert,
    liveUpdateHighlight,
    onView,
    onViewLogs,
    onResolve,
    onClose,
    onEscalate,
    buttonClassName,
    getDisputeStatusPillClass,
    getStatusLabel,
    t,
    markRead,
}: {
    dispute: P2PDispute;
    hasUnreadAlert: boolean;
    liveUpdateHighlight: string | null;
    onView: () => void;
    onViewLogs: () => void;
    onResolve: () => void;
    onClose: () => void;
    onEscalate: () => void;
    buttonClassName: string;
    getDisputeStatusPillClass: (status: string) => string;
    getStatusLabel: (status: string) => string;
    t: (key: string, values?: Record<string, unknown>) => string;
    markRead: () => void;
}) {
    return (
        <Card className={`${surfaceCardClass} transition-colors ${hasUnreadAlert ? "border-s-2 border-s-amber-500 bg-amber-50/80 dark:bg-amber-500/10" : ""} ${liveUpdateHighlight === dispute.id ? "ring-2 ring-amber-400/70" : ""}`}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${dispute.status === "open" ? "bg-red-500/10" : dispute.status === "investigating" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                            <AlertTriangle className={`h-5 w-5 ${dispute.status === "open" ? "text-red-500" : dispute.status === "investigating" ? "text-amber-500" : "text-emerald-500"}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-foreground">{t("admin.p2p.disputes.itemLabel", { id: dispute.id.slice(0, 8) })}</span>
                                <Badge variant={getDisputeBadgeVariant(dispute.status)}>{getStatusLabel(dispute.status)}</Badge>
                                {dispute.tradeAmount && (
                                    <Badge variant="outline" className="border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                                        ${dispute.tradeAmount}
                                    </Badge>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground">{dispute.initiatorName} vs {dispute.respondentName}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                {t("p2p.dispute.reason")}: {dispute.reason?.slice(0, 50)}{(dispute.reason?.length ?? 0) > 50 ? "..." : ""}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {dispute.status === "open" && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className={`${buttonClassName} border-amber-400/70 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20`}
                                onClick={onEscalate}
                                data-testid={`button-escalate-${dispute.id}`}
                            >
                                <TrendingUp className="h-4 w-4 me-1" />
                                {t("admin.p2p.disputes.escalate")}
                            </Button>
                        )}
                        {(dispute.status === "open" || dispute.status === "investigating") && (
                            <>
                                <Button
                                    size="sm"
                                    className="rounded-xl border border-amber-500 bg-gradient-to-b from-amber-300 to-yellow-500 text-slate-950 shadow-[0_8px_0_0_rgba(176,142,35,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(176,142,35,0.45)] hover:brightness-105"
                                    onClick={onResolve}
                                    data-testid={`button-resolve-${dispute.id}`}
                                >
                                    <Check className="h-4 w-4 me-1" />
                                    {t("admin.p2p.disputes.resolve")}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className={buttonClassName}
                                    onClick={onClose}
                                    data-testid={`button-close-${dispute.id}`}
                                >
                                    <X className="h-4 w-4 me-1" />
                                    {t("common.close")}
                                </Button>
                            </>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className={buttonClassName} data-testid={`button-dispute-actions-${dispute.id}`}>
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { if (hasUnreadAlert) markRead(); onView(); }}>
                                    <Eye className="h-4 w-4 me-2" />
                                    {t("common.view")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onViewLogs}>
                                    <Clock className="h-4 w-4 me-2" />
                                    {t("admin.p2p.disputes.viewAuditLog")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

const surfaceCardClass = "rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
