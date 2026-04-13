import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
  ChevronRight
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

const RANK_MEDALS = [
  { bg: 'bg-gradient-to-br from-amber-400 to-amber-600', icon: Crown, size: 'w-8 h-8' },
  { bg: 'bg-gradient-to-br from-gray-300 to-gray-500', icon: Medal, size: 'w-7 h-7' },
  { bg: 'bg-gradient-to-br from-amber-600 to-amber-800', icon: Medal, size: 'w-6 h-6' },
];

export default function LeaderboardPage() {
  const { t, language, dir } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [sortBy, setSortBy] = useState<string>('wins');
  const [gameType, setGameType] = useState<string>('all');
  const [timePeriod, setTimePeriod] = useState<string>('all');

  const { data: leaderboard, isLoading, isError, error, refetch } = useQuery<LeaderboardPlayer[]>({
    queryKey: ['/api/leaderboard', { sortBy, gameType: gameType === 'all' ? undefined : gameType, period: timePeriod === 'all' ? undefined : timePeriod }],
  });

  const { data: myRank } = useQuery<{ rank: number; sortBy: string }>({
    queryKey: ['/api/me/rank', { sortBy }],
  });

  const { data: apiGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ['/api/multiplayer-games'],
    staleTime: 60000,
  });

  const GAME_CONFIG = useMemo(() => buildGameConfigWithAll(apiGames), [apiGames]);

  const formatNumber = (num: number | string) => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    return new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US').format(n);
  };

  return (
    <div className="container max-w-4xl mx-auto min-h-[100svh] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_45%)] p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 sm:space-y-6" dir={dir}>
      <div className="flex items-center gap-4">
        <BackButton />
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-500" />
          {t('leaderboard.title')}
        </h1>
      </div>

      {myRank && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/20">
                  <Medal className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('leaderboard.yourRank')}</p>
                  <p className="text-2xl font-bold text-primary">#{myRank.rank}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto min-h-[40px]"
                onClick={() => navigate('/profile')}
                data-testid="button-view-profile"
              >
                {t('leaderboard.viewProfile')}
                <ChevronRight className="w-4 h-4 ms-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <Select value={gameType} onValueChange={setGameType}>
          <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-game-type">
            <SelectValue placeholder={t('leaderboard.selectGame')} />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GAME_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    {config.iconUrl ? (
                      <div className="h-4 w-4 rounded-sm bg-muted/60 p-0.5">
                        <img src={config.iconUrl} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" />
                      </div>
                    ) : (
                      <Icon className={`w-4 h-4 ${config.color}`} />
                    )}
                    {language === 'ar' ? config.nameAr : config.name}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select value={timePeriod} onValueChange={setTimePeriod}>
          <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-time-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t('leaderboard.allTime')}
            </SelectItem>
            <SelectItem value="weekly">
              {t('leaderboard.thisWeek')}
            </SelectItem>
            <SelectItem value="monthly">
              {t('leaderboard.thisMonth')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={sortBy} onValueChange={setSortBy} className="w-full">
        <TabsList className="grid w-full grid-cols-3 gap-1 h-auto p-1">
          <TabsTrigger className="text-xs sm:text-sm" value="wins" data-testid="tab-wins">
            <Trophy className="w-4 h-4 me-2" />
            <span className="hidden sm:inline">{t('leaderboard.byWins')}</span>
          </TabsTrigger>
          <TabsTrigger className="text-xs sm:text-sm" value="earnings" data-testid="tab-earnings">
            <DollarSign className="w-4 h-4 me-2" />
            <span className="hidden sm:inline">{t('leaderboard.byEarnings')}</span>
          </TabsTrigger>
          <TabsTrigger className="text-xs sm:text-sm" value="streak" data-testid="tab-streak">
            <Flame className="w-4 h-4 me-2" />
            <span className="hidden sm:inline">{t('leaderboard.byStreak')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={sortBy} className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {t('leaderboard.topPlayers')}
                </span>
                <Badge variant="secondary">{leaderboard?.length || 0} {t('leaderboard.players')}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={5} columns={5} />
              ) : isError ? (
                <QueryErrorState error={error} onRetry={() => refetch()} compact />
              ) : leaderboard && leaderboard.length > 0 ? (
                <ScrollArea className="h-[60svh] sm:h-[500px]">
                  <div className="space-y-2">
                    {leaderboard.map((player, index) => {
                      const isCurrentUser = player.id === user?.id;
                      const isTop3 = index < 3;
                      const medal = RANK_MEDALS[index];

                      return (
                        <div
                          key={player.id}
                          className={`flex items-center gap-2 sm:gap-4 p-3 rounded-lg transition-all hover-elevate cursor-pointer ${isCurrentUser ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                            }`}
                          onClick={() => navigate(`/player/${player.id}`)}
                          data-testid={`row-player-${player.id}`}
                        >
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${isTop3 ? medal.bg : 'bg-muted'
                            }`}>
                            {isTop3 ? (
                              <medal.icon className={`${medal.size} text-white`} />
                            ) : (
                              <span className="font-bold text-muted-foreground">
                                {player.rank}
                              </span>
                            )}
                          </div>

                          <Avatar className="w-9 h-9 sm:w-10 sm:h-10 shrink-0">
                            <AvatarImage src={player.profilePicture} />
                            <AvatarFallback>
                              {player.nickname?.[0] || player.username[0]}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate text-sm sm:text-base">
                                {player.nickname || player.username}
                              </span>
                              {player.vipLevel > 0 && (
                                <Badge className="bg-gradient-to-r from-amber-500 to-amber-600 text-xs px-1.5">
                                  <Star className="w-3 h-3" />
                                </Badge>
                              )}
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-xs">
                                  {t('common.you')}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                              <span>{player.gamesPlayed} {t('leaderboard.games')}</span>
                              <span className="hidden sm:inline">{player.winRate}% {t('leaderboard.winRate')}</span>
                            </div>
                          </div>

                          <div className="text-end shrink-0">
                            {sortBy === 'wins' && (
                              <div className="flex items-center gap-1 text-primary font-bold">
                                <Trophy className="w-4 h-4" />
                                {formatNumber(gameType !== 'all' ? (player.gameWon || 0) : player.gamesWon)}
                              </div>
                            )}
                            {sortBy === 'earnings' && (
                              <div className="flex items-center gap-1 text-green-500 font-bold">
                                <DollarSign className="w-4 h-4" />
                                {formatNumber(player.totalEarnings)}
                              </div>
                            )}
                            {sortBy === 'streak' && (
                              <div className="flex items-center gap-1 text-orange-500 font-bold">
                                <Flame className="w-4 h-4" />
                                {player.longestWinStreak}
                              </div>
                            )}
                          </div>

                          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">{t('leaderboard.noPlayers')}</p>
                  <p className="text-sm mt-1">{t('leaderboard.beFirst')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
