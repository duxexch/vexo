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
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Payment Security IP Control</h1>
                    <p className="text-sm text-muted-foreground">
                        Smarter multi-account monitoring, risk scoring, and stronger global payment IP block controls.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1" data-testid="payment-security-mode-caption">
                        Mode: {isNotifyOnlyMode ? "Notify Only (manual decisions)" : "Auto Block + Manual"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant={isNotifyOnlyMode ? "outline" : "default"}
                        onClick={onToggleSecurityMode}
                        disabled={modeMutation.isPending || securityConfigLoading}
                        data-testid="button-toggle-payment-security-mode"
                    >
                        {isNotifyOnlyMode ? (
                            <Eye className="h-4 w-4 me-2" />
                        ) : (
                            <ShieldAlert className="h-4 w-4 me-2" />
                        )}
                        {isNotifyOnlyMode ? "Switch to Auto Block" : "Switch to Notify Only"}
                    </Button>
                    <Button variant="outline" onClick={refreshAll} data-testid="button-refresh-ip-security">
                        <RefreshCw className="h-4 w-4 me-2" /> Refresh
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Active Blocks</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{overview?.activeBlocks ?? allBlockedIps.length}</p>
                        <p className="text-xs text-muted-foreground">
                            Auto: {overview?.autoBlocks ?? 0} • Manual: {overview?.manualBlocks ?? 0}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Distinct Accounts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{overview?.uniqueAccounts ?? 0}</p>
                        <p className="text-xs text-muted-foreground">IPs: {overview?.uniqueIps ?? 0}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Payment Operations</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{overview?.operationsCount ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Window: {parsedWindowHours}h</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risk Snapshot</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm font-medium">Critical: {overview?.criticalRiskIps ?? riskStats.critical}</p>
                        <p className="text-xs text-muted-foreground">
                            High: {overview?.highRiskIps ?? riskStats.high} • Medium+: {overview?.mediumRiskIps ?? riskStats.medium}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Ban className="h-5 w-5" /> Manual Global IP Block
                    </CardTitle>
                    <CardDescription>
                        Immediately block a suspicious IP from deposit, withdraw, conversion, and P2P payment operations.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="manual-ip">IP Address</Label>
                            <Input
                                id="manual-ip"
                                value={manualIp}
                                onChange={(e) => setManualIp(e.target.value)}
                                placeholder="e.g. 203.0.113.18"
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
                                data-testid="input-manual-reason"
                            />
                        </div>
                    </div>
                    <div className="mt-3">
                        <Button
                            onClick={onManualBlock}
                            disabled={blockIpMutation.isPending || !manualIp.trim()}
                            data-testid="button-manual-block-ip"
                        >
                            <ShieldAlert className="h-4 w-4 me-2" /> Block IP
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="grid gap-3 md:grid-cols-12">
                        <div className="relative md:col-span-6">
                            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by IP or block reason"
                                className="ps-9"
                                data-testid="input-search-ip-security"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <Select value={windowHours} onValueChange={setWindowHours}>
                                <SelectTrigger data-testid="select-window-hours">
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
                                variant={flaggedOnly ? "default" : "outline"}
                                onClick={() => setFlaggedOnly((prev) => !prev)}
                                data-testid="button-toggle-flagged-only"
                            >
                                <AlertTriangle className="h-4 w-4 me-2" /> Flagged Only
                            </Button>
                            <Button
                                type="button"
                                variant={activeOnlyBlocks ? "default" : "outline"}
                                onClick={() => setActiveOnlyBlocks((prev) => !prev)}
                                data-testid="button-toggle-active-only-blocks"
                            >
                                <Ban className="h-4 w-4 me-2" /> Active Blocks
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="usage" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="usage">IP Risk Intelligence</TabsTrigger>
                    <TabsTrigger value="blocked">Global Block Control</TabsTrigger>
                </TabsList>

                <TabsContent value="usage">
                    <Card>
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
                                <p className="text-sm text-muted-foreground">No payment IP activity found for this filter set.</p>
                            ) : (
                                <div className="rounded-md border overflow-x-auto">
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
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setSelectedIpForDetails(row.ipAddress)}
                                                                data-testid={`button-investigate-${row.ipAddress}`}
                                                            >
                                                                <Eye className="h-4 w-4 me-1" /> Inspect
                                                            </Button>

                                                            {row.isBlocked ? (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                                    disabled={unblockIpMutation.isPending}
                                                                    data-testid={`button-usage-unblock-${row.ipAddress}`}
                                                                >
                                                                    <ShieldCheck className="h-4 w-4 me-1" /> Unblock
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={() => onQuickBlock(row)}
                                                                    disabled={blockIpMutation.isPending}
                                                                    data-testid={`button-usage-block-${row.ipAddress}`}
                                                                >
                                                                    <ShieldAlert className="h-4 w-4 me-1" /> Block
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="blocked">
                    <Card>
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
                                <p className="text-sm text-muted-foreground">No blocked IP records for current filter.</p>
                            ) : (
                                <div className="rounded-md border overflow-x-auto">
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
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setSelectedIpForDetails(row.ipAddress)}
                                                                data-testid={`button-blocked-inspect-${row.ipAddress}`}
                                                            >
                                                                <Eye className="h-4 w-4 me-1" /> Inspect
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                                disabled={unblockIpMutation.isPending}
                                                                data-testid={`button-unblock-${row.ipAddress}`}
                                                            >
                                                                <ShieldCheck className="h-4 w-4 me-1" /> Unblock
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={Boolean(selectedIpForDetails)} onOpenChange={(open) => !open && setSelectedIpForDetails(null)}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
                                <Card>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Distinct Accounts</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.distinctUsers}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Operations</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.operationsCount}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Token Failures</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.tokenFailures}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-6">
                                        <p className="text-xs text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Risk</p>
                                        <p className="text-2xl font-bold">{selectedIpDetails.metrics.riskScore}</p>
                                        <Badge variant={riskBadgeVariant(selectedIpDetails.metrics.riskLevel)} className="mt-1">
                                            {selectedIpDetails.metrics.riskLevel.toUpperCase()}
                                        </Badge>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="rounded-lg border p-3 bg-muted/30">
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
                                <Card>
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

                            <Card>
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

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Accounts Using This IP</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {selectedIpDetails.usersByActivity.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No accounts in this time window.</p>
                                    ) : (
                                        <div className="rounded-md border overflow-x-auto">
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
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm">Recent Payment Activity</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {selectedIpDetails.recentActivities.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No recent payment activity for this IP.</p>
                                        ) : (
                                            <div className="rounded-md border overflow-x-auto">
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

                                <Card>
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
                                            <div className="rounded-md border overflow-x-auto">
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
