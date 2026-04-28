import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Trophy,
  Flame,
  Zap,
  Swords,
  Wallet,
  Crown,
  Users,
  Timer,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Gamepad2,
  Target,
  Medal,
  Sparkles,
  Radio,
  CircleDot,
  Plus,
  Check,
  X,
  Activity,
  Star,
  Globe,
  ShieldCheck,
  Coins,
  Rocket,
  PlayCircle,
  Megaphone,
} from "lucide-react";

const HERO_IMG = "/images/home-stadium/vex-home-stadium-hero.png";
const FIFA_IMG = "/images/home-stadium/vex-home-stadium-fifa.png";
const CS2_IMG = "/images/home-stadium/vex-home-stadium-cs2.png";
const PUBG_IMG = "/images/home-stadium/vex-home-stadium-pubg.png";

type Tournament = {
  id: string;
  title: string;
  game: string;
  prize: number;
  registered: number;
  capacity: number;
  countdown: string;
  live: boolean;
  cover: string;
  region: string;
};

const TOURNAMENTS: Tournament[] = [
  {
    id: "t1",
    title: "كأس الخليج الكبير",
    game: "FIFA 24",
    prize: 50000,
    registered: 248,
    capacity: 256,
    countdown: "00:14:32",
    live: true,
    cover: FIFA_IMG,
    region: "الخليج",
  },
  {
    id: "t2",
    title: "ليلة القناصة",
    game: "CS2",
    prize: 18500,
    registered: 96,
    capacity: 128,
    countdown: "01:42:09",
    live: true,
    cover: CS2_IMG,
    region: "السعودية",
  },
  {
    id: "t3",
    title: "بطولة الدرع الذهبي",
    game: "PUBG Mobile",
    prize: 32000,
    registered: 180,
    capacity: 200,
    countdown: "03:08:55",
    live: false,
    cover: PUBG_IMG,
    region: "مصر",
  },
  {
    id: "t4",
    title: "تحدي القمم",
    game: "Valorant",
    prize: 12500,
    registered: 64,
    capacity: 96,
    countdown: "06:21:18",
    live: false,
    cover: FIFA_IMG,
    region: "الإمارات",
  },
  {
    id: "t5",
    title: "ماراثون eFootball",
    game: "eFootball",
    prize: 8500,
    registered: 142,
    capacity: 160,
    countdown: "08:55:02",
    live: false,
    cover: CS2_IMG,
    region: "العراق",
  },
  {
    id: "t6",
    title: "سهرة FC Mobile",
    game: "FC Mobile",
    prize: 6200,
    registered: 88,
    capacity: 128,
    countdown: "11:02:47",
    live: false,
    cover: PUBG_IMG,
    region: "المغرب",
  },
];

type GameTile = {
  name: string;
  shortName: string;
  online: number;
  hot?: boolean;
  hue: string;
};

const TEAM_GAMES: GameTile[] = [
  { name: "FIFA 24", shortName: "FIFA", online: 12480, hot: true, hue: "from-emerald-500 to-emerald-900" },
  { name: "Counter-Strike 2", shortName: "CS2", online: 9842, hot: true, hue: "from-amber-500 to-orange-900" },
  { name: "Valorant", shortName: "VAL", online: 7361, hue: "from-rose-500 to-rose-900" },
  { name: "PUBG Mobile", shortName: "PUBG", online: 21408, hot: true, hue: "from-yellow-500 to-yellow-900" },
  { name: "Call of Duty: Warzone", shortName: "CoD", online: 5894, hue: "from-zinc-500 to-zinc-900" },
  { name: "Rocket League", shortName: "RL", online: 3120, hue: "from-sky-500 to-sky-900" },
  { name: "Apex Legends", shortName: "APEX", online: 4502, hue: "from-red-600 to-red-950" },
  { name: "Dota 2", shortName: "DOTA", online: 6701, hue: "from-fuchsia-600 to-purple-950" },
];

const SOLO_GAMES: GameTile[] = [
  { name: "شطرنج", shortName: "Chess", online: 4218, hot: true, hue: "from-amber-300 to-amber-800" },
  { name: "بلوت", shortName: "Baloot", online: 8902, hot: true, hue: "from-emerald-400 to-teal-900" },
  { name: "طرنيب", shortName: "Tarneeb", online: 6442, hue: "from-indigo-400 to-indigo-900" },
  { name: "دومينو", shortName: "Domino", online: 5311, hue: "from-stone-400 to-stone-900" },
  { name: "زهر / طاولة", shortName: "Backgammon", online: 7104, hot: true, hue: "from-rose-400 to-rose-900" },
  { name: "تحدي اللغة", shortName: "Lang Duel", online: 1894, hue: "from-violet-400 to-violet-900" },
  { name: "كرة القدم 1v1", shortName: "1v1 Kicks", online: 2602, hue: "from-cyan-400 to-cyan-900" },
  { name: "ذاكرة الأبطال", shortName: "Memory", online: 1180, hue: "from-pink-400 to-pink-900" },
];

