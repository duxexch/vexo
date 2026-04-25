import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/BackButton";
import { GameConfigIcon } from "@/components/GameConfigIcon";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildGameConfig, FALLBACK_GAME_CONFIG, getGameIconSurfaceClass, getGameIconToneClass, type MultiplayerGameFromAPI } from "@/lib/game-config";
import {
  Trophy, Users, Clock, Swords,
  DollarSign, Calendar, ChevronRight,
  Timer, Filter, Share2, Copy, Image as ImageIcon, Video, XCircle, ArrowDownToLine,
  Wallet
} from "lucide-react";
import { ProjectCurrencySymbol } from "@/components/ProjectCurrencySymbol";
import {
  formatTournamentAmountText,
  normalizeTournamentCurrencyType,
} from "@shared/tournament-currency";

function TournamentCurrencyBadge({ currency, className }: { currency?: string | null; className?: string }) {
  if (normalizeTournamentCurrencyType(currency) === 'project') {
    return <ProjectCurrencySymbol className={className} />;
  }
  return <DollarSign className={className} />;
}

const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-blue-500',
  registration: 'bg-green-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-gray-500',
  cancelled: 'bg-red-500',
};

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  upcoming: { en: 'Upcoming', ar: 'قادمة' },
  registration: { en: 'Registration Open', ar: 'التسجيل مفتوح' },
  in_progress: { en: 'In Progress', ar: 'جارية' },
  completed: { en: 'Completed', ar: 'مكتملة' },
  cancelled: { en: 'Cancelled', ar: 'ملغاة' },
};

const TOURNAMENT_GAME_TYPE_ALIASES: Record<string, string> = {
  dominoes: 'domino',
};

function getStatusLabel(s: string, en: boolean) {
  return en ? STATUS_LABELS[s]?.en || s : STATUS_LABELS[s]?.ar || s;
}

function normalizeTournamentGameType(gameType: string | null | undefined): string {
  const normalized = String(gameType || '').trim().toLowerCase();
  return TOURNAMENT_GAME_TYPE_ALIASES[normalized] || normalized;
}

function isRegistrationWindowOpen(tournament: {
  status: string;
  registrationStartsAt?: string | null;
  registrationEndsAt?: string | null;
  startsAt?: string | null;
}): boolean {
  if (tournament.status !== 'registration' && tournament.status !== 'upcoming') {
    return false;
  }

  const now = Date.now();

  if (tournament.registrationStartsAt) {
    const startsAt = new Date(tournament.registrationStartsAt).getTime();
    if (!Number.isNaN(startsAt) && now < startsAt) {
      return false;
    }
  }

  if (tournament.registrationEndsAt) {
    const endsAt = new Date(tournament.registrationEndsAt).getTime();
    if (!Number.isNaN(endsAt) && now > endsAt) {
      return false;
    }
  }

  if (tournament.startsAt) {
    const startsAt = new Date(tournament.startsAt).getTime();
    if (!Number.isNaN(startsAt) && now >= startsAt) {
      return false;
    }
  }

  return true;
}

function parsePrizeDistribution(rawDistribution: string | null | undefined): number[] {
  if (!rawDistribution) return [];

  try {
    const parsed = JSON.parse(rawDistribution);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => Number.parseFloat(String(entry)))
        .filter((entry) => Number.isFinite(entry) && entry > 0);
    }
  } catch {
    // Ignore malformed payload and fallback to empty.
  }

  return [];
}

function buildTournamentPublicUrl(slugOrId: string): string {
  if (typeof window === "undefined") return `/tournaments/${slugOrId}`;
  return `${window.location.origin}/tournaments/${slugOrId}`;
}

