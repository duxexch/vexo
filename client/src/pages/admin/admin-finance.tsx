import { useMemo, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adminFetch } from "@/lib/admin-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Building2,
    Crown,
    ArrowRightLeft,
    Wallet,
    Coins,
    TrendingUp,
    Clock3,
    ShieldCheck,
    RefreshCw,
    ExternalLink,
    PieChart,
    Users,
    BadgeCheck,
    AlertTriangle,
    BarChart3,
    Landmark,
    Globe2,
    Activity,
    ReceiptText,
    HandCoins,
    Package,
} from "lucide-react";

type InvestmentStock = {
    id: string;
    symbol: string;
    nameEn: string;
    nameAr: string;
    pricePerShare: string;
    totalShares: number;
    availableShares: number;
    isActive: boolean;
    isFeatured: boolean;
    sortOrder: number;
};

type InvestmentPaymentMethod = {
    id: string;
    title: string;
    type: string;
    currency: string;
    isActive: boolean;
    sortOrder: number;
};

type InvestmentOrder = {
    id: string;
    shares: number;
    pricePerShare: string;
    totalAmount: string;
    status: string;
    createdAt: string;
    stock?: InvestmentStock | null;
    paymentMethod?: InvestmentPaymentMethod | null;
    user?: { id: string; username?: string | null; email?: string | null } | null;
};

