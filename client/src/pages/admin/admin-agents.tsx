import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Headset,
  Plus,
  Power,
  PowerOff,
  Search,
  Wallet as WalletIcon,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Users as UsersIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "SAR", "AED", "EGP", "KWD", "QAR", "BHD", "OMR", "JOD", "VEX"];

interface AgentRow {
  id: string;
  agentCode: string;
  username: string | null;
  email: string | null;
  defaultCurrency: string;
  allowedCurrencies: string[];
  currentBalance: string;
  initialDeposit: string;
  balanceWarnThreshold: string;
  balanceFreezeThreshold: string;
  balanceMinThreshold: string;
  commissionRateDeposit: string;
  commissionRateWithdraw: string;
  commissionFixedDeposit: string;
  commissionFixedWithdraw: string;
  totalCommissionEarned: string;
  totalDepositsProcessed: string;
  totalWithdrawalsProcessed: string;
  isActive: boolean;
  isOnline: boolean;
  awayMode: boolean;
  performanceScore: string;
  maxConcurrentRequests: number;
  trafficWeight: number;
  dailyLimit: string;
  monthlyLimit: string;
  createdAt: string;
}

interface AgentWallet {
  id: string;
  currency: string;
  balance: string;
  totalCredited: string;
  totalDebited: string;
}

interface LedgerRow {
  id: string;
  type: string;
  currency: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  refType: string | null;
  note: string | null;
  createdAt: string;
}

interface AgentStatsPeriod {
  totalDeposits: number;
  totalWithdrawals: number;
  totalCommission: number;
  approvedCount: number;
  rejectedCount: number;
}

interface AgentStats {
  today: AgentStatsPeriod;
  week: AgentStatsPeriod;
  month: AgentStatsPeriod;
}

interface AgentDetailResponse {
  agent: AgentRow;
  wallets: AgentWallet[];
  stats: AgentStats;
}

const LEDGER_LABELS: Record<string, { ar: string; tone: "credit" | "debit" | "neutral" }> = {
  agent_topup: { ar: "إيداع رأس مال", tone: "credit" },
  deposit_user_credit: { ar: "إيداع لاعب (خصم)", tone: "debit" },
  withdraw_user_debit: { ar: "سحب لاعب (إضافة)", tone: "credit" },
  commission_earned: { ar: "عمولة", tone: "credit" },
  admin_adjust_credit: { ar: "تعديل ادمن (إضافة)", tone: "credit" },
  admin_adjust_debit: { ar: "تعديل ادمن (خصم)", tone: "debit" },
  complaint_refund: { ar: "إرجاع شكوى", tone: "neutral" },
  complaint_penalty: { ar: "غرامة شكوى", tone: "debit" },
};

function formatMoney(value: string | number, currency = ""): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0.00";
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