function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate).getTime();
    const update = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) { setTimeLeft(''); return; }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      else setTimeLeft(`${mins}m ${secs}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

function useTournamentGameConfig() {
  const { data: multiplayerGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ['/api/multiplayer-games'],
    staleTime: 60000,
  });

  return useMemo(
    () => ({ ...FALLBACK_GAME_CONFIG, ...buildGameConfig(multiplayerGames) }),
    [multiplayerGames],
  );
}

interface UserRefundInfo {
  amount: string;
  currency: string;
  reason: 'cancelled' | 'deleted';
}

interface TournamentListItem {
  id: string;
  name: string;
  nameAr: string;
  isPublished: boolean;
  shareSlug: string | null;
  coverImageUrl: string | null;
  promoVideoUrl: string | null;
  gameType: string;
  format: string;
  status: string;
  maxPlayers: number;
  minPlayers: number;
  autoStartOnFull: boolean;
  autoStartPlayerCount: number | null;
  entryFee: string;
  prizePool: string;
  currency?: string | null;
  prizeDistributionMethod: string;
  prizeDistribution: string | null;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  startsAt: string | null;
  participantCount: number;
  isRegistered?: boolean;
  userRefund?: UserRefundInfo | null;
}

interface TournamentMatch {
  id: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1Score: number;
  player2Score: number;
  status: string;
  challengeId: string | null;
}

interface TournamentParticipant {
  id: string;
  userId: string;
  seed: number;
  isEliminated: boolean;
  wins: number;
  losses: number;
  placement: number | null;
  prizeWon: string;
  username: string;
  nickname: string | null;
  profilePicture: string | null;
}

interface TournamentDetail {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  descriptionAr: string | null;
  isPublished: boolean;
  shareSlug: string | null;
  coverImageUrl: string | null;
  promoVideoUrl: string | null;
  gameType: string;
  format: string;
  status: string;
  maxPlayers: number;
  minPlayers: number;
  autoStartOnFull: boolean;
  autoStartPlayerCount: number | null;
  entryFee: string;
  prizePool: string;
  currency?: string | null;
  prizeDistributionMethod: string;
  prizeDistribution: string | null;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  currentRound: number;
  totalRounds: number;
  startsAt: string | null;
  endsAt: string | null;
  winnerId: string | null;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  isRegistered: boolean;
  participantCount: number;
  userRefund?: UserRefundInfo | null;
}

export function TournamentRefundBanner({
  refund,
  variant,
  en,
  testId,
}: {
  refund: UserRefundInfo;
  variant: 'list' | 'detail';
  en: boolean;
  testId?: string;
}) {
  const amountText = formatTournamentAmountText(refund.amount, refund.currency);
  const isProject = String(refund.currency).toLowerCase() === 'project';
  const reasonEn = refund.reason === 'deleted' ? 'tournament was deleted' : 'tournament was cancelled';
  const reasonAr = refund.reason === 'deleted' ? 'تم حذف البطولة' : 'تم إلغاء البطولة';
  const walletEn = isProject ? 'project wallet' : 'cash balance';
  const walletAr = isProject ? 'محفظتك' : 'رصيدك النقدي';
  const headline = en
    ? `Refunded ${amountText} to your ${walletEn}`
    : `تم استرداد ${amountText} إلى ${walletAr}`;
  const subline = en
    ? `Because the ${reasonEn}.`
    : `لأن ${reasonAr}.`;
  const containerClass = variant === 'detail'
    ? 'flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 sm:p-4'
    : 'mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm';
  return (
    <div className={containerClass} data-testid={testId}>
      <ArrowDownToLine className={variant === 'detail' ? 'mt-0.5 h-5 w-5 shrink-0 text-emerald-500' : 'mt-0.5 h-4 w-4 shrink-0 text-emerald-500'} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-emerald-700 dark:text-emerald-300">{headline}</div>
        <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">{subline}</div>
      </div>
    </div>
  );
}

export default function TournamentsPage() {
  const [, params] = useRoute('/tournaments/:id');
  const tournamentId = params?.id;

  // Show detail if ID present
  if (tournamentId) {
    return <TournamentDetailView id={tournamentId} />;
  }

  return <TournamentListView />;
}

function TournamentCountdown({ startsAt }: { startsAt: string | null }) {
  const timeLeft = useCountdown(startsAt);
  if (!timeLeft) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-mono text-amber-500">
      <Timer className="w-3 h-3" />
      {timeLeft}
    </span>
  );
}

function TournamentListView() {
  const { language, dir } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [listTab, setListTab] = useState<'all' | 'mine'>('all');
  const en = language === 'en';
  const tournamentGameConfig = useTournamentGameConfig();

  const handleShareTournament = async (tournament: TournamentListItem) => {
    const tournamentPath = String(tournament.shareSlug || tournament.id);
    const tournamentUrl = buildTournamentPublicUrl(tournamentPath);
    const title = en ? tournament.name : tournament.nameAr;
    const text = en
      ? `Join ${title} on VEX tournaments`
      : `انضم إلى ${title} في بطولات VEX`;

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text, url: tournamentUrl });
        return;
      }

      await navigator.clipboard.writeText(tournamentUrl);
      toast({
        title: en ? 'Link copied' : 'تم نسخ الرابط',
        description: en ? 'Tournament link copied to clipboard' : 'تم نسخ رابط البطولة',
      });
    } catch {
      toast({
        title: en ? 'Share failed' : 'فشل المشاركة',
        variant: 'destructive',
      });
    }
  };

  const { data: tournaments = [], isLoading, isError, error, refetch } = useQuery<TournamentListItem[]>({
    queryKey: ['/api/tournaments'],
  });

  const formatDate = (d: string | null) => {
    if (!d) return en ? 'TBD' : 'يحدد لاحقاً';
    return new Date(d).toLocaleDateString(en ? 'en-US' : 'ar-SA', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  // Separate active/upcoming and completed
  const activeTournaments = tournaments.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const displayList = listTab === 'all' ? tournaments : tournaments.filter(t => t.isRegistered);

  return (
    <div className="container max-w-4xl mx-auto min-h-[100svh] p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 sm:space-y-6" dir={dir}>
      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            {en ? 'Tournaments' : 'البطولات'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {en ? 'Compete against the best players' : 'تنافس ضد أفضل اللاعبين'}
          </p>
        </div>
      </div>

      {/* Tab filter: All / My Tournaments */}
      {user && (
        <div className="flex gap-2">
          <Button
            variant={listTab === 'all' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 min-h-[44px]"
            onClick={() => setListTab('all')}
          >
            <Trophy className="w-4 h-4 me-1" />
            {en ? 'All Tournaments' : 'كل البطولات'}
          </Button>
          <Button
            variant={listTab === 'mine' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 min-h-[44px]"
            onClick={() => setListTab('mine')}
          >
            <Filter className="w-4 h-4 me-1" />
            {en ? 'My Tournaments' : 'بطولاتي'}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <XCircle className="w-12 h-12 mx-auto text-red-500/70" />
            <div>
              <h3 className="text-lg font-semibold mb-1">{en ? 'Unable to Load Tournaments' : 'تعذر تحميل البطولات'}</h3>
              <p className="text-sm text-muted-foreground">
                {(error as Error | undefined)?.message || (en ? 'Please try again in a moment.' : 'حاول مرة أخرى بعد قليل.')}
              </p>
            </div>
            <Button type="button" className="min-h-[44px]" onClick={() => void refetch()}>
              {en ? 'Retry' : 'إعادة المحاولة'}
            </Button>
          </CardContent>
        </Card>
      ) : displayList.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">
              {listTab === 'mine'
                ? (en ? 'No Registered Tournaments' : 'لا توجد بطولات مسجلة')
                : (en ? 'No Tournaments Yet' : 'لا توجد بطولات بعد')
              }
            </h3>
            <p className="text-muted-foreground">
              {listTab === 'mine'
                ? (en ? 'Register for a tournament to see it here' : 'سجّل في بطولة لتظهر هنا')
                : (en ? 'Check back soon for upcoming tournaments!' : 'تحقق قريباً من البطولات القادمة!')
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayList.map(t => {
            const gameInfo = tournamentGameConfig[normalizeTournamentGameType(t.gameType)] || tournamentGameConfig.chess;
            const isUpcoming = t.status === 'upcoming' || t.status === 'registration';
            return (
              <Card
                key={t.id}
                className="hover-elevate cursor-pointer transition-all"
                onClick={() => navigate(`/tournaments/${t.shareSlug || t.id}`)}
              >
                <CardContent className="p-0 overflow-hidden">
                  {t.coverImageUrl && (
                    <img
                      src={t.coverImageUrl}
                      alt={en ? t.name : t.nameAr}
                      className="h-32 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl border bg-gradient-to-br from-muted to-muted/50 p-1.5 sm:h-[58px] sm:w-[58px] ${getGameIconSurfaceClass(gameInfo)}`}>
                        <GameConfigIcon config={gameInfo} fallbackIcon={gameInfo.icon} className={gameInfo.iconUrl ? "h-full w-full" : `h-10 w-10 ${getGameIconToneClass(gameInfo.color)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base sm:text-lg truncate">
                            {en ? t.name : t.nameAr}
                          </h3>
                          <Badge className={`${STATUS_COLORS[t.status] || 'bg-gray-500'} text-white`}>
                            {getStatusLabel(t.status, en)}
                          </Badge>
                          {t.autoStartOnFull && (
                            <Badge variant="outline" className="border-cyan-500/30 text-cyan-500">
                              {en ? `Quick Start @ ${t.autoStartPlayerCount || t.minPlayers}` : `بدء سريع عند ${t.autoStartPlayerCount || t.minPlayers}`}
                            </Badge>
                          )}
                          {t.coverImageUrl && (
                            <Badge variant="outline" className="gap-1">
                              <ImageIcon className="w-3 h-3" />
                              {en ? 'Cover' : 'صورة'}
                            </Badge>
                          )}
                          {t.promoVideoUrl && (
                            <Badge variant="outline" className="gap-1">
                              <Video className="w-3 h-3" />
                              {en ? 'Video' : 'فيديو'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border p-0.5 ${getGameIconSurfaceClass(gameInfo)}`}>
                              <GameConfigIcon config={gameInfo} fallbackIcon={gameInfo.icon} className={gameInfo.iconUrl ? "h-full w-full" : `h-4 w-4 ${getGameIconToneClass(gameInfo.color)}`} />
                            </span>
                            {en ? gameInfo.name : gameInfo.nameAr}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {t.participantCount}/{t.maxPlayers}
                          </span>
                          {parseFloat(t.entryFee) > 0 && (
                            <span className="flex items-center gap-1" data-testid={`tournament-entry-${t.id}`}>
                              <TournamentCurrencyBadge currency={t.currency} className="w-4 h-4" />
                              {formatTournamentAmountText(t.entryFee, t.currency)}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-amber-500 font-semibold" data-testid={`tournament-prize-${t.id}`}>
                            <Trophy className="w-4 h-4" />
                            {formatTournamentAmountText(t.prizePool, t.currency)}
                          </span>
                          {parsePrizeDistribution(t.prizeDistribution).slice(0, 3).map((percentage, index) => (
                            <Badge key={`${t.id}-distribution-${index}`} variant="outline" className="text-xs">
                              {en ? `Top ${index + 1}: ${percentage}%` : `المركز ${index + 1}: ${percentage}%`}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {t.startsAt && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {formatDate(t.startsAt)}
                            </span>
                          )}
                          {isUpcoming && t.startsAt && <TournamentCountdown startsAt={t.startsAt} />}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="min-h-[44px] min-w-[44px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleShareTournament(t);
                          }}
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <ChevronRight className="hidden sm:block w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                    {t.userRefund && (t.status === 'cancelled' || t.userRefund.reason === 'deleted') && (
                      <TournamentRefundBanner
                        refund={t.userRefund}
                        variant="list"
                        en={en}
                        testId={`tournament-refund-${t.id}`}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TournamentDetailView({ id }: { id: string }) {
  const { language, dir } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const en = language === 'en';
  const tournamentGameConfig = useTournamentGameConfig();

  const { data: tournament, isLoading, isError, error, refetch } = useQuery<TournamentDetail>({
    queryKey: [`/api/tournaments/${id}`],
  });

  const tournamentCurrency = normalizeTournamentCurrencyType(tournament?.currency);

  const projectWalletEnabled = !!user && tournamentCurrency === 'project';
  const {
    data: projectWallet,
    isLoading: isProjectWalletLoading,
    isError: isProjectWalletError,
  } = useQuery<{
    totalBalance: string;
    currencySymbol: string;
  }>({
    queryKey: ["/api/project-currency/wallet"],
    enabled: projectWalletEnabled,
    queryFn: async () => {
      const res = await fetch("/api/project-currency/wallet", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load project wallet");
      return res.json();
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/tournaments/${id}/register`),
    onSuccess: async () => {
      toast({ title: en ? 'Registered!' : 'تم التسجيل!' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/tournaments/${id}`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/user'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/project-currency/wallet'] }),
      ]);
    },
    onError: (err: Error) => {
      toast({ title: en ? 'Error' : 'خطأ', description: err.message, variant: 'destructive' });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/tournaments/${id}/register`),
    onSuccess: async () => {
      toast({ title: en ? 'Withdrawn' : 'تم الانسحاب' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/tournaments/${id}`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/user'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/project-currency/wallet'] }),
      ]);
    },
    onError: (err: Error) => {
      toast({ title: en ? 'Error' : 'خطأ', description: err.message, variant: 'destructive' });
    },
  });

  const statusLabel = (s: string) => getStatusLabel(s, en);

  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto min-h-[100svh] p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 sm:space-y-6" dir={dir}>
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <BackButton />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container max-w-4xl mx-auto min-h-[100svh] p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" dir={dir}>
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 mb-6">
          <BackButton />
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            {isError ? (
              <>
                <XCircle className="w-16 h-16 mx-auto text-red-500/70 mb-4" />
                <p className="font-semibold mb-2">{en ? 'Failed to Load Tournament' : 'فشل تحميل البطولة'}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {(error as Error | undefined)?.message || (en ? 'Please try again.' : 'يرجى المحاولة مرة أخرى.')}
                </p>
                <Button type="button" className="min-h-[44px]" onClick={() => void refetch()}>
                  {en ? 'Retry' : 'إعادة المحاولة'}
                </Button>
              </>
            ) : (
              <>
                <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-50" />
                <p>{en ? 'Tournament not found' : 'البطولة غير موجودة'}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const gameInfo = tournamentGameConfig[normalizeTournamentGameType(tournament.gameType)] || tournamentGameConfig.chess;
  const registrationOpen = isRegistrationWindowOpen(tournament);
  const canRegister = registrationOpen && !tournament.isRegistered;
  const canWithdraw = registrationOpen && tournament.isRegistered;

  const entryFeeNumber = Number.parseFloat(tournament.entryFee || '0');
  const safeEntryFee = Number.isFinite(entryFeeNumber) ? entryFeeNumber : 0;
  const availableBalanceRaw = tournamentCurrency === 'project'
    ? projectWallet?.totalBalance
    : user?.balance;
  const availableBalanceNumber = Number.parseFloat(String(availableBalanceRaw ?? '0'));
  const safeAvailableBalance = Number.isFinite(availableBalanceNumber) ? availableBalanceNumber : 0;
  const balanceLoaded = tournamentCurrency === 'project'
    ? projectWallet !== undefined
    : user !== null && user !== undefined;
  const balanceLoading = tournamentCurrency === 'project'
    ? projectWalletEnabled && isProjectWalletLoading && !projectWallet
    : false;
  const balanceErrored = tournamentCurrency === 'project'
    ? isProjectWalletError && !projectWallet
    : false;
  const hasEnoughBalance = safeAvailableBalance + 1e-9 >= safeEntryFee;
  const balanceText = balanceLoaded
    ? formatTournamentAmountText(safeAvailableBalance.toFixed(2), tournament.currency)
    : (en ? 'Loading…' : 'جاري التحميل…');
  const entryFeeText = formatTournamentAmountText(tournament.entryFee, tournament.currency);
  const insufficientBalance = canRegister && safeEntryFee > 0 && balanceLoaded && !hasEnoughBalance;
  const blockRegister = canRegister && safeEntryFee > 0 && (!balanceLoaded || !hasEnoughBalance);

  // Build bracket data by round
  const rounds: Record<number, TournamentMatch[]> = {};
  tournament.matches.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });
  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  // Participant lookup
  const pMap = new Map<string, TournamentParticipant>();
  tournament.participants.forEach(p => pMap.set(p.userId, p));

  const getPlayerName = (id: string | null) => {
    if (!id) return en ? 'TBD' : 'يحدد';
    const p = pMap.get(id);
    return p?.nickname || p?.username || '???';
  };

  const getRoundLabel = (round: number, total: number) => {
    if (round === total) return en ? 'Final' : 'النهائي';
    if (round === total - 1) return en ? 'Semi-Final' : 'نصف النهائي';
    if (round === total - 2) return en ? 'Quarter-Final' : 'ربع النهائي';
    return en ? `Round ${round}` : `الجولة ${round}`;
  };

  const handleShareTournament = async () => {
    const tournamentUrl = buildTournamentPublicUrl(String(tournament.shareSlug || tournament.id));
    const title = en ? tournament.name : tournament.nameAr;
    const text = en
      ? `Join ${title} on VEX tournaments`
      : `انضم إلى ${title} في بطولات VEX`;

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text, url: tournamentUrl });
        return;
      }

      await navigator.clipboard.writeText(tournamentUrl);
      toast({
        title: en ? 'Link copied' : 'تم نسخ الرابط',
        description: en ? 'Tournament link copied to clipboard' : 'تم نسخ رابط البطولة',
      });
    } catch {
      toast({
        title: en ? 'Share failed' : 'فشل المشاركة',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container max-w-5xl mx-auto min-h-[100svh] p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 sm:space-y-6" dir={dir}>
      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
        <BackButton />
        <div className="flex flex-1 items-start gap-3">
          <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-muted/40 p-1 shadow-sm ${getGameIconSurfaceClass(gameInfo)}`}>
            <GameConfigIcon config={gameInfo} fallbackIcon={gameInfo.icon} className={gameInfo.iconUrl ? "h-full w-full" : `h-8 w-8 ${getGameIconToneClass(gameInfo.color)}`} />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold">{en ? tournament.name : tournament.nameAr}</h1>
              <Badge className={`${STATUS_COLORS[tournament.status]} text-white`}>
                {statusLabel(tournament.status)}
              </Badge>
            </div>
            {(tournament.description || tournament.descriptionAr) && (
              <p className="text-sm text-muted-foreground mt-1">
                {en ? tournament.description : tournament.descriptionAr}
              </p>
            )}
            {(tournament.status === 'upcoming' || tournament.status === 'registration') && tournament.startsAt && (
              <div className="mt-2">
                <TournamentCountdown startsAt={tournament.startsAt} />
              </div>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => {
            void handleShareTournament();
          }}
        >
          <Share2 className="w-4 h-4" />
        </Button>
      </div>

      {(tournament.coverImageUrl || tournament.promoVideoUrl) && (
        <Card>
          <CardContent className="p-3 space-y-3">
            {tournament.coverImageUrl && (
              <img
                src={tournament.coverImageUrl}
                alt={en ? tournament.name : tournament.nameAr}
                className="h-48 w-full rounded-xl border object-cover"
              />
            )}
            {tournament.promoVideoUrl && (
              <video
                src={tournament.promoVideoUrl}
                className="h-52 w-full rounded-xl border object-cover"
                controls
                preload="metadata"
              />
            )}
          </CardContent>
        </Card>
      )}

      {tournament.userRefund && (tournament.status === 'cancelled' || tournament.userRefund.reason === 'deleted') && (
        <TournamentRefundBanner
          refund={tournament.userRefund}
          variant="detail"
          en={en}
          testId={`tournament-detail-refund-${tournament.id}`}
        />
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className={`mx-auto mb-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border bg-muted/40 p-1 ${getGameIconSurfaceClass(gameInfo)}`}>
              <GameConfigIcon config={gameInfo} fallbackIcon={gameInfo.icon} className={gameInfo.iconUrl ? "h-full w-full" : `h-8 w-8 ${getGameIconToneClass(gameInfo.color)}`} />
            </div>
            <div className="text-sm font-bold">{en ? gameInfo.name : gameInfo.nameAr}</div>
            <div className="text-xs text-muted-foreground">{en ? 'Game' : 'اللعبة'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="w-6 h-6 mx-auto text-blue-500 mb-1" />
            <div className="text-sm font-bold">{tournament.participantCount}/{tournament.maxPlayers}</div>
            <div className="text-xs text-muted-foreground">{en ? 'Players' : 'اللاعبون'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TournamentCurrencyBadge currency={tournament.currency} className="w-6 h-6 mx-auto text-green-500 mb-1" />
            <div className="text-sm font-bold" data-testid="tournament-detail-entry-fee">
              {formatTournamentAmountText(tournament.entryFee, tournament.currency)}
            </div>
            <div className="text-xs text-muted-foreground">{en ? 'Entry Fee' : 'رسوم الدخول'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Trophy className="w-6 h-6 mx-auto text-amber-500 mb-1" />
            <div className="text-sm font-bold" data-testid="tournament-detail-prize-pool">
              {formatTournamentAmountText(tournament.prizePool, tournament.currency)}
            </div>
            <div className="text-xs text-muted-foreground">{en ? 'Prize Pool' : 'مجموع الجوائز'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">{en ? 'Quick Start' : 'البدء السريع'}</p>
              <p className="font-medium">
                {tournament.autoStartOnFull
                  ? (en
                    ? `Starts automatically at ${tournament.autoStartPlayerCount || tournament.minPlayers} players`
                    : `تبدأ تلقائيا عند ${tournament.autoStartPlayerCount || tournament.minPlayers} لاعب`)
                  : (en ? 'Manual start by admin' : 'تبدأ يدويا من الإدارة')}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">{en ? 'Prize Model' : 'نظام الجوائز'}</p>
              <p className="font-medium capitalize">{String(tournament.prizeDistributionMethod || 'top_3').replace(/_/g, ' ')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {parsePrizeDistribution(tournament.prizeDistribution).map((percentage, index) => (
              <Badge key={`detail-prize-${index}`} variant="outline">
                {en ? `Top ${index + 1}: ${percentage}%` : `المركز ${index + 1}: ${percentage}%`}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="break-all">{buildTournamentPublicUrl(String(tournament.shareSlug || tournament.id))}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[36px]"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(buildTournamentPublicUrl(String(tournament.shareSlug || tournament.id)));
                  toast({ title: en ? 'Link copied' : 'تم نسخ الرابط' });
                } catch {
                  toast({ title: en ? 'Copy failed' : 'فشل النسخ', variant: 'destructive' });
                }
              }}
            >
              <Copy className="w-3 h-3 me-1" />
              {en ? 'Copy' : 'نسخ'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Register/Withdraw */}
      {user && (canRegister || canWithdraw) && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-semibold">
                {canRegister
                  ? (en ? 'Join this tournament' : 'انضم لهذه البطولة')
                  : (en ? 'You are registered' : 'أنت مسجل')
                }
              </h3>
              <p className="text-sm text-muted-foreground">
                {safeEntryFee > 0
                  ? (en
                    ? `Entry fee: ${entryFeeText}`
                    : `رسوم الدخول: ${entryFeeText}`)
                  : (en ? 'Free entry' : 'دخول مجاني')
                }
              </p>
              {safeEntryFee > 0 && (
                <p
                  className={`flex items-center gap-1.5 text-sm font-medium ${insufficientBalance || balanceErrored ? 'text-destructive' : 'text-muted-foreground'}`}
                  data-testid="tournament-detail-user-balance"
                  data-currency={tournamentCurrency}
                  data-balance-state={balanceErrored ? 'error' : balanceLoading ? 'loading' : 'ready'}
                >
                  <Wallet className="w-4 h-4" aria-hidden />
                  <span>
                    {en ? `Your balance: ${balanceText}` : `رصيدك: ${balanceText}`}
                  </span>
                </p>
              )}
              {insufficientBalance && (
                <p
                  className="text-xs text-destructive"
                  data-testid="tournament-detail-insufficient-balance"
                >
                  {en
                    ? `Not enough balance. You need ${entryFeeText} to register.`
                    : `الرصيد غير كافٍ. تحتاج إلى ${entryFeeText} للتسجيل.`}
                </p>
              )}
              {balanceErrored && (
                <p
                  className="text-xs text-destructive"
                  data-testid="tournament-detail-balance-error"
                >
                  {en
                    ? "Couldn't load your wallet balance. Try again."
                    : 'تعذر تحميل رصيد محفظتك. حاول مرة أخرى.'}
                </p>
              )}
            </div>
            {canRegister ? (
              <Button
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending || blockRegister}
                className="w-full sm:w-auto min-h-[44px] bg-gradient-to-r from-green-500 to-emerald-600"
                data-testid="tournament-detail-register"
              >
                <Swords className="w-4 h-4 me-2" />
                {en ? 'Register' : 'تسجيل'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => withdrawMutation.mutate()}
                disabled={withdrawMutation.isPending}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {en ? 'Withdraw' : 'انسحاب'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={tournament.matches.length > 0 ? "bracket" : "participants"} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
          <TabsTrigger value="bracket">
            <Swords className="w-4 h-4 me-2" />
            {en ? 'Bracket' : 'الشجرة'}
          </TabsTrigger>
          <TabsTrigger value="participants">
            <Users className="w-4 h-4 me-2" />
            {en ? 'Players' : 'اللاعبون'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bracket" className="mt-4">
          {roundNumbers.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Swords className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                <p className="text-muted-foreground">
                  {en ? 'Bracket will be generated when tournament starts' : 'سيتم إنشاء الشجرة عند بدء البطولة'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="w-full">
              <div className="flex gap-6 min-w-max pb-4">
                {roundNumbers.map((round) => (
                  <div key={round} className="min-w-[220px]">
                    <h4 className="text-sm font-semibold text-center mb-3 text-muted-foreground">
                      {getRoundLabel(round, tournament.totalRounds)}
                    </h4>
                    <div className="space-y-4" style={{ paddingTop: `${(Math.pow(2, round - 1) - 1) * 32}px` }}>
                      {rounds[round]?.sort((a, b) => a.matchNumber - b.matchNumber).map((match) => {
                        const p1Name = getPlayerName(match.player1Id);
                        const p2Name = getPlayerName(match.player2Id);
                        const isP1Winner = match.winnerId === match.player1Id && match.winnerId;
                        const isP2Winner = match.winnerId === match.player2Id && match.winnerId;
                        const isComplete = match.status === 'completed';

                        return (
                          <div
                            key={match.id}
                            className={`rounded-lg border overflow-hidden ${isComplete ? 'border-muted' : 'border-primary/30'
                              }`}
                            style={{ marginBottom: `${(Math.pow(2, round - 1) - 1) * 64}px` }}
                          >
                            {/* Player 1 */}
                            <div className={`flex items-center justify-between px-3 py-2 text-sm ${isP1Winner ? 'bg-green-500/10 font-semibold' : 'bg-muted/30'
                              }`}>
                              <span className={`truncate max-w-[140px] ${!match.player1Id && 'text-muted-foreground italic'}`}>
                                {p1Name}
                              </span>
                              <span className="text-xs font-mono">
                                {isComplete ? match.player1Score : ''}
                              </span>
                            </div>
                            <div className="border-t border-muted" />
                            {/* Player 2 */}
                            <div className={`flex items-center justify-between px-3 py-2 text-sm ${isP2Winner ? 'bg-green-500/10 font-semibold' : 'bg-muted/30'
                              }`}>
                              <span className={`truncate max-w-[140px] ${!match.player2Id && 'text-muted-foreground italic'}`}>
                                {p2Name}
                              </span>
                              <span className="text-xs font-mono">
                                {isComplete ? match.player2Score : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Winner column */}
                {tournament.winnerId && (
                  <div className="min-w-[180px] flex items-center justify-center">
                    <div className="text-center p-4">
                      <Trophy className="w-12 h-12 mx-auto text-amber-500 mb-2" />
                      <div className="font-bold text-lg">{getPlayerName(tournament.winnerId)}</div>
                      <Badge className="bg-amber-500 mt-1">
                        {en ? 'Champion' : 'البطل'}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="participants" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {tournament.participants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{en ? 'No participants yet' : 'لا يوجد مشاركين بعد'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tournament.participants
                    .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999))
                    .map((p, idx) => (
                      <div
                        key={p.id}
                        className={`flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 rounded-lg ${p.isEliminated ? 'bg-muted/30 opacity-60' : 'bg-muted/50'
                          }`}
                      >
                        <span className="text-sm font-mono w-8 text-center text-muted-foreground">
                          #{p.seed || idx + 1}
                        </span>
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={p.profilePicture || undefined} />
                          <AvatarFallback>{(p.nickname || p.username)[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm truncate block">
                            {p.nickname || p.username}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {p.wins}W - {p.losses}L
                          </span>
                        </div>
                        {p.placement === 1 && (
                          <Badge className="bg-amber-500">
                            <Trophy className="w-3 h-3 me-1" /> 1st
                          </Badge>
                        )}
                        {p.placement === 2 && (
                          <Badge className="bg-gray-400">2nd</Badge>
                        )}
                        {p.placement === 3 && (
                          <Badge className="bg-amber-700">3rd</Badge>
                        )}
                        {p.isEliminated && !p.placement && (
                          <Badge variant="outline" className="text-red-500 border-red-500">
                            {en ? 'Eliminated' : 'مُقصى'}
                          </Badge>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
