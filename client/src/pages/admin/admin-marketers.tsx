import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-api";
import { Crown, Search, RefreshCw, ShieldCheck, Clock3, TrendingUp, Activity } from "lucide-react";

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
    } | null;
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

export default function AdminMarketersPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");

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

    const { data: marketersData, isLoading: marketersLoading } = useQuery<MarketersResponse>({
        queryKey: ["/api/admin/free-play/marketers", "list"],
        queryFn: () => adminFetch("/api/admin/free-play/marketers?limit=200"),
    });

    const { data: overviewData } = useQuery<MarketerOverviewResponse>({
        queryKey: ["/api/admin/free-play/marketers/overview"],
        queryFn: () => adminFetch("/api/admin/free-play/marketers/overview"),
    });

    const { data: detailsData, isLoading: detailsLoading } = useQuery<MarketerDetailsResponse>({
        queryKey: ["/api/admin/free-play/marketers", selectedUserId, "details"],
        queryFn: () => adminFetch(`/api/admin/free-play/marketers/${selectedUserId}/details`),
        enabled: selectedUserId.length > 0,
    });

    const { data: runsData, isLoading: runsLoading } = useQuery<SchedulerRunsResponse>({
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

    return (
        <div className="min-h-screen p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                        <Crown className="w-5 h-5 text-sky-500" /> Admin Marketers
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                        Dedicated CPA and RevShare operations panel with scheduler logs and retry visibility.
                    </p>
                </div>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers"] })}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Approved</p><p className="text-xl font-bold">{Number(overviewData?.summary?.approved_marketers || 0)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Pending</p><p className="text-xl font-bold">{Number(overviewData?.summary?.pending_marketers || 0)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Pending Amount</p><p className="text-xl font-bold">{formatCoins(overviewData?.summary?.total_pending)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Withdrawable</p><p className="text-xl font-bold">{formatCoins(overviewData?.summary?.total_withdrawable)}</p></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="xl:col-span-1">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4" /> Marketer List</CardTitle>
                        <CardDescription>No Inspect step required. Choose marketer directly.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search username or status"
                        />
                        <div className="max-h-[60svh] overflow-auto space-y-2">
                            {marketersLoading ? (
                                <p className="text-sm text-muted-foreground">Loading marketers...</p>
                            ) : filteredMarketers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No marketers found.</p>
                            ) : filteredMarketers.map((row) => {
                                const active = String(row.user_id) === selectedUserId;
                                return (
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => setSelectedUserId(String(row.user_id))}
                                        className={`w-full text-left border rounded-md p-3 transition ${active ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium text-sm">{row.nickname || row.username || "Unknown"}</p>
                                            <Badge variant={row.marketer_status === "approved" ? "default" : "outline"}>{row.marketer_status}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">@{row.username || "-"}</p>
                                        <p className="text-xs mt-1">Earned: <span className="font-semibold">{formatCoins(row.total_commission_earned)}</span></p>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-500" /> Marketer Controls</CardTitle>
                        <CardDescription>
                            {selectedMarketer
                                ? `Controlling @${selectedMarketer.username || "unknown"}`
                                : "Select marketer from the list to apply config and badge actions."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {detailsLoading ? (
                            <p className="text-sm text-muted-foreground">Loading details...</p>
                        ) : detailsData?.affiliate ? (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    <div className="rounded border p-3"><p className="text-xs text-muted-foreground">Status</p><p className="font-bold capitalize">{detailsData.affiliate.marketerStatus}</p></div>
                                    <div className="rounded border p-3"><p className="text-xs text-muted-foreground">Total</p><p className="font-bold">{formatCoins(detailsData.commissionStats?.total_amount)}</p></div>
                                    <div className="rounded border p-3"><p className="text-xs text-muted-foreground">On Hold</p><p className="font-bold">{formatCoins(detailsData.commissionStats?.on_hold_amount)}</p></div>
                                    <div className="rounded border p-3"><p className="text-xs text-muted-foreground">Released</p><p className="font-bold">{formatCoins(detailsData.commissionStats?.released_amount)}</p></div>
                                    <div className="rounded border p-3"><p className="text-xs text-muted-foreground">Events</p><p className="font-bold">{Number(detailsData.commissionStats?.events_count || 0)}</p></div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>CPA Enabled</Label>
                                        <div className="h-10 rounded border px-3 flex items-center justify-between">
                                            <span className="text-sm">Active</span>
                                            <Switch checked={cpaEnabled} onCheckedChange={setCpaEnabled} />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5"><Label>CPA Amount</Label><MoneyInput value={cpaAmount} onChange={(e) => setCpaAmount(e.target.value)} /></div>
                                    <div className="space-y-1.5">
                                        <Label>RevShare Enabled</Label>
                                        <div className="h-10 rounded border px-3 flex items-center justify-between">
                                            <span className="text-sm">Active</span>
                                            <Switch checked={revshareEnabled} onCheckedChange={setRevshareEnabled} />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5"><Label>RevShare %</Label><MoneyInput value={revshareRate} onChange={(e) => setRevshareRate(e.target.value)} /></div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <div className="space-y-1.5"><Label>Hold Days</Label><MoneyInput allowDecimal={false} value={holdDays} onChange={(e) => setHoldDays(e.target.value)} /></div>
                                    <div className="space-y-1.5"><Label>Min Deposit</Label><MoneyInput value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} /></div>
                                    <div className="space-y-1.5"><Label>Min Wagered</Label><MoneyInput value={minWagered} onChange={(e) => setMinWagered(e.target.value)} /></div>
                                    <div className="space-y-1.5"><Label>Min Games</Label><MoneyInput allowDecimal={false} value={minGames} onChange={(e) => setMinGames(e.target.value)} /></div>
                                </div>

                                <div className="flex flex-wrap gap-2 justify-end">
                                    <Button variant="outline" onClick={() => badgeMut.mutate("grant")} disabled={badgeMut.isPending}>Grant Marketer Badge</Button>
                                    <Button variant="outline" onClick={() => badgeMut.mutate("revoke")} disabled={badgeMut.isPending}>Revoke Marketer Badge</Button>
                                    <Button onClick={() => updateConfigMut.mutate()} disabled={updateConfigMut.isPending}>Save Marketer Config</Button>
                                </div>

                                {(detailsData.recentEvents?.length ?? 0) > 0 && (
                                    <div className="space-y-2 max-h-[280px] overflow-auto">
                                        {detailsData.recentEvents.slice(0, 20).map((event) => (
                                            <div key={event.id} className="rounded border p-2 flex items-center justify-between gap-2 text-sm">
                                                <div>
                                                    <p className="font-medium">{event.referred_username || "Referral user"}</p>
                                                    <p className="text-xs text-muted-foreground uppercase">{event.reward_type} • {event.reward_status}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold">{formatCoins(event.reward_amount)}</p>
                                                    <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">No affiliate record for selected user yet.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> Scheduler Operations</CardTitle>
                    <CardDescription>
                        Safe sync/release runner with retries, lock protection, and persistent run history.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                        <div className="space-y-2 max-h-[320px] overflow-auto">
                            {filteredRuns.map((run) => (
                                <div key={run.id} className="rounded border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant={run.status === "success" ? "default" : run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
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
        </div>
    );
}