export default function AdminAgents() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "online" | "away">("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // ---- LIST ----
  const listKey = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter === "active") params.set("isActive", "true");
    if (statusFilter === "inactive") params.set("isActive", "false");
    if (statusFilter === "online") params.set("isOnline", "true");
    if (currencyFilter !== "all") params.set("currency", currencyFilter);
    if (search.trim()) params.set("q", search.trim());
    const qs = params.toString();
    return qs ? `/api/admin/agents?${qs}` : "/api/admin/agents";
  }, [statusFilter, currencyFilter, search]);

  const { data: listData, isLoading: listLoading } = useQuery<{ agents: AgentRow[]; count: number }>({
    queryKey: [listKey],
  });

  const agents = listData?.agents ?? [];

  return (
    <div dir="rtl" className="space-y-6 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headset className="w-6 h-6 text-blue-500" />
            إدارة الوكلاء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إنشاء، مراقبة وإدارة الوكلاء، عمولاتهم، محافظهم متعددة العملات وحركة المرور.
          </p>
        </div>
        <CreateAgentDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onCreated={() => {
          queryClient.invalidateQueries({ queryKey: [listKey] });
          toast({ title: "تم إنشاء الوكيل بنجاح" });
        }} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">بحث</Label>
              <div className="relative">
                <Search className="absolute right-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-agents"
                  className="pr-8"
                  placeholder="كود الوكيل، اسم المستخدم أو البريد"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الحالة</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger data-testid="select-status-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">معطّل</SelectItem>
                  <SelectItem value="online">متّصل الآن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">العملة الأساسية</Label>
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger data-testid="select-currency-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل العملات</SelectItem>
                  {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="text-sm text-muted-foreground">
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {agents.length} وكيل
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">العملة</TableHead>
                <TableHead className="text-right">الرصيد</TableHead>
                <TableHead className="text-right">العمولة (إيداع/سحب)</TableHead>
                <TableHead className="text-right">إجمالي المعالج</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل…</TableCell></TableRow>
              ) : agents.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا يوجد وكلاء</TableCell></TableRow>
              ) : agents.map((a) => {
                const balance = Number(a.currentBalance);
                const warn = Number(a.balanceWarnThreshold);
                const freeze = Number(a.balanceFreezeThreshold);
                const min = Number(a.balanceMinThreshold);
                const balanceTone: "ok" | "warn" | "freeze" | "min" =
                  balance <= min ? "min" : balance <= freeze ? "freeze" : balance <= warn ? "warn" : "ok";

                return (
                  <TableRow key={a.id} data-testid={`row-agent-${a.agentCode}`}>
                    <TableCell className="font-mono font-bold">{a.agentCode}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{a.username ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{a.email ?? ""}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{a.defaultCurrency}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${
                          balanceTone === "min" ? "text-red-500" :
                          balanceTone === "freeze" ? "text-orange-500" :
                          balanceTone === "warn" ? "text-yellow-600" : ""
                        }`}>
                          {formatMoney(a.currentBalance)}
                        </span>
                        {balanceTone !== "ok" && <AlertCircle className="w-4 h-4 text-orange-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>إيداع: {(Number(a.commissionRateDeposit) * 100).toFixed(2)}% + {formatMoney(a.commissionFixedDeposit)}</div>
                      <div>سحب: {(Number(a.commissionRateWithdraw) * 100).toFixed(2)}% + {formatMoney(a.commissionFixedWithdraw)}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="text-green-600">↓ {formatMoney(a.totalDepositsProcessed)}</div>
                      <div className="text-blue-600">↑ {formatMoney(a.totalWithdrawalsProcessed)}</div>
                      <div className="text-amber-600">عمولة: {formatMoney(a.totalCommissionEarned)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={a.isActive ? "default" : "destructive"} className="w-fit">
                          {a.isActive ? "نشط" : "معطّل"}
                        </Badge>
                        {a.isOnline && <Badge variant="secondary" className="w-fit text-xs">● متّصل</Badge>}
                        {a.awayMode && <Badge variant="outline" className="w-fit text-xs">غائب</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-open-agent-${a.agentCode}`}
                        onClick={() => setSelectedAgentId(a.id)}
                      >
                        فتح
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {selectedAgentId && (
        <AgentDetailDialog
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: [listKey] })}
        />
      )}
    </div>
  );
}

