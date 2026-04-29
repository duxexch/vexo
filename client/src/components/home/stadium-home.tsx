import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { isArcadeGameKey } from "@shared/arcade-games";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trophy,
  Flame,
  Swords,
  Wallet,
  Crown,
  Users,
  Timer,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Target,
  Sparkles,
  CircleDot,
  Plus,
  Activity,
  Globe,
  PlayCircle,
  Megaphone,
  Gift,
  Star,
  Medal,
  Pin,
  ArrowLeft,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

const HERO_IMG = "/images/home-stadium/vex-home-stadium-hero.png";

// ─────────────────────────────────────────────────────────────────────────────
// Types from real APIs
// ─────────────────────────────────────────────────────────────────────────────
type ApiTournament = {
  id: string;
  name: string;
  nameAr?: string | null;
  shareSlug?: string | null;
  coverImageUrl?: string | null;
  gameType?: string | null;
  status: string;
  maxPlayers: number;
  prizePool: string;
  currency: string;
  startsAt?: string | null;
  endsAt?: string | null;
  participantCount: number;
};

type ApiGame = {
  id: string;
  name: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  category: string;
  gameType: string; // 'single' | 'multiplayer' etc.
  playCount: number;
  isFeatured: boolean;
};

type ApiExternalGame = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  category: string;
  iconUrl?: string | null;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string | null;
  playCount: number;
  isFeatured: boolean;
  sortOrder: number;
  /**
   * Player-count hints used by the home page to bucket games into
   * solo / duo / party rails. Both fields are optional on the API
   * payload — when missing we treat the game as a 1-player solo.
   */
  minPlayers?: number | null;
  maxPlayers?: number | null;
};

type ApiChallenge = {
  id: string;
  gameType: string;
  betAmount: number;
  status: string;
  player1Name: string;
  player1Rating?: number;
  player2Name?: string;
  spectatorCount: number;
  createdAt: string;
};

type ApiLeaderboardEntry = {
  rank: number;
  id: string;
  username: string;
  nickname?: string | null;
  profilePicture?: string | null;
  vipLevel: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalEarnings: string | number;
  currentWinStreak: number;
  longestWinStreak: number;
  country?: string | null;
  gameWon?: number;
  winRate: number;
};

type ApiAnnouncement = {
  id: string;
  title: string;
  titleAr?: string | null;
  content: string;
  contentAr?: string | null;
  type: string;
  priority: string;
  isPinned: boolean;
  createdAt: string;
};

type ApiPlatformStats = {
  onlinePlayers: number;
  activeGames: number;
  totalUsers: number;
  totalGamesPlayed: number;
};

type ApiDailyRewardStatus = {
  claimedToday: boolean;
  currentStreak: number;
  nextDay: number;
  nextRewardAmount: string | null;
  schedule: { day: number; amount: string }[];
  totalEarned: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toString();
}

function pickName(en: string, ar?: string | null, lang?: string) {
  if (lang === "ar" && ar && ar.trim()) return ar;
  return en;
}

function gameNameMap(games: ApiGame[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of games) m.set(g.id, g.name);
  return m;
}

function tournamentCountdown(startsAt?: string | null): string {
  if (!startsAt) return "";
  const ms = new Date(startsAt).getTime() - Date.now();
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function RailEmpty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="w-full px-4 md:px-6 pb-4">
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 dark:border-white/10 bg-slate-100/60 dark:bg-white/[0.03] py-6 px-4 text-sm text-slate-600 dark:text-slate-400">
        <span className="grid place-items-center w-9 h-9 rounded-md bg-slate-200 dark:bg-white/5 text-slate-500">
          {icon}
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}

