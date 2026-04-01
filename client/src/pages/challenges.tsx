import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { GameCardSkeletonGrid } from "@/components/skeletons";
import { QueryErrorState } from "@/components/QueryErrorState";
import { playSound } from "@/hooks/use-sound-effects";
import { GAME_ICON_STYLES } from "@/lib/game-config";
import {
  Swords,
  Users,
  Shuffle,
  Clock,
  Trophy,
  Coins,
  Play,
  X,
  AlertTriangle,
  Timer,
  Target,
  Eye,
  Lock,
  Globe,
  TrendingUp,
  Star,
  Crown,
  Gem,
  Flame,
  Heart,
  Rocket,
  Zap,
  Gift,
  Send,
  ShoppingBag,
  UserPlus,
  UserCheck,
  Bell,
  Filter,
  Search,
  Check,
  SlidersHorizontal
} from "lucide-react";

interface PlayerRating {
  wins: number;
  losses: number;
  winRate: number;
  rank: string;
}

interface Challenge {
  id: string;
  gameType: string;
  betAmount: number;
  visibility: 'public' | 'private';
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  player1Id: string;
  player1Name: string;
  player1Rating?: PlayerRating;
  player2Id?: string;
  player2Name?: string;
  player2Rating?: PlayerRating;
  player3Id?: string;
  player3Name?: string;
  player4Id?: string;
  player4Name?: string;
  player1Score?: number;
  player2Score?: number;
  player3Score?: number;
  player4Score?: number;
  winnerId?: string;
  timeLimit: number;
  spectatorCount?: number;
  totalBets?: number;
  createdAt: string;
  startedAt?: string;
  requiredPlayers?: number;
  currentPlayers?: number;
}

interface GiftItem {
  id: string;
  name: string;
  nameAr?: string;
  price: string;
  iconUrl: string;
  category: string;
  coinValue: number;
}

interface InventoryItem {
  id: string;
  giftId: string;
  giftName: string;
  giftNameAr?: string;
  iconUrl: string;
  quantity: number;
  coinValue: number;
}

interface ChallengeGame {
  id: string;
  name: string;
  category: string;
  minBet: string;
  maxBet: string;
  status: string;
}

type ChessSystemKey =
  | 'bullet_1_0'
  | 'blitz_3_2'
  | 'blitz_5_0'
  | 'rapid_10_0'
  | 'rapid_15_10'
  | 'classical_30_0';

const CHESS_SYSTEM_OPTIONS: Array<{ key: ChessSystemKey; labelEn: string; labelAr: string; seconds: number }> = [
  { key: 'bullet_1_0', labelEn: 'Bullet 1+0', labelAr: 'بوليت 1+0', seconds: 60 },
  { key: 'blitz_3_2', labelEn: 'Blitz 3+2', labelAr: 'بليتز 3+2', seconds: 180 },
  { key: 'blitz_5_0', labelEn: 'Blitz 5+0', labelAr: 'بليتز 5+0', seconds: 300 },
  { key: 'rapid_10_0', labelEn: 'Rapid 10+0', labelAr: 'رابيد 10+0', seconds: 600 },
  { key: 'rapid_15_10', labelEn: 'Rapid 15+10', labelAr: 'رابيد 15+10', seconds: 900 },
  { key: 'classical_30_0', labelEn: 'Classical 30+0', labelAr: 'كلاسيك 30+0', seconds: 1800 },
];

const RANK_COLORS: Record<string, string> = {
  bronze: "bg-amber-700/20 text-amber-600",
  silver: "bg-gray-400/20 text-gray-400",
  gold: "bg-yellow-500/20 text-yellow-500",
  platinum: "bg-cyan-400/20 text-cyan-400",
  diamond: "bg-purple-400/20 text-purple-400",
};

const GIFT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  flame: Flame,
  trophy: Trophy,
  crown: Crown,
  rocket: Rocket,
  gem: Gem,
  star: Star,
  zap: Zap,
};

function RatingBadge({ rating }: { rating?: PlayerRating }) {
  if (!rating) return null;
  return (
    <Badge className={RANK_COLORS[rating.rank] || RANK_COLORS.bronze}>
      {rating.winRate}% ({rating.wins}W/{rating.losses}L)
    </Badge>
  );
}

