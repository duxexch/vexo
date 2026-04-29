import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { BackButton } from "@/components/BackButton";
import { TableSkeleton } from "@/components/skeletons";
import { QueryErrorState } from "@/components/QueryErrorState";
import { type MultiplayerGameFromAPI, buildGameConfigWithAll } from "@/lib/game-config";
import {
  Trophy,
  Medal,
  Crown,
  DollarSign,
  Flame,
  Users,
  Star,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

interface LeaderboardPlayer {
  rank: number;
  id: string;
  username: string;
  nickname?: string;
  profilePicture?: string;
  vipLevel: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalEarnings: string;
  currentWinStreak: number;
  longestWinStreak: number;
  winRate: number;
  gamePlayed?: number;
  gameWon?: number;
}

type SortKey = "wins" | "earnings" | "streak";

const SORT_TABS: {
  key: SortKey;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  glow: string;
}[] = [
  { key: "wins", icon: Trophy, accent: "from-brand-blue to-brand-blue-dark", glow: "shadow-[0_0_30px_-5px_hsl(var(--brand-blue))]" },
  { key: "earnings", icon: DollarSign, accent: "from-brand-gold to-[#a86b00]", glow: "shadow-[0_0_30px_-5px_hsl(var(--brand-gold))]" },
  { key: "streak", icon: Flame, accent: "from-rose-500 to-rose-900", glow: "shadow-[0_0_30px_-5px_#ef4444]" },
];

const RANK_MEDAL = [
  { bg: "from-brand-gold to-[#a86b00]", icon: Crown, glow: "shadow-[0_0_24px_-6px_hsl(var(--brand-gold))]" },
  { bg: "from-slate-300 to-slate-500", icon: Medal, glow: "shadow-[0_0_18px_-6px_#cbd5e1]" },
  { bg: "from-amber-700 to-amber-900", icon: Medal, glow: "shadow-[0_0_18px_-6px_#92400e]" },
];

function formatNumber(num: number | string, lang: string) {
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (Number.isNaN(n)) return "0";
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US").format(n);
}

export default function LeaderboardPage() {
  const { t, language, dir } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [sortBy, setSortBy] = useState<SortKey>("wins");
  const [gameType, setGameType] = useState<string>("all");
  const [timePeriod, setTimePeriod] = useState<string>("all");

  const { data: leaderboard, isLoading, isError, error, refetch } = useQuery<LeaderboardPlayer[]>({
    queryKey: [
      "/api/leaderboard",
      {
        sortBy,
        gameType: gameType === "all" ? undefined : gameType,
        period: timePeriod === "all" ? undefined : timePeriod,
      },
    ],
  });

  const { data: myRank } = useQuery<{ rank: number; sortBy: string }>({
    queryKey: ["/api/me/rank", { sortBy }],
  });

  const { data: apiGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ["/api/multiplayer-games"],
    staleTime: 60000,
  });

  const GAME_CONFIG = useMemo(() => buildGameConfigWithAll(apiGames), [apiGames]);

  const activeTab = SORT_TABS.find((tab) => tab.key === sortBy) ?? SORT_TABS[0];

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-[#070b14] dark:via-[#0a1020] dark:to-[#050912] pb-[max(1rem,env(safe-area-inset-bottom))]"
      dir={dir}
    >
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-slate-200 dark:border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--brand-blue)/0.2),transparent_55%),radial-gradient(circle_at_top_left,hsl(var(--brand-gold)/0.2),transparent_55%)] pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-6 md:pt-6 md:pb-8">
          <div className="flex items-center gap-3 mb-4">
            <BackButton />
            <span className="grid place-items-center w-10 h-10 rounded-md bg-gradient-to-br from-brand-gold to-[#a86b00] shadow-[0_0_30px_-5px_hsl(var(--brand-gold))] text-black">
              <Trophy className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display tracking-wider text-3xl md:text-4xl text-slate-900 dark:text-white leading-none">
                {t("leaderboard.title")}
              </h1>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mt-1">
                {language === "ar" ? "أفضل اللاعبين على المنصة" : "Top players on the platform"}
              </p>
            </div>
          </div>

          {myRank && (
            <Card
              className="border-0 bg-gradient-to-r from-brand-blue/15 via-brand-blue/8 to-transparent dark:from-brand-blue/20 dark:via-brand-blue/10 dark:to-transparent shadow-[0_0_40px_-10px_hsl(var(--brand-blue))]"
              data-testid="card-my-rank"
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid place-items-center w-12 h-12 rounded-md bg-gradient-to-br from-brand-blue to-brand-blue-dark shadow-[0_0_20px_-5px_hsl(var(--brand-blue))] text-white">
                      <Medal className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {t("leaderboard.yourRank")}
                      </p>
                      <p className="font-display tracking-wider text-3xl text-slate-900 dark:text-white leading-none mt-1">
                        #{myRank.rank}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto min-h-[40px] bg-white/40 dark:bg-white/5 border-slate-300/70 dark:border-white/10 hover:bg-white dark:hover:bg-white/10"
                    onClick={() => navigate("/profile")}
                    data-testid="button-view-profile"
                  >
                    {t("leaderboard.viewProfile")}
                    <ChevronRight className="w-4 h-4 ms-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-5">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={gameType} onValueChange={setGameType}>
            <SelectTrigger
              className="w-full sm:w-[220px] bg-white dark:bg-white/5 border-slate-200 dark:border-white/10"
              data-testid="select-game-type"
            >
              <SelectValue placeholder={t("leaderboard.selectGame")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GAME_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      {config.iconUrl ? (
                        <div className="h-4 w-4 rounded-sm bg-muted/60 p-0.5">
                          <img
                            src={config.iconUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      ) : (
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      )}
                      {language === "ar" ? config.nameAr : config.name}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger
              className="w-full sm:w-[220px] bg-white dark:bg-white/5 border-slate-200 dark:border-white/10"
              data-testid="select-time-period"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("leaderboard.allTime")}</SelectItem>
              <SelectItem value="daily">
                {t("leaderboard.today") || (language === "ar" ? "اليوم" : "Today")}
              </SelectItem>
              <SelectItem value="weekly">{t("leaderboard.thisWeek")}</SelectItem>
              <SelectItem value="monthly">{t("leaderboard.thisMonth")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort tabs (Stadium style pills) */}
        <div className="grid grid-cols-3 gap-2 p-1 rounded-md bg-slate-200/60 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          {SORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = sortBy === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSortBy(tab.key)}
                data-testid={`tab-${tab.key}`}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? `bg-gradient-to-br ${tab.accent} ${tab.glow} text-white`
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {tab.key === "wins" && t("leaderboard.byWins")}
                  {tab.key === "earnings" && t("leaderboard.byEarnings")}
                  {tab.key === "streak" && t("leaderboard.byStreak")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Players table */}
        <Card className="bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`grid place-items-center w-8 h-8 rounded-md bg-gradient-to-br ${activeTab.accent} ${activeTab.glow} text-white shrink-0`}
              >
                <Users className="w-4 h-4" />
              </span>
              <h2 className="font-display tracking-wider text-xl text-slate-900 dark:text-white leading-none truncate">
                {t("leaderboard.topPlayers")}
              </h2>
            </div>
            <Badge
              variant="secondary"
              className="bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 shrink-0"
            >
              {leaderboard?.length || 0} {t("leaderboard.players")}
            </Badge>
          </div>

          <CardContent className="p-3 md:p-4">
            {isLoading ? (
              <TableSkeleton rows={6} columns={5} />
            ) : isError ? (
              <QueryErrorState error={error} onRetry={() => refetch()} compact />
            ) : leaderboard && leaderboard.length > 0 ? (
              <ScrollArea className="h-[60svh] sm:h-[520px]">
                <div className="space-y-2">
                  {leaderboard.map((player, index) => {
                    const isCurrentUser = player.id === user?.id;
                    const isTop3 = index < 3;
                    const medal = RANK_MEDAL[index];

                    return (
                      <div
                        key={player.id}
                        onClick={() => navigate(`/player/${player.id}`)}
                        data-testid={`row-player-${player.id}`}
                        className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all duration-200 ${
                          isCurrentUser
                            ? "border-brand-blue/40 bg-brand-blue/8 dark:bg-brand-blue/12 shadow-[0_0_24px_-8px_hsl(var(--brand-blue))]"
                            : "border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/[0.05]"
                        }`}
                      >
                        {/* Rank medal / number */}
                        <div
                          className={`grid place-items-center w-10 h-10 sm:w-11 sm:h-11 rounded-md shrink-0 ${
                            isTop3
                              ? `bg-gradient-to-br ${medal.bg} ${medal.glow} text-white`
                              : "bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-white/10"
                          }`}
                        >
                          {isTop3 ? (
                            <medal.icon className="w-5 h-5" />
                          ) : (
                            <span className="font-display tracking-wider text-lg leading-none">
                              {player.rank}
                            </span>
                          )}
                        </div>

                        <Avatar className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 ring-2 ring-slate-200 dark:ring-white/10">
                          <AvatarImage src={player.profilePicture} />
                          <AvatarFallback className="bg-slate-300 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-bold">
                            {(player.nickname?.[0] || player.username[0]).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold truncate text-sm sm:text-base text-slate-900 dark:text-white">
                              {player.nickname || player.username}
                            </span>
                            {player.vipLevel > 0 && (
                              <Badge className="bg-gradient-to-r from-brand-gold to-[#a86b00] text-black border-0 text-[10px] px-1.5 h-4 gap-0.5">
                                <Star className="w-2.5 h-2.5" />
                                VIP
                              </Badge>
                            )}
                            {isCurrentUser && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 px-1.5 border-brand-blue/50 text-brand-blue"
                              >
                                {t("common.you")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {formatNumber(player.gamesPlayed, language)} {t("leaderboard.games")}
                            </span>
                            <span className="hidden sm:inline">
                              {player.winRate}% {t("leaderboard.winRate")}
                            </span>
                          </div>
                        </div>

                        {/* Sort metric */}
                        <div className="text-end shrink-0 min-w-[64px]">
                          {sortBy === "wins" && (
                            <div className="flex items-center justify-end gap-1 text-brand-blue font-bold">
                              <Trophy className="w-4 h-4" />
                              <span className="font-display tracking-wider text-lg leading-none">
                                {formatNumber(
                                  gameType !== "all" ? player.gameWon || 0 : player.gamesWon,
                                  language,
                                )}
                              </span>
                            </div>
                          )}
                          {sortBy === "earnings" && (
                            <div className="flex items-center justify-end gap-1 text-brand-gold font-bold">
                              <DollarSign className="w-4 h-4" />
                              <span className="font-display tracking-wider text-lg leading-none">
                                {formatNumber(player.totalEarnings, language)}
                              </span>
                            </div>
                          )}
                          {sortBy === "streak" && (
                            <div className="flex items-center justify-end gap-1 text-rose-500 font-bold">
                              <Flame className="w-4 h-4" />
                              <span className="font-display tracking-wider text-lg leading-none">
                                {formatNumber(player.longestWinStreak, language)}
                              </span>
                            </div>
                          )}
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <div className="grid place-items-center w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-white/5">
                  <Users className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-base font-medium text-slate-700 dark:text-slate-300">
                  {t("leaderboard.noPlayers")}
                </p>
                <p className="text-sm mt-1">{t("leaderboard.beFirst")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
