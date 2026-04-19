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
import { useI18n } from "@/lib/i18n";

export default function AdminAnalyticsPage() {
  const { t } = useI18n();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => adminFetch("/api/admin/analytics"),
  });

  const kpiCards = [
    {
      title: t("admin.analytics.kpi.dailyActiveUsers"),
      value: analytics?.dailyActiveUsers || 0,
      change: "+12%",
      trend: "up",
      icon: Users,
    },
    {
      title: t("admin.analytics.kpi.avgSessionDuration"),
      value: analytics?.avgSessionDuration || "0m",
      change: "+5%",
      trend: "up",
      icon: Clock,
    },
    {
      title: t("admin.analytics.kpi.dailyRevenue"),
      value: `$${(analytics?.dailyRevenue || 0).toLocaleString()}`,
      change: "+8%",
      trend: "up",
      icon: DollarSign,
    },
    {
      title: t("admin.analytics.kpi.gamesPlayedToday"),
      value: analytics?.gamesPlayedToday || 0,
      change: "-3%",
      trend: "down",
      icon: Gamepad2,
    },
  ];

  const popularGames = analytics?.popularGames || [
    { name: t("admin.analytics.popularGame.slots"), plays: 1245, revenue: 5420 },
    { name: t("admin.analytics.popularGame.blackjack"), plays: 890, revenue: 3200 },
    { name: t("admin.analytics.popularGame.roulette"), plays: 756, revenue: 2890 },
    { name: t("admin.analytics.popularGame.poker"), plays: 543, revenue: 2100 },
    { name: t("admin.analytics.popularGame.dice"), plays: 432, revenue: 1560 },
  ];

  const userBehavior = analytics?.userBehavior || {
    newUsers: 45,
    returningUsers: 320,
    churnRate: "2.3%",
    conversionRate: "12.5%",
  };

  if (isLoading) {
    return (
      <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
    <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t("admin.analytics.heading")}</h1>
        <p className="text-muted-foreground">{t("admin.analytics.subheading")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="p-4 sm:p-6">
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
            <CardTitle>{t("admin.analytics.popularGames.title")}</CardTitle>
            <CardDescription>{t("admin.analytics.popularGames.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {popularGames.map((game: { name: string; plays?: number; revenue?: string | number }, index: number) => (
                <div
                  key={game.name}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{game.name}</p>
                      <p className="text-sm text-muted-foreground">{game.plays} {t("admin.analytics.plays")}</p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold text-primary">${game.revenue}</p>
                    <p className="text-xs text-muted-foreground">{t("admin.analytics.revenue")}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.analytics.userBehavior.title")}</CardTitle>
            <CardDescription>{t("admin.analytics.userBehavior.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("admin.analytics.userBehavior.newUsers")}</p>
                <p className="text-2xl font-bold">{userBehavior.newUsers}</p>
                <Badge variant="default" className="mt-2">
                  <ArrowUpRight className="h-3 w-3 me-1" />
                  {t("admin.analytics.badge.today")}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("admin.analytics.userBehavior.returningUsers")}</p>
                <p className="text-2xl font-bold">{userBehavior.returningUsers}</p>
                <Badge variant="secondary" className="mt-2">{t("admin.analytics.badge.active")}</Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("admin.analytics.userBehavior.churnRate")}</p>
                <p className="text-2xl font-bold">{userBehavior.churnRate}</p>
                <Badge variant="outline" className="mt-2">{t("admin.analytics.badge.monthly")}</Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("admin.analytics.userBehavior.conversionRate")}</p>
                <p className="text-2xl font-bold">{userBehavior.conversionRate}</p>
                <Badge variant="default" className="mt-2">
                  <TrendingUp className="h-3 w-3 me-1" />
                  {t("admin.analytics.badge.good")}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.analytics.activityTimeline.title")}</CardTitle>
          <CardDescription>{t("admin.analytics.activityTimeline.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { time: "10:45 AM", event: t("admin.analytics.activityTimeline.event.newUserRegistered"), type: "user" },
              { time: "10:42 AM", event: t("admin.analytics.activityTimeline.event.depositProcessed"), type: "transaction" },
              { time: "10:38 AM", event: t("admin.analytics.activityTimeline.event.gameSessionStarted"), type: "game" },
              { time: "10:35 AM", event: t("admin.analytics.activityTimeline.event.withdrawalSubmitted"), type: "transaction" },
              { time: "10:30 AM", event: t("admin.analytics.activityTimeline.event.supportTicketOpened"), type: "support" },
              { time: "10:25 AM", event: t("admin.analytics.activityTimeline.event.jackpotWon"), type: "win" },
            ].map((item, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="w-auto sm:w-20 text-sm text-muted-foreground">{item.time}</div>
                <div className="hidden sm:block w-2 h-2 rounded-full bg-primary" />
                <div className="flex-1 rounded-md bg-muted/40 px-3 py-2 sm:bg-transparent sm:px-0 sm:py-0">
                  <p className="text-sm">{item.event}</p>
                </div>
                <Badge className="w-fit" variant="outline">{t(`admin.analytics.activityType.${item.type}`)}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
