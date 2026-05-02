import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { adminFetch } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Building2,
    Coins,
    CreditCard,
    Package,
    Plus,
    RefreshCw,
    CheckCircle2,
    Clock3,
    XCircle,
    Save,
    Shield,
    Wallet,
} from "lucide-react";

type InvestmentStock = {
    id: string;
    symbol: string;
    nameEn: string;
    nameAr: string;
    descriptionEn?: string | null;
    descriptionAr?: string | null;
    pricePerShare: string;
    totalShares: number;
    availableShares: number;
    minPurchaseShares: number;
    maxPurchaseShares: number;
    isActive: boolean;
    isFeatured: boolean;
    sortOrder: number;
    colorClass: string;
    accentColor: string;
    createdAt: string;
    updatedAt: string;
};

type InvestmentPaymentMethod = {
    id: string;
    title: string;
    titleAr?: string | null;
    type: string;
    accountName?: string | null;
    accountNumber?: string | null;
    details?: string | null;
    instructions?: string | null;
    currency: string;
    isActive: boolean;
    sortOrder: number;
};

type InvestmentOrder = {
    id: string;
    userId: string;
    stockId: string;
    paymentMethodId?: string | null;
    shares: number;
    pricePerShare: string;
    totalAmount: string;
    status: string;
    investorName?: string | null;
    investorPhone?: string | null;
    investorEmail?: string | null;
    referenceNote?: string | null;
    adminNote?: string | null;
    receiptUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    stock?: InvestmentStock | null;
    paymentMethod?: InvestmentPaymentMethod | null;
    user?: { id: string; username?: string; email?: string } | null;
};

const stockSchema = z.object({
    symbol: z.string().min(1),
    nameEn: z.string().min(1),
    nameAr: z.string().min(1),
    descriptionEn: z.string().optional(),
    descriptionAr: z.string().optional(),
    pricePerShare: z.string().min(1),
    totalShares: z.coerce.number().int().min(0),
    availableShares: z.coerce.number().int().min(0),
    minPurchaseShares: z.coerce.number().int().min(1),
    maxPurchaseShares: z.coerce.number().int().min(1),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    sortOrder: z.coerce.number().int().min(0),
    colorClass: z.string().min(1),
    accentColor: z.string().min(1),
});

const paymentSchema = z.object({
    title: z.string().min(1),
    titleAr: z.string().optional(),
    type: z.enum(["bank_transfer", "e_wallet", "crypto", "card", "manual"]),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    details: z.string().optional(),
    instructions: z.string().optional(),
    currency: z.string().min(1),
    isActive: z.boolean(),
    sortOrder: z.coerce.number().int().min(0),
});

const orderStatusSchema = z.object({
    status: z.enum(["pending", "approved", "rejected", "cancelled", "completed"]),
    adminNote: z.string().optional(),
});

type StockForm = z.infer<typeof stockSchema>;
type PaymentForm = z.infer<typeof paymentSchema>;
type OrderStatusForm = z.infer<typeof orderStatusSchema>;

type StocksResponse = { stocks: InvestmentStock[] };
type PaymentMethodsResponse = { paymentMethods: InvestmentPaymentMethod[] };
type OrdersResponse = { orders: InvestmentOrder[] };

function formatMoney(value: string | number | null | undefined): string {
    const amount = Number.parseFloat(String(value ?? "0"));
    if (!Number.isFinite(amount)) return "0.00";
    return amount.toFixed(2);
}

