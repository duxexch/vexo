import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-api";
import {
    Crown,
    Search,
    RefreshCw,
    ShieldCheck,
    Clock3,
    TrendingUp,
    Activity,
    Sparkles,
    Users,
    BadgeCheck,
    AlertTriangle,
    BarChart3,
    Flame,
    Gauge,
    ShieldAlert,
    ArrowRightLeft,
    CheckCircle2,
} from "lucide-react";

type MarketerListItem = {
    id: string;
    user_id: string;
    username?: string;
    nickname?: string | null;
    marketer_status: string;
    cpa_enabled: boolean;
    cpa_amount: string;
    revshare_enabled: boolean;
    revshare_rate: string;
    commission_hold_days: number;
    total_commission_earned: string;
    pending_commission: string;
    total_withdrawable_commission: string;
    total_paid_commission?: string;
    total_referrals?: number;
    total_registrations?: number;
    updated_at?: string;
};

type MarketersResponse = {
    marketers: MarketerListItem[];
};

type MarketerOverviewResponse = {
    summary: {
        total_marketers: number;
        approved_marketers: number;
        pending_marketers: number;
        revoked_marketers: number;
        total_commissions: string;
        total_pending: string;
        total_withdrawable: string;
        total_paid: string;
    };
    topMarketers?: Array<{
        user_id: string;
        username?: string;
        nickname?: string | null;
        total_referrals?: number;
        total_commission_earned?: string;
        pending_commission?: string;
        total_withdrawable_commission?: string;
    }>;
};

type MarketerDetailsResponse = {
    user: {
        id: string;
        username: string;
        nickname?: string | null;
        status: string;
    };
    affiliate: {
        id: string;
        marketerStatus: string;
        cpaEnabled: boolean;
        cpaAmount: string;
        revshareEnabled: boolean;
        revshareRate: string;
        commissionHoldDays: number;
        minQualifiedDeposits: string;
        minQualifiedWagered: string;
        minQualifiedGames: number;
        totalCommissionEarned: string;
        pendingCommission: string;
        totalWithdrawableCommission: string;
        totalPaidCommission: string;
        totalReferrals?: number;
        totalRegistrations?: number;
        updatedAt?: string;
    } | null;
    referralStats?: {
        invited_total?: number;
        invited_active?: number;
        invited_deposits?: string;
        invited_wagered?: string;
        invited_games?: number;
    };
    commissionStats: {
        total_amount: string;
        on_hold_amount: string;
        released_amount: string;
        cpa_amount: string;
        revshare_amount: string;
        events_count: number;
    };
    recentEvents: Array<{
        id: string;
        reward_type: string;
        reward_status: string;
        reward_amount: string;
        created_at: string;
        referred_username?: string | null;
        referred_nickname?: string | null;
        hold_until?: string | null;
        released_at?: string | null;
    }>;
};

type SchedulerRun = {
    id: string;
    trigger: "auto" | "manual";
    status: "running" | "success" | "failed" | "skipped";
    idempotencyKey?: string | null;
    metadata?: string | null;
    attemptCount: number;
    retryCount: number;
    generatedEvents: number;
    generatedAmount: string;
    releasedEvents: number;
    releasedAmount: string;
    errorMessage?: string | null;
    startedAt: string;
    finishedAt?: string | null;
};

type SchedulerRunsResponse = {
    runs: SchedulerRun[];
};

function getAdminToken() {
    return localStorage.getItem("adminToken");
}

async function adminRequest(url: string, method: "POST" | "PUT", body: Record<string, unknown>) {
    const token = getAdminToken();
    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-admin-token": token || "",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(payload.error || "Request failed");
    }

    return response.json();
}