type Challenge = {
  id: string;
  opp: string;
  oppHandle: string;
  game: string;
  stake: number;
  direction: "in" | "out";
  rank: string;
  expiresIn: string;
  flag: string;
};

const CHALLENGES: Challenge[] = [
  { id: "c1", opp: "AbuFlash", oppHandle: "@abuflash_98", game: "FIFA 24", stake: 250, direction: "in", rank: "ماسي II", expiresIn: "00:08:14", flag: "SA" },
  { id: "c2", opp: "M7md_Sniper", oppHandle: "@m7md.sn", game: "CS2", stake: 500, direction: "in", rank: "نخبة", expiresIn: "00:23:40", flag: "EG" },
  { id: "c3", opp: "ZAYED_99", oppHandle: "@zayed99", game: "PUBG Mobile", stake: 120, direction: "out", rank: "كروني", expiresIn: "01:02:11", flag: "AE" },
  { id: "c4", opp: "Rakan.GG", oppHandle: "@rakan.gg", game: "بلوت", stake: 80, direction: "in", rank: "ذهبي III", expiresIn: "00:18:55", flag: "KW" },
  { id: "c5", opp: "Salma_Vex", oppHandle: "@salma_vx", game: "شطرنج", stake: 60, direction: "out", rank: "محترف", expiresIn: "02:14:00", flag: "MA" },
  { id: "c6", opp: "FahadXII", oppHandle: "@fahad_xii", game: "Valorant", stake: 340, direction: "in", rank: "أسطوري", expiresIn: "00:42:08", flag: "QA" },
];

type ActivityEvent = {
  id: string;
  kind: "tournament" | "win" | "upset" | "match" | "highscore" | "system";
  text: string;
  meta: string;
  amount?: number;
  ago: string;
};

const ACTIVITY: ActivityEvent[] = [
  { id: "a1", kind: "tournament", text: "انتهت بطولة \"كأس الرياض الذهبي\" — توّج الفائز AbuFlash", meta: "FIFA 24 · 256 لاعب", amount: 15000, ago: "منذ 3 دقائق" },
  { id: "a2", kind: "win", text: "فُزتَ في مباراة سريعة ضد M7md_Sniper", meta: "CS2 · جولتين متتاليتين", amount: 250, ago: "منذ 9 دقائق" },
  { id: "a3", kind: "upset", text: "صدمة! اللاعب Newbie_07 يقصي البطل ZAYED_99", meta: "PUBG Mobile · ربع نهائي", ago: "منذ 14 دقيقة" },
  { id: "a4", kind: "highscore", text: "رقم قياسي جديد على طاولة بلوت — 4250 نقطة", meta: "Salma_Vex · تحدي اليوم", ago: "منذ 22 دقيقة" },
  { id: "a5", kind: "match", text: "خسرتَ مباراة شطرنج ضد Rakan.GG (مات في 18 نقلة)", meta: "Chess · رتبة ذهبي", amount: -60, ago: "منذ 31 دقيقة" },
  { id: "a6", kind: "tournament", text: "افتُتح تسجيل بطولة \"ليلة القناصة\" — المقاعد تنفد بسرعة", meta: "CS2 · 96/128 مسجّل", ago: "منذ 47 دقيقة" },
  { id: "a7", kind: "win", text: "FahadXII يربح 3,200 USDT في نهائي Valorant الإقليمي", meta: "Valorant · MENA Pro Cup", amount: 3200, ago: "منذ ساعة" },
  { id: "a8", kind: "system", text: "تحديث: نظام مكافحة الغش يعمل بإصدار v4.2", meta: "النظام · صيانة قصيرة", ago: "منذ 1:24 ساعة" },
  { id: "a9", kind: "match", text: "فُزتَ بسلسلة 4 مباريات في PUBG Mobile", meta: "PUBG · سلسلة انتصارات", amount: 480, ago: "منذ 2:08 ساعة" },
  { id: "a10", kind: "upset", text: "الفريق Sand Wolves يقلب نتيجة 0-2 إلى 3-2 ضد Falcon Esports", meta: "Rocket League · ربع نهائي", ago: "منذ 3:14 ساعة" },
  { id: "a11", kind: "highscore", text: "أعلى رهان لليوم: 5,000 USDT بين Khaled_VX و TurkiX", meta: "FIFA 24 · مباراة ودية", amount: 5000, ago: "منذ 4:22 ساعة" },
  { id: "a12", kind: "tournament", text: "بطولة \"الدرع الذهبي\" تفتح باب التسجيل غدًا 9 مساءً", meta: "PUBG · إعلان رسمي", ago: "منذ 5:01 ساعة" },
];

