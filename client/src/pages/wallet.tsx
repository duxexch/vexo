import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { WithdrawDialog } from "@/components/wallet/WithdrawDialog";
import { useToast } from "@/hooks/use-toast";
import { useGuidedFocus } from "@/hooks/use-guided-focus";
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
  Loader2,
  Copy
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/skeletons";
import { QueryErrorState } from "@/components/QueryErrorState";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { ProjectCurrencyAmount, ProjectCurrencySymbol } from "@/components/ProjectCurrencySymbol";
import { useBalance } from "@/hooks/useBalance";
import { playSound } from "@/hooks/use-sound-effects";
import {
  convertUsdToWalletAmount,
  convertWalletToUsdAmount,
  formatWalletAmountFromUsd,
  formatWalletNativeAmount,
  formatLimitInLocalCurrency,
  getCurrencySymbol,
  normalizeCurrencyCode,
  type WalletCurrencyConfig,
} from "@/lib/wallet-currency";
import { PaymentMethodIcon } from "@/components/wallet/PaymentMethodIcon";
import type { Transaction, ProjectCurrencyConversion, CountryPaymentMethod } from "@shared/schema";
import {
  groupConversionPairs,
  isConversionPair,
  type TransactionListItem,
} from "@/lib/conversion-pairing";

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
  isBalanceCurrencyLocked?: boolean;
  usdRateByCurrency?: Record<string, number>;
  currencySymbolByCode?: Record<string, string>;
}

interface P2PWalletBalanceEntry {
  currency: string;
  available: string;
  frozen: string;
  reservedOutgoing: string;
  total: string;
  nextReleaseAt: string | null;
  freezeHours: number;
}

interface UserCurrencyWalletEntry {
  currency: string;
  balance: string;
  isPrimary: boolean;
  isAllowed: boolean;
}

