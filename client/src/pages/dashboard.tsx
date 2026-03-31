import { useQuery } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Users, Gamepad2, DollarSign, AlertTriangle, 
  TrendingUp, TrendingDown, Activity, Clock,
  Wallet, Eye, EyeOff, ArrowUpRight, ArrowDownRight, Trophy, Gift,
  Flame, Target, Swords, Crown, Star, ChevronRight
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

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

function PlayerDashboard({ user, dir }: { user: Record<string, unknown>; dir: string }) {
  const { t, language } = useI18n();
  const headers = useAuthHeaders();
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    return localStorage.getItem('hideBalance') === 'true';
  });

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    localStorage.setItem('hideBalance', String(newValue));
  };

  // Fetch platform stats (online players, active games)
  const { data: platformStats } = useQuery<{ onlinePlayers: number; activeGames: number } | null>({
    queryKey: ["/api/platform/stats"],
    queryFn: async () => {
      const res = await fetch("/api/platform/stats");
      if (!res.ok) return null;
      return res.json();
    },
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
    enabled: !!user?.id,
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

  const quickActions = [
    { title: t('nav.wallet'), url: "/wallet", icon: Wallet, color: "bg-primary/10 text-primary" },
    { title: t('nav.multiplayer'), url: "/multiplayer", icon: Gamepad2, color: "bg-blue-500/10 text-blue-500" },
    { title: t('nav.challenges'), url: "/challenges", icon: Trophy, color: "bg-orange-500/10 text-orange-500" },
    { title: t('nav.tournaments'), url: "/tournaments", icon: Crown, color: "bg-amber-500/10 text-amber-500" },
    { title: t('nav.free'), url: "/free", icon: Gift, color: "bg-purple-500/10 text-purple-500" },
    { title: language === 'ar' ? '🎮 الألعاب' : '🎮 Games', url: "/games", icon: Gamepad2, color: "bg-indigo-500/10 text-indigo-500" },
  ];

  const isAr = language === 'ar';

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-6" dir={dir}>
      {/* Online Status Bar */}
      {platformStats && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {isAr 
                ? `${platformStats.onlinePlayers} لاعب متصل` 
                : `${platformStats.onlinePlayers} online`}
            </span>
          </div>
          {platformStats.activeGames > 0 && (
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              <span>
                {isAr 
                  ? `${platformStats.activeGames} مباراة جارية`
                  : `${platformStats.activeGames} active game${platformStats.activeGames !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}
        </div>
      )}
      <h1 className="text-xl sm:text-2xl font-bold">{t('dashboard.welcome')}, {String(user?.username || '')}</h1>
      
      {/* Balance & Account Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 text-xs">
          <CardTitle className="text-lg">{t('dashboard.accountSummary')}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleBalanceVisibility}
            aria-label={isBalanceHidden ? "Show balance" : "Hide balance"}
            data-testid="button-toggle-dashboard-balance"
          >
            {isBalanceHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 space-y-4 text-xs font-medium">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('common.balance')}</span>
            <span className="text-3xl font-bold text-primary balance-glow" data-testid="text-dashboard-balance">
              {isBalanceHidden ? '******' : `$${balance.toFixed(2)}`}
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <ArrowDownRight className="h-3 w-3 text-primary" />
                {t('dashboard.deposited')}
              </div>
              <p className="font-semibold" data-testid="text-total-deposited">
                {isBalanceHidden ? '***' : `$${totalDeposited.toFixed(2)}`}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <ArrowUpRight className="h-3 w-3 text-red-500" />
                {t('dashboard.withdrawn')}
              </div>
              <p className="font-semibold" data-testid="text-total-withdrawn">
                {isBalanceHidden ? '***' : `$${totalWithdrawn.toFixed(2)}`}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Gamepad2 className="h-3 w-3 text-blue-500" />
                {t('dashboard.wagered')}
              </div>
              <p className="font-semibold" data-testid="text-total-wagered">
                {isBalanceHidden ? '***' : `$${totalWagered.toFixed(2)}`}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Trophy className="h-3 w-3 text-orange-500" />
                {t('dashboard.won')}
              </div>
              <p className="font-semibold" data-testid="text-total-won">
                {isBalanceHidden ? '***' : `$${totalWon.toFixed(2)}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game Performance Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-blue-500/10">
                <Swords className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-sm text-muted-foreground">
                {isAr ? 'المباريات' : 'Games Played'}
              </span>
            </div>
            <p className="text-2xl font-bold">{gamesPlayed}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-primary/10">
                <Star className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">
                {isAr ? 'الانتصارات' : 'Wins'}
              </span>
            </div>
            <p className="text-2xl font-bold">{gamesWon}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-emerald-500/10">
                <Target className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-sm text-muted-foreground">
                {isAr ? 'نسبة الفوز' : 'Win Rate'}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold">{winRate}%</p>
              <Progress value={winRate} className="h-1.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-full bg-orange-500/10">
                <Flame className="h-4 w-4 text-orange-500" />
              </div>
              <span className="text-sm text-muted-foreground">
                {isAr ? 'سلسلة الانتصارات' : 'Win Streak'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{currentStreak}</p>
              {bestStreak > 0 && (
                <span className="text-xs text-muted-foreground">
                  {isAr ? `الأفضل: ${bestStreak}` : `Best: ${bestStreak}`}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Challenges Banner */}
      {activeChallengesCount > 0 && (
        <Link href="/challenges">
          <Card className="hover-elevate cursor-pointer border-orange-500/30 bg-orange-500/5">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-orange-500/10">
                  <Trophy className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold">
                    {isAr 
                      ? `لديك ${activeChallengesCount} تحدي نشط` 
                      : `You have ${activeChallengesCount} active challenge${activeChallengesCount > 1 ? 's' : ''}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isAr ? 'اضغط للعرض والقبول' : 'Tap to view and accept'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        {quickActions.map((action) => (
          <Link key={action.url} href={action.url}>
            <Card className="hover-elevate cursor-pointer">
              <CardContent className="p-3 sm:p-4 flex flex-col items-center gap-2 text-center">
                <div className={`p-3 rounded-full ${action.color}`}>
                  <action.icon className="h-6 w-6" />
                </div>
                <span className="font-medium text-sm">{action.title}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const headers = useAuthHeaders();
  const { dir } = useI18n();
  
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
      <div className="p-3 sm:p-6 space-y-3 sm:space-y-6" dir={dir}>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "Active Games",
      value: stats?.totalGames || 0,
      icon: Gamepad2,
      color: "text-primary",
    },
    {
      title: "Total Agents",
      value: stats?.totalAgents || 0,
      icon: Activity,
      color: "text-purple-500",
    },
    {
      title: "Affiliates",
      value: stats?.totalAffiliates || 0,
      icon: TrendingUp,
      color: "text-orange-500",
    },
    {
      title: "Total Deposits",
      value: `$${(stats?.totalDeposits || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Total Withdrawals",
      value: `$${(stats?.totalWithdrawals || 0).toLocaleString()}`,
      icon: TrendingDown,
      color: "text-red-500",
    },
    {
      title: "Pending Transactions",
      value: stats?.pendingTransactions || 0,
      icon: Clock,
      color: "text-yellow-500",
      badge: stats?.pendingTransactions ? "Action Required" : null,
    },
    {
      title: "Open Complaints",
      value: stats?.openComplaints || 0,
      icon: AlertTriangle,
      color: "text-red-500",
      badge: stats?.openComplaints ? "Needs Attention" : null,
    },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-6" dir={dir}>
      <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold">Admin Dashboard</h1>
        <Badge variant="outline" className="text-primary border-primary">
          Net Revenue: ${(stats?.netRevenue || 0).toLocaleString()}
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
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
