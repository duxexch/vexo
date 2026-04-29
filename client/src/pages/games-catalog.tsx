import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GameConfigIcon } from "@/components/GameConfigIcon";
import { GameCardBackground } from "@/components/GameCardBackground";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { buildGameConfig, resolveGameConfigEntry, type GameConfigItem, type MultiplayerGameFromAPI } from "@/lib/game-config";
import { isArcadeGameKey } from "@shared/arcade-games";
import { cn } from "@/lib/utils";
import {
  Target,
  Gamepad2,
  type LucideIcon,
  Play,
  Eye,
  Users,
  Trophy,
  Flame,
  Zap,
  TrendingUp,
  Star,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface LiveMatch {
  id: string;
  gameType: string;
  player1Name: string;
  player2Name: string;
  spectatorCount: number;
  betAmount: number;
  status: string;
}

interface CatalogGameMetadata {
  key: string;
  players: string;
  duration: string;
  /** Optional defaults used ONLY for non-multiplayer browser games (snake/puzzle/memory)
   * that aren't backed by the multiplayer DB config. Multiplayer games (chess, backgammon,
   * domino, tarneeb, baloot) source 100% of their visuals from `multiplayerGameConfig`. */
  fallback?: {
    nameEn: string;
    nameAr: string;
    descriptionEn: string;
    descriptionAr: string;
    icon: LucideIcon;
    gradient: string;
    accentColor: string;
  };
}

interface CatalogGame extends Omit<GameConfigItem, "minStake" | "maxStake" | "houseFee"> {
  key: string;
  nameEn: string;
  descriptionEn?: string;
  players: string;
  duration: string;
  accentColorClass: string;
}

interface ExternalGameItem {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  category: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  accentColor?: string;
  minPlayers: number;
  maxPlayers: number;
  isFreeToPlay: boolean;
  playCount: number;
  rating?: string;
}

/**
 * Catalog metadata only — visuals (icon / gradient / color / thumbnail) for
 * multiplayer games (chess, backgammon, domino, tarneeb, baloot) come from
 * `multiplayerGameConfig` (which itself layers admin DB values on top of
 * `FALLBACK_GAME_CONFIG`). This guarantees admin uploads from the Visual
 * Identity panel propagate to the catalog without any code-level fallback
 * shadowing them.
 *
 * Browser-only mini-games (snake / puzzle / memory) are not in the multiplayer
 * DB, so their visuals live inline as `fallback` here.
 */
const CATALOG_METADATA: CatalogGameMetadata[] = [
  { key: "chess", players: "2", duration: "15-60 min" },
  { key: "backgammon", players: "2", duration: "10-30 min" },
  { key: "domino", players: "2-4", duration: "15-45 min" },
  { key: "tarneeb", players: "4", duration: "20-40 min" },
  { key: "baloot", players: "4", duration: "30-60 min" },
  {
    key: "snake",
    players: "1-4",
    duration: "5-15 min",
    fallback: {
      nameEn: "Snake Arena",
      nameAr: "أرينا الثعبان",
      descriptionEn: "3D snake arena with 360° movement, power-ups and weather effects",
      descriptionAr: "ساحة الثعبان ثلاثية الأبعاد مع حركة 360 درجة ومؤثرات طقس",
      icon: Gamepad2,
      gradient: "from-indigo-500/30 via-indigo-600/20 to-violet-700/10",
      accentColor: "text-indigo-500",
    },
  },
  {
    key: "puzzle",
    players: "1",
    duration: "3-15 min",
    fallback: {
      nameEn: "Puzzle Challenge",
      nameAr: "تحدي الألغاز",
      descriptionEn: "Drag & drop jigsaw puzzle with multiple difficulty levels",
      descriptionAr: "لغز صور بالسحب والإسقاط مع مستويات صعوبة متعددة",
      icon: Target,
      gradient: "from-cyan-500/30 via-cyan-600/20 to-teal-700/10",
      accentColor: "text-cyan-500",
    },
  },
  {
    key: "memory",
    players: "1",
    duration: "2-10 min",
    fallback: {
      nameEn: "Memory Challenge",
      nameAr: "تحدي الذاكرة",
      descriptionEn: "Remember the color sequence and test your memory",
      descriptionAr: "تذكّر تسلسل الألوان واختبر ذاكرتك",
      icon: Zap,
      gradient: "from-fuchsia-500/30 via-fuchsia-600/20 to-purple-700/10",
      accentColor: "text-fuchsia-500",
    },
  },
];

export default function GamesCatalogPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [animatedStats, setAnimatedStats] = useState({ players: 0, matches: 0, spectators: 0 });
  const locale = language === "ar" ? "ar" : "en";
  const preferredCurrency = typeof user?.balanceCurrency === "string" && user.balanceCurrency.trim().length > 0
    ? user.balanceCurrency.trim().toUpperCase()
    : "USD";

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: preferredCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${preferredCurrency} ${amount.toFixed(2)}`;
    }
  };

  const { data: liveMatches = [] } = useQuery<LiveMatch[]>({
    queryKey: ["/api/challenges/public"],
    refetchInterval: 5000,
  });

  const { data: gameStats } = useQuery<Record<string, { waiting: number; live: number }>>({
    queryKey: ["/api/game-stats"],
    refetchInterval: 10000,
  });

  const { data: externalGames = [] } = useQuery<ExternalGameItem[]>({
    queryKey: ["/api/external-games"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/external-games");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: apiGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ["/api/multiplayer-games"],
    staleTime: 60000,
  });

  const multiplayerGameConfig = useMemo(() => buildGameConfig(apiGames), [apiGames]);

  const catalogGames = useMemo<CatalogGame[]>(
    () =>
      CATALOG_METADATA.flatMap((meta): CatalogGame[] => {
        // Multiplayer game (no inline fallback): visuals come from
        // `multiplayerGameConfig` (API + admin DB) and fall back to the
        // central FALLBACK_GAME_CONFIG one key at a time, so the catalog
        // still renders the row even when `/api/multiplayer-games?activeOnly=true`
        // returns a subset (e.g. a game temporarily disabled in admin).
        if (!meta.fallback) {
          const dynamic = resolveGameConfigEntry(multiplayerGameConfig, meta.key);
          // If neither the API nor the static fallback knows this key, skip
          // the row instead of crashing — surfacing a partial active list
          // is better than a white screen.
          if (!dynamic) return [];
          return [{
            key: meta.key,
            name: dynamic.name,
            nameEn: dynamic.name,
            nameAr: dynamic.nameAr,
            descriptionEn: dynamic.descriptionEn,
            descriptionAr: dynamic.descriptionAr,
            icon: dynamic.icon,
            iconUrl: dynamic.iconUrl,
            thumbnailUrl: dynamic.thumbnailUrl,
            gradient: dynamic.gradient,
            color: dynamic.color,
            accentColor: dynamic.accentColor,
            accentColorClass: dynamic.accentColor || dynamic.color,
            players: meta.players,
            duration: meta.duration,
          }];
        }
        // Browser-only mini-game (snake / puzzle / memory) — visuals from inline fallback.
        const fb = meta.fallback;
        return [{
          key: meta.key,
          name: fb.nameEn,
          nameEn: fb.nameEn,
          nameAr: fb.nameAr,
          descriptionEn: fb.descriptionEn,
          descriptionAr: fb.descriptionAr,
          icon: fb.icon,
          iconUrl: undefined,
          thumbnailUrl: undefined,
          gradient: fb.gradient,
          color: fb.accentColor,
          accentColor: fb.accentColor,
          accentColorClass: fb.accentColor,
          players: meta.players,
          duration: meta.duration,
        }];
      }),
    [multiplayerGameConfig],
  );

  useEffect(() => {
    const totalPlayers = liveMatches.length * 2;
    const totalSpectators = liveMatches.reduce((sum, m) => sum + (m.spectatorCount || 0), 0);

    const duration = 1000;
    const steps = 30;
    const interval = duration / steps;

    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      setAnimatedStats({
        players: Math.round(totalPlayers * progress),
        matches: Math.round(liveMatches.length * progress),
        spectators: Math.round(totalSpectators * progress),
      });
      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [liveMatches]);

  const handlePlayNow = (gameKey: string) => {
    if (!user) {
      navigate("/");
      return;
    }
    // New 9 HTML5 mini-games launch through the iframe-based arcade player
    // so scores reach the server and Sam9 can react. Legacy keys keep the
    // pre-existing static fallbacks.
    if (isArcadeGameKey(gameKey)) {
      navigate(`/arcade/${gameKey}`);
      return;
    }
    if (gameKey === "puzzle") {
      window.location.href = "/games/puzzle.html";
      return;
    }
    if (gameKey === "memory") {
      window.location.href = "/games/memory.html";
      return;
    }
    navigate(`/lobby?game=${gameKey}`);
  };

  const handleWatchLive = (gameKey: string) => {
    const liveMatch = liveMatches.find((m) => m.gameType === gameKey);
    if (liveMatch) {
      navigate(`/challenge/${liveMatch.id}/watch`);
    } else {
      navigate(`/lobby?game=${gameKey}&tab=live`);
    }
  };

  const getGameLiveCount = (gameKey: string) => {
    return liveMatches.filter((m) => m.gameType === gameKey).length;
  };

  return (
    <div className="min-h-[100svh]">
      <div className="relative overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background px-3 py-10 sm:px-4 sm:py-12">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <img
          src="/icons/vex-gaming-logo-512x512.png"
          alt=""
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] md:w-[400px] md:h-[400px] opacity-[0.06] pointer-events-none select-none"
          aria-hidden="true"
        />
        <div className="max-w-6xl mx-auto text-center relative">
          <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
            <Sparkles className="w-4 h-4 me-2" />
            {t('catalog.watchAndWin')}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t('catalog.liveGamesArena')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            {t('catalog.heroDesc')}
          </p>

          <div className="flex justify-center mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/share-links")}
              data-testid="button-share-links"
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {t('catalog.shareLinks') ?? 'Share game links'}
            </Button>
          </div>

          <div className="flex justify-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/50 backdrop-blur-sm border">
              <Users className="w-5 h-5 text-primary" />
              <div className="text-start">
                <p className="text-2xl font-bold">{animatedStats.players}</p>
                <p className="text-xs text-muted-foreground">
                  {t('catalog.activePlayers')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/50 backdrop-blur-sm border">
              <Flame className="w-5 h-5 text-orange-500" />
              <div className="text-start">
                <p className="text-2xl font-bold">{animatedStats.matches}</p>
                <p className="text-xs text-muted-foreground">
                  {t('catalog.liveMatches')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/50 backdrop-blur-sm border">
              <Eye className="w-5 h-5 text-cyan-500" />
              <div className="text-start">
                <p className="text-2xl font-bold">{animatedStats.spectators}</p>
                <p className="text-xs text-muted-foreground">
                  {t('catalog.spectators')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {catalogGames.map((game) => {
            const liveCount = getGameLiveCount(game.key);
            const isSelected = selectedGame === game.key;

            return (
              <Card
                key={game.key}
                className={cn(
                  "group relative overflow-hidden transition-all duration-300 hover-elevate game-card-glow cursor-pointer",
                  isSelected && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedGame(isSelected ? null : game.key)}
                data-testid={`game-card-${game.key}`}
              >
                <GameCardBackground config={game} variant="solid" />

                {liveCount > 0 && (
                  <div className="absolute top-3 end-3 z-10">
                    <Badge variant="destructive" className="gap-1 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-white" />
                      {liveCount} {t('common.live')}
                    </Badge>
                  </div>
                )}

                <CardContent className="relative p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div
                      className={cn(
                        "inline-flex h-20 w-20 items-center justify-center rounded-[20px] border bg-background/80 shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110 overflow-hidden",
                        game.iconUrl ? "border-border p-0" : `p-2.5 ${game.accentColorClass}`
                      )}
                    >
                      <GameConfigIcon
                        config={game}
                        fallbackIcon={game.icon || Gamepad2}
                        fit={game.iconUrl ? "cover" : "contain"}
                        className={game.iconUrl ? "h-full w-full" : "h-10 w-10 sm:h-11 sm:w-11"}
                      />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold mb-1">
                        {language === "ar" ? game.nameAr : game.nameEn}
                      </h2>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {language === "ar" ? game.descriptionAr : game.descriptionEn}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{game.players}</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>{game.duration}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 min-h-[44px] gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayNow(game.key);
                      }}
                      data-testid={`play-${game.key}`}
                    >
                      <Play className="w-4 h-4" />
                      {t('catalog.playNow')}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-[44px] gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWatchLive(game.key);
                      }}
                      data-testid={`watch-${game.key}`}
                    >
                      <Eye className="w-4 h-4" />
                      {t('catalog.watch')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* External Games Section */}
        {externalGames.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <ExternalLink className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {language === "ar" ? "ألعاب إضافية" : "More Games"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {language === "ar" ? "ألعاب حصرية من مطورين مستقلين" : "Exclusive games from independent developers"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {externalGames.map((game) => (
                <Card
                  key={game.id}
                  className="group relative overflow-hidden transition-all duration-300 hover-elevate game-card-glow cursor-pointer"
                  onClick={() => navigate(`/play/${game.slug}`)}
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-br opacity-60"
                    style={{
                      background: `linear-gradient(135deg, ${game.accentColor || "#6366f1"}22, ${game.accentColor || "#6366f1"}11, transparent)`,
                    }}
                  />

                  {game.isFreeToPlay && (
                    <div className="absolute top-3 end-3 z-10">
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Sparkles className="w-3 h-3" />
                        {t('nav.free')}
                      </Badge>
                    </div>
                  )}

                  <CardContent className="relative p-6">
                    <div className="flex items-start gap-4 mb-4">
                      {game.iconUrl ? (
                        <div className="w-16 h-16 rounded-2xl overflow-hidden border p-1 shadow-lg transition-transform group-hover:scale-110 bg-background/80 backdrop-blur-sm">
                          <img src={game.iconUrl} alt="" className="w-full h-full object-contain" />
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-background/80 backdrop-blur-sm border shadow-lg transition-transform group-hover:scale-110">
                          <Gamepad2 className="w-8 h-8" style={{ color: game.accentColor || "#6366f1" }} />
                        </div>
                      )}
                      <div className="flex-1">
                        <h2 className="text-xl font-bold mb-1">
                          {language === "ar" ? game.nameAr : game.nameEn}
                        </h2>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {language === "ar" ? (game.descriptionAr || "") : (game.descriptionEn || "")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}-${game.maxPlayers}`}</span>
                      </div>
                      <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        <span>{game.playCount} {language === "ar" ? "مرة" : "plays"}</span>
                      </div>
                      {game.rating && Number(game.rating) > 0 && (
                        <>
                          <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span>{Number(game.rating).toFixed(1)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    <Button
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/play/${game.slug}`);
                      }}
                    >
                      <Play className="w-4 h-4" />
                      {t('catalog.playNow')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {liveMatches.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Flame className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">
                    {t('catalog.liveMatchesNow')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t('catalog.joinAsSpectator')}
                  </p>
                </div>
              </div>
              <Button className="min-h-[44px] w-full sm:w-auto" variant="outline" onClick={() => navigate("/lobby?tab=live")} data-testid="button-view-all-live">
                {t('catalog.viewAll')}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveMatches.slice(0, 6).map((match) => {
                const gameConfig = catalogGames.find((g) => g.key === match.gameType);

                return (
                  <Card
                    key={match.id}
                    className="group hover-elevate cursor-pointer"
                    onClick={() => navigate(`/challenge/${match.id}/watch`)}
                    data-testid={`live-match-${match.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/70 overflow-hidden", gameConfig?.iconUrl ? "border-border p-0" : `p-1 ${gameConfig?.accentColor || ""}`)}>
                            <GameConfigIcon
                              config={gameConfig}
                              fallbackIcon={gameConfig?.icon || Gamepad2}
                              fit={gameConfig?.iconUrl ? "cover" : "contain"}
                              className={gameConfig?.iconUrl ? "h-full w-full" : "h-6 w-6"}
                            />
                          </div>
                          <span className="text-sm font-medium">
                            {language === "ar" ? gameConfig?.nameAr : gameConfig?.nameEn}
                          </span>
                        </div>
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          {t('common.live')}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                            {match.player1Name?.[0]?.toUpperCase()}
                          </div>
                          <span className="font-medium truncate max-w-[80px]">
                            {match.player1Name}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">VS</Badge>
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate max-w-[80px]">
                            {match.player2Name}
                          </span>
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                            {match.player2Name?.[0]?.toUpperCase()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{match.spectatorCount || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span>{t('catalog.bet')}: {formatCurrency(Number(match.betAmount || 0))}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-12 text-center">
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-primary/20">
            <CardContent className="py-8">
              <Star className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">
                {t('catalog.readyForChallenge')}
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {t('catalog.readyDesc')}
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button size="lg" onClick={() => navigate("/lobby")} className="w-full sm:w-auto min-h-[44px] gap-2" data-testid="button-start-playing">
                  <Zap className="w-5 h-5" />
                  {t('catalog.startPlaying')}
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate("/lobby?tab=live")} className="w-full sm:w-auto min-h-[44px] gap-2" data-testid="button-watch-matches">
                  <Eye className="w-5 h-5" />
                  {t('catalog.watchMatches')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
