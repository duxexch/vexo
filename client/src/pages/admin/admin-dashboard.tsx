import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { Link } from "wouter";
import { adminFetch } from "@/lib/admin-api";
import {
  Users,
  DollarSign,
  Gamepad2,
  AlertTriangle,
  TrendingUp,
  Search,
  Copy,
  Settings,
  Palette,
  Shield,
  BarChart3,
  Activity,
  Wifi,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function AdminDashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useI18n();

  const copyText = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard support can be unavailable in some contexts.
    }
  };

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => adminFetch("/api/admin/stats"),
  });

  const { data: platformStats } = useQuery({
    queryKey: ["/api/platform/stats"],
    queryFn: async () => {
      const res = await fetch("/api/platform/stats");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["/api/admin/recent-activity"],
    queryFn: () => adminFetch("/api/admin/recent-activity").catch(() => null),
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["/api/admin/search", searchQuery],
    queryFn: () => adminFetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.length >= 2,
  });

  const statCards = [
    {
      id: "total-users",
      title: t("admin.dashboard.stat.totalUsers"),
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      id: "active-today",
      title: t("admin.dashboard.stat.activeToday"),
      value: stats?.activeToday || 0,
      icon: Activity,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      id: "total-balance",
      title: t("admin.dashboard.stat.totalBalance"),
      value: `$${(stats?.totalBalance || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      id: "total-games",
      title: t("admin.dashboard.stat.totalGames"),
      value: stats?.totalGames || 0,
      icon: Gamepad2,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      id: "open-complaints",
      title: t("admin.dashboard.stat.openComplaints"),
      value: stats?.openComplaints || 0,
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      id: "pending-disputes",
      title: t("admin.dashboard.stat.pendingDisputes"),
      value: stats?.pendingDisputes || 0,
      icon: Shield,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const quickLinks = [
    { key: "userManagement", icon: Users, href: "/admin/users" },
    { key: "sectionControls", icon: Settings, href: "/admin/sections" },
    { key: "themeManagement", icon: Palette, href: "/admin/themes" },
    { key: "antiCheat", icon: Shield, href: "/admin/anti-cheat" },
    { key: "analytics", icon: BarChart3, href: "/admin/analytics" },
    { key: "disputes", icon: AlertTriangle, href: "/admin/disputes" },
  ];

  return (
    <div className="min-h-[100svh] space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("admin.dashboard.heading")}</h1>
          <p className="text-muted-foreground">{t("admin.dashboard.subheading")}</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("admin.dashboard.searchPlaceholder")}
            className="ps-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-admin-search"
          />
        </div>
      </div>

      {searchQuery.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("admin.dashboard.searchResults")}</CardTitle>
          </CardHeader>
          <CardContent>
            {searchLoading ? (
              <p className="text-muted-foreground">{t("admin.dashboard.searching")}</p>
            ) : searchResults ? (
              <div className="space-y-4">
                {searchResults.users?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">{t("admin.dashboard.users")}</h4>
                    <div className="space-y-2">
                      {searchResults.users.map((user: { id: string; username?: string; email?: string; status?: string }) => (
                        <div key={user.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2 rounded bg-muted/50">
                          <div>
                            <span className="font-medium">{user.username}</span>
                            <span className="text-muted-foreground ms-2">({user.email})</span>
                          </div>
                          <Badge variant={user.status === "active" ? "default" : "destructive"}>
                            {user.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {searchResults.transactions?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">{t("admin.dashboard.transactions")}</h4>
                    <div className="space-y-2">
                      {searchResults.transactions.map((tx: { id: string; type?: string; amount?: string | number; status?: string; referenceId?: string | null }) => (
                        <div key={tx.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2 rounded bg-muted/50">
                          <div>
                            <span>{tx.type} - ${tx.amount}</span>
                            <p className="text-xs text-muted-foreground">{t("admin.dashboard.reference")}: {tx.referenceId || tx.id}</p>
                          </div>
                          <Badge>{tx.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {searchResults.currencyLedger?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">{t("admin.dashboard.projectCurrencyLedger")}</h4>
                    <div className="space-y-2">
                      {searchResults.currencyLedger.map((entry: { id: string; type?: string; amount?: string | number; referenceId?: string | null; referenceType?: string | null; description?: string | null }) => (
                        <div key={entry.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 p-2 rounded bg-muted/50">
                          <div className="min-w-0">
                            <p className="font-medium">{entry.type} - {entry.amount}</p>
                            <p className="text-xs text-muted-foreground truncate">{entry.description || entry.referenceType || t("admin.dashboard.ledgerEntry")}</p>
                            <p className="text-xs text-muted-foreground">{t("admin.dashboard.reference")}: {entry.referenceId || entry.id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{entry.referenceType || "ledger"}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[40px] min-w-[40px]"
                              onClick={() => copyText(entry.referenceId || entry.id)}
                              aria-label={t("admin.dashboard.copyLedgerReference")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(!searchResults.users?.length && !searchResults.transactions?.length && !searchResults.currencyLedger?.length) && (
                  <p className="text-muted-foreground">{t("admin.dashboard.noResults")}</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1" data-testid={`stat-${stat.id}`}>
                    {statsLoading ? "..." : stat.value}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live Platform Status */}
      {platformStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-emerald-500/10">
                  <Wifi className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.dashboard.live.onlineNow")}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold">{platformStats.onlinePlayers}</p>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-500/10">
                  <Gamepad2 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.dashboard.live.activeGames")}</p>
                  <p className="text-xl font-bold">{platformStats.activeGames}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/10">
                  <Trophy className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.dashboard.live.totalGamesPlayed")}</p>
                  <p className="text-xl font-bold">{platformStats.totalGamesPlayed?.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/30 bg-purple-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-500/10">
                  <Users className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.dashboard.live.registeredUsers")}</p>
                  <p className="text-xl font-bold">{platformStats.totalUsers?.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revenue Overview */}
      {stats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {t("admin.dashboard.revenueOverview")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                    {t("admin.dashboard.totalDeposits")}
                  </span>
                  <span className="font-semibold text-green-500">${(stats.totalDeposits || 0).toLocaleString()}</span>
                </div>
                <Progress value={100} className="h-2 [&>div]:bg-green-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                    {t("admin.dashboard.totalWithdrawals")}
                  </span>
                  <span className="font-semibold text-red-500">${(stats.totalWithdrawals || 0).toLocaleString()}</span>
                </div>
                <Progress
                  value={stats.totalDeposits > 0 ? Math.min(100, ((stats.totalWithdrawals || 0) / stats.totalDeposits) * 100) : 0}
                  className="h-2 [&>div]:bg-red-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-primary" />
                    {t("admin.dashboard.netRevenue")}
                  </span>
                  <span className="font-semibold text-primary">${((stats.totalDeposits || 0) - (stats.totalWithdrawals || 0)).toLocaleString()}</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-bold mb-4">{t("admin.dashboard.quickActions")}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="cursor-pointer hover-elevate transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <link.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{t(`admin.dashboard.quickLink.${link.key}.title`)}</h3>
                      <p className="text-sm text-muted-foreground">{t(`admin.dashboard.quickLink.${link.key}.desc`)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