type MarketerListItem = {
    id: string;
    user_id: string;
    username?: string;
    nickname?: string | null;
    marketer_status: string;
    total_commission_earned: string;
    pending_commission: string;
    total_withdrawable_commission: string;
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

type InvestmentsResponse = {
    stocks: InvestmentStock[];
    paymentMethods: InvestmentPaymentMethod[];
    orders: InvestmentOrder[];
};

type MarketersResponse = {
    marketers: MarketerListItem[];
};

function formatMoney(value: string | number | null | undefined): string {
    const amount = Number.parseFloat(String(value ?? "0"));
    return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function formatDateTime(value?: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function StatCard({
    title,
    value,
    description,
    icon: Icon,
}: {
    title: string;
    value: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">{title}</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                    </div>
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function MiniMetric({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint: string;
}) {
    return (
        <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>
    );
}

export default function AdminFinancePage() {
    const { data: investmentsData, isLoading: investmentsLoading, refetch: refetchInvestments } = useQuery<InvestmentsResponse>({
        queryKey: ["/api/admin/invest/stocks", "/api/admin/invest/payment-methods", "/api/admin/invest/orders"],
        queryFn: async () => {
            const [stocksResult, methodsResult, ordersResult] = await Promise.all([
                adminFetch("/api/admin/invest/stocks"),
                adminFetch("/api/admin/invest/payment-methods"),
                adminFetch("/api/admin/invest/orders"),
            ]);
            return {
                stocks: stocksResult.stocks || [],
                paymentMethods: methodsResult.paymentMethods || [],
                orders: ordersResult.orders || [],
            };
        },
        refetchInterval: 30_000,
    });

    const { data: marketersData, isLoading: marketersLoading, refetch: refetchMarketers } = useQuery<MarketersResponse>({
        queryKey: ["/api/admin/free-play/marketers", "finance-summary"],
        queryFn: () => adminFetch("/api/admin/free-play/marketers?limit=200"),
        staleTime: 20_000,
        refetchInterval: 30_000,
    });

    const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<MarketerOverviewResponse>({
        queryKey: ["/api/admin/free-play/marketers/overview", "finance-summary"],
        queryFn: () => adminFetch("/api/admin/free-play/marketers/overview"),
        staleTime: 20_000,
        refetchInterval: 30_000,
    });

    const stocks = investmentsData?.stocks || [];
    const paymentMethods = investmentsData?.paymentMethods || [];
    const orders = investmentsData?.orders || [];
    const marketers = marketersData?.marketers || [];
    const summary = overviewData?.summary;

    const totals = useMemo(() => {
        const totalShares = stocks.reduce((sum, stock) => sum + Number(stock.totalShares || 0), 0);
        const availableShares = stocks.reduce((sum, stock) => sum + Number(stock.availableShares || 0), 0);
        const soldShares = totalShares - availableShares;
        const investedValue = stocks.reduce((sum, stock) => {
            const sold = Number(stock.totalShares || 0) - Number(stock.availableShares || 0);
            return sum + sold * Number(stock.pricePerShare || 0);
        }, 0);
        const pendingOrders = orders.filter((order) => order.status === "pending").length;
        const approvedOrders = orders.filter((order) => order.status === "approved" || order.status === "completed").length;
        const activeStocks = stocks.filter((stock) => stock.isActive).length;
        const featuredStocks = stocks.filter((stock) => stock.isFeatured).length;
        return { totalShares, availableShares, soldShares, investedValue, pendingOrders, approvedOrders, activeStocks, featuredStocks };
    }, [stocks, orders]);

    const totalMarketers = Number(summary?.total_marketers || 0);
    const approvedMarketers = Number(summary?.approved_marketers || 0);
    const pendingMarketers = Number(summary?.pending_marketers || 0);
    const revokedMarketers = Number(summary?.revoked_marketers || 0);

    const topMarketer = overviewData?.topMarketers?.[0] || null;
    const recentOrders = [...orders].slice(0, 5);

    const refreshAll = async () => {
        await Promise.all([refetchInvestments(), refetchMarketers(), refetchOverview()]);
    };

    const economyHealth =
        totals.pendingOrders > 0 || pendingMarketers > 0 ? "Needs review" : "Stable";

    return (
        <div className="min-h-[100svh] space-y-5 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4 md:p-6">
            <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 via-background to-background">
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Unified finance
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <PieChart className="h-3.5 w-3.5" />
                                    Economy overview
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <Globe2 className="h-3.5 w-3.5" />
                                    One control center
                                </Badge>
                            </div>
                            <CardTitle className="flex items-center gap-2 text-2xl">
                                <Building2 className="h-6 w-6 text-sky-500" />
                                اللوحة المالية الموحدة
                            </CardTitle>
                            <CardDescription className="max-w-3xl">
                                شاشة واحدة لمراقبة الاستثمار، الطلبات، طرق الدفع، المسوقين، والعمولات التشغيلية — مع روابط مباشرة للتشغيل السريع.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={refreshAll}>
                                <RefreshCw className="me-2 h-4 w-4" />
                                Refresh
                            </Button>
                            <Button asChild>
                                <Link href="/admin/investments">
                                    <ExternalLink className="me-2 h-4 w-4" />
                                    Open investments
                                </Link>
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <StatCard
                    title="إجمالي الأسهم"
                    value={investmentsLoading ? "..." : String(totals.totalShares)}
                    description="كل الوحدات المعرّفة"
                    icon={Wallet}
                />
                <StatCard
                    title="المتاح"
                    value={investmentsLoading ? "..." : String(totals.availableShares)}
                    description="جاهز للشراء"
                    icon={Coins}
                />
                <StatCard
                    title="قيمة الاستثمار"
                    value={investmentsLoading ? "..." : `$${formatMoney(totals.investedValue)}`}
                    description="محسوبة من الأسهم المباعة"
                    icon={TrendingUp}
                />
                <StatCard
                    title="المسوّقون"
                    value={marketersLoading || overviewLoading ? "..." : String(totalMarketers)}
                    description="الحسابات المسوقة"
                    icon={Users}
                />
                <StatCard
                    title="المعتمدون"
                    value={overviewLoading ? "..." : String(approvedMarketers)}
                    description="مسوقون معتمدون"
                    icon={BadgeCheck}
                />
                <StatCard
                    title="قيد المراجعة"
                    value={investmentsLoading ? "..." : String(totals.pendingOrders)}
                    description="طلبات تحتاج قراراً"
                    icon={Clock3}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Landmark className="h-4 w-4 text-sky-500" />
                            Snapshot of the economy
                        </CardTitle>
                        <CardDescription>مؤشرات تشغيلية سريعة توضح صحة الاقتصاد في اللحظة الحالية.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                        <MiniMetric
                            label="الصورة العامة"
                            value={economyHealth}
                            hint={`${totals.activeStocks} active stocks · ${totals.featuredStocks} featured`}
                        />
                        <MiniMetric
                            label="Shares sold"
                            value={String(totals.soldShares)}
                            hint="الوحدات الخارجة من المخزون"
                        />
                        <MiniMetric
                            label="Payment rails"
                            value={String(paymentMethods.length)}
                            hint="القنوات المالية المفعلة أو المعدة"
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Activity className="h-4 w-4 text-amber-500" />
                            Health snapshot
                        </CardTitle>
                        <CardDescription>إشارات سريعة للمراجعة اليومية.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Order flow</div>
                            <div className="mt-1 font-semibold">{totals.pendingOrders > 0 ? "Needs review" : "Clear"}</div>
                            <div className="text-xs text-muted-foreground">{totals.pendingOrders} pending orders</div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Marketer pipeline</div>
                            <div className="mt-1 font-semibold">{pendingMarketers > 0 ? "Backlog" : "Healthy"}</div>
                            <div className="text-xs text-muted-foreground">{pendingMarketers} pending marketers</div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Auto refresh</div>
                            <div className="mt-1 font-semibold">30s</div>
                            <div className="text-xs text-muted-foreground">Live dashboard updates</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-4 w-4 text-sky-500" />
                            الاستثمار والطلبات
                        </CardTitle>
                        <CardDescription>الأسهم، طرق الدفع، وحالة الطلبات الحالية.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {investmentsLoading ? (
                            <Skeleton className="h-48 w-full" />
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <MiniMetric label="Stocks" value={String(stocks.length)} hint={`${totals.activeStocks} active`} />
                                    <MiniMetric label="Payment methods" value={String(paymentMethods.length)} hint="Configured channels" />
                                    <MiniMetric label="Approved orders" value={String(totals.approvedOrders)} hint="Approved or completed" />
                                    <MiniMetric label="Pending orders" value={String(totals.pendingOrders)} hint="Needs review" />
                                </div>

                                <div className="space-y-2">
                                    {recentOrders.length > 0 ? recentOrders.map((order) => (
                                        <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                                            <div>
                                                <div className="font-medium">{order.stock?.nameEn || "Investment order"}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {order.user?.username || "Unknown user"} · {order.shares} shares · {formatDateTime(order.createdAt)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-semibold">${formatMoney(order.totalAmount)}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    <Badge variant={order.status === "pending" ? "secondary" : "outline"}>{order.status}</Badge>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                            لا توجد طلبات استثمار بعد.
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Crown className="h-4 w-4 text-amber-500" />
                            المسوقون والعمولات
                        </CardTitle>
                        <CardDescription>الرؤية المالية الخاصة بالمسوقين والبرنامج التشغيلي.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {overviewLoading ? (
                            <Skeleton className="h-48 w-full" />
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <MiniMetric label="Approved" value={String(approvedMarketers)} hint="مسوقون معتمدون" />
                                    <MiniMetric label="Pending" value={String(pendingMarketers)} hint="قيد المراجعة" />
                                    <MiniMetric label="Revoked" value={String(revokedMarketers)} hint="سحب صلاحية" />
                                    <MiniMetric label="Paid" value={formatMoney(summary?.total_paid)} hint="مدفوعات منفذة" />
                                </div>

                                <div className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">Total commissions</div>
                                    <div className="mt-1 text-xl font-bold">{formatMoney(summary?.total_commissions)}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        Pending {formatMoney(summary?.total_pending)} · Withdrawable {formatMoney(summary?.total_withdrawable)}
                                    </div>
                                </div>

                                {topMarketer ? (
                                    <div className="rounded-xl border p-3">
                                        <div className="text-xs text-muted-foreground">Top marketer</div>
                                        <div className="mt-1 font-semibold truncate">{topMarketer.nickname || topMarketer.username || "Unknown"}</div>
                                        <div className="text-xs text-muted-foreground">
                                            Referrals: {Number(topMarketer.total_referrals || 0)} · Earned: {formatMoney(topMarketer.total_commission_earned)}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="h-4 w-4 text-sky-500" />
                            Economy shortcuts
                        </CardTitle>
                        <CardDescription>روابط مباشرة لتشغيل الأجزاء المالية الأساسية.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/admin/investments">
                                <Building2 className="me-2 h-4 w-4" />
                                Manage investments
                            </Link>
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href="/admin/marketers">
                                <Crown className="me-2 h-4 w-4" />
                                Manage marketers
                            </Link>
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href="/admin/currency">
                                <Coins className="me-2 h-4 w-4" />
                                Currency controls
                            </Link>
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href="/admin/transactions">
                                <ArrowRightLeft className="me-2 h-4 w-4" />
                                Transactions
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Risk & compliance snapshot
                        </CardTitle>
                        <CardDescription>مؤشرات مختصرة للمراجعة المالية اليومية.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">RevShare coverage</div>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="font-semibold">{approvedMarketers}</span>
                                <span className="text-xs text-muted-foreground">approved accounts</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                RevShare-enabled approvals: dynamic operational pool.
                            </div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Pending backlog</div>
                            <div className="mt-1 text-2xl font-bold text-amber-500">{pendingMarketers}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Requires human review and faster badge decisions.
                            </div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-xs text-muted-foreground">Top operation</div>
                            <div className="mt-1 text-lg font-semibold truncate">
                                {topMarketer?.nickname || topMarketer?.username || "No data"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                {topMarketer ? `${Number(topMarketer.total_referrals || 0)} referrals` : "No marketer data yet"}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ReceiptText className="h-4 w-4 text-sky-500" />
                        Unified finance summary
                    </CardTitle>
                    <CardDescription>ملخص نهائي يربط الاستثمار، العمولة، والطلب التشغيلي في شاشة واحدة.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                    <MiniMetric
                        label="Investment value"
                        value={`$${formatMoney(totals.investedValue)}`}
                        hint="قيمة الأسهم المباعة"
                    />
                    <MiniMetric
                        label="Commission pool"
                        value={formatMoney(summary?.total_commissions)}
                        hint="إجمالي العمولات"
                    />
                    <MiniMetric
                        label="Withdrawable"
                        value={formatMoney(summary?.total_withdrawable)}
                        hint="متاح للسحب"
                    />
                    <MiniMetric
                        label="Pending operations"
                        value={String(totals.pendingOrders + pendingMarketers)}
                        hint="طلبات واستثناءات تحتاج متابعة"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
