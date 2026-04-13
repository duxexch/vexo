import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminFetch } from "@/lib/admin-api";
import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Gamepad2,
  ArrowUpRight,
} from "lucide-react";

export default function AdminAnalyticsPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => adminFetch("/api/admin/analytics"),
  });

  const kpiCards = [
    {
      title: "Daily Active Users",
      value: analytics?.dailyActiveUsers || 0,
      change: "+12%",
      trend: "up",
      icon: Users,
    },
    {
      title: "Avg Session Duration",
      value: analytics?.avgSessionDuration || "0m",
      change: "+5%",
      trend: "up",
      icon: Clock,
    },
    {
      title: "Daily Revenue",
      value: `$${(analytics?.dailyRevenue || 0).toLocaleString()}`,
      change: "+8%",
      trend: "up",
      icon: DollarSign,
    },
    {
      title: "Games Played Today",
      value: analytics?.gamesPlayedToday || 0,
      change: "-3%",
      trend: "down",
      icon: Gamepad2,
    },
  ];

  const popularGames = analytics?.popularGames || [
    { name: "Slots", plays: 1245, revenue: 5420 },
    { name: "Blackjack", plays: 890, revenue: 3200 },
    { name: "Roulette", plays: 756, revenue: 2890 },
    { name: "Poker", plays: 543, revenue: 2100 },
    { name: "Dice", plays: 432, revenue: 1560 },
  ];

  const userBehavior = analytics?.userBehavior || {
    newUsers: 45,
    returningUsers: 320,
    churnRate: "2.3%",
    conversionRate: "12.5%",
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Platform performance and user behavior insights</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {kpi.trend === "up" ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className={`text-xs ${kpi.trend === "up" ? "text-green-500" : "text-red-500"}`}>
                      {kpi.change}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <kpi.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Popular Games</CardTitle>
            <CardDescription>Top performing games by plays and revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {popularGames.map((game: { name: string; plays?: number; revenue?: string | number }, index: number) => (
                <div
                  key={game.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{game.name}</p>
                      <p className="text-sm text-muted-foreground">{game.plays} plays</p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold text-primary">${game.revenue}</p>
                    <p className="text-xs text-muted-foreground">revenue</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>User Behavior</CardTitle>
            <CardDescription>Key metrics about user activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">New Users</p>
                <p className="text-2xl font-bold">{userBehavior.newUsers}</p>
                <Badge variant="default" className="mt-2">
                  <ArrowUpRight className="h-3 w-3 me-1" />
                  Today
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Returning Users</p>
                <p className="text-2xl font-bold">{userBehavior.returningUsers}</p>
                <Badge variant="secondary" className="mt-2">Active</Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Churn Rate</p>
                <p className="text-2xl font-bold">{userBehavior.churnRate}</p>
                <Badge variant="outline" className="mt-2">Monthly</Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{userBehavior.conversionRate}</p>
                <Badge variant="default" className="mt-2">
                  <TrendingUp className="h-3 w-3 me-1" />
                  Good
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>Recent platform activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { time: "10:45 AM", event: "New user registered", type: "user" },
              { time: "10:42 AM", event: "Deposit of $500 processed", type: "transaction" },
              { time: "10:38 AM", event: "Game session started - Blackjack", type: "game" },
              { time: "10:35 AM", event: "Withdrawal request submitted", type: "transaction" },
              { time: "10:30 AM", event: "Support ticket opened", type: "support" },
              { time: "10:25 AM", event: "User won $1,200 jackpot", type: "win" },
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-20 text-sm text-muted-foreground">{item.time}</div>
                <div className="w-2 h-2 rounded-full bg-primary" />
                <div className="flex-1">
                  <p className="text-sm">{item.event}</p>
                </div>
                <Badge variant="outline">{item.type}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
