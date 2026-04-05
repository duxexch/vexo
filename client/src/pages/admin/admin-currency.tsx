import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ProjectCurrencyAmount, ProjectCurrencySymbol } from "@/components/ProjectCurrencySymbol";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Coins, Settings2, TrendingUp, Users, Clock, Check, X, AlertCircle,
  RefreshCw, DollarSign, ArrowRightLeft, History, Loader2
} from "lucide-react";
import { format } from "date-fns";

const adminToken = () => localStorage.getItem("adminToken") || "";

interface CurrencySettings {
  id: string;
  currencyName: string;
  currencySymbol: string;
  exchangeRate: string;
  minConversionAmount: string;
  maxConversionAmount: string;
  dailyConversionLimitPerUser: string;
  dailyConversionLimitPlatform: string;
  conversionCommissionRate: string;
  approvalMode: "automatic" | "manual";
  isActive: boolean;
  allowEarnedBalance: boolean;
  earnedBalanceExpireDays: number | null;
  useInGames: boolean;
  useInP2P: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Conversion {
  id: string;
  userId: string;
  baseCurrencyAmount: string;
  projectCurrencyAmount: string;
  exchangeRateUsed: string;
  commissionAmount: string;
  netAmount: string;
  status: "pending" | "completed" | "rejected" | "cancelled";
  approvedById: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  completedAt: string | null;
  createdAt: string;
  user?: { id: string; username: string; displayName: string | null };
  approver?: { id: string; username: string } | null;
}

interface CurrencyStats {
  totalWallets: number;
  totalConverted: string;
  pendingConversions: number;
  totalCirculating: string;
  totalCommissions: string;
  baseCurrencyConverted: string;
  totalConversionsCount: number;
  dailyConversionTotal: string;
}

interface PlayGiftPolicy {
  mode: "project_only" | "mixed";
  projectOnly: boolean;
}

interface DepositFxCurrency {
  code: string;
  name: string;
  symbol: string;
  exchangeRate: string | null;
  isActive: boolean;
  isOperational: boolean;
}

interface DepositFxCurrenciesResponse {
  currencies: DepositFxCurrency[];
  operationalCurrencies: string[];
  missingRateCurrencies: string[];
  balanceCurrency: string;
}

export default function AdminCurrencyPage() {
  const { toast } = useToast();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedConversionId, setSelectedConversionId] = useState<string | null>(null);
  const [depositRateDrafts, setDepositRateDrafts] = useState<Record<string, string>>({});

