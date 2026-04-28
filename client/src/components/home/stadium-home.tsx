import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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

function GameTileCard({ g, lang }: { g: ApiGame; lang: string }) {
  void lang;
  const name = g.name;
  const cover = g.thumbnailUrl || g.imageUrl;
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <Card className="group relative shrink-0 w-[160px] sm:w-[200px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_-10px_rgba(255,182,39,0.4)]">
      <Link href={`/games/${g.id}`} className="block">
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

  const challengesQ = useQuery<ApiChallenge[]>({
    queryKey: ["/api/challenges/public"],
    staleTime: 30_000,
  });

  const tournaments = tournamentsQ.data ?? [];
  const games = gamesQ.data ?? [];
  const challenges = challengesQ.data ?? [];

  const teamGames = useMemo(
    () => games.filter((g) => g.gameType === "multiplayer" || g.category === "multiplayer"),
    [games]
  );
  const soloGames = useMemo(
    () => games.filter((g) => g.gameType === "single" || g.gameType !== "multiplayer"),
    [games]
  );
  const gamesMap = useMemo(() => gameNameMap(games), [games]);

  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-slate-100 dark:bg-[#0a0e1a] text-slate-900 dark:text-white selection:bg-[#ffb627] selection:text-black"
    >
      <OwnerBar {...owner} />

      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-100 dark:from-[#0a0e1a] to-transparent pointer-events-none" />
        <HeroCarousel tournaments={tournaments} lang={lang} />
      </div>

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
          title={t("home.teamGames") || "ألعاب الفِرَق"}
          kicker={t("home.teamGamesKicker") || "العب مع وضدّ فِرَق حقيقية"}
          icon={<Users className="w-4 h-4" />}
          href="/games"
          accent="blue"
        >
          {gamesQ.isLoading ? (
            <RailSkeleton width={200} />
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
          {gamesQ.isLoading ? (
            <RailSkeleton width={200} />
          ) : soloGames.length === 0 ? (
            <RailEmpty
              icon={<Gamepad2 className="w-4 h-4" />}
              label={t("home.noSoloGames") || "لا توجد ألعاب فرد متاحة"}
            />
          ) : (
            soloGames.map((g) => <GameTileCard key={g.id} g={g} lang={lang} />)
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
          ) : challenges.length === 0 ? (
            <RailEmpty
              icon={<Target className="w-4 h-4" />}
              label={t("home.noChallenges") || "لا توجد تحدّيات مفتوحة الآن"}
            />
          ) : (
            challenges.map((c) => <ChallengeCard key={c.id} c={c} gamesMap={gamesMap} />)
          )}
        </Rail>
      </div>
    </div>
  );
}