function formatDateTime(value?: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatCoins(value: string | number | null | undefined): string {
    const amount = Number.parseFloat(String(value ?? "0"));
    if (!Number.isFinite(amount)) return "0.00";
    return amount.toFixed(2);
}

function safeNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function pct(value: number, total: number): string {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return "0%";
    return `${Math.round((value / total) * 100)}%`;
}

function StatCard({
    title,
    value,
    description,
    icon: Icon,
    tone = "default",
}: {
    title: string;
    value: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
    const toneClasses: Record<typeof tone, string> = {
        default: "bg-background",
        success: "bg-emerald-500/5 border-emerald-500/20",
        warning: "bg-amber-500/5 border-amber-500/20",
        danger: "bg-rose-500/5 border-rose-500/20",
        info: "bg-sky-500/5 border-sky-500/20",
    };

    return (
        <Card className={toneClasses[tone]}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{title}</p>
                        <p className="text-2xl font-bold tabular-nums">{value}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function AdminMarketersPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");
    const [activeTab, setActiveTab] = useState("overview");

    const [cpaEnabled, setCpaEnabled] = useState(true);
    const [revshareEnabled, setRevshareEnabled] = useState(true);
    const [cpaAmount, setCpaAmount] = useState("5.00");
    const [revshareRate, setRevshareRate] = useState("10.00");
    const [holdDays, setHoldDays] = useState("7");
    const [minDeposit, setMinDeposit] = useState("0.00");
    const [minWagered, setMinWagered] = useState("0.00");
    const [minGames, setMinGames] = useState("0");
    const [runStatusFilter, setRunStatusFilter] = useState<"all" | "running" | "success" | "failed" | "skipped">("all");
    const [runTriggerFilter, setRunTriggerFilter] = useState<"all" | "auto" | "manual">("all");
    const [runDateFrom, setRunDateFrom] = useState("");
    const [runDateTo, setRunDateTo] = useState("");

    const { data: marketersData, isLoading: marketersLoading, isFetching: marketersFetching } = useQuery<MarketersResponse>({
        queryKey: ["/api/admin/free-play/marketers", "list"],
        queryFn: () => adminFetch("/api/admin/free-play/marketers?limit=200"),
        staleTime: 20_000,
    });

    const { data: overviewData, isLoading: overviewLoading } = useQuery<MarketerOverviewResponse>({
        queryKey: ["/api/admin/free-play/marketers/overview"],
        queryFn: () => adminFetch("/api/admin/free-play/marketers/overview"),
        staleTime: 20_000,
    });

    const { data: detailsData, isLoading: detailsLoading } = useQuery<MarketerDetailsResponse>({
        queryKey: ["/api/admin/free-play/marketers", selectedUserId, "details"],
        queryFn: () => adminFetch(`/api/admin/free-play/marketers/${selectedUserId}/details`),
        enabled: selectedUserId.length > 0,
    });

    const { data: runsData, isLoading: runsLoading, isFetching: runsFetching } = useQuery<SchedulerRunsResponse>({
        queryKey: ["/api/admin/free-play/marketers/scheduler/runs", runStatusFilter, runTriggerFilter, runDateFrom, runDateTo],
        queryFn: () => {
            const params = new URLSearchParams();
            params.set("limit", "80");
            if (runStatusFilter !== "all") {
                params.set("status", runStatusFilter);
            }
            if (runTriggerFilter !== "all") {
                params.set("trigger", runTriggerFilter);
            }
            if (runDateFrom) {
                params.set("dateFrom", runDateFrom);
            }
            if (runDateTo) {
                params.set("dateTo", runDateTo);
            }
            return adminFetch(`/api/admin/free-play/marketers/scheduler/runs?${params.toString()}`);
        },
        refetchInterval: 30_000,
    });

    const filteredMarketers = useMemo(() => {
        const query = search.trim().toLowerCase();
        const rows = marketersData?.marketers || [];
        if (!query) return rows;

        return rows.filter((row) => {
            const username = String(row.username || "").toLowerCase();
            const nickname = String(row.nickname || "").toLowerCase();
            const status = String(row.marketer_status || "").toLowerCase();
            return username.includes(query) || nickname.includes(query) || status.includes(query);
        });
    }, [marketersData?.marketers, search]);

    useEffect(() => {
        if (selectedUserId || filteredMarketers.length === 0) {
            return;
        }
        setSelectedUserId(String(filteredMarketers[0].user_id || ""));
    }, [filteredMarketers, selectedUserId]);

    useEffect(() => {
        const affiliate = detailsData?.affiliate;
        if (!affiliate) return;

        setCpaEnabled(affiliate.cpaEnabled !== false);
        setRevshareEnabled(affiliate.revshareEnabled !== false);
        setCpaAmount(String(affiliate.cpaAmount || "5.00"));
        setRevshareRate(String(affiliate.revshareRate || "10.00"));
        setHoldDays(String(affiliate.commissionHoldDays ?? 7));
        setMinDeposit(String(affiliate.minQualifiedDeposits || "0.00"));
        setMinWagered(String(affiliate.minQualifiedWagered || "0.00"));
        setMinGames(String(affiliate.minQualifiedGames ?? 0));
    }, [detailsData?.affiliate]);

    const updateConfigMut = useMutation({
        mutationFn: async () => {
            if (!selectedUserId) throw new Error("Select marketer first");
            return adminRequest(`/api/admin/free-play/marketers/${selectedUserId}/config`, "PUT", {
                cpaEnabled,
                revshareEnabled,
                cpaAmount,
                revshareRate,
                commissionHoldDays: holdDays,
                minQualifiedDeposits: minDeposit,
                minQualifiedWagered: minWagered,
                minQualifiedGames: minGames,
            });
        },
        onSuccess: async () => {
            toast({ title: "Marketer config updated" });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/overview"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers", selectedUserId, "details"] });
        },
        onError: (error: Error) => {
            toast({ title: "Update failed", description: error.message, variant: "destructive" });
        },
    });

    const badgeMut = useMutation({
        mutationFn: async (action: "grant" | "revoke") => {
            if (!selectedUserId) throw new Error("Select marketer first");
            return adminRequest(`/api/admin/free-play/marketers/${selectedUserId}/badge`, "POST", { action });
        },
        onSuccess: async (_data, action) => {
            toast({ title: action === "grant" ? "Marketer badge granted" : "Marketer badge revoked" });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/overview"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers", selectedUserId, "details"] });
        },
        onError: (error: Error) => {
            toast({ title: "Badge action failed", description: error.message, variant: "destructive" });
        },
    });

    const schedulerRunMut = useMutation({
        mutationFn: async (payload: { releaseOnly: boolean; userId?: string; idempotencyKey: string }) => {
            return adminRequest("/api/admin/free-play/marketers/scheduler/run", "POST", {
                releaseOnly: payload.releaseOnly,
                userId: payload.userId,
                idempotencyKey: payload.idempotencyKey,
            });
        },
        onSuccess: async (result: { runId: string; status: string; deduplicated?: boolean }) => {
            toast({
                title: result.deduplicated ? "Scheduler run deduplicated" : "Scheduler run completed",
                description: `Run ${result.runId} (${result.status})`,
            });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/overview"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/scheduler/runs"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers", selectedUserId, "details"] });
        },
        onError: (error: Error) => {
            toast({ title: "Scheduler run failed", description: error.message, variant: "destructive" });
        },
    });

    const filteredRuns = useMemo(() => runsData?.runs || [], [runsData?.runs]);

    const buildIdempotencyKey = (payload: { releaseOnly: boolean; userId?: string }) => {
        const scope = `${payload.releaseOnly ? "release" : "full"}:${payload.userId || "all"}`;
        const bucket = Math.floor(Date.now() / 15_000);
        return `mkt-${scope}-${bucket}`;
    };

    const triggerSchedulerRun = (payload: { releaseOnly: boolean; userId?: string }) => {
        const idempotencyKey = buildIdempotencyKey(payload);
        schedulerRunMut.mutate({ ...payload, idempotencyKey });
    };

    const rerunFromHistory = (run: SchedulerRun) => {
        let parsed: { releaseOnly?: boolean; referrerUserId?: string | null } = {};
        if (typeof run.metadata === "string" && run.metadata.trim().length > 0) {
            try {
                parsed = JSON.parse(run.metadata) as { releaseOnly?: boolean; referrerUserId?: string | null };
            } catch {
                parsed = {};
            }
        }

        triggerSchedulerRun({
            releaseOnly: parsed.releaseOnly === true,
            userId: typeof parsed.referrerUserId === "string" && parsed.referrerUserId.trim().length > 0
                ? parsed.referrerUserId
                : undefined,
        });
    };

    const selectedMarketer = filteredMarketers.find((row) => String(row.user_id) === selectedUserId) || null;

    const totals = overviewData?.summary;
    const totalMarketers = Number(totals?.total_marketers || 0);
    const approvedCount = Number(totals?.approved_marketers || 0);
    const pendingCount = Number(totals?.pending_marketers || 0);
    const revokedCount = Number(totals?.revoked_marketers || 0);

    const topMarketer = overviewData?.topMarketers?.[0] || null;
    const recentHealthy = filteredRuns.filter((run) => run.status === "success").length;

    return (
        <div className="min-h-screen p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 via-background to-background">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="gap-1">
                                    <Layers3 className="h-3.5 w-3.5" />
                                    Operation Center
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Enterprise-grade control
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Global scale ready
                                </Badge>
                            </div>
                            <CardTitle className="text-2xl flex items-center gap-2">
                                <Crown className="h-6 w-6 text-sky-500" />
                                إدارة المسوقين
                            </CardTitle>
                            <CardDescription className="max-w-3xl">
                                لوحة تشغيل احترافية لإدارة الشارة، CPA، RevShare، شروط التأهيل، وحركة المجدول مع رؤية مالية وتشغيلية أوضح.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Activity className="h-4 w-4" />
                            <span>{marketersFetching || runsFetching ? "Updating live" : "Live ready"}</span>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                    title="إجمالي المسوقين"
                    value={overviewLoading ? "..." : String(totalMarketers)}
                    description="إجمالي الحسابات المسجلة في النظام"
                    icon={Users}
                    tone="info"
                />
                <StatCard
                    title="المعتمدون"
                    value={overviewLoading ? "..." : String(approvedCount)}
                    description={`${pct(approvedCount, totalMarketers)} من الإجمالي`}
                    icon={BadgeCheck}
                    tone="success"
                />
                <StatCard
                    title="قيد المراجعة"
                    value={overviewLoading ? "..." : String(pendingCount)}
                    description={`${pct(pendingCount, totalMarketers)} من الإجمالي`}
                    icon={Clock3}
                    tone="warning"
                />
                <StatCard
                    title="العمولات الكلية"
                    value={overviewLoading ? "..." : formatCoins(totals?.total_commissions)}
                    description={`Paid ${formatCoins(totals?.total_paid)} · Withdrawable ${formatCoins(totals?.total_withdrawable)}`}
                    icon={TrendingUp}
                    tone="default"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="xl:col-span-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Search className="w-4 h-4" /> قائمة المسوقين
                                </CardTitle>
                                <CardDescription>اختيار مباشر مع بحث سريع وحالة واضحة.</CardDescription>
                            </div>
                            <Badge variant="outline">{filteredMarketers.length}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search username, nickname, status"
                        />
                        <div className="max-h-[62svh] overflow-auto space-y-2 pr-1">
                            {marketersLoading ? (
                                <p className="text-sm text-muted-foreground">Loading marketers...</p>
                            ) : filteredMarketers.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                    لا يوجد مسوقين مطابقين.
                                </div>
                            ) : (
                                filteredMarketers.map((row) => {
                                    const active = String(row.user_id) === selectedUserId;
                                    const statusVariant = row.marketer_status === "approved"
                                        ? "default"
                                        : row.marketer_status === "revoked"
                                            ? "destructive"
                                            : "outline";

                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            onClick={() => setSelectedUserId(String(row.user_id))}
                                            className={`w-full text-right border rounded-xl p-3 transition ${active ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/40"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm truncate">
                                                        {row.nickname || row.username || "Unknown"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        @{row.username || "-"}
                                                    </p>
                                                </div>
                                                <Badge variant={statusVariant as "default" | "outline" | "destructive"}>
                                                    {row.marketer_status}
                                                </Badge>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                <div className="rounded-md bg-muted/40 px-2 py-1">
                                                    Earned <span className="font-semibold text-foreground">{formatCoins(row.total_commission_earned)}</span>
                                                </div>
                                                <div className="rounded-md bg-muted/40 px-2 py-1">
                                                    Withdrawable <span className="font-semibold text-foreground">{formatCoins(row.total_withdrawable_commission)}</span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                    <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-sky-500" /> مركز التحكم
                                </CardTitle>
                                <CardDescription>
                                    {selectedMarketer
                                        ? `Controlling @${selectedMarketer.username || "unknown"}`
                                        : "اختر مسوقًا لعرض التفاصيل والتحكم."}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers"] })}
                                    disabled={marketersFetching || overviewLoading}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {detailsLoading ? (
                            <p className="text-sm text-muted-foreground">Loading details...</p>
                        ) : detailsData?.affiliate ? (
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-4">
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="controls">Controls</TabsTrigger>
                                    <TabsTrigger value="performance">Performance</TabsTrigger>
                                    <TabsTrigger value="events">Events</TabsTrigger>
                                </TabsList>

                                <TabsContent value="overview" className="space-y-4">
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="rounded-xl border p-3">
                                            <p className="text-xs text-muted-foreground">Status</p>
                                            <p className="font-bold capitalize">{detailsData.affiliate.marketerStatus}</p>
                                        </div>
                                        <div className="rounded-xl border p-3">
                                            <p className="text-xs text-muted-foreground">Total</p>
                                            <p className="font-bold">{formatCoins(detailsData.commissionStats?.total_amount)}</p>
                                        </div>
                                        <div className="rounded-xl border p-3">
                                            <p className="text-xs text-muted-foreground">On Hold</p>
                                            <p className="font-bold">{formatCoins(detailsData.commissionStats?.on_hold_amount)}</p>
                                        </div>
                                        <div className="rounded-xl border p-3">
                                            <p className="text-xs text-muted-foreground">Released</p>
                                            <p className="font-bold">{formatCoins(detailsData.commissionStats?.released_amount)}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Card>
                                            <CardContent className="p-4">
                                                <p className="text-xs text-muted-foreground">CPA / RevShare</p>
                                                <div className="mt-2 flex flex-col gap-1 text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <span>CPA</span>
                                                        <Badge variant={detailsData.affiliate.cpaEnabled ? "default" : "outline"}>
                                                            {detailsData.affiliate.cpaEnabled ? "Enabled" : "Disabled"}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span>RevShare</span>
                                                        <Badge variant={detailsData.affiliate.revshareEnabled ? "default" : "outline"}>
                                                            {detailsData.affiliate.revshareEnabled ? "Enabled" : "Disabled"}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="p-4">
                                                <p className="text-xs text-muted-foreground">Referral Quality</p>
                                                <div className="mt-2 space-y-1 text-sm">
                                                    <div className="flex justify-between"><span>Deposits</span><span className="font-semibold">{formatCoins(detailsData.affiliate.minQualifiedDeposits)}</span></div>
                                                    <div className="flex justify-between"><span>Wagered</span><span className="font-semibold">{formatCoins(detailsData.affiliate.minQualifiedWagered)}</span></div>
                                                    <div className="flex justify-between"><span>Games</span><span className="font-semibold">{Number(detailsData.affiliate.minQualifiedGames || 0)}</span></div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="p-4">
                                                <p className="text-xs text-muted-foreground">Operational Snapshot</p>
                                                <div className="mt-2 space-y-1 text-sm">
                                                    <div className="flex justify-between"><span>Hold days</span><span className="font-semibold">{detailsData.affiliate.commissionHoldDays}</span></div>
                                                    <div className="flex justify-between"><span>Paid</span><span className="font-semibold">{formatCoins(detailsData.affiliate.totalPaidCommission)}</span></div>
                                                    <div className="flex justify-between"><span>Registrations</span><span className="font-semibold">{Number(detailsData.affiliate.totalRegistrations || 0)}</span></div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>

                                <TabsContent value="controls" className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div className="space-y-1.5">
                                            <Label>CPA Enabled</Label>
                                            <div className="h-10 rounded border px-3 flex items-center justify-between">
                                                <span className="text-sm">Active</span>
                                                <Switch checked={cpaEnabled} onCheckedChange={setCpaEnabled} />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>CPA Amount</Label>
                                            <MoneyInput value={cpaAmount} onChange={(e) => setCpaAmount(e.target.value)} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>RevShare Enabled</Label>
                                            <div className="h-10 rounded border px-3 flex items-center justify-between">
                                                <span className="text-sm">Active</span>
                                                <Switch checked={revshareEnabled} onCheckedChange={setRevshareEnabled} />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>RevShare %</Label>
                                            <MoneyInput value={revshareRate} onChange={(e) => setRevshareRate(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div className="space-y-1.5"><Label>Hold Days</Label><MoneyInput allowDecimal={false} value={holdDays} onChange={(e) => setHoldDays(e.target.value)} /></div>
                                        <div className="space-y-1.5"><Label>Min Deposit</Label><MoneyInput value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} /></div>
                                        <div className="space-y-1.5"><Label>Min Wagered</Label><MoneyInput value={minWagered} onChange={(e) => setMinWagered(e.target.value)} /></div>
                                        <div className="space-y-1.5"><Label>Min Games</Label><MoneyInput allowDecimal={false} value={minGames} onChange={(e) => setMinGames(e.target.value)} /></div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 justify-end">
                                        <Button variant="outline" onClick={() => badgeMut.mutate("grant")} disabled={badgeMut.isPending}>
                                            Grant Marketer Badge
                                        </Button>
                                        <Button variant="outline" onClick={() => badgeMut.mutate("revoke")} disabled={badgeMut.isPending}>
                                            Revoke Marketer Badge
                                        </Button>
                                        <Button onClick={() => updateConfigMut.mutate()} disabled={updateConfigMut.isPending}>
                                            Save Marketer Config
                                        </Button>
                                    </div>
                                </TabsContent>

                                <TabsContent value="performance" className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Card>
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <Flame className="h-4 w-4 text-orange-500" />
                                                    Referral volume
                                                </div>
                                                <div className="mt-3 space-y-2 text-sm">
                                                    <div className="flex justify-between"><span>Invited total</span><span className="font-semibold">{Number(detailsData.referralStats?.invited_total || 0)}</span></div>
                                                    <div className="flex justify-between"><span>Active referrals</span><span className="font-semibold">{Number(detailsData.referralStats?.invited_active || 0)}</span></div>
                                                    <div className="flex justify-between"><span>Deposits</span><span className="font-semibold">{formatCoins(detailsData.referralStats?.invited_deposits)}</span></div>
                                                    <div className="flex justify-between"><span>Wagered</span><span className="font-semibold">{formatCoins(detailsData.referralStats?.invited_wagered)}</span></div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <BarChart3 className="h-4 w-4 text-sky-500" />
                                                    Commission health
                                                </div>
                                                <div className="mt-3 space-y-2 text-sm">
                                                    <div className="flex justify-between"><span>Events</span><span className="font-semibold">{Number(detailsData.commissionStats?.events_count || 0)}</span></div>
                                                    <div className="flex justify-between"><span>CPA</span><span className="font-semibold">{formatCoins(detailsData.commissionStats?.cpa_amount)}</span></div>
                                                    <div className="flex justify-between"><span>RevShare</span><span className="font-semibold">{formatCoins(detailsData.commissionStats?.revshare_amount)}</span></div>
                                                    <div className="flex justify-between"><span>Pending</span><span className="font-semibold">{formatCoins(detailsData.commissionStats?.on_hold_amount)}</span></div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <ArrowRightLeft className="h-4 w-4 text-emerald-500" />
                                                    Risk & action
                                                </div>
                                                <div className="mt-3 space-y-2 text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <span>State</span>
                                                        <Badge variant={detailsData.affiliate.marketerStatus === "approved" ? "default" : detailsData.affiliate.marketerStatus === "revoked" ? "destructive" : "outline"}>
                                                            {detailsData.affiliate.marketerStatus}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span>Hold window</span>
                                                        <span className="font-semibold">{detailsData.affiliate.commissionHoldDays}d</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span>Withdrawable</span>
                                                        <span className="font-semibold">{formatCoins(detailsData.affiliate.totalWithdrawableCommission)}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {topMarketer && (
                                        <div className="rounded-xl border bg-muted/20 p-4">
                                            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                                                <Crown className="h-4 w-4 text-yellow-500" />
                                                Best performer
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-semibold">{topMarketer.nickname || topMarketer.username || "Unknown"}</div>
                                                    <div className="text-xs text-muted-foreground">Referrals: {Number(topMarketer.total_referrals || 0)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-semibold">{formatCoins(topMarketer.total_commission_earned)}</div>
                                                    <div className="text-xs text-muted-foreground">Commission earned</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="events" className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary">{Number(detailsData.recentEvents?.length || 0)} events</Badge>
                                            {detailsData.recentEvents?.some((e) => e.reward_status === "on_hold") && (
                                                <Badge variant="outline" className="gap-1">
                                                    <Clock3 className="h-3.5 w-3.5" />
                                                    On hold present
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {(detailsData.recentEvents?.length ?? 0) > 0 ? (
                                        <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                                            {detailsData.recentEvents.slice(0, 30).map((event) => (
                                                <div key={event.id} className="rounded-xl border p-3 flex items-center justify-between gap-3 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="font-medium truncate">{event.referred_username || event.referred_nickname || "Referral user"}</p>
                                                        <p className="text-xs text-muted-foreground uppercase">
                                                            {event.reward_type} • {event.reward_status}
                                                        </p>
                                                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                            {event.hold_until && <span>Hold: {formatDateTime(event.hold_until)}</span>}
                                                            {event.released_at && <span>Released: {formatDateTime(event.released_at)}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="font-semibold">{formatCoins(event.reward_amount)}</p>
                                                        <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                            لا توجد أحداث بعد لهذا المسوق.
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                No affiliate record for selected user yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Scheduler Operations
                    </CardTitle>
                    <CardDescription>
                        Safe sync/release runner with retries, lock protection, and persistent run history.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="rounded-xl border p-4">
                            <div className="text-xs text-muted-foreground">Healthy runs</div>
                            <div className="mt-1 text-2xl font-bold">{recentHealthy}</div>
                            <div className="text-xs text-muted-foreground">Successful scheduler executions in current list</div>
                        </div>
                        <div className="rounded-xl border p-4">
                            <div className="text-xs text-muted-foreground">Latest scheduler state</div>
                            <div className="mt-1 flex items-center gap-2">
                                <Badge variant="outline">{filteredRuns[0]?.status || "none"}</Badge>
                                <span className="text-sm text-muted-foreground">{filteredRuns[0] ? formatDateTime(filteredRuns[0].startedAt) : "No runs yet"}</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">Most recent execution snapshot</div>
                        </div>
                        <div className="rounded-xl border p-4">
                            <div className="text-xs text-muted-foreground">Current target</div>
                            <div className="mt-1 text-sm font-medium truncate">{selectedMarketer?.username || "All marketers"}</div>
                            <div className="text-xs text-muted-foreground">
                                {selectedUserId ? "Focused operations mode" : "Fleet-wide operations mode"}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                            variant="outline"
                            onClick={() => triggerSchedulerRun({ releaseOnly: false, userId: selectedUserId || undefined })}
                            disabled={schedulerRunMut.isPending}
                        >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            {schedulerRunMut.isPending ? "Running..." : "Run Full Sync + Release"}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => triggerSchedulerRun({ releaseOnly: true, userId: selectedUserId || undefined })}
                            disabled={schedulerRunMut.isPending}
                        >
                            <Clock3 className="w-4 h-4 mr-2" />
                            {schedulerRunMut.isPending ? "Running..." : "Run Release Only"}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                            <Label>Status</Label>
                            <select
                                className="w-full rounded-md border bg-background px-3 h-10 text-sm"
                                value={runStatusFilter}
                                onChange={(e) => setRunStatusFilter(e.target.value as "all" | "running" | "success" | "failed" | "skipped")}
                            >
                                <option value="all">All</option>
                                <option value="running">Running</option>
                                <option value="success">Success</option>
                                <option value="failed">Failed</option>
                                <option value="skipped">Skipped</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Trigger</Label>
                            <select
                                className="w-full rounded-md border bg-background px-3 h-10 text-sm"
                                value={runTriggerFilter}
                                onChange={(e) => setRunTriggerFilter(e.target.value as "all" | "auto" | "manual")}
                            >
                                <option value="all">All</option>
                                <option value="auto">Auto</option>
                                <option value="manual">Manual</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>From Date</Label>
                            <Input type="date" value={runDateFrom} onChange={(e) => setRunDateFrom(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>To Date</Label>
                            <Input type="date" value={runDateTo} onChange={(e) => setRunDateTo(e.target.value)} />
                        </div>
                    </div>

                    {runsLoading ? (
                        <p className="text-sm text-muted-foreground">Loading scheduler runs...</p>
                    ) : filteredRuns.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No scheduler runs recorded yet.</p>
                    ) : (
                        <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
                            {filteredRuns.map((run) => (
                                <div key={run.id} className="rounded-xl border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant={run.status === "success" ? "default" : run.status === "failed" ? "destructive" : "outline"}>
                                                {run.status}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">{run.trigger}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</p>
                                            <p className="text-[11px] text-muted-foreground">ID: {run.id.slice(0, 8)}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                                        <div>Attempts: <span className="font-semibold">{Number(run.attemptCount || 0)}</span></div>
                                        <div>Retries: <span className="font-semibold">{Number(run.retryCount || 0)}</span></div>
                                        <div>Generated: <span className="font-semibold">{Number(run.generatedEvents || 0)} / {formatCoins(run.generatedAmount)}</span></div>
                                        <div>Released: <span className="font-semibold">{Number(run.releasedEvents || 0)} / {formatCoins(run.releasedAmount)}</span></div>
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => rerunFromHistory(run)}
                                            disabled={schedulerRunMut.isPending}
                                        >
                                            Re-run This Scope
                                        </Button>
                                    </div>
                                    {run.errorMessage ? (
                                        <p className="text-xs text-red-500 mt-2 break-words">{run.errorMessage}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Risk & compliance snapshot
                        </CardTitle>
                        <CardDescription>Quick signals for a global operations team.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">RevShare coverage</div>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="font-semibold">{approvedCount}</span>
                                <span className="text-xs text-muted-foreground">approved accounts</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                RevShare-enabled approvals: dynamic operational pool.
                            </div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Pending backlog</div>
                            <div className="mt-1 text-2xl font-bold text-amber-500">{pendingCount}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Requires human review and faster badge decisions.
                            </div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Revoked</div>
                            <div className="mt-1 text-2xl font-bold text-rose-500">{revokedCount}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Useful for compliance audits and reactivation flows.
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-sky-500" />
                            Performance hint
                        </CardTitle>
                        <CardDescription>Fast operational quick view.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="rounded-xl bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Top performer</div>
                            <div className="mt-1 font-semibold truncate">
                                {topMarketer?.nickname || topMarketer?.username || "No data"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {topMarketer ? `${Number(topMarketer.total_referrals || 0)} referrals` : "Top earners not loaded"}
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Scheduler health</div>
                            <div className="mt-1 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="font-semibold">{recentHealthy} successful runs</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Global readiness</div>
                            <div className="mt-1 flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-sky-500" />
                                <span className="font-semibold">Idempotent ops</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Built for finance-grade repeatability.</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
