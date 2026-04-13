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

export default function AdminDashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");

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
      title: "Total Users",
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Today",
      value: stats?.activeToday || 0,
      icon: Activity,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Total Balance",
      value: `$${(stats?.totalBalance || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      title: "Total Games",
      value: stats?.totalGames || 0,
      icon: Gamepad2,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Open Complaints",
      value: stats?.openComplaints || 0,
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      title: "Pending Disputes",
      value: stats?.pendingDisputes || 0,
      icon: Shield,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const quickLinks = [
    { title: "User Management", icon: Users, href: "/admin/users", desc: "Manage users, ban, suspend, rewards" },
    { title: "Section Controls", icon: Settings, href: "/admin/sections", desc: "Enable/disable app sections" },
    { title: "Theme Management", icon: Palette, href: "/admin/themes", desc: "Configure app themes" },
    { title: "Anti-Cheat", icon: Shield, href: "/admin/anti-cheat", desc: "Monitor suspicious activity" },
    { title: "Analytics", icon: BarChart3, href: "/admin/analytics", desc: "User behavior analytics" },
    { title: "Disputes", icon: AlertTriangle, href: "/admin/disputes", desc: "Manage P2P disputes" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Complete control over VEX platform</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users, transactions, games..."
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
            <CardTitle className="text-lg">Search Results</CardTitle>
          </CardHeader>
          <CardContent>
            {searchLoading ? (
              <p className="text-muted-foreground">Searching...</p>
            ) : searchResults ? (
              <div className="space-y-4">
                {searchResults.users?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Users</h4>
                    <div className="space-y-2">
                      {searchResults.users.map((user: { id: string; username?: string; email?: string; status?: string }) => (
                        <div key={user.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
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
                    <h4 className="font-medium mb-2">Transactions</h4>
                    <div className="space-y-2">
                      {searchResults.transactions.map((tx: { id: string; type?: string; amount?: string | number; status?: string; referenceId?: string | null }) => (
                        <div key={tx.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <div>
                            <span>{tx.type} - ${tx.amount}</span>
                            <p className="text-xs text-muted-foreground">Ref: {tx.referenceId || tx.id}</p>
                          </div>
                          <Badge>{tx.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {searchResults.currencyLedger?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Project Currency Ledger</h4>
                    <div className="space-y-2">
                      {searchResults.currencyLedger.map((entry: { id: string; type?: string; amount?: string | number; referenceId?: string | null; referenceType?: string | null; description?: string | null }) => (
                        <div key={entry.id} className="flex items-center justify-between gap-3 p-2 rounded bg-muted/50">
                          <div className="min-w-0">
                            <p className="font-medium">{entry.type} - {entry.amount}</p>
                            <p className="text-xs text-muted-foreground truncate">{entry.description || entry.referenceType || "Ledger entry"}</p>
                            <p className="text-xs text-muted-foreground">Ref: {entry.referenceId || entry.id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{entry.referenceType || "ledger"}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyText(entry.referenceId || entry.id)}
                              aria-label="Copy ledger reference"
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
                  <p className="text-muted-foreground">No results found</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1" data-testid={`stat-${stat.title.toLowerCase().replace(' ', '-')}`}>
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
                  <p className="text-xs text-muted-foreground">Online Now</p>
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
                  <p className="text-xs text-muted-foreground">Active Games</p>
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
                  <p className="text-xs text-muted-foreground">Total Games Played</p>
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
                  <p className="text-xs text-muted-foreground">Registered Users</p>
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
              Revenue Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                    Total Deposits
                  </span>
                  <span className="font-semibold text-green-500">${(stats.totalDeposits || 0).toLocaleString()}</span>
                </div>
                <Progress value={100} className="h-2 [&>div]:bg-green-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                    Total Withdrawals
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
                    Net Revenue
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
        <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
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
                      <h3 className="font-semibold">{link.title}</h3>
                      <p className="text-sm text-muted-foreground">{link.desc}</p>
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