const TICKER = [
  "AbuFlash يربح كأس الرياض الذهبي — 15,000 USDT",
  "بطولة ليلة القناصة تبدأ خلال ساعة و42 دقيقة",
  "M7md_Sniper يطلب تحدّيك على CS2 برهان 500 USDT",
  "Newbie_07 يصدم ZAYED_99 في ربع نهائي PUBG",
  "Salma_Vex تكسر الرقم القياسي على طاولة بلوت",
  "افتتاح موسم MENA Pro Cup 2026 الأسبوع القادم",
];

function fmtMoney(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toString();
}

function GoldShine({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <span className="absolute -inset-x-10 top-0 h-full w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shine_3.5s_linear_infinite]" />
    </span>
  );
}

function Rail({
  title,
  kicker,
  icon,
  children,
  accent = "blue",
}: {
  title: string;
  kicker?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  accent?: "blue" | "gold" | "red";
}) {
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
      <div className="flex items-end justify-between px-4 md:px-6 mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid place-items-center w-9 h-9 rounded-md bg-gradient-to-br ${accentMap} text-black`}
          >
            {icon}
          </span>
          <div>
            <h2 className="font-['Bebas_Neue'] tracking-wider text-2xl md:text-3xl text-white leading-none">
              {title}
            </h2>
            {kicker && (
              <p className="text-xs text-slate-400 mt-1">{kicker}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll(1)}
            className="w-9 h-9 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
            aria-label="السابق"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll(-1)}
            className="w-9 h-9 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
            aria-label="التالي"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="hidden md:inline-flex h-9 px-3 items-center gap-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs">
            عرض الكل
          </button>
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

function HeroCarousel() {
  const [idx, setIdx] = useState(0);
  const slides = TOURNAMENTS.slice(0, 3);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5500);
    return () => clearInterval(t);
  }, [slides.length]);

  const active = slides[idx];

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ perspective: "1500px" }}
    >
      <div className="absolute inset-0">
        <img
          src={HERO_IMG}
          alt="Stadium"
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#0a0e1a] via-[#0a0e1a]/40 to-[#0a0e1a]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(30,136,255,0.18),_transparent_60%)]" />
      </div>

      <div className="relative grid md:grid-cols-[1.1fr_1fr] gap-6 px-4 md:px-8 py-8 md:py-10">
        <div className="self-center">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-rose-500" />
            </span>
            <span className="text-rose-400 text-xs font-bold tracking-widest">مباشر الآن</span>
            <span className="h-3 w-px bg-white/20" />
            <Badge className="bg-[#ffb627] text-black hover:bg-[#ffb627] rounded-sm px-2 py-0 text-[10px] font-black">
              {active.region}
            </Badge>
          </div>
          <h1 className="font-['Bebas_Neue'] text-5xl md:text-7xl leading-[0.9] text-white drop-shadow-[0_4px_20px_rgba(30,136,255,0.4)]">
            {active.title}
            <span className="block text-[#ffb627] text-3xl md:text-4xl mt-2">
              {active.game} · جائزة {fmtMoney(active.prize)} USDT
            </span>
          </h1>
          <p className="text-slate-300 mt-4 max-w-lg leading-relaxed">
            البطولة الكبرى للأسبوع — تأهّل من خانتك، تجاوز كل الجولات، وارفع الكأس على المنصة الذهبية. كل المباريات بثّ مباشر مع تعليق عربي.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Button className="h-12 px-6 bg-gradient-to-l from-[#ffb627] to-[#ff8a00] text-black font-bold rounded-md shadow-[0_8px_30px_-5px_rgba(255,182,39,0.6)] hover:brightness-110">
              <Trophy className="w-5 h-5 ml-2" />
              انضم للبطولة
            </Button>
            <Button
              variant="outline"
              className="h-12 px-6 bg-white/5 border-white/15 text-white hover:bg-white/10"
            >
              <PlayCircle className="w-5 h-5 ml-2" />
              شاهد البث
            </Button>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Users className="w-4 h-4 text-[#1e88ff]" />
              <span className="font-bold text-white">{active.registered}</span>
              <span className="text-slate-500">/ {active.capacity}</span>
              <span className="text-slate-500">مسجّل</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4 text-[#ffb627]" />
              <span className="font-mono font-black text-white tracking-wider">
                {active.countdown}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-10 bg-[#ffb627]" : "w-4 bg-white/20"
                }`}
                aria-label={`شريحة ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <div
          className="relative hidden md:block"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="relative aspect-[4/5] max-h-[460px] mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-[0_30px_80px_-20px_rgba(30,136,255,0.55)]"
            style={{
              transform: "rotateX(8deg) rotateY(-10deg)",
              transformStyle: "preserve-3d",
            }}
          >
            <img
              src={active.cover}
              alt={active.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />

            <div
              className="absolute top-4 right-4 left-4 flex items-center justify-between"
              style={{ transform: "translateZ(40px)" }}
            >
              <Badge className="bg-rose-500 text-white rounded-sm px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5">
                <CircleDot className="w-3 h-3 animate-pulse" />
                LIVE
              </Badge>
              <Badge className="bg-black/60 text-[#ffb627] border border-[#ffb627]/40 rounded-sm px-2 py-0.5 text-[10px] font-bold">
                {active.game}
              </Badge>
            </div>

            <div
              className="absolute bottom-0 inset-x-0 p-5"
              style={{ transform: "translateZ(60px)" }}
            >
              <div className="flex items-center gap-2 text-[#ffb627] text-xs mb-2 font-bold tracking-widest">
                <Trophy className="w-4 h-4" />
                جائزة الكبرى
              </div>
              <div className="font-['Bebas_Neue'] text-5xl text-white leading-none">
                {active.prize.toLocaleString()}{" "}
                <span className="text-[#ffb627]">USDT</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-[#ffb627] to-[#ff8a00]"
                  style={{ width: `${(active.registered / active.capacity) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-300">
                <span>{active.registered} مسجّل</span>
                <span>{active.capacity - active.registered} مقعد متبقي</span>
              </div>
            </div>

            <GoldShine />
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="relative border-b border-white/10 bg-[linear-gradient(to_left,_#0a0e1a_0%,_#10172a_50%,_#0a0e1a_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,_rgba(30,136,255,0.18),_transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,_rgba(255,182,39,0.12),_transparent_60%)] pointer-events-none" />

      <div className="relative px-4 md:px-6 py-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="w-16 h-16 ring-2 ring-[#ffb627] ring-offset-2 ring-offset-[#0a0e1a]">
              <AvatarImage src={avatarUrl || ""} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c] text-white font-black text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -left-1 grid place-items-center w-7 h-7 rounded-full bg-[#ffb627] border-2 border-[#0a0e1a] text-black font-black text-xs">
              {level}
            </span>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0e1a]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider leading-none">
                {displayName}
              </h3>
              <Crown className="w-4 h-4 text-[#ffb627]" />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className="bg-gradient-to-l from-[#ffb627] to-[#ff8a00] text-black hover:bg-[#ffb627] rounded-sm text-[10px] py-0 px-1.5 font-black">
                {rankLabel}
              </Badge>
              <span className="text-xs text-slate-400">@{username}</span>
              {location ? (
                <>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
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
          <div className="col-span-2 md:col-span-1 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#1e88ff]" />
                XP الأسبوع
              </span>
              <span className="text-white font-bold">{Math.round(xpPercent)}%</span>
            </div>
            <Progress
              value={xpPercent}
              className="h-1.5 mt-2 bg-white/10 [&>div]:bg-gradient-to-l [&>div]:from-[#1e88ff] [&>div]:to-[#0a4d9c]"
            />
            <div className="text-[10px] text-slate-500 mt-1">
              {xpCurrent.toLocaleString("ar-EG")} / {xpTarget.toLocaleString("ar-EG")} لرتبة{" "}
              <span className="text-[#ffb627] font-bold">{nextRankLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            className="h-11 px-3 bg-white/5 border-white/15 text-white hover:bg-white/10"
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
  sub: string;
  accent: "gold" | "green" | "red" | "orange" | "blue";
}) {
  const tone = {
    gold: "text-[#ffb627]",
    green: "text-emerald-400",
    red: "text-rose-400",
    orange: "text-orange-400",
    blue: "text-[#1e88ff]",
  }[accent];
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className={`flex items-center gap-1 text-[11px] text-slate-400`}>
        <span className={tone}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`font-['Bebas_Neue'] text-2xl tracking-wider ${tone}`}>
          {value}
        </span>
        <span className="text-[10px] text-slate-500">{sub}</span>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="sticky top-0 z-40 bg-[#0a0e1a]/85 backdrop-blur-xl border-b border-white/10">
      <div className="px-4 md:px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center w-9 h-9 rounded-md bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c] text-white shadow-[0_0_20px_-2px_#1e88ff]">
            <Rocket className="w-5 h-5" />
          </div>
          <span className="font-['Bebas_Neue'] text-2xl tracking-[0.2em] text-white">
            VEX
          </span>
          <Badge className="bg-[#ffb627] text-black rounded-sm px-1.5 py-0 text-[9px] font-black">
            ARENA
          </Badge>
        </div>

        <nav className="hidden md:flex items-center gap-1 text-sm text-slate-300">
          {["الرئيسية", "البطولات", "الألعاب", "التحدّيات", "السوق", "السجل"].map((n, i) => (
            <a
              key={n}
              className={`px-3 py-2 rounded-md hover:bg-white/5 ${
                i === 0 ? "bg-white/5 text-white" : ""
              }`}
              href="#"
            >
              {n}
            </a>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-3 h-9 w-72">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            placeholder="ابحث عن لاعب أو بطولة..."
            className="bg-transparent outline-none text-sm text-white placeholder:text-slate-500 flex-1"
          />
          <kbd className="text-[10px] text-slate-500 border border-white/10 px-1 rounded">
            /
          </kbd>
        </div>

        <button className="relative w-9 h-9 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#0a0e1a]" />
        </button>

        <div className="hidden md:flex items-center gap-2 px-3 h-9 rounded-md bg-gradient-to-l from-[#ffb627]/20 to-transparent border border-[#ffb627]/40">
          <Coins className="w-4 h-4 text-[#ffb627]" />
          <span className="font-bold text-white text-sm">2,418.50</span>
          <span className="text-[10px] text-[#ffb627] font-bold">USDT</span>
        </div>
      </div>

      <div className="relative h-8 overflow-hidden border-t border-white/10 bg-black/30">
        <div className="absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0a0e1a] to-transparent" />
        <div className="absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0a0e1a] to-transparent" />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 text-[10px] font-black tracking-widest text-rose-400">
          <Radio className="w-3 h-3 animate-pulse" />
          مباشر
        </div>
        <div className="absolute inset-y-0 flex items-center gap-10 whitespace-nowrap animate-[marquee_45s_linear_infinite] text-xs text-slate-300 pl-24 pr-24">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-[#ffb627]" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TournamentCard({ t }: { t: Tournament }) {
  return (
    <Card
      className="group relative shrink-0 w-[320px] overflow-hidden border-white/10 bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_-10px_rgba(30,136,255,0.45)]"
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="relative h-44 overflow-hidden">
        <img
          src={t.cover}
          alt={t.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-[#0a0e1a]/40 to-transparent" />
        <div className="absolute top-3 right-3 left-3 flex items-center justify-between">
          {t.live ? (
            <Badge className="bg-rose-500 hover:bg-rose-500 text-white rounded-sm px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5">
              <CircleDot className="w-3 h-3 animate-pulse" />
              مباشر الآن
            </Badge>
          ) : (
            <Badge className="bg-[#1e88ff]/90 hover:bg-[#1e88ff] text-white rounded-sm px-2 py-0.5 text-[10px] font-bold">
              قريبًا
            </Badge>
          )}
          <Badge className="bg-black/60 text-[#ffb627] border border-[#ffb627]/30 rounded-sm px-2 py-0.5 text-[10px] font-bold">
            {t.game}
          </Badge>
        </div>
        <div className="absolute bottom-2 right-3 left-3">
          <h3 className="font-['Bebas_Neue'] text-2xl tracking-wider leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
            {t.title}
          </h3>
          <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            {t.region}
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest">
              جائزة كبرى
            </div>
            <div className="font-['Bebas_Neue'] text-3xl text-[#ffb627] leading-none">
              {t.prize.toLocaleString()}{" "}
              <span className="text-base">USDT</span>
            </div>
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest">
              يبدأ خلال
            </div>
            <div className="font-mono text-lg font-black text-white">
              {t.countdown}
            </div>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-[#1e88ff] to-[#0a4d9c]"
            style={{ width: `${(t.registered / t.capacity) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span className="text-white font-bold">{t.registered}</span>
            <span>/ {t.capacity} مسجّل</span>
          </span>
          <span>{Math.round((t.registered / t.capacity) * 100)}% ممتلئ</span>
        </div>

        <Button className="w-full mt-3 h-10 bg-gradient-to-l from-[#ffb627] to-[#ff8a00] text-black font-bold rounded-md hover:brightness-110">
          انضم الآن
          <ChevronLeft className="w-4 h-4 mr-2" />
        </Button>
      </div>
    </Card>
  );
}

function GameTileCard({ g, kind }: { g: GameTile; kind: "team" | "solo" }) {
  return (
    <Card
      className="group relative shrink-0 w-[200px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_-10px_rgba(255,182,39,0.4)]"
    >
      <div className={`relative h-32 bg-gradient-to-br ${g.hue} overflow-hidden`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,_rgba(255,255,255,0.25),_transparent_60%)]" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-['Bebas_Neue'] text-5xl tracking-wider text-white/95 drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)]">
            {g.shortName}
          </span>
        </div>
        {g.hot && (
          <Badge className="absolute top-2 right-2 bg-rose-500 hover:bg-rose-500 text-white rounded-sm px-1.5 py-0 text-[9px] font-bold flex items-center gap-1">
            <Flame className="w-3 h-3" />
            رائج
          </Badge>
        )}
        <Badge className="absolute top-2 left-2 bg-black/60 text-slate-200 rounded-sm px-1.5 py-0 text-[9px] font-bold">
          {kind === "team" ? "جماعي" : "فردي"}
        </Badge>
      </div>
      <div className="p-3">
        <div className="font-bold text-white text-sm">{g.name}</div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold">
              {g.online.toLocaleString()}
            </span>
            متصل
          </span>
          <button className="text-[11px] font-bold text-[#1e88ff] hover:text-[#ffb627] flex items-center gap-0.5">
            ابدأ
            <ChevronLeft className="w-3 h-3" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function ChallengeCard({ c }: { c: Challenge }) {
  const incoming = c.direction === "in";
  return (
    <Card
      className={`group relative shrink-0 w-[300px] overflow-hidden border-white/10 bg-gradient-to-b from-[#10172a] to-[#0a0e1a] text-white p-0 rounded-xl transition-all hover:-translate-y-1 ${
        incoming
          ? "shadow-[0_15px_40px_-15px_rgba(244,63,94,0.45)] hover:shadow-[0_20px_50px_-10px_rgba(244,63,94,0.6)]"
          : "shadow-[0_15px_40px_-15px_rgba(30,136,255,0.45)]"
      }`}
    >
      <div className="flex items-center justify-between p-3 border-b border-white/5">
        <Badge
          className={`rounded-sm px-2 py-0 text-[10px] font-bold ${
            incoming
              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              : "bg-[#1e88ff]/20 text-[#1e88ff] border border-[#1e88ff]/40"
          }`}
        >
          {incoming ? "تحدّاك" : "تحدّيك أنت"}
        </Badge>
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          <Timer className="w-3 h-3 text-[#ffb627]" />
          ينتهي خلال{" "}
          <span className="font-mono text-white font-bold">{c.expiresIn}</span>
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12 ring-2 ring-white/10">
            <AvatarFallback
              className={`text-white font-black ${
                incoming
                  ? "bg-gradient-to-br from-rose-500 to-rose-900"
                  : "bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c]"
              }`}
            >
              {c.opp.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white">{c.opp}</span>
              <Badge className="bg-[#ffb627]/15 text-[#ffb627] border border-[#ffb627]/30 rounded-sm px-1.5 py-0 text-[9px] font-bold">
                {c.rank}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-400">{c.oppHandle}</div>
          </div>
          <span className="text-[10px] font-bold text-slate-500">{c.flag}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[10px] text-slate-400 uppercase">اللعبة</div>
            <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-1">
              <Gamepad2 className="w-3.5 h-3.5 text-[#1e88ff]" />
              {c.game}
            </div>
          </div>
          <div className="rounded-md border border-[#ffb627]/30 bg-[#ffb627]/5 p-2">
            <div className="text-[10px] text-[#ffb627] uppercase">رهان</div>
            <div className="font-['Bebas_Neue'] text-xl text-[#ffb627] tracking-wider leading-none mt-1">
              {c.stake} <span className="text-xs">USDT</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {incoming ? (
            <>
              <Button className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-md">
                <Check className="w-4 h-4 ml-1" />
                قبول
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button className="w-full h-9 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-md">
              في انتظار الرد...
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ActivityRow({ e, idx }: { e: ActivityEvent; idx: number }) {
  const iconMap: Record<ActivityEvent["kind"], React.ReactNode> = {
    tournament: <Trophy className="w-4 h-4" />,
    win: <Medal className="w-4 h-4" />,
    upset: <Zap className="w-4 h-4" />,
    match: <Swords className="w-4 h-4" />,
    highscore: <Star className="w-4 h-4" />,
    system: <ShieldCheck className="w-4 h-4" />,
  };
  const tone: Record<ActivityEvent["kind"], string> = {
    tournament: "from-[#ffb627] to-[#a86b00] text-black",
    win: "from-emerald-400 to-emerald-800 text-white",
    upset: "from-fuchsia-500 to-fuchsia-900 text-white",
    match: "from-[#1e88ff] to-[#0a4d9c] text-white",
    highscore: "from-amber-300 to-amber-700 text-black",
    system: "from-slate-500 to-slate-800 text-white",
  };

  return (
    <div className="relative grid grid-cols-[36px_1fr_auto] gap-3 items-start py-3.5 group">
      <div className="absolute right-[17px] top-0 bottom-0 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
      <div
        className={`relative z-10 grid place-items-center w-9 h-9 rounded-md bg-gradient-to-br ${tone[e.kind]} shadow-[0_0_20px_-5px_rgba(30,136,255,0.5)]`}
      >
        {iconMap[e.kind]}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-white leading-snug">{e.text}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
          <span>{e.meta}</span>
          <span>·</span>
          <span>{e.ago}</span>
          {idx < 3 && (
            <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-sm px-1.5 py-0 text-[9px] font-bold">
              جديد
            </Badge>
          )}
        </div>
      </div>
      {e.amount !== undefined && (
        <div
          className={`text-left font-['Bebas_Neue'] text-xl tracking-wider ${
            e.amount > 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {e.amount > 0 ? "+" : ""}
          {e.amount.toLocaleString()}{" "}
          <span className="text-[10px] text-slate-500">USDT</span>
        </div>
      )}
    </div>
  );
}

function ActivityTimeline() {
  const [items, setItems] = useState(ACTIVITY);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && items.length < 60) {
        setTimeout(() => {
          setItems((prev) => {
            const startIdx = prev.length;
            const next: ActivityEvent[] = ACTIVITY.map((a, i) => ({
              ...a,
              id: `${a.id}-${startIdx + i}`,
              ago: `منذ ${Math.floor((startIdx + i) / 4) + 6} ساعة`,
            }));
            return [...prev, ...next];
          });
        }, 400);
      }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length]);

  return (
    <section className="px-4 md:px-6 mt-8">
      <div className="flex items-end justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-md bg-gradient-to-br from-[#1e88ff] to-[#0a4d9c] text-white shadow-[0_0_30px_-5px_#1e88ff]">
            <Activity className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-['Bebas_Neue'] tracking-wider text-2xl md:text-3xl text-white leading-none">
              سجل المنصة المباشر
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              كل ما يحدث على VEX — بطولات، انتصارات، صدمات وقفزات قياسية
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          يُحدَّث الآن
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-white/10 rounded-xl p-2 md:p-4">
          {items.map((e, i) => (
            <ActivityRow key={e.id} e={e} idx={i} />
          ))}
          <div
            ref={sentinel}
            className="py-6 text-center text-xs text-slate-500"
          >
            <div className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1e88ff] animate-pulse" />
              <span>يتم تحميل أحداث أقدم...</span>
            </div>
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="relative overflow-hidden bg-gradient-to-br from-[#1e88ff]/15 via-[#0a0e1a] to-[#ffb627]/10 border-white/10 rounded-xl p-5">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#ffb627]/30 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[#ffb627] text-xs font-bold tracking-widest mb-2">
                <Crown className="w-4 h-4" />
                لاعب الأسبوع
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="w-14 h-14 ring-2 ring-[#ffb627]">
                  <AvatarFallback className="bg-gradient-to-br from-[#ffb627] to-[#a86b00] text-black font-black">
                    AF
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-['Bebas_Neue'] text-2xl text-white tracking-wider leading-none">
                    AbuFlash
                  </div>
                  <div className="text-xs text-slate-400">
                    24 انتصار · ربح 18,200 USDT
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="فوز" value="24" tone="text-emerald-400" />
                <MiniStat label="هزيمة" value="3" tone="text-rose-400" />
                <MiniStat label="نسبة" value="89%" tone="text-[#ffb627]" />
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[#1e88ff] text-xs font-bold tracking-widest mb-3">
              <Target className="w-4 h-4" />
              تحدّيات اليوم
            </div>
            <div className="space-y-3">
              {[
                { t: "اربح 5 مباريات FIFA", p: "+150 XP", v: 60 },
                { t: "ادخل بطولة بقيمة 1000+ USDT", p: "+300 XP", v: 100 },
                { t: "العب 3 مباريات بلوت متتالية", p: "+80 XP", v: 33 },
              ].map((q) => (
                <div key={q.t}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-200">{q.t}</span>
                    <span className="text-[#ffb627] font-bold">{q.p}</span>
                  </div>
                  <Progress
                    value={q.v}
                    className="h-1.5 mt-1.5 bg-white/10 [&>div]:bg-gradient-to-l [&>div]:from-[#ffb627] [&>div]:to-[#ff8a00]"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-gradient-to-b from-[#0f1730] to-[#0a0e1a] border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-widest mb-3">
              <Megaphone className="w-4 h-4" />
              إعلان رسمي
            </div>
            <div className="text-sm text-white leading-relaxed">
              موسم MENA Pro Cup 2026 يبدأ الأسبوع القادم — جوائز تتجاوز{" "}
              <span className="text-[#ffb627] font-bold">250,000 USDT</span>،
              التسجيل مفتوح لجميع الرتب من ذهبي وما فوق.
            </div>
            <Button className="w-full mt-3 h-9 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-md text-sm">
              تفاصيل الموسم
            </Button>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-md bg-white/[0.04] border border-white/10 py-2">
      <div className={`font-['Bebas_Neue'] text-xl tracking-wider ${tone}`}>
        {value}
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

export type StadiumHomeProps = {
  owner: OwnerBarProps;
  showTopBar?: boolean;
};

export function StadiumHome({ owner, showTopBar = false }: StadiumHomeProps) {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-[#0a0e1a] text-white selection:bg-[#ffb627] selection:text-black"
      style={{ fontFamily: "'IBM Plex Sans Arabic', 'Cairo', sans-serif" }}
    >
      <style>{`
        @keyframes shine { 0% { transform: translateX(-150%) skewX(-12deg); } 100% { transform: translateX(350%) skewX(-12deg); } }
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        @keyframes floaty { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>

      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Cairo:wght@400;700;900&display=swap"
      />

      {showTopBar ? <TopBar /> : null}
      <OwnerBar {...owner} />
      <HeroCarousel />

      <div className="space-y-10 py-8 relative">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0a0e1a] to-transparent pointer-events-none" />

        <Rail
          title="بطولات مباشرة"
          kicker="جوائز ضخمة، مقاعد محدودة، البث مفتوح للجميع"
          icon={<Trophy className="w-5 h-5" />}
          accent="gold"
        >
          {TOURNAMENTS.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </Rail>

        <Rail
          title="ألعاب جماعية"
          kicker="فرق · تنسيقات 5v5 · 4v4 · 2v2"
          icon={<Users className="w-5 h-5" />}
          accent="blue"
        >
          {TEAM_GAMES.map((g) => (
            <GameTileCard key={g.name} g={g} kind="team" />
          ))}
        </Rail>

        <Rail
          title="ألعاب فردية"
          kicker="1v1 · رتبة شخصية · مباريات سريعة برهان فوري"
          icon={<Gamepad2 className="w-5 h-5" />}
          accent="gold"
        >
          {SOLO_GAMES.map((g) => (
            <GameTileCard key={g.name} g={g} kind="solo" />
          ))}
        </Rail>

        <Rail
          title="تحدّيات نشطة"
          kicker="طلبات مرسلة وواردة — ردّ خلال الوقت قبل ما تنتهي"
          icon={<Swords className="w-5 h-5" />}
          accent="red"
        >
          {CHALLENGES.map((c) => (
            <ChallengeCard key={c.id} c={c} />
          ))}
        </Rail>

        <ActivityTimeline />
      </div>

      <div className="px-4 md:px-6 pb-12">
        <div className="text-center text-[11px] text-slate-600">
          استمر في التمرير — السجل لا ينتهي. كل لحظة جديدة على VEX تظهر هنا.
        </div>
      </div>
    </div>
  );
}

export default StadiumHome;
