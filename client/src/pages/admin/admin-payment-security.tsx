import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, Ban, Search, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    lastSeenAt: string;
    isBlocked: boolean;
}

export default function AdminPaymentSecurityPage() {
    const { toast } = useToast();
    const [manualIp, setManualIp] = useState("");
    const [manualReason, setManualReason] = useState("Manual payment fraud block");
    const [search, setSearch] = useState("");

    const { data: blockedIps, isLoading: blockedLoading, refetch: refetchBlocked } = useQuery<BlockedIpRow[]>({
        queryKey: ["/api/admin/payment-security/blocked-ips"],
        queryFn: () => adminFetch("/api/admin/payment-security/blocked-ips?activeOnly=true&limit=500"),
    });

    const { data: usageRows, isLoading: usageLoading, refetch: refetchUsage } = useQuery<UsageRow[]>({
        queryKey: ["/api/admin/payment-security/ip-usage"],
        queryFn: () => adminFetch("/api/admin/payment-security/ip-usage?windowHours=72&limit=500"),
    });

    const blockIpMutation = useMutation({
        mutationFn: () => adminFetch("/api/admin/payment-security/blocked-ips/block", {
            method: "POST",
            body: JSON.stringify({
                ipAddress: manualIp,
                reason: manualReason,
            }),
        }),
        onSuccess: () => {
            setManualIp("");
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/blocked-ips"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-security/ip-usage"] });
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
            toast({ title: "IP unblocked", description: "Payment operations are re-enabled for this IP." });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const filteredBlockedIps = useMemo(() => {
        const rows = blockedIps || [];
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => row.ipAddress.toLowerCase().includes(q));
    }, [blockedIps, search]);

    const filteredUsageRows = useMemo(() => {
        const rows = usageRows || [];
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => row.ipAddress.toLowerCase().includes(q));
    }, [usageRows, search]);

    const loading = blockedLoading || usageLoading;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Payment Security IP Control</h1>
                    <p className="text-sm text-muted-foreground">
                        Monitor multi-account payment activity per IP and control global payment IP blocks.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => { refetchBlocked(); refetchUsage(); }} data-testid="button-refresh-ip-security">
                        <RefreshCw className="h-4 w-4 me-2" /> Refresh
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Ban className="h-5 w-5" /> Manual IP Block
                    </CardTitle>
                    <CardDescription>
                        Use this to immediately block a suspicious IP from all payment operations.
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
                                placeholder="e.g. 192.168.1.100"
                                data-testid="input-manual-ip"
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="manual-reason">Reason</Label>
                            <Input
                                id="manual-reason"
                                value={manualReason}
                                onChange={(e) => setManualReason(e.target.value)}
                                data-testid="input-manual-reason"
                            />
                        </div>
                    </div>
                    <div className="mt-3">
                        <Button
                            onClick={() => blockIpMutation.mutate()}
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
                    <div className="relative">
                        <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search IP"
                            className="ps-9"
                            data-testid="input-search-ip-security"
                        />
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="blocked" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="blocked">Blocked IPs</TabsTrigger>
                    <TabsTrigger value="usage">IP Usage</TabsTrigger>
                </TabsList>

                <TabsContent value="blocked">
                    <Card>
                        <CardHeader>
                            <CardTitle>Active Payment Blocks</CardTitle>
                            <CardDescription>
                                These IPs cannot execute deposit, withdrawal, conversion, or P2P payment actions.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Loading...</p>
                            ) : filteredBlockedIps.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No active blocked IPs.</p>
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
                                            {filteredBlockedIps.map((row) => (
                                                <TableRow key={row.id}>
                                                    <TableCell className="font-mono text-xs">{row.ipAddress}</TableCell>
                                                    <TableCell className="max-w-[420px] truncate">{row.blockReason}</TableCell>
                                                    <TableCell>
                                                        {row.autoBlocked ? (
                                                            <Badge variant="destructive">Auto</Badge>
                                                        ) : (
                                                            <Badge variant="secondary">Manual</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{new Date(row.blockedAt).toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => unblockIpMutation.mutate(row.ipAddress)}
                                                            disabled={unblockIpMutation.isPending}
                                                            data-testid={`button-unblock-${row.ipAddress}`}
                                                        >
                                                            <ShieldCheck className="h-4 w-4 me-2" /> Unblock
                                                        </Button>
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

                <TabsContent value="usage">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent IP Activity (72h)</CardTitle>
                            <CardDescription>
                                Shows how many distinct accounts used each IP for payment operations.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Loading...</p>
                            ) : filteredUsageRows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No payment IP activity yet.</p>
                            ) : (
                                <div className="rounded-md border overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>IP</TableHead>
                                                <TableHead>Distinct Accounts</TableHead>
                                                <TableHead>Operations</TableHead>
                                                <TableHead>Last Seen</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredUsageRows.map((row) => (
                                                <TableRow key={row.ipAddress}>
                                                    <TableCell className="font-mono text-xs">{row.ipAddress}</TableCell>
                                                    <TableCell>{row.distinctUsers}</TableCell>
                                                    <TableCell>{row.operationsCount}</TableCell>
                                                    <TableCell>{new Date(row.lastSeenAt).toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        {row.isBlocked ? (
                                                            <Badge variant="destructive">Blocked</Badge>
                                                        ) : (
                                                            <Badge variant="outline">Allowed</Badge>
                                                        )}
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
        </div>
    );
}
