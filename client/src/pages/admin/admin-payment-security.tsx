import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    ShieldAlert,
    ShieldCheck,
    Ban,
    Search,
    RefreshCw,
    Activity,
    AlertTriangle,
    Eye,
    Users,
    BarChart3,
    Clock3,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function getAdminToken() {
    return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
    const token = getAdminToken();
    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-admin-token": token || "",
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
    }

    return res.json();
}

type RiskLevel = "low" | "medium" | "high" | "critical";

interface BlockedIpRow {
    id: string;
    ipAddress: string;
    isActive: boolean;
    blockReason: string;
    autoBlocked: boolean;
    blockedAt: string;
    unblockedAt?: string | null;
}

interface UsageRow {
    ipAddress: string;
    distinctUsers: number;
    operationsCount: number;
    operationTypesCount: number;
    tokenFailures: number;
    pendingTokens: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    isBlocked: boolean;
    blockedReason: string | null;
    blockedAt: string | null;
    autoBlocked: boolean | null;
    riskScore: number;
    riskLevel: RiskLevel;
    riskReasons: string[];
    recommendedAction: "allow" | "monitor" | "review" | "block" | "blocked";
}

interface OverviewResponse {
    windowHours: number;
    activeBlocks: number;
    autoBlocks: number;
    manualBlocks: number;
    uniqueIps: number;
    uniqueAccounts: number;
    operationsCount: number;
    lastActivityAt: string | null;
    mediumRiskIps: number;
    highRiskIps: number;
    criticalRiskIps: number;
}

interface IpDetailsResponse {
    ipAddress: string;
    windowHours: number;
    metrics: {
        distinctUsers: number;
        operationsCount: number;
        operationTypesCount: number;
        tokenFailures: number;
        pendingTokens: number;
        firstSeenAt: string | null;
        lastSeenAt: string | null;
        riskScore: number;
        riskLevel: RiskLevel;
        riskReasons: string[];
        recommendedAction: "allow" | "monitor" | "review" | "block" | "blocked";
    };
    block: {
        isActive: boolean;
        blockReason: string;
        autoBlocked: boolean;
        blockedAt: string | null;
        unblockedAt: string | null;
        metadata: string | null;
    } | null;
    operationsByType: Array<{ operation: string; count: number }>;
    usersByActivity: Array<{
        userId: string;
        username: string;
        nickname: string | null;
        accountId: string | null;
        operationsCount: number;
        lastSeenAt: string | null;
    }>;
    recentActivities: Array<{
        createdAt: string | null;
        operation: string;
        requestPath: string;
        operationToken: string | null;
        userId: string;
        username: string;
        nickname: string | null;
        accountId: string | null;
    }>;
    tokenStatusSummary: {
        pending: number;
        completed: number;
        failed: number;
        cancelled: number;
        expired: number;
    };
    recentTokenEvents: Array<{
        token: string;
        operation: string;
        status: string;
        failureReason: string | null;
        createdAt: string | null;
        finalizedAt: string | null;
        userId: string;
        username: string;
        nickname: string | null;
        accountId: string | null;
    }>;
}

interface PaymentSecurityConfigResponse {
    mode: "auto_block" | "notify_only";
    autoBlockEnabled: boolean;
    notifyOnly: boolean;
    allowManualBlock: boolean;
}

const WINDOW_OPTIONS = [
    { value: "24", label: "24h" },
    { value: "72", label: "72h" },
    { value: "168", label: "7d" },
    { value: "720", label: "30d" },
];