interface UserCurrencyWalletsResponse {
  multiCurrencyEnabled: boolean;
  primaryCurrency: string;
  allowedCurrencies: string[];
  wallets: UserCurrencyWalletEntry[];
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
  const [showWalletConvert, setShowWalletConvert] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'conversions'>('all');
  const [walletConvertFrom, setWalletConvertFrom] = useState<string>("");
  const [walletConvertTo, setWalletConvertTo] = useState<string>("");
  const [walletConvertAmount, setWalletConvertAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [depositPaymentMethod, setDepositPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [walletNumber, setWalletNumber] = useState("");
  const [depositCurrency, setDepositCurrency] = useState("USD");
  const { isHidden: isBalanceHidden } = useBalance();

  const depositAmountInputRef = useRef<HTMLInputElement | null>(null);
  const depositCurrencyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const depositPaymentSectionRef = useRef<HTMLDivElement | null>(null);
  const paymentReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const walletNumberInputRef = useRef<HTMLInputElement | null>(null);
  const depositConfirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const convertAmountInputRef = useRef<HTMLInputElement | null>(null);
  const convertConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const walletConvertAmountInputRef = useRef<HTMLInputElement | null>(null);
  const walletConvertConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const { focusAndScroll, queueFocus, focusFirstInteractiveIn } = useGuidedFocus();

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

  // Conversions tab pulls more rows so paired legs (which always come as TWO
  // rows on the same conversion) are unlikely to land on opposite pages.
  const transactionPageSize = transactionFilter === 'conversions' ? 50 : 10;
  const transactionTypeParam = transactionFilter === 'conversions' ? 'currency_conversion' : null;
  const { data: txResponse, isLoading: loadingTransactions, isError: isErrorTransactions, error: errorTransactions, refetch: refetchTransactions } = useQuery<{ data: Transaction[]; total: number }>({
    queryKey: ['/api/transactions', { pageSize: transactionPageSize, type: transactionTypeParam }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: String(transactionPageSize) });
      if (transactionTypeParam) params.set('type', transactionTypeParam);
      const res = await fetch(`/api/transactions?${params.toString()}`, {
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

  const { data: depositPaymentMethods = [] } = useQuery<CountryPaymentMethod[]>({
    queryKey: ['/api/payment-methods', 'deposit'],
    queryFn: async () => {
      const res = await fetch('/api/payment-methods?purpose=deposit', {
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

  const selectedDepositMethod = useMemo(
    () => depositPaymentMethods.find((method) => method.id === depositPaymentMethod),
    [depositPaymentMethod, depositPaymentMethods],
  );

  const copyPaymentMethodValue = async (value: string, valueLabel: string) => {
    const safeValue = value.trim();
    if (!safeValue) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'لا توجد بيانات للنسخ' : 'No data to copy',
        variant: 'destructive',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(safeValue);
      toast({
        title: language === 'ar' ? 'تم النسخ' : 'Copied',
        description: language === 'ar' ? `تم نسخ ${valueLabel}` : `${valueLabel} copied`,
      });
    } catch {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'تعذر النسخ، حاول مرة أخرى' : 'Copy failed, please try again',
        variant: 'destructive',
      });
    }
  };

  const hasWithdrawalMethods = withdrawalPaymentMethods.length > 0;

  const walletCurrencyConfig: WalletCurrencyConfig = useMemo(() => ({
    balanceCurrency: depositConfig?.balanceCurrency || normalizeCurrencyCode(user?.balanceCurrency as string | undefined),
    usdRateByCurrency: depositConfig?.usdRateByCurrency,
    currencySymbolByCode: depositConfig?.currencySymbolByCode,
  }), [depositConfig?.balanceCurrency, depositConfig?.currencySymbolByCode, depositConfig?.usdRateByCurrency, user?.balanceCurrency]);

  const walletCurrencyCode = normalizeCurrencyCode(walletCurrencyConfig.balanceCurrency);
  const walletCurrencySymbol = getCurrencySymbol(walletCurrencyCode, walletCurrencyConfig.currencySymbolByCode);
  const availableWalletBalance = convertUsdToWalletAmount(user?.balance || "0", walletCurrencyConfig).amount;

  const formatWalletAmount = (rawUsdAmount: string | number): string => {
    return formatWalletAmountFromUsd(rawUsdAmount, walletCurrencyConfig, { withCode: true });
  };

  useEffect(() => {
    if (!depositConfig) return;

    setDepositCurrency((currentCurrency) => {
      if (depositConfig.allowedDepositCurrencies.includes(currentCurrency)) {
        return currentCurrency;
      }

      return depositConfig.defaultDepositCurrency || depositConfig.allowedDepositCurrencies[0] || 'USD';
    });
  }, [depositConfig]);

  useEffect(() => {
    if (!showDeposit) return;
    queueFocus(depositAmountInputRef.current);
  }, [showDeposit]);

  useEffect(() => {
    if (!showConvert) return;
    queueFocus(convertAmountInputRef.current);
  }, [showConvert]);

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

    const depositToUsdAmount = parsedAmount / usdToDepositRate;
    if (!Number.isFinite(depositToUsdAmount) || depositToUsdAmount <= 0) {
      return null;
    }

    const walletConversion = convertUsdToWalletAmount(depositToUsdAmount, walletCurrencyConfig);
    if (!Number.isFinite(walletConversion.amount) || walletConversion.amount <= 0) {
      return null;
    }

    return {
      usdToDepositRate,
      estimatedCredit: walletConversion.amount,
      balanceCurrency: walletCurrencyCode,
      balanceCurrencySymbol: walletConversion.symbol,
      parsedAmount,
    };
  }, [depositConfig?.usdRateByCurrency, depositAmount, depositCurrency, walletCurrencyCode, walletCurrencyConfig]);

  const { data: currencySettings } = useQuery<ProjectCurrencySettings>({
    queryKey: ['/api/project-currency/settings'],
    retry: false,
  });

  const { data: projectWallet, isLoading: walletLoading } = useQuery<ProjectCurrencyWallet>({
    queryKey: ['/api/project-currency/wallet'],
    enabled: !!currencySettings?.isActive,
    ...financialQueryOptions,
  });

  const { data: p2pWalletBalances = [] } = useQuery<P2PWalletBalanceEntry[]>({
    queryKey: ['/api/p2p/wallet-balances'],
    ...financialQueryOptions,
  });

  const { data: currencyWalletsData } = useQuery<UserCurrencyWalletsResponse>({
    queryKey: ['/api/wallet/currency-wallets'],
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

  const projectRatePerWalletCurrency = useMemo(() => {
    const projectRatePerUsd = Number(currencySettings?.exchangeRate || 0);
    if (!Number.isFinite(projectRatePerUsd) || projectRatePerUsd <= 0) {
      return 0;
    }

    const usdToWalletRate = Number(walletCurrencyConfig.usdRateByCurrency?.[walletCurrencyCode]);
    if (!Number.isFinite(usdToWalletRate) || usdToWalletRate <= 0) {
      return projectRatePerUsd;
    }

    return projectRatePerUsd / usdToWalletRate;
  }, [currencySettings?.exchangeRate, walletCurrencyCode, walletCurrencyConfig.usdRateByCurrency]);

  const convertMinWalletAmount = useMemo(() => {
    if (!currencySettings?.minConversionAmount) {
      return 0;
    }

    return convertUsdToWalletAmount(currencySettings.minConversionAmount, walletCurrencyConfig).amount;
  }, [currencySettings?.minConversionAmount, walletCurrencyConfig]);

  const convertMaxWalletAmount = useMemo(() => {
    if (!currencySettings?.maxConversionAmount) {
      return 0;
    }

    return convertUsdToWalletAmount(currencySettings.maxConversionAmount, walletCurrencyConfig).amount;
  }, [currencySettings?.maxConversionAmount, walletCurrencyConfig]);

  interface WalletConvertSettings {
    enabled: boolean;
    feePct: number;
    userDisabled: boolean;
    multiCurrencyEnabled: boolean;
    primaryCurrency: string;
    eligibleCurrencies: string[];
    missingRateCurrencies: string[];
    usdRateByCurrency: Record<string, number>;
    currencySymbolByCode: Record<string, string>;
    balances: Record<string, string>;
  }

  interface WalletConvertQuoteResponse {
    fromCurrency: string;
    toCurrency: string;
    fromAmount: number;
    amountUsd: number;
    grossToAmount: number;
    feePct: number;
    feeAmount: number;
    netToAmount: number;
    fromToUsdRate: number;
    usdToTargetRate: number;
  }

  const { data: walletConvertSettings } = useQuery<WalletConvertSettings>({
    queryKey: ['/api/wallet/convert/settings'],
    ...financialQueryOptions,
  });

  const walletConvertEnabled = Boolean(
    walletConvertSettings?.enabled &&
    !walletConvertSettings.userDisabled &&
    walletConvertSettings.multiCurrencyEnabled &&
    walletConvertSettings.eligibleCurrencies.length >= 2,
  );

  const walletConvertParsedAmount = useMemo(() => {
    const value = Number.parseFloat(walletConvertAmount);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [walletConvertAmount]);

  const walletConvertSourceBalance = useMemo(() => {
    if (!walletConvertSettings || !walletConvertFrom) return 0;
    const raw = walletConvertSettings.balances[walletConvertFrom];
    return raw ? Number.parseFloat(raw) : 0;
  }, [walletConvertSettings, walletConvertFrom]);

  const { data: walletConvertQuote, isFetching: walletConvertQuoteLoading } = useQuery<WalletConvertQuoteResponse>({
    queryKey: ['/api/wallet/convert/quote', walletConvertFrom, walletConvertTo, walletConvertParsedAmount],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: walletConvertFrom,
        to: walletConvertTo,
        amount: String(walletConvertParsedAmount),
      });
      const res = await fetch(`/api/wallet/convert/quote?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Quote failed');
      }
      return res.json();
    },
    enabled: walletConvertEnabled
      && Boolean(walletConvertFrom && walletConvertTo)
      && walletConvertFrom !== walletConvertTo
      && walletConvertParsedAmount > 0,
    retry: false,
    staleTime: 5_000,
  });

  const walletConvertMutation = useMutation({
    mutationFn: (data: { fromCurrency: string; toCurrency: string; amount: number }) =>
      apiRequestWithPaymentToken('POST', '/api/wallet/convert', data, 'convert'),
    onSuccess: async () => {
      playSound('coin');
      toast({
        title: t('common.success'),
        description: language === 'ar' ? 'تم تحويل المحفظة بنجاح' : 'Wallet conversion completed',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/currency-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/convert/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      refreshUser?.();
      setShowWalletConvert(false);
      setWalletConvertAmount("");
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (!walletConvertSettings?.eligibleCurrencies?.length) return;
    setWalletConvertFrom((current) => {
      if (current && walletConvertSettings.eligibleCurrencies.includes(current)) return current;
      return walletConvertSettings.primaryCurrency
        && walletConvertSettings.eligibleCurrencies.includes(walletConvertSettings.primaryCurrency)
        ? walletConvertSettings.primaryCurrency
        : walletConvertSettings.eligibleCurrencies[0];
    });
    setWalletConvertTo((current) => {
      if (current && walletConvertSettings.eligibleCurrencies.includes(current)) return current;
      const firstOther = walletConvertSettings.eligibleCurrencies.find((c) => c !== walletConvertSettings.primaryCurrency);
      return firstOther || walletConvertSettings.eligibleCurrencies[1] || '';
    });
  }, [walletConvertSettings?.eligibleCurrencies, walletConvertSettings?.primaryCurrency]);

  useEffect(() => {
    if (!showWalletConvert) return;
    queueFocus(walletConvertAmountInputRef.current);
  }, [showWalletConvert]);

  const handleWalletConvertSubmit = () => {
    if (!walletConvertEnabled) return;
    if (!walletConvertFrom || !walletConvertTo || walletConvertFrom === walletConvertTo) return;
    if (walletConvertParsedAmount <= 0) {
      focusAndScroll(walletConvertAmountInputRef.current);
      return;
    }
    if (walletConvertParsedAmount > walletConvertSourceBalance) {
      focusAndScroll(walletConvertAmountInputRef.current);
      return;
    }
    walletConvertMutation.mutate({
      fromCurrency: walletConvertFrom,
      toCurrency: walletConvertTo,
      amount: walletConvertParsedAmount,
    });
  };

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
    mutationFn: (data: { amount: number; paymentMethodId: string; receiverMethodNumber: string; currency?: string }) =>
      apiRequestWithPaymentToken('POST', '/api/transactions/withdraw', data, 'withdraw'),
    onSuccess: () => {
      playSound('success');
      toast({ title: t('common.success'), description: t('wallet.withdrawSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/currency-wallets'] });
      refreshUser?.();
      setShowWithdraw(false);
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const handleDepositSubmit = () => {
    const parsedAmount = parseFloat(depositAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      focusAndScroll(depositAmountInputRef.current);
      return;
    }

    if (!depositCurrency) {
      focusAndScroll(depositCurrencyTriggerRef.current);
      return;
    }

    if (!selectedDepositMethod) {
      focusFirstInteractiveIn(depositPaymentSectionRef.current);
      return;
    }

    const minLimit = formatLimitInLocalCurrency(
      selectedDepositMethod.minAmount,
      depositCurrency,
      depositConfig?.usdRateByCurrency,
      depositConfig?.currencySymbolByCode,
    );
    const maxLimit = formatLimitInLocalCurrency(
      selectedDepositMethod.maxAmount,
      depositCurrency,
      depositConfig?.usdRateByCurrency,
      depositConfig?.currencySymbolByCode,
    );
    if (minLimit && parsedAmount < minLimit.localAmount) {
      toast({
        title: t('common.error'),
        description: t('wallet.belowMin')
          .replace('{{local}}', minLimit.local)
          .replace('{{usd}}', minLimit.usd)
          .replace('{{currency}}', depositCurrency),
        variant: 'destructive',
      });
      focusAndScroll(depositAmountInputRef.current);
      return;
    }
    if (maxLimit && parsedAmount > maxLimit.localAmount) {
      toast({
        title: t('common.error'),
        description: t('wallet.aboveMax')
          .replace('{{local}}', maxLimit.local)
          .replace('{{usd}}', maxLimit.usd)
          .replace('{{currency}}', depositCurrency),
        variant: 'destructive',
      });
      focusAndScroll(depositAmountInputRef.current);
      return;
    }

    if (!paymentReference.trim()) {
      focusAndScroll(paymentReferenceInputRef.current);
      return;
    }

    depositMutation.mutate({
      amount: parsedAmount,
      paymentMethod: `${selectedDepositMethod.name} | ${selectedDepositMethod.methodNumber}`,
      paymentReference: paymentReference.trim(),
      walletNumber: walletNumber.trim() || undefined,
      currency: depositCurrency,
    });
  };

  const handleConvertSubmit = () => {
    const parsedAmount = parseFloat(convertAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      focusAndScroll(convertAmountInputRef.current);
      return;
    }

    if (parsedAmount < convertMinWalletAmount || parsedAmount > convertMaxWalletAmount || parsedAmount > availableWalletBalance) {
      focusAndScroll(convertAmountInputRef.current);
      return;
    }

    convertMutation.mutate({ amount: convertAmount });
  };

  const recentTransactions = Array.isArray(transactions) ? transactions : [];

  // Group paired `currency_conversion` legs together so a single conversion
  // shows as ONE card displaying source amount, destination amount, fee and
  // effective rate. Pairs are detected primarily via mutual `referenceId`
  // (executeWalletConversion writes both legs to point at each other), with a
  // fallback to "same description" so reversal pairs (whose `referenceId`
  // points at the original legs, not at each other) also collapse correctly.
  const transactionListItems = useMemo<TransactionListItem[]>(
    () => groupConversionPairs(recentTransactions),
    [recentTransactions],
  );

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownToLine className="h-4 w-4 text-green-500" />;
      case 'withdrawal': return <ArrowUpFromLine className="h-4 w-4 text-red-500" />;
      case 'stake': return <TrendingDown className="h-4 w-4 text-orange-500" />;
      case 'win': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'bonus': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'reward': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'refund': return <ArrowDownToLine className="h-4 w-4 text-green-500" />;
      case 'currency_conversion': return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
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
    <div className="min-h-[100svh] space-y-4 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_42%)] p-3 sm:space-y-6 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h1 className="font-display tracking-wider text-2xl sm:text-3xl leading-none flex items-center gap-2">
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
              <span className="font-medium text-green-500">{formatWalletAmount(user?.totalDeposited || "0")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalWithdrawn')}</span>
              <span className="font-medium text-red-500">{formatWalletAmount(user?.totalWithdrawn || "0")}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalWagered')}</span>
              <span className="font-medium">{formatWalletAmount(user?.totalWagered || "0")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('wallet.totalWon')}</span>
              <span className="font-medium text-primary">{formatWalletAmount(user?.totalWon || "0")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {currencyWalletsData?.multiCurrencyEnabled && currencyWalletsData.wallets.length > 0 && (
        <Card className="border border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  {language === 'ar' ? 'محافظ العملات الخاصة بك' : 'Your Currency Wallets'}
                </CardTitle>
                <CardDescription className="text-xs">
                  {language === 'ar'
                    ? 'الإيداعات والسحوبات تخصّص لكل عملة على حدة'
                    : 'Deposits and withdrawals are routed per-currency'}
                </CardDescription>
              </div>
              {walletConvertEnabled && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowWalletConvert(true)}
                  className="shrink-0 min-h-[36px] gap-1.5"
                  data-testid="button-wallet-convert"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {language === 'ar' ? 'تحويل بين المحافظ' : 'Convert'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {currencyWalletsData.wallets.map((w) => {
                const meta = depositConfig?.currencySymbolByCode?.[w.currency];
                const symbol = meta || getCurrencySymbol(w.currency, depositConfig?.currencySymbolByCode);
                return (
                  <div
                    key={w.currency}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${w.isPrimary ? 'bg-primary/10 border-primary/40' : 'bg-muted/40'}`}
                    data-testid={`row-user-wallet-${w.currency}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm font-semibold">{w.currency}</span>
                      {w.isPrimary && (
                        <span className="text-[10px] uppercase tracking-wide bg-primary text-primary-foreground rounded px-1.5 py-0.5">
                          {language === 'ar' ? 'أساسية' : 'Primary'}
                        </span>
                      )}
                    </div>
                    <div className="text-end font-bold" data-testid={`text-user-balance-${w.currency}`}>
                      {symbol}{Number.parseFloat(w.balance).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {p2pWalletBalances.length > 0 && (
        <Card className="border border-slate-300/60 bg-gradient-to-b from-slate-50 to-white dark:border-slate-800 dark:from-slate-900/70 dark:to-slate-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              {tOr('wallet.p2pBalancesTitle', 'P2P Asset Balances')}
            </CardTitle>
            <CardDescription>
              {tOr('wallet.p2pBalancesDesc', 'Available, frozen, and reserved balances by currency')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {p2pWalletBalances.map((entry) => {
                const available = Number(entry.available || 0);
                const frozen = Number(entry.frozen || 0);
                const reservedOutgoing = Number(entry.reservedOutgoing || 0);
                const total = Number(entry.total || 0);

                return (
                  <div key={entry.currency} className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/60" data-testid={`row-p2p-wallet-${entry.currency}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{entry.currency}</h4>
                      <Badge variant="outline" className="text-xs">{total.toFixed(8)}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <div className="rounded-md bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                        <p className="text-[11px] opacity-80">{t('wallet.availableBalance')}</p>
                        <p className="mt-1 font-semibold">{available.toFixed(8)}</p>
                      </div>
                      <div className="rounded-md bg-amber-50 p-2 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        <p className="text-[11px] opacity-80">{tOr('wallet.frozenBalance', 'Frozen')}</p>
                        <p className="mt-1 font-semibold">{frozen.toFixed(8)}</p>
                        {entry.nextReleaseAt && (
                          <p className="mt-1 text-[10px] opacity-70">
                            {tOr('wallet.nextReleaseAt', 'Next release')}: {new Date(entry.nextReleaseAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
                          </p>
                        )}
                      </div>
                      <div className="rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <p className="text-[11px] opacity-80">{tOr('wallet.reservedOutgoing', 'Reserved for open sells')}</p>
                        <p className="mt-1 font-semibold">{reservedOutgoing.toFixed(8)}</p>
                      </div>
                    </div>
                    {frozen > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {tOr('wallet.freezeWindow', 'Freeze window')}: {entry.freezeHours}h
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                    <span>1 {walletCurrencyCode} = {projectRatePerWalletCurrency.toFixed(4)}</span>
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
                    <div key={conv.id} className="text-sm p-3 bg-muted/50 rounded-lg" data-testid={`row-conversion-${conv.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-background">
                          <ArrowRightLeft className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">
                            <span className="inline-flex items-center gap-1">
                              <span>{formatWalletAmount(conv.baseCurrencyAmount)} →</span>
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
                        className="mt-3 sm:mt-0"
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
          <Tabs
            value={transactionFilter}
            onValueChange={(v) => setTransactionFilter(v === 'conversions' ? 'conversions' : 'all')}
            className="mb-4"
          >
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
              <TabsTrigger value="all" data-testid="tab-transactions-all">{t('wallet.tx.allTab')}</TabsTrigger>
              <TabsTrigger value="conversions" data-testid="tab-transactions-conversions">{t('wallet.tx.conversionsTab')}</TabsTrigger>
            </TabsList>
          </Tabs>
          {loadingTransactions ? (
            <TableSkeleton rows={3} columns={4} />
          ) : isErrorTransactions ? (
            <QueryErrorState error={errorTransactions} onRetry={() => refetchTransactions()} compact />
          ) : transactionListItems.length > 0 ? (
            <div className="space-y-3">
              {transactionListItems.map((item) => {
                if (isConversionPair(item)) {
                  const debitCurrency = item.debit.walletCurrencyCode || '';
                  const creditCurrency = item.credit.walletCurrencyCode || '';
                  const debitAmount = Number.parseFloat(item.debit.amount);
                  const creditAmount = Number.parseFloat(item.credit.amount);
                  const dateLabel = new Date(item.debit.createdAt).toLocaleDateString(
                    language === 'ar' ? 'ar-SA' : 'en-US',
                    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                  );
                  return (
                    <div
                      key={item.pairKey}
                      className="rounded-lg bg-muted/50 p-3"
                      data-testid={`row-conversion-pair-${item.pairKey}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-background">
                            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {item.isReversal
                                ? t('wallet.tx.conversionReversal')
                                : t('wallet.type.currency_conversion')}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-conversion-date-${item.pairKey}`}>
                              {dateLabel}
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(item.debit.status)}
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">{t('wallet.tx.from')}</div>
                          <div
                            className="font-semibold text-red-500"
                            data-testid={`text-conversion-from-${item.pairKey}`}
                          >
                            -{debitAmount.toFixed(2)} {debitCurrency}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{t('wallet.tx.to')}</div>
                          <div
                            className="font-semibold text-green-500"
                            data-testid={`text-conversion-to-${item.pairKey}`}
                          >
                            +{creditAmount.toFixed(2)} {creditCurrency}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground border-t border-border/40 pt-2">
                        <div data-testid={`text-conversion-rate-${item.pairKey}`}>
                          <span>{t('wallet.tx.effectiveRate')}: </span>
                          <span className="font-mono text-foreground/80">
                            1 {debitCurrency} = {item.effectiveRate.toFixed(6)} {creditCurrency}
                          </span>
                        </div>
                        <div data-testid={`text-conversion-fee-${item.pairKey}`}>
                          <span>{t('wallet.tx.fee')}: </span>
                          {item.feeAmount !== null && item.feePct !== null ? (
                            item.feeAmount === 0 && item.feePct === 0 ? (
                              <span className="font-mono text-foreground/80">{t('wallet.tx.noFee')}</span>
                            ) : (
                              <span className="font-mono text-foreground/80">
                                {item.feeAmount.toFixed(2)} {creditCurrency} ({item.feePct.toFixed(2)}%)
                              </span>
                            )
                          ) : (
                            <span>{t('wallet.tx.feeUnknown')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                const tx = item;
                return (
                  <div key={tx.id} className="rounded-lg bg-muted/50 p-3" data-testid={`row-transaction-${tx.id}`}>
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
                    <div className="mt-3 flex items-center justify-between gap-3 sm:mt-0 sm:justify-end">
                      <span className={`font-bold ${['deposit', 'win', 'bonus', 'reward', 'refund'].includes(tx.type) ? 'text-green-500' : 'text-red-500'}`}>
                        {['deposit', 'win', 'bonus', 'reward', 'refund'].includes(tx.type) ? '+' : '-'}{formatWalletAmount(tx.amount)}
                      </span>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={History}
              title={transactionFilter === 'conversions' ? t('wallet.tx.noConversions') : t('wallet.noTransactions')}
            />
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
          <div className="space-y-4 pb-1">
            <div>
              <Label>{t('wallet.amountInCurrency').replace('{{currency}}', depositCurrency || 'USD')}</Label>
              <MoneyInput
                ref={depositAmountInputRef}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  queueFocus(depositCurrencyTriggerRef.current);
                }}
                placeholder={t('wallet.amountPlaceholder').replace('{{example}}', `100.00 ${depositCurrency || 'USD'}`)}
                enterKeyHint="next"
                className="mt-2"
                data-testid="input-deposit-amount"
              />
              {selectedDepositMethod && (() => {
                const minLimit = formatLimitInLocalCurrency(
                  selectedDepositMethod.minAmount,
                  depositCurrency,
                  depositConfig?.usdRateByCurrency,
                  depositConfig?.currencySymbolByCode,
                );
                const maxLimit = formatLimitInLocalCurrency(
                  selectedDepositMethod.maxAmount,
                  depositCurrency,
                  depositConfig?.usdRateByCurrency,
                  depositConfig?.currencySymbolByCode,
                );
                if (!minLimit && !maxLimit) return null;
                return (
                  <p className="mt-1 text-xs text-muted-foreground" data-testid="text-deposit-limits">
                    {minLimit && (
                      <span title={minLimit.usd}>
                        {t('wallet.minLimit')
                          .replace('{{local}}', minLimit.local)
                          .replace('{{usd}}', minLimit.usd)}
                      </span>
                    )}
                    {minLimit && maxLimit && <span className="mx-2">·</span>}
                    {maxLimit && (
                      <span title={maxLimit.usd}>
                        {t('wallet.maxLimit')
                          .replace('{{local}}', maxLimit.local)
                          .replace('{{usd}}', maxLimit.usd)}
                      </span>
                    )}
                  </p>
                );
              })()}
              <div className="flex gap-2 mt-2 flex-wrap">
                {[10, 25, 50, 100, 250, 500].map(amount => (
                  <Button
                    key={amount}
                    variant={depositAmount === String(amount) ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setDepositAmount(String(amount))}
                  >
                    {formatWalletNativeAmount(amount, depositCurrency, depositConfig?.currencySymbolByCode, { withCode: true })}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>{language === 'ar' ? 'عملة الإيداع' : 'Deposit Currency'}</Label>
              <Select value={depositCurrency} onValueChange={setDepositCurrency} disabled={Boolean(depositConfig?.isBalanceCurrencyLocked)}>
                <SelectTrigger
                  ref={depositCurrencyTriggerRef}
                  className="mt-2"
                  data-testid="select-deposit-currency"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(depositConfig?.allowedDepositCurrencies || ['USD']).map((currencyCode) => (
                    <SelectItem key={currencyCode} value={currencyCode}>{currencyCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {depositConfig?.isBalanceCurrencyLocked ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {tOr('wallet.lockedCurrencyNotice', `Wallet currency is locked to ${walletCurrencyCode}.`)}
                </p>
              ) : null}
              {depositFxPreview ? (
                <div className="mt-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                  <div>
                    {tOr('wallet.exchangeRate', 'Exchange Rate')}: 1 USD = {depositFxPreview.usdToDepositRate.toFixed(6)} {depositCurrency}
                  </div>
                  <div className="font-medium text-foreground">
                    {depositFxPreview.parsedAmount.toFixed(2)} {depositCurrency} ≈ {depositFxPreview.balanceCurrencySymbol}{depositFxPreview.estimatedCredit.toFixed(2)} {depositFxPreview.balanceCurrency}
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <Label>{t('wallet.paymentMethod')}</Label>
              <div ref={depositPaymentSectionRef} className="grid grid-cols-2 gap-2 mt-2">
                {depositPaymentMethods.map(method => (
                  <Button
                    key={method.id}
                    variant={depositPaymentMethod === method.id ? "default" : "outline"}
                    className="h-auto py-3 flex-col"
                    onClick={() => {
                      setDepositPaymentMethod(method.id);
                      queueFocus(paymentReferenceInputRef.current);
                    }}
                    data-testid={`button-method-${method.id}`}
                  >
                    <PaymentMethodIcon
                      iconUrl={method.iconUrl}
                      type={method.type}
                      alt={method.name}
                      className="h-7 w-7 mb-1"
                    />
                    <span className="text-xs font-medium max-w-full truncate" title={method.name}>{method.name}</span>
                    <span className="text-[10px] opacity-90 max-w-full truncate" title={method.methodNumber || ""}>{method.methodNumber || "-"}</span>
                  </Button>
                ))}
              </div>

              {selectedDepositMethod && (
                <div className="mt-3 rounded-lg border bg-muted/30 p-2 space-y-1.5" data-testid="deposit-method-details">
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <PaymentMethodIcon
                      iconUrl={selectedDepositMethod.iconUrl}
                      type={selectedDepositMethod.type}
                      alt={selectedDepositMethod.name}
                      className="h-7 w-7"
                    />
                    <span className="text-sm font-semibold truncate" title={selectedDepositMethod.name}>
                      {selectedDepositMethod.name}
                    </span>
                  </div>

                  <div className="rounded-md bg-background/70 border border-border/50 p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      {language === 'ar' ? 'اسم الوسيلة' : 'Method Name'}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate min-w-0 flex-1" title={selectedDepositMethod.name}>
                        {selectedDepositMethod.name}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => copyPaymentMethodValue(selectedDepositMethod.name, language === 'ar' ? 'اسم الوسيلة' : 'method name')}
                        data-testid="button-copy-method-name"
                      >
                        <Copy className="h-3.5 w-3.5 me-1" />
                        {language === 'ar' ? 'نسخ' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/60 border border-border/50 p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      {language === 'ar' ? 'رقم الوسيلة' : 'Method Number'}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm font-mono font-medium truncate min-w-0 flex-1 select-all"
                        title={selectedDepositMethod.methodNumber || ''}
                      >
                        {selectedDepositMethod.methodNumber || '-'}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => copyPaymentMethodValue(selectedDepositMethod.methodNumber || '', language === 'ar' ? 'رقم الوسيلة' : 'method number')}
                        data-testid="button-copy-method-number"
                      >
                        <Copy className="h-3.5 w-3.5 me-1" />
                        {language === 'ar' ? 'نسخ' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md bg-background/70 border border-border/50 p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      {language === 'ar' ? 'البيانات كاملة' : 'Full Payment Data'}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs text-muted-foreground truncate min-w-0 flex-1"
                        title={`${selectedDepositMethod.name} | ${selectedDepositMethod.methodNumber || ''}`}
                      >
                        {selectedDepositMethod.name} | {selectedDepositMethod.methodNumber || '-'}
                      </span>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => copyPaymentMethodValue(`${selectedDepositMethod.name} | ${selectedDepositMethod.methodNumber || ''}`, language === 'ar' ? 'البيانات كاملة' : 'full payment data')}
                        data-testid="button-copy-full-payment"
                      >
                        <Copy className="h-3.5 w-3.5 me-1" />
                        {language === 'ar' ? 'نسخ الكل' : 'Copy All'}
                      </Button>
                    </div>
                  </div>

                  {selectedDepositMethod.instructions?.trim() ? (
                    <div className="rounded-md bg-muted/60 border border-border/50 p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {language === 'ar' ? 'إرشادات التحويل' : 'Transfer Instructions'}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => copyPaymentMethodValue(selectedDepositMethod.instructions || '', language === 'ar' ? 'الإرشادات' : 'instructions')}
                          data-testid="button-copy-instructions"
                        >
                          <Copy className="h-3.5 w-3.5 me-1" />
                          {language === 'ar' ? 'نسخ' : 'Copy'}
                        </Button>
                      </div>
                      <p className="text-xs whitespace-pre-wrap break-words line-clamp-3" title={selectedDepositMethod.instructions || ''}>
                        {selectedDepositMethod.instructions}
                      </p>
                    </div>
                  ) : (
                    <p className="px-1 text-xs text-muted-foreground">
                      {language === 'ar' ? 'لا توجد إرشادات إضافية لهذه الوسيلة.' : 'No additional instructions for this method.'}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label>{language === 'ar' ? 'رقم المرجع / إيصال الدفع' : 'Payment Reference / Receipt'}</Label>
              <Input
                ref={paymentReferenceInputRef}
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                onFocus={(e) => {
                  const target = e.currentTarget;
                  window.setTimeout(() => {
                    try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
                  }, 250);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (!walletNumber.trim()) {
                    queueFocus(depositConfirmButtonRef.current);
                    return;
                  }
                  queueFocus(walletNumberInputRef.current);
                }}
                placeholder={language === 'ar' ? 'أدخل رقم المرجع أو رقم الإيصال' : 'Enter receipt or reference number'}
                enterKeyHint={walletNumber.trim() ? 'next' : 'done'}
                className="mt-2"
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'رقم المحفظة / الحساب المرسل' : 'Sender Wallet / Account Number'}</Label>
              <Input
                ref={walletNumberInputRef}
                value={walletNumber}
                onChange={(e) => setWalletNumber(e.target.value)}
                onFocus={(e) => {
                  const target = e.currentTarget;
                  window.setTimeout(() => {
                    try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
                  }, 250);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  queueFocus(depositConfirmButtonRef.current);
                }}
                placeholder={language === 'ar' ? 'رقم المحفظة أو الحساب المرسل منه' : 'Your wallet or account number'}
                enterKeyHint="done"
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-10 px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 pt-3 border-t bg-background shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.35)]">
            <Button className="w-full sm:w-auto min-h-11" variant="outline" onClick={() => setShowDeposit(false)}>{t('common.cancel')}</Button>
            <Button
              ref={depositConfirmButtonRef}
              className="w-full sm:w-auto min-h-11"
              onClick={handleDepositSubmit}
              disabled={!depositAmount || !depositPaymentMethod || !paymentReference || !depositCurrency || depositMutation.isPending}
              data-testid="button-confirm-deposit"
            >
              {depositMutation.isPending && <RefreshCw className="h-4 w-4 me-2 animate-spin" />}
              {t('wallet.confirmDeposit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WithdrawDialog
        open={showWithdraw}
        onOpenChange={setShowWithdraw}
        multiCurrencyEnabled={!!currencyWalletsData?.multiCurrencyEnabled}
        wallets={currencyWalletsData?.wallets ?? []}
        defaultCurrency={walletCurrencyCode}
        fallbackBalance={availableWalletBalance}
        currencySymbolByCode={depositConfig?.currencySymbolByCode}
        usdRateByCurrency={depositConfig?.usdRateByCurrency}
        paymentMethods={withdrawalPaymentMethods}
        onSubmit={(payload) => withdrawMutation.mutate(payload)}
        isSubmitting={withdrawMutation.isPending}
      />

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
                  <span>Convert your {walletCurrencyCode} balance to</span>
                  <ProjectCurrencySymbol className="text-sm" />
                  <span>.</span>
                </p>
                <p className="inline-flex items-center gap-1">
                  <span>Rate: 1 {walletCurrencyCode} = {projectRatePerWalletCurrency.toFixed(4)}</span>
                  <ProjectCurrencySymbol className="text-sm" />
                </p>
                {parseFloat(currencySettings.conversionCommissionRate) > 0 && (
                  <p>(Fee: {(parseFloat(currencySettings.conversionCommissionRate) * 100).toFixed(1)}%)</p>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pb-1">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <span className="text-muted-foreground">Available Balance: </span>
                <span className="font-bold text-primary">{walletCurrencySymbol}{availableWalletBalance.toFixed(2)} {walletCurrencyCode}</span>
              </div>
              <div>
                <Label>Amount ({walletCurrencyCode})</Label>
                <MoneyInput
                  ref={convertAmountInputRef}
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    queueFocus(convertConfirmButtonRef.current);
                  }}
                  placeholder={`Min: ${walletCurrencySymbol}${convertMinWalletAmount.toFixed(2)} ${walletCurrencyCode}`}
                  enterKeyHint="done"
                  className="mt-2"
                  data-testid="input-convert-amount"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Min: {walletCurrencySymbol}{convertMinWalletAmount.toFixed(2)} {walletCurrencyCode} | Max: {walletCurrencySymbol}{convertMaxWalletAmount.toFixed(2)} {walletCurrencyCode}
                </p>
              </div>
              {convertAmount && parseFloat(convertAmount) > 0 && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
                  <div className="flex justify-between text-sm mb-2">
                    <span>You pay:</span>
                    <span className="font-medium">{walletCurrencySymbol}{parseFloat(convertAmount).toFixed(2)} {walletCurrencyCode}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Gross amount:</span>
                    <ProjectCurrencyAmount
                      amount={convertWalletToUsdAmount(convertAmount, walletCurrencyConfig) * parseFloat(currencySettings.exchangeRate)}
                      symbolClassName="text-sm"
                    />
                  </div>
                  {parseFloat(currencySettings.conversionCommissionRate) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Fee ({(parseFloat(currencySettings.conversionCommissionRate) * 100).toFixed(1)}%):</span>
                      <span className="inline-flex items-center gap-1">
                        <span>-</span>
                        <ProjectCurrencyAmount
                          amount={convertWalletToUsdAmount(convertAmount, walletCurrencyConfig) * parseFloat(currencySettings.exchangeRate) * parseFloat(currencySettings.conversionCommissionRate)}
                          symbolClassName="text-sm"
                        />
                      </span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-base font-bold text-primary">
                    <span>You receive:</span>
                    <ProjectCurrencyAmount
                      amount={convertWalletToUsdAmount(convertAmount, walletCurrencyConfig) * parseFloat(currencySettings.exchangeRate) * (1 - parseFloat(currencySettings.conversionCommissionRate))}
                      symbolClassName="text-base"
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="sticky bottom-0 z-10 px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 pt-3 border-t bg-background">
              <Button className="w-full sm:w-auto min-h-11" variant="outline" onClick={() => setShowConvert(false)}>{t('common.cancel')}</Button>
              <Button
                ref={convertConfirmButtonRef}
                className="w-full sm:w-auto min-h-11"
                onClick={handleConvertSubmit}
                disabled={
                  !convertAmount ||
                  parseFloat(convertAmount) <= 0 ||
                  parseFloat(convertAmount) < convertMinWalletAmount ||
                  parseFloat(convertAmount) > convertMaxWalletAmount ||
                  parseFloat(convertAmount) > availableWalletBalance ||
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

      <Dialog open={showWalletConvert} onOpenChange={setShowWalletConvert}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              {language === 'ar' ? 'تحويل بين المحافظ' : 'Convert Between Wallets'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? 'حوّل رصيدك من عملة إلى أخرى داخل محافظك. السعر مبني على أسعار الصرف الحالية.'
                : 'Move balance between your own currency wallets. Rate is based on current exchange rates.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pb-1">
            {!walletConvertEnabled ? (
              <div className="p-3 rounded-md border bg-muted text-sm text-muted-foreground">
                {walletConvertSettings && !walletConvertSettings.enabled
                  ? (language === 'ar' ? 'التحويل بين المحافظ معطّل حالياً.' : 'Wallet conversion is currently disabled.')
                  : walletConvertSettings?.userDisabled
                    ? (language === 'ar' ? 'تم تعطيل ميزة التحويل بين المحافظ لحسابك.' : 'Wallet conversion is disabled on your account.')
                    : (language === 'ar' ? 'تحتاج إلى محفظتين على الأقل بأسعار صرف صالحة.' : 'You need at least two wallets with valid exchange rates.')}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'من' : 'From'}</Label>
                    <Select
                      value={walletConvertFrom}
                      onValueChange={(v) => {
                        setWalletConvertFrom(v);
                        setWalletConvertAmount("");
                        if (walletConvertTo === v) {
                          const next = walletConvertSettings?.eligibleCurrencies.find((c) => c !== v) || "";
                          setWalletConvertTo(next);
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-wallet-convert-from">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {walletConvertSettings?.eligibleCurrencies.map((c) => {
                          const bal = Number.parseFloat(walletConvertSettings.balances[c] || '0');
                          return (
                            <SelectItem key={c} value={c}>
                              {c} — {bal.toFixed(2)}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="hidden sm:flex items-center justify-center pb-2">
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'إلى' : 'To'}</Label>
                    <Select
                      value={walletConvertTo}
                      onValueChange={setWalletConvertTo}
                    >
                      <SelectTrigger data-testid="select-wallet-convert-to">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {walletConvertSettings?.eligibleCurrencies
                          .filter((c) => c !== walletConvertFrom)
                          .map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-3 bg-muted rounded-lg text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'الرصيد المتاح' : 'Available'}:
                  </span>
                  <span className="font-bold text-primary" data-testid="text-wallet-convert-balance">
                    {walletConvertSourceBalance.toFixed(2)} {walletConvertFrom}
                  </span>
                </div>

                <div>
                  <Label>{language === 'ar' ? 'المبلغ' : 'Amount'} ({walletConvertFrom})</Label>
                  <MoneyInput
                    ref={walletConvertAmountInputRef}
                    value={walletConvertAmount}
                    onChange={(e) => setWalletConvertAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      queueFocus(walletConvertConfirmButtonRef.current);
                    }}
                    placeholder="0.00"
                    enterKeyHint="done"
                    className="mt-2"
                    data-testid="input-wallet-convert-amount"
                  />
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[0.25, 0.5, 1].map((pct) => {
                      const v = walletConvertSourceBalance * pct;
                      return (
                        <Button
                          key={pct}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setWalletConvertAmount(v > 0 ? v.toFixed(2) : '0')}
                          disabled={walletConvertSourceBalance <= 0}
                        >
                          {pct === 1 ? (language === 'ar' ? 'الكل' : 'All') : `${Math.round(pct * 100)}%`}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {walletConvertParsedAmount > 0 && walletConvertFrom && walletConvertTo && walletConvertFrom !== walletConvertTo && (
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 text-sm space-y-2" data-testid="wallet-convert-quote">
                    {walletConvertQuoteLoading && !walletConvertQuote ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {language === 'ar' ? 'جارٍ حساب السعر...' : 'Calculating quote...'}
                      </div>
                    ) : walletConvertQuote ? (
                      <>
                        <div className="flex justify-between">
                          <span>{language === 'ar' ? 'تدفع' : 'You pay'}:</span>
                          <span className="font-medium">
                            {walletConvertQuote.fromAmount.toFixed(2)} {walletConvertQuote.fromCurrency}
                          </span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>{language === 'ar' ? 'القيمة الإجمالية' : 'Gross'}:</span>
                          <span>{walletConvertQuote.grossToAmount.toFixed(2)} {walletConvertQuote.toCurrency}</span>
                        </div>
                        {walletConvertQuote.feePct > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>{language === 'ar' ? 'الرسوم' : 'Fee'} ({(walletConvertQuote.feePct * 100).toFixed(2)}%):</span>
                            <span>-{walletConvertQuote.feeAmount.toFixed(2)} {walletConvertQuote.toCurrency}</span>
                          </div>
                        )}
                        <Separator className="my-1" />
                        <div className="flex justify-between font-bold text-primary">
                          <span>{language === 'ar' ? 'تستلم' : 'You receive'}:</span>
                          <span data-testid="text-wallet-convert-net">
                            {walletConvertQuote.netToAmount.toFixed(2)} {walletConvertQuote.toCurrency}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {language === 'ar'
                            ? `السعر: 1 ${walletConvertQuote.fromCurrency} ≈ ${(walletConvertQuote.netToAmount / Math.max(walletConvertQuote.fromAmount, 0.0000001)).toFixed(6)} ${walletConvertQuote.toCurrency}`
                            : `Rate: 1 ${walletConvertQuote.fromCurrency} ≈ ${(walletConvertQuote.netToAmount / Math.max(walletConvertQuote.fromAmount, 0.0000001)).toFixed(6)} ${walletConvertQuote.toCurrency}`}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {language === 'ar' ? 'تعذّر جلب السعر.' : 'Unable to fetch quote.'}
                      </span>
                    )}
                  </div>
                )}
                {walletConvertParsedAmount > walletConvertSourceBalance && (
                  <p className="text-xs text-destructive">
                    {language === 'ar' ? 'المبلغ يتجاوز رصيدك المتاح.' : 'Amount exceeds available balance.'}
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 z-10 px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 pt-3 border-t bg-background">
            <Button className="w-full sm:w-auto min-h-11" variant="outline" onClick={() => setShowWalletConvert(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              ref={walletConvertConfirmButtonRef}
              className="w-full sm:w-auto min-h-11"
              onClick={handleWalletConvertSubmit}
              disabled={
                !walletConvertEnabled ||
                !walletConvertFrom ||
                !walletConvertTo ||
                walletConvertFrom === walletConvertTo ||
                walletConvertParsedAmount <= 0 ||
                walletConvertParsedAmount > walletConvertSourceBalance ||
                walletConvertMutation.isPending
              }
              data-testid="button-confirm-wallet-convert"
            >
              {walletConvertMutation.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {language === 'ar' ? 'تأكيد التحويل' : 'Confirm Convert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
