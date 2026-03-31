import { useState, useEffect } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Trophy, Users, Clock, Crown, Swords, Shield,
  DollarSign, Calendar, ChevronRight, Gamepad2,
  Target, Gem, ArrowRight, Timer, Filter
} from "lucide-react";

const GAME_ICONS: Record<string, { icon: typeof Crown; color: string; name: string; nameAr: string }> = {
  chess: { icon: Crown, name: 'Chess', nameAr: 'شطرنج', color: 'text-amber-500' },
  backgammon: { icon: Shield, name: 'Backgammon', nameAr: 'طاولة', color: 'text-emerald-500' },
  domino: { icon: Target, name: 'Domino', nameAr: 'دومينو', color: 'text-blue-500' },
  tarneeb: { icon: Gem, name: 'Tarneeb', nameAr: 'طرنيب', color: 'text-purple-500' },
  baloot: { icon: Gem, name: 'Baloot', nameAr: 'بلوت', color: 'text-rose-500' },
  snake: { icon: Gamepad2, name: 'Snake Arena', nameAr: 'أرينا الثعبان', color: 'text-indigo-500' },
};

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

function getStatusLabel(s: string, en: boolean) {
  return en ? STATUS_LABELS[s]?.en || s : STATUS_LABELS[s]?.ar || s;
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

interface TournamentListItem {
  id: string;
  name: string;
  nameAr: string;
  gameType: string;
  format: string;
  status: string;
  maxPlayers: number;
  entryFee: string;
  prizePool: string;
  startsAt: string | null;
  participantCount: number;
  isRegistered?: boolean;
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
  gameType: string;
  format: string;
  status: string;
  maxPlayers: number;
  minPlayers: number;
  entryFee: string;
  prizePool: string;
  prizeDistribution: string | null;
  currentRound: number;
  totalRounds: number;
  startsAt: string | null;
  endsAt: string | null;
  winnerId: string | null;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  isRegistered: boolean;
  participantCount: number;
}

export default function TournamentsPage() {
  const { t, language, dir } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute('/tournaments/:id');
  const tournamentId = params?.id;

  const en = language === 'en';

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
  const { t, language, dir } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [listTab, setListTab] = useState<'all' | 'mine'>('all');
  const en = language === 'en';

  const { data: tournaments = [], isLoading } = useQuery<TournamentListItem[]>({
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
    <div className="container max-w-4xl mx-auto p-4 space-y-6" dir={dir}>
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
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
            onClick={() => setListTab('all')}
          >
            <Trophy className="w-4 h-4 me-1" />
            {en ? 'All Tournaments' : 'كل البطولات'}
          </Button>
          <Button
            variant={listTab === 'mine' ? 'default' : 'outline'}
            size="sm"
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
            const gameInfo = GAME_ICONS[t.gameType] || GAME_ICONS.chess;
            const GameIcon = gameInfo.icon;
            const isUpcoming = t.status === 'upcoming' || t.status === 'registration';
            return (
              <Card
                key={t.id}
                className="hover-elevate cursor-pointer transition-all"
                onClick={() => navigate(`/tournaments/${t.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl bg-gradient-to-br from-muted to-muted/50`}>
                      <GameIcon className={`w-8 h-8 ${gameInfo.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg truncate">
                          {en ? t.name : t.nameAr}
                        </h3>
                        <Badge className={`${STATUS_COLORS[t.status] || 'bg-gray-500'} text-white`}>
                          {getStatusLabel(t.status, en)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Gamepad2 className="w-4 h-4" />
                          {en ? gameInfo.name : gameInfo.nameAr}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {t.participantCount}/{t.maxPlayers}
                        </span>
                        {parseFloat(t.entryFee) > 0 && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" />
                            {t.entryFee}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-amber-500 font-semibold">
                          <Trophy className="w-4 h-4" />
                          ${t.prizePool}
                        </span>
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
                    <ChevronRight className="w-5 h-5 text-muted-foreground mt-2" />
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
  const { t, language, dir } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const en = language === 'en';

  const { data: tournament, isLoading } = useQuery<TournamentDetail>({
    queryKey: ['/api/tournaments', id],
  });

  const registerMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/tournaments/${id}/register`),
    onSuccess: () => {
      toast({ title: en ? 'Registered!' : 'تم التسجيل!' });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', id] });
    },
    onError: (err: Error) => {
      toast({ title: en ? 'Error' : 'خطأ', description: err.message, variant: 'destructive' });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/tournaments/${id}/register`),
    onSuccess: () => {
      toast({ title: en ? 'Withdrawn' : 'تم الانسحاب' });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', id] });
    },
    onError: (err: Error) => {
      toast({ title: en ? 'Error' : 'خطأ', description: err.message, variant: 'destructive' });
    },
  });

  const statusLabel = (s: string) => getStatusLabel(s, en);

  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-6" dir={dir}>
        <div className="flex items-center gap-4">
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
      <div className="container max-w-4xl mx-auto p-4" dir={dir}>
        <div className="flex items-center gap-4 mb-6">
          <BackButton />
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p>{en ? 'Tournament not found' : 'البطولة غير موجودة'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const gameInfo = GAME_ICONS[tournament.gameType] || GAME_ICONS.chess;
  const GameIcon = gameInfo.icon;
  const canRegister = (tournament.status === 'registration' || tournament.status === 'upcoming') && !tournament.isRegistered;
  const canWithdraw = (tournament.status === 'registration' || tournament.status === 'upcoming') && tournament.isRegistered;

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

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-6" dir={dir}>
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{en ? tournament.name : tournament.nameAr}</h1>
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <GameIcon className={`w-6 h-6 mx-auto ${gameInfo.color} mb-1`} />
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
            <DollarSign className="w-6 h-6 mx-auto text-green-500 mb-1" />
            <div className="text-sm font-bold">${tournament.entryFee}</div>
            <div className="text-xs text-muted-foreground">{en ? 'Entry Fee' : 'رسوم الدخول'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Trophy className="w-6 h-6 mx-auto text-amber-500 mb-1" />
            <div className="text-sm font-bold">${tournament.prizePool}</div>
            <div className="text-xs text-muted-foreground">{en ? 'Prize Pool' : 'مجموع الجوائز'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Register/Withdraw */}
      {user && (canRegister || canWithdraw) && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">
                {canRegister
                  ? (en ? 'Join this tournament' : 'انضم لهذه البطولة')
                  : (en ? 'You are registered' : 'أنت مسجل')
                }
              </h3>
              <p className="text-sm text-muted-foreground">
                {parseFloat(tournament.entryFee) > 0
                  ? (en ? `Entry fee: $${tournament.entryFee}` : `رسوم الدخول: $${tournament.entryFee}`)
                  : (en ? 'Free entry' : 'دخول مجاني')
                }
              </p>
            </div>
            {canRegister ? (
              <Button
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending}
                className="bg-gradient-to-r from-green-500 to-emerald-600"
              >
                <Swords className="w-4 h-4 me-2" />
                {en ? 'Register' : 'تسجيل'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => withdrawMutation.mutate()}
                disabled={withdrawMutation.isPending}
              >
                {en ? 'Withdraw' : 'انسحاب'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={tournament.matches.length > 0 ? "bracket" : "participants"} className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1">
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
                            className={`rounded-lg border overflow-hidden ${
                              isComplete ? 'border-muted' : 'border-primary/30'
                            }`}
                            style={{ marginBottom: `${(Math.pow(2, round - 1) - 1) * 64}px` }}
                          >
                            {/* Player 1 */}
                            <div className={`flex items-center justify-between px-3 py-2 text-sm ${
                              isP1Winner ? 'bg-green-500/10 font-semibold' : 'bg-muted/30'
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
                            <div className={`flex items-center justify-between px-3 py-2 text-sm ${
                              isP2Winner ? 'bg-green-500/10 font-semibold' : 'bg-muted/30'
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
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        p.isEliminated ? 'bg-muted/30 opacity-60' : 'bg-muted/50'
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