const SURFACE_CARD_CLASS = "overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/75";
const STAT_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-4 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/80";
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} shadow-[0_18px_45px_-28px_rgba(15,23,42,0.28)]`;
const BUTTON_3D_CLASS = "inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.6)] transition-all hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const BUTTON_3D_PRIMARY_CLASS = "inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_-18px_rgba(14,116,144,0.65)] transition-all hover:-translate-y-0.5 hover:brightness-105";
const BUTTON_3D_DESTRUCTIVE_CLASS = "inline-flex items-center justify-center rounded-2xl border border-destructive/20 bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground shadow-[0_14px_30px_-18px_rgba(190,24,93,0.6)] transition-all hover:-translate-y-0.5 hover:brightness-105";
const INPUT_SURFACE_CLASS = "rounded-2xl border-slate-200/80 bg-white/90 shadow-inner shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/70 dark:shadow-black/20";
const TABS_LIST_CLASS = "h-auto w-full justify-start gap-2 overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white/80 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70";
const DIALOG_SURFACE_CLASS = "max-w-6xl rounded-[30px] border border-slate-200/80 bg-white/95 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/95";

function formatDateTime(value?: string | null): string {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function riskBadgeVariant(level: RiskLevel): "default" | "secondary" | "destructive" | "outline" {
    if (level === "critical" || level === "high") return "destructive";
    if (level === "medium") return "secondary";
    return "outline";
}

function riskSurfaceClass(level: RiskLevel): string {
    if (level === "critical") return "border-rose-200 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/35";
    if (level === "high") return "border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/35";
    if (level === "medium") return "border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/50 dark:bg-cyan-950/35";
    return "border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60";
}

export default function AdminPaymentSecurityPage() {
    const { toast } = useToast();

    const [manualIp, setManualIp] = useState("");
    const [manualReason, setManualReason] = useState("Manual payment fraud block");
    const [search, setSearch] = useState("");
    const [windowHours, setWindowHours] = useState("72");
    const [activeOnlyBlocks, setActiveOnlyBlocks] = useState(true);
    const [flaggedOnly, setFlaggedOnly] = useState(true);
    const [selectedIpForDetails, setSelectedIpForDetails] = useState<string | null>(null);

    const parsedWindowHours = Math.max(1, Number(windowHours) || 72);

    const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<OverviewResponse>({
        queryKey: ["/api/admin/payment-security/overview", parsedWindowHours],
        queryFn: () => adminFetch(`/api/admin/payment-security/overview?windowHours=${parsedWindowHours}`),
    });

    const { data: securityConfig, isLoading: securityConfigLoading } = useQuery<PaymentSecurityConfigResponse>({
        queryKey: ["/api/admin/payment-security/config"],
        queryFn: () => adminFetch("/api/admin/payment-security/config"),
    });

    const { data: blockedIps, isLoading: blockedLoading, refetch: refetchBlocked } = useQuery<BlockedIpRow[]>({
        queryKey: ["/api/admin/payment-security/blocked-ips", activeOnlyBlocks, search],
        queryFn: () => adminFetch(
            `/api/admin/payment-security/blocked-ips?activeOnly=${activeOnlyBlocks}&limit=500&q=${encodeURIComponent(search)}`,
        ),
    });

    const { data: usageRows, isLoading: usageLoading, refetch: refetchUsage } = useQuery<UsageRow[]>({
        queryKey: ["/api/admin/payment-security/ip-usage", parsedWindowHours, flaggedOnly, search],
        queryFn: () => adminFetch(
            `/api/admin/payment-security/ip-usage?windowHours=${parsedWindowHours}&limit=500&flaggedOnly=${flaggedOnly}&q=${encodeURIComponent(search)}`,
        ),
    });

    const { data: selectedIpDetails, isLoading: selectedIpLoading } = useQuery<IpDetailsResponse>({
        queryKey: ["/api/admin/payment-security/ip/details", selectedIpForDetails, parsedWindowHours],
        queryFn: () => adminFetch(
            `/api/admin/payment-security/ip/${encodeURIComponent(selectedIpForDetails || "")}/details?windowHours=${parsedWindowHours}&recentLimit=60`,
        ),
        enabled: Boolean(selectedIpForDetails),
    });

    const blockIpMutation = useMutation({
        mutationFn: (payload: { ipAddress: string; reason: string }) => adminFetch("/api/admin/payment-security/blocked-ips/block", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
        onSuccess: () => {
            setManualIp("");
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/blocked-ips"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/ip-usage"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/overview"] });
            if (selectedIpForDetails) {
                queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/ip/details", selectedIpForDetails] });
            }
            toast({ title: "IP blocked", description: "The IP is now blocked for payment operations." });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const unblockIpMutation = useMutation({
        mutationFn: (ipAddress: string) => adminFetch(`/api/admin/payment-security/blocked-ips/${encodeURIComponent(ipAddress)}/unblock`, {
            method: "POST",
            body: JSON.stringify({ reason: "Manual unblock from admin panel" }),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/blocked-ips"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/ip-usage"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/overview"] });
            if (selectedIpForDetails) {
                queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/ip/details", selectedIpForDetails] });
            }
            toast({ title: "IP unblocked", description: "Payment operations are re-enabled for this IP." });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const modeMutation = useMutation({
        mutationFn: (mode: "auto_block" | "notify_only") => adminFetch("/api/admin/payment-security/config", {
            method: "PATCH",
            body: JSON.stringify({ mode }),
        }),
        onSuccess: (updated: PaymentSecurityConfigResponse) => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/config"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/overview"] });
            toast({
                title: "Payment security mode updated",
                description: updated.mode === "auto_block"
                    ? "Automatic blocking is now ON."
                    : "Notify-only mode is ON. Manual blocking remains available.",
            });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const allUsageRows = usageRows || [];
    const allBlockedIps = blockedIps || [];
    const loading = overviewLoading || blockedLoading || usageLoading;

    const riskStats = useMemo(() => {
        const medium = allUsageRows.filter((row) => row.riskScore >= 35).length;
        const high = allUsageRows.filter((row) => row.riskScore >= 60).length;
        const critical = allUsageRows.filter((row) => row.riskScore >= 80).length;
        return { medium, high, critical };
    }, [allUsageRows]);

    const onManualBlock = () => {
        if (!manualIp.trim()) return;
        blockIpMutation.mutate({
            ipAddress: manualIp.trim(),
            reason: manualReason.trim() || "Manual payment fraud block",
        });
    };

    const onQuickBlock = (row: UsageRow) => {
        const reason = row.riskReasons.length
            ? `Risk ${row.riskScore}/100 (${row.riskLevel}): ${row.riskReasons.join("; ")}`
            : `Risk ${row.riskScore}/100 (${row.riskLevel})`;
        blockIpMutation.mutate({ ipAddress: row.ipAddress, reason });
    };

    const refreshAll = async () => {
        await Promise.all([refetchOverview(), refetchBlocked(), refetchUsage()]);
    };

    const currentMode = securityConfig?.mode ?? "auto_block";
    const isNotifyOnlyMode = currentMode === "notify_only";

    const onToggleSecurityMode = () => {
        const nextMode: "auto_block" | "notify_only" = isNotifyOnlyMode ? "auto_block" : "notify_only";
        modeMutation.mutate(nextMode);
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 pb-8 sm:p-6">
            <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(244,63,94,0.16),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.94))] p-5 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,_rgba(251,113,133,0.14),_transparent_32%),linear-gradient(135deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.92))]">
                <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-4">
                        <Badge variant="outline" className="w-fit rounded-full border-rose-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                            Payment Security
                        </Badge>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Payment Security IP Control</h1>
                            <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                                Smarter multi-account monitoring, risk scoring, and stronger global payment IP block controls.
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="payment-security-mode-caption">
                                Mode: {isNotifyOnlyMode ? "Notify Only (manual decisions)" : "Auto Block + Manual"}
                            </p>
                        </div>
                    </div>

                    <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[420px]">
                        <Button
                            type="button"
                            className={cn(isNotifyOnlyMode ? BUTTON_3D_CLASS : BUTTON_3D_PRIMARY_CLASS, "w-full gap-2")}
                            onClick={onToggleSecurityMode}
                            disabled={modeMutation.isPending || securityConfigLoading}
                            data-testid="button-toggle-payment-security-mode"
                        >
                            {isNotifyOnlyMode ? (
                                <Eye className="h-4 w-4" />
                            ) : (
                                <ShieldAlert className="h-4 w-4" />
                            )}
                            {isNotifyOnlyMode ? "Switch to Auto Block" : "Switch to Notify Only"}
                        </Button>
                        <Button className={cn(BUTTON_3D_CLASS, "w-full gap-2")} onClick={refreshAll} data-testid="button-refresh-ip-security">
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </Button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Card className={STAT_CARD_CLASS}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Active Blocks</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-2xl font-bold">{overview?.activeBlocks ?? allBlockedIps.length}</p>
                            <p className="text-xs text-muted-foreground">
                                Auto: {overview?.autoBlocks ?? 0} • Manual: {overview?.manualBlocks ?? 0}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className={STAT_CARD_CLASS}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Distinct Accounts</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-2xl font-bold">{overview?.uniqueAccounts ?? 0}</p>
                            <p className="text-xs text-muted-foreground">IPs: {overview?.uniqueIps ?? 0}</p>
                        </CardContent>
                    </Card>

                    <Card className={STAT_CARD_CLASS}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Payment Operations</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-2xl font-bold">{overview?.operationsCount ?? 0}</p>
                            <p className="text-xs text-muted-foreground">Window: {parsedWindowHours}h</p>
                        </CardContent>
                    </Card>

                    <Card className={STAT_CARD_CLASS}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risk Snapshot</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-sm font-medium">Critical: {overview?.criticalRiskIps ?? riskStats.critical}</p>
                            <p className="text-xs text-muted-foreground">
                                High: {overview?.highRiskIps ?? riskStats.high} • Medium+: {overview?.mediumRiskIps ?? riskStats.medium}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <Card className={DATA_CARD_CLASS}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Ban className="h-5 w-5" /> Manual Global IP Block
                    </CardTitle>
                    <CardDescription>
                        Immediately block a suspicious IP from deposit, withdraw, conversion, and P2P payment operations.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="manual-ip">IP Address</Label>
                            <Input
                                id="manual-ip"
                                value={manualIp}
                                onChange={(e) => setManualIp(e.target.value)}
                                placeholder="e.g. 203.0.113.18"
                                className={INPUT_SURFACE_CLASS}
                                data-testid="input-manual-ip"
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="manual-reason">Reason</Label>
                            <Input
                                id="manual-reason"
                                value={manualReason}
                                onChange={(e) => setManualReason(e.target.value)}
                                placeholder="fraud ring / account farming / abuse pattern"
                                className={INPUT_SURFACE_CLASS}
                                data-testid="input-manual-reason"
                            />
                        </div>
                    </div>
                    <div className="mt-3">
                        <Button
                            className={cn(BUTTON_3D_DESTRUCTIVE_CLASS, "gap-2")}
                            onClick={onManualBlock}
                            disabled={blockIpMutation.isPending || !manualIp.trim()}
                            data-testid="button-manual-block-ip"
                        >
                            <ShieldAlert className="h-4 w-4" /> Block IP
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className={DATA_CARD_CLASS}>
                <CardContent className="pt-6">
                    <div className="grid gap-3 md:grid-cols-12">
                        <div className="relative md:col-span-6">
                            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by IP or block reason"
                                className={`${INPUT_SURFACE_CLASS} ps-9`}
                                data-testid="input-search-ip-security"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <Select value={windowHours} onValueChange={setWindowHours}>
                                <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-window-hours">
                                    <SelectValue placeholder="Window" />
                                </SelectTrigger>
                                <SelectContent>
                                    {WINDOW_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-4 flex items-center gap-2 justify-start md:justify-end">
                            <Button
                                type="button"
                                className={cn(flaggedOnly ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS, "gap-2")}
                                onClick={() => setFlaggedOnly((prev) => !prev)}
                                data-testid="button-toggle-flagged-only"
                            >
                                <AlertTriangle className="h-4 w-4" /> Flagged Only
                            </Button>
                            <Button
                                type="button"
                                className={cn(activeOnlyBlocks ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS, "gap-2")}
                                onClick={() => setActiveOnlyBlocks((prev) => !prev)}
                                data-testid="button-toggle-active-only-blocks"
                            >
                                <Ban className="h-4 w-4" /> Active Blocks
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="usage" className="space-y-4">
                <TabsList className={TABS_LIST_CLASS}>
                    <TabsTrigger value="usage" className="min-w-[170px] flex-none rounded-2xl">IP Risk Intelligence</TabsTrigger>
                    <TabsTrigger value="blocked" className="min-w-[170px] flex-none rounded-2xl">Global Block Control</TabsTrigger>
                </TabsList>

                <TabsContent value="usage">
                    <Card className={DATA_CARD_CLASS}>
                        <CardHeader>
                            <CardTitle>Payment IP Usage Intelligence</CardTitle>
                            <CardDescription>
                                Multi-account correlation, operation diversity, token-failure tracking, and risk recommendations.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Loading...</p>
                            ) : allUsageRows.length === 0 ? (
                                <div className="rounded-[24px] border border-dashed border-slate-300/90 bg-slate-50/70 py-12 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/50">
                                    No payment IP activity found for this filter set.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="space-y-3 lg:hidden">
                                        {allUsageRows.map((row) => (
                                            <div key={row.ipAddress} className={cn(STAT_CARD_CLASS, riskSurfaceClass(row.riskLevel))}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{row.ipAddress}</p>
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <Badge variant={riskBadgeVariant(row.riskLevel)}>
                                                                {row.riskLevel.toUpperCase()} • {row.riskScore}
                                                            </Badge>
                                                            {row.isBlocked ? <Badge variant="destructive">Blocked</Badge> : <Badge variant="outline">Allowed</Badge>}
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline">{row.recommendedAction}</Badge>
                                                </div>
                                                {row.riskReasons[0] && (
                                                    <p className="mt-3 text-xs text-muted-foreground">{row.riskReasons[0]}</p>
                                                )}
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                    <div>Accounts: <span className="font-semibold text-foreground">{row.distinctUsers}</span></div>
                                                    <div>Ops: <span className="font-semibold text-foreground">{row.operationsCount}</span></div>
                                                    <div>Types: <span className="font-semibold text-foreground">{row.operationTypesCount}</span></div>
                                                    <div>Token Fails: <span className="font-semibold text-foreground">{row.tokenFailures}</span></div>
                                                    <div className="col-span-2">Last Seen: <span className="font-semibold text-foreground">{formatDateTime(row.lastSeenAt)}</span></div>
                                                </div>
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <Button
                                                        className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                        onClick={() => setSelectedIpForDetails(row.ipAddress)}
                                                        data-testid={`button-investigate-${row.ipAddress}`}
                                                    >
                                                        <Eye className="h-4 w-4" /> Inspect
                                                    </Button>
                                                    {row.isBlocked ? (
                                                        <Button
                                                            className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                            onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                            disabled={unblockIpMutation.isPending}
                                                            data-testid={`button-usage-unblock-${row.ipAddress}`}
                                                        >
                                                            <ShieldCheck className="h-4 w-4" /> Unblock
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            className={cn(BUTTON_3D_DESTRUCTIVE_CLASS, "h-9 gap-2 text-xs")}
                                                            onClick={() => onQuickBlock(row)}
                                                            disabled={blockIpMutation.isPending}
                                                            data-testid={`button-usage-block-${row.ipAddress}`}
                                                        >
                                                            <ShieldAlert className="h-4 w-4" /> Block
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="hidden overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60 lg:block">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>IP</TableHead>
                                                    <TableHead>Accounts</TableHead>
                                                    <TableHead>Ops</TableHead>
                                                    <TableHead>Types</TableHead>
                                                    <TableHead>Token Fails</TableHead>
                                                    <TableHead>Risk</TableHead>
                                                    <TableHead>Last Seen</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {allUsageRows.map((row) => (
                                                    <TableRow key={row.ipAddress}>
                                                        <TableCell className="font-mono text-xs">{row.ipAddress}</TableCell>
                                                        <TableCell>{row.distinctUsers}</TableCell>
                                                        <TableCell>{row.operationsCount}</TableCell>
                                                        <TableCell>{row.operationTypesCount}</TableCell>
                                                        <TableCell>{row.tokenFailures}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col gap-1">
                                                                <Badge variant={riskBadgeVariant(row.riskLevel)}>
                                                                    {row.riskLevel.toUpperCase()} • {row.riskScore}
                                                                </Badge>
                                                                {row.riskReasons[0] && (
                                                                    <span className="text-xs text-muted-foreground max-w-[320px] truncate" title={row.riskReasons.join("; ")}>
                                                                        {row.riskReasons[0]}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{formatDateTime(row.lastSeenAt)}</TableCell>
                                                        <TableCell>
                                                            {row.isBlocked ? (
                                                                <Badge variant="destructive">Blocked</Badge>
                                                            ) : (
                                                                <Badge variant="outline">Allowed</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <Button
                                                                    className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                                    onClick={() => setSelectedIpForDetails(row.ipAddress)}
                                                                    data-testid={`button-investigate-${row.ipAddress}`}
                                                                >
                                                                    <Eye className="h-4 w-4" /> Inspect
                                                                </Button>

                                                                {row.isBlocked ? (
                                                                    <Button
                                                                        className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                                        onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                                        disabled={unblockIpMutation.isPending}
                                                                        data-testid={`button-usage-unblock-${row.ipAddress}`}
                                                                    >
                                                                        <ShieldCheck className="h-4 w-4" /> Unblock
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        className={cn(BUTTON_3D_DESTRUCTIVE_CLASS, "h-9 gap-2 text-xs")}
                                                                        onClick={() => onQuickBlock(row)}
                                                                        disabled={blockIpMutation.isPending}
                                                                        data-testid={`button-usage-block-${row.ipAddress}`}
                                                                    >
                                                                        <ShieldAlert className="h-4 w-4" /> Block
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="blocked">
                    <Card className={DATA_CARD_CLASS}>
                        <CardHeader>
                            <CardTitle>Global Payment IP Blocks</CardTitle>
                            <CardDescription>
                                Active and historical block records for all payment-sensitive operations.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {blockedLoading ? (
                                <p className="text-sm text-muted-foreground">Loading...</p>
                            ) : allBlockedIps.length === 0 ? (
                                <div className="rounded-[24px] border border-dashed border-slate-300/90 bg-slate-50/70 py-12 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/50">
                                    No blocked IP records for current filter.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="space-y-3 lg:hidden">
                                        {allBlockedIps.map((row) => (
                                            <div key={row.id} className={cn(STAT_CARD_CLASS, row.autoBlocked ? "border-rose-200 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/35" : "border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60")}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{row.ipAddress}</p>
                                                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{row.blockReason}</p>
                                                    </div>
                                                    <Badge variant={row.autoBlocked ? "destructive" : "secondary"}>{row.autoBlocked ? "Auto" : "Manual"}</Badge>
                                                </div>
                                                <div className="mt-3 text-xs text-muted-foreground">Blocked At: {formatDateTime(row.blockedAt)}</div>
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <Button
                                                        className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                        onClick={() => setSelectedIpForDetails(row.ipAddress)}
                                                        data-testid={`button-blocked-inspect-${row.ipAddress}`}
                                                    >
                                                        <Eye className="h-4 w-4" /> Inspect
                                                    </Button>
                                                    <Button
                                                        className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                        onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                        disabled={unblockIpMutation.isPending}
                                                        data-testid={`button-unblock-${row.ipAddress}`}
                                                    >
                                                        <ShieldCheck className="h-4 w-4" /> Unblock
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="hidden overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60 lg:block">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>IP</TableHead>
                                                    <TableHead>Reason</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Blocked At</TableHead>
                                                    <TableHead className="text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {allBlockedIps.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell className="font-mono text-xs">{row.ipAddress}</TableCell>
                                                        <TableCell className="max-w-[420px] truncate" title={row.blockReason}>{row.blockReason}</TableCell>
                                                        <TableCell>
                                                            {row.autoBlocked ? (
                                                                <Badge variant="destructive">Auto</Badge>
                                                            ) : (
                                                                <Badge variant="secondary">Manual</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{formatDateTime(row.blockedAt)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <Button
                                                                    className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                                    onClick={() => setSelectedIpForDetails(row.ipAddress)}
                                                                    data-testid={`button-blocked-inspect-${row.ipAddress}`}
                                                                >
                                                                    <Eye className="h-4 w-4" /> Inspect
                                                                </Button>
                                                                <Button
                                                                    className={cn(BUTTON_3D_CLASS, "h-9 gap-2 text-xs")}
                                                                    onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                                    disabled={unblockIpMutation.isPending}
                                                                    data-testid={`button-unblock-${row.ipAddress}`}
                                                                >
                                                                    <ShieldCheck className="h-4 w-4" /> Unblock
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={Boolean(selectedIpForDetails)} onOpenChange={(open) => !open && setSelectedIpForDetails(null)}>
                <DialogContent className={`${DIALOG_SURFACE_CLASS} max-h-[90vh] overflow-y-auto`}>
                    <DialogHeader>
                        <DialogTitle className="font-mono">IP Investigation: {selectedIpForDetails}</DialogTitle>
                        <DialogDescription>
                            Deep visibility into account overlap, operation patterns, and token outcomes for this IP.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedIpLoading ? (
                        <p className="text-sm text-muted-foreground">Loading investigation data...</p>
                    ) : !selectedIpDetails ? (
                        <p className="text-sm text-muted-foreground">No details available for this IP.</p>
                    ) : (
                        <div className="space-y-5">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <Card className={STAT_CARD_CLASS}>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Distinct Accounts</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.distinctUsers}</p>
                                    </CardContent>
                                </Card>
                                <Card className={STAT_CARD_CLASS}>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Operations</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.operationsCount}</p>
                                    </CardContent>
                                </Card>
                                <Card className={STAT_CARD_CLASS}>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Token Failures</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.tokenFailures}</p>
                                    </CardContent>
                                </Card>
                                <Card className={STAT_CARD_CLASS}>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Risk</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.riskScore}</p>
                                        <Badge variant={riskBadgeVariant(selectedIpDetails.metrics.riskLevel)} className="mt-1">
                                            {selectedIpDetails.metrics.riskLevel.toUpperCase()}
                                        </Badge>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={selectedIpDetails.block ? "destructive" : "outline"}>
                                        {selectedIpDetails.block ? "Blocked" : "Allowed"}
                                    </Badge>
                                    <Badge variant="secondary">Recommendation: {selectedIpDetails.metrics.recommendedAction}</Badge>
                                    <Badge variant="outline">Window: {selectedIpDetails.windowHours}h</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        First Seen: {formatDateTime(selectedIpDetails.metrics.firstSeenAt)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Last Seen: {formatDateTime(selectedIpDetails.metrics.lastSeenAt)}
                                    </span>
                                </div>
                                {selectedIpDetails.block?.blockReason && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Block reason: {selectedIpDetails.block.blockReason}
                                    </p>
                                )}
                            </div>

                            {selectedIpDetails.metrics.riskReasons.length > 0 && (
                                <Card className={DATA_CARD_CLASS}>
                                    <CardHeader>
                                        <CardTitle className="text-sm">Risk Evidence</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-1">
                                        {selectedIpDetails.metrics.riskReasons.map((reason) => (
                                            <p key={reason} className="text-sm text-muted-foreground">- {reason}</p>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}

                            <Card className={DATA_CARD_CLASS}>
                                <CardHeader>
                                    <CardTitle className="text-sm">Operation Mix</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-2">
                                    {selectedIpDetails.operationsByType.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No operation mix data in this window.</p>
                                    ) : selectedIpDetails.operationsByType.map((row) => (
                                        <Badge key={row.operation} variant="outline">{row.operation}: {row.count}</Badge>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card className={DATA_CARD_CLASS}>
                                <CardHeader>
                                    <CardTitle className="text-sm">Accounts Using This IP</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {selectedIpDetails.usersByActivity.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No accounts in this time window.</p>
                                    ) : (
                                        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 overflow-x-auto dark:border-slate-800 dark:bg-slate-950/60">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>User</TableHead>
                                                        <TableHead>Nickname</TableHead>
                                                        <TableHead>Account ID</TableHead>
                                                        <TableHead>Operations</TableHead>
                                                        <TableHead>Last Seen</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedIpDetails.usersByActivity.map((row) => (
                                                        <TableRow key={row.userId}>
                                                            <TableCell>{row.username}</TableCell>
                                                            <TableCell>{row.nickname || "-"}</TableCell>
                                                            <TableCell className="font-mono text-xs">{row.accountId || "-"}</TableCell>
                                                            <TableCell>{row.operationsCount}</TableCell>
                                                            <TableCell>{formatDateTime(row.lastSeenAt)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card className={DATA_CARD_CLASS}>
                                    <CardHeader>
                                        <CardTitle className="text-sm">Recent Payment Activity</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {selectedIpDetails.recentActivities.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No recent payment activity for this IP.</p>
                                        ) : (
                                            <div className="rounded-[24px] border border-slate-200/80 bg-white/80 overflow-x-auto dark:border-slate-800 dark:bg-slate-950/60">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Time</TableHead>
                                                            <TableHead>User</TableHead>
                                                            <TableHead>Operation</TableHead>
                                                            <TableHead>Path</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {selectedIpDetails.recentActivities.map((row, index) => (
                                                            <TableRow key={`${row.userId}-${row.createdAt || "none"}-${index}`}>
                                                                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                                                                <TableCell>{row.username}</TableCell>
                                                                <TableCell>{row.operation}</TableCell>
                                                                <TableCell className="font-mono text-xs max-w-[220px] truncate" title={row.requestPath}>{row.requestPath}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className={DATA_CARD_CLASS}>
                                    <CardHeader>
                                        <CardTitle className="text-sm">Operation Token Outcomes</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline">Pending: {selectedIpDetails.tokenStatusSummary.pending}</Badge>
                                            <Badge variant="outline">Completed: {selectedIpDetails.tokenStatusSummary.completed}</Badge>
                                            <Badge variant="destructive">Failed: {selectedIpDetails.tokenStatusSummary.failed}</Badge>
                                            <Badge variant="secondary">Cancelled: {selectedIpDetails.tokenStatusSummary.cancelled}</Badge>
                                            <Badge variant="secondary">Expired: {selectedIpDetails.tokenStatusSummary.expired}</Badge>
                                        </div>

                                        {selectedIpDetails.recentTokenEvents.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No recent token events for this IP.</p>
                                        ) : (
                                            <div className="rounded-[24px] border border-slate-200/80 bg-white/80 overflow-x-auto dark:border-slate-800 dark:bg-slate-950/60">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Time</TableHead>
                                                            <TableHead>User</TableHead>
                                                            <TableHead>Operation</TableHead>
                                                            <TableHead>Status</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {selectedIpDetails.recentTokenEvents.map((row, index) => (
                                                            <TableRow key={`${row.token}-${index}`}>
                                                                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                                                                <TableCell>{row.username}</TableCell>
                                                                <TableCell>{row.operation}</TableCell>
                                                                <TableCell>
                                                                    <Badge variant={row.status === "failed" || row.status === "expired" ? "destructive" : "outline"}>
                                                                        {row.status}
                                                                    </Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