  const { data: settings, isLoading: settingsLoading } = useQuery<CurrencySettings>({
    queryKey: ["/api/admin/project-currency/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/project-currency/settings", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const { data: conversions, isLoading: conversionsLoading } = useQuery<Conversion[]>({
    queryKey: ["/api/admin/project-currency/conversions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/project-currency/conversions?limit=100", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch conversions");
      return res.json();
    },
  });

  const { data: stats } = useQuery<CurrencyStats>({
    queryKey: ["/api/admin/project-currency/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/project-currency/stats", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: playGiftPolicy } = useQuery<PlayGiftPolicy>({
    queryKey: ["/api/admin/project-currency/play-gift-policy"],
    queryFn: async () => {
      const res = await fetch("/api/admin/project-currency/play-gift-policy", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch play/gift policy");
      return res.json();
    },
  });

  const { data: depositFxCurrencies, isLoading: depositFxLoading } = useQuery<DepositFxCurrenciesResponse>({
    queryKey: ["/api/admin/project-currency/deposit-fx-currencies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/project-currency/deposit-fx-currencies", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch deposit FX currencies");
      return res.json();
    },
  });

  useEffect(() => {
    if (!depositFxCurrencies?.currencies) {
      return;
    }

    const nextDrafts: Record<string, string> = {};
    for (const currency of depositFxCurrencies.currencies) {
      nextDrafts[currency.code] = currency.exchangeRate ? String(currency.exchangeRate) : "";
    }

    setDepositRateDrafts(nextDrafts);
  }, [depositFxCurrencies]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<CurrencySettings>) => {
      const res = await fetch("/api/admin/project-currency/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken()
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/settings"] });
      toast({ title: "Settings updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/project-currency/conversions/${id}/approve`, {
        method: "POST",
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/conversions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/stats"] });
      toast({ title: "Conversion approved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/admin/project-currency/conversions/${id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken()
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/conversions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/stats"] });
      setRejectDialogOpen(false);
      setRejectReason("");
      setSelectedConversionId(null);
      toast({ title: "Conversion rejected and balance refunded" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
    },
  });

  const updatePlayGiftPolicyMutation = useMutation({
    mutationFn: async (mode: "project_only" | "mixed") => {
      const res = await fetch("/api/admin/project-currency/play-gift-policy", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to update policy" }));
        throw new Error(data.error || "Failed to update policy");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/play-gift-policy"] });
      toast({
        title: "Policy updated",
        description: "Games and gift purchases currency mode was updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update policy", description: error.message, variant: "destructive" });
    },
  });

  const updateDepositFxCurrencyMutation = useMutation({
    mutationFn: async (payload: { code: string; exchangeRate?: string; isActive?: boolean }) => {
      const requestBody: Record<string, unknown> = {};

      if (payload.exchangeRate !== undefined) {
        requestBody.exchangeRate = payload.exchangeRate;
      }

      if (payload.isActive !== undefined) {
        requestBody.isActive = payload.isActive;
      }

      const res = await fetch(`/api/admin/project-currency/deposit-fx-currencies/${payload.code}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to update deposit FX currency" }));
        throw new Error(data.error || "Failed to update deposit FX currency");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/deposit-fx-currencies"] });
      toast({ title: "Deposit FX currency updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update deposit FX currency", description: error.message, variant: "destructive" });
    },
  });

  const handleSettingChange = (key: keyof CurrencySettings, value: string | number | boolean | null) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  const handleDepositRateBlur = (currencyCode: string) => {
    const draftRate = depositRateDrafts[currencyCode];
    if (!draftRate) {
      return;
    }

    updateDepositFxCurrencyMutation.mutate({
      code: currencyCode,
      exchangeRate: draftRate,
    });
  };

  const pendingConversions = conversions?.filter(c => c.status === "pending") || [];

  if (settingsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Project Currency Management
          </h1>
          <p className="text-muted-foreground">
            Configure {settings?.currencyName || "VEX Coin"} exchange rates, limits, and approvals
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/settings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/conversions"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/play-gift-policy"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/project-currency/deposit-fx-currencies"] });
          }}
          data-testid="button-refresh-currency"
        >
          <RefreshCw className="h-4 w-4 me-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Wallets</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-wallets">
              {stats?.totalWallets || 0}
            </div>
            <p className="text-xs text-muted-foreground">Active user wallets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">USD Converted</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-base-converted">
              ${parseFloat(stats?.baseCurrencyConverted || "0").toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">{stats?.totalConversionsCount || 0} total conversions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Converted</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-converted">
              <ProjectCurrencyAmount amount={stats?.totalConverted || "0"} symbolClassName="text-2xl" />
            </div>
            <p className="text-xs text-muted-foreground">All-time issued</p>
          </CardContent>
        </Card>

        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Total Commissions</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-total-commissions">
              ${parseFloat(stats?.totalCommissions || "0").toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Revenue from conversions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-approvals">
              {stats?.pendingConversions || 0}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">In Circulation</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-circulating">
              <ProjectCurrencyAmount amount={stats?.totalCirculating || "0"} symbolClassName="text-2xl" />
            </div>
            <p className="text-xs text-muted-foreground">Total in user wallets</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings" data-testid="tab-currency-settings">
            <Settings2 className="h-4 w-4 me-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending-conversions">
            <Clock className="h-4 w-4 me-2" />
            Pending ({pendingConversions.length})
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-conversion-history">
            <History className="h-4 w-4 me-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Currency Configuration</CardTitle>
                <CardDescription>Basic currency settings and branding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Currency Active</Label>
                    <p className="text-xs text-muted-foreground">Enable/disable project currency</p>
                  </div>
                  <Switch
                    checked={settings?.isActive || false}
                    onCheckedChange={(checked) => handleSettingChange("isActive", checked)}
                    data-testid="switch-currency-active"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="currencyName">Currency Name</Label>
                  <Input
                    id="currencyName"
                    defaultValue={settings?.currencyName || "VEX Coin"}
                    onBlur={(e) => handleSettingChange("currencyName", e.target.value)}
                    data-testid="input-currency-name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="currencySymbol">Currency Symbol</Label>
                  <Input
                    id="currencySymbol"
                    defaultValue={settings?.currencySymbol || "v"}
                    onBlur={(e) => handleSettingChange("currencySymbol", e.target.value)}
                    data-testid="input-currency-symbol"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="exchangeRate" className="inline-flex items-center gap-1">
                    <span>Exchange Rate (1 USD = X</span>
                    <ProjectCurrencySymbol className="text-sm" />
                    <span>)</span>
                  </Label>
                  <Input
                    id="exchangeRate"
                    type="number"
                    step="0.01"
                    defaultValue={settings?.exchangeRate || "1.00"}
                    onBlur={(e) => handleSettingChange("exchangeRate", e.target.value)}
                    data-testid="input-exchange-rate"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="approvalMode">Approval Mode</Label>
                  <Select
                    value={settings?.approvalMode || "automatic"}
                    onValueChange={(value) => handleSettingChange("approvalMode", value)}
                  >
                    <SelectTrigger data-testid="select-approval-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Automatic (Instant)</SelectItem>
                      <SelectItem value="manual">Manual (Requires Admin)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {settings?.approvalMode === "manual"
                      ? "All conversions require admin approval before crediting"
                      : "Conversions are processed instantly without admin review"
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion Limits</CardTitle>
                <CardDescription>Set limits for currency conversions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="minConversion">Minimum Conversion (USD)</Label>
                  <Input
                    id="minConversion"
                    type="number"
                    step="0.01"
                    defaultValue={settings?.minConversionAmount || "1.00"}
                    onBlur={(e) => handleSettingChange("minConversionAmount", e.target.value)}
                    data-testid="input-min-conversion"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="maxConversion">Maximum Conversion (USD)</Label>
                  <Input
                    id="maxConversion"
                    type="number"
                    step="0.01"
                    defaultValue={settings?.maxConversionAmount || "10000.00"}
                    onBlur={(e) => handleSettingChange("maxConversionAmount", e.target.value)}
                    data-testid="input-max-conversion"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="dailyUserLimit">Daily Limit per User (USD)</Label>
                  <Input
                    id="dailyUserLimit"
                    type="number"
                    step="0.01"
                    defaultValue={settings?.dailyConversionLimitPerUser || "5000.00"}
                    onBlur={(e) => handleSettingChange("dailyConversionLimitPerUser", e.target.value)}
                    data-testid="input-daily-user-limit"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="dailyPlatformLimit">Daily Platform Limit (USD)</Label>
                  <Input
                    id="dailyPlatformLimit"
                    type="number"
                    step="0.01"
                    defaultValue={settings?.dailyConversionLimitPlatform || "100000.00"}
                    onBlur={(e) => handleSettingChange("dailyConversionLimitPlatform", e.target.value)}
                    data-testid="input-daily-platform-limit"
                  />
                  <p className="text-xs text-muted-foreground">
                    Today's total: ${parseFloat(stats?.dailyConversionTotal || "0").toFixed(2)}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                  <Input
                    id="commissionRate"
                    type="number"
                    step="0.001"
                    defaultValue={(parseFloat(settings?.conversionCommissionRate || "0") * 100).toFixed(1)}
                    onBlur={(e) => handleSettingChange("conversionCommissionRate", (parseFloat(e.target.value) / 100).toString())}
                    data-testid="input-commission-rate"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fee charged on conversions (deducted from converted amount)
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage Settings</CardTitle>
                <CardDescription>Configure where project currency can be used</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                  <div>
                    <Label>Gameplay & Gifts Currency Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose whether to force project currency only, or allow mixed mode (real money + project currency).
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={(playGiftPolicy?.projectOnly ?? true) ? "default" : "outline"}
                      onClick={() => updatePlayGiftPolicyMutation.mutate("project_only")}
                      disabled={updatePlayGiftPolicyMutation.isPending}
                      data-testid="button-project-only-play-gifts"
                    >
                      Project Currency Only
                    </Button>
                    <Button
                      type="button"
                      variant={(playGiftPolicy?.projectOnly ?? true) ? "outline" : "default"}
                      onClick={() => updatePlayGiftPolicyMutation.mutate("mixed")}
                      disabled={updatePlayGiftPolicyMutation.isPending}
                      data-testid="button-mixed-play-gifts"
                    >
                      Allow Real Currency (Mixed)
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current mode: {(playGiftPolicy?.projectOnly ?? true) ? "Project only" : "Mixed"}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Use in Games</Label>
                    <p className="text-xs text-muted-foreground">Allow using project currency for game entries</p>
                  </div>
                  <Switch
                    checked={settings?.useInGames || false}
                    onCheckedChange={(checked) => handleSettingChange("useInGames", checked)}
                    disabled={updateSettingsMutation.isPending}
                    data-testid="switch-use-in-games"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Use in P2P Trading</Label>
                    <p className="text-xs text-muted-foreground">Allow using project currency in P2P trades</p>
                  </div>
                  <Switch
                    checked={settings?.useInP2P || false}
                    onCheckedChange={(checked) => handleSettingChange("useInP2P", checked)}
                    disabled={updateSettingsMutation.isPending}
                    data-testid="switch-use-in-p2p"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Allow Earned Balance</Label>
                    <p className="text-xs text-muted-foreground">Users can earn currency through activities</p>
                  </div>
                  <Switch
                    checked={settings?.allowEarnedBalance || false}
                    onCheckedChange={(checked) => handleSettingChange("allowEarnedBalance", checked)}
                    disabled={updateSettingsMutation.isPending}
                    data-testid="switch-allow-earned"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Deposit FX Currencies</CardTitle>
                <CardDescription>
                  Manage exchange rates used when converting deposit currencies into USD platform balance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {depositFxLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : depositFxCurrencies?.currencies?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Rate (1 USD = X)</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {depositFxCurrencies.currencies.map((currency) => (
                        <TableRow key={currency.code} data-testid={`row-deposit-fx-${currency.code}`}>
                          <TableCell className="font-semibold">{currency.code}</TableCell>
                          <TableCell>{currency.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.000001"
                                value={depositRateDrafts[currency.code] ?? ""}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setDepositRateDrafts((prev) => ({
                                    ...prev,
                                    [currency.code]: nextValue,
                                  }));
                                }}
                                onBlur={() => handleDepositRateBlur(currency.code)}
                                disabled={updateDepositFxCurrencyMutation.isPending}
                                data-testid={`input-deposit-fx-rate-${currency.code}`}
                                className="w-40"
                              />
                              <span className="text-xs text-muted-foreground">{currency.code}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={currency.isActive}
                              onCheckedChange={(checked) => {
                                updateDepositFxCurrencyMutation.mutate({
                                  code: currency.code,
                                  isActive: checked,
                                });
                              }}
                              disabled={updateDepositFxCurrencyMutation.isPending}
                              data-testid={`switch-deposit-fx-active-${currency.code}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant={currency.isOperational ? "default" : "destructive"}>
                              {currency.isOperational ? "Operational" : "Unavailable"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-sm text-muted-foreground">No deposit currencies configured.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Conversions</CardTitle>
              <CardDescription>Review and approve/reject pending conversion requests</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingConversions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Check className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No pending conversions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Base Amount</TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-1">
                          <span>Net</span>
                          <ProjectCurrencySymbol className="text-xs" />
                        </span>
                      </TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingConversions.map((conv) => (
                      <TableRow key={conv.id} data-testid={`row-conversion-${conv.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{conv.user?.displayName || conv.user?.username}</div>
                            <div className="text-xs text-muted-foreground">@{conv.user?.username}</div>
                          </div>
                        </TableCell>
                        <TableCell>${parseFloat(conv.baseCurrencyAmount).toFixed(2)}</TableCell>
                        <TableCell className="font-medium text-primary">
                          <ProjectCurrencyAmount amount={conv.netAmount} symbolClassName="text-sm" />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          ${parseFloat(conv.commissionAmount).toFixed(2)}
                        </TableCell>
                        <TableCell>{format(new Date(conv.createdAt), "PPp")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(conv.id)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${conv.id}`}
                            >
                              <Check className="h-4 w-4 me-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setSelectedConversionId(conv.id);
                                setRejectDialogOpen(true);
                              }}
                              disabled={rejectMutation.isPending}
                              data-testid={`button-reject-${conv.id}`}
                            >
                              <X className="h-4 w-4 me-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Conversion History</CardTitle>
              <CardDescription>All conversion requests and their outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              {conversionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : conversions?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No conversion history</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Base Amount</TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-1">
                          <span>Net</span>
                          <ProjectCurrencySymbol className="text-xs" />
                        </span>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reviewed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversions?.map((conv) => (
                      <TableRow key={conv.id} data-testid={`row-history-${conv.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{conv.user?.displayName || conv.user?.username}</div>
                            <div className="text-xs text-muted-foreground">@{conv.user?.username}</div>
                          </div>
                        </TableCell>
                        <TableCell>${parseFloat(conv.baseCurrencyAmount).toFixed(2)}</TableCell>
                        <TableCell className="font-medium">
                          <ProjectCurrencyAmount amount={conv.netAmount} symbolClassName="text-sm" />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              conv.status === "completed" ? "default" :
                                conv.status === "pending" ? "secondary" :
                                  conv.status === "rejected" ? "destructive" :
                                    "secondary"
                            }
                          >
                            {conv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(conv.createdAt), "PPp")}</TableCell>
                        <TableCell>
                          {conv.approver ? (
                            <span className="text-muted-foreground">@{conv.approver.username}</span>
                          ) : conv.status === "completed" ? (
                            <span className="text-muted-foreground">Automatic</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Conversion</DialogTitle>
            <DialogDescription>
              The user's base currency balance will be refunded. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="rejectReason">Rejection Reason</Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                data-testid="textarea-reject-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedConversionId) {
                  rejectMutation.mutate({ id: selectedConversionId, reason: rejectReason });
                }
              }}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : null}
              Reject & Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
