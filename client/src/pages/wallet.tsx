import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { queryClient, financialQueryOptions } from "@/lib/queryClient";
import { apiRequestWithPaymentToken } from "@/lib/payment-operation";
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  CreditCard,
  Building2,
  Smartphone,
  Bitcoin,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Coins,
  ArrowRightLeft,
  Loader2
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/skeletons";
import { QueryErrorState } from "@/components/QueryErrorState";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { ProjectCurrencyAmount, ProjectCurrencySymbol } from "@/components/ProjectCurrencySymbol";
import { useBalance } from "@/hooks/useBalance";
import { playSound } from "@/hooks/use-sound-effects";
import type { Transaction, ProjectCurrencyConversion, CountryPaymentMethod } from "@shared/schema";

interface WalletStats {
  totalDeposited: string;
  totalWithdrawn: string;
  totalWagered: string;
  totalWon: string;
}

interface ProjectCurrencySettings {
  currencyName: string;
  currencySymbol: string;
  exchangeRate: string;
  minConversionAmount: string;
  maxConversionAmount: string;
  conversionCommissionRate: string;
  useInGames: boolean;
  useInP2P: boolean;
  isActive: boolean;
}

interface ProjectCurrencyWallet {
  id: string;
  purchasedBalance: string;
  earnedBalance: string;
  totalBalance: string;
  currencyName: string;
  currencySymbol: string;
}

interface DepositConfig {
  allowedDepositCurrencies: string[];
  defaultDepositCurrency: string;
  disabledDepositCurrencies?: string[];
  balanceCurrency?: string;
  usdRateByCurrency?: Record<string, number>;
}

