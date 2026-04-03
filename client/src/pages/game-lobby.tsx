import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { GameCardSkeletonGrid } from "@/components/skeletons";
import { QueryErrorState } from "@/components/QueryErrorState";
import {
  Gamepad2,
  Users,
  Shuffle,
  Clock,
  Coins,
  Play,
  Search,
  Target,
  Crown,
  Gem,
  Zap,
  Eye,
  TrendingUp,
  RefreshCw,
  Loader2,
  Sparkles,
  Flame,
  User,
  X,
  Gift
} from "lucide-react";
import { type GameConfigItem, type MultiplayerGameFromAPI, buildGameConfig, DEFAULT_GAME_STYLE } from "@/lib/game-config";

interface Challenge {
  id: string;
  gameType: string;
  betAmount: number;
  currencyType?: 'project' | 'usd';
  visibility: 'public' | 'private';
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  player1Id: string;
  player1Name: string;
  player1Rating?: { wins: number; losses: number; winRate: number; rank: string };
  player2Id?: string;
  player2Name?: string;
  player2Rating?: { wins: number; losses: number; winRate: number; rank: string };
  spectatorCount?: number;
  totalBets?: number;
  createdAt: string;
  startedAt?: string;
}


const RANK_COLORS: Record<string, string> = {
  bronze: "bg-amber-700/20 text-amber-600 border-amber-700/30",
  silver: "bg-gray-400/20 text-gray-400 border-gray-400/30",
  gold: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  platinum: "bg-cyan-400/20 text-cyan-400 border-cyan-400/30",
  diamond: "bg-purple-400/20 text-purple-400 border-purple-400/30",
};

const STAKE_PRESETS = [
  { key: 'all', min: 0, max: 10000 },
  { key: 'low', min: 0, max: 50 },
  { key: 'medium', min: 50, max: 200 },
  { key: 'high', min: 200, max: 10000 },
];

const LOBBY_PREFS_KEY = 'vex_lobby_preferences';

interface LobbyPreferences {
  selectedGame: string | null;
  stakePreset: string;
  defaultTab: string;
}

