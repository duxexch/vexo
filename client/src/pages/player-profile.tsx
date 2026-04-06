import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import AchievementBadges from "@/components/AchievementBadges";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/BackButton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Trophy,
  Target,
  Flame,
  TrendingUp,
  Crown,
  Gem,
  Shuffle,
  Clock,
  DollarSign,
  Gamepad2,
  Medal,
  Star,
  Calendar,
  User,
  ChevronRight,
  Award,
  Ban,
  VolumeX,
  Volume2,
  UserCheck,
  Swords,
  UserPlus,
  MessageCircle
} from "lucide-react";

interface GameStats {
  game: string;
  played: number;
  won: number;
  winRate: number;
}

interface PlayerStats {
  id: string;
  username: string;
  nickname?: string;
  profilePicture?: string;
  coverPhoto?: string;
  vipLevel: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  totalEarnings: string;
  totalWagered: string;
  totalWon: string;
  currentWinStreak: number;
  longestWinStreak: number;
  winRate: number;
  gameStats: GameStats[];
  createdAt: string;
}

interface MatchHistoryItem {
  id: string;
  gameType: string;
  status: string;
  player1Id: string;
  player2Id?: string;
  player1Score: number;
  player2Score: number;
  winnerId?: string;
  startedAt?: string;
  endedAt?: string;
  isWinner: boolean;
  result: 'win' | 'loss' | 'draw';
}

interface MultiplayerGameFromAPI {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
}

const GAME_ICONS: Record<string, { icon: typeof Crown; color: string }> = {
  chess: { icon: Crown, color: 'text-amber-500' },
  domino: { icon: Target, color: 'text-blue-500' },
  backgammon: { icon: Shuffle, color: 'text-emerald-500' },
  tarneeb: { icon: Gem, color: 'text-purple-500' },
  baloot: { icon: Gem, color: 'text-rose-500' },
};

const DEFAULT_GAME_STYLE = { icon: Gamepad2, color: 'text-gray-500' };

const FALLBACK_GAME_CONFIG: Record<string, { name: string; nameAr: string; icon: typeof Crown; color: string }> = {
  chess: { name: 'Chess', nameAr: 'شطرنج', icon: Crown, color: 'text-amber-500' },
  domino: { name: 'Domino', nameAr: 'دومينو', icon: Target, color: 'text-blue-500' },
  backgammon: { name: 'Backgammon', nameAr: 'طاولة', icon: Shuffle, color: 'text-emerald-500' },
  tarneeb: { name: 'Tarneeb', nameAr: 'طرنيب', icon: Gem, color: 'text-purple-500' },
  baloot: { name: 'Baloot', nameAr: 'بلوت', icon: Gem, color: 'text-rose-500' },
};

function buildGameConfig(apiGames: MultiplayerGameFromAPI[]): Record<string, { name: string; nameAr: string; icon: typeof Crown; color: string }> {
  if (!apiGames || apiGames.length === 0) {
    return FALLBACK_GAME_CONFIG;
  }
  const config: Record<string, { name: string; nameAr: string; icon: typeof Crown; color: string }> = {};
  for (const game of apiGames) {
    const iconStyle = GAME_ICONS[game.key] || DEFAULT_GAME_STYLE;
    config[game.key] = {
      name: game.nameEn,
      nameAr: game.nameAr,
      icon: iconStyle.icon,
      color: iconStyle.color,
    };
  }
  return config;
}

const VIP_COLORS = [
  'from-gray-500 to-gray-600',
  'from-green-500 to-green-600',
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
];