function formatDateTime(value?: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function toStockFormValue(stock: InvestmentStock): StockForm {
    return {
        symbol: stock.symbol,
        nameEn: stock.nameEn,
        nameAr: stock.nameAr,
        descriptionEn: stock.descriptionEn ?? "",
        descriptionAr: stock.descriptionAr ?? "",
        pricePerShare: stock.pricePerShare,
        totalShares: stock.totalShares,
        availableShares: stock.availableShares,
        minPurchaseShares: stock.minPurchaseShares,
        maxPurchaseShares: stock.maxPurchaseShares,
        isActive: stock.isActive,
        isFeatured: stock.isFeatured,
        sortOrder: stock.sortOrder,
        colorClass: stock.colorClass,
        accentColor: stock.accentColor,
    };
}

function toPaymentFormValue(payment: InvestmentPaymentMethod): PaymentForm {
    return {
        title: payment.title,
        titleAr: payment.titleAr ?? "",
        type: payment.type as PaymentForm["type"],
        accountName: payment.accountName ?? "",
        accountNumber: payment.accountNumber ?? "",
        details: payment.details ?? "",
        instructions: payment.instructions ?? "",
        currency: payment.currency,
        isActive: payment.isActive,
        sortOrder: payment.sortOrder,
    };
}

function StatCard({ title, value, icon: Icon, description }: { title: string; value: string; icon: typeof Building2; description: string; }) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">{title}</p>
                        <p className="mt-1 text-2xl font-bold">{value}</p>
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

export default function AdminInvestmentsPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("stocks");
    const [editingStock, setEditingStock] = useState<InvestmentStock | null>(null);
    const [editingPayment, setEditingPayment] = useState<InvestmentPaymentMethod | null>(null);
    const [editingOrder, setEditingOrder] = useState<InvestmentOrder | null>(null);

    const { data: stocksData, isLoading: stocksLoading } = useQuery<StocksResponse>({
        queryKey: ["/api/admin/invest/stocks"],
        queryFn: () => adminFetch("/api/admin/invest/stocks"),
    });

    const { data: paymentsData, isLoading: paymentsLoading } = useQuery<PaymentMethodsResponse>({
        queryKey: ["/api/admin/invest/payment-methods"],
        queryFn: () => adminFetch("/api/admin/invest/payment-methods"),
    });

    const { data: ordersData, isLoading: ordersLoading } = useQuery<OrdersResponse>({
        queryKey: ["/api/admin/invest/orders"],
        queryFn: () => adminFetch("/api/admin/invest/orders"),
        refetchInterval: 30000,
    });

    const stockForm = useForm<StockForm>({
        resolver: zodResolver(stockSchema),
        defaultValues: {
            symbol: "",
            nameEn: "",
            nameAr: "",
            descriptionEn: "",
            descriptionAr: "",
            pricePerShare: "0.00",
            totalShares: 0,
            availableShares: 0,
            minPurchaseShares: 1,
            maxPurchaseShares: 1000,
            isActive: true,
            isFeatured: false,
            sortOrder: 0,
            colorClass: "bg-sky-500/20 text-sky-500",
            accentColor: "#0ea5e9",
        },
    });

    const paymentForm = useForm<PaymentForm>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            title: "",
            titleAr: "",
            type: "bank_transfer",
            accountName: "",
            accountNumber: "",
            details: "",
            instructions: "",
            currency: "USD",
            isActive: true,
            sortOrder: 0,
        },
    });

    const orderForm = useForm<OrderStatusForm>({
        resolver: zodResolver(orderStatusSchema),
        defaultValues: { status: "pending", adminNote: "" },
    });

    const stocks = stocksData?.stocks || [];
    const payments = paymentsData?.paymentMethods || [];
    const orders = ordersData?.orders || [];

    useEffect(() => {
        if (editingStock) {
            stockForm.reset(toStockFormValue(editingStock));
        }
    }, [editingStock, stockForm]);

    useEffect(() => {
        if (editingPayment) {
            paymentForm.reset(toPaymentFormValue(editingPayment));
        }
    }, [editingPayment, paymentForm]);

    useEffect(() => {
        if (editingOrder) {
            orderForm.reset({
                status: editingOrder.status as OrderStatusForm["status"],
                adminNote: editingOrder.adminNote || "",
            });
        }
    }, [editingOrder, orderForm]);

    const refreshAll = async () => {
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/invest/stocks"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/invest/payment-methods"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/invest/orders"] });
    };

    const stockMutation = useMutation({
        mutationFn: async (payload: StockForm & { id?: string }) => {
            if (payload.id) {
                return adminFetch(`/api/admin/invest/stocks/${payload.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
            }
            return adminFetch("/api/admin/invest/stocks", {
                method: "POST",
                body: JSON.stringify(payload),
            });
        },
        onSuccess: async () => {
            toast({ title: "Stock saved" });
            setEditingStock(null);
            stockForm.reset();
            await refreshAll();
        },
        onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
    });

    const stockDeleteMutation = useMutation({
        mutationFn: (id: string) => adminFetch(`/api/admin/invest/stocks/${id}`, { method: "DELETE" }),
        onSuccess: async () => {
            toast({ title: "Stock deleted" });
            await refreshAll();
        },
        onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
    });

    const paymentMutation = useMutation({
        mutationFn: async (payload: PaymentForm & { id?: string }) => {
            if (payload.id) {
                return adminFetch(`/api/admin/invest/payment-methods/${payload.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
            }
            return adminFetch("/api/admin/invest/payment-methods", {
                method: "POST",
                body: JSON.stringify(payload),
            });
        },
        onSuccess: async () => {
            toast({ title: "Payment method saved" });
            setEditingPayment(null);
            paymentForm.reset();
            await refreshAll();
        },
        onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
    });

    const paymentDeleteMutation = useMutation({
        mutationFn: (id: string) => adminFetch(`/api/admin/invest/payment-methods/${id}`, { method: "DELETE" }),
        onSuccess: async () => {
            toast({ title: "Payment method deleted" });
            await refreshAll();
        },
        onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
    });

    const orderMutation = useMutation({
        mutationFn: async ({ id, ...payload }: { id: string } & OrderStatusForm) =>
            adminFetch(`/api/admin/invest/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            }),
        onSuccess: async () => {
            toast({ title: "Order updated" });
            setEditingOrder(null);
            await refreshAll();
        },
        onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
    });

    const totals = useMemo(() => {
        const totalShares = stocks.reduce((sum, stock) => sum + Number(stock.totalShares || 0), 0);
        const availableShares = stocks.reduce((sum, stock) => sum + Number(stock.availableShares || 0), 0);
        const raised = stocks.reduce((sum, stock) => sum + (Number(stock.totalShares || 0) - Number(stock.availableShares || 0)) * Number(stock.pricePerShare || 0), 0);
        return { totalShares, availableShares, raised };
    }, [stocks]);

    const openNewStock = () => {
        setEditingStock(null);
        stockForm.reset({
            symbol: "",
            nameEn: "",
            nameAr: "",
            descriptionEn: "",
            descriptionAr: "",
            pricePerShare: "0.00",
            totalShares: 0,
            availableShares: 0,
            minPurchaseShares: 1,
            maxPurchaseShares: 1000,
            isActive: true,
            isFeatured: false,
            sortOrder: stocks.length + 1,
            colorClass: "bg-sky-500/20 text-sky-500",
            accentColor: "#0ea5e9",
        });
    };

    const openNewPayment = () => {
        setEditingPayment(null);
        paymentForm.reset({
            title: "",
            titleAr: "",
            type: "bank_transfer",
            accountName: "",
            accountNumber: "",
            details: "",
            instructions: "",
            currency: "USD",
            isActive: true,
            sortOrder: payments.length + 1,
        });
    };

    return (
        <div className="min-h-[100svh] space-y-5 p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-2xl">
                                <Building2 className="h-6 w-6 text-primary" />
                                Investment Administration
                            </CardTitle>
                            <CardDescription>
                                Manage company shares, purchase requests, and payment methods used for share purchases.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={refreshAll}>
                                <RefreshCw className="me-2 h-4 w-4" />
                                Refresh
                            </Button>
                            <Button onClick={() => setActiveTab("stocks")}>
                                <Plus className="me-2 h-4 w-4" />
                                New stock
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid gap-3 md:grid-cols-3">
                <StatCard title="Total shares" value={String(totals.totalShares)} icon={Package} description="All configured stock units" />
                <StatCard title="Available shares" value={String(totals.availableShares)} icon={Shield} description="Still open for purchase" />
                <StatCard title="Raised value" value={`$${formatMoney(totals.raised)}`} icon={Coins} description="Based on sold shares" />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="stocks">Stocks</TabsTrigger>
                    <TabsTrigger value="payments">Payment methods</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                </TabsList>

                <TabsContent value="stocks" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-3">
                            <div>
                                <CardTitle>Company shares</CardTitle>
                                <CardDescription>Create and edit the share packages visible to investors.</CardDescription>
                            </div>
                            <Button onClick={() => { openNewStock(); }}>
                                <Plus className="me-2 h-4 w-4" />
                                Add stock
                            </Button>
                        </CardHeader>
                    </Card>

                    {stocksLoading ? (
                        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
                    ) : (
                        <div className="grid gap-3">
                            {stocks.map((stock) => (
                                <Card key={stock.id}>
                                    <CardContent className="p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold text-lg">{stock.nameEn}</h3>
                                                    <Badge>{stock.symbol}</Badge>
                                                    <Badge variant={stock.isActive ? "default" : "secondary"}>{stock.isActive ? "Active" : "Inactive"}</Badge>
                                                    {stock.isFeatured ? <Badge variant="outline">Featured</Badge> : null}
                                                </div>
                                                <p className="mt-2 text-sm text-muted-foreground">{stock.descriptionEn || stock.descriptionAr || "No description"}</p>
                                                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                                                    <div>Price/share: <span className="font-semibold">${formatMoney(stock.pricePerShare)}</span></div>
                                                    <div>Available: <span className="font-semibold">{stock.availableShares}</span></div>
                                                    <div>Min/Max: <span className="font-semibold">{stock.minPurchaseShares} / {stock.maxPurchaseShares}</span></div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" onClick={() => setEditingStock(stock)}>
                                                    Edit
                                                </Button>
                                                <Button variant="destructive" onClick={() => stockDeleteMutation.mutate(stock.id)}>
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {stocks.length === 0 && (
                                <Card><CardContent className="p-6 text-sm text-muted-foreground">No stocks configured yet.</CardContent></Card>
                            )}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>{editingStock ? "Edit stock" : "Create stock"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...stockForm}>
                                <form className="grid gap-4 md:grid-cols-2" onSubmit={stockForm.handleSubmit((values) => stockMutation.mutate({ ...values, id: editingStock?.id }))}>
                                    <FormField control={stockForm.control} name="symbol" render={({ field }) => (
                                        <FormItem><FormLabel>Symbol</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="pricePerShare" render={({ field }) => (
                                        <FormItem><FormLabel>Price per share</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="nameEn" render={({ field }) => (
                                        <FormItem><FormLabel>Name EN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="nameAr" render={({ field }) => (
                                        <FormItem><FormLabel>Name AR</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="totalShares" render={({ field }) => (
                                        <FormItem><FormLabel>Total shares</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="availableShares" render={({ field }) => (
                                        <FormItem><FormLabel>Available shares</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="minPurchaseShares" render={({ field }) => (
                                        <FormItem><FormLabel>Min purchase</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="maxPurchaseShares" render={({ field }) => (
                                        <FormItem><FormLabel>Max purchase</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="sortOrder" render={({ field }) => (
                                        <FormItem><FormLabel>Sort order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="accentColor" render={({ field }) => (
                                        <FormItem><FormLabel>Accent color</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="colorClass" render={({ field }) => (
                                        <FormItem className="md:col-span-2"><FormLabel>Color class</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="descriptionEn" render={({ field }) => (
                                        <FormItem className="md:col-span-2"><FormLabel>Description EN</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={stockForm.control} name="descriptionAr" render={({ field }) => (
                                        <FormItem className="md:col-span-2"><FormLabel>Description AR</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
                                        <div className="flex items-center justify-between rounded-lg border p-4">
                                            <div>
                                                <Label>Active</Label>
                                                <p className="text-xs text-muted-foreground">Show in invest page</p>
                                            </div>
                                            <FormField control={stockForm.control} name="isActive" render={({ field }) => (
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            )} />
                                        </div>
                                        <div className="flex items-center justify-between rounded-lg border p-4">
                                            <div>
                                                <Label>Featured</Label>
                                                <p className="text-xs text-muted-foreground">Highlight to investors</p>
                                            </div>
                                            <FormField control={stockForm.control} name="isFeatured" render={({ field }) => (
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            )} />
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 flex gap-2 justify-end">
                                        <Button type="button" variant="outline" onClick={() => { setEditingStock(null); openNewStock(); }}>
                                            Reset
                                        </Button>
                                        <Button type="submit" disabled={stockMutation.isPending}>
                                            <Save className="me-2 h-4 w-4" />
                                            Save stock
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payments" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-3">
                            <div>
                                <CardTitle>Payment methods</CardTitle>
                                <CardDescription>Manage bank transfers, wallets, crypto and manual payment channels.</CardDescription>
                            </div>
                            <Button onClick={() => { openNewPayment(); }}>
                                <Plus className="me-2 h-4 w-4" />
                                Add method
                            </Button>
                        </CardHeader>
                    </Card>

                    {paymentsLoading ? (
                        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
                    ) : (
                        <div className="grid gap-3">
                            {payments.map((payment) => (
                                <Card key={payment.id}>
                                    <CardContent className="p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold text-lg">{payment.title}</h3>
                                                    <Badge>{payment.type}</Badge>
                                                    <Badge variant={payment.isActive ? "default" : "secondary"}>{payment.isActive ? "Active" : "Inactive"}</Badge>
                                                </div>
                                                <p className="mt-2 text-sm text-muted-foreground">{payment.accountName || payment.details || payment.instructions || "No details"}</p>
                                                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                                                    <div>Currency: <span className="font-semibold">{payment.currency}</span></div>
                                                    <div>Account: <span className="font-semibold">{payment.accountNumber || "-"}</span></div>
                                                    <div>Order: <span className="font-semibold">{payment.sortOrder}</span></div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" onClick={() => setEditingPayment(payment)}>
                                                    Edit
                                                </Button>
                                                <Button variant="destructive" onClick={() => paymentDeleteMutation.mutate(payment.id)}>
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {payments.length === 0 && (
                                <Card><CardContent className="p-6 text-sm text-muted-foreground">No payment methods configured yet.</CardContent></Card>
                            )}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>{editingPayment ? "Edit payment method" : "Create payment method"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...paymentForm}>
                                <form className="grid gap-4 md:grid-cols-2" onSubmit={paymentForm.handleSubmit((values) => paymentMutation.mutate({ ...values, id: editingPayment?.id }))}>
                                    <FormField control={paymentForm.control} name="title" render={({ field }) => (
                                        <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={paymentForm.control} name="titleAr" render={({ field }) => (
                                        <FormItem><FormLabel>Title AR</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={paymentForm.control} name="type" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Type</FormLabel>
                                            <FormControl>
                                                <select
                                                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                >
                                                    <option value="bank_transfer">Bank transfer</option>
                                                    <option value="e_wallet">E-wallet</option>
                                                    <option value="crypto">Crypto</option>
                                                    <option value="card">Card</option>
                                                    <option value="manual">Manual</option>
                                                </select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={paymentForm.control} name="currency" render={({ field }) => (
                                        <FormItem><FormLabel>Currency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={paymentForm.control} name="accountName" render={({ field }) => (
                                        <FormItem><FormLabel>Account name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={paymentForm.control} name="accountNumber" render={({ field }) => (
                                        <FormItem><FormLabel>Account number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={paymentForm.control} name="sortOrder" render={({ field }) => (
                                        <FormItem><FormLabel>Sort order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <div className="md:col-span-2 grid gap-4">
                                        <FormField control={paymentForm.control} name="details" render={({ field }) => (
                                            <FormItem><FormLabel>Details</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={paymentForm.control} name="instructions" render={({ field }) => (
                                            <FormItem><FormLabel>Instructions</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-4">
                                        <div>
                                            <Label>Active</Label>
                                            <p className="text-xs text-muted-foreground">Show to investors</p>
                                        </div>
                                        <FormField control={paymentForm.control} name="isActive" render={({ field }) => (
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        )} />
                                    </div>
                                    <div className="md:col-span-2 flex gap-2 justify-end">
                                        <Button type="button" variant="outline" onClick={() => { setEditingPayment(null); openNewPayment(); }}>
                                            Reset
                                        </Button>
                                        <Button type="submit" disabled={paymentMutation.isPending}>
                                            <Save className="me-2 h-4 w-4" />
                                            Save method
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="orders" className="space-y-4">
                    {ordersLoading ? (
                        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
                    ) : (
                        <div className="grid gap-3">
                            {orders.map((order) => (
                                <Card key={order.id}>
                                    <CardContent className="p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold text-lg">{order.stock?.nameEn || "Investment order"}</h3>
                                                    <Badge>{order.status}</Badge>
                                                </div>
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    Investor: {order.investorName || order.user?.username || "Unknown"} · Shares: {order.shares} · Total: ${formatMoney(order.totalAmount)}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Created: {formatDateTime(order.createdAt)} · Payment: {order.paymentMethod?.title || "None"}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" onClick={() => setEditingOrder(order)}>
                                                    Review
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {orders.length === 0 && (
                                <Card><CardContent className="p-6 text-sm text-muted-foreground">No investment orders yet.</CardContent></Card>
                            )}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Review order</DialogTitle>
                        <DialogDescription>Update the purchase status and add an admin note.</DialogDescription>
                    </DialogHeader>
                    <Form {...orderForm}>
                        <form className="space-y-4" onSubmit={orderForm.handleSubmit((values) => {
                            if (!editingOrder) return;
                            orderMutation.mutate({ id: editingOrder.id, ...values });
                        })}>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-lg border p-3">
                                    <div className="text-xs text-muted-foreground">Investor</div>
                                    <div className="font-semibold">{editingOrder?.investorName || editingOrder?.user?.username || "-"}</div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="text-xs text-muted-foreground">Total</div>
                                    <div className="font-semibold">${formatMoney(editingOrder?.totalAmount)}</div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="text-xs text-muted-foreground">Shares</div>
                                    <div className="font-semibold">{editingOrder?.shares || 0}</div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="text-xs text-muted-foreground">Receipt</div>
                                    <div className="font-semibold truncate">{editingOrder?.receiptUrl || "-"}</div>
                                </div>
                            </div>

                            <FormField
                                control={orderForm.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Status</FormLabel>
                                        <FormControl>
                                            <select
                                                className="h-10 w-full rounded-md border bg-background px-3"
                                                value={field.value}
                                                onChange={field.onChange}
                                            >
                                                <option value="pending">pending</option>
                                                <option value="approved">approved</option>
                                                <option value="rejected">rejected</option>
                                                <option value="cancelled">cancelled</option>
                                                <option value="completed">completed</option>
                                            </select>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={orderForm.control}
                                name="adminNote"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Admin note</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Add internal review note..." />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEditingOrder(null)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={orderMutation.isPending}>
                                    <CheckCircle2 className="me-2 h-4 w-4" />
                                    Save order
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