export default function WalletPage() {
  const { t, language } = useI18n();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const tOr = (key: string, fallback: string): string => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [depositPaymentMethod, setDepositPaymentMethod] = useState("");
  const [withdrawPaymentMethod, setWithdrawPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [walletNumber, setWalletNumber] = useState("");
  const [depositCurrency, setDepositCurrency] = useState("USD");
  const { isHidden: isBalanceHidden } = useBalance();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modal = params.get("modal");
    const amountParam = params.get("amount");
    const parsedAmount = amountParam ? Number(amountParam) : NaN;
    const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

    if (modal === "deposit") {
      setShowDeposit(true);
      if (hasValidAmount) {
        setDepositAmount(parsedAmount.toFixed(2));
      }
    }

    if (modal === "convert") {
      setShowConvert(true);
      if (hasValidAmount) {
        setConvertAmount(parsedAmount.toFixed(2));
      }
    }

    if (modal === "deposit" || modal === "convert") {
      params.delete("modal");
      params.delete("amount");
      const remainingQuery = params.toString();
      const nextUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  const { data: txResponse, isLoading: loadingTransactions, isError: isErrorTransactions, error: errorTransactions, refetch: refetchTransactions } = useQuery<{ data: Transaction[]; total: number }>({
    queryKey: ['/api/transactions', { pageSize: 10 }],
    queryFn: async () => {
      const res = await fetch('/api/transactions?pageSize=10', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
    ...financialQueryOptions,
  });
  const transactions = txResponse?.data ?? [];

  const { data: walletStats } = useQuery<WalletStats>({
    queryKey: ['/api/wallet/stats'],
    ...financialQueryOptions,
  });

  const { data: depositConfig } = useQuery<DepositConfig>({
    queryKey: ['/api/transactions/deposit-config'],
    ...financialQueryOptions,
  });

  const { data: withdrawalPaymentMethods = [] } = useQuery<CountryPaymentMethod[]>({
    queryKey: ['/api/payment-methods', 'withdrawal'],
    queryFn: async () => {
      const res = await fetch('/api/payment-methods?purpose=withdrawal', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        return [];
      }
      return res.json();
    },
    ...financialQueryOptions,
  });

  const hasWithdrawalMethods = withdrawalPaymentMethods.length > 0;

  useEffect(() => {
    if (!depositConfig) return;

    setDepositCurrency((currentCurrency) => {
      if (depositConfig.allowedDepositCurrencies.includes(currentCurrency)) {
        return currentCurrency;
      }

      return depositConfig.defaultDepositCurrency || depositConfig.allowedDepositCurrencies[0] || 'USD';
    });
  }, [depositConfig]);

  const depositFxPreview = useMemo(() => {
    if (!depositConfig?.usdRateByCurrency) {
      return null;
    }

    const parsedAmount = Number(depositAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return null;
    }

    const usdToDepositRate = Number(depositConfig.usdRateByCurrency[depositCurrency]);
    if (!Number.isFinite(usdToDepositRate) || usdToDepositRate <= 0) {
      return null;
    }

    const estimatedCredit = Math.round(((parsedAmount / usdToDepositRate) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(estimatedCredit) || estimatedCredit <= 0) {
      return null;
    }

    return {
      usdToDepositRate,
      estimatedCredit,
      balanceCurrency: depositConfig.balanceCurrency || "USD",
      parsedAmount,
    };
  }, [depositConfig?.balanceCurrency, depositConfig?.usdRateByCurrency, depositAmount, depositCurrency]);

  const { data: currencySettings } = useQuery<ProjectCurrencySettings>({
    queryKey: ['/api/project-currency/settings'],
    retry: false,
  });

  const { data: projectWallet, isLoading: walletLoading } = useQuery<ProjectCurrencyWallet>({
    queryKey: ['/api/project-currency/wallet'],
    enabled: !!currencySettings?.isActive,
    ...financialQueryOptions,
  });

  const { data: currencyConversions } = useQuery<ProjectCurrencyConversion[]>({
    queryKey: ['/api/project-currency/conversions'],
    enabled: !!currencySettings?.isActive,
  });

  const walletCurrencyName = useMemo(() => {
    const configuredName = String(currencySettings?.currencyName || "").trim();
    if (!configuredName || /^vex\s*coins?$/i.test(configuredName)) {
      return "vx";
    }
    return configuredName;
  }, [currencySettings?.currencyName]);

  const convertNowLabel = tOr("wallet.convertNow", `Convert to ${walletCurrencyName}`)
    .replace(/VEX\s*Coins?/gi, walletCurrencyName);

  const convertMutation = useMutation({
    mutationFn: (data: { amount: string }) =>
      apiRequestWithPaymentToken('POST', '/api/project-currency/convert', data, 'convert'),
    onSuccess: async (res: Response) => {
      const result = await res.json().catch(() => ({}));
      const message = result.status === 'pending'
        ? 'Conversion submitted for approval'
        : 'Converted to project currency successfully!';
      toast({ title: t('common.success'), description: message });
      queryClient.invalidateQueries({ queryKey: ['/api/project-currency/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-currency/conversions'] });
      refreshUser?.();
      setShowConvert(false);
      setConvertAmount("");
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const depositMutation = useMutation({
    mutationFn: (data: { amount: number; paymentMethod: string; paymentReference: string; walletNumber?: string; currency: string }) =>
      apiRequestWithPaymentToken('POST', '/api/transactions/deposit', data, 'deposit'),
    onSuccess: () => {
      playSound('coin');
      toast({ title: t('common.success'), description: t('wallet.depositSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      refreshUser?.();
      setShowDeposit(false);
      setDepositAmount("");
      setDepositPaymentMethod("");
      setPaymentReference("");
      setWalletNumber("");
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: (data: { amount: number; paymentMethodId: string }) =>
      apiRequestWithPaymentToken('POST', '/api/transactions/withdraw', data, 'withdraw'),
    onSuccess: () => {
      playSound('success');
      toast({ title: t('common.success'), description: t('wallet.withdrawSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      refreshUser?.();
      setShowWithdraw(false);
      setWithdrawAmount("");
      setWithdrawPaymentMethod("");
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const recentTransactions = Array.isArray(transactions) ? transactions : [];

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownToLine className="h-4 w-4 text-green-500" />;
      case 'withdrawal': return <ArrowUpFromLine className="h-4 w-4 text-red-500" />;
      case 'stake': return <TrendingDown className="h-4 w-4 text-orange-500" />;
      case 'win': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'bonus': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'reward': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'refund': return <ArrowDownToLine className="h-4 w-4 text-green-500" />;
      default: return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 me-1" />{t('wallet.completed')}</Badge>;
      case 'pending': return <Badge variant="secondary"><Clock className="h-3 w-3 me-1" />{t('wallet.pending')}</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 me-1" />{t('wallet.rejected')}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const paymentMethods = [
    { id: 'bank', name: t('wallet.bankTransfer'), icon: Building2 },
    { id: 'card', name: t('wallet.creditCard'), icon: CreditCard },
    { id: 'ewallet', name: t('wallet.eWallet'), icon: Smartphone },
    { id: 'crypto', name: t('wallet.crypto'), icon: Bitcoin },
  ];

  const getMethodIcon = (type: string) => {
    switch (type) {
      case 'bank_transfer':
        return Building2;
      case 'card':
        return CreditCard;
      case 'e_wallet':
        return Smartphone;
      case 'crypto':
        return Bitcoin;
      default:
        return CreditCard;
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            {t('wallet.title')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t('wallet.description')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle>{t('wallet.currentBalance')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="mb-4">
              <BalanceDisplay balance={user?.balance || "0"} variant="header" />
            </div>
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              <Button onClick={() => setShowDeposit(true)} className="flex-1 sm:flex-none min-h-[44px]" data-testid="button-deposit">
                <ArrowDownToLine className="h-4 w-4 me-2" />
                {t('wallet.deposit')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowWithdraw(true)}
                className="flex-1 sm:flex-none min-h-[44px]"
                data-testid="button-withdraw"
                disabled={!hasWithdrawalMethods}
              >
                <ArrowUpFromLine className="h-4 w-4 me-2" />
                {t('wallet.withdraw')}
              </Button>
              {!hasWithdrawalMethods && (
                <Button
                  variant="secondary"
                  onClick={() => setLocation('/p2p')}
                  className="flex-1 sm:flex-none min-h-[44px]"
                  data-testid="button-go-p2p"
                >
                  {tOr('nav.p2p', 'P2P')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('wallet.quickStats')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalDeposited')}</span>
              <span className="font-medium text-green-500">${parseFloat(user?.totalDeposited || "0").toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalWithdrawn')}</span>
              <span className="font-medium text-red-500">${parseFloat(user?.totalWithdrawn || "0").toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalWagered')}</span>
              <span className="font-medium">${parseFloat(user?.totalWagered || "0").toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalWon')}</span>
              <span className="font-medium text-primary">${parseFloat(user?.totalWon || "0").toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {currencySettings?.isActive && (
        <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/10">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    {walletCurrencyName}
                  </CardTitle>
                  <CardDescription>
                    {currencySettings.useInGames && currencySettings.useInP2P
                      ? tOr('wallet.vexUsageGamesAndP2P', 'Use for games and P2P trading')
                      : currencySettings.useInGames
                        ? tOr('wallet.vexUsageGames', 'Use for games')
                        : currencySettings.useInP2P
                          ? tOr('wallet.vexUsageP2P', 'Use for P2P trading')
                          : tOr('wallet.vexUsagePlatform', 'Platform currency')
                    }
                  </CardDescription>
                </div>
              </div>

            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="text-4xl font-bold text-primary balance-glow mb-4" data-testid="text-vxc-balance">
                  {isBalanceHidden
                    ? '******'
                    : <ProjectCurrencyAmount amount={projectWallet?.totalBalance || "0"} symbolClassName="text-4xl" />
                  }
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{tOr('wallet.purchased', 'Purchased')}</div>
                    <div className="text-lg font-semibold">
                      {isBalanceHidden ? '***' : <ProjectCurrencyAmount amount={projectWallet?.purchasedBalance || "0"} symbolClassName="text-lg" />}
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{tOr('wallet.earned', 'Earned')}</div>
                    <div className="text-lg font-semibold text-green-500">
                      {isBalanceHidden ? '***' : <ProjectCurrencyAmount amount={projectWallet?.earnedBalance || "0"} symbolClassName="text-lg" />}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{tOr('wallet.exchangeRate', 'Exchange Rate')}</div>
                  <div className="text-lg font-bold inline-flex items-center gap-1">
                    <span>1 USD = {currencySettings.exchangeRate}</span>
                    <ProjectCurrencySymbol className="text-lg" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{tOr('wallet.commission', 'Commission')}</div>
                  <div className="text-sm font-medium">
                    {parseFloat(currencySettings.conversionCommissionRate || "0")}%
                  </div>
                </div>
                <Button
                  className="w-full min-w-0 min-h-[48px] h-auto rounded-xl px-3 py-2 font-semibold gap-2 shadow-md bg-primary hover:bg-primary/90 whitespace-normal break-words overflow-hidden"
                  size="lg"
                  onClick={() => setShowConvert(true)}
                  data-testid="button-convert-to-vxc"
                >
                  <ArrowRightLeft className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 text-center leading-tight">{convertNowLabel}</span>
                </Button>
              </div>
            </div>

            {currencyConversions && currencyConversions.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {tOr('wallet.recentConversions', 'Recent Conversions')}
                </h4>
                <div className="space-y-2">
                  {currencyConversions.slice(0, 5).map((conv) => (
                    <div key={conv.id} className="flex items-center justify-between text-sm p-3 bg-muted/50 rounded-lg" data-testid={`row-conversion-${conv.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-background">
                          <ArrowRightLeft className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">
                            <span className="inline-flex items-center gap-1">
                              <span>${parseFloat(conv.baseCurrencyAmount).toFixed(2)} →</span>
                              <ProjectCurrencyAmount amount={conv.netAmount} symbolClassName="text-sm" />
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(conv.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={conv.status === 'completed' ? 'default' : conv.status === 'pending' ? 'secondary' : 'destructive'}
                      >
                        {conv.status === 'completed' && <CheckCircle className="h-3 w-3 me-1" />}
                        {conv.status === 'pending' && <Clock className="h-3 w-3 me-1" />}
                        {conv.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('wallet.recentTransactions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTransactions ? (
            <TableSkeleton rows={3} columns={4} />
          ) : isErrorTransactions ? (
            <QueryErrorState error={errorTransactions} onRetry={() => refetchTransactions()} compact />
          ) : recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`row-transaction-${tx.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-background">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <p className="font-medium capitalize">{t(`wallet.type.${tx.type}`)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${['deposit', 'win', 'bonus', 'reward', 'refund'].includes(tx.type) ? 'text-green-500' : 'text-red-500'}`}>
                      {['deposit', 'win', 'bonus', 'reward', 'refund'].includes(tx.type) ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                    </span>
                    {getStatusBadge(tx.status)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={History} title={t('wallet.noTransactions')} />
          )}
        </CardContent>
      </Card>

      <Dialog open={showDeposit} onOpenChange={setShowDeposit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-green-500" />
              {t('wallet.deposit')}
            </DialogTitle>
            <DialogDescription>{t('wallet.depositDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('wallet.amount')}</Label>
              <Input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="mt-2"
                data-testid="input-deposit-amount"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {[10, 25, 50, 100, 250, 500].map(amount => (
                  <Button
                    key={amount}
                    variant={depositAmount === String(amount) ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setDepositAmount(String(amount))}
                  >
                    ${amount}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>{language === 'ar' ? 'عملة الإيداع' : 'Deposit Currency'}</Label>
              <Select value={depositCurrency} onValueChange={setDepositCurrency}>
                <SelectTrigger className="mt-2" data-testid="select-deposit-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(depositConfig?.allowedDepositCurrencies || ['USD']).map((currencyCode) => (
                    <SelectItem key={currencyCode} value={currencyCode}>{currencyCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {depositFxPreview ? (
                <div className="mt-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                  <div>
                    {tOr('wallet.exchangeRate', 'Exchange Rate')}: 1 USD = {depositFxPreview.usdToDepositRate.toFixed(6)} {depositCurrency}
                  </div>
                  <div className="font-medium text-foreground">
                    {depositFxPreview.parsedAmount.toFixed(2)} {depositCurrency} ≈ {depositFxPreview.estimatedCredit.toFixed(2)} {depositFxPreview.balanceCurrency}
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <Label>{t('wallet.paymentMethod')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {paymentMethods.map(method => {
                  const Icon = method.icon;
                  return (
                    <Button
                      key={method.id}
                      variant={depositPaymentMethod === method.id ? "default" : "outline"}
                      className="h-auto py-3 flex-col"
                      onClick={() => setDepositPaymentMethod(method.id)}
                      data-testid={`button-method-${method.id}`}
                    >
                      <Icon className="h-5 w-5 mb-1" />
                      <span className="text-xs">{method.name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>{language === 'ar' ? 'رقم المرجع / إيصال الدفع' : 'Payment Reference / Receipt'}</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder={language === 'ar' ? 'أدخل رقم المرجع أو رقم الإيصال' : 'Enter receipt or reference number'}
                className="mt-2"
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'رقم المحفظة / الحساب المرسل' : 'Sender Wallet / Account Number'}</Label>
              <Input
                value={walletNumber}
                onChange={(e) => setWalletNumber(e.target.value)}
                placeholder={language === 'ar' ? 'رقم المحفظة أو الحساب المرسل منه' : 'Your wallet or account number'}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeposit(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => depositMutation.mutate({
                amount: parseFloat(depositAmount),
                paymentMethod: depositPaymentMethod,
                paymentReference,
                walletNumber: walletNumber || undefined,
                currency: depositCurrency,
              })}
              disabled={!depositAmount || !depositPaymentMethod || !paymentReference || !depositCurrency || depositMutation.isPending}
              data-testid="button-confirm-deposit"
            >
              {depositMutation.isPending && <RefreshCw className="h-4 w-4 me-2 animate-spin" />}
              {t('wallet.confirmDeposit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-red-500" />
              {t('wallet.withdraw')}
            </DialogTitle>
            <DialogDescription>{t('wallet.withdrawDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">{t('wallet.availableBalance')}: </span>
              <span className="font-bold text-primary">${parseFloat(user?.balance || "0").toFixed(2)}</span>
            </div>
            <div>
              <Label>{t('wallet.amount')}</Label>
              <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="mt-2"
                data-testid="input-withdraw-amount"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {[10, 25, 50, 100].map(amount => (
                  <Button
                    key={amount}
                    variant={withdrawAmount === String(amount) ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setWithdrawAmount(String(amount))}
                  >
                    ${amount}
                  </Button>
                ))}
                <Button
                  variant={withdrawAmount === String(parseFloat(user?.balance || "0").toFixed(2)) ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setWithdrawAmount(String(parseFloat(user?.balance || "0").toFixed(2)))}
                >
                  {language === 'ar' ? 'الكل' : 'All'}
                </Button>
              </div>
            </div>
            <div>
              <Label>{t('wallet.paymentMethod')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {withdrawalPaymentMethods.map(method => {
                  const Icon = getMethodIcon(method.type);
                  return (
                    <Button
                      key={method.id}
                      variant={withdrawPaymentMethod === method.id ? "default" : "outline"}
                      className="h-auto py-3 flex-col"
                      onClick={() => setWithdrawPaymentMethod(method.id)}
                    >
                      <Icon className="h-5 w-5 mb-1" />
                      <span className="text-xs">{method.name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdraw(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => withdrawMutation.mutate({ amount: parseFloat(withdrawAmount), paymentMethodId: withdrawPaymentMethod })}
              disabled={!withdrawAmount || !withdrawPaymentMethod || withdrawMutation.isPending || parseFloat(withdrawAmount) > parseFloat(user?.balance || "0")}
              data-testid="button-confirm-withdraw"
            >
              {withdrawMutation.isPending && <RefreshCw className="h-4 w-4 me-2 animate-spin" />}
              {t('wallet.confirmWithdraw')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currencySettings?.isActive && (
        <Dialog open={showConvert} onOpenChange={setShowConvert}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                Convert to {walletCurrencyName}
              </DialogTitle>
              <DialogDescription className="space-y-1">
                <p className="inline-flex items-center gap-1">
                  <span>Convert your USD balance to</span>
                  <ProjectCurrencySymbol className="text-sm" />
                  <span>.</span>
                </p>
                <p className="inline-flex items-center gap-1">
                  <span>Rate: 1 USD = {currencySettings.exchangeRate}</span>
                  <ProjectCurrencySymbol className="text-sm" />
                </p>
                {parseFloat(currencySettings.conversionCommissionRate) > 0 && (
                  <p>(Fee: {(parseFloat(currencySettings.conversionCommissionRate) * 100).toFixed(1)}%)</p>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <span className="text-muted-foreground">Available Balance: </span>
                <span className="font-bold text-primary">${parseFloat(user?.balance || "0").toFixed(2)}</span>
              </div>
              <div>
                <Label>Amount (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={currencySettings.minConversionAmount}
                  max={currencySettings.maxConversionAmount}
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  placeholder={`Min: $${currencySettings.minConversionAmount}`}
                  className="mt-2"
                  data-testid="input-convert-amount"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Min: ${currencySettings.minConversionAmount} | Max: ${currencySettings.maxConversionAmount}
                </p>
              </div>
              {convertAmount && parseFloat(convertAmount) > 0 && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
                  <div className="flex justify-between text-sm mb-2">
                    <span>You pay:</span>
                    <span className="font-medium">${parseFloat(convertAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Gross amount:</span>
                    <ProjectCurrencyAmount
                      amount={parseFloat(convertAmount) * parseFloat(currencySettings.exchangeRate)}
                      symbolClassName="text-sm"
                    />
                  </div>
                  {parseFloat(currencySettings.conversionCommissionRate) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Fee ({(parseFloat(currencySettings.conversionCommissionRate) * 100).toFixed(1)}%):</span>
                      <span className="inline-flex items-center gap-1">
                        <span>-</span>
                        <ProjectCurrencyAmount
                          amount={parseFloat(convertAmount) * parseFloat(currencySettings.exchangeRate) * parseFloat(currencySettings.conversionCommissionRate)}
                          symbolClassName="text-sm"
                        />
                      </span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-base font-bold text-primary">
                    <span>You receive:</span>
                    <ProjectCurrencyAmount
                      amount={parseFloat(convertAmount) * parseFloat(currencySettings.exchangeRate) * (1 - parseFloat(currencySettings.conversionCommissionRate))}
                      symbolClassName="text-base"
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConvert(false)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => convertMutation.mutate({ amount: convertAmount })}
                disabled={
                  !convertAmount ||
                  parseFloat(convertAmount) <= 0 ||
                  parseFloat(convertAmount) < parseFloat(currencySettings.minConversionAmount) ||
                  parseFloat(convertAmount) > parseFloat(currencySettings.maxConversionAmount) ||
                  parseFloat(convertAmount) > parseFloat(user?.balance || "0") ||
                  convertMutation.isPending
                }
                data-testid="button-confirm-convert"
              >
                {convertMutation.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                <span className="inline-flex items-center gap-1">
                  <span>Convert to</span>
                  <ProjectCurrencySymbol className="text-sm" />
                </span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