export default function PlayerProfilePage() {
  const { t, language, dir } = useI18n();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute('/player/:userId');
  const [, navigate] = useLocation();

  const userId = params?.userId || user?.id;
  const isOwnProfile = userId === user?.id;

  const { data: stats, isLoading: statsLoading } = useQuery<PlayerStats>({
    queryKey: isOwnProfile ? ['/api/me/stats'] : ['/api/player', userId, 'stats'],
    enabled: !!userId,
  });

  const { data: matches, isLoading: matchesLoading } = useQuery<MatchHistoryItem[]>({
    queryKey: ['/api/player', userId, 'matches'],
    enabled: !!userId,
  });

  const { data: rankData } = useQuery<{ rank: number; sortBy: string }>({
    queryKey: ['/api/me/rank'],
    enabled: isOwnProfile,
  });

  const { data: apiGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ['/api/multiplayer-games'],
    staleTime: 60000,
  });

  const GAME_CONFIG = useMemo(() => buildGameConfig(apiGames), [apiGames]);

  const isBlocked = user?.blockedUsers?.includes(userId || '') || false;
  const isMuted = user?.mutedUsers?.includes(userId || '') || false;

  const blockMutation = useMutation({
    mutationFn: (action: 'block' | 'unblock') =>
      apiRequest(
        action === 'block' ? 'POST' : 'DELETE',
        `/api/users/${userId}/block`
      ),
    onSuccess: (_, action) => {
      toast({
        title: t(action === 'block' ? 'chat.blockSuccess' : 'chat.unblockSuccess'),
      });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  });

  const muteMutation = useMutation({
    mutationFn: (action: 'mute' | 'unmute') =>
      apiRequest(
        action === 'mute' ? 'POST' : 'DELETE',
        `/api/users/${userId}/mute`
      ),
    onSuccess: (_, action) => {
      toast({
        title: t(action === 'mute' ? 'chat.muteSuccess' : 'chat.unmuteSuccess'),
      });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  });

  if (statsLoading) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-6" dir={dir}>
        <div className="flex items-center gap-4">
          <BackButton />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="w-20 h-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container max-w-4xl mx-auto p-4" dir={dir}>
        <div className="flex items-center gap-4 mb-6">
          <BackButton />
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('profile.notFound')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatNumber = (num: number | string) => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    return new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US').format(n);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6" dir={dir}>
      <div className="flex items-center gap-4">
        <BackButton />
        <h1 className="text-2xl font-bold">{isOwnProfile ? t('profile.myProfile') : t('profile.title')}</h1>
      </div>

      <Card className="overflow-hidden">
        <div
          className="h-48 relative"
          style={{
            background: stats.coverPhoto
              ? `url(${stats.coverPhoto}) center/cover no-repeat`
              : `linear-gradient(to right, ${VIP_COLORS[Math.min(stats.vipLevel, VIP_COLORS.length - 1)].replace('from-', '').replace(' to-', ', ')})`
          }}
        >
          {!stats.coverPhoto && (
            <div className={`absolute inset-0 bg-gradient-to-r ${VIP_COLORS[Math.min(stats.vipLevel, VIP_COLORS.length - 1)]}`} />
          )}
        </div>
        <CardContent className="relative pt-0 pb-6 px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-16">
            <Avatar className="w-32 h-32 border-4 border-background shadow-lg">
              <AvatarImage src={stats.profilePicture} />
              <AvatarFallback className="text-3xl bg-muted">
                {stats.nickname?.[0] || stats.username[0]}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 pt-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold">{stats.nickname || stats.username}</h2>
                {stats.vipLevel > 0 && (
                  <Badge className="bg-gradient-to-r from-amber-500 to-amber-600">
                    <Star className="w-3 h-3 me-1" /> VIP {stats.vipLevel}
                  </Badge>
                )}
                {rankData && rankData.rank > 0 && (
                  <Badge variant="outline" className="border-primary text-primary">
                    <Medal className="w-3 h-3 me-1" /> #{rankData.rank}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="w-4 h-4" />
                {t('profile.memberSince')} {formatDate(stats.createdAt)}
              </p>
            </div>

            {!isOwnProfile && user && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  className="bg-gradient-to-r from-primary to-primary/80"
                  onClick={() => navigate(`/challenges?opponent=${userId}`)}
                  data-testid="button-challenge-player"
                >
                  <Swords className="w-4 h-4 me-2" />
                  {language === 'ar' ? 'تحدّي' : 'Challenge'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/chat?user=${userId}`)}
                  data-testid="button-message-player"
                >
                  <MessageCircle className="w-4 h-4 me-2" />
                  {language === 'ar' ? 'رسالة' : 'Message'}
                </Button>
                <Button
                  variant={isBlocked ? "default" : "outline"}
                  size="default"
                  onClick={() => blockMutation.mutate(isBlocked ? 'unblock' : 'block')}
                  disabled={blockMutation.isPending}
                  data-testid="button-block-user"
                >
                  {isBlocked ? (
                    <>
                      <UserCheck className="w-4 h-4 me-2" />
                      {t('profile.unblockUser')}
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 me-2" />
                      {t('profile.blockUser')}
                    </>
                  )}
                </Button>
                <Button
                  variant={isMuted ? "default" : "outline"}
                  size="default"
                  onClick={() => muteMutation.mutate(isMuted ? 'unmute' : 'mute')}
                  disabled={muteMutation.isPending}
                  data-testid="button-mute-user"
                >
                  {isMuted ? (
                    <>
                      <Volume2 className="w-4 h-4 me-2" />
                      {t('profile.unmuteUser')}
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4 me-2" />
                      {t('profile.muteUser')}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-4 text-center">
            <Gamepad2 className="w-8 h-8 mx-auto text-indigo-500 mb-2" />
            <div className="text-2xl font-bold">{formatNumber(stats.gamesPlayed)}</div>
            <div className="text-sm text-muted-foreground">{language === 'ar' ? 'مباريات' : 'Games'}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 text-center">
            <Trophy className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <div className="text-2xl font-bold text-primary">{formatNumber(stats.gamesWon)}</div>
            <div className="text-sm text-muted-foreground">{t('profile.wins')}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 text-center">
            <Target className="w-8 h-8 mx-auto text-blue-500 mb-2" />
            <div className="text-2xl font-bold">{stats.winRate}%</div>
            <div className="text-sm text-muted-foreground">{t('profile.winRate')}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 text-center">
            <Flame className="w-8 h-8 mx-auto text-orange-500 mb-2" />
            <div className="text-2xl font-bold">{stats.currentWinStreak}</div>
            <div className="text-sm text-muted-foreground">{t('profile.streak')}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 mx-auto text-green-500 mb-2" />
            <div className="text-2xl font-bold">${formatNumber(stats.totalEarnings)}</div>
            <div className="text-sm text-muted-foreground">{t('profile.earnings')}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full grid-cols-3 gap-1">
          <TabsTrigger value="stats" data-testid="tab-stats">
            <TrendingUp className="w-4 h-4 me-2" />
            {t('profile.gameStats')}
          </TabsTrigger>
          <TabsTrigger value="achievements" data-testid="tab-achievements">
            <Award className="w-4 h-4 me-2" />
            {t('profile.achievements')}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="w-4 h-4 me-2" />
            {t('profile.matchHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5" />
                {t('profile.gameBreakdown')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.gameStats.map((game) => {
                const config = GAME_CONFIG[game.game] || GAME_CONFIG.chess;
                const Icon = config.icon;

                return (
                  <div key={game.game} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${config.color}`} />
                        <span className="font-medium">
                          {language === 'ar' ? config.nameAr : config.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{game.played} {t('profile.played')}</span>
                        <span className="text-primary">{game.won} {t('profile.won')}</span>
                        <span>{game.winRate}%</span>
                      </div>
                    </div>
                    <Progress value={game.winRate} className="h-2" />
                  </div>
                );
              })}

              {stats.gameStats.every(g => g.played === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Gamepad2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{t('profile.noGamesYet')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="mt-4">
          <AchievementBadges stats={stats} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {t('profile.recentMatches')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {matchesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : matches && matches.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {matches.map((match) => {
                      const config = GAME_CONFIG[match.gameType] || GAME_CONFIG.chess;
                      const Icon = config.icon;

                      return (
                        <div
                          key={match.id}
                          className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover-elevate"
                          data-testid={`row-match-${match.id}`}
                        >
                          <div className={`p-2 rounded-lg ${match.result === 'win' ? 'bg-green-500/20' :
                              match.result === 'loss' ? 'bg-red-500/20' : 'bg-gray-500/20'
                            }`}>
                            <Icon className={`w-5 h-5 ${config.color}`} />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {language === 'ar' ? config.nameAr : config.name}
                              </span>
                              <Badge className={
                                match.result === 'win' ? 'bg-green-500' :
                                  match.result === 'loss' ? 'bg-red-500' : 'bg-gray-500'
                              }>
                                {t(`profile.${match.result}`)}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {match.player1Score} - {match.player2Score}
                              {match.endedAt && ` • ${formatDate(match.endedAt)}`}
                            </div>
                          </div>

                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{t('profile.noMatches')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
