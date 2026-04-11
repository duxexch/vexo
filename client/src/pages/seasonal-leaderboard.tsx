import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { BackButton } from "@/components/BackButton";
import { useLocation } from "wouter";
import {
  Trophy,
  Medal,
  Crown,
  Target,
  Flame,
  Calendar,
  Clock,
  DollarSign,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface Season {
  id: string;
  number: number;
  name: string;
  nameAr: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'ended' | 'archived';
}

interface SeasonalLeaderboardEntry {
  rank: number;
  userId: string;
  seasonId: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  totalEarnings: string;
  currentWinStreak: number;
  longestWinStreak: number;
  winRate: number;
  user: {
    id: string;
    username: string;
    nickname?: string;
    profilePicture?: string;
  };
}

interface SeasonLeaderboardResponse {
  season: Season;
  leaderboard: SeasonalLeaderboardEntry[];
}

const RANK_ICONS = [Crown, Medal, Trophy];
const RANK_COLORS = ['text-amber-500', 'text-gray-400', 'text-amber-700'];

export default function SeasonalLeaderboardPage() {
  const { t, language, dir } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const locale = language === 'ar' ? 'ar-SA' : 'en-US';
  const preferredCurrency = typeof user?.balanceCurrency === 'string' && user.balanceCurrency.trim().length > 0
    ? user.balanceCurrency.trim().toUpperCase()
    : 'USD';

  const { data: seasons, isLoading: seasonsLoading } = useQuery<Season[]>({
    queryKey: ['/api/seasons'],
  });

  const { data: activeSeason } = useQuery<Season>({
    queryKey: ['/api/seasons/active'],
  });

  const effectiveSeasonId = selectedSeasonId || activeSeason?.id || '';

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<SeasonLeaderboardResponse>({
    queryKey: ['/api/seasons', effectiveSeasonId, 'leaderboard'],
    enabled: !!effectiveSeasonId,
  });

  const { data: myStats } = useQuery<{
    gamesPlayed: number;
    gamesWon: number;
    totalEarnings: string;
    longestWinStreak: number;
  }>({
    queryKey: ['/api/me/seasons', effectiveSeasonId, 'stats'],
    enabled: !!effectiveSeasonId && !!user,
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number | string) => {
    const parsed = typeof amount === 'string' ? Number(amount) : amount;
    const safeAmount = Number.isFinite(parsed) ? parsed : 0;
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: preferredCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch {
      return `${preferredCurrency} ${safeAmount.toFixed(2)}`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'upcoming': return 'bg-blue-500';
      case 'ended': return 'bg-gray-500';
      default: return 'bg-muted';
    }
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  if (seasonsLoading) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-6" dir={dir}>
        <div className="flex items-center gap-4">
          <BackButton />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const currentSeason = leaderboardData?.season || activeSeason;

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6" dir={dir}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <BackButton />
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {t('seasons.leaderboard')}
          </h1>
        </div>

        <Select value={effectiveSeasonId} onValueChange={setSelectedSeasonId}>
          <SelectTrigger className="w-[200px]" data-testid="select-season">
            <SelectValue placeholder={t('seasons.selectSeason')} />
          </SelectTrigger>
          <SelectContent>
            {seasons?.map((season) => (
              <SelectItem key={season.id} value={season.id}>
                <span className="flex items-center gap-2">
                  {language === 'ar' ? season.nameAr : season.name}
                  {season.status === 'active' && (
                    <Sparkles className="w-3 h-3 text-primary" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {currentSeason && (
        <Card className="overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-primary to-primary/50" />
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">
                    {language === 'ar' ? currentSeason.nameAr : currentSeason.name}
                  </h2>
                  <Badge className={getStatusColor(currentSeason.status)}>
                    {t(`seasons.status.${currentSeason.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {formatDate(currentSeason.startDate)} - {formatDate(currentSeason.endDate)}
                </p>
              </div>

              {currentSeason.status === 'active' && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    {getDaysRemaining(currentSeason.endDate)} {t('seasons.daysRemaining')}
                  </span>
                </div>
              )}
            </div>

            {myStats && myStats.gamesPlayed > 0 && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-medium mb-3">{t('seasons.yourStats')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {myStats.gamesWon}
                    </div>
                    <div className="text-xs text-muted-foreground">{t('profile.wins')}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {myStats.gamesPlayed > 0
                        ? Math.round((myStats.gamesWon / myStats.gamesPlayed) * 100)
                        : 0}%
                    </div>
                    <div className="text-xs text-muted-foreground">{t('profile.winRate')}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-500">
                      {myStats.longestWinStreak}
                    </div>
                    <div className="text-xs text-muted-foreground">{t('profile.streak')}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-500">
                      {formatCurrency(myStats.totalEarnings || '0')}
                    </div>
                    <div className="text-xs text-muted-foreground">{t('profile.earnings')}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="w-5 h-5" />
            {t('seasons.topPlayers')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboardLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : leaderboardData?.leaderboard.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('seasons.noPlayers')}</p>
              <p className="text-sm mt-2">{t('seasons.beFirst')}</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {leaderboardData?.leaderboard.map((entry) => {
                  const RankIcon = entry.rank <= 3 ? RANK_ICONS[entry.rank - 1] : null;
                  const rankColor = entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : '';
                  const isCurrentUser = entry.user.id === user?.id;

                  return (
                    <div
                      key={entry.userId}
                      className={`flex items-center gap-4 p-4 rounded-lg transition-colors hover-elevate cursor-pointer ${isCurrentUser ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
                        }`}
                      onClick={() => navigate(`/player/${entry.user.id}`)}
                      data-testid={`leaderboard-entry-${entry.rank}`}
                    >
                      <div className="w-10 text-center">
                        {RankIcon ? (
                          <RankIcon className={`w-6 h-6 mx-auto ${rankColor}`} />
                        ) : (
                          <span className="text-lg font-bold text-muted-foreground">
                            #{entry.rank}
                          </span>
                        )}
                      </div>

                      <Avatar className="h-10 w-10">
                        <AvatarImage src={entry.user.profilePicture || undefined} />
                        <AvatarFallback>
                          {(entry.user.nickname || entry.user.username)[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {entry.user.nickname || entry.user.username}
                          {isCurrentUser && (
                            <Badge variant="outline" className="ms-2 text-xs">
                              {t('common.you')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Trophy className="w-3 h-3" />
                            {entry.gamesWon} {t('seasons.wins')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {entry.winRate}%
                          </span>
                          <span className="flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            {entry.longestWinStreak}
                          </span>
                        </div>
                      </div>

                      <div className="text-end">
                        <div className="flex items-center gap-1 text-green-500 font-medium">
                          <DollarSign className="w-4 h-4" />
                          {formatCurrency(entry.totalEarnings)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.gamesPlayed} {t('seasons.games')}
                        </div>
                      </div>

                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => navigate('/leaderboard')}
          data-testid="button-view-alltime"
        >
          {t('seasons.viewAllTime')}
        </Button>
      </div>
    </div>
  );
}
