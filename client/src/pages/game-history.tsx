import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { BackButton } from "@/components/BackButton";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  XCircle,
  Minus,
  Clock,
  Target,
  Loader2,
  History,
  DollarSign,
  Swords,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
} from "lucide-react";
import { type MultiplayerGameFromAPI, type GameConfigItem, buildGameConfig, resolveGameConfigEntry, getGameIconToneClass } from "@/lib/game-config";
import { GameConfigIcon } from "@/components/GameConfigIcon";

const ITEMS_PER_PAGE = 20;

interface ChallengeHistory {
  id: string;
  gameType: string;
  betAmount: string;
  currencyType?: 'project' | 'usd';
  status: string;
  winnerId?: string;
  player1Id: string;
  player2Id?: string;
  player1Name?: string;
  player2Name?: string;
  createdAt: string;
}

export default function GameHistoryPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [gameFilter, setGameFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: challenges, isLoading } = useQuery<ChallengeHistory[]>({
    queryKey: ["/api/challenges/my"],
  });

  const { data: apiGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ['/api/multiplayer-games'],
    staleTime: 60000,
  });

  // Build dynamic game config
  const gameConfig = useMemo<Record<string, GameConfigItem>>(
    () => buildGameConfig(apiGames),
    [apiGames],
  );

  const allCompleted = challenges?.filter(c => c.status === "completed" || c.status === "cancelled") || [];
  const active = challenges?.filter(c => c.status !== "completed" && c.status !== "cancelled") || [];

  const getResult = (c: ChallengeHistory) => {
    if (c.status === "cancelled") return "cancelled";
    if (!c.winnerId) return "draw";
    if (c.winnerId === user?.id) return "win";
    return "loss";
  };

  // Apply filters
  const completed = allCompleted.filter(c => {
    if (gameFilter !== "all" && c.gameType !== gameFilter) return false;
    if (resultFilter !== "all" && getResult(c) !== resultFilter) return false;
    return true;
  });

  const stats = {
    total: allCompleted.length,
    wins: allCompleted.filter(c => getResult(c) === "win").length,
    losses: allCompleted.filter(c => getResult(c) === "loss").length,
    draws: allCompleted.filter(c => getResult(c) === "draw").length,
  };
  const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  const totalEarnings = completed.reduce((sum, c) => {
    const bet = parseFloat(c.betAmount) || 0;
    const result = getResult(c);
    if (result === "win") return sum + bet;
    if (result === "loss") return sum - bet;
    return sum;
  }, 0);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatChallengeAmountText = (amount: number | string | undefined, currencyType?: 'project' | 'usd') => {
    const safeAmount = Number(amount || 0);
    return currencyType === 'project' ? `${safeAmount.toFixed(2)} VXC` : `$${safeAmount.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto min-h-[100svh] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_45%)] p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <History className="h-6 w-6 text-primary" />
        <h1 className="text-xl sm:text-2xl font-bold">
          {t('gameHistory.title')}
        </h1>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Swords className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">{t('gameHistory.games')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Trophy className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-xl font-bold text-green-500">{stats.wins}</p>
            <p className="text-xs text-muted-foreground">{t('gameHistory.wins')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <p className="text-xl font-bold text-red-500">{stats.losses}</p>
            <p className="text-xs text-muted-foreground">{t('gameHistory.losses')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold text-primary">{winRate}%</p>
            <p className="text-xs text-muted-foreground">{t('gameHistory.winRate')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <DollarSign className={cn("h-5 w-5 mx-auto mb-1", totalEarnings >= 0 ? "text-green-500" : "text-red-500")} />
            <p className={cn("text-xl font-bold", totalEarnings >= 0 ? "text-green-500" : "text-red-500")}>
              {totalEarnings >= 0 ? "+" : ""}{totalEarnings.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">{t('gameHistory.earnings')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Games */}
      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            {t('gameHistory.activeGames')}
          </h2>
          <div className="space-y-2">
            {active.map(c => {
              const cfg = resolveGameConfigEntry(gameConfig, c.gameType);
              return (
                <Card key={c.id} className="hover-elevate cursor-pointer">
                  <CardContent className="p-3 flex flex-wrap sm:flex-nowrap items-center gap-3" onClick={() => navigate(`/challenge/${c.id}/play`)}>
                    <div className={cn(
                      "h-8 w-8 shrink-0 rounded-md p-1",
                      cfg?.iconUrl ? "bg-muted/60" : "",
                    )}>
                      <GameConfigIcon
                        config={cfg}
                        fallbackIcon={Gamepad2}
                        className={cfg?.iconUrl ? "h-full w-full" : `h-full w-full ${getGameIconToneClass(cfg?.color)}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {language === "ar" ? cfg?.nameAr : cfg?.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        vs {c.player1Id === user?.id ? c.player2Name || "..." : c.player1Name || "..."}
                      </p>
                    </div>
                    <Badge variant="secondary" className="ms-auto sm:ms-0">{formatChallengeAmountText(c.betAmount, c.currencyType)}</Badge>
                    <Badge className="bg-green-500/20 text-green-500">
                      {t('gameHistory.live')}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Games */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
          <h2 className="text-lg font-semibold">
            {t('gameHistory.completedGames')}
            {completed.length !== allCompleted.length && (
              <span className="text-sm font-normal text-muted-foreground ms-2">
                ({completed.length}/{allCompleted.length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
            <Select value={gameFilter} onValueChange={setGameFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-10 sm:h-8 text-xs sm:text-sm">
                <SelectValue placeholder={t('gameHistory.game')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('gameHistory.allGames')}</SelectItem>
                {Object.entries(gameConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {language === "ar" ? cfg.nameAr : cfg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="w-full sm:w-[130px] h-10 sm:h-8 text-xs sm:text-sm">
                <SelectValue placeholder={t('gameHistory.result')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('gameHistory.all')}</SelectItem>
                <SelectItem value="win">{t('gameHistory.wins')}</SelectItem>
                <SelectItem value="loss">{t('gameHistory.losses')}</SelectItem>
                <SelectItem value="draw">{t('gameHistory.draws')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {completed.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t('gameHistory.noGames')}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ScrollArea className="max-h-[55svh] sm:max-h-[60vh]">
              <div className="space-y-2 pe-2">
                {completed.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map(c => {
                  const result = getResult(c);
                  const cfg = resolveGameConfigEntry(gameConfig, c.gameType);
                  const bet = parseFloat(c.betAmount) || 0;

                  return (
                    <Card key={c.id} className="animate-list-enter">
                      <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg shrink-0",
                          result === "win" ? "bg-green-500/10" : result === "loss" ? "bg-red-500/10" : "bg-muted"
                        )}>
                          <GameConfigIcon
                            config={cfg}
                            fallbackIcon={Gamepad2}
                            className={cn(
                              "h-5 w-5",
                              !cfg?.iconUrl && (result === "win"
                                ? "text-green-500"
                                : result === "loss"
                                  ? "text-red-500"
                                  : "text-muted-foreground"),
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {language === "ar" ? cfg?.nameAr : cfg?.name}
                            </span>
                            {result === "win" && (
                              <Badge className="bg-green-500/20 text-green-600 text-xs">
                                {t('gameHistory.win')}
                              </Badge>
                            )}
                            {result === "loss" && (
                              <Badge className="bg-red-500/20 text-red-600 text-xs">
                                {t('gameHistory.loss')}
                              </Badge>
                            )}
                            {result === "draw" && (
                              <Badge className="bg-muted text-muted-foreground text-xs">
                                {t('gameHistory.draw')}
                              </Badge>
                            )}
                            {result === "cancelled" && (
                              <Badge variant="outline" className="text-xs">
                                {t('gameHistory.cancelled')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            vs <span
                              className="hover:underline cursor-pointer text-primary/80"
                              onClick={() => {
                                const opponentId = c.player1Id === user?.id ? c.player2Id : c.player1Id;
                                if (opponentId) navigate(`/player/${opponentId}`);
                              }}
                            >
                              {c.player1Id === user?.id ? c.player2Name || "?" : c.player1Name || "?"}
                            </span>
                            <span className="mx-2">·</span>
                            {formatDate(c.createdAt)}
                          </p>
                        </div>
                        <div className="text-end sm:text-end self-end sm:self-auto shrink-0">
                          <p className={cn(
                            "font-mono font-bold text-sm",
                            result === "win" ? "text-green-500" : result === "loss" ? "text-red-500" : "text-muted-foreground"
                          )}>
                            {result === "win" ? "+" : result === "loss" ? "-" : ""}${bet.toFixed(2)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
            {/* Pagination */}
            {completed.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[40px] min-w-[40px]"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {Math.ceil(completed.length / ITEMS_PER_PAGE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[40px] min-w-[40px]"
                  disabled={page >= Math.ceil(completed.length / ITEMS_PER_PAGE)}
                  onClick={() => setPage(p => Math.min(Math.ceil(completed.length / ITEMS_PER_PAGE), p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