function RailError({ label, onRetry }: { label: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="w-full px-4 md:px-6 pb-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/50 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/[0.06] py-4 px-4 text-sm text-rose-700 dark:text-rose-300">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid place-items-center w-9 h-9 rounded-md bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 shrink-0">
            <CircleDot className="w-4 h-4" />
          </span>
          <span className="truncate">{label}</span>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-rose-300/60 dark:border-rose-500/40 bg-white/40 dark:bg-rose-500/10 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-xs shrink-0"
            onClick={onRetry}
          >
            {t("home.retry") || "إعادة المحاولة"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Rail({
  title,
  kicker,
  icon,
  href,
  accent = "blue",
  children,
}: {
  title: string;
  kicker?: string;
  icon: React.ReactNode;
  href?: string;
  accent?: "blue" | "gold" | "red";
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const railRef = useRef<HTMLDivElement>(null);
  const accentMap = {
    blue: "from-[#1e88ff] to-[#0a4d9c] shadow-[0_0_30px_-5px_#1e88ff]",
    gold: "from-[#ffb627] to-[#a86b00] shadow-[0_0_30px_-5px_#ffb627]",
    red: "from-rose-500 to-rose-900 shadow-[0_0_30px_-5px_#ef4444]",
  }[accent];

  const scroll = (dir: 1 | -1) => {
    railRef.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  };

  return (
    <section className="relative">
      <div className="flex items-end justify-between gap-3 px-4 md:px-6 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`grid place-items-center w-9 h-9 rounded-md bg-gradient-to-br ${accentMap} text-black shrink-0`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-['Bebas_Neue'] tracking-wider text-2xl md:text-3xl text-slate-900 dark:text-white leading-none truncate">
              {title}
            </h2>
            {kicker && (
              <p className="text-xs text-slate-700 dark:text-slate-400 mt-1 truncate">{kicker}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => scroll(1)}
            className="w-9 h-9 grid place-items-center rounded-md bg-slate-200/60 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-white/10"
            aria-label={t("nav.previous") || "السابق"}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll(-1)}
            className="w-9 h-9 grid place-items-center rounded-md bg-slate-200/60 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-white/10"
            aria-label={t("nav.next") || "التالي"}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {href && (
            <Link
              href={href}
              className="hidden md:inline-flex h-9 px-3 items-center gap-1 rounded-md bg-slate-200/60 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-white/10 text-xs"
            >
              {t("common.viewAll") || "عرض الكل"}
            </Link>
          )}
        </div>
      </div>
      <ScrollArea className="w-full">
        <div
          ref={railRef}
          className="flex gap-4 px-4 md:px-6 pb-4 overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {children}
        </div>
        <ScrollBar orientation="horizontal" className="hidden" />
      </ScrollArea>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero carousel — uses live tournaments
// ─────────────────────────────────────────────────────────────────────────────
function HeroCarousel({ tournaments, lang }: { tournaments: ApiTournament[]; lang: string }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const slides = tournaments.slice(0, 3);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(id);
  }, [slides.length]);

  // 1s tick for countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!slides.length) {
    return (
      <div className="relative w-full overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={HERO_IMG}
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-slate-100/80 dark:from-[#0a0e1a] via-transparent dark:via-[#0a0e1a]/40 to-slate-100/80 dark:to-[#0a0e1a]" />
        </div>
        <div className="relative px-4 md:px-8 py-12 md:py-16 text-center">
          <Trophy className="w-12 h-12 mx-auto text-[#ffb627] mb-4 opacity-70" />
          <h1 className="font-['Bebas_Neue'] text-4xl md:text-5xl text-slate-900 dark:text-white drop-shadow-[0_4px_20px_rgba(30,136,255,0.4)]">
            {t("home.noFeaturedTournaments") || "لا توجد بطولات مميزة حالياً"}
          </h1>
          <p className="text-slate-700 dark:text-slate-300 mt-3 max-w-md mx-auto leading-relaxed">
            {t("home.checkBackSoon") ||
              "تابعنا قريباً — البطولات المميزة تظهر هنا فور إطلاقها."}
          </p>
          <Button
            asChild
            className="mt-6 h-11 px-6 bg-gradient-to-l from-[#ffb627] to-[#ff8a00] text-black font-bold rounded-md shadow-[0_8px_30px_-5px_rgba(255,182,39,0.6)] hover:brightness-110"
          >
            <Link href="/tournaments">
              <Trophy className="w-5 h-5 ml-2" />
              {t("home.browseTournaments") || "تصفّح البطولات"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const active = slides[idx];
  const activeTitle = pickName(active.name, active.nameAr, lang);
  const prizeNum = parseFloat(active.prizePool || "0");
  const cover = active.coverImageUrl || HERO_IMG;
  const isLive = active.status === "in_progress" || active.status === "live";
  // tick is referenced so the countdown re-renders every second
  void tick;
  const countdown = tournamentCountdown(active.startsAt);
  const capacity = Math.max(1, active.maxPlayers || 0);
  const registered = active.participantCount || 0;
  const fillPct = Math.min(100, Math.round((registered / capacity) * 100));

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ perspective: "1500px" }}
    >
      <div className="absolute inset-0">
        <img
          src={HERO_IMG}
          alt=""
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-slate-100/80 dark:from-[#0a0e1a] via-transparent dark:via-[#0a0e1a]/40 to-slate-100/80 dark:to-[#0a0e1a]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(30,136,255,0.18),_transparent_60%)]" />
      </div>

      <div className="relative grid md:grid-cols-[1.1fr_1fr] gap-6 px-4 md:px-8 py-8 md:py-10">
        <div className="self-center">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {isLive && (
              <>
                <span className="relative flex w-2.5 h-2.5">
                  <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75" />
                  <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-rose-500" />
                </span>
                <span className="text-rose-400 text-xs font-bold tracking-widest">
                  {t("home.liveNow") || "مباشر الآن"}
                </span>
                <span className="h-3 w-px bg-white/20" />
              </>
            )}
            {active.gameType && (
              <Badge className="bg-[#ffb627] text-black hover:bg-[#ffb627] rounded-sm px-2 py-0 text-[10px] font-black">
                {active.gameType}
              </Badge>
            )}
          </div>
          <h1 className="font-['Bebas_Neue'] text-4xl sm:text-5xl md:text-7xl leading-[0.9] text-slate-900 dark:text-white drop-shadow-[0_4px_20px_rgba(30,136,255,0.4)]">
            {activeTitle}
            <span className="block text-[#ffb627] text-2xl sm:text-3xl md:text-4xl mt-2">
              {t("home.prize") || "جائزة"} {fmtMoney(prizeNum)} {active.currency || "USDT"}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Button
              asChild
              className="h-12 px-6 bg-gradient-to-l from-[#ffb627] to-[#ff8a00] text-black font-bold rounded-md shadow-[0_8px_30px_-5px_rgba(255,182,39,0.6)] hover:brightness-110"
            >
              <Link href={`/tournaments/${active.shareSlug || active.id}`}>
                <Trophy className="w-5 h-5 ml-2" />
                {t("home.joinTournament") || "انضم للبطولة"}
              </Link>
            </Button>
            {isLive && (
              <Button
                asChild
                variant="outline"
                className="h-12 px-6 bg-white/15 dark:bg-white/5 border-white/30 dark:border-white/15 text-slate-900 dark:text-white hover:bg-white/25 dark:hover:bg-white/10 backdrop-blur-sm"
              >
                <Link href={`/tournaments/${active.shareSlug || active.id}`}>
                  <PlayCircle className="w-5 h-5 ml-2" />
                  {t("home.watchStream") || "شاهد البث"}
                </Link>
              </Button>
            )}
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Users className="w-4 h-4 text-[#1e88ff]" />
              <span className="font-bold text-slate-900 dark:text-white">{registered}</span>
              <span className="text-slate-500 dark:text-slate-500">/ {capacity}</span>
              <span className="text-slate-500 dark:text-slate-500">
                {t("home.registered") || "مسجّل"}
              </span>
            </div>
            {countdown && (
              <div className="flex items-center gap-2 text-sm">
                <Timer className="w-4 h-4 text-[#ffb627]" />
                <span className="font-mono font-black text-slate-900 dark:text-white tracking-wider">
                  {countdown}
                </span>
              </div>
            )}
          </div>

          {slides.length > 1 && (
            <div className="flex items-center gap-2 mt-6">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx
                      ? "w-10 bg-[#ffb627]"
                      : "w-4 bg-slate-400/40 dark:bg-white/20"
                  }`}
                  aria-label={`${t("home.slide") || "شريحة"} ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="relative hidden md:block"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="relative aspect-[4/5] max-h-[460px] mx-auto rounded-2xl overflow-hidden border border-slate-300/70 dark:border-white/10 shadow-[0_30px_80px_-20px_rgba(30,136,255,0.55)]"
            style={{
              transform: "rotateX(8deg) rotateY(-10deg)",
              transformStyle: "preserve-3d",
            }}
          >
            <img
              src={cover}
              alt={activeTitle}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-100 dark:from-[#0a0e1a] via-transparent to-transparent" />

            <div
              className="absolute top-4 right-4 left-4 flex items-center justify-between"
              style={{ transform: "translateZ(40px)" }}
            >
              {isLive ? (
                <Badge className="bg-rose-500 text-white rounded-sm px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5">
                  <CircleDot className="w-3 h-3 animate-pulse" />
                  LIVE
                </Badge>
              ) : (
                <span />
              )}
              {active.gameType && (
                <Badge className="bg-black/60 text-[#ffb627] border border-[#ffb627]/40 rounded-sm px-2 py-0.5 text-[10px] font-bold">
                  {active.gameType}
                </Badge>
              )}
            </div>

            <div
              className="absolute bottom-0 inset-x-0 p-5"
              style={{ transform: "translateZ(60px)" }}
            >
              <div className="flex items-center gap-2 text-[#ffb627] text-xs mb-2 font-bold tracking-widest">
                <Trophy className="w-4 h-4" />
                {t("home.grandPrize") || "الجائزة الكبرى"}
              </div>
              <div className="font-['Bebas_Neue'] text-5xl text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] leading-none">
                {prizeNum.toLocaleString()}{" "}
                <span className="text-[#ffb627]">{active.currency || "USDT"}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-[#ffb627] to-[#ff8a00]"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-700 dark:text-slate-300">
                <span>
                  {registered} {t("home.registered") || "مسجّل"}
                </span>
                <span>
                  {Math.max(0, capacity - registered)}{" "}
                  {t("home.seatsLeft") || "مقعد متبقي"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OwnerBar
// ─────────────────────────────────────────────────────────────────────────────
export type OwnerBarProps = {
  avatarUrl?: string;
  initials: string;
  level: number;
  displayName: string;
  username: string;
  rankLabel: string;
  location?: string;
  walletValue: string;
  walletCurrency: string;
  winsToday: number;
  lossesToday: number;
  winStreak: number;
  xpPercent: number;
  xpCurrent: number;
  xpTarget: number;
  nextRankLabel: string;
  onChallengeFriend?: () => void;
  onDeposit?: () => void;
  challengeLabel?: string;
  depositLabel?: string;
};

function OwnerBar(props: OwnerBarProps) {
  const {
    avatarUrl,
    initials,
    level,
    displayName,
    username,
    rankLabel,
    location,
    walletValue,
    walletCurrency,
    winsToday,
    lossesToday,
    winStreak,
    xpPercent,
    xpCurrent,
    xpTarget,
    nextRankLabel,
    onChallengeFriend,
    onDeposit,
    challengeLabel = "تحدى صديق",
    depositLabel = "إيداع",
  } = props;

  return (
    <div className="relative border-b border-slate-300/70 dark:border-white/10 bg-gradient-to-l from-slate-100 via-white to-slate-100 dark:from-[#0a0e1a] dark:via-[#10172a] dark:to-[#0a0e1a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,_rgba(30,136,255,0.18),_transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,_rgba(255,182,39,0.12),_transparent_60%)] pointer-events-none" />

      <div className="relative px-4 md:px-6 py-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="w-16 h-16 ring-2 ring-[#ffb627] ring-offset-2 ring-offset-slate-100 dark:ring-offset-[#0a0e1a]">
              <AvatarImage src={avatarUrl || ""} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c] text-white font-black text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -left-1 grid place-items-center w-7 h-7 rounded-full bg-[#ffb627] border-2 border-slate-100 dark:border-[#0a0e1a] text-black font-black text-xs">
              {level}
            </span>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-100 dark:border-[#0a0e1a]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-['Bebas_Neue'] text-2xl text-slate-900 dark:text-white tracking-wider leading-none truncate">
                {displayName}
              </h3>
              <Crown className="w-4 h-4 text-[#ffb627] shrink-0" />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className="bg-gradient-to-l from-[#ffb627] to-[#ff8a00] text-black hover:bg-[#ffb627] rounded-sm text-[10px] py-0 px-1.5 font-black">
                {rankLabel}
              </Badge>
              <span className="text-xs text-slate-700 dark:text-slate-400">@{username}</span>
              {location ? (
                <>
                  <span className="text-xs text-slate-500 dark:text-slate-500">·</span>
                  <span className="text-xs text-slate-700 dark:text-slate-400 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {location}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCell
            icon={<Wallet className="w-4 h-4" />}
            label="محفظتي"
            value={walletValue}
            sub={walletCurrency}
            accent="gold"
          />
          <StatCell
            icon={<TrendingUp className="w-4 h-4" />}
            label="فوز اليوم"
            value={String(winsToday)}
            sub="مباراة"
            accent="green"
          />
          <StatCell
            icon={<TrendingDown className="w-4 h-4" />}
            label="خسارة اليوم"
            value={String(lossesToday)}
            sub="مباراة"
            accent="red"
          />
          <StatCell
            icon={<Flame className="w-4 h-4" />}
            label="سلسلة الانتصارات"
            value={String(winStreak)}
            sub="متتالية"
            accent="orange"
          />
          <div className="col-span-2 md:col-span-1 rounded-lg border border-slate-300/70 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03] p-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#1e88ff]" />
                XP الأسبوع
              </span>
              <span className="text-slate-900 dark:text-white font-bold">
                {Math.round(xpPercent)}%
              </span>
            </div>
            <Progress
              value={xpPercent}
              className="h-1.5 mt-2 bg-slate-200/80 dark:bg-white/10 [&>div]:bg-gradient-to-l [&>div]:from-[#1e88ff] [&>div]:to-[#0a4d9c]"
            />
            <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              {xpCurrent.toLocaleString("ar-EG")} / {xpTarget.toLocaleString("ar-EG")} لرتبة{" "}
              <span className="text-[#ffb627] font-bold">{nextRankLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            onClick={onChallengeFriend}
            className="h-11 px-4 bg-gradient-to-l from-[#1e88ff] to-[#0a4d9c] text-white font-bold rounded-md shadow-[0_6px_25px_-5px_rgba(30,136,255,0.7)] hover:brightness-110"
            data-testid="button-stadium-challenge-friend"
          >
            <Swords className="w-4 h-4 ml-2" />
            {challengeLabel}
          </Button>
          <Button
            type="button"
            onClick={onDeposit}
            variant="outline"
            className="h-11 px-3 bg-slate-200/60 dark:bg-white/5 border-slate-300/80 dark:border-white/15 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/10"
            data-testid="button-stadium-deposit"
          >
            <Plus className="w-4 h-4 ml-2" />
            {depositLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: "gold" | "green" | "red" | "orange";
}) {
  const tone = {
    gold: "text-[#ffb627]",
    green: "text-emerald-400",
    red: "text-rose-400",
    orange: "text-orange-400",
  }[accent];
  return (
    <div className="rounded-lg border border-slate-300/70 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-400">
        <span className={tone}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`font-['Bebas_Neue'] text-2xl tracking-wider mt-1 ${tone} leading-none`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">{sub}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────────────────────
function TournamentCard({ t, lang }: { t: ApiTournament; lang: string }) {
  const title = pickName(t.name, t.nameAr, lang);
  const prize = parseFloat(t.prizePool || "0");
  const cover = t.coverImageUrl || HERO_IMG;
  const isLive = t.status === "in_progress" || t.status === "live";
  const capacity = Math.max(1, t.maxPlayers || 0);
  const fillPct = Math.min(100, Math.round((t.participantCount / capacity) * 100));
  return (
    <Card className="group relative shrink-0 w-[260px] sm:w-[300px] overflow-hidden border-white/10 bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_-10px_rgba(30,136,255,0.45)]">
      <Link href={`/tournaments/${t.shareSlug || t.id}`} className="block">
        <div className="relative h-32 overflow-hidden">
          <img src={cover} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-[#0a0e1a]/40 to-transparent" />
          <div className="absolute top-2 right-2 left-2 flex items-center justify-between">
            {isLive ? (
              <Badge className="bg-rose-500 hover:bg-rose-500 text-white rounded-sm px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5">
                <CircleDot className="w-3 h-3 animate-pulse" />
                LIVE
              </Badge>
            ) : (
              <span />
            )}
            {t.gameType && (
              <Badge className="bg-[#1e88ff]/90 hover:bg-[#1e88ff] text-white rounded-sm px-2 py-0.5 text-[10px] font-bold">
                {t.gameType}
              </Badge>
            )}
          </div>
        </div>
        <div className="p-3">
          <h3 className="font-['Bebas_Neue'] text-xl tracking-wider truncate">{title}</h3>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-[11px] text-slate-400">{t.currency || "USDT"}</div>
            <div className="font-mono text-lg font-black text-[#ffb627]">
              {fmtMoney(prize)}
            </div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-l from-[#ffb627] to-[#ff8a00]" style={{ width: `${fillPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-300">
            <span>
              <span className="font-bold text-white">{t.participantCount}</span> / {capacity}
            </span>
            <span>{t.status}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

/**
 * Resolve the correct in-app destination for a game tile.
 * Mirrors `handlePlayNow` in `games-catalog.tsx` so the home page,
 * catalog, and admin all route the same way and we never fall through
 * to the SEO `/games/:category` hub (which would render
 * "تصنيف غير موجود" when the slug isn't a real category).
 */
function resolveGameHref(gameKey: string): string {
  // Solo / arcade games open directly into the player.
  if (isArcadeGameKey(gameKey)) return `/arcade/${gameKey}`;
  if (gameKey === "puzzle") return "/games/puzzle.html";
  if (gameKey === "memory") return "/games/memory.html";
  // Multiplayer games (chess, backgammon, domino, tarneeb, baloot, ...)
  // need an opponent + stake before a session exists, so we open the lobby
  // with the Quick-Match dialog auto-opened for that game. The lobby reads
  // ?quickMatch=1 on mount and immediately shows the bet selector — one
  // click to start a real match instead of landing on a filtered list.
  return `/lobby?game=${gameKey}&quickMatch=1`;
}

function GameTileCard({ g, lang }: { g: ApiGame; lang: string }) {
  void lang;
  const name = g.name;
  const cover = g.thumbnailUrl || g.imageUrl;
  const initial = name.trim().charAt(0).toUpperCase();
  const href = resolveGameHref(g.id);
  return (
    <Card className="group relative shrink-0 w-[160px] sm:w-[200px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_-10px_rgba(255,182,39,0.4)]">
      <Link href={href} className="block" data-testid={`tile-game-${g.id}`}>
        <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 grid place-items-center">
          {cover ? (
            <img src={cover} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          ) : (
            <span className="font-['Bebas_Neue'] text-5xl tracking-wider text-white/95 drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)]">
              {initial}
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />
          {g.isFeatured && (
            <Badge className="absolute top-2 right-2 bg-[#ffb627] hover:bg-[#ffb627] text-black rounded-sm px-1.5 py-0 text-[9px] font-bold">
              ★
            </Badge>
          )}
        </div>
        <div className="p-2.5">
          <div className="font-bold text-white text-sm truncate">{name}</div>
          <div className="text-[11px] text-slate-400 truncate">{g.category}</div>
        </div>
      </Link>
    </Card>
  );
}

function SoloGameTileCard({ g, lang }: { g: ApiExternalGame; lang: string }) {
  const name = lang === "ar" && g.nameAr ? g.nameAr : g.nameEn;
  const cover = g.thumbnailUrl || g.iconUrl || g.bannerUrl;
  const initial = name.trim().charAt(0).toUpperCase();
  const accent = g.accentColor || "#1e88ff";
  return (
    <Card
      className="group relative shrink-0 w-[160px] sm:w-[200px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1"
      style={{ boxShadow: `0 0 0 transparent` }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 15px 40px -10px ${accent}66`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 transparent`;
      }}
    >
      <Link href={`/play/${g.slug}`} className="block">
        <div
          className="relative aspect-[4/5] overflow-hidden grid place-items-center"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${accent}33, transparent 60%), linear-gradient(135deg, #0f172a, #050810)`,
          }}
        >
          {cover ? (
            <img
              src={cover}
              alt={name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform"
              loading="lazy"
            />
          ) : (
            <span
              className="font-['Bebas_Neue'] text-6xl tracking-wider text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)]"
              style={{ color: accent }}
            >
              {initial}
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />
          {g.isFeatured && (
            <Badge className="absolute top-2 right-2 bg-[#ffb627] hover:bg-[#ffb627] text-black rounded-sm px-1.5 py-0 text-[9px] font-bold">
              ★
            </Badge>
          )}
          <div
            className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${accent}33`, color: accent, border: `1px solid ${accent}66` }}
          >
            {g.category}
          </div>
        </div>
        <div className="p-2.5">
          <div className="font-bold text-white text-sm truncate">{name}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {(g.playCount ?? 0).toLocaleString()} {lang === "ar" ? "لاعب" : "plays"}
          </div>
        </div>
      </Link>
    </Card>
  );
}

function ChallengeCard({ c, gamesMap }: { c: ApiChallenge; gamesMap: Map<string, string> }) {
  const opp = c.player2Name || "—";
  const game = gamesMap.get(c.gameType) || c.gameType;
  return (
    <Card className="group relative shrink-0 w-[260px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-3 rounded-xl transition-all hover:-translate-y-1">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-bold text-white truncate">{c.player1Name}</div>
          <div className="text-[11px] text-slate-400 truncate">vs {opp}</div>
        </div>
        <Badge className="bg-[#1e88ff]/90 text-white rounded-sm px-1.5 py-0 text-[9px] font-bold">
          {game}
        </Badge>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] text-slate-500">رهان</div>
          <div className="font-mono text-lg font-black text-[#ffb627]">
            {fmtMoney(c.betAmount)} <span className="text-xs text-slate-400">USDT</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500">المتفرّجون</div>
          <div className="font-bold text-white">{c.spectatorCount}</div>
        </div>
      </div>
      <Link
        href={`/challenges/${c.id}`}
        className="mt-3 inline-flex items-center justify-center w-full h-9 rounded-md bg-white/10 hover:bg-white/15 text-white text-sm font-bold border border-white/15"
      >
        عرض التحدّي
      </Link>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live platform stats ticker — drives the heartbeat above the rails
// ─────────────────────────────────────────────────────────────────────────────
function PlatformStatsTicker() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<ApiPlatformStats>({
    queryKey: ["/api/platform/stats"],
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const items = [
    {
      label: t("home.onlinePlayers") || "متصلون الآن",
      value: data?.onlinePlayers ?? 0,
      icon: <Users className="w-3.5 h-3.5" />,
      tone: "text-emerald-400",
      pulse: true,
    },
    {
      label: t("home.activeGames") || "ألعاب نشطة",
      value: data?.activeGames ?? 0,
      icon: <Gamepad2 className="w-3.5 h-3.5" />,
      tone: "text-[#1e88ff]",
    },
    {
      label: t("home.totalUsers") || "إجمالي اللاعبين",
      value: data?.totalUsers ?? 0,
      icon: <Star className="w-3.5 h-3.5" />,
      tone: "text-[#ffb627]",
    },
    {
      label: t("home.totalGames") || "ألعاب على المنصة",
      value: data?.totalGamesPlayed ?? 0,
      icon: <Trophy className="w-3.5 h-3.5" />,
      tone: "text-rose-400",
    },
  ];

  return (
    <div className="px-4 md:px-6 -mt-4 mb-2">
      <div className="rounded-xl border border-slate-300/70 dark:border-white/10 bg-gradient-to-l from-slate-100 via-white to-slate-100 dark:from-[#0f1730] dark:via-[#0a0e1a] dark:to-[#0f1730] backdrop-blur-sm overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-300/60 dark:divide-white/10 [direction:ltr]">
          {items.map((it) => (
            <div
              key={it.label}
              className="px-4 py-3 flex items-center justify-between gap-3"
              dir="rtl"
            >
              <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-400 min-w-0">
                <span className={`grid place-items-center w-6 h-6 rounded-md bg-slate-200 dark:bg-white/5 ${it.tone}`}>
                  {it.icon}
                </span>
                <span className="truncate">{it.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {it.pulse && (
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                    <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </span>
                )}
                <span className={`font-mono font-black text-sm ${it.tone}`}>
                  {isLoading ? "—" : it.value.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-player card (used in Top Players rail)
// ─────────────────────────────────────────────────────────────────────────────
function TopPlayerCard({ p }: { p: ApiLeaderboardEntry }) {
  const earnings = Number(p.totalEarnings || 0);
  const initials = (p.nickname || p.username || "?").charAt(0).toUpperCase();
  const rankAccent =
    p.rank === 1
      ? "from-[#ffb627] to-[#ff8a00]"
      : p.rank === 2
      ? "from-slate-300 to-slate-500"
      : p.rank === 3
      ? "from-amber-700 to-amber-900"
      : "from-slate-500 to-slate-700";
  return (
    <Card className="group relative shrink-0 w-[220px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-4 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_-10px_rgba(255,182,39,0.4)]">
      <Link href={`/profile/${p.id}`} className="block">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-14 h-14 ring-2 ring-[#ffb627]/60">
              <AvatarImage src={p.profilePicture || ""} alt={p.nickname || p.username} />
              <AvatarFallback className="bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c] text-white font-black">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className={`absolute -bottom-1 -left-1 grid place-items-center w-6 h-6 rounded-full bg-gradient-to-br ${rankAccent} text-black border-2 border-[#0a0e1a] text-[10px] font-black`}
            >
              {p.rank}
            </span>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white truncate">{p.nickname || p.username}</div>
            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              {p.country && <Globe className="w-3 h-3" />}
              {p.country || "—"}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white/[0.04] border border-white/10 p-2 text-center">
            <div className="text-[10px] text-slate-500">أرباح</div>
            <div className="font-mono font-black text-sm text-[#ffb627]">
              {fmtMoney(earnings)}
            </div>
          </div>
          <div className="rounded-md bg-white/[0.04] border border-white/10 p-2 text-center">
            <div className="text-[10px] text-slate-500">نسبة الفوز</div>
            <div className="font-mono font-black text-sm text-emerald-400">
              {p.winRate}%
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Most-played card (used in Most Played rail)
// ─────────────────────────────────────────────────────────────────────────────
function MostPlayedCard({ g }: { g: ApiGame }) {
  const cover = g.thumbnailUrl || g.imageUrl;
  const initial = g.name.trim().charAt(0).toUpperCase();
  const href = resolveGameHref(g.id);
  return (
    <Card className="group relative shrink-0 w-[200px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_-10px_rgba(30,136,255,0.45)]">
      <Link href={href} className="block" data-testid={`tile-most-played-${g.id}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 grid place-items-center">
          {cover ? (
            <img
              src={cover}
              alt={g.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <span className="font-['Bebas_Neue'] text-5xl tracking-wider text-white/95 drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)]">
              {initial}
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />
          <Badge className="absolute top-2 right-2 bg-rose-500/90 hover:bg-rose-500 text-white rounded-sm px-1.5 py-0 text-[10px] font-bold flex items-center gap-1">
            <Flame className="w-3 h-3" />
            HOT
          </Badge>
        </div>
        <div className="p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-white text-sm truncate">{g.name}</div>
            <div className="text-[10px] text-slate-400 truncate">{g.category}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-500">جولات</div>
            <div className="font-mono font-black text-sm text-[#1e88ff]">
              {fmtMoney(g.playCount)}
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Player of the Week sidebar card (uses leaderboard top)
// ─────────────────────────────────────────────────────────────────────────────
function PlayerOfWeekCard({ p }: { p: ApiLeaderboardEntry | null }) {
  const { t } = useI18n();
  if (!p) {
    return (
      <Card className="relative overflow-hidden bg-gradient-to-br from-[#1e88ff]/15 via-[#0a0e1a] to-[#ffb627]/10 border-slate-300/70 dark:border-white/10 rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-[#ffb627] text-xs font-bold tracking-widest mb-2">
          <Crown className="w-4 h-4" />
          {t("home.playerOfWeek") || "لاعب الأسبوع"}
        </div>
        <div className="text-sm text-slate-400">
          {t("home.noLeaderboardYet") || "لا توجد بيانات لاعبين كافية بعد"}
        </div>
      </Card>
    );
  }
  const initials = (p.nickname || p.username || "?").charAt(0).toUpperCase();
  const earnings = Number(p.totalEarnings || 0);
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-[#1e88ff]/15 via-[#0a0e1a] to-[#ffb627]/10 border-slate-300/70 dark:border-white/10 rounded-xl p-5 text-white">
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#ffb627]/30 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[#ffb627] text-xs font-bold tracking-widest mb-3">
          <Crown className="w-4 h-4" />
          {t("home.playerOfWeek") || "لاعب الأسبوع"}
        </div>
        <Link href={`/profile/${p.id}`} className="flex items-center gap-3 group">
          <Avatar className="w-14 h-14 ring-2 ring-[#ffb627]">
            <AvatarImage src={p.profilePicture || ""} alt={p.nickname || p.username} />
            <AvatarFallback className="bg-gradient-to-br from-[#ffb627] to-[#a86b00] text-black font-black">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-['Bebas_Neue'] text-2xl tracking-wider leading-none truncate group-hover:text-[#ffb627] transition-colors">
              {p.nickname || p.username}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {p.gamesWon} {t("home.wins") || "فوز"} · {fmtMoney(earnings)} {t("home.earnings") || "أرباح"}
            </div>
          </div>
        </Link>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <MiniStat label={t("home.wins") || "فوز"} value={String(p.gamesWon)} tone="text-emerald-400" />
          <MiniStat label={t("home.losses") || "هزيمة"} value={String(p.gamesLost)} tone="text-rose-400" />
          <MiniStat label={t("home.winRatePct") || "نسبة"} value={`${p.winRate}%`} tone="text-[#ffb627]" />
        </div>
      </div>
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-md bg-white/[0.04] border border-white/10 py-2">
      <div className={`font-['Bebas_Neue'] text-xl tracking-wider ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily reward sidebar card (uses /api/daily-rewards/status)
// ─────────────────────────────────────────────────────────────────────────────
function DailyRewardCard({ s }: { s: ApiDailyRewardStatus | null }) {
  const { t } = useI18n();
  if (!s) {
    return (
      <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-slate-300/70 dark:border-white/10 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 text-[#1e88ff] text-xs font-bold tracking-widest mb-3">
          <Gift className="w-4 h-4" />
          {t("home.dailyReward") || "مكافأتك اليومية"}
        </div>
        <Skeleton className="h-16 w-full rounded-md bg-white/5" />
      </Card>
    );
  }
  const days = s.schedule.slice(0, 7);
  return (
    <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-slate-300/70 dark:border-white/10 rounded-xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[#1e88ff] text-xs font-bold tracking-widest">
          <Gift className="w-4 h-4" />
          {t("home.dailyReward") || "مكافأتك اليومية"}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[#ffb627] font-bold">
          <Flame className="w-3 h-3" />
          {s.currentStreak} {t("home.streakDays") || "أيام متتالية"}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isCurrent = d.day === s.nextDay;
          const isPassed = d.day < s.nextDay || (d.day === s.nextDay && s.claimedToday);
          return (
            <div
              key={d.day}
              className={`relative aspect-square rounded-md grid place-items-center text-[10px] border ${
                isPassed
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : isCurrent
                  ? "bg-[#ffb627]/15 border-[#ffb627] text-[#ffb627] shadow-[0_0_20px_-5px_#ffb627]"
                  : "bg-white/[0.03] border-white/10 text-slate-500"
              }`}
            >
              <div className="font-['Bebas_Neue'] text-xs leading-none">D{d.day}</div>
              <div className="font-mono text-[9px] mt-0.5">+{d.amount}</div>
              {isCurrent && !s.claimedToday && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#ffb627] animate-ping" />
              )}
            </div>
          );
        })}
      </div>
      <Button
        asChild
        size="sm"
        className="w-full mt-3 h-9 bg-gradient-to-l from-[#1e88ff] to-[#0a4d9c] text-white text-xs font-bold rounded-md hover:brightness-110"
      >
        <Link href="/rewards">
          {s.claimedToday
            ? t("home.viewAllRewards") || "عرض كل المكافآت"
            : `${t("home.claimReward") || "احصل عليها"} +${s.nextRewardAmount || days[s.nextDay - 1]?.amount || "0"}`}
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        </Link>
      </Button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Announcement sidebar card
// ─────────────────────────────────────────────────────────────────────────────
function AnnouncementCard({ a, lang }: { a: ApiAnnouncement | null; lang: string }) {
  const { t } = useI18n();
  if (!a) return null;
  const title = pickName(a.title, a.titleAr, lang);
  const content = pickName(a.content, a.contentAr, lang);
  const tone =
    a.priority === "urgent"
      ? "text-rose-400"
      : a.priority === "high"
      ? "text-[#ffb627]"
      : "text-emerald-400";
  return (
    <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-slate-300/70 dark:border-white/10 rounded-xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 ${tone} text-xs font-bold tracking-widest`}>
          <Megaphone className="w-4 h-4" />
          {t("home.announcement") || "إعلان رسمي"}
        </div>
        {a.isPinned && <Pin className="w-3.5 h-3.5 text-[#ffb627]" />}
      </div>
      <div className="font-bold text-white mb-1.5 truncate">{title}</div>
      <div className="text-sm text-slate-300 leading-relaxed line-clamp-3">{content}</div>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-full mt-3 h-9 bg-white/5 border-white/15 text-white hover:bg-white/10 text-xs"
      >
        <Link href="/announcements">
          {t("home.viewAllAnnouncements") || "كل الإعلانات"}
        </Link>
      </Button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlights section — combines Player of Week + Daily Reward + Announcement
// ─────────────────────────────────────────────────────────────────────────────
function HighlightsSection({
  topPlayer,
  reward,
  announcement,
  lang,
  isLoadingPlayer,
}: {
  topPlayer: ApiLeaderboardEntry | null;
  reward: ApiDailyRewardStatus | null;
  announcement: ApiAnnouncement | null;
  lang: string;
  isLoadingPlayer: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="px-4 md:px-6">
      <div className="flex items-end justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-md bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c] text-white shadow-[0_0_30px_-5px_#1e88ff]">
            <Activity className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-['Bebas_Neue'] tracking-wider text-2xl md:text-3xl text-slate-900 dark:text-white leading-none">
              {t("home.highlights") || "أبرز ما يحدث الآن"}
            </h2>
            <p className="text-xs text-slate-700 dark:text-slate-400 mt-1">
              {t("home.highlightsKicker") || "لاعب الأسبوع، مكافأتك، وإعلانات المنصة"}
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {t("home.liveUpdating") || "يُحدَّث تلقائياً"}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {isLoadingPlayer ? (
          <Skeleton className="h-44 rounded-xl bg-slate-200/70 dark:bg-white/5" />
        ) : (
          <PlayerOfWeekCard p={topPlayer} />
        )}
        <DailyRewardCard s={reward} />
        {announcement ? (
          <AnnouncementCard a={announcement} lang={lang} />
        ) : (
          <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-slate-300/70 dark:border-white/10 rounded-xl p-4 text-white grid place-items-center text-sm text-slate-400 min-h-[140px]">
            <div className="text-center">
              <Megaphone className="w-6 h-6 mx-auto mb-2 opacity-50" />
              {t("home.noAnnouncements") || "لا توجد إعلانات حالياً"}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────
function RailSkeleton({ width = 260 }: { width?: number }) {
  return (
    <div className="flex gap-4 px-4 md:px-6 pb-4 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className={`shrink-0 h-48 rounded-xl bg-slate-200/70 dark:bg-white/5`} style={{ width }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────
export type StadiumHomeProps = {
  owner: OwnerBarProps;
  showTopBar?: boolean;
};

export function StadiumHome({ owner }: StadiumHomeProps) {
  const { language: lang, t } = useI18n();

  const tournamentsQ = useQuery<ApiTournament[]>({
    queryKey: ["/api/tournaments"],
    staleTime: 60_000,
  });

  const gamesQ = useQuery<ApiGame[]>({
    queryKey: ["/api/games"],
    staleTime: 5 * 60_000,
  });

  const mostPlayedQ = useQuery<ApiGame[]>({
    queryKey: ["/api/games/most-played"],
    staleTime: 5 * 60_000,
  });

  const challengesQ = useQuery<ApiChallenge[]>({
    queryKey: ["/api/challenges/public"],
    staleTime: 30_000,
  });

  const externalGamesQ = useQuery<ApiExternalGame[]>({
    queryKey: ["/api/external-games"],
    staleTime: 5 * 60_000,
  });

  const topPlayersQ = useQuery<ApiLeaderboardEntry[]>({
    queryKey: ["/api/leaderboard?sortBy=earnings&period=weekly&limit=10"],
    staleTime: 60_000,
  });

  const announcementsQ = useQuery<ApiAnnouncement[]>({
    queryKey: ["/api/announcements"],
    staleTime: 60_000,
  });

  const dailyRewardQ = useQuery<ApiDailyRewardStatus>({
    queryKey: ["/api/daily-rewards/status"],
    staleTime: 60_000,
  });

  const tournaments = tournamentsQ.data ?? [];
  const games = gamesQ.data ?? [];
  const mostPlayed = (mostPlayedQ.data ?? []).slice(0, 10);
  const challenges = challengesQ.data ?? [];
  const topPlayers = topPlayersQ.data ?? [];
  const topPlayer = topPlayers[0] ?? null;
  const topAnnouncement =
    (announcementsQ.data ?? [])
      .slice()
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })[0] ?? null;
  const dailyReward = dailyRewardQ.data ?? null;

  const teamGames = useMemo(
    () => games.filter((g) => g.gameType === "multiplayer" || g.category === "multiplayer"),
    [games]
  );
  const allExternalGames = useMemo(
    () => (externalGamesQ.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [externalGamesQ.data]
  );
  const soloGames = useMemo(
    () => allExternalGames.filter((g) => (g.maxPlayers ?? 1) <= 1),
    [allExternalGames]
  );
  const duoGames = useMemo(
    () => allExternalGames.filter((g) => (g.maxPlayers ?? 1) === 2),
    [allExternalGames]
  );
  const partyGames = useMemo(
    () => allExternalGames.filter((g) => (g.maxPlayers ?? 1) >= 3),
    [allExternalGames]
  );
  const gamesMap = useMemo(() => gameNameMap(games), [games]);

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className="min-h-screen bg-slate-100 dark:bg-[#0a0e1a] text-slate-900 dark:text-white selection:bg-[#ffb627] selection:text-black"
    >
      <OwnerBar {...owner} />

      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-100 dark:from-[#0a0e1a] to-transparent pointer-events-none" />
        <HeroCarousel tournaments={tournaments} lang={lang} />
      </div>

      <PlatformStatsTicker />

      <div className="space-y-8 py-6">
        <Rail
          title={t("home.tournaments") || "البطولات"}
          kicker={t("home.tournamentsKicker") || "كل البطولات النشطة على المنصة"}
          icon={<Trophy className="w-4 h-4" />}
          href="/tournaments"
          accent="gold"
        >
          {tournamentsQ.isLoading ? (
            <RailSkeleton width={300} />
          ) : tournamentsQ.isError ? (
            <RailError
              label={t("home.tournamentsError") || "تعذّر تحميل البطولات"}
              onRetry={() => tournamentsQ.refetch()}
            />
          ) : tournaments.length === 0 ? (
            <RailEmpty
              icon={<Trophy className="w-4 h-4" />}
              label={t("home.noTournaments") || "لا توجد بطولات نشطة حالياً"}
            />
          ) : (
            tournaments.map((tn) => <TournamentCard key={tn.id} t={tn} lang={lang} />)
          )}
        </Rail>

        <Rail
          title={t("home.topPlayers") || "أبطال الأسبوع"}
          kicker={t("home.topPlayersKicker") || "أعلى الأرباح خلال الأسبوع"}
          icon={<Medal className="w-4 h-4" />}
          href="/leaderboard"
          accent="gold"
        >
          {topPlayersQ.isLoading ? (
            <RailSkeleton width={220} />
          ) : topPlayersQ.isError ? (
            <RailError
              label={t("home.topPlayersError") || "تعذّر تحميل قائمة الأبطال"}
              onRetry={() => topPlayersQ.refetch()}
            />
          ) : topPlayers.length === 0 ? (
            <RailEmpty
              icon={<Medal className="w-4 h-4" />}
              label={t("home.noTopPlayers") || "لا توجد بيانات لاعبين بعد"}
            />
          ) : (
            topPlayers.map((p) => <TopPlayerCard key={p.id} p={p} />)
          )}
        </Rail>

        <Rail
          title={t("home.teamGames") || "ألعاب الفِرَق"}
          kicker={t("home.teamGamesKicker") || "العب مع وضدّ فِرَق حقيقية"}
          icon={<Users className="w-4 h-4" />}
          href="/games"
          accent="blue"
        >
          {gamesQ.isLoading ? (
            <RailSkeleton width={200} />
          ) : gamesQ.isError ? (
            <RailError
              label={t("home.teamGamesError") || "تعذّر تحميل ألعاب الفِرَق"}
              onRetry={() => gamesQ.refetch()}
            />
          ) : teamGames.length === 0 ? (
            <RailEmpty
              icon={<Users className="w-4 h-4" />}
              label={t("home.noTeamGames") || "لا توجد ألعاب فِرَق متاحة"}
            />
          ) : (
            teamGames.map((g) => <GameTileCard key={g.id} g={g} lang={lang} />)
          )}
        </Rail>

        <Rail
          title={t("home.soloGames") || "ألعاب الفرد"}
          kicker={t("home.soloGamesKicker") || "تحدّياتك الخاصّة"}
          icon={<Gamepad2 className="w-4 h-4" />}
          href="/games"
          accent="blue"
        >
          {externalGamesQ.isLoading ? (
            <RailSkeleton width={200} />
          ) : externalGamesQ.isError ? (
            <RailError
              label={t("home.soloGamesError") || "تعذّر تحميل ألعاب الفرد"}
              onRetry={() => externalGamesQ.refetch()}
            />
          ) : soloGames.length === 0 ? (
            <RailEmpty
              icon={<Gamepad2 className="w-4 h-4" />}
              label={t("home.noSoloGames") || "لا توجد ألعاب فرد متاحة"}
            />
          ) : (
            soloGames.map((g) => <SoloGameTileCard key={g.id} g={g} lang={lang} />)
          )}
        </Rail>

        <Rail
          title={lang === "ar" ? "ألعاب الثنائي (لاعبَين)" : "Duo Games (2 Players)"}
          kicker={lang === "ar" ? "تنافس صديقك على نفس الجهاز" : "Pass-and-play head-to-head"}
          icon={<Users className="w-4 h-4" />}
          href="/games"
          accent="gold"
        >
          {externalGamesQ.isLoading ? (
            <RailSkeleton width={200} />
          ) : externalGamesQ.isError ? (
            <RailError
              label={lang === "ar" ? "تعذّر تحميل ألعاب الثنائي" : "Failed to load duo games"}
              onRetry={() => externalGamesQ.refetch()}
            />
          ) : duoGames.length === 0 ? (
            <RailEmpty
              icon={<Users className="w-4 h-4" />}
              label={lang === "ar" ? "لا توجد ألعاب ثنائية متاحة" : "No duo games available"}
            />
          ) : (
            duoGames.map((g) => <SoloGameTileCard key={g.id} g={g} lang={lang} />)
          )}
        </Rail>

        <Rail
          title={lang === "ar" ? "ألعاب الجماعة (3-4 لاعبين)" : "Party Games (3-4 Players)"}
          kicker={lang === "ar" ? "اجمع أصدقاءك حول جهاز واحد" : "Gather around a single device"}
          icon={<Users className="w-4 h-4" />}
          href="/games"
          accent="red"
        >
          {externalGamesQ.isLoading ? (
            <RailSkeleton width={200} />
          ) : externalGamesQ.isError ? (
            <RailError
              label={lang === "ar" ? "تعذّر تحميل ألعاب الجماعة" : "Failed to load party games"}
              onRetry={() => externalGamesQ.refetch()}
            />
          ) : partyGames.length === 0 ? (
            <RailEmpty
              icon={<Users className="w-4 h-4" />}
              label={lang === "ar" ? "لا توجد ألعاب جماعية متاحة" : "No party games available"}
            />
          ) : (
            partyGames.map((g) => <SoloGameTileCard key={g.id} g={g} lang={lang} />)
          )}
        </Rail>

        <Rail
          title={t("home.mostPlayed") || "الأكثر لعباً"}
          kicker={t("home.mostPlayedKicker") || "الألعاب الأعلى نشاطاً على المنصة"}
          icon={<Flame className="w-4 h-4" />}
          href="/games"
          accent="red"
        >
          {mostPlayedQ.isLoading ? (
            <RailSkeleton width={200} />
          ) : mostPlayedQ.isError ? (
            <RailError
              label={t("home.mostPlayedError") || "تعذّر تحميل الألعاب الأكثر لعباً"}
              onRetry={() => mostPlayedQ.refetch()}
            />
          ) : mostPlayed.length === 0 ? (
            <RailEmpty
              icon={<Flame className="w-4 h-4" />}
              label={t("home.noMostPlayed") || "لا توجد إحصائيات ألعاب بعد"}
            />
          ) : (
            mostPlayed.map((g) => <MostPlayedCard key={g.id} g={g} />)
          )}
        </Rail>

        <Rail
          title={t("home.challenges") || "التحديات المباشرة"}
          kicker={t("home.challengesKicker") || "ادخل تحدّياً مباشراً أو شاهد"}
          icon={<Target className="w-4 h-4" />}
          href="/challenges"
          accent="red"
        >
          {challengesQ.isLoading ? (
            <RailSkeleton width={260} />
          ) : challengesQ.isError ? (
            <RailError
              label={t("home.challengesError") || "تعذّر تحميل التحديات المباشرة"}
              onRetry={() => challengesQ.refetch()}
            />
          ) : challenges.length === 0 ? (
            <RailEmpty
              icon={<Target className="w-4 h-4" />}
              label={t("home.noChallenges") || "لا توجد تحدّيات مفتوحة الآن"}
            />
          ) : (
            challenges.map((c) => <ChallengeCard key={c.id} c={c} gamesMap={gamesMap} />)
          )}
        </Rail>

        <HighlightsSection
          topPlayer={topPlayer}
          reward={dailyReward}
          announcement={topAnnouncement}
          lang={lang}
          isLoadingPlayer={topPlayersQ.isLoading}
        />
      </div>
    </div>
  );
}