function loadPreferences(): LobbyPreferences {
  try {
    const stored = localStorage.getItem(LOBBY_PREFS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load lobby preferences:', e);
  }
  return { selectedGame: null, stakePreset: 'all', defaultTab: 'open' };
}

function savePreferences(prefs: Partial<LobbyPreferences>) {
  try {
    const current = loadPreferences();
    localStorage.setItem(LOBBY_PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch (e) {
    console.warn('Failed to save lobby preferences:', e);
  }
}

function formatChallengeAmountText(amount: number | string | undefined, currencyType: Challenge['currencyType']): string {
  const safeAmount = Number(amount || 0);
  return currencyType === 'project' ? `${safeAmount.toFixed(2)} VXC` : `$${safeAmount.toFixed(2)}`;
}

interface ChallengeRowProps {
  challenge: Challenge;
  type: 'yours' | 'open' | 'live';
  isNew: boolean;
  language: string;
  onJoin: (id: string) => void;
  onWatch: (id: string) => void;
  onResume: (id: string) => void;
  isJoining: boolean;
  t: (key: string) => string;
  gameConfig: Record<string, GameConfigItem>;
}

const ChallengeRow = memo(function ChallengeRow({
  challenge,
  type,
  isNew,
  language,
  onJoin,
  onWatch,
  onResume,
  isJoining,
  t,
  gameConfig
}: ChallengeRowProps) {
  const fallbackConfig = { name: challenge.gameType, nameAr: challenge.gameType, icon: Gamepad2, color: DEFAULT_GAME_STYLE.color, gradient: DEFAULT_GAME_STYLE.gradient };
  const config = gameConfig[challenge.gameType] || fallbackConfig;
  const Icon = config.icon;

  return (
    <div
      className={`relative flex items-center gap-4 p-4 rounded-lg bg-card/50 hover-elevate transition-all ${isNew ? 'ring-2 ring-primary' : ''}`}
      data-testid={`row-challenge-${challenge.id}`}
    >
      {isNew && (
        <Badge className="absolute -top-2 -end-2 bg-primary text-xs px-1.5 z-10">{t('lobby.new')}</Badge>
      )}

      <div className={`p-2 rounded-lg ${config.color} border shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{challenge.player1Name}</span>
          {challenge.player1Rating && (
            <Badge variant="outline" className={`text-xs ${RANK_COLORS[challenge.player1Rating.rank] || ''}`}>
              {challenge.player1Rating.rank}
            </Badge>
          )}
          {type === 'live' && challenge.player2Name && (
            <>
              <span className="text-muted-foreground">vs</span>
              <span className="font-medium truncate">{challenge.player2Name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {language === 'ar' ? config.nameAr : config.name}
          </Badge>
          <span className="flex items-center gap-1">
            <Coins className="w-3 h-3 text-yellow-500" />
            {formatChallengeAmountText(challenge.betAmount, challenge.currencyType)}
          </span>
          {challenge.player1Rating && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {challenge.player1Rating.winRate}%
            </span>
          )}
          {type === 'live' && challenge.spectatorCount !== undefined && challenge.spectatorCount > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {challenge.spectatorCount}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {type === 'yours' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResume(challenge.id)}
            data-testid={`button-resume-${challenge.id}`}
          >
            <Clock className="w-4 h-4 me-1" />
            {t('lobby.waiting')}
          </Button>
        )}
        {type === 'open' && (
          <Button
            size="sm"
            onClick={() => onJoin(challenge.id)}
            disabled={isJoining}
            data-testid={`button-join-${challenge.id}`}
          >
            {isJoining ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Play className="w-4 h-4 me-1" />
                {t('lobby.join')}
              </>
            )}
          </Button>
        )}
        {type === 'live' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onWatch(challenge.id)}
            data-testid={`button-watch-${challenge.id}`}
          >
            <Eye className="w-4 h-4 me-1" />
            {t('lobby.watch')}
          </Button>
        )}
      </div>
    </div>
  );
});

interface GameCardProps {
  gameType: string;
  config: GameConfigItem;
  isSelected: boolean;
  waitingCount: number;
  liveCount: number;
  isTrending: boolean;
  language: string;
  onSelect: (gameType: string) => void;
  onQuickMatch: (gameType: string) => void;
  t: (key: string) => string;
}

const GameCard = memo(function GameCard({
  gameType,
  config,
  isSelected,
  waitingCount,
  liveCount,
  isTrending,
  language,
  onSelect,
  onQuickMatch,
  t
}: GameCardProps) {
  const Icon = config.icon;

  return (
    <Card
      className={`hover-elevate cursor-pointer transition-all overflow-hidden ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => onSelect(gameType)}
      data-testid={`card-game-${gameType}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-50`} />
      <CardContent className="p-3 sm:p-4 relative">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className={`p-2.5 sm:p-3 rounded-lg ${config.color} border shrink-0`}>
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {isTrending && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0" data-testid={`badge-trending-${gameType}`}>
                  <Flame className="w-3 h-3 me-1" />
                  <span className="hidden sm:inline">{t('lobby.trending')}</span>
                </Badge>
              )}
              {liveCount > 0 && (
                <Badge variant="destructive" className="text-[10px] sm:text-xs shrink-0">
                  <div className="w-2 h-2 rounded-full bg-destructive-foreground me-1 animate-pulse" />
                  {liveCount} {t('lobby.live')}
                </Badge>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-base truncate">{language === 'ar' ? config.nameAr : config.name}</h3>
            <div className="mt-2">
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                <Users className="w-3 h-3 me-1" />
                {waitingCount}
              </Badge>
            </div>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={(e) => { e.stopPropagation(); onQuickMatch(gameType); }}
            data-testid={`button-quickmatch-${gameType}`}
          >
            <Zap className="w-4 h-4" />
            <span className="ms-1">{t('lobby.quickMatch')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export default function GameLobbyPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const savedPrefs = useMemo(() => loadPreferences(), []);

  const [selectedGame, setSelectedGame] = useState<string | null>(savedPrefs.selectedGame);
  const [searchQuery, setSearchQuery] = useState("");
  const [stakePreset, setStakePreset] = useState(savedPrefs.stakePreset);
  const [betRange, setBetRange] = useState<[number, number]>(() => {
    const preset = STAKE_PRESETS.find(p => p.key === savedPrefs.stakePreset);
    return preset ? [preset.min, preset.max] : [0, 10000];
  });
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [quickMatchGame, setQuickMatchGame] = useState<string | null>(null);
  const [quickMatchBet, setQuickMatchBet] = useState(50);
  const [isSearching, setIsSearching] = useState(false);
  const [newMatchIds, setNewMatchIds] = useState<Set<string>>(new Set());
  const prevAvailableRef = useRef<string[]>([]);

  const { data: availableChallenges = [], isLoading: loadingAvailable, isError: isErrorAvailable, error: errorAvailable, refetch: refetchAvailable } = useQuery<Challenge[]>({
    queryKey: ['/api/challenges/available'],
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const { data: liveChallenges = [], isLoading: loadingLive, isError: isErrorLive, error: errorLive, refetch: refetchLive } = useQuery<Challenge[]>({
    queryKey: ['/api/challenges/public'],
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const { data: apiGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ['/api/multiplayer-games'],
    staleTime: 60000, // Cache for 1 minute
  });

  const GAME_CONFIG = useMemo(() => buildGameConfig(apiGames), [apiGames]);

  useEffect(() => {
    const currentIds = availableChallenges.map(c => c.id);
    const prevIds = prevAvailableRef.current;
    const newIds = currentIds.filter(id => !prevIds.includes(id));

    if (newIds.length > 0 && prevIds.length > 0) {
      setNewMatchIds(new Set(newIds));
      const timer = setTimeout(() => setNewMatchIds(new Set()), 3000);
      return () => clearTimeout(timer);
    }
    prevAvailableRef.current = currentIds;
  }, [availableChallenges]);

  useEffect(() => {
    savePreferences({ selectedGame, stakePreset });
  }, [selectedGame, stakePreset]);

  const joinChallengeMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      return apiRequest('POST', `/api/challenges/${challengeId}/join`);
    },
    onSuccess: async (res: Response) => {
      toast({ title: t('lobby.joinedChallenge'), description: t('lobby.gameStarting') });
      queryClient.invalidateQueries({ queryKey: ['/api/challenges/available'] });
      queryClient.invalidateQueries({ queryKey: ['/api/challenges/public'] });
      const data = typeof res?.json === 'function' ? await res.json() : res;
      navigate(`/challenge/${data.id}/play`);
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const createChallengeMutation = useMutation({
    mutationFn: async (data: { gameType: string; betAmount: number }) => {
      return apiRequest('POST', '/api/challenges', {
        ...data,
        visibility: 'public',
        opponentType: 'random',
      });
    },
    onSuccess: async (res: Response) => {
      toast({ title: t('lobby.challengeCreated'), description: t('lobby.waitingForOpponent') });
      queryClient.invalidateQueries({ queryKey: ['/api/challenges/available'] });
      queryClient.invalidateQueries({ queryKey: ['/api/challenges/public'] });
      setShowQuickMatch(false);
      setIsSearching(true);
      const data = typeof res?.json === 'function' ? await res.json() : res;
      setTimeout(() => {
        navigate(`/challenge/${data.id}/play`);
      }, 1000);
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const yourChallenges = useMemo(() =>
    availableChallenges.filter((c: Challenge) =>
      c.player1Id === user?.id && c.status === 'waiting'
    ),
    [availableChallenges, user?.id]
  );

  const openMatches = useMemo(() =>
    availableChallenges.filter((c: Challenge) => {
      if (c.player1Id === user?.id) return false;
      if (selectedGame && c.gameType !== selectedGame) return false;
      if (c.betAmount < betRange[0] || c.betAmount > betRange[1]) return false;
      if (searchQuery && !c.player1Name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return c.status === 'waiting';
    }),
    [availableChallenges, user?.id, selectedGame, betRange, searchQuery]
  );

  const liveGames = useMemo(() =>
    liveChallenges.filter((c: Challenge) => {
      if (selectedGame && c.gameType !== selectedGame) return false;
      return c.status === 'active';
    }),
    [liveChallenges, selectedGame]
  );

  const gameStats = useMemo(() => {
    const stats: Record<string, { waiting: number; live: number }> = {};
    Object.keys(GAME_CONFIG).forEach(gameType => {
      stats[gameType] = {
        waiting: availableChallenges.filter((c: Challenge) => c.gameType === gameType && c.status === 'waiting').length,
        live: liveChallenges.filter((c: Challenge) => c.gameType === gameType && c.status === 'active').length,
      };
    });
    return stats;
  }, [availableChallenges, liveChallenges]);

  const handleQuickMatch = useCallback((gameType: string) => {
    setQuickMatchGame(gameType);
    setShowQuickMatch(true);
  }, []);

  const handleGameSelect = useCallback((gameType: string) => {
    setSelectedGame(prev => prev === gameType ? null : gameType);
  }, []);

  const handleJoin = useCallback((challengeId: string) => {
    joinChallengeMutation.mutate(challengeId);
  }, [joinChallengeMutation]);

  const handleWatch = useCallback((challengeId: string) => {
    navigate(`/challenge/${challengeId}/watch`);
  }, [navigate]);

  const handleResume = useCallback((challengeId: string) => {
    navigate(`/challenge/${challengeId}/play`);
  }, [navigate]);

  const handleStakePreset = useCallback((preset: typeof STAKE_PRESETS[0]) => {
    setStakePreset(preset.key);
    setBetRange([preset.min, preset.max]);
  }, []);

  const handleRefresh = useCallback(() => {
    refetchAvailable();
    refetchLive();
  }, [refetchAvailable, refetchLive]);

  const startQuickMatch = useCallback(() => {
    if (!quickMatchGame) return;

    const matchingChallenge = availableChallenges.find(
      (c: Challenge) => c.gameType === quickMatchGame &&
        c.status === 'waiting' &&
        c.player1Id !== user?.id &&
        Math.abs(c.betAmount - quickMatchBet) <= quickMatchBet * 0.3
    );

    if (matchingChallenge) {
      joinChallengeMutation.mutate(matchingChallenge.id);
    } else {
      createChallengeMutation.mutate({ gameType: quickMatchGame, betAmount: quickMatchBet });
    }
    setShowQuickMatch(false);
  }, [quickMatchGame, availableChallenges, user?.id, quickMatchBet, joinChallengeMutation, createChallengeMutation]);

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <BackButton data-testid="button-back" />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gamepad2 className="w-7 h-7 text-primary" />
              {t('lobby.title')}
            </h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              {t('lobby.subtitle')}
              <span className="inline-flex items-center gap-1 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                {availableChallenges.length + (liveChallenges?.length || 0)} {language === "ar" ? "مباراة" : "games"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(user?.freePlayCount ?? 0) > 0 && (
            <Badge variant="default" className="text-sm py-1.5 px-3" data-testid="badge-free-plays">
              <Gift className="w-4 h-4 me-1.5" />
              {user?.freePlayCount} {t('lobby.freePlays')}
            </Badge>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => navigate('/challenges')} data-testid="button-create-challenge">
            <Sparkles className="w-4 h-4 me-2" />
            {t('lobby.createChallenge')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {Object.entries(GAME_CONFIG).map(([gameType, config]) => {
          const waitingCount = gameStats[gameType]?.waiting || 0;
          const liveCount = gameStats[gameType]?.live || 0;
          const isTrending = liveCount >= 2 || waitingCount >= 3 || (waitingCount + liveCount) >= 4;
          return (
            <GameCard
              key={gameType}
              gameType={gameType}
              config={config}
              isSelected={selectedGame === gameType}
              waitingCount={waitingCount}
              liveCount={liveCount}
              isTrending={isTrending}
              language={language}
              onSelect={handleGameSelect}
              onQuickMatch={handleQuickMatch}
              t={t}
            />
          );
        })}
      </div>

      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground me-2">{t('lobby.gameType')}:</span>
            <Button
              variant={selectedGame === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedGame(null)}
              data-testid="button-filter-all"
            >
              {t('lobby.allGames')}
            </Button>
            {Object.entries(GAME_CONFIG).map(([gameType, config]) => {
              const Icon = config.icon;
              const isSelected = selectedGame === gameType;
              const matchCount = gameStats[gameType]?.waiting || 0;

              return (
                <Button
                  key={gameType}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedGame(isSelected ? null : gameType)}
                  className={`gap-2 ${isSelected ? '' : config.color}`}
                  data-testid={`button-filter-${gameType}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{language === 'ar' ? config.nameAr : config.name}</span>
                  {matchCount > 0 && (
                    <Badge variant="secondary" className="ms-1 h-5 px-1.5 text-xs">
                      {matchCount}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground me-2">{t('lobby.stakes')}:</span>
            {STAKE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                variant={stakePreset === preset.key ? "default" : "outline"}
                size="sm"
                onClick={() => handleStakePreset(preset)}
                data-testid={`button-stake-${preset.key}`}
              >
                {t(`lobby.stake${preset.key.charAt(0).toUpperCase() + preset.key.slice(1)}`)}
              </Button>
            ))}
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="absolute start-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('lobby.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-8"
              data-testid="input-search"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute end-1 top-1 px-2"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue={savedPrefs.defaultTab} className="w-full" onValueChange={(value) => savePreferences({ defaultTab: value })}>
        <TabsList className="w-full justify-start mb-4 h-auto p-1 flex-wrap gap-1">
          <TabsTrigger value="yours" className="flex items-center gap-2" data-testid="tab-yours">
            <User className="w-4 h-4" />
            {t('lobby.yourChallenges')}
            {yourChallenges.length > 0 && (
              <Badge variant="secondary" className="ms-1">{yourChallenges.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="open" className="flex items-center gap-2" data-testid="tab-open">
            <Users className="w-4 h-4" />
            {t('lobby.openMatches')}
            <Badge variant="secondary" className="ms-1">{openMatches.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-2" data-testid="tab-live">
            <div className="relative">
              <Flame className="w-4 h-4" />
              {liveGames.length > 0 && (
                <div className="absolute -top-1 -end-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            {t('lobby.liveGames')}
            <Badge variant="secondary" className="ms-1">{liveGames.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="yours">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('lobby.yourWaitingChallenges')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {loadingAvailable ? (
                  <GameCardSkeletonGrid count={3} />
                ) : isErrorAvailable ? (
                  <QueryErrorState error={errorAvailable} onRetry={() => refetchAvailable()} compact />
                ) : yourChallenges.length === 0 ? (
                  <EmptyState icon={User} title={t('lobby.noYourChallenges')} action={{ label: t('lobby.createFirstMatch'), onClick: () => navigate('/challenges') }} />
                ) : (
                  <div className="space-y-2">
                    {yourChallenges.map((challenge: Challenge) => (
                      <ChallengeRow
                        key={challenge.id}
                        challenge={challenge}
                        type="yours"
                        isNew={newMatchIds.has(challenge.id)}
                        language={language}
                        onJoin={handleJoin}
                        onWatch={handleWatch}
                        onResume={handleResume}
                        isJoining={joinChallengeMutation.isPending}
                        t={t}
                        gameConfig={GAME_CONFIG}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="open">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t('lobby.availableToJoin')}
                {newMatchIds.size > 0 && (
                  <Badge className="bg-primary animate-pulse">{t('lobby.newMatches')}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {loadingAvailable ? (
                  <GameCardSkeletonGrid count={3} />
                ) : isErrorAvailable ? (
                  <QueryErrorState error={errorAvailable} onRetry={() => refetchAvailable()} compact />
                ) : openMatches.length === 0 ? (
                  <EmptyState icon={Users} title={t('lobby.noOpenMatches')} action={{ label: t('lobby.createFirstMatch'), onClick: () => navigate('/challenges') }} />
                ) : (
                  <div className="space-y-2">
                    {openMatches.map((challenge: Challenge) => (
                      <ChallengeRow
                        key={challenge.id}
                        challenge={challenge}
                        type="open"
                        isNew={newMatchIds.has(challenge.id)}
                        language={language}
                        onJoin={handleJoin}
                        onWatch={handleWatch}
                        onResume={handleResume}
                        isJoining={joinChallengeMutation.isPending}
                        t={t}
                        gameConfig={GAME_CONFIG}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                {t('lobby.watchLiveGames')}
                {liveGames.length > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm text-red-500">{t('lobby.live')}</span>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {loadingLive ? (
                  <GameCardSkeletonGrid count={3} />
                ) : isErrorLive ? (
                  <QueryErrorState error={errorLive} onRetry={() => refetchLive()} compact />
                ) : liveGames.length === 0 ? (
                  <EmptyState icon={Eye} title={t('lobby.noLiveMatches')} />
                ) : (
                  <div className="space-y-2">
                    {liveGames.map((challenge: Challenge) => (
                      <ChallengeRow
                        key={challenge.id}
                        challenge={challenge}
                        type="live"
                        isNew={false}
                        language={language}
                        onJoin={handleJoin}
                        onWatch={handleWatch}
                        onResume={handleResume}
                        isJoining={joinChallengeMutation.isPending}
                        t={t}
                        gameConfig={GAME_CONFIG}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showQuickMatch} onOpenChange={setShowQuickMatch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              {t('lobby.quickMatchTitle')}
            </DialogTitle>
          </DialogHeader>

          {quickMatchGame && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                {(() => {
                  const config = GAME_CONFIG[quickMatchGame];
                  const Icon = config?.icon || Gamepad2;
                  return (
                    <>
                      <div className={`p-3 rounded-lg ${config?.color || ''} border`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {language === 'ar' ? config?.nameAr : config?.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">{t('lobby.findingMatch')}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('lobby.betAmount')}</label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[quickMatchBet]}
                    onValueChange={(value) => setQuickMatchBet(value[0])}
                    min={quickMatchGame ? (GAME_CONFIG[quickMatchGame]?.minStake || 10) : 10}
                    max={quickMatchGame ? (GAME_CONFIG[quickMatchGame]?.maxStake || 500) : 500}
                    step={10}
                    className="flex-1"
                    data-testid="slider-quickmatch-bet"
                  />
                  <Badge variant="secondary" className="min-w-[60px] justify-center">
                    {quickMatchBet}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickMatch(false)} data-testid="button-cancel-quickmatch">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={startQuickMatch}
              disabled={createChallengeMutation.isPending || joinChallengeMutation.isPending}
              data-testid="button-start-quickmatch"
            >
              {(createChallengeMutation.isPending || joinChallengeMutation.isPending) ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 me-2" />
              )}
              {t('lobby.startMatch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isSearching && (
        <Dialog open={isSearching} onOpenChange={setIsSearching}>
          <DialogContent className="text-center">
            <div className="py-8">
              <div className="relative mx-auto w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                <div className="absolute inset-2 rounded-full border-4 border-primary/40 animate-pulse" />
                <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Search className="w-6 h-6 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">{t('lobby.searchingOpponent')}</h3>
              <p className="text-muted-foreground">{t('lobby.pleaseWait')}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
