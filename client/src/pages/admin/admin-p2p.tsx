import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnreadAlertEntities, useMarkAlertReadByEntity } from "@/hooks/use-admin-alert-counts";
import {
  Search,
  ArrowLeftRight,
  Ban,
  Check,
  X,
  Eye,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  Shield,
  Settings,
  DollarSign,
  Percent,
  Calculator,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

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
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to fetch");
  }
  return res.json();
}

interface P2POffer {
  id: string;
  userId?: string;
  type: string;
  username?: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  visibility?: "public" | "private_friend";
  currency?: string;
  amount?: string | number;
  price?: string;
  minAmount?: string;
  maxAmount?: string;
  status: string;
  moderationReason?: string | null;
  counterResponse?: string | null;
  submittedForReviewAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reviewedBy?: string | null;
  reviewedByUsername?: string | null;
  paymentMethods?: string[];
  createdAt?: string;
  [key: string]: unknown;
}

interface P2PTrade {
  id: string;
  buyerUsername?: string;
  sellerUsername?: string;
  amount?: string;
  totalPrice?: string;
  status: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface P2PDispute {
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

interface P2PAuditLog {
  id: string;
  action: string;
  description?: string;
  username?: string;
  createdAt: string;
}

interface P2PAdPermissionUser {
  userId: string;
  username: string;
  email?: string | null;
  p2pBanned: boolean;
  p2pBanReason?: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  idVerificationStatus?: string | null;
  profileVerificationLevel?: string | null;
  verificationBypassed?: boolean;
  canCreateOffers: boolean;
  canTradeP2P: boolean;
  monthlyTradeLimit: number | null;
  monthlyTradedAmount: number;
  activePaymentMethodCount: number;
  activeOfferCount: number;
  createdAt: string;
}

interface P2PSettings {
  id: string;
  feeType: "percentage" | "fixed" | "hybrid";
  platformFeePercentage: string;
  platformFeeFixed: string;
  minFee: string;
  maxFee: string | null;
  minTradeAmount: string;
  maxTradeAmount: string;
  escrowTimeoutHours: number;
  paymentTimeoutMinutes: number;
  autoExpireEnabled: boolean;
  isEnabled: boolean;
  requireIdentityVerification: boolean;
  requirePhoneVerification: boolean;
  requireEmailVerification: boolean;
  p2pBuyCurrencies: string[];
  p2pSellCurrencies: string[];
  depositEnabledCurrencies: string[];
  updatedAt: string;
}

interface FreezeProgramMethodOption {
  id: string;
  name: string;
  type: string;
  countryCode: string;
  minAmount: string;
  maxAmount: string;
  isActive: boolean;
  isAvailable: boolean;
}

interface FreezeProgramConfig {
  id: string;
  currencyCode: string;
  isEnabled: boolean;
  benefitRatePercent: string;
  baseReductionPercent: string;
  maxReductionPercent: string;
  minAmount: string;
  maxAmount: string | null;
  methods: Array<{
    countryPaymentMethodId: string;
    methodName: string;
    countryCode: string;
    methodType: string;
  }>;
}

interface FreezeProgramRequest {
  id: string;
  userId: string;
  username: string;
  currencyCode: string;
  amount: string;
  approvedAmount: string;
  remainingAmount: string;
  benefitRatePercentSnapshot: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "exhausted";
  paymentMethodName: string;
  payerName?: string | null;
  paymentReference?: string | null;
  requestNote?: string | null;
  adminNote?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

interface FreezeProgramPayload {
  configs: FreezeProgramConfig[];
  paymentMethods: FreezeProgramMethodOption[];
}

const SURFACE_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-xl border border-slate-300/80 bg-gradient-to-b from-white to-slate-100 text-slate-900 shadow-[0_8px_0_0_rgba(148,163,184,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(148,163,184,0.45)] hover:brightness-105 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.82)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-xl border border-sky-600 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(3,105,161,0.52)] hover:brightness-105";
const BUTTON_3D_DANGER_CLASS = "rounded-xl border border-red-700 bg-gradient-to-b from-red-500 via-red-600 to-red-800 text-white shadow-[0_8px_0_0_rgba(127,29,29,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(127,29,29,0.52)] hover:brightness-105";
const INPUT_SURFACE_CLASS = "min-h-[46px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const TEXTAREA_SURFACE_CLASS = "min-h-[120px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const TAB_LIST_CLASS = "inline-flex w-max min-w-full rounded-[26px] border border-slate-200/80 bg-white/90 p-1.5 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/80 md:w-auto";
const TAB_TRIGGER_CLASS = "min-h-[44px] rounded-[18px] px-4 py-2 text-sm font-semibold data-[state=active]:bg-gradient-to-b data-[state=active]:from-sky-400 data-[state=active]:to-sky-700 data-[state=active]:text-white data-[state=active]:shadow-[0_6px_0_0_rgba(3,105,161,0.5)]";
const DIALOG_SURFACE_CLASS = "max-w-[calc(100vw-1rem)] sm:max-w-2xl rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100 p-0 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";

function formatDetailLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    const hasComplexEntries = value.some((entry) => typeof entry === "object" && entry !== null);
    if (hasComplexEntries) {
      return JSON.stringify(value, null, 2);
    }

    return value.map((entry) => String(entry)).join(", ") || "-";
  }

  if (typeof value === "string") {
    if (/(At|Date)$/i.test(key) && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toLocaleString();
    }

    return value;
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function DetailGrid({ data }: { data?: Record<string, unknown> | null }) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">No details available.</p>;
  }

  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {formatDetailLabel(key)}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-foreground">
            {formatDetailValue(key, value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function P2PSettingsPanel({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const defaultCurrencyCodes = ["USD", "USDT", "EUR", "GBP", "SAR", "AED", "EGP"];
  const [testAmount, setTestAmount] = useState("");
  const [calculatedFee, setCalculatedFee] = useState<{ fee: string; breakdown?: Record<string, unknown> } | null>(null);
  const [buyCurrenciesDraft, setBuyCurrenciesDraft] = useState(defaultCurrencyCodes.join(", "));
  const [sellCurrenciesDraft, setSellCurrenciesDraft] = useState(defaultCurrencyCodes.join(", "));
  const [depositCurrenciesDraft, setDepositCurrenciesDraft] = useState(defaultCurrencyCodes.join(", "));
  const [selectedFreezeCurrency, setSelectedFreezeCurrency] = useState(defaultCurrencyCodes[0]);
  const [freezeRequestFilter, setFreezeRequestFilter] = useState<"all" | "pending" | "approved" | "rejected" | "exhausted" | "cancelled">("pending");
  const [freezeDraft, setFreezeDraft] = useState({
    isEnabled: false,
    benefitRatePercent: "0",
    baseReductionPercent: "50",
    maxReductionPercent: "90",
    minAmount: "10",
    maxAmount: "",
    allowedPaymentMethodIds: [] as string[],
  });
  const [selectedFreezeRequest, setSelectedFreezeRequest] = useState<FreezeProgramRequest | null>(null);
  const [freezeRejectionReason, setFreezeRejectionReason] = useState("");

  const { data: settings, isLoading } = useQuery<P2PSettings>({
    queryKey: ["/api/admin/p2p/settings"],
    queryFn: () => adminFetch("/api/admin/p2p/settings"),
  });

  const { data: analytics } = useQuery({
    queryKey: ["/api/admin/p2p/analytics"],
    queryFn: () => adminFetch("/api/admin/p2p/analytics"),
  });

  const { data: freezeProgramData } = useQuery<FreezeProgramPayload>({
    queryKey: ["/api/admin/p2p/freeze-program"],
    queryFn: () => adminFetch("/api/admin/p2p/freeze-program"),
  });

  const { data: freezeRequests = [] } = useQuery<FreezeProgramRequest[]>({
    queryKey: ["/api/admin/p2p/freeze-program/requests", freezeRequestFilter],
    queryFn: () => adminFetch(`/api/admin/p2p/freeze-program/requests?status=${freezeRequestFilter}`),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<P2PSettings>) => {
      return adminFetch("/api/admin/p2p/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/settings"] });
      toast({ title: "Settings Updated", description: "P2P settings have been saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings", variant: "destructive" });
    },
  });

  const calculateFeeMutation = useMutation({
    mutationFn: async (amount: string) => {
      return adminFetch("/api/admin/p2p/calculate-fee", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
    },
    onSuccess: (data) => {
      setCalculatedFee(data);
    },
  });

  const updateFreezeProgramMutation = useMutation({
    mutationFn: async () => {
      return adminFetch(`/api/admin/p2p/freeze-program/configs/${selectedFreezeCurrency}`, {
        method: "PUT",
        body: JSON.stringify({
          isEnabled: freezeDraft.isEnabled,
          benefitRatePercent: Number(freezeDraft.benefitRatePercent || "0"),
          baseReductionPercent: Number(freezeDraft.baseReductionPercent || "0"),
          maxReductionPercent: Number(freezeDraft.maxReductionPercent || "0"),
          minAmount: Number(freezeDraft.minAmount || "0"),
          maxAmount: freezeDraft.maxAmount.trim().length > 0 ? Number(freezeDraft.maxAmount) : null,
          allowedPaymentMethodIds: freezeDraft.allowedPaymentMethodIds,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/freeze-program"] });
      toast({ title: "Freeze Program Saved", description: "Currency freeze program settings were updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update freeze program settings", variant: "destructive" });
    },
  });

  const reviewFreezeRequestMutation = useMutation({
    mutationFn: async ({
      requestId,
      decision,
      rejectionReason,
    }: {
      requestId: string;
      decision: "approve" | "reject";
      rejectionReason?: string;
    }) => {
      return adminFetch(`/api/admin/p2p/freeze-program/requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, rejectionReason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/freeze-program/requests"] });
      setSelectedFreezeRequest(null);
      setFreezeRejectionReason("");
      toast({ title: "Request Updated", description: "Freeze request status has been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update freeze request", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!settings) return;

    const normalizeList = (list?: string[]) =>
      (Array.isArray(list) ? list : defaultCurrencyCodes).join(", ");

    setBuyCurrenciesDraft(normalizeList(settings.p2pBuyCurrencies));
    setSellCurrenciesDraft(normalizeList(settings.p2pSellCurrencies));
    setDepositCurrenciesDraft(normalizeList(settings.depositEnabledCurrencies));
  }, [settings]);

  useEffect(() => {
    const configs = freezeProgramData?.configs || [];
    if (configs.length === 0) {
      return;
    }

    const activeCurrencyExists = configs.some((config) => config.currencyCode === selectedFreezeCurrency);
    if (!activeCurrencyExists) {
      setSelectedFreezeCurrency(configs[0].currencyCode);
    }
  }, [freezeProgramData?.configs, selectedFreezeCurrency]);

  useEffect(() => {
    const selectedConfig = (freezeProgramData?.configs || []).find((config) => config.currencyCode === selectedFreezeCurrency);
    if (!selectedConfig) {
      setFreezeDraft({
        isEnabled: false,
        benefitRatePercent: "0",
        baseReductionPercent: "50",
        maxReductionPercent: "90",
        minAmount: "10",
        maxAmount: "",
        allowedPaymentMethodIds: [],
      });
      return;
    }

    setFreezeDraft({
      isEnabled: selectedConfig.isEnabled,
      benefitRatePercent: String(selectedConfig.benefitRatePercent || "0"),
      baseReductionPercent: String(selectedConfig.baseReductionPercent || "50"),
      maxReductionPercent: String(selectedConfig.maxReductionPercent || "90"),
      minAmount: String(selectedConfig.minAmount || "10"),
      maxAmount: selectedConfig.maxAmount ? String(selectedConfig.maxAmount) : "",
      allowedPaymentMethodIds: selectedConfig.methods.map((method) => method.countryPaymentMethodId),
    });
  }, [freezeProgramData?.configs, selectedFreezeCurrency]);

  const handleUpdateSetting = (key: keyof P2PSettings, value: string | number | boolean | string[] | null) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  const parseCurrencyList = (raw: string): string[] => {
    const splitValues = raw
      .split(/[\s,]+/)
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value.length > 0);

    return Array.from(new Set(splitValues));
  };

  const saveCurrencyList = (
    key: "p2pBuyCurrencies" | "p2pSellCurrencies" | "depositEnabledCurrencies",
    draftValue: string,
  ) => {
    handleUpdateSetting(key, parseCurrencyList(draftValue));
  };

  const freezeConfigCurrencies = useMemo(() => {
    const currenciesFromConfigs = (freezeProgramData?.configs || []).map((config) => config.currencyCode);
    return Array.from(new Set([...defaultCurrencyCodes, ...currenciesFromConfigs])).sort();
  }, [freezeProgramData?.configs]);

  const availableFreezePaymentMethods = useMemo(() => {
    return (freezeProgramData?.paymentMethods || []).filter((method) => method.isActive && method.isAvailable);
  }, [freezeProgramData?.paymentMethods]);

  const toggleFreezeMethod = (methodId: string) => {
    setFreezeDraft((previous) => {
      const exists = previous.allowedPaymentMethodIds.includes(methodId);
      return {
        ...previous,
        allowedPaymentMethodIds: exists
          ? previous.allowedPaymentMethodIds.filter((id) => id !== methodId)
          : [...previous.allowedPaymentMethodIds, methodId],
      };
    });
  };

  const surfaceCardClass = SURFACE_CARD_CLASS;
  const statCardClass = STAT_CARD_CLASS;
  const button3dPrimaryClass = BUTTON_3D_PRIMARY_CLASS;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Fees Collected</p>
                <p className="text-2xl font-bold" data-testid="text-total-fees">${parseFloat(analytics?.allTime?.totalFees || "0").toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/10">
                <ArrowLeftRight className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Trade Volume</p>
                <p className="text-2xl font-bold" data-testid="text-total-volume">${parseFloat(analytics?.allTime?.totalVolume || "0").toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/10">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">30-Day Fees</p>
                <p className="text-2xl font-bold" data-testid="text-30day-fees">${parseFloat(analytics?.last30Days?.totalFees || "0").toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/10">
                <Users className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Completed Trades</p>
                <p className="text-2xl font-bold" data-testid="text-total-trades">{analytics?.allTime?.totalTrades || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {analytics?.byStatus && analytics.byStatus.length > 0 && (
        <Card className={surfaceCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Trades by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {analytics.byStatus.map((item: { status: string; count: number }) => (
                <div key={item.status} className="flex items-center gap-2">
                  <Badge
                    variant={
                      item.status === "completed" ? "default" :
                        item.status === "cancelled" ? "destructive" :
                          item.status === "disputed" ? "destructive" :
                            "secondary"
                    }
                    data-testid={`badge-status-${item.status}`}
                  >
                    {item.status}
                  </Badge>
                  <span className="text-sm font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={surfaceCardClass}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Fee Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fee Type</Label>
              <Select
                value={settings?.feeType || "percentage"}
                onValueChange={(value) => handleUpdateSetting("feeType", value)}
              >
                <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-fee-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Only</SelectItem>
                  <SelectItem value="fixed">Fixed Amount Only</SelectItem>
                  <SelectItem value="hybrid">Percentage + Fixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Percentage Fee (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className={INPUT_SURFACE_CLASS}
                  value={parseFloat(settings?.platformFeePercentage || "0") * 100}
                  onChange={(e) => handleUpdateSetting("platformFeePercentage", (parseFloat(e.target.value) / 100).toFixed(4))}
                  disabled={settings?.feeType === "fixed"}
                  data-testid="input-fee-percentage"
                />
                <p className="text-xs text-muted-foreground">
                  {(parseFloat(settings?.platformFeePercentage || "0") * 100).toFixed(2)}% per trade
                </p>
              </div>
              <div className="space-y-2">
                <Label>Fixed Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.platformFeeFixed || "0"}
                  onChange={(e) => handleUpdateSetting("platformFeeFixed", e.target.value)}
                  disabled={settings?.feeType === "percentage"}
                  data-testid="input-fee-fixed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.minFee || "0"}
                  onChange={(e) => handleUpdateSetting("minFee", e.target.value)}
                  data-testid="input-min-fee"
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.maxFee || ""}
                  placeholder="No limit"
                  onChange={(e) => handleUpdateSetting("maxFee", e.target.value || null)}
                  data-testid="input-max-fee"
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <Label className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4" />
                Fee Calculator
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="number"
                  className={INPUT_SURFACE_CLASS}
                  placeholder="Enter trade amount"
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  data-testid="input-test-amount"
                />
                <Button
                  variant="outline"
                  className={BUTTON_3D_CLASS}
                  onClick={() => calculateFeeMutation.mutate(testAmount)}
                  disabled={!testAmount}
                  data-testid="button-calculate-fee"
                >
                  Calculate
                </Button>
              </div>
              {calculatedFee && (
                <div className="mt-2 p-2 bg-muted rounded-md">
                  <p className="text-sm">
                    Fee: <span className="font-bold">${calculatedFee.fee}</span>
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={surfaceCardClass}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Trade Limits & Timeouts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Trade Amount ($)</Label>
                <Input
                  type="number"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.minTradeAmount || "10"}
                  onChange={(e) => handleUpdateSetting("minTradeAmount", e.target.value)}
                  data-testid="input-min-trade"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Trade Amount ($)</Label>
                <Input
                  type="number"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.maxTradeAmount || "100000"}
                  onChange={(e) => handleUpdateSetting("maxTradeAmount", e.target.value)}
                  data-testid="input-max-trade"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Escrow Timeout (hours)</Label>
                <Input
                  type="number"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.escrowTimeoutHours || 24}
                  onChange={(e) => handleUpdateSetting("escrowTimeoutHours", parseInt(e.target.value))}
                  data-testid="input-escrow-timeout"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Timeout (minutes)</Label>
                <Input
                  type="number"
                  className={INPUT_SURFACE_CLASS}
                  value={settings?.paymentTimeoutMinutes || 15}
                  onChange={(e) => handleUpdateSetting("paymentTimeoutMinutes", parseInt(e.target.value))}
                  data-testid="input-payment-timeout"
                />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-Expire Trades</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically cancel expired trades
                  </p>
                </div>
                <Switch
                  checked={settings?.autoExpireEnabled ?? true}
                  onCheckedChange={(checked) => handleUpdateSetting("autoExpireEnabled", checked)}
                  data-testid="switch-auto-expire"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>P2P Trading Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable/disable all P2P trading
                  </p>
                </div>
                <Switch
                  checked={settings?.isEnabled ?? true}
                  onCheckedChange={(checked) => handleUpdateSetting("isEnabled", checked)}
                  data-testid="switch-p2p-enabled"
                />
              </div>

              <div className="border-t pt-4 space-y-4">
                <div>
                  <Label className="text-base">Verification Requirements</Label>
                  <p className="text-sm text-muted-foreground">
                    Control which verification checks are required before users can trade or post P2P ads.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Identity Verification</Label>
                    <p className="text-sm text-muted-foreground">
                      Users must have approved identity verification.
                    </p>
                  </div>
                  <Switch
                    checked={settings?.requireIdentityVerification ?? false}
                    onCheckedChange={(checked) => handleUpdateSetting("requireIdentityVerification", checked)}
                    data-testid="switch-p2p-require-identity-verification"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Phone Verification</Label>
                    <p className="text-sm text-muted-foreground">
                      Users must verify their phone number.
                    </p>
                  </div>
                  <Switch
                    checked={settings?.requirePhoneVerification ?? false}
                    onCheckedChange={(checked) => handleUpdateSetting("requirePhoneVerification", checked)}
                    data-testid="switch-p2p-require-phone-verification"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Email Verification</Label>
                    <p className="text-sm text-muted-foreground">
                      Users must verify their email address.
                    </p>
                  </div>
                  <Switch
                    checked={settings?.requireEmailVerification ?? false}
                    onCheckedChange={(checked) => handleUpdateSetting("requireEmailVerification", checked)}
                    data-testid="switch-p2p-require-email-verification"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={surfaceCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Currency Governance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Allowed Currencies For Buy Ads</Label>
            <Textarea
              className={TEXTAREA_SURFACE_CLASS}
              value={buyCurrenciesDraft}
              onChange={(event) => setBuyCurrenciesDraft(event.target.value)}
              placeholder="USD, EUR, SAR"
              data-testid="textarea-p2p-buy-currencies"
            />
            <p className="text-xs text-muted-foreground">Comma or space separated currency codes.</p>
            <Button
              type="button"
              variant="outline"
              className={BUTTON_3D_CLASS}
              onClick={() => saveCurrencyList("p2pBuyCurrencies", buyCurrenciesDraft)}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-buy-currencies"
            >
              Save Buy Currencies
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Allowed Currencies For Sell Ads</Label>
            <Textarea
              className={TEXTAREA_SURFACE_CLASS}
              value={sellCurrenciesDraft}
              onChange={(event) => setSellCurrenciesDraft(event.target.value)}
              placeholder="USD, EUR, SAR"
              data-testid="textarea-p2p-sell-currencies"
            />
            <p className="text-xs text-muted-foreground">Comma or space separated currency codes.</p>
            <Button
              type="button"
              variant="outline"
              className={BUTTON_3D_CLASS}
              onClick={() => saveCurrencyList("p2pSellCurrencies", sellCurrenciesDraft)}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-sell-currencies"
            >
              Save Sell Currencies
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Allowed Currencies For Deposit</Label>
            <Textarea
              className={TEXTAREA_SURFACE_CLASS}
              value={depositCurrenciesDraft}
              onChange={(event) => setDepositCurrenciesDraft(event.target.value)}
              placeholder="USD, EUR, SAR"
              data-testid="textarea-deposit-currencies"
            />
            <p className="text-xs text-muted-foreground">Comma or space separated currency codes.</p>
            <Button
              type="button"
              variant="outline"
              className={BUTTON_3D_CLASS}
              onClick={() => saveCurrencyList("depositEnabledCurrencies", depositCurrenciesDraft)}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-deposit-currencies"
            >
              Save Deposit Currencies
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className={surfaceCardClass}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Freeze Benefit Program
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={selectedFreezeCurrency} onValueChange={setSelectedFreezeCurrency}>
                  <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-freeze-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {freezeConfigCurrencies.map((currencyCode) => (
                      <SelectItem key={currencyCode} value={currencyCode}>{currencyCode}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <Label>Enabled</Label>
                  <p className="text-xs text-muted-foreground">Allow users to request freeze benefit for this currency.</p>
                </div>
                <Switch
                  checked={freezeDraft.isEnabled}
                  onCheckedChange={(checked) => setFreezeDraft((previous) => ({ ...previous, isEnabled: checked }))}
                  data-testid="switch-freeze-program-enabled"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Benefit Rate %</Label>
                <Input
                  type="number"
                  step="0.001"
                  className={INPUT_SURFACE_CLASS}
                  value={freezeDraft.benefitRatePercent}
                  onChange={(event) => setFreezeDraft((previous) => ({ ...previous, benefitRatePercent: event.target.value }))}
                  data-testid="input-freeze-benefit-rate"
                />
              </div>
              <div className="space-y-2">
                <Label>Base Reduction %</Label>
                <Input
                  type="number"
                  step="0.01"
                  className={INPUT_SURFACE_CLASS}
                  value={freezeDraft.baseReductionPercent}
                  onChange={(event) => setFreezeDraft((previous) => ({ ...previous, baseReductionPercent: event.target.value }))}
                  data-testid="input-freeze-base-reduction"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Reduction %</Label>
                <Input
                  type="number"
                  step="0.01"
                  className={INPUT_SURFACE_CLASS}
                  value={freezeDraft.maxReductionPercent}
                  onChange={(event) => setFreezeDraft((previous) => ({ ...previous, maxReductionPercent: event.target.value }))}
                  data-testid="input-freeze-max-reduction"
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Amount</Label>
                <Input
                  type="number"
                  step="0.00000001"
                  className={INPUT_SURFACE_CLASS}
                  value={freezeDraft.minAmount}
                  onChange={(event) => setFreezeDraft((previous) => ({ ...previous, minAmount: event.target.value }))}
                  data-testid="input-freeze-min-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum Amount (optional)</Label>
                <Input
                  type="number"
                  step="0.00000001"
                  className={INPUT_SURFACE_CLASS}
                  value={freezeDraft.maxAmount}
                  onChange={(event) => setFreezeDraft((previous) => ({ ...previous, maxAmount: event.target.value }))}
                  data-testid="input-freeze-max-amount"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Allowed Payment Methods</Label>
              <div className="max-h-44 space-y-2 overflow-auto rounded-2xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-900/60">
                {availableFreezePaymentMethods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active payment methods available.</p>
                ) : (
                  availableFreezePaymentMethods.map((method) => {
                    const isSelected = freezeDraft.allowedPaymentMethodIds.includes(method.id);
                    return (
                      <button
                        key={method.id}
                        type="button"
                        className={`w-full rounded-xl border px-3 py-3 text-start text-sm shadow-[0_10px_24px_-22px_rgba(15,23,42,0.35)] ${isSelected ? "border-primary bg-primary/5" : "border-border bg-background/80"}`}
                        onClick={() => toggleFreezeMethod(method.id)}
                        data-testid={`freeze-method-${method.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{method.name}</span>
                          <Badge variant="outline">{method.countryCode}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{method.type}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <Button
              className={button3dPrimaryClass}
              onClick={() => updateFreezeProgramMutation.mutate()}
              disabled={updateFreezeProgramMutation.isPending}
              data-testid="button-save-freeze-program"
            >
              Save Freeze Program
            </Button>
          </CardContent>
        </Card>

        <Card className={surfaceCardClass}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Freeze Requests Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status Filter</Label>
              <Select
                value={freezeRequestFilter}
                onValueChange={(value) => setFreezeRequestFilter(value as typeof freezeRequestFilter)}
              >
                <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-freeze-request-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="exhausted">Exhausted</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[420px] space-y-3 overflow-auto">
              {freezeRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No freeze requests found.</p>
              ) : (
                freezeRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 space-y-2 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60" data-testid={`freeze-request-${request.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{request.username} • {request.currencyCode}</div>
                      <Badge variant={request.status === "approved" ? "default" : request.status === "pending" ? "secondary" : "destructive"}>
                        {request.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Requested: {request.amount} | Approved: {request.approvedAmount} | Remaining: {request.remainingAmount}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Method: {request.paymentMethodName}
                      {request.paymentReference ? ` • Ref: ${request.paymentReference}` : ""}
                      {request.payerName ? ` • Payer: ${request.payerName}` : ""}
                    </div>
                    {request.requestNote ? (
                      <p className="text-xs">User note: {request.requestNote}</p>
                    ) : null}
                    {request.rejectionReason ? (
                      <p className="text-xs text-destructive">Reason: {request.rejectionReason}</p>
                    ) : null}

                    {request.status === "pending" ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          size="sm"
                          className={button3dPrimaryClass}
                          onClick={() => reviewFreezeRequestMutation.mutate({ requestId: request.id, decision: "approve" })}
                          disabled={reviewFreezeRequestMutation.isPending}
                          data-testid={`button-approve-freeze-${request.id}`}
                        >
                          <Check className="h-4 w-4 me-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          className={BUTTON_3D_DANGER_CLASS}
                          onClick={() => {
                            setSelectedFreezeRequest(request);
                            setFreezeRejectionReason("");
                          }}
                          disabled={reviewFreezeRequestMutation.isPending}
                          data-testid={`button-reject-freeze-${request.id}`}
                        >
                          <X className="h-4 w-4 me-1" />
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!selectedFreezeRequest} onOpenChange={(open) => {
          if (!open) {
            setSelectedFreezeRequest(null);
            setFreezeRejectionReason("");
          }
        }}>
          <DialogContent className={DIALOG_SURFACE_CLASS}>
            <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
              <DialogTitle>Reject Freeze Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-sm font-semibold">{selectedFreezeRequest?.username || "User"}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedFreezeRequest?.currencyCode || "-"} • {selectedFreezeRequest?.amount || "0"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea
                  className={TEXTAREA_SURFACE_CLASS}
                  placeholder="Enter reason for rejection"
                  value={freezeRejectionReason}
                  onChange={(event) => setFreezeRejectionReason(event.target.value)}
                  data-testid="input-freeze-rejection-reason"
                />
              </div>
            </div>
            <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
              <Button variant="outline" className={BUTTON_3D_CLASS} onClick={() => {
                setSelectedFreezeRequest(null);
                setFreezeRejectionReason("");
              }}>
                Cancel
              </Button>
              <Button
                className={BUTTON_3D_DANGER_CLASS}
                disabled={!selectedFreezeRequest || freezeRejectionReason.trim().length === 0 || reviewFreezeRequestMutation.isPending}
                onClick={() => {
                  if (!selectedFreezeRequest) return;

                  reviewFreezeRequestMutation.mutate({
                    requestId: selectedFreezeRequest.id,
                    decision: "reject",
                    rejectionReason: freezeRejectionReason.trim(),
                  });
                }}
                data-testid="button-confirm-freeze-reject"
              >
                Reject Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function AdminP2PPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [monthlyLimitDrafts, setMonthlyLimitDrafts] = useState<Record<string, string>>({});
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [actionDialog, setActionDialog] = useState<string | null>(null);

  // Alert-based highlighting for P2P trades and disputes
  const { data: unreadData } = useUnreadAlertEntities("/admin/p2p");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();
  const [actionReason, setActionReason] = useState("");
  const [resolution, setResolution] = useState("");

  // Dispute filters
  const [disputeStatus, setDisputeStatus] = useState<string>("all");
  const [disputeSortBy, setDisputeSortBy] = useState<string>("criticality");
  const [liveUpdateHighlight, setLiveUpdateHighlight] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Handle new dispute alerts from authenticated admin WebSocket
  const handleDisputeAlert = useCallback((alert: { entityType?: string; entityId?: string; title?: string; message?: string; severity?: string }) => {
    if (alert.entityType === 'p2p_dispute') {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/admin/p2p/disputes"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/stats"] });

      toast({
        title: alert.title || "Dispute Update",
        description: alert.message || "A dispute requires attention",
        variant: alert.severity === 'critical' ? 'destructive' : 'default',
      });

      if (alert.entityId) {
        setLiveUpdateHighlight(alert.entityId);
        setTimeout(() => setLiveUpdateHighlight(null), 5000);
      }
    }
  }, [toast]);

  // Authenticated admin WebSocket for real-time dispute alerts
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let authFailed = false;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const connectWs = () => {
      if (!isMounted || authFailed) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn("[P2P Admin WS] Max reconnection attempts reached, falling back to polling");
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0; // Reset on successful connection
        // Authenticate as admin to receive admin alerts
        ws.send(JSON.stringify({ type: "admin_auth", token }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "admin_auth_success") {
            // Authenticated
          } else if (data.type === "admin_auth_error") {
            console.error("[P2P Admin WS] Authentication failed:", data.error);
            // Auth failed, mark as failed and close (won't reconnect)
            authFailed = true;
            ws.close();
            return;
          } else if (data.type === "admin_alert" && data.data) {
            handleDisputeAlert(data.data);
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        console.warn("[P2P Admin WS] Connection error");
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(connectWs, delay);
        }
      };
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [handleDisputeAlert]);

  const { data: offers = [], isLoading: offersLoading } = useQuery({
    queryKey: ["/api/admin/p2p/offers"],
    queryFn: () => adminFetch("/api/admin/p2p/offers"),
  });

  const { data: trades = [], isLoading: tradesLoading } = useQuery({
    queryKey: ["/api/admin/p2p/trades"],
    queryFn: () => adminFetch("/api/admin/p2p/trades"),
  });

  const { data: disputes = [], isLoading: disputesLoading } = useQuery({
    queryKey: ["/api/admin/p2p/disputes", disputeStatus, disputeSortBy],
    queryFn: () => adminFetch(`/api/admin/p2p/disputes?status=${disputeStatus}&sortBy=${disputeSortBy}`),
    refetchInterval: 15000, // Poll every 15 seconds for near-real-time updates
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/admin/p2p/stats"],
    queryFn: () => adminFetch("/api/admin/p2p/stats"),
  });

  const { data: adPermissionUsers = [], isLoading: adPermissionsLoading } = useQuery<P2PAdPermissionUser[]>({
    queryKey: ["/api/admin/p2p/ad-permissions", searchQuery],
    queryFn: () => adminFetch(`/api/admin/p2p/ad-permissions?q=${encodeURIComponent(searchQuery)}`),
  });

  useEffect(() => {
    setMonthlyLimitDrafts((previous) => {
      const next = { ...previous };
      for (const userRow of adPermissionUsers) {
        if (next[userRow.userId] === undefined) {
          next[userRow.userId] = userRow.monthlyTradeLimit !== null ? String(userRow.monthlyTradeLimit) : "";
        }
      }
      return next;
    });
  }, [adPermissionUsers]);

  const cancelOfferMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/p2p/offers/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/offers"] });
      toast({ title: "Offer Cancelled", description: "The P2P offer has been cancelled" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel offer", variant: "destructive" });
    },
  });

  const approveOfferMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return adminFetch(`/api/admin/p2p/offers/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/stats"] });
      toast({ title: "Offer Approved", description: "The P2P offer has been approved" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to approve offer", variant: "destructive" });
    },
  });

  const rejectOfferMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/p2p/offers/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/stats"] });
      toast({ title: "Offer Rejected", description: "The P2P offer has been rejected" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reject offer", variant: "destructive" });
    },
  });

  const updateAdPermissionMutation = useMutation({
    mutationFn: async ({
      userId,
      canCreateOffers,
      canTradeP2P,
      bypassVerification,
      monthlyTradeLimit,
      reason,
    }: {
      userId: string;
      canCreateOffers?: boolean;
      canTradeP2P?: boolean;
      bypassVerification?: boolean;
      monthlyTradeLimit?: string | null;
      reason?: string;
    }) => {
      return adminFetch(`/api/admin/p2p/ad-permissions/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ canCreateOffers, canTradeP2P, bypassVerification, monthlyTradeLimit, reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/ad-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/stats"] });
      toast({ title: "Permission Updated", description: "P2P permissions and limits have been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update P2P permissions", variant: "destructive" });
    },
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ id, resolution, winnerId }: { id: string; resolution: string; winnerId: string }) => {
      return adminFetch(`/api/admin/p2p/disputes/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution, winnerId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/trades"] });
      toast({ title: "Dispute Resolved", description: "The dispute has been resolved" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resolve dispute", variant: "destructive" });
    },
  });

  const escalateDisputeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/p2p/disputes/${id}/escalate`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/disputes"] });
      toast({ title: "Dispute Escalated", description: "The dispute has been escalated for investigation" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to escalate dispute", variant: "destructive" });
    },
  });

  const closeDisputeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/p2p/disputes/${id}/close`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/disputes"] });
      toast({ title: "Dispute Closed", description: "The dispute has been closed" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to close dispute", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setActionDialog(null);
    setSelectedOffer(null);
    setSelectedTrade(null);
    setActionReason("");
    setResolution("");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "completed": return "secondary";
      case "cancelled": return "destructive";
      case "rejected": return "destructive";
      case "pending_approval": return "outline";
      case "paused": return "secondary";
      case "pending": return "outline";
      case "processing": return "secondary";
      case "disputed": return "destructive";
      default: return "outline";
    }
  };

  const filteredOffers = offers?.filter((offer: P2POffer) =>
    offer.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    offer.currency?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    offer.visibility?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    offer.status?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    offer.targetUsername?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTrades = trades?.filter((trade: P2PTrade) =>
    trade.buyerUsername?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trade.sellerUsername?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openDisputesCount = disputes?.filter((dispute: P2PDispute) => dispute.status === "open").length || 0;
  const investigatingDisputesCount = disputes?.filter((dispute: P2PDispute) => dispute.status === "investigating").length || 0;
  const resolvedDisputesCount = disputes?.filter((dispute: P2PDispute) => dispute.status === "resolved").length || 0;

  const getDisputeStatusPillClass = (status: string) => {
    if (status === "open") return "border border-red-600/40 bg-red-600/10 text-red-300";
    if (status === "investigating") return "border border-amber-600/40 bg-amber-600/10 text-amber-300";
    if (status === "resolved") return "border border-emerald-600/40 bg-emerald-600/10 text-emerald-300";
    return "border border-slate-700 bg-slate-800 text-slate-200";
  };

  const surfaceCardClass = SURFACE_CARD_CLASS;
  const statCardClass = STAT_CARD_CLASS;
  const button3dClass = BUTTON_3D_CLASS;
  const button3dPrimaryClass = BUTTON_3D_PRIMARY_CLASS;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">P2P Management</h1>
          <p className="text-sm text-muted-foreground">Manage P2P offers, trades and disputes</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className={`${INPUT_SURFACE_CLASS} ps-10`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-p2p"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Offers</p>
                <p className="text-2xl font-bold">{stats?.activeOffers || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed Trades</p>
                <p className="text-2xl font-bold">{stats?.completedTrades || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/10">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Trades</p>
                <p className="text-2xl font-bold">{stats?.pendingTrades || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={statCardClass}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Disputes</p>
                <p className="text-2xl font-bold">{stats?.openDisputes || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="offers">
        <div className="overflow-x-auto pb-1">
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="offers" data-testid="tab-offers">Offers</TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="trades" data-testid="tab-trades">Trades</TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="disputes" data-testid="tab-disputes">
              Disputes
              {disputes?.filter((d: P2PDispute) => d.status === "open" || d.status === "investigating").length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {disputes?.filter((d: P2PDispute) => d.status === "open" || d.status === "investigating").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="permissions" data-testid="tab-ad-permissions">
              <Shield className="h-4 w-4 me-1" />
              Ad Permissions
            </TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="settings" data-testid="tab-settings">
              <Settings className="h-4 w-4 me-1" />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="offers" className="space-y-4">
          {offersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOffers?.map((offer: P2POffer) => (
                <Card key={offer.id} className={surfaceCardClass}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${offer.type === "buy" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                          {offer.type === "buy" ? (
                            <TrendingUp className="h-5 w-5 text-green-500" />
                          ) : (
                            <TrendingDown className="h-5 w-5 text-red-500" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{offer.username}</span>
                            <Badge variant={offer.type === "buy" ? "default" : "secondary"}>
                              {offer.type?.toUpperCase()}
                            </Badge>
                            <Badge variant={getStatusColor(offer.status)}>
                              {offer.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {offer.amount} {offer.currency} @ {offer.price} per unit
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {offer.visibility === "private_friend"
                              ? `private_friend${offer.targetUsername ? ` @${offer.targetUsername}` : ""}`
                              : "public"}
                          </div>
                          {offer.moderationReason && (
                            <div className="text-xs text-destructive">{offer.moderationReason}</div>
                          )}
                          {offer.counterResponse && (
                            <div className="text-xs text-sky-600 dark:text-sky-300">{offer.counterResponse}</div>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className={button3dClass} data-testid={`button-offer-actions-${offer.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedOffer(offer); setActionDialog("viewOffer"); }}>
                            <Eye className="h-4 w-4 me-2" />
                            View Details
                          </DropdownMenuItem>
                          {(offer.status === "pending_approval" || offer.status === "rejected") && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedOffer(offer);
                                setActionReason("");
                                setActionDialog("approveOffer");
                              }}
                            >
                              <Check className="h-4 w-4 me-2" />
                              Approve Offer
                            </DropdownMenuItem>
                          )}
                          {offer.status === "pending_approval" && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedOffer(offer);
                                setActionReason("");
                                setActionDialog("rejectOffer");
                              }}
                              className="text-destructive"
                            >
                              <X className="h-4 w-4 me-2" />
                              Reject Offer
                            </DropdownMenuItem>
                          )}
                          {offer.status === "active" && (
                            <DropdownMenuItem
                              onClick={() => { setSelectedOffer(offer); setActionDialog("cancelOffer"); }}
                              className="text-destructive"
                            >
                              <X className="h-4 w-4 me-2" />
                              Cancel Offer
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredOffers?.length === 0 && (
                <Card className={surfaceCardClass}>
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No offers found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trades" className="space-y-4">
          {tradesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrades?.map((trade: P2PTrade) => {
                const hasUnreadAlert = unreadEntityIds.has(String(trade.id));
                return (
                  <Card key={trade.id} className={`${surfaceCardClass} transition-colors ${hasUnreadAlert ? 'border-s-2 border-s-primary/40 bg-primary/5' : (trade.status === 'pending' || trade.status === 'awaiting_payment' ? 'border-s-2 border-s-yellow-500/50 bg-yellow-500/5' : '')}`}>
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
                              <Badge variant={getStatusColor(trade.status)}>
                                {trade.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {trade.amount} @ ${trade.totalPrice} total
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className={button3dClass} onClick={() => {
                          if (hasUnreadAlert) {
                            markAlertRead.mutate({ entityType: "p2p_trade", entityId: String(trade.id) });
                          }
                          setSelectedTrade(trade); setActionDialog("viewTrade");
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredTrades?.length === 0 && (
                <Card className={surfaceCardClass}>
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No trades found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          <div className={`${surfaceCardClass} overflow-hidden`}>
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-300 to-yellow-500 px-3 py-2 text-slate-950 sm:px-4 sm:py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <h3 className="text-sm font-semibold sm:text-base">Disputes Control</h3>
              </div>
              <Badge className="bg-slate-950 text-amber-300 hover:bg-slate-950">
                {disputes?.length || 0}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
              <div className="rounded-xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Open</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{openDisputesCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Investigating</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{investigatingDisputesCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Resolved</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{resolvedDisputesCount}</p>
              </div>
            </div>

            <div className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={disputeStatus} onValueChange={setDisputeStatus}>
                    <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-dispute-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sort</Label>
                  <Select value={disputeSortBy} onValueChange={setDisputeSortBy}>
                    <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-dispute-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="criticality">Criticality</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60 sm:self-end">
                  {(disputes?.length || 0)} disputes
                </div>
              </div>
            </div>
          </div>

          {disputesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {disputes?.map((dispute: P2PDispute) => {
                const hasUnreadAlert = unreadEntityIds.has(String(dispute.id));
                return (
                  <Card
                    key={dispute.id}
                    className={`${surfaceCardClass} transition-colors ${hasUnreadAlert ? 'border-s-2 border-s-amber-500 bg-amber-50/80 dark:bg-amber-500/10' : ''} ${liveUpdateHighlight === dispute.id ? 'ring-2 ring-amber-400/70' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${dispute.status === "open" ? "bg-red-500/10" : dispute.status === "investigating" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                            <AlertTriangle className={`h-5 w-5 ${dispute.status === "open" ? "text-red-500" : dispute.status === "investigating" ? "text-amber-500" : "text-emerald-500"}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground">Dispute #{dispute.id.slice(0, 8)}</span>
                              <Badge className={getDisputeStatusPillClass(dispute.status)}>
                                {dispute.status}
                              </Badge>
                              {dispute.tradeAmount && (
                                <Badge variant="outline" className="border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300">${dispute.tradeAmount}</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {dispute.initiatorName} vs {dispute.respondentName}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Reason: {dispute.reason?.slice(0, 50)}{(dispute.reason?.length ?? 0) > 50 ? "..." : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Inline action buttons */}
                          {dispute.status === "open" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`${button3dClass} border-amber-400/70 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20`}
                              onClick={() => { setSelectedTrade(dispute); setActionDialog("escalateDispute"); }}
                              data-testid={`button-escalate-${dispute.id}`}
                            >
                              <TrendingUp className="h-4 w-4 me-1" />
                              Escalate
                            </Button>
                          )}
                          {(dispute.status === "open" || dispute.status === "investigating") && (
                            <>
                              <Button
                                size="sm"
                                className="rounded-xl border border-amber-500 bg-gradient-to-b from-amber-300 to-yellow-500 text-slate-950 shadow-[0_8px_0_0_rgba(176,142,35,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(176,142,35,0.45)] hover:brightness-105"
                                onClick={() => { setSelectedTrade(dispute); setActionDialog("resolveDispute"); }}
                                data-testid={`button-resolve-${dispute.id}`}
                              >
                                <Check className="h-4 w-4 me-1" />
                                Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={button3dClass}
                                onClick={() => { setSelectedTrade(dispute); setActionDialog("closeDispute"); }}
                                data-testid={`button-close-${dispute.id}`}
                              >
                                <X className="h-4 w-4 me-1" />
                                Close
                              </Button>
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className={button3dClass} data-testid={`button-dispute-actions-${dispute.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                if (hasUnreadAlert) {
                                  markAlertRead.mutate({ entityType: "p2p_dispute", entityId: String(dispute.id) });
                                }
                                setSelectedTrade(dispute); setActionDialog("viewDispute");
                              }}>
                                <Eye className="h-4 w-4 me-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedTrade(dispute); setActionDialog("viewLogs"); }}>
                                <Clock className="h-4 w-4 me-2" />
                                View Audit Log
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {disputes?.length === 0 && (
                <Card className={surfaceCardClass}>
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No disputes found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          {adPermissionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {adPermissionUsers.map((permissionUser) => {
                const isUpdatingUser = updateAdPermissionMutation.isPending
                  && updateAdPermissionMutation.variables?.userId === permissionUser.userId;
                const monthlyLimitDraft = monthlyLimitDrafts[permissionUser.userId] ?? "";
                const parsedDraftMonthlyLimit = monthlyLimitDraft.trim() === "" ? null : Number(monthlyLimitDraft);
                const isMonthlyLimitDraftValid = parsedDraftMonthlyLimit === null
                  || (Number.isFinite(parsedDraftMonthlyLimit) && parsedDraftMonthlyLimit >= 0);
                const normalizedDraftMonthlyLimit = parsedDraftMonthlyLimit === null
                  ? null
                  : Number(parsedDraftMonthlyLimit.toFixed(2));
                const normalizedCurrentMonthlyLimit = permissionUser.monthlyTradeLimit === null
                  ? null
                  : Number(permissionUser.monthlyTradeLimit);
                const monthlyLimitChanged = normalizedDraftMonthlyLimit !== normalizedCurrentMonthlyLimit;

                return (
                  <Card key={permissionUser.userId} className={surfaceCardClass}>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{permissionUser.username}</span>
                            {permissionUser.email && (
                              <span className="text-xs text-muted-foreground">{permissionUser.email}</span>
                            )}
                            <Badge variant={permissionUser.canTradeP2P ? "default" : "secondary"}>
                              {permissionUser.canTradeP2P ? "Trading Enabled" : "Trading Disabled"}
                            </Badge>
                            <Badge variant={permissionUser.canCreateOffers ? "default" : "secondary"}>
                              {permissionUser.canCreateOffers ? "Ad Posting Enabled" : "Ad Posting Disabled"}
                            </Badge>
                            {permissionUser.verificationBypassed && (
                              <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                                Verification Override
                              </Badge>
                            )}
                            {permissionUser.p2pBanned && (
                              <Badge variant="destructive">P2P Banned</Badge>
                            )}
                          </div>

                          <div className="text-sm text-muted-foreground flex flex-wrap gap-3">
                            <span>Verification: {permissionUser.profileVerificationLevel || permissionUser.idVerificationStatus || "none"}</span>
                            <span>Email verified: {permissionUser.emailVerified ? "Yes" : "No"}</span>
                            <span>Phone verified: {permissionUser.phoneVerified ? "Yes" : "No"}</span>
                            <span>Active payment methods: {permissionUser.activePaymentMethodCount}</span>
                            <span>Active offers: {permissionUser.activeOfferCount}</span>
                            <span>
                              Monthly volume: {permissionUser.monthlyTradedAmount.toFixed(2)}
                              {permissionUser.monthlyTradeLimit !== null ? ` / ${permissionUser.monthlyTradeLimit.toFixed(2)}` : " / no limit"}
                            </span>
                          </div>

                          {permissionUser.p2pBanReason && (
                            <p className="text-xs text-destructive">Ban reason: {permissionUser.p2pBanReason}</p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              variant={permissionUser.verificationBypassed ? "outline" : "default"}
                              className={permissionUser.verificationBypassed ? button3dClass : button3dPrimaryClass}
                              disabled={isUpdatingUser}
                              onClick={() => {
                                if (permissionUser.verificationBypassed) {
                                  updateAdPermissionMutation.mutate({
                                    userId: permissionUser.userId,
                                    bypassVerification: false,
                                    reason: "P2P verification override removed by admin",
                                  });
                                  return;
                                }

                                updateAdPermissionMutation.mutate({
                                  userId: permissionUser.userId,
                                  canTradeP2P: true,
                                  canCreateOffers: true,
                                  bypassVerification: true,
                                  reason: "Full P2P permission granted by admin",
                                });
                              }}
                              data-testid={`button-toggle-verification-override-${permissionUser.userId}`}
                            >
                              {isUpdatingUser
                                ? "Updating..."
                                : permissionUser.verificationBypassed
                                  ? "Remove Full P2P Override"
                                  : "Grant Full P2P"}
                            </Button>

                            <Button
                              variant={permissionUser.canTradeP2P ? "destructive" : "default"}
                              className={!permissionUser.canTradeP2P ? button3dPrimaryClass : undefined}
                              disabled={isUpdatingUser}
                              onClick={() => updateAdPermissionMutation.mutate({
                                userId: permissionUser.userId,
                                canTradeP2P: !permissionUser.canTradeP2P,
                              })}
                              data-testid={`button-toggle-trade-permission-${permissionUser.userId}`}
                            >
                              {isUpdatingUser
                                ? "Updating..."
                                : permissionUser.canTradeP2P
                                  ? "Revoke Trade"
                                  : "Grant Trade"}
                            </Button>

                            <Button
                              variant={permissionUser.canCreateOffers ? "destructive" : "default"}
                              className={!permissionUser.canCreateOffers ? button3dPrimaryClass : undefined}
                              disabled={isUpdatingUser}
                              onClick={() => updateAdPermissionMutation.mutate({
                                userId: permissionUser.userId,
                                canCreateOffers: !permissionUser.canCreateOffers,
                              })}
                              data-testid={`button-toggle-ad-permission-${permissionUser.userId}`}
                            >
                              {isUpdatingUser
                                ? "Updating..."
                                : permissionUser.canCreateOffers
                                  ? "Revoke Ads"
                                  : "Grant Ads"}
                            </Button>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Monthly limit"
                              className={INPUT_SURFACE_CLASS}
                              value={monthlyLimitDraft}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setMonthlyLimitDrafts((previous) => ({
                                  ...previous,
                                  [permissionUser.userId]: nextValue,
                                }));
                              }}
                              data-testid={`input-monthly-trade-limit-${permissionUser.userId}`}
                            />

                            <Button
                              variant="outline"
                              className={button3dClass}
                              disabled={isUpdatingUser || !isMonthlyLimitDraftValid || !monthlyLimitChanged}
                              onClick={() => updateAdPermissionMutation.mutate({
                                userId: permissionUser.userId,
                                monthlyTradeLimit: monthlyLimitDraft.trim() === "" ? null : monthlyLimitDraft.trim(),
                              })}
                              data-testid={`button-save-monthly-trade-limit-${permissionUser.userId}`}
                            >
                              Save Limit
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {adPermissionUsers.length === 0 && (
                <Card className={surfaceCardClass}>
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No users found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <P2PSettingsPanel toast={toast} />
        </TabsContent>
      </Tabs>

      <Dialog open={actionDialog === "cancelOffer"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Cancel Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Enter reason for cancellation..."
                className={TEXTAREA_SURFACE_CLASS}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={closeDialog}>Cancel</Button>
            <Button
              className={BUTTON_3D_DANGER_CLASS}
              onClick={() => cancelOfferMutation.mutate({ id: selectedOffer?.id, reason: actionReason })}
              disabled={!actionReason}
              data-testid="button-confirm-cancel"
            >
              Cancel Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog === "approveOffer"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Approve Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              Approving this offer will make it available for trading.
            </p>
            <div className="space-y-2">
              <Label>Admin Note (optional)</Label>
              <Textarea
                placeholder="Add an optional note..."
                className={TEXTAREA_SURFACE_CLASS}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-approve-note"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={closeDialog}>Cancel</Button>
            <Button
              className={button3dPrimaryClass}
              onClick={() => approveOfferMutation.mutate({ id: String(selectedOffer?.id || ""), reason: actionReason.trim() || undefined })}
              disabled={approveOfferMutation.isPending || !selectedOffer?.id}
              data-testid="button-confirm-approve-offer"
            >
              {approveOfferMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog === "rejectOffer"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Reject Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="Enter reason for rejection..."
                className={TEXTAREA_SURFACE_CLASS}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-reject-reason"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={closeDialog}>Cancel</Button>
            <Button
              className={BUTTON_3D_DANGER_CLASS}
              onClick={() => rejectOfferMutation.mutate({ id: String(selectedOffer?.id || ""), reason: actionReason.trim() })}
              disabled={rejectOfferMutation.isPending || !selectedOffer?.id || !actionReason.trim()}
              data-testid="button-confirm-reject-offer"
            >
              {rejectOfferMutation.isPending ? "Rejecting..." : "Reject Offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog === "resolveDispute"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Resolve Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Winner</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-winner">
                  <SelectValue placeholder="Select winner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initiator">Initiator ({selectedTrade?.initiatorName})</SelectItem>
                  <SelectItem value="respondent">Respondent ({selectedTrade?.respondentName})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Resolution Notes</Label>
              <Textarea
                placeholder="Enter resolution details..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className={TEXTAREA_SURFACE_CLASS}
                data-testid="input-resolution-notes"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={closeDialog}>Cancel</Button>
            <Button
              className="rounded-xl border border-amber-500 bg-gradient-to-b from-amber-300 to-yellow-500 text-slate-950 shadow-[0_8px_0_0_rgba(176,142,35,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(176,142,35,0.45)] hover:brightness-105"
              onClick={() => resolveDisputeMutation.mutate({
                id: selectedTrade?.id,
                resolution: actionReason,
                winnerId: resolution === "initiator" ? selectedTrade?.initiatorId : selectedTrade?.respondentId,
              })}
              disabled={!resolution || !actionReason}
              data-testid="button-confirm-resolve"
            >
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog === "viewOffer" || actionDialog === "viewTrade" || actionDialog === "viewDispute"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>
              {actionDialog === "viewOffer" && "Offer Details"}
              {actionDialog === "viewTrade" && "Trade Details"}
              {actionDialog === "viewDispute" && "Dispute Details"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <DetailGrid data={(actionDialog === "viewOffer" ? selectedOffer : selectedTrade) as Record<string, unknown>} />
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button className={button3dClass} onClick={closeDialog}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dispute Dialog */}
      <Dialog open={actionDialog === "escalateDispute"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Escalate Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              Escalate this dispute to investigation status. This will mark it for priority review.
            </p>
            <div className="space-y-2">
              <Label>Reason for Escalation</Label>
              <Textarea
                placeholder="Enter reason for escalation..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className={TEXTAREA_SURFACE_CLASS}
                data-testid="input-escalate-reason"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={closeDialog}>Cancel</Button>
            <Button
              className="rounded-xl border border-amber-500 bg-gradient-to-b from-amber-300 to-yellow-500 text-slate-950 shadow-[0_8px_0_0_rgba(176,142,35,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(176,142,35,0.45)] hover:brightness-105"
              onClick={() => escalateDisputeMutation.mutate({ id: selectedTrade?.id, reason: actionReason })}
              disabled={escalateDisputeMutation.isPending}
              data-testid="button-confirm-escalate"
            >
              {escalateDisputeMutation.isPending ? "Escalating..." : "Escalate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Dispute Dialog */}
      <Dialog open={actionDialog === "closeDispute"} onOpenChange={() => closeDialog()}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Close Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              Close this dispute without a formal resolution. Use this for disputes that were withdrawn or resolved outside the platform.
            </p>
            <div className="space-y-2">
              <Label>Reason for Closing</Label>
              <Textarea
                placeholder="Enter reason for closing..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className={TEXTAREA_SURFACE_CLASS}
                data-testid="input-close-reason"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={closeDialog}>Cancel</Button>
            <Button
              className={button3dClass}
              onClick={() => closeDisputeMutation.mutate({ id: selectedTrade?.id, reason: actionReason })}
              disabled={!actionReason || closeDisputeMutation.isPending}
              data-testid="button-confirm-close"
            >
              {closeDisputeMutation.isPending ? "Closing..." : "Close Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Logs Dialog */}
      <Dialog open={actionDialog === "viewLogs"} onOpenChange={() => closeDialog()}>
        <DialogContent className={`${DIALOG_SURFACE_CLASS} sm:max-w-3xl`}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Dispute Audit Log</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <DisputeAuditLog disputeId={selectedTrade?.id} />
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button className={button3dClass} onClick={closeDialog}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DisputeAuditLog({ disputeId }: { disputeId?: string }) {
  const { data: logs = [], isLoading, isError } = useQuery({
    queryKey: ["/api/admin/p2p/disputes", disputeId, "logs"],
    queryFn: () => disputeId
      ? adminFetch(`/api/admin/p2p/disputes/${disputeId}/logs`)
      : Promise.resolve([]),
    enabled: !!disputeId,
  });

  if (isError) {
    return <p className="text-center text-destructive py-4">Failed to load audit logs</p>;
  }

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>;
  }

  if (!logs.length) {
    return <p className="py-4 text-center text-muted-foreground">No audit logs found</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {logs.map((log: P2PAuditLog) => (
        <div key={log.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300">{log.action}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(log.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground">{log.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">By: {log.username}</p>
        </div>
      ))}
    </div>
  );
}
