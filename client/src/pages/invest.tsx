import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Users,
  Shield,
  Coins,
  Crown,
  Globe,
  Zap,
  CheckCircle2,
  Calendar,
  Briefcase,
  Building2,
  PieChart,
  Landmark,
  BadgeDollarSign,
  Loader2,
  Wallet,
  BadgeCheck,
  ArrowUpRight,
} from "lucide-react";
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  MarketingShell,
  SectionEyebrow,
  SectionHeading,
  Reveal,
  GlassCard,
  SpotlightCard,
  BLUE,
  GOLD,
} from "@/components/marketing";

type InvestmentStock = {
  id: string;
  symbol: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  pricePerShare: string;
  pricePerShareNumber?: number;
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
};

type StocksResponse = { stocks: InvestmentStock[] };
type PaymentMethodsResponse = { paymentMethods: InvestmentPaymentMethod[] };
type OrdersResponse = { orders: InvestmentOrder[] };

const ALLOC = [
  { key: "dev", value: 35, color: BLUE },
  { key: "marketing", value: 25, color: GOLD },
  { key: "expansion", value: 20, color: "#6366f1" },
  { key: "reserve", value: 12, color: "#22c55e" },
  { key: "research", value: 8, color: "#f43f5e" },
];

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

function formatShares(value: number): string {
  return new Intl.NumberFormat("en-US").format(Number.isFinite(value) ? value : 0);
}