export default function ChallengesPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showGiftShop, setShowGiftShop] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [opponentType, setOpponentType] = useState<'random' | 'friend'>('random');
  const [friendAccountId, setFriendAccountId] = useState("");
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [requiredPlayers, setRequiredPlayers] = useState<2 | 4>(2);
  const [chessSystem, setChessSystem] = useState<ChessSystemKey>('rapid_10_0');

  const multiPlayerGames = ['domino', 'tarneeb', 'baloot'];
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [gameFilter, setGameFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [pendingGameFilter, setPendingGameFilter] = useState<string[]>([]);

  const { data: myChallenges, isLoading: loadingMy, isError: isErrorMy, error: errorMy, refetch: refetchMy } = useQuery<Challenge[]>({
    queryKey: ['/api/challenges/my'],
  });

  const { data: availableChallenges, isLoading: loadingAvailable, isError: isErrorAvailable, error: errorAvailable, refetch: refetchAvailable } = useQuery<Challenge[]>({
    queryKey: ['/api/challenges/available'],
    refetchInterval: 10000,
  });

  const { data: publicChallenges, isLoading: loadingPublic, isError: isErrorPublic, error: errorPublic, refetch: refetchPublic } = useQuery<Challenge[]>({
    queryKey: ['/api/challenges/public'],
    refetchInterval: 10000,
  });

  const { data: userRating } = useQuery<{ rank: string; wins: number; losses: number; winRate: number; currentStreak: number }>({
    queryKey: ['/api/user/rating'],
  });

  const { data: giftCatalog } = useQuery<GiftItem[]>({
    queryKey: ['/api/gifts'],
  });

  const { data: giftInventory } = useQuery<InventoryItem[]>({
    queryKey: ['/api/gifts/inventory'],
  });

  const { data: followedChallengers } = useQuery<{ userId: string }[]>({
    queryKey: ['/api/challenger-follows'],
  });

  const { data: challengeGames = [], isLoading: loadingGames } = useQuery<ChallengeGame[]>({
    queryKey: ['/api/games', { section: 'challenges' }],
    queryFn: async () => {
      const res = await fetch('/api/games?section=challenges&status=active');
      if (!res.ok) throw new Error('Failed to load games');
      return res.json();
    },
  });

  const refreshChallengeQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/challenges'] });
    queryClient.invalidateQueries({ queryKey: ['/api/challenges/my'] });
    queryClient.invalidateQueries({ queryKey: ['/api/challenges/available'] });
    queryClient.invalidateQueries({ queryKey: ['/api/challenges/public'] });
  };

  const followedIds = new Set(followedChallengers?.map(f => f.userId) || []);

  const getGameIconByName = (name: string) => {
    const lowerName = name.toLowerCase();
    return GAME_ICON_STYLES[lowerName]?.icon || Target;
  };

  const followChallengerMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest('POST', '/api/challenger-follows', { followedId: userId }),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('challenges.followedChallenger') });
      queryClient.invalidateQueries({ queryKey: ['/api/challenger-follows'] });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const unfollowChallengerMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest('DELETE', `/api/challenger-follows/${userId}`),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('challenges.unfollowedChallenger') });
      queryClient.invalidateQueries({ queryKey: ['/api/challenger-follows'] });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const toggleFollow = (userId: string) => {
    if (followedIds.has(userId)) {
      unfollowChallengerMutation.mutate(userId);
    } else {
      followChallengerMutation.mutate(userId);
    }
  };

  const createChallengeMutation = useMutation({
    mutationFn: (data: { gameType: string; betAmount: number; opponentType: string; friendAccountId?: string; visibility: string; requiredPlayers?: number; chessSystem?: ChessSystemKey }) =>
      apiRequest('POST', '/api/challenges', data),
    onSuccess: () => {
      playSound('success');
      toast({ title: t('common.success'), description: t('challenges.created') });
      refreshChallengeQueries();
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (err: Error) => {
      playSound('error');
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const joinChallengeMutation = useMutation({
    mutationFn: (challengeId: string) =>
      apiRequest('POST', `/api/challenges/${challengeId}/join`),
    onSuccess: async (res: Response) => {
      playSound('challenge');
      toast({ title: t('common.success'), description: t('challenges.joined') });
      refreshChallengeQueries();
      // Navigate directly to game screen after successful join
      const data = typeof res?.json === 'function' ? await res.json() : res;
      if (data && data.id) {
        setLocation(`/challenge/${data.id}/play`);
      }
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const withdrawChallengeMutation = useMutation({
    mutationFn: (challengeId: string) =>
      apiRequest('POST', `/api/challenges/${challengeId}/withdraw`),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('challenges.withdrawn') });
      refreshChallengeQueries();
      setShowWithdrawDialog(false);
      setActiveChallenge(null);
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });


  const purchaseGiftMutation = useMutation({
    mutationFn: (data: { giftId: string; quantity: number }) =>
      apiRequest('POST', '/api/gifts/purchase', data),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('challenges.giftPurchased') });
      queryClient.invalidateQueries({ queryKey: ['/api/gifts/inventory'] });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const sendGiftMutation = useMutation({
    mutationFn: (data: { challengeId: string; recipientId: string; giftId: string }) =>
      apiRequest('POST', `/api/challenges/${data.challengeId}/gifts`, data),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('challenges.giftSent') });
      queryClient.invalidateQueries({ queryKey: ['/api/gifts/inventory'] });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setSelectedGame(null);
    setBetAmount("");
    setOpponentType('random');
    setFriendAccountId("");
    setVisibility('public');
    setRequiredPlayers(2);
    setChessSystem('rapid_10_0');
  };

  const handleCreateChallenge = () => {
    if (!selectedGame || !betAmount) {
      toast({ title: t('common.error'), description: t('challenges.fillAll'), variant: "destructive" });
      return;
    }
    if (opponentType === 'friend' && !friendAccountId) {
      toast({ title: t('common.error'), description: t('challenges.enterFriendId'), variant: "destructive" });
      return;
    }
    // Validate challenge amount against game limits
    const selectedGameData = challengeGames.find(g => g.name.toLowerCase() === selectedGame.toLowerCase() || g.id === selectedGame);
    if (selectedGameData) {
      const min = parseFloat(selectedGameData.minBet);
      const max = parseFloat(selectedGameData.maxBet);
      const bet = parseFloat(betAmount);
      if (bet < min || bet > max) {
        toast({
          title: t('common.error'),
          description: language === 'ar'
            ? `مبلغ التحدي يجب أن يكون بين $${min} و $${max}`
            : `Challenge amount must be between $${min} and $${max}`,
          variant: "destructive"
        });
        return;
      }
    }
    createChallengeMutation.mutate({
      gameType: selectedGame,
      betAmount: parseFloat(betAmount),
      opponentType,
      friendAccountId: opponentType === 'friend' ? friendAccountId : undefined,
      visibility,
      requiredPlayers: multiPlayerGames.includes(selectedGame) ? requiredPlayers : 2,
      chessSystem: selectedGame === 'chess' ? chessSystem : undefined,
    });
  };

  const handleSpectate = (challenge: Challenge) => {
    setLocation(`/challenge/${challenge.id}/watch`);
  };


  const getGameIcon = (gameType: string) => {
    const game = challengeGames.find(g => g.name.toLowerCase() === gameType.toLowerCase() || g.id === gameType);
    if (game) return getGameIconByName(game.name);
    return GAME_ICON_STYLES[gameType.toLowerCase()]?.icon || Target;
  };

  const formatUsd = (amount: number | string | undefined) => Number(amount || 0).toFixed(2);

  const getChallengeParticipantIds = (challenge: Challenge): string[] =>
    [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id].filter(Boolean) as string[];

  const isChallengeParticipant = (challenge: Challenge): boolean => {
    if (!user?.id) return false;
    return getChallengeParticipantIds(challenge).includes(user.id);
  };

  const handlePlayChallenge = (challenge: Challenge) => {
    setLocation(`/challenge/${challenge.id}/play`);
  };

  const filterChallenges = (challenges: Challenge[] | undefined) => {
    if (!challenges) return [];
    let filtered = challenges;
    if (gameFilter.length > 0) {
      filtered = filtered.filter(c => gameFilter.includes(c.gameType));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(c => {
        const gameName = challengeGames.find(g => g.id === c.gameType)?.name?.toLowerCase() || c.gameType.toLowerCase();
        return gameName.includes(q) ||
          c.player1Name?.toLowerCase().includes(q) ||
          c.player2Name?.toLowerCase().includes(q) ||
          c.player3Name?.toLowerCase().includes(q) ||
          c.player4Name?.toLowerCase().includes(q);
      });
    }
    return filtered;
  };

  const handleOpenFilter = () => {
    setPendingGameFilter([...gameFilter]);
    setShowFilterPanel(true);
  };

  const handleConfirmFilter = () => {
    setGameFilter([...pendingGameFilter]);
    setShowFilterPanel(false);
  };

  const handleCancelFilter = () => {
    setPendingGameFilter([...gameFilter]);
    setShowFilterPanel(false);
  };

  const handleClearFilter = () => {
    setPendingGameFilter([]);
  };

  const togglePendingGameFilter = (gameId: string) => {
    setPendingGameFilter(prev =>
      prev.includes(gameId)
        ? prev.filter(id => id !== gameId)
        : [...prev, gameId]
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <BackButton className="mb-2" />

      {/* Header Section */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2 truncate" data-testid="text-challenges-title">
            <Swords className="h-6 w-6 text-primary flex-shrink-0" />
            {t('nav.challenges')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('challenges.description')}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowGiftShop(true)} data-testid="button-gift-shop">
            <ShoppingBag className="h-4 w-4 sm:me-2" />
            <span className="hidden sm:inline">{t('challenges.giftShop')}</span>
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-challenge">
            <Swords className="h-4 w-4 sm:me-2" />
            <span className="hidden sm:inline">{t('challenges.createChallenge')}</span>
          </Button>
        </div>
      </section>

      {/* Rating Stats Section */}
      {userRating && (
        <section>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                <div className="col-span-2 flex items-center gap-3">
                  <div className="p-3 rounded-full bg-primary/20 flex-shrink-0">
                    <Trophy className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t('challenges.yourRating')}</p>
                    <Badge className={RANK_COLORS[userRating.rank] || RANK_COLORS.bronze}>
                      {userRating.rank.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-500/10">
                  <p className="text-xl font-bold text-green-500">{userRating.wins}</p>
                  <p className="text-xs text-muted-foreground">{t('challenges.wins')}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-500/10">
                  <p className="text-xl font-bold text-red-500">{userRating.losses}</p>
                  <p className="text-xs text-muted-foreground">{t('challenges.losses')}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted">
                  <p className="text-xl font-bold">{userRating.winRate}%</p>
                  <p className="text-xs text-muted-foreground">{t('challenges.winRate')}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-primary/10">
                  <p className="text-xl font-bold text-primary">{userRating.currentStreak}</p>
                  <p className="text-xs text-muted-foreground">{t('challenges.streak')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Search & Filter Section */}
      <section>
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={language === 'ar' ? 'بحث عن لعبة أو لاعب...' : 'Search game or player...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9 pe-9 h-10 bg-card border-border"
              data-testid="input-search-challenges"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute end-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Filter Button */}
          <Button
            variant={gameFilter.length > 0 ? "default" : "outline"}
            size="icon"
            className="h-10 w-10 shrink-0 relative"
            onClick={handleOpenFilter}
            data-testid="button-open-filter"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {gameFilter.length > 0 && (
              <span className="absolute -top-1.5 -end-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-background">
                {gameFilter.length}
              </span>
            )}
          </Button>
        </div>

        {/* Active Filter Tags */}
        {gameFilter.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {gameFilter.map(gId => {
              const game = challengeGames.find(g => g.id === gId);
              if (!game) return null;
              const Icon = getGameIconByName(game.name);
              return (
                <Badge key={gId} variant="secondary" className="gap-1.5 pe-1.5 py-1">
                  <Icon className="h-3 w-3" />
                  {game.name}
                  <button
                    onClick={() => setGameFilter(prev => prev.filter(id => id !== gId))}
                    className="ms-1 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setGameFilter([])}
              data-testid="button-clear-all-filters"
            >
              {language === 'ar' ? 'مسح الكل' : 'Clear all'}
            </Button>
          </div>
        )}
      </section>

      {/* Filter Panel Dialog */}
      <Dialog open={showFilterPanel} onOpenChange={setShowFilterPanel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              {language === 'ar' ? 'تصفية حسب اللعبة' : 'Filter by Game'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                {pendingGameFilter.length > 0
                  ? `${pendingGameFilter.length} ${language === 'ar' ? 'محدد' : 'selected'}`
                  : language === 'ar' ? 'اختر الألعاب' : 'Select games'}
              </span>
              {pendingGameFilter.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearFilter}>
                  {language === 'ar' ? 'مسح الكل' : 'Clear all'}
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-[350px]">
              <div className="grid grid-cols-2 gap-2">
                {loadingGames ? (
                  <div className="col-span-2 text-center text-muted-foreground text-sm py-4">{t('common.loading')}</div>
                ) : challengeGames.map(game => {
                  const Icon = getGameIconByName(game.name);
                  const isSelected = pendingGameFilter.includes(game.id);
                  return (
                    <Button
                      key={game.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => togglePendingGameFilter(game.id)}
                      className={`justify-start gap-2 h-10 ${isSelected ? '' : ''}`}
                      data-testid={`button-filter-${game.name.toLowerCase()}`}
                    >
                      {isSelected ? <Check className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{game.name}</span>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCancelFilter}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button className="flex-1" onClick={handleConfirmFilter}>
              <Check className="h-4 w-4 me-2" />
              {language === 'ar' ? 'تأكيد' : 'Confirm'}
              {pendingGameFilter.length > 0 && ` (${pendingGameFilter.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Challenges Tabs Section */}
      <section>
        <Tabs defaultValue="arena" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-4 h-auto">
            <TabsTrigger value="arena" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-2 text-xs sm:text-sm" data-testid="tab-arena">
              <Globe className="h-4 w-4" />
              <span className="truncate">{t('challenges.publicArena')}</span>
            </TabsTrigger>
            <TabsTrigger value="available" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-2 text-xs sm:text-sm" data-testid="tab-available">
              <Users className="h-4 w-4" />
              <span className="truncate">{t('challenges.available')}</span>
            </TabsTrigger>
            <TabsTrigger value="my" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-2 text-xs sm:text-sm" data-testid="tab-my-challenges">
              <Swords className="h-4 w-4" />
              <span className="truncate">{t('challenges.myChallenges')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arena">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {t('challenges.liveMatches')}
                </h3>
              </div>

              {loadingPublic ? (
                <GameCardSkeletonGrid count={4} />
              ) : isErrorPublic ? (
                <QueryErrorState error={errorPublic} onRetry={() => refetchPublic()} compact />
              ) : filterChallenges(publicChallenges).length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {filterChallenges(publicChallenges).map(challenge => {
                    const GameIcon = getGameIcon(challenge.gameType);
                    return (
                      <Card key={challenge.id} className="overflow-hidden" data-testid={`card-live-challenge-${challenge.id}`}>
                        <CardHeader className="pb-2 bg-primary/5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <GameIcon className="h-5 w-5 text-primary" />
                              <span className="font-semibold capitalize">{challenge.gameType}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive" className="animate-pulse">
                                {t('challenges.live')}
                              </Badge>
                              <Badge variant="outline">
                                <Eye className="h-3 w-3 me-1" />
                                {challenge.spectatorCount}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="text-center flex-1 min-w-0">
                              <div className="flex items-center justify-center gap-1">
                                <p className="font-bold truncate max-w-[100px]" title={challenge.player1Name}>{challenge.player1Name}</p>
                                {challenge.player1Id !== user?.id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFollow(challenge.player1Id);
                                    }}
                                    data-testid={`button-follow-p1-${challenge.id}`}
                                  >
                                    {followedIds.has(challenge.player1Id) ? (
                                      <UserCheck className="h-3 w-3 text-primary" />
                                    ) : (
                                      <UserPlus className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                              <RatingBadge rating={challenge.player1Rating} />
                              <p className="text-3xl font-bold mt-2">{challenge.player1Score || 0}</p>
                            </div>
                            <div className="px-4">
                              <span className="text-2xl font-bold text-muted-foreground">VS</span>
                            </div>
                            <div className="text-center flex-1 min-w-0">
                              <div className="flex items-center justify-center gap-1">
                                <p className="font-bold truncate max-w-[100px]" title={challenge.player2Name}>{challenge.player2Name}</p>
                                {challenge.player2Id && challenge.player2Id !== user?.id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFollow(challenge.player2Id!);
                                    }}
                                    data-testid={`button-follow-p2-${challenge.id}`}
                                  >
                                    {followedIds.has(challenge.player2Id) ? (
                                      <UserCheck className="h-3 w-3 text-primary" />
                                    ) : (
                                      <UserPlus className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                              <RatingBadge rating={challenge.player2Rating} />
                              <p className="text-3xl font-bold mt-2">{challenge.player2Score || 0}</p>
                            </div>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-1">
                              <Coins className="h-4 w-4 text-yellow-500" />
                              <span>{t('challenges.totalBets')}: ${formatUsd(challenge.totalBets)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Trophy className="h-4 w-4 text-primary" />
                              <span>{t('challenges.prize')}: ${formatUsd(challenge.betAmount * 2)}</span>
                            </div>
                          </div>
                          <Button className="w-full" onClick={() => handleSpectate(challenge)} data-testid={`button-spectate-${challenge.id}`}>
                            <Eye className="h-4 w-4 me-2" />
                            {t('challenges.watchAndBet')}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent>
                    <EmptyState icon={Eye} title={t('challenges.noLiveMatches')} />
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="available">
            <div className="space-y-4">
              {loadingAvailable ? (
                <GameCardSkeletonGrid count={3} />
              ) : isErrorAvailable ? (
                <QueryErrorState error={errorAvailable} onRetry={() => refetchAvailable()} compact />
              ) : filterChallenges(availableChallenges).length > 0 ? (
                filterChallenges(availableChallenges).map(challenge => {
                  const GameIcon = getGameIcon(challenge.gameType);
                  return (
                    <Card key={challenge.id} data-testid={`card-challenge-${challenge.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-primary/20">
                              <GameIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold capitalize">{challenge.gameType}</p>
                                {challenge.visibility === 'public' ? (
                                  <Globe className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Lock className="h-4 w-4 text-yellow-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-muted-foreground truncate max-w-[150px]">
                                  {t('challenges.by')} {challenge.player1Name}
                                </p>
                                {challenge.player1Id !== user?.id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFollow(challenge.player1Id);
                                    }}
                                    data-testid={`button-follow-${challenge.player1Id}`}
                                  >
                                    {followedIds.has(challenge.player1Id) ? (
                                      <UserCheck className="h-4 w-4 text-primary" />
                                    ) : (
                                      <UserPlus className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                              <RatingBadge rating={challenge.player1Rating} />
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-end">
                              <p className="font-bold text-lg">${formatUsd(challenge.betAmount)}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {challenge.timeLimit}s
                              </p>
                            </div>
                            <Button onClick={() => joinChallengeMutation.mutate(challenge.id)} data-testid={`button-join-${challenge.id}`}>
                              <Play className="h-4 w-4 me-1" />
                              {t('challenges.join')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card>
                  <CardContent>
                    <EmptyState icon={Users} title={t('challenges.noAvailable')} />
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="my">
            <div className="space-y-4">
              {loadingMy ? (
                <GameCardSkeletonGrid count={2} />
              ) : isErrorMy ? (
                <QueryErrorState error={errorMy} onRetry={() => refetchMy()} compact />
              ) : filterChallenges(myChallenges).length > 0 ? (
                filterChallenges(myChallenges).map(challenge => {
                  const GameIcon = getGameIcon(challenge.gameType);
                  const canPlay = challenge.status === 'active' && isChallengeParticipant(challenge);
                  const canWithdraw = (challenge.status === 'waiting' || challenge.status === 'active') && isChallengeParticipant(challenge);
                  const opponentName = [
                    { id: challenge.player1Id, name: challenge.player1Name },
                    { id: challenge.player2Id, name: challenge.player2Name },
                    { id: challenge.player3Id, name: challenge.player3Name },
                    { id: challenge.player4Id, name: challenge.player4Name },
                  ].find((player) => player.id && player.id !== user?.id)?.name || (language === 'ar' ? 'خصم' : 'Opponent');
                  return (
                    <Card key={challenge.id} data-testid={`card-my-challenge-${challenge.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-primary/20">
                              <GameIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold capitalize">{challenge.gameType}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[150px]">
                                {challenge.status === 'waiting'
                                  ? (challenge.requiredPlayers && challenge.requiredPlayers > 2
                                    ? `${challenge.currentPlayers || 1}/${challenge.requiredPlayers} ${t('challenges.players') || 'players'}`
                                    : t('challenges.waitingForOpponent'))
                                  : `vs ${opponentName}`
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <Badge variant={
                              challenge.status === 'active' ? 'default' :
                                challenge.status === 'completed' ? 'secondary' :
                                  challenge.status === 'cancelled' ? 'destructive' : 'outline'
                            }>
                              {challenge.status}
                            </Badge>
                            <p className="font-bold">${formatUsd(challenge.betAmount)}</p>
                            {canPlay && (
                              <Button
                                size="sm"
                                onClick={() => handlePlayChallenge(challenge)}
                                data-testid={`button-play-${challenge.id}`}
                              >
                                <Play className="h-4 w-4 me-1" />
                                {t('nav.play') || (language === 'ar' ? 'لعب' : 'Play')}
                              </Button>
                            )}
                            {canWithdraw && (
                              <Button
                                variant={challenge.status === 'active' ? 'outline' : 'destructive'}
                                size="sm"
                                onClick={() => {
                                  setActiveChallenge(challenge);
                                  setShowWithdrawDialog(true);
                                }}
                                data-testid={`button-withdraw-${challenge.id}`}
                              >
                                <X className="h-4 w-4 me-1" />
                                {challenge.status === 'waiting' ? (language === 'ar' ? 'إلغاء' : 'Cancel') : (language === 'ar' ? 'انسحاب' : 'Withdraw')}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card>
                  <CardContent>
                    <EmptyState icon={Swords} title={t('challenges.noChallenges')} action={{ label: t('challenges.createFirst'), onClick: () => setShowCreateDialog(true) }} />
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Create Challenge Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5" />
              {t('challenges.createChallenge')}
            </DialogTitle>
            <DialogDescription>{t('challenges.createDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('challenges.selectGame')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {loadingGames ? (
                  <div className="col-span-2 text-center text-muted-foreground">{t('common.loading')}</div>
                ) : challengeGames.length === 0 ? (
                  <div className="col-span-2 text-center text-muted-foreground">{t('challenges.noGamesAvailable')}</div>
                ) : challengeGames.map(game => {
                  const Icon = getGameIconByName(game.name);
                  const gameKey = game.name.toLowerCase();
                  return (
                    <Button
                      key={game.id}
                      variant={selectedGame === gameKey ? "default" : "outline"}
                      className="h-auto py-3 flex-col"
                      onClick={() => setSelectedGame(gameKey)}
                      data-testid={`button-game-${gameKey}`}
                    >
                      <Icon className="h-6 w-6 mb-1" />
                      <span>{game.name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {selectedGame && multiPlayerGames.includes(selectedGame) && (
              <div>
                <Label>{t('challenges.numberOfPlayers') || 'Number of Players'}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    variant={requiredPlayers === 2 ? "default" : "outline"}
                    onClick={() => setRequiredPlayers(2)}
                    data-testid="button-players-2"
                  >
                    <Users className="h-4 w-4 me-2" />
                    2 {t('challenges.players') || 'Players'}
                  </Button>
                  <Button
                    variant={requiredPlayers === 4 ? "default" : "outline"}
                    onClick={() => setRequiredPlayers(4)}
                    data-testid="button-players-4"
                  >
                    <Users className="h-4 w-4 me-2" />
                    4 {t('challenges.players') || 'Players'}
                  </Button>
                </div>
              </div>
            )}

            {selectedGame === 'chess' && (
              <div>
                <Label>{language === 'ar' ? 'نظام اللعب (الوقت)' : 'Chess System (Time Control)'}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {CHESS_SYSTEM_OPTIONS.map((system) => (
                    <Button
                      key={system.key}
                      type="button"
                      variant={chessSystem === system.key ? 'default' : 'outline'}
                      onClick={() => setChessSystem(system.key)}
                      className="h-auto py-2 text-xs"
                      data-testid={`button-chess-system-${system.key}`}
                    >
                      <Timer className="h-3.5 w-3.5 me-1" />
                      {language === 'ar' ? system.labelAr : system.labelEn}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>{t('challenges.stakeAmount')}</Label>
              <div className="relative mt-2">
                <Coins className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="10.00"
                  className="ps-10"
                  data-testid="input-stake-amount"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('challenges.visibility')}</Label>
                <p className="text-xs text-muted-foreground">
                  {visibility === 'public' ? t('challenges.publicDesc') : t('challenges.privateDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Lock className={`h-4 w-4 ${visibility === 'private' ? 'text-primary' : 'text-muted-foreground'}`} />
                <Switch
                  checked={visibility === 'public'}
                  onCheckedChange={(checked) => setVisibility(checked ? 'public' : 'private')}
                  data-testid="switch-visibility"
                />
                <Globe className={`h-4 w-4 ${visibility === 'public' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>

            <div>
              <Label>{t('challenges.opponentType')}</Label>
              <RadioGroup value={opponentType} onValueChange={(v) => setOpponentType(v as 'random' | 'friend')} className="mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="random" id="random" />
                  <Label htmlFor="random" className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4" />
                    {t('challenges.randomOpponent')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="friend" id="friend" />
                  <Label htmlFor="friend" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('challenges.inviteFriend')}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {opponentType === 'friend' && (
              <div>
                <Label>{t('challenges.friendAccountId')}</Label>
                <Input
                  value={friendAccountId}
                  onChange={(e) => setFriendAccountId(e.target.value)}
                  placeholder={t('challenges.enterAccountId')}
                  className="mt-2"
                  data-testid="input-friend-id"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateChallenge} disabled={createChallengeMutation.isPending}>
              {t('challenges.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {activeChallenge?.status === 'active'
                ? (language === 'ar' ? 'تأكيد الانسحاب — عقوبة 70%' : 'Confirm Withdrawal — 70% Penalty')
                : (language === 'ar' ? 'تأكيد إلغاء التحدي' : 'Confirm Challenge Cancellation')
              }
            </DialogTitle>
            <DialogDescription>
              {activeChallenge?.status === 'active'
                ? (language === 'ar' ? 'سيتم خصم 70% من رهانك كعقوبة للانسحاب من تحدي نشط' : 'You will lose 70% of your stake as a penalty for withdrawing from an active challenge')
                : (language === 'ar' ? 'سيتم استرداد مبلغ الرهان بالكامل' : 'Your bet amount will be fully refunded')
              }
            </DialogDescription>
          </DialogHeader>
          {activeChallenge && (
            <div className={`p-4 rounded-md ${activeChallenge.status === 'active' ? 'bg-destructive/15 border border-destructive/30' : 'bg-muted'}`}>
              {activeChallenge.status === 'active' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    {language === 'ar'
                      ? `💸 العقوبة: $${(Number(activeChallenge.betAmount) * 0.7).toFixed(2)} (70%)`
                      : `💸 Penalty: $${(Number(activeChallenge.betAmount) * 0.7).toFixed(2)} (70%)`
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar'
                      ? `💰 سيتم استرداد: $${(Number(activeChallenge.betAmount) * 0.3).toFixed(2)} (30%)`
                      : `💰 Refund: $${(Number(activeChallenge.betAmount) * 0.3).toFixed(2)} (30%)`
                    }
                  </p>
                </div>
              ) : (
                <p className="text-sm">
                  {language === 'ar'
                    ? `✅ سيتم استرداد مبلغ الرهان بالكامل: $${Number(activeChallenge.betAmount).toFixed(2)}`
                    : `✅ Your bet amount will be fully refunded: $${Number(activeChallenge.betAmount).toFixed(2)}`
                  }
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => activeChallenge && withdrawChallengeMutation.mutate(activeChallenge.id)}
              disabled={withdrawChallengeMutation.isPending}
            >
              {activeChallenge?.status === 'active'
                ? (language === 'ar' ? 'تأكيد الانسحاب' : 'Confirm Withdrawal')
                : (language === 'ar' ? 'تأكيد الإلغاء' : 'Confirm Cancellation')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Gift Shop Dialog */}
      <Dialog open={showGiftShop} onOpenChange={setShowGiftShop}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              {t('challenges.giftShop')}
            </DialogTitle>
            <DialogDescription>{t('challenges.giftShopDesc')}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="shop">
            <TabsList className="w-full">
              <TabsTrigger value="shop" className="flex-1">{t('challenges.shop')}</TabsTrigger>
              <TabsTrigger value="inventory" className="flex-1">{t('challenges.inventory')}</TabsTrigger>
            </TabsList>
            <TabsContent value="shop" className="mt-4">
              <ScrollArea className="h-64">
                <div className="grid grid-cols-2 gap-3">
                  {giftCatalog?.map(gift => {
                    const Icon = GIFT_ICONS[gift.iconUrl] || Gift;
                    return (
                      <Card key={gift.id} className="hover-elevate cursor-pointer" data-testid={`card-gift-${gift.id}`}>
                        <CardContent className="p-3 text-center">
                          <Icon className="h-8 w-8 mx-auto text-primary mb-2" />
                          <p className="font-medium">{language === 'ar' && gift.nameAr ? gift.nameAr : gift.name}</p>
                          <p className="text-sm text-muted-foreground">{gift.coinValue} coins</p>
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => purchaseGiftMutation.mutate({ giftId: gift.id, quantity: 1 })}
                            data-testid={`button-buy-${gift.id}`}
                          >
                            ${gift.price}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="inventory" className="mt-4">
              <ScrollArea className="h-64">
                {giftInventory && giftInventory.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {giftInventory.map(item => {
                      const Icon = GIFT_ICONS[item.iconUrl] || Gift;
                      return (
                        <Card key={item.id} data-testid={`card-inventory-${item.giftId}`}>
                          <CardContent className="p-3 text-center">
                            <Icon className="h-8 w-8 mx-auto text-primary mb-2" />
                            <p className="font-medium text-sm">{language === 'ar' && item.giftNameAr ? item.giftNameAr : item.giftName}</p>
                            <Badge variant="secondary" className="mt-1">x{item.quantity}</Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={Gift} title={t('challenges.noGifts')} />
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
