import { useQuery } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Gamepad2, DollarSign, AlertTriangle,
  TrendingUp, TrendingDown, Activity, Clock,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { financialQueryOptions } from "@/lib/queryClient";
import { formatWalletAmountFromUsd } from "@/lib/wallet-currency";
import StadiumHome from "@/components/home/stadium-home";

interface DashboardStats {
  totalUsers: number;
  totalAgents: number;
  totalAffiliates: number;
  totalGames: number;
  pendingTransactions: number;
  openComplaints: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netRevenue: number;
}

interface DepositConfigForDashboard {
  balanceCurrency?: string;
  usdRateByCurrency?: Record<string, number>;
  currencySymbolByCode?: Record<string, string>;
}

function PlayerDashboard({ user, dir }: { user: Record<string, unknown>; dir: string }) {
  const { t, language } = useI18n();
  const headers = useAuthHeaders();
  const [, navigate] = useLocation();
  const [isInsightsReady, setIsInsightsReady] = useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem('hideBalance') === 'true';
    } catch {
      return false;
    }
  });

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem('hideBalance', String(newValue));
      } catch {
        // Ignore storage write failures (e.g. private mode restrictions)
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onReady = () => setIsInsightsReady(true);
    const idleCapableWindow = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    let timeoutHandle: number | null = null;
    let idleHandle: number | null = null;

    if (typeof idleCapableWindow.requestIdleCallback === "function") {
      idleHandle = idleCapableWindow.requestIdleCallback(() => onReady(), { timeout: 1400 });
    } else {
      timeoutHandle = window.setTimeout(onReady, 900);
    }

    return () => {
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
      if (idleHandle !== null && typeof idleCapableWindow.cancelIdleCallback === "function") {
        idleCapableWindow.cancelIdleCallback(idleHandle);
      }
    };
  }, []);

  // Fetch platform stats (online players, active games)
  const { data: platformStats } = useQuery<{ onlinePlayers: number; activeGames: number } | null>({
    queryKey: ["/api/platform/stats"],
    queryFn: async () => {
      const res = await fetch("/api/platform/stats");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isInsightsReady,
    refetchInterval: 30000, // refresh every 30s
  });

  // Fetch player game stats
  const { data: gameStats } = useQuery<{ gamesPlayed?: number; gamesWon?: number; currentWinStreak?: number; longestWinStreak?: number } | null>({
    queryKey: ["/api/me/stats"],
    queryFn: async () => {
      const res = await fetch("/api/me/stats", { headers });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user?.id && isInsightsReady,
  });

  const { data: depositConfig } = useQuery<DepositConfigForDashboard>({
    queryKey: ["/api/transactions/deposit-config"],
    ...financialQueryOptions,
    enabled: !!user?.id,
  });

  // Fetch active challenges
  const { data: challenges } = useQuery({
    queryKey: ["/api/challenges", "active"],
    queryFn: async () => {
      const res = await fetch("/api/challenges?status=pending", { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id && isInsightsReady,
  });

  const balance = parseFloat(String(user?.balance || "0"));
  const totalDeposited = parseFloat(String(user?.totalDeposited || "0"));
  const totalWithdrawn = parseFloat(String(user?.totalWithdrawn || "0"));
  const totalWagered = parseFloat(String(user?.totalWagered || "0"));
  const totalWon = parseFloat(String(user?.totalWon || "0"));

  const gamesPlayed = gameStats?.gamesPlayed ?? Number(user?.gamesPlayed ?? 0);
  const gamesWon = gameStats?.gamesWon ?? Number(user?.gamesWon ?? 0);
  const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
  const currentStreak = gameStats?.currentWinStreak ?? Number(user?.currentWinStreak ?? 0);
  const bestStreak = gameStats?.longestWinStreak ?? Number(user?.longestWinStreak ?? 0);
  const activeChallengesCount = Array.isArray(challenges) ? challenges.length : 0;
  const userCurrency = typeof user?.balanceCurrency === "string" && user.balanceCurrency.trim().length > 0
    ? user.balanceCurrency.trim().toUpperCase()
    : "USD";

  const formatCurrency = (amount: number) => formatWalletAmountFromUsd(amount, {
    balanceCurrency: depositConfig?.balanceCurrency || userCurrency,
    usdRateByCurrency: depositConfig?.usdRateByCurrency,
    currencySymbolByCode: depositConfig?.currencySymbolByCode,
  }, { withCode: true });
const ownerInitials = (() => {
      const source = String(user?.nickname || user?.username || "VX").trim();
      if (!source) return "VX";
      const parts = source.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return source.slice(0, 2).toUpperCase();
    })();

    const vipLevelRaw = Number(user?.vipLevel ?? 0);
    const vipLevel = Number.isFinite(vipLevelRaw) && vipLevelRaw >= 0 ? Math.floor(vipLevelRaw) : 0;
    const ownerLocation = (() => {
      const cityRaw = typeof user?.city === "string" ? user.city.trim() : "";
      const countryRaw = typeof user?.country === "string" ? user.country.trim() : "";
      const joined = [cityRaw, countryRaw].filter(Boolean).join("، ");
      return joined || undefined;
    })();
    const lossesToday = Math.max(0, gamesPlayed - gamesWon);
    const xpPercent = Math.min(100, Math.max(0, Number.isFinite(winRate) ? winRate : 0));
    const safeWinStreak = Number.isFinite(currentStreak) && currentStreak >= 0 ? currentStreak : 0;
    const xpCurrent = Math.max(0, gamesWon);
    const xpTarget = Math.max(gamesPlayed, gamesWon + 1, 1);
    const walletDisplay = isBalanceHidden
      ? "******"
      : formatWalletAmountFromUsd(balance, {
          balanceCurrency: depositConfig?.balanceCurrency || userCurrency,
          usdRateByCurrency: depositConfig?.usdRateByCurrency,
          currencySymbolByCode: depositConfig?.currencySymbolByCode,
        }, { withCode: false });
    const avatarUrl = (() => {
      const candidates = [
        (user as Record<string, unknown>)?.avatarUrl,
        (user as Record<string, unknown>)?.profilePicture,
        (user as Record<string, unknown>)?.profilePictureUrl,
        (user as Record<string, unknown>)?.avatar,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.trim().length > 0) return c.trim();
      }
      return undefined;
    })();
    const displayName = String(user?.nickname || user?.username || "VEX Player");
    const usernameStr = String(user?.username || "vex");
    const rankPrefix = language === "ar" ? "VIP" : "VIP";
    void formatCurrency;

    return (
      <div dir={dir}>
        <div className="px-3 sm:px-6 pt-3 flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-muted-foreground">
            {platformStats ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {platformStats.onlinePlayers} {t('dashboard.onlinePlayers')}
                </span>
                {platformStats.activeGames > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    {platformStats.activeGames} {t('dashboard.activeGames')}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleBalanceVisibility}
            className="text-muted-foreground hover:text-foreground transition-colors text-xs"
            data-testid="button-toggle-dashboard-balance"
            aria-label={isBalanceHidden ? t('dashboard.showBalance') : t('dashboard.hideBalance')}
          >
            {isBalanceHidden ? t('dashboard.showBalance') : t('dashboard.hideBalance')}
          </button>
        </div>

        <StadiumHome
          owner={{
            avatarUrl,
            initials: ownerInitials,
            level: vipLevel,
            displayName,
            username: usernameStr,
            rankLabel: rankPrefix + " " + vipLevel,
            location: ownerLocation,
            walletValue: walletDisplay,
            walletCurrency: depositConfig?.balanceCurrency || userCurrency,
            winsToday: gamesWon,
            lossesToday,
            winStreak: safeWinStreak,
            xpPercent,
            xpCurrent,
            xpTarget,
            nextRankLabel: rankPrefix + " " + (vipLevel + 1),
            challengeLabel: t('nav.challenges'),
            depositLabel: t('common.deposit'),
            onChallengeFriend: () => navigate("/challenges"),
            onDeposit: () => navigate("/wallet"),
          }}
        />

        {activeChallengesCount > 0 ? (
          <div className="sr-only" aria-live="polite">
            {activeChallengesCount} {t('dashboard.activeChallenges')}
          </div>
        ) : null}

        {!isInsightsReady ? (
          <div className="sr-only">{t('common.loading')}</div>
        ) : (
          <div className="sr-only">
            {bestStreak > 0 ? `${t('dashboard.best')}: ${bestStreak}` : ""}
          </div>
        )}
      </div>
    );
  }

export default function DashboardPage() {
  const { user } = useAuth();
  const headers = useAuthHeaders();
  const { dir, t, language } = useI18n();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { headers });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: user?.role === "admin",
  });

  if (user?.role !== "admin") {
    return <PlayerDashboard user={user as Record<string, unknown>} dir={dir} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-[100svh] p-3 sm:p-6 space-y-3 sm:space-y-6" dir={dir}>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const formatAdminCurrency = (amount: number) => {
    const locale = language === "ar" ? "ar" : "en";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const statCards = [
    {
      id: "total-users",
      title: t('dashboard.totalUsers'),
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "text-blue-500",
    },
    {
      id: "active-games",
      title: t('dashboard.activeGames'),
      value: stats?.totalGames || 0,
      icon: Gamepad2,
      color: "text-primary",
    },
    {
      id: "total-agents",
      title: t('dashboard.totalAgents'),
      value: stats?.totalAgents || 0,
      icon: Activity,
      color: "text-purple-500",
    },
    {
      id: "affiliates",
      title: t('dashboard.affiliates'),
      value: stats?.totalAffiliates || 0,
      icon: TrendingUp,
      color: "text-orange-500",
    },
    {
      id: "total-deposits",
      title: t('dashboard.totalDeposits'),
      value: formatAdminCurrency(stats?.totalDeposits || 0),
      icon: DollarSign,
      color: "text-primary",
    },
    {
      id: "total-withdrawals",
      title: t('dashboard.totalWithdrawals'),
      value: formatAdminCurrency(stats?.totalWithdrawals || 0),
      icon: TrendingDown,
      color: "text-red-500",
    },
    {
      id: "pending-transactions",
      title: t('dashboard.pendingTransactions'),
      value: stats?.pendingTransactions || 0,
      icon: Clock,
      color: "text-yellow-500",
      badge: stats?.pendingTransactions ? t('dashboard.actionRequired') : null,
    },
    {
      id: "open-complaints",
      title: t('dashboard.openComplaints'),
      value: stats?.openComplaints || 0,
      icon: AlertTriangle,
      color: "text-red-500",
      badge: stats?.openComplaints ? t('dashboard.needsAttention') : null,
    },
  ];

  return (
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_45%)] p-3 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 sm:space-y-6" dir={dir}>
      <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold">{t('dashboard.adminTitle')}</h1>
        <Badge variant="outline" className="text-primary border-primary">
          {t('dashboard.netRevenue')}: {formatAdminCurrency(stats?.netRevenue || 0)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat) => (
          <Card key={stat.id} data-testid={`card-stat-${stat.id}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.badge && (
                <Badge variant="destructive" className="mt-2 text-xs">
                  {stat.badge}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