export default function InvestPage() {
  const { t, dir } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const [selectedStockId, setSelectedStockId] = useState<string>("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>("");
  const [shares, setShares] = useState("10");
  const [investorName, setInvestorName] = useState("");
  const [investorPhone, setInvestorPhone] = useState("");
  const [investorEmail, setInvestorEmail] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  const { data: stocksData, isLoading: stocksLoading } = useQuery<StocksResponse>({
    queryKey: ["/api/invest/stocks"],
  });

  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = useQuery<PaymentMethodsResponse>({
    queryKey: ["/api/invest/payment-methods"],
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: ["/api/invest/orders"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/invest/orders");
      return (await res.json()) as OrdersResponse;
    },
    staleTime: 30_000,
  });

  const stocks = stocksData?.stocks || [];
  const paymentMethods = paymentMethodsData?.paymentMethods || [];
  const orders = ordersData?.orders || [];
  const selectedStock = stocks.find((stock) => stock.id === selectedStockId) ?? stocks[0] ?? null;
  const selectedPaymentMethod = paymentMethods.find((method) => method.id === selectedPaymentMethodId) ?? paymentMethods[0] ?? null;

  const stockHighlights = useMemo(() => {
    return stocks.slice(0, 3).map((stock, index) => ({
      key: stock.symbol,
      title: stock.nameEn,
      value: `${stock.pricePerShare} / share`,
      color: index % 2 === 0 ? GOLD : BLUE,
    }));
  }, [stocks]);

  const totalShares = stocks.reduce((sum, stock) => sum + Number(stock.totalShares || 0), 0);
  const totalAvailable = stocks.reduce((sum, stock) => sum + Number(stock.availableShares || 0), 0);
  const totalRaised = stocks.reduce((sum, stock) => sum + (Number(stock.totalShares || 0) - Number(stock.availableShares || 0)) * Number(stock.pricePerShare || 0), 0);
  const featuredCount = stocks.filter((stock) => stock.isFeatured).length;

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStock) throw new Error("Select a stock first");
      const parsedShares = Number.parseInt(shares, 10);
      if (!Number.isFinite(parsedShares) || parsedShares <= 0) throw new Error("Enter a valid share count");
      const response = await apiRequest("POST", "/api/invest/orders", {
        stockId: selectedStock.id,
        paymentMethodId: selectedPaymentMethod?.id || null,
        shares: parsedShares,
        investorName,
        investorPhone,
        investorEmail,
        referenceNote,
        receiptUrl,
      });
      return (await response.json()) as { order: InvestmentOrder; totalAmount: string };
    },
    onSuccess: async () => {
      toast({
        title: "طلب الشراء تم إنشاؤه",
        description: "سيظهر الطلب في لوحة الإدارة للمراجعة.",
      });
      setOrderDialogOpen(false);
      setReferenceNote("");
      setReceiptUrl("");
      await queryClient.invalidateQueries({ queryKey: ["/api/invest/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/invest/stocks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "فشل إنشاء الطلب",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const normalizedShares = Number.parseInt(shares, 10) || 0;
  const estimatedTotal = selectedStock ? Number((normalizedShares * Number(selectedStock.pricePerShare || 0)).toFixed(2)) : 0;
  const pieData = [
    ...ALLOC,
    { key: "market", value: Math.max(0, 100 - ALLOC.reduce((sum, item) => sum + item.value, 0)), color: "#64748b" },
  ];

  return (
    <MarketingShell dir={dir} variant="blue-gold">
      <section className="pt-4 sm:pt-8">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 items-center">
          <div>
            <Reveal>
              <SectionEyebrow color={GOLD}>
                {t("invest.eyebrow")}
              </SectionEyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 font-display text-6xl sm:text-7xl md:text-8xl tracking-wider leading-[0.9]">
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(135deg, #fff 0%, ${GOLD} 60%, ${BLUE} 100%)`,
                  }}
                >
                  {t("invest.title")}
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                {t("invest.subtitle")}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="font-bold text-black"
                  style={{
                    background: GOLD,
                    boxShadow: `0 12px 40px ${GOLD}50`,
                  }}
                  data-testid="button-invest-book-meeting"
                >
                  <Link href="/support">
                    <Calendar className="me-2 h-4 w-4" />
                    {t("mkt.cta.bookMeeting")}
                    <Arrow className="ms-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/[0.04] hover:bg-white/[0.1] text-white"
                >
                  <Link href="/coin">{t("mkt.cta.viewCoin")}</Link>
                </Button>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <GlassCard className="p-7" glow={GOLD}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest mb-5">
                <Briefcase className="h-4 w-4" style={{ color: GOLD }} />
                <span style={{ color: GOLD }}>{t("invest.exclusiveOffer")}</span>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    {t("invest.qualifiedOnly")}
                  </div>
                  <div className="font-display text-3xl tracking-wider mt-1">
                    {t("mkt.exclusive")}
                  </div>
                </div>
                <div className="h-px bg-white/10" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Featured stocks</span>
                    <span className="font-bold" style={{ color: GOLD }}>{featuredCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Available shares</span>
                    <span className="font-bold" style={{ color: BLUE }}>{formatShares(totalAvailable)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Raised so far</span>
                    <span className="font-bold" style={{ color: GOLD }}>${formatMoney(totalRaised)}</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </section>

      <section>
        <Reveal>
          <SectionHeading
            title={
              <>
                {t("invest.why.title.a")}{" "}
                <span style={{ color: GOLD }}>{t("invest.why.title.b")}</span>
              </>
            }
            subtitle={t("invest.why.sub")}
            accent={BLUE}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {[
            { icon: TrendingUp, k: "1", color: BLUE },
            { icon: Users, k: "2", color: GOLD },
            { icon: Shield, k: "3", color: BLUE },
            { icon: Coins, k: "4", color: GOLD },
          ].map((r, i) => {
            const Icon = r.icon;
            return (
              <Reveal key={r.k} delay={i * 0.05}>
                <GlassCard className="p-7 h-full" glow={r.color}>
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                    style={{
                      background: `${r.color}20`,
                      border: `1px solid ${r.color}40`,
                    }}
                  >
                    <Icon className="h-6 w-6" style={{ color: r.color }} />
                  </div>
                  <h3 className="font-display text-2xl tracking-wider mb-2">
                    {t("invest.reason." + r.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("invest.reason." + r.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section>
        <Reveal>
          <SectionHeading
            title={t("invest.alloc.title")}
            subtitle={t("invest.alloc.sub")}
            accent={GOLD}
          />
        </Reveal>
        <Reveal delay={0.05}>
          <GlassCard className="mt-8 p-6 sm:p-8">
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-center">
              <div className="h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="rgba(0,0,0,0.4)"
                    >
                      {pieData.map((a, i) => (
                        <Cell key={i} fill={a.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "rgba(8,12,28,0.92)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        backdropFilter: "blur(8px)",
                      }}
                      formatter={(v: number) => v + "%"}
                    />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {ALLOC.map((a, i) => (
                  <Reveal key={a.key} delay={i * 0.04} y={8}>
                    <div className="flex items-center gap-4">
                      <span
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ background: a.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold">
                            {t("invest.alloc." + a.key)}
                          </span>
                          <span
                            className="font-display text-xl tracking-wider"
                            style={{ color: a.color }}
                          >
                            {a.value}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-1000 ease-out"
                            style={{
                              width: a.value + "%",
                              background: a.color,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      <section>
        <Reveal>
          <SectionHeading title={t("invest.adv.title")} accent={BLUE} />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {[
            { icon: Crown, k: "1", color: GOLD },
            { icon: Globe, k: "2", color: BLUE },
            { icon: Zap, k: "3", color: GOLD },
          ].map((a, i) => {
            const Icon = a.icon;
            return (
              <Reveal key={a.k} delay={i * 0.06}>
                <GlassCard className="p-7 h-full text-center" glow={a.color}>
                  <div
                    className="mx-auto inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                    style={{
                      background: `${a.color}20`,
                      border: `1px solid ${a.color}40`,
                    }}
                  >
                    <Icon className="h-7 w-7" style={{ color: a.color }} />
                  </div>
                  <h3 className="font-display text-xl tracking-wider mb-2">
                    {t("invest.adv." + a.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("invest.adv." + a.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section>
        <Reveal>
          <SectionHeading
            title="Available Share Packages"
            subtitle="Choose a stock, specify shares, and submit your purchase request."
            accent={GOLD}
          />
        </Reveal>

        <div className="mt-8 grid lg:grid-cols-[1.15fr_0.85fr] gap-5 items-start">
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="h-4 w-4" style={{ color: GOLD }} />
                <span className="text-sm font-semibold">Stocks</span>
              </div>
              <Badge variant="outline">{stocks.length} active</Badge>
            </div>

            {stocksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : stocks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
                No investment stocks available yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {stocks.map((stock) => {
                  const percentSold = stock.totalShares > 0
                    ? Math.min(100, Math.round(((stock.totalShares - stock.availableShares) / stock.totalShares) * 100))
                    : 0;

                  return (
                    <button
                      key={stock.id}
                      type="button"
                      onClick={() => setSelectedStockId(stock.id)}
                      className={`text-start rounded-2xl border p-4 transition-all duration-200 ${selectedStock?.id === stock.id
                        ? "border-white/30 bg-white/10 shadow-[0_10px_30px_-20px_rgba(255,255,255,0.35)]"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-xl tracking-wider">{stock.nameEn}</h3>
                            <Badge variant={stock.isFeatured ? "default" : "outline"}>{stock.symbol}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-400 leading-relaxed line-clamp-2">
                            {stock.descriptionEn || stock.descriptionAr || "Investment stock"}
                          </p>
                        </div>
                        <div className="text-end shrink-0">
                          <div className="font-display text-2xl tracking-wider" style={{ color: stock.accentColor }}>
                            ${formatMoney(stock.pricePerShare)}
                          </div>
                          <div className="text-[11px] uppercase tracking-widest text-slate-500">
                            per share
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-xl bg-black/20 p-2">
                          <div className="text-slate-400">Available</div>
                          <div className="font-semibold">{formatShares(stock.availableShares)}</div>
                        </div>
                        <div className="rounded-xl bg-black/20 p-2">
                          <div className="text-slate-400">Sold</div>
                          <div className="font-semibold">{percentSold}%</div>
                        </div>
                        <div className="rounded-xl bg-black/20 p-2">
                          <div className="text-slate-400">Min / Max</div>
                          <div className="font-semibold">{stock.minPurchaseShares} - {stock.maxPurchaseShares}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Landmark className="h-4 w-4" style={{ color: BLUE }} />
              <span className="text-sm font-semibold">Purchase Request</span>
            </div>

            {selectedStock ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-2xl tracking-wider">{selectedStock.nameEn}</h3>
                      <p className="text-xs text-slate-400 mt-1">{selectedStock.symbol}</p>
                    </div>
                    <div className="text-end">
                      <div className="font-display text-3xl tracking-wider" style={{ color: selectedStock.accentColor }}>
                        ${formatMoney(selectedStock.pricePerShare)}
                      </div>
                      <div className="text-[11px] uppercase tracking-widest text-slate-500">
                        per share
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${selectedStock.totalShares > 0
                          ? Math.min(100, Math.round(((selectedStock.totalShares - selectedStock.availableShares) / selectedStock.totalShares) * 100))
                          : 0
                          }%`,
                        background: selectedStock.accentColor,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="shares">Shares to buy</Label>
                    <Input
                      id="shares"
                      type="number"
                      min={selectedStock.minPurchaseShares}
                      max={selectedStock.maxPurchaseShares}
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      className="bg-white/5 border-white/10"
                      data-testid="input-invest-shares"
                    />
                    <p className="text-xs text-slate-400">
                      Minimum {selectedStock.minPurchaseShares}, maximum {selectedStock.maxPurchaseShares}, available {selectedStock.availableShares}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="investorName">Investor name</Label>
                    <Input
                      id="investorName"
                      value={investorName}
                      onChange={(e) => setInvestorName(e.target.value)}
                      placeholder="Your full name"
                      className="bg-white/5 border-white/10"
                      data-testid="input-investor-name"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="investorPhone">Phone</Label>
                      <Input
                        id="investorPhone"
                        value={investorPhone}
                        onChange={(e) => setInvestorPhone(e.target.value)}
                        placeholder="+20..."
                        className="bg-white/5 border-white/10"
                        data-testid="input-investor-phone"
                      />
                    </div>
                    <div>
                      <Label htmlFor="investorEmail">Email</Label>
                      <Input
                        id="investorEmail"
                        type="email"
                        value={investorEmail}
                        onChange={(e) => setInvestorEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="bg-white/5 border-white/10"
                        data-testid="input-investor-email"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="paymentMethod">Payment method</Label>
                    <select
                      id="paymentMethod"
                      value={selectedPaymentMethodId || selectedPaymentMethod?.id || ""}
                      onChange={(e) => setSelectedPaymentMethodId(e.target.value)}
                      className="h-11 rounded-md border border-white/10 bg-background px-3 text-sm"
                      data-testid="select-invest-payment-method"
                    >
                      <option value="">Choose payment method</option>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.title} {method.currency ? `(${method.currency})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">
                      {selectedPaymentMethod?.details || selectedPaymentMethod?.instructions || "Manual review payment methods are supported."}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="referenceNote">Reference note</Label>
                    <Textarea
                      id="referenceNote"
                      value={referenceNote}
                      onChange={(e) => setReferenceNote(e.target.value)}
                      placeholder="Write your transfer reference or any note for the admin team"
                      className="bg-white/5 border-white/10"
                      data-testid="input-invest-reference"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="receiptUrl">Receipt URL</Label>
                    <Input
                      id="receiptUrl"
                      value={receiptUrl}
                      onChange={(e) => setReceiptUrl(e.target.value)}
                      placeholder="https://..."
                      className="bg-white/5 border-white/10"
                      data-testid="input-invest-receipt"
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Estimated total</span>
                      <span className="font-display text-3xl tracking-wider" style={{ color: GOLD }}>
                        ${formatMoney(estimatedTotal)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {normalizedShares} shares × ${formatMoney(selectedStock.pricePerShare)}
                    </div>
                  </div>

                  <Button
                    size="lg"
                    className="w-full font-bold text-black"
                    style={{
                      background: GOLD,
                      boxShadow: `0 12px 40px ${GOLD}50`,
                    }}
                    onClick={() => setOrderDialogOpen(true)}
                    disabled={!selectedStock || purchaseMutation.isPending || normalizedShares <= 0}
                    data-testid="button-open-invest-order"
                  >
                    <ArrowUpRight className="me-2 h-4 w-4" />
                    Review purchase
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-sm text-slate-400">
                Select a stock to start your purchase request.
              </div>
            )}
          </GlassCard>
        </div>
      </section>

      <section>
        <Reveal>
          <SectionHeading title="Recent purchase requests" accent={GOLD} />
        </Reveal>

        <div className="mt-8 grid gap-3">
          {ordersLoading ? (
            <GlassCard className="p-6">
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </GlassCard>
          ) : orders.length === 0 ? (
            <GlassCard className="p-6">
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
                No purchase requests yet.
              </div>
            </GlassCard>
          ) : (
            orders.slice(0, 5).map((order) => (
              <GlassCard key={order.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl tracking-wider">
                        {order.stock?.nameEn || order.stock?.symbol || "Investment"}
                      </h3>
                      <Badge variant={order.status === "pending" ? "secondary" : order.status === "approved" ? "default" : "destructive"}>
                        {order.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      {order.shares} shares · {order.investorName || "Investor"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-end">
                    <div className="font-display text-3xl tracking-wider" style={{ color: GOLD }}>
                      ${formatMoney(order.totalAmount)}
                    </div>
                    <div className="text-xs text-slate-500">total amount</div>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </section>

      <section>
        <Reveal>
          <GlassCard className="p-8 sm:p-10">
            <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
              <div>
                <Building2 className="h-10 w-10 mb-4" style={{ color: GOLD }} />
                <h2 className="font-display text-4xl sm:text-5xl tracking-wider">
                  {t("invest.commit.title")}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {[1, 2, 3, 4, 5, 6].map((n, i) => (
                  <Reveal key={n} delay={i * 0.04} y={10}>
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="h-5 w-5 mt-0.5 shrink-0"
                        style={{ color: i % 2 ? BLUE : GOLD }}
                      />
                      <span className="text-sm text-slate-300">
                        {t("invest.commit." + n)}
                      </span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      <section>
        <Reveal>
          <SpotlightCard from="#a06a00" via="#7a4f00" to="#3d2800">
            <h2 className="font-display text-5xl sm:text-6xl tracking-wider">
              {t("invest.cta.title")}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-amber-100/90 max-w-2xl mx-auto">
              {t("invest.cta.sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="font-bold text-black"
                style={{
                  background: GOLD,
                  boxShadow: `0 12px 40px ${GOLD}50`,
                }}
                data-testid="button-invest-final-cta"
              >
                <Link href="/support">
                  <Calendar className="me-2 h-4 w-4" />
                  {t("mkt.cta.bookMeeting")}
                  <Arrow className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 hover:bg-white/20 text-white"
              >
                <Link href="/coin">{t("mkt.cta.viewCoin")}</Link>
              </Button>
            </div>
          </SpotlightCard>
        </Reveal>
        <p className="text-center mt-5 text-xs text-slate-500 max-w-3xl mx-auto leading-relaxed">
          {t("invest.disclaimer")}
        </p>
      </section>

      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="sm:max-w-2xl bg-slate-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Review purchase order</DialogTitle>
            <DialogDescription className="text-slate-400">
              Confirm the details before submitting the request to the admin team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedStock ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-2xl tracking-wider">{selectedStock.nameEn}</div>
                    <div className="text-xs text-slate-400">{selectedStock.symbol}</div>
                  </div>
                  <Badge variant="outline">{selectedStock.isFeatured ? "Featured" : "Stock"}</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-slate-400 text-xs">Shares</div>
                    <div className="font-semibold">{normalizedShares}</div>
                  </div>
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-slate-400 text-xs">Estimated total</div>
                    <div className="font-semibold">${formatMoney(estimatedTotal)}</div>
                  </div>
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-slate-400 text-xs">Payment method</div>
                    <div className="font-semibold">{selectedPaymentMethod?.title || "None selected"}</div>
                  </div>
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-slate-400 text-xs">Investor</div>
                    <div className="font-semibold">{investorName || "Not provided"}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="font-bold text-black"
              style={{
                background: GOLD,
                boxShadow: `0 12px 40px ${GOLD}50`,
              }}
              onClick={() => purchaseMutation.mutate()}
              disabled={purchaseMutation.isPending || !selectedStock}
              data-testid="button-submit-invest-order"
            >
              {purchaseMutation.isPending ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <BadgeCheck className="me-2 h-4 w-4" />
                  Submit request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MarketingShell>
  );
}