// =============================================================================
// CREATE DIALOG
// =============================================================================
function CreateAgentDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    fullName: "",
    agentCode: "",
    defaultCurrency: "USD",
    allowedCurrencies: ["USD"],
    commissionRateDeposit: "0.02",
    commissionRateWithdraw: "0.01",
    commissionFixedDeposit: "0",
    commissionFixedWithdraw: "0",
    dailyLimit: "100000",
    monthlyLimit: "1000000",
    balanceWarnThreshold: "150",
    balanceFreezeThreshold: "100",
    balanceMinThreshold: "50",
    maxConcurrentRequests: "5",
    trafficWeight: "100",
    initialDeposit: "0",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        commissionRateDeposit: Number(form.commissionRateDeposit),
        commissionRateWithdraw: Number(form.commissionRateWithdraw),
        commissionFixedDeposit: Number(form.commissionFixedDeposit),
        commissionFixedWithdraw: Number(form.commissionFixedWithdraw),
        dailyLimit: Number(form.dailyLimit),
        monthlyLimit: Number(form.monthlyLimit),
        balanceWarnThreshold: Number(form.balanceWarnThreshold),
        balanceFreezeThreshold: Number(form.balanceFreezeThreshold),
        balanceMinThreshold: Number(form.balanceMinThreshold),
        maxConcurrentRequests: Number(form.maxConcurrentRequests),
        trafficWeight: Number(form.trafficWeight),
        initialDeposit: Number(form.initialDeposit),
      };
      const res = await apiRequest("POST", "/api/admin/agents", payload);
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      onCreated();
      setForm((f) => ({ ...f, username: "", password: "", agentCode: "", email: "", fullName: "", initialDeposit: "0" }));
    },
    onError: (e: Error) => {
      toast({ title: "فشل الإنشاء", description: e.message, variant: "destructive" });
    },
  });

  const toggleCurrency = (cur: string) => {
    setForm((f) => {
      const set = new Set(f.allowedCurrencies);
      if (set.has(cur)) set.delete(cur);
      else set.add(cur);
      if (!set.has(f.defaultCurrency) && set.size > 0) {
        return { ...f, allowedCurrencies: Array.from(set), defaultCurrency: Array.from(set)[0] };
      }
      return { ...f, allowedCurrencies: Array.from(set) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-agent" className="gap-2">
          <Plus className="w-4 h-4" /> إنشاء وكيل جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء وكيل جديد</DialogTitle>
          <DialogDescription>أدخل بيانات الحساب، العملة الأساسية، نسب العمولة وحدود الرصيد.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>اسم المستخدم *</Label>
            <Input data-testid="input-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>كلمة المرور *</Label>
            <Input data-testid="input-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>كود الوكيل *</Label>
            <Input data-testid="input-agent-code" value={form.agentCode} onChange={(e) => setForm({ ...form, agentCode: e.target.value.toUpperCase() })} placeholder="مثلاً AG001" />
          </div>
          <div className="space-y-1.5">
            <Label>الاسم الكامل</Label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>البريد الإلكتروني</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <h3 className="font-semibold mb-3">العملات المسموحة</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {SUPPORTED_CURRENCIES.map((cur) => {
              const checked = form.allowedCurrencies.includes(cur);
              return (
                <button
                  key={cur}
                  type="button"
                  data-testid={`toggle-currency-${cur}`}
                  onClick={() => toggleCurrency(cur)}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                    checked ? "bg-blue-500 text-white border-blue-500" : "bg-background hover:bg-muted"
                  }`}
                >
                  {cur}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>العملة الأساسية</Label>
              <Select value={form.defaultCurrency} onValueChange={(v) => setForm({ ...form, defaultCurrency: v })}>
                <SelectTrigger data-testid="select-default-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {form.allowedCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>إيداع رأس المال الأولي ({form.defaultCurrency})</Label>
              <Input type="number" min="0" step="0.01" value={form.initialDeposit} onChange={(e) => setForm({ ...form, initialDeposit: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <h3 className="font-semibold mb-3">العمولة</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>نسبة الإيداع (مثلاً 0.02 = 2٪)</Label>
              <Input data-testid="input-commission-rate-deposit" type="number" min="0" max="0.5" step="0.0001" value={form.commissionRateDeposit} onChange={(e) => setForm({ ...form, commissionRateDeposit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>مبلغ ثابت إيداع</Label>
              <Input data-testid="input-commission-fixed-deposit" type="number" min="0" step="0.01" value={form.commissionFixedDeposit} onChange={(e) => setForm({ ...form, commissionFixedDeposit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>نسبة السحب</Label>
              <Input data-testid="input-commission-rate-withdraw" type="number" min="0" max="0.5" step="0.0001" value={form.commissionRateWithdraw} onChange={(e) => setForm({ ...form, commissionRateWithdraw: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>مبلغ ثابت سحب</Label>
              <Input data-testid="input-commission-fixed-withdraw" type="number" min="0" step="0.01" value={form.commissionFixedWithdraw} onChange={(e) => setForm({ ...form, commissionFixedWithdraw: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <h3 className="font-semibold mb-3">الحدود وحركة المرور</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>حد يومي</Label>
              <Input type="number" min="0" step="100" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>حد شهري</Label>
              <Input type="number" min="0" step="1000" value={form.monthlyLimit} onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>حد طلبات متزامنة</Label>
              <Input type="number" min="1" max="100" step="1" value={form.maxConcurrentRequests} onChange={(e) => setForm({ ...form, maxConcurrentRequests: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>وزن التوزيع</Label>
              <Input type="number" min="0" max="10000" step="10" value={form.trafficWeight} onChange={(e) => setForm({ ...form, trafficWeight: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>حد التحذير</Label>
              <Input type="number" min="0" step="10" value={form.balanceWarnThreshold} onChange={(e) => setForm({ ...form, balanceWarnThreshold: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>حد التجميد</Label>
              <Input type="number" min="0" step="10" value={form.balanceFreezeThreshold} onChange={(e) => setForm({ ...form, balanceFreezeThreshold: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>الحد الأدنى</Label>
              <Input type="number" min="0" step="10" value={form.balanceMinThreshold} onChange={(e) => setForm({ ...form, balanceMinThreshold: e.target.value })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            data-testid="button-submit-create-agent"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.username || !form.password || !form.agentCode}
          >
            {createMutation.isPending ? "جاري الإنشاء…" : "إنشاء"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DETAIL DIALOG
// =============================================================================
function AgentDetailDialog({
  agentId, onClose, onChanged,
}: { agentId: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [resetMainPwOpen, setResetMainPwOpen] = useState(false);

  const { data, isLoading } = useQuery<AgentDetailResponse>({
    queryKey: [`/api/admin/agents/${agentId}`],
  });

  const { data: ledgerData } = useQuery<{ ledger: LedgerRow[] }>({
    queryKey: [`/api/admin/agents/${agentId}/ledger`],
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/agents/${agentId}/toggle-active`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/agents/${agentId}`] });
      onChanged();
      toast({ title: "تم تحديث حالة الوكيل" });
    },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent dir="rtl">
          <div className="py-8 text-center text-muted-foreground">جاري التحميل…</div>
        </DialogContent>
      </Dialog>
    );
  }

  const { agent, wallets, stats } = data;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{agent.agentCode}</span>
                <Badge variant={agent.isActive ? "default" : "destructive"}>{agent.isActive ? "نشط" : "معطّل"}</Badge>
                {agent.isOnline && <Badge variant="secondary">متّصل</Badge>}
              </DialogTitle>
              <DialogDescription>{agent.username} {agent.email ? `· ${agent.email}` : ""}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={agent.isActive ? "destructive" : "default"}
                data-testid="button-toggle-active"
                onClick={() => toggleMutation.mutate()}
                disabled={toggleMutation.isPending}
              >
                {agent.isActive ? <><PowerOff className="w-4 h-4" /> إيقاف</> : <><Power className="w-4 h-4" /> تشغيل</>}
              </Button>
              <Button size="sm" variant="outline" data-testid="button-adjust-balance" onClick={() => setAdjustOpen(true)}>
                تعديل رصيد
              </Button>
              <Button size="sm" variant="outline" data-testid="button-reset-main-password" onClick={() => setResetMainPwOpen(true)}>
                <KeyRound className="w-4 h-4" /> كلمة مرور الوكيل
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">ملخص</TabsTrigger>
            <TabsTrigger value="wallets">المحافظ</TabsTrigger>
            <TabsTrigger value="ledger">السجل</TabsTrigger>
            <TabsTrigger value="sub-accounts" data-testid="tab-sub-accounts">
              <UsersIcon className="w-4 h-4 ml-1" /> الحسابات الفرعية
            </TabsTrigger>
            <TabsTrigger value="config">الإعدادات</TabsTrigger>
          </TabsList>

          {/* SUMMARY TAB */}
          <TabsContent value="summary" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <StatCard title="اليوم" stats={stats.today} />
              <StatCard title="آخر 7 أيام" stats={stats.week} />
              <StatCard title="آخر 30 يوم" stats={stats.month} />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">المؤشرات الرئيسية</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">رصيد العملة الأساسية</Label>
                  <div className="text-lg font-bold">{formatMoney(agent.currentBalance, agent.defaultCurrency)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">إجمالي العمولة المكتسبة</Label>
                  <div className="text-lg font-bold text-amber-600">{formatMoney(agent.totalCommissionEarned, agent.defaultCurrency)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">معدل الأداء</Label>
                  <div className="text-lg font-bold">{Number(agent.performanceScore).toFixed(1)}%</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WALLETS TAB */}
          <TabsContent value="wallets">
            <div className="grid md:grid-cols-2 gap-3">
              {wallets.map((w) => (
                <Card key={w.id} data-testid={`wallet-${w.currency}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <WalletIcon className="w-4 h-4" /> {w.currency}
                      </span>
                      {w.currency === agent.defaultCurrency && <Badge variant="secondary">أساسية</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatMoney(w.balance, w.currency)}</div>
                    <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                      <span className="text-green-600">↑ {formatMoney(w.totalCredited)}</span>
                      <span className="text-red-600">↓ {formatMoney(w.totalDebited)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* LEDGER TAB */}
          <TabsContent value="ledger">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">قبل</TableHead>
                      <TableHead className="text-right">بعد</TableHead>
                      <TableHead className="text-right">ملاحظة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ledgerData?.ledger ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">لا توجد حركات</TableCell></TableRow>
                    ) : (ledgerData?.ledger ?? []).map((l) => {
                      const meta = LEDGER_LABELS[l.type] ?? { ar: l.type, tone: "neutral" as const };
                      const amount = Number(l.amount);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{new Date(l.createdAt).toLocaleString("ar-SA")}</TableCell>
                          <TableCell><Badge variant="outline">{meta.ar}</Badge></TableCell>
                          <TableCell className={`font-mono font-bold ${amount > 0 ? "text-green-600" : "text-red-600"}`}>
                            {amount > 0 ? "+" : ""}{formatMoney(amount, l.currency)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{formatMoney(l.balanceBefore)}</TableCell>
                          <TableCell className="font-mono text-xs">{formatMoney(l.balanceAfter)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{l.note ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUB-ACCOUNTS TAB */}
          <TabsContent value="sub-accounts">
            <SubAccountsTab agentId={agentId} agentCode={agent.agentCode} />
          </TabsContent>

          {/* CONFIG TAB */}
          <TabsContent value="config">
            <ConfigTab agent={agent} onSaved={() => {
              queryClient.invalidateQueries({ queryKey: [`/api/admin/agents/${agentId}`] });
              onChanged();
            }} />
          </TabsContent>
        </Tabs>

        {adjustOpen && (
          <AdjustBalanceDialog
            agent={agent}
            onClose={() => setAdjustOpen(false)}
            onAdjusted={() => {
              queryClient.invalidateQueries({ queryKey: [`/api/admin/agents/${agentId}`] });
              queryClient.invalidateQueries({ queryKey: [`/api/admin/agents/${agentId}/ledger`] });
              onChanged();
              setAdjustOpen(false);
            }}
          />
        )}

        {resetMainPwOpen && (
          <ResetPasswordDialog
            title={`إعادة تعيين كلمة مرور الوكيل ${agent.agentCode}`}
            description="سيتم تعيين كلمة مرور جديدة للحساب الأساسي للوكيل. لن يخرج من جلسته الحالية تلقائياً."
            endpoint={`/api/admin/agents/${agentId}/reset-password`}
            onClose={() => setResetMainPwOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ title, stats }: { title: string; stats: AgentStatsPeriod }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground"><TrendingDown className="inline w-3 h-3" /> إيداعات</span><span className="font-bold">{formatMoney(stats.totalDeposits)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground"><TrendingUp className="inline w-3 h-3" /> سحوبات</span><span className="font-bold">{formatMoney(stats.totalWithdrawals)}</span></div>
        <div className="flex justify-between"><span className="text-amber-600">عمولة</span><span className="font-bold text-amber-600">{formatMoney(stats.totalCommission)}</span></div>
        <div className="flex justify-between border-t pt-1.5 mt-1.5">
          <span className="text-green-600"><CheckCircle2 className="inline w-3 h-3" /> مقبول</span><span>{stats.approvedCount}</span>
        </div>
        <div className="flex justify-between"><span className="text-red-600"><XCircle className="inline w-3 h-3" /> مرفوض</span><span>{stats.rejectedCount}</span></div>
      </CardContent>
    </Card>
  );
}

function AdjustBalanceDialog({
  agent, onClose, onAdjusted,
}: { agent: AgentRow; onClose: () => void; onAdjusted: () => void }) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(agent.defaultCurrency);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const signed = direction === "credit" ? Number(amount) : -Number(amount);
      const res = await apiRequest("POST", `/api/admin/agents/${agent.id}/adjust-balance`, {
        amount: signed,
        currency,
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم تعديل الرصيد" });
      onAdjusted();
    },
    onError: (e: Error) => toast({ title: "فشل التعديل", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل رصيد الوكيل {agent.agentCode}</DialogTitle>
          <DialogDescription>كل تعديل يُسجَّل في السجل وغير قابل للحذف.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={direction === "credit" ? "default" : "outline"}
              data-testid="button-direction-credit"
              onClick={() => setDirection("credit")}
            >إضافة (+)</Button>
            <Button
              variant={direction === "debit" ? "destructive" : "outline"}
              data-testid="button-direction-debit"
              onClick={() => setDirection("debit")}
            >خصم (−)</Button>
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ</Label>
            <Input data-testid="input-adjust-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>العملة</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(agent.allowedCurrencies ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>السبب (إجباري)</Label>
            <Input data-testid="input-adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="حل شكوى رقم #123 …" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            data-testid="button-submit-adjust"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount || Number(amount) <= 0 || reason.trim().length < 3}
          >
            {mutation.isPending ? "جاري…" : "تأكيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigTab({ agent, onSaved }: { agent: AgentRow; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    commissionRateDeposit: agent.commissionRateDeposit,
    commissionRateWithdraw: agent.commissionRateWithdraw,
    commissionFixedDeposit: agent.commissionFixedDeposit,
    commissionFixedWithdraw: agent.commissionFixedWithdraw,
    dailyLimit: agent.dailyLimit,
    monthlyLimit: agent.monthlyLimit,
    balanceWarnThreshold: agent.balanceWarnThreshold,
    balanceFreezeThreshold: agent.balanceFreezeThreshold,
    balanceMinThreshold: agent.balanceMinThreshold,
    maxConcurrentRequests: String(agent.maxConcurrentRequests),
    trafficWeight: String(agent.trafficWeight),
    awayMode: agent.awayMode,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        commissionRateDeposit: Number(form.commissionRateDeposit),
        commissionRateWithdraw: Number(form.commissionRateWithdraw),
        commissionFixedDeposit: Number(form.commissionFixedDeposit),
        commissionFixedWithdraw: Number(form.commissionFixedWithdraw),
        dailyLimit: Number(form.dailyLimit),
        monthlyLimit: Number(form.monthlyLimit),
        balanceWarnThreshold: Number(form.balanceWarnThreshold),
        balanceFreezeThreshold: Number(form.balanceFreezeThreshold),
        balanceMinThreshold: Number(form.balanceMinThreshold),
        maxConcurrentRequests: Number(form.maxConcurrentRequests),
        trafficWeight: Number(form.trafficWeight),
        awayMode: form.awayMode,
      };
      const res = await apiRequest("PATCH", `/api/admin/agents/${agent.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم حفظ الإعدادات" });
      onSaved();
    },
    onError: (e: Error) => toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>نسبة عمولة الإيداع</Label><Input type="number" min="0" max="0.5" step="0.0001" value={form.commissionRateDeposit} onChange={(e) => setForm({ ...form, commissionRateDeposit: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>مبلغ ثابت إيداع</Label><Input type="number" min="0" step="0.01" value={form.commissionFixedDeposit} onChange={(e) => setForm({ ...form, commissionFixedDeposit: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>نسبة عمولة السحب</Label><Input type="number" min="0" max="0.5" step="0.0001" value={form.commissionRateWithdraw} onChange={(e) => setForm({ ...form, commissionRateWithdraw: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>مبلغ ثابت سحب</Label><Input type="number" min="0" step="0.01" value={form.commissionFixedWithdraw} onChange={(e) => setForm({ ...form, commissionFixedWithdraw: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>حد يومي</Label><Input type="number" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>حد شهري</Label><Input type="number" value={form.monthlyLimit} onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>حد التحذير (رصيد)</Label><Input type="number" value={form.balanceWarnThreshold} onChange={(e) => setForm({ ...form, balanceWarnThreshold: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>حد التجميد (رصيد)</Label><Input type="number" value={form.balanceFreezeThreshold} onChange={(e) => setForm({ ...form, balanceFreezeThreshold: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>حد أدنى (رصيد)</Label><Input type="number" value={form.balanceMinThreshold} onChange={(e) => setForm({ ...form, balanceMinThreshold: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>طلبات متزامنة قصوى</Label><Input type="number" min="1" max="100" value={form.maxConcurrentRequests} onChange={(e) => setForm({ ...form, maxConcurrentRequests: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>وزن التوزيع</Label><Input type="number" min="0" max="10000" value={form.trafficWeight} onChange={(e) => setForm({ ...form, trafficWeight: e.target.value })} /></div>
          <div className="flex items-center justify-between space-y-0 mt-7">
            <Label>وضع الغياب</Label>
            <Switch data-testid="switch-away-mode" checked={form.awayMode} onCheckedChange={(v) => setForm({ ...form, awayMode: v })} />
          </div>
        </div>
        <Button data-testid="button-save-config" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? "جاري الحفظ…" : "حفظ التغييرات"}
        </Button>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// SUB-ACCOUNTS TAB (employees: 1 main agent + up to 4 employees)
// =============================================================================
interface SubAccountRow {
  id: string;
  agentId: string;
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  label: string;
  role: "operator" | "supervisor" | "viewer";
  isActive: boolean;
  userStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SubAccountsResponse {
  subAccounts: SubAccountRow[];
  activeCount: number;
  maxAllowed: number;
}

const SUB_ROLE_LABELS: Record<SubAccountRow["role"], string> = {
  operator: "موظف عمليات",
  supervisor: "مشرف",
  viewer: "مراقب (قراءة فقط)",
};

function SubAccountsTab({ agentId, agentCode }: { agentId: string; agentCode: string }) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubAccountRow | null>(null);
  const [resetTarget, setResetTarget] = useState<SubAccountRow | null>(null);

  const queryKey = [`/api/admin/agents/${agentId}/sub-accounts`];
  const { data, isLoading } = useQuery<SubAccountsResponse>({ queryKey });

  const setActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/agents/${agentId}/sub-accounts/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "تم تحديث الحالة" });
    },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/agents/${agentId}/sub-accounts/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "تم تعطيل الحساب الفرعي" });
    },
    onError: (e: Error) => toast({ title: "فشل التعطيل", description: e.message, variant: "destructive" }),
  });

  const activeCount = data?.activeCount ?? 0;
  const maxAllowed = data?.maxAllowed ?? 4;
  const limitReached = activeCount >= maxAllowed;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="w-4 h-4" /> الحسابات الفرعية للوكيل {agentCode}
            </CardTitle>
            <CardDescription>
              يمكن لكل وكيل إنشاء حتى {maxAllowed} حسابات موظفين بصلاحيات محدودة. كل عملية يقومون بها تُسجَّل تحت اسمهم وتُنسب للوكيل الأساسي.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={limitReached ? "destructive" : "secondary"} data-testid="badge-sub-account-counter">
              {activeCount} / {maxAllowed}
            </Badge>
            <Button
              size="sm"
              data-testid="button-create-sub-account"
              disabled={limitReached}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4" /> إضافة موظف
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم/التسمية</TableHead>
              <TableHead className="text-right">اسم المستخدم</TableHead>
              <TableHead className="text-right">الصلاحية</TableHead>
              <TableHead className="text-right">آخر دخول</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">جاري التحميل…</TableCell></TableRow>
            ) : (data?.subAccounts ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">لا توجد حسابات فرعية بعد</TableCell></TableRow>
            ) : (data?.subAccounts ?? []).map((s) => (
              <TableRow key={s.id} data-testid={`row-sub-account-${s.id}`}>
                <TableCell>
                  <div className="font-medium">{s.label}</div>
                  {(s.firstName || s.lastName) && (
                    <div className="text-xs text-muted-foreground">{[s.firstName, s.lastName].filter(Boolean).join(" ")}</div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{s.username}</TableCell>
                <TableCell><Badge variant="outline">{SUB_ROLE_LABELS[s.role]}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString("ar-SA") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={s.isActive ? "default" : "destructive"}>
                    {s.isActive ? "نشط" : "معطّل"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`button-edit-sub-${s.id}`}
                      title="تعديل"
                      onClick={() => setEditTarget(s)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`button-reset-pw-sub-${s.id}`}
                      title="إعادة تعيين كلمة المرور"
                      onClick={() => setResetTarget(s)}
                    >
                      <KeyRound className="w-4 h-4" />
                    </Button>
                    {s.isActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`button-disable-sub-${s.id}`}
                        title="تعطيل"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`تعطيل الحساب الفرعي "${s.label}"؟ لن يستطيع تسجيل الدخول بعد ذلك.`)) {
                            deleteMutation.mutate(s.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`button-enable-sub-${s.id}`}
                        title="تفعيل"
                        disabled={setActiveMutation.isPending || limitReached}
                        onClick={() => setActiveMutation.mutate({ id: s.id, isActive: true })}
                      >
                        <Power className="w-4 h-4 text-green-600" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {createOpen && (
        <CreateSubAccountDialog
          agentId={agentId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey });
            setCreateOpen(false);
          }}
        />
      )}

      {editTarget && (
        <EditSubAccountDialog
          agentId={agentId}
          sub={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey });
            setEditTarget(null);
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordDialog
          title={`إعادة تعيين كلمة مرور: ${resetTarget.label}`}
          description={`سيتم تعيين كلمة مرور جديدة لـ ${resetTarget.username}.`}
          endpoint={`/api/admin/agents/${agentId}/sub-accounts/${resetTarget.id}/reset-password`}
          onClose={() => setResetTarget(null)}
        />
      )}
    </Card>
  );
}

function CreateSubAccountDialog({
  agentId, onClose, onCreated,
}: { agentId: string; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    username: "",
    password: "",
    label: "",
    email: "",
    firstName: "",
    lastName: "",
    role: "operator" as SubAccountRow["role"],
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/agents/${agentId}/sub-accounts`, {
        username: form.username.trim(),
        password: form.password,
        label: form.label.trim(),
        email: form.email.trim() || null,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        role: form.role,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إنشاء الحساب الفرعي" });
      onCreated();
    },
    onError: (e: Error) => toast({ title: "فشل الإنشاء", description: e.message, variant: "destructive" }),
  });

  const canSubmit =
    form.username.trim().length >= 3 &&
    form.password.length >= 8 &&
    form.label.trim().length >= 1;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إنشاء حساب موظف فرعي</DialogTitle>
          <DialogDescription>سيُسجَّل دخوله باسم المستخدم وكلمة المرور أدناه. كل إجراء سيُنسب إليه وللوكيل الأم.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>التسمية الداخلية (إجباري)</Label>
            <Input data-testid="input-sub-label" placeholder="مثلاً: موظف الفترة الصباحية"
              value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>اسم المستخدم</Label>
              <Input data-testid="input-sub-username" autoComplete="off" value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة المرور (8+ أحرف)</Label>
              <Input data-testid="input-sub-password" type="password" autoComplete="new-password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>الاسم الأول</Label>
              <Input data-testid="input-sub-first-name" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم الأخير</Label>
              <Input data-testid="input-sub-last-name" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني (اختياري)</Label>
            <Input data-testid="input-sub-email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>الصلاحية</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as SubAccountRow["role"] })}>
              <SelectTrigger data-testid="select-sub-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">{SUB_ROLE_LABELS.operator}</SelectItem>
                <SelectItem value="supervisor">{SUB_ROLE_LABELS.supervisor}</SelectItem>
                <SelectItem value="viewer">{SUB_ROLE_LABELS.viewer}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button data-testid="button-submit-create-sub" disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}>
            {mutation.isPending ? "جاري…" : "إنشاء"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSubAccountDialog({
  agentId, sub, onClose, onSaved,
}: { agentId: string; sub: SubAccountRow; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [label, setLabel] = useState(sub.label);
  const [role, setRole] = useState<SubAccountRow["role"]>(sub.role);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/agents/${agentId}/sub-accounts/${sub.id}`, {
        label: label.trim(),
        role,
      });
      return res.json();
    },
    onSuccess: () => { toast({ title: "تم الحفظ" }); onSaved(); },
    onError: (e: Error) => toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل الحساب الفرعي</DialogTitle>
          <DialogDescription>{sub.username}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>التسمية</Label>
            <Input data-testid="input-edit-sub-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>الصلاحية</Label>
            <Select value={role} onValueChange={(v) => setRole(v as SubAccountRow["role"])}>
              <SelectTrigger data-testid="select-edit-sub-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">{SUB_ROLE_LABELS.operator}</SelectItem>
                <SelectItem value="supervisor">{SUB_ROLE_LABELS.supervisor}</SelectItem>
                <SelectItem value="viewer">{SUB_ROLE_LABELS.viewer}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button data-testid="button-submit-edit-sub" disabled={mutation.isPending || label.trim().length < 1}
            onClick={() => mutation.mutate()}>
            {mutation.isPending ? "جاري…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-usable password reset dialog used by both:
//   - main agent password reset (POST /api/admin/agents/:id/reset-password)
//   - sub-account password reset (POST .../sub-accounts/:id/reset-password)
function ResetPasswordDialog({
  title, description, endpoint, onClose,
}: { title: string; description: string; endpoint: string; onClose: () => void }) {
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", endpoint, { newPassword: pw });
      return res.json();
    },
    onSuccess: () => { toast({ title: "تم تعيين كلمة المرور الجديدة" }); onClose(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const mismatched = pw.length > 0 && confirm.length > 0 && pw !== confirm;
  const canSubmit = pw.length >= 8 && pw === confirm;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> {title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>كلمة المرور الجديدة (8 أحرف على الأقل)</Label>
            <Input data-testid="input-new-password" type="password" autoComplete="new-password"
              value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>تأكيد كلمة المرور</Label>
            <Input data-testid="input-confirm-password" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatched && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> كلمتا المرور غير متطابقتين
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button data-testid="button-submit-reset-password" disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}>
            {mutation.isPending ? "جاري…" : "تعيين"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
