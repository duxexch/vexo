import { useEffect, useMemo, useRef, useState } from "react";
import {
  Trophy,
  Flame,
  Swords,
  Wallet,
  Users,
  Clock,
  Crown,
  Zap,
  ShieldCheck,
  Bell,
  Search,
  ChevronUp,
  Plus,
  Radio,
  Gamepad2,
  Target,
  Star,
  TrendingUp,
  Coins,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Sparkles,
  History,
  Award,
  Crosshair,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

const HERO_BG = "/__mockup/images/vex-home-livefeed-hero-arena.png";
const TOURNEY_COVER = "/__mockup/images/vex-home-livefeed-tournament-cover.png";
const GRAIN_BG = "/__mockup/images/vex-home-livefeed-grain-bg.png";

const FONT_LINK_ID = "vex-livefeed-fonts";

function ensureFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const preconnect1 = document.createElement("link");
  preconnect1.rel = "preconnect";
  preconnect1.href = "https://fonts.googleapis.com";
  document.head.appendChild(preconnect1);
  const preconnect2 = document.createElement("link");
  preconnect2.rel = "preconnect";
  preconnect2.href = "https://fonts.gstatic.com";
  preconnect2.crossOrigin = "";
  document.head.appendChild(preconnect2);
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700;900&family=Inter:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

type FeedItem =
  | { kind: "tournament"; data: Tournament }
  | { kind: "challenge"; data: Challenge }
  | { kind: "game"; data: GameSuggestion }
  | { kind: "history"; data: HistoryEvent }
  | { kind: "broadcast"; data: BroadcastEvent }
  | { kind: "leaderboard"; data: LeaderboardSnapshot }
  | { kind: "wallet"; data: WalletPulse };

interface Tournament {
  id: string;
  name: string;
  game: string;
  prize: number;
  registered: number;
  capacity: number;
  startsInMs: number;
  liveNow: boolean;
  region: string;
  fee: number;
}

interface Challenge {
  id: string;
  opponent: string;
  rank: string;
  game: string;
  stake: number;
  direction: "incoming" | "outgoing";
  bestOf: number;
  expiresInSec: number;
  winRate: number;
}

interface GameSuggestion {
  id: string;
  name: string;
  category: "ألعاب جماعية" | "ألعاب فردية";
  online: number;
  hot: boolean;
  art: string;
  badge?: string;
}

interface HistoryEvent {
  id: string;
  type: "tournament_end" | "personal" | "milestone" | "upset";
  title: string;
  detail: string;
  timeAgo: string;
  amount?: number;
  positive?: boolean;
}

interface BroadcastEvent {
  id: string;
  text: string;
  source: string;
  timeAgo: string;
}

interface LeaderboardSnapshot {
  id: string;
  scope: string;
  entries: Array<{ rank: number; name: string; score: number; trend: "up" | "down" | "flat" }>;
}

interface WalletPulse {
  id: string;
  delta: number;
  reason: string;
  game: string;
  timeAgo: string;
}

const TOURNAMENTS: Tournament[] = [
  {
    id: "t1",
    name: "كأس الخليج للأبطال — موسم الصيف",
    game: "FIFA 25",
    prize: 24500,
    registered: 118,
    capacity: 128,
    startsInMs: 1000 * 60 * 12,
    liveNow: true,
    region: "الخليج",
    fee: 25,
  },
  {
    id: "t2",
    name: "نزال الصحراء الكبير",
    game: "Valorant",
    prize: 48000,
    registered: 84,
    capacity: 96,
    startsInMs: 1000 * 60 * 60 * 3 + 1000 * 60 * 22,
    liveNow: false,
    region: "MENA",
    fee: 50,
  },
  {
    id: "t3",
    name: "بطولة الجمعة المفتوحة",
    game: "PUBG Mobile",
    prize: 9800,
    registered: 192,
    capacity: 256,
    startsInMs: 1000 * 60 * 47,
    liveNow: false,
    region: "السعودية",
    fee: 10,
  },
  {
    id: "t4",
    name: "مواجهة الأساطير — CS2",
    game: "CS2",
    prize: 32000,
    registered: 48,
    capacity: 64,
    startsInMs: 1000 * 60 * 4,
    liveNow: true,
    region: "MENA",
    fee: 40,
  },
  {
    id: "t5",
    name: "تحدي الكورة الأسبوعي",
    game: "eFootball",
    prize: 6400,
    registered: 220,
    capacity: 256,
    startsInMs: 1000 * 60 * 60 * 6,
    liveNow: false,
    region: "مصر",
    fee: 5,
  },
];

const CHALLENGES: Challenge[] = [
  {
    id: "c1",
    opponent: "AbuFlash",
    rank: "ماستر",
    game: "FIFA 25",
    stake: 50,
    direction: "incoming",
    bestOf: 3,
    expiresInSec: 138,
    winRate: 72,
  },
  {
    id: "c2",
    opponent: "M7md_Sniper",
    rank: "نخبة",
    game: "CS2 1v1",
    stake: 120,
    direction: "incoming",
    bestOf: 5,
    expiresInSec: 64,
    winRate: 81,
  },
  {
    id: "c3",
    opponent: "ZAYED_99",
    rank: "ذهبي",
    game: "PUBG TDM",
    stake: 25,
    direction: "outgoing",
    bestOf: 3,
    expiresInSec: 412,
    winRate: 58,
  },
  {
    id: "c4",
    opponent: "Layla_Ace",
    rank: "ماستر",
    game: "Valorant 1v1",
    stake: 80,
    direction: "incoming",
    bestOf: 5,
    expiresInSec: 211,
    winRate: 67,
  },
  {
    id: "c5",
    opponent: "Khalifa_X",
    rank: "نخبة",
    game: "FC Mobile",
    stake: 35,
    direction: "outgoing",
    bestOf: 3,
    expiresInSec: 320,
    winRate: 63,
  },
];

const GAMES_MULTI: GameSuggestion[] = [
  { id: "g1", name: "FIFA 25", category: "ألعاب جماعية", online: 18420, hot: true, art: "from-emerald-500 to-lime-300" },
  { id: "g2", name: "Valorant", category: "ألعاب جماعية", online: 22310, hot: true, art: "from-rose-500 to-orange-400", badge: "بطولة الآن" },
  { id: "g3", name: "CS2", category: "ألعاب جماعية", online: 14012, hot: false, art: "from-amber-400 to-yellow-200" },
  { id: "g4", name: "PUBG Mobile", category: "ألعاب جماعية", online: 31200, hot: true, art: "from-sky-500 to-cyan-300" },
  { id: "g5", name: "FC Mobile", category: "ألعاب جماعية", online: 9870, hot: false, art: "from-fuchsia-500 to-pink-300" },
  { id: "g6", name: "eFootball", category: "ألعاب جماعية", online: 6450, hot: false, art: "from-indigo-500 to-violet-300" },
];

const GAMES_SOLO: GameSuggestion[] = [
  { id: "s1", name: "Chess Blitz", category: "ألعاب فردية", online: 4720, hot: true, art: "from-stone-300 to-stone-100", badge: "تحدي سريع" },
  { id: "s2", name: "Backgammon", category: "ألعاب فردية", online: 3210, hot: false, art: "from-amber-500 to-orange-300" },
  { id: "s3", name: "Domino", category: "ألعاب فردية", online: 5840, hot: true, art: "from-red-500 to-rose-300" },
  { id: "s4", name: "Baloot", category: "ألعاب فردية", online: 2980, hot: false, art: "from-emerald-600 to-teal-400" },
  { id: "s5", name: "Tarneeb 41", category: "ألعاب فردية", online: 2105, hot: false, art: "from-violet-600 to-purple-400" },
  { id: "s6", name: "Sudoku Duel", category: "ألعاب فردية", online: 1480, hot: false, art: "from-blue-500 to-sky-300" },
];

const HISTORY: HistoryEvent[] = [
  { id: "h1", type: "tournament_end", title: "انتهت بطولة \"ليالي الرياض\"", detail: "الفائز: ZAYED_99 — كأس FIFA 25", amount: 12000, positive: true, timeAgo: "قبل دقيقتين" },
  { id: "h2", type: "personal", title: "مباراتك الأخيرة", detail: "فُزت ضد Khalifa_X بنتيجة 3-1 — Valorant 1v1", amount: 80, positive: true, timeAgo: "قبل 14 دقيقة" },
  { id: "h3", type: "upset", title: "مفاجأة الليلة", detail: "Layla_Ace أطاحت بالبطل M7md_Sniper في ربع نهائي CS2", timeAgo: "قبل 22 دقيقة" },
  { id: "h4", type: "milestone", title: "رقم قياسي جديد", detail: "AbuFlash يكسر حاجز 1000 فوز على المنصة", timeAgo: "قبل 38 دقيقة" },
  { id: "h5", type: "personal", title: "مباراتك السابقة", detail: "خسرت أمام Sultan_07 بنتيجة 2-3 — FIFA 25", amount: 30, positive: false, timeAgo: "قبل ساعة" },
  { id: "h6", type: "tournament_end", title: "كأس \"نجوم الدوحة\"", detail: "الفائز: AbuFlash — جائزة 18,500 USDT", amount: 18500, positive: true, timeAgo: "قبل ساعتين" },
  { id: "h7", type: "milestone", title: "صعود نجم", detail: "Layla_Ace تدخل المركز الثالث على لوحة الشرف الأسبوعية", timeAgo: "قبل 3 ساعات" },
];

const BROADCASTS: BroadcastEvent[] = [
  { id: "b1", text: "مباراة الافتتاح بدأت — كأس الخليج للأبطال", source: "البث المباشر", timeAgo: "الآن" },
  { id: "b2", text: "ZAYED_99 يصل إلى نصف نهائي PUBG Mobile", source: "تنبيه فوري", timeAgo: "قبل 4 دقائق" },
  { id: "b3", text: "محفظتك ارتفعت بـ 80 USDT بعد فوزك الأخير", source: "محفظتي", timeAgo: "قبل 14 دقيقة" },
];

const TICKER_ITEMS = [
  "AbuFlash فاز بـ 240 USDT — Valorant 1v1",
  "بطولة كأس الخليج تبدأ خلال 12 دقيقة",
  "ZAYED_99 يتأهل لربع نهائي PUBG",
  "Layla_Ace أطاحت M7md_Sniper — CS2",
  "5 لاعبين فقط متبقون للتسجيل في نزال الصحراء",
  "M7md_Sniper يحصد 3 انتصارات متتالية",
  "Khalifa_X يدخل التوب 100 الموسمي",
];

function formatCountdown(ms: number): { d: string; h: string; m: string; s: string; live: boolean } {
  if (ms <= 0) return { d: "00", h: "00", m: "00", s: "00", live: true };
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { d: pad(d), h: pad(h), m: pad(m), s: pad(s), live: false };
}

function useTick(intervalMs = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return y;
}

function FilmGrain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] mix-blend-overlay opacity-[0.10]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.7 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      }}
    />
  );
}

function ScanlineOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[55] opacity-[0.06]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(180deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 4px)",
      }}
    />
  );
}

function PulseDot({ size = 8 }: { size?: number }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
        style={{ background: "#ff2a4f" }}
      />
      <span
        className="relative inline-flex h-full w-full rounded-full"
        style={{ background: "#ff2a4f", boxShadow: "0 0 10px #ff2a4f" }}
      />
    </span>
  );
}

function Ticker() {
  return (
    <div
      className="relative w-full overflow-hidden border-y border-white/10 bg-black/60 backdrop-blur-md"
      style={{ height: 38 }}
    >
      <div className="absolute inset-y-0 right-0 z-10 flex items-center gap-2 bg-gradient-to-l from-[#ff2a4f] to-[#ff2a4f]/0 px-4 pl-12">
        <PulseDot />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-white">
          البث الحي
        </span>
      </div>
      <div className="flex h-full items-center whitespace-nowrap will-change-transform animate-[vex-marquee_50s_linear_infinite]">
        {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
          <span
            key={i}
            className="mx-6 inline-flex items-center gap-2 text-[13px] text-zinc-200/90"
          >
            <Activity className="h-3.5 w-3.5 text-[#ff2a4f]" />
            {t}
            <span className="mx-3 inline-block h-1 w-1 rounded-full bg-amber-400/80" />
          </span>
        ))}
      </div>
    </div>
  );
}

function TopBar({ scrollY }: { scrollY: number }) {
  const compact = scrollY > 80;
  return (
    <header
      className="sticky top-0 z-50 transition-all"
      style={{
        backdropFilter: "blur(14px)",
        background: compact
          ? "linear-gradient(180deg, rgba(8,6,10,0.92), rgba(8,6,10,0.78))"
          : "linear-gradient(180deg, rgba(8,6,10,0.65), rgba(8,6,10,0.20))",
        borderBottom: compact ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-[680px] items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-black"
            style={{
              background:
                "conic-gradient(from 220deg at 50% 50%, #ffd86b, #ff2a4f, #ffd86b)",
              boxShadow: "0 6px 24px -8px rgba(255,42,79,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
            }}
          >
            <span className="font-['Tajawal'] text-base font-black">V</span>
          </div>
          <div className="leading-tight">
            <div className="font-['Tajawal'] text-[15px] font-black tracking-wide text-white">
              VEX
            </div>
            <div className="text-[10px] font-medium text-zinc-400">البث الحي للبطولات</div>
          </div>
        </div>

        <div className="hidden flex-1 items-center md:flex">
          <div className="relative mx-3 w-full">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              dir="rtl"
              placeholder="ابحث عن لاعب أو بطولة أو لعبة"
              className="w-full rounded-full border border-white/10 bg-white/5 px-10 py-2 text-right text-[13px] text-zinc-200 placeholder:text-zinc-500 focus:border-[#ff2a4f]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="relative rounded-full border border-white/10 bg-white/5 p-2 text-zinc-300 hover:text-white">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-[#ff2a4f] shadow-[0_0_8px_#ff2a4f]" />
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-amber-300/20 bg-gradient-to-l from-amber-500/15 to-transparent px-3 py-1.5 sm:flex">
            <Wallet className="h-3.5 w-3.5 text-amber-300" />
            <span className="font-['Inter'] text-[12px] font-bold text-amber-200">
              1,284.50
            </span>
            <span className="text-[10px] font-medium text-amber-200/70">USDT</span>
          </div>
          <Avatar className="h-8 w-8 ring-2 ring-[#ff2a4f]/50">
            <AvatarFallback className="bg-zinc-800 text-[11px] font-bold text-zinc-200">
              SK
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

function HeroOwnerCard({ scrollY }: { scrollY: number }) {
  const parallax = Math.min(scrollY * 0.35, 160);
  const fade = Math.max(0, 1 - scrollY / 360);
  const tilt = Math.max(-6, -scrollY * 0.02);
  return (
    <section className="relative overflow-hidden" style={{ perspective: "1400px" }}>
      <div
        className="absolute inset-0"
        style={{
          transform: `translateY(${parallax * 0.5}px) scale(${1 + parallax * 0.0008})`,
          transition: "transform 0.05s linear",
        }}
      >
        <img
          src={HERO_BG}
          alt="ساحة بطولات VEX"
          className="h-full w-full object-cover"
          style={{ filter: "saturate(1.05) contrast(1.05)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,6,10,0.55) 0%, rgba(8,6,10,0.55) 35%, rgba(8,6,10,0.92) 85%, rgba(8,6,10,1) 100%)",
          }}
        />
        <div
          className="absolute inset-0 mix-blend-screen opacity-50"
          style={{
            background:
              "radial-gradient(60% 50% at 30% 20%, rgba(255,42,79,0.55), transparent 60%), radial-gradient(50% 40% at 80% 30%, rgba(255,210,90,0.35), transparent 60%)",
            transform: `translateY(${parallax * 0.2}px)`,
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[680px] px-4 pb-8 pt-10" style={{ opacity: fade }}>
        <div className="mb-5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff2a4f]/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ff7a90]">
            <PulseDot size={6} /> مباشر
          </span>
          <span className="text-[11px] text-zinc-300/80">12 بطولة شغّالة الآن</span>
        </div>

        <h1 className="font-['Tajawal'] text-[28px] font-black leading-tight text-white drop-shadow-[0_4px_20px_rgba(255,42,79,0.35)] sm:text-[36px]">
          أهلاً يا بطل،
          <br />
          الساحة جاهزة لك.
        </h1>
        <p className="mt-2 text-[13px] text-zinc-300/85 sm:text-[14px]">
          آخر ظهور قبل 4 دقائق — سلسلة انتصاراتك:{" "}
          <span className="font-bold text-amber-200">5</span> متتالية
        </p>

        {/* Owner Card */}
        <div
          className="relative mt-6 will-change-transform"
          style={{
            transform: `rotateX(${tilt}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          <div
            className="absolute -inset-px rounded-[22px] opacity-90"
            style={{
              background:
                "conic-gradient(from 220deg at 50% 50%, #ff2a4f, #ffd86b, #ff2a4f, rgba(255,42,79,0.6))",
              filter: "blur(0.5px)",
            }}
          />
          <Card
            className="relative overflow-hidden rounded-[22px] border-0 bg-[#0e0a12]/95 p-5"
            style={{
              boxShadow:
                "0 30px 80px -20px rgba(255,42,79,0.45), 0 10px 30px -10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(120% 60% at 100% 0%, rgba(255,42,79,0.25), transparent 60%), radial-gradient(80% 60% at 0% 100%, rgba(255,210,90,0.15), transparent 60%)",
              }}
            />
            <div className="relative flex items-start gap-4">
              <div className="relative">
                <div
                  className="absolute -inset-1 rounded-full opacity-90"
                  style={{
                    background:
                      "conic-gradient(from 0deg, #ff2a4f, #ffd86b, #ff2a4f)",
                    filter: "blur(0.5px)",
                    animation: "vex-spin 6s linear infinite",
                  }}
                />
                <Avatar className="relative h-16 w-16 ring-2 ring-black">
                  <AvatarFallback className="bg-gradient-to-br from-zinc-800 to-zinc-900 font-['Tajawal'] text-lg font-black text-amber-300">
                    SK
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">
                  <Crown className="h-2.5 w-2.5" /> 47
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-['Tajawal'] text-[20px] font-black text-white">
                    Sultan_King
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                    <ShieldCheck className="h-3 w-3" /> موثّق
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span>المرتبة: ماستر</span>
                  <span className="h-1 w-1 rounded-full bg-zinc-600" />
                  <span>التصنيف العالمي #284</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat
                    label="محفظتي"
                    value="1,284.50"
                    suffix="USDT"
                    icon={<Wallet className="h-3 w-3" />}
                    accent="amber"
                  />
                  <MiniStat
                    label="نتيجة اليوم"
                    value="7-2"
                    suffix="W/L"
                    icon={<Swords className="h-3 w-3" />}
                    accent="rose"
                  />
                  <MiniStat
                    label="نقاط XP"
                    value="2,140"
                    suffix="/ 3,000"
                    icon={<Zap className="h-3 w-3" />}
                    accent="white"
                  />
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-zinc-400">
                      تقدّم الأسبوع
                    </span>
                    <span className="text-[10px] font-bold text-amber-300">71%</span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="absolute inset-y-0 right-0 rounded-full"
                      style={{
                        width: "71%",
                        background:
                          "linear-gradient(90deg, #ffd86b, #ff2a4f)",
                        boxShadow: "0 0 12px rgba(255,42,79,0.6)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-3 gap-2">
              <Button
                size="sm"
                className="col-span-2 h-11 rounded-xl border-0 bg-gradient-to-l from-[#ff2a4f] to-[#ff5577] font-['Tajawal'] text-[14px] font-black text-white shadow-[0_10px_30px_-10px_rgba(255,42,79,0.9)] hover:from-[#ff3a5f] hover:to-[#ff6587]"
              >
                <Swords className="ml-1 h-4 w-4" />
                تحدّى صديق الآن
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 rounded-xl border-amber-400/30 bg-amber-400/10 font-['Tajawal'] text-[13px] font-bold text-amber-200 hover:bg-amber-400/20"
              >
                <Wallet className="ml-1 h-4 w-4" />
                إيداع
              </Button>
            </div>

            <div className="relative mt-3 flex items-center justify-between text-[10px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> آخر تحديث: قبل 12 ثانية
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-300" /> 3 دعوات بانتظارك
              </span>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  icon,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  accent: "amber" | "rose" | "white";
}) {
  const accentMap = {
    amber: "text-amber-300",
    rose: "text-[#ff7a90]",
    white: "text-white",
  };
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
      <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        <span className={accentMap[accent]}>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`font-['Inter'] text-[14px] font-extrabold ${accentMap[accent]}`}>
          {value}
        </span>
        {suffix && <span className="text-[9px] text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

function CardShell({
  kind,
  children,
  active,
}: {
  kind: "tournament" | "challenge" | "game" | "history" | "broadcast" | "leaderboard" | "wallet";
  children: React.ReactNode;
  active: boolean;
}) {
  const accent: Record<string, { ring: string; chip: string; label: string; icon: React.ReactNode }> = {
    tournament: {
      ring: "rgba(255,42,79,0.5)",
      chip: "bg-[#ff2a4f]/15 text-[#ff7a90]",
      label: "بطولة مباشرة",
      icon: <Trophy className="h-3 w-3" />,
    },
    challenge: {
      ring: "rgba(255,210,90,0.45)",
      chip: "bg-amber-400/15 text-amber-300",
      label: "تحدي شخصي",
      icon: <Swords className="h-3 w-3" />,
    },
    game: {
      ring: "rgba(120,160,255,0.35)",
      chip: "bg-sky-400/15 text-sky-300",
      label: "اقتراح لعبة",
      icon: <Gamepad2 className="h-3 w-3" />,
    },
    history: {
      ring: "rgba(255,255,255,0.18)",
      chip: "bg-white/10 text-zinc-300",
      label: "سجل المنصة",
      icon: <History className="h-3 w-3" />,
    },
    broadcast: {
      ring: "rgba(255,42,79,0.45)",
      chip: "bg-[#ff2a4f]/15 text-[#ff7a90]",
      label: "بث فوري",
      icon: <Radio className="h-3 w-3" />,
    },
    leaderboard: {
      ring: "rgba(255,210,90,0.4)",
      chip: "bg-amber-400/15 text-amber-300",
      label: "لوحة الشرف",
      icon: <Award className="h-3 w-3" />,
    },
    wallet: {
      ring: "rgba(110,231,183,0.35)",
      chip: "bg-emerald-400/15 text-emerald-300",
      label: "نبضة محفظة",
      icon: <Coins className="h-3 w-3" />,
    },
  };
  const meta = accent[kind];
  return (
    <article
      className="group relative will-change-transform"
      style={{
        transformStyle: "preserve-3d",
        transform: active ? "translateY(-2px) scale(1.012) rotateX(-2deg)" : "translateY(0) scale(1) rotateX(0)",
        transition: "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      <div
        className="absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(60% 70% at 50% 0%, ${meta.ring}, transparent 70%)`,
          filter: "blur(8px)",
        }}
        aria-hidden
      />
      <Card
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#15101a]/95 to-[#0c0810]/95 p-0 text-white"
        style={{
          boxShadow: active
            ? `0 24px 60px -20px ${meta.ring}, 0 8px 24px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`
            : "0 12px 30px -12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chip}`}
          >
            {meta.icon}
            {meta.label}
          </span>
          <span className="text-[10px] text-zinc-500">#VEX</span>
        </div>
        {children}
      </Card>
    </article>
  );
}

function TournamentCard({ t, active }: { t: Tournament; active: boolean }) {
  useTick(1000);
  const remaining = useRef(Date.now() + t.startsInMs).current - Date.now();
  const cd = formatCountdown(remaining);
  const fillPct = Math.round((t.registered / t.capacity) * 100);
  return (
    <CardShell kind="tournament" active={active}>
      <div className="relative h-32 overflow-hidden">
        <img
          src={TOURNEY_COVER}
          alt={t.name}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          style={{
            transform: active ? "scale(1.06)" : "scale(1.02)",
            transition: "transform 600ms ease",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,6,10,0.05) 0%, rgba(8,6,10,0.85) 90%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-60 mix-blend-overlay"
          style={{
            background:
              "linear-gradient(120deg, rgba(255,42,79,0.45), transparent 50%, rgba(255,210,90,0.4))",
          }}
        />

        <div className="absolute right-3 top-3 flex items-center gap-2">
          {t.liveNow ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff2a4f] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_0_18px_rgba(255,42,79,0.7)]">
              <PulseDot size={6} /> LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-zinc-200">
              <Clock className="h-2.5 w-2.5" /> قريبًا
            </span>
          )}
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
            {t.region}
          </span>
        </div>

        <div className="absolute bottom-2 right-3 left-3 flex items-end justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
              {t.game}
            </div>
            <h3 className="truncate font-['Tajawal'] text-[16px] font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
              {t.name}
            </h3>
          </div>
          <div className="text-left">
            <div className="text-[9px] font-medium text-zinc-300">جائزة كلية</div>
            <div className="font-['Inter'] text-[18px] font-extrabold leading-none text-amber-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
              {t.prize.toLocaleString("en-US")}
            </div>
            <div className="text-[10px] font-bold text-amber-300/80">USDT</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        <CountdownBlock label="أيام" value={cd.d} />
        <CountdownBlock label="ساعة" value={cd.h} />
        <CountdownBlock label="دقيقة" value={cd.m} pulse={cd.live || (cd.d === "00" && cd.h === "00")} />
      </div>

      <div className="px-4 pb-2">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-zinc-400">
            <Users className="h-3 w-3" /> {t.registered}/{t.capacity} لاعب
          </span>
          <span className="font-bold text-amber-300">{fillPct}% ممتلئة</span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 right-0 rounded-full"
            style={{
              width: `${fillPct}%`,
              background:
                "linear-gradient(90deg, #ffd86b, #ff2a4f)",
              boxShadow: "0 0 10px rgba(255,42,79,0.6)",
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-black/30 px-4 py-3">
        <div className="text-[11px] text-zinc-400">
          رسوم الدخول:{" "}
          <span className="font-bold text-zinc-200">{t.fee} USDT</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-white/10 bg-white/5 px-3 text-[12px] text-zinc-200 hover:bg-white/10"
          >
            تفاصيل
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-lg border-0 bg-gradient-to-l from-[#ff2a4f] to-[#ff5577] px-4 text-[12px] font-black text-white shadow-[0_8px_20px_-8px_rgba(255,42,79,0.8)] hover:from-[#ff3a5f] hover:to-[#ff6587]"
          >
            انضم
          </Button>
        </div>
      </div>
    </CardShell>
  );
}

function CountdownBlock({ label, value, pulse }: { label: string; value: string; pulse?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.05] to-transparent px-2 py-1.5 text-center">
      <div
        className={`font-['Inter'] text-[20px] font-extrabold leading-none text-white ${pulse ? "animate-pulse" : ""}`}
        style={{
          textShadow: "0 2px 12px rgba(255,42,79,0.4)",
        }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function ChallengeCard({ c, active }: { c: Challenge; active: boolean }) {
  const incoming = c.direction === "incoming";
  return (
    <CardShell kind="challenge" active={active}>
      <div className="px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-12 w-12 ring-2 ring-amber-300/40">
              <AvatarFallback className="bg-gradient-to-br from-zinc-700 to-zinc-900 text-[12px] font-black text-amber-200">
                {c.opponent.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black text-black">
              {c.rank}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate font-['Tajawal'] text-[15px] font-black text-white">
                {c.opponent}
              </h4>
              {incoming ? (
                <span className="rounded-md bg-[#ff2a4f]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#ff7a90]">
                  تحدّاك
                </span>
              ) : (
                <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                  بانتظار الرد
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <Gamepad2 className="h-3 w-3" /> {c.game}
              </span>
              <span className="h-1 w-1 rounded-full bg-zinc-600" />
              <span>أفضل من {c.bestOf}</span>
              <span className="h-1 w-1 rounded-full bg-zinc-600" />
              <span className="inline-flex items-center gap-1">
                <Target className="h-3 w-3 text-emerald-400" /> {c.winRate}%
              </span>
            </div>
          </div>

          <div className="text-left">
            <div className="text-[9px] uppercase tracking-wider text-zinc-500">رهان</div>
            <div className="font-['Inter'] text-[18px] font-extrabold leading-none text-amber-200">
              {c.stake}
            </div>
            <div className="text-[10px] font-bold text-amber-300/80">USDT</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <Clock className="h-3 w-3 text-[#ff7a90]" />
            ينتهي خلال{" "}
            <span className="font-bold text-white">
              {Math.floor(c.expiresInSec / 60)}:{(c.expiresInSec % 60).toString().padStart(2, "0")}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500">رد سريع</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] bg-black/30 px-4 py-3">
        {incoming ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-lg border-white/10 bg-white/5 text-[12px] text-zinc-300 hover:bg-white/10"
            >
              <XCircle className="ml-1 h-4 w-4" />
              رفض
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-lg border-0 bg-gradient-to-l from-amber-500 to-amber-300 text-[12px] font-black text-black hover:from-amber-400 hover:to-amber-200"
            >
              <CheckCircle2 className="ml-1 h-4 w-4" />
              قبول التحدي
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-lg border-white/10 bg-white/5 text-[12px] text-zinc-300 hover:bg-white/10"
            >
              إلغاء الدعوة
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-lg border-0 bg-gradient-to-l from-emerald-500 to-emerald-400 text-[12px] font-black text-black hover:from-emerald-400 hover:to-emerald-300"
            >
              <Bell className="ml-1 h-4 w-4" />
              تذكير
            </Button>
          </>
        )}
      </div>
    </CardShell>
  );
}

function GameCard({ g, active }: { g: GameSuggestion; active: boolean }) {
  return (
    <CardShell kind="game" active={active}>
      <div className="flex items-center gap-3 p-4">
        <div
          className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${g.art}`}
          style={{
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 24px -8px rgba(0,0,0,0.6)",
          }}
        >
          <span className="font-['Tajawal'] text-[18px] font-black text-black/80 drop-shadow">
            {g.name.slice(0, 2)}
          </span>
          {g.hot && (
            <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#ff2a4f] text-[8px] text-white shadow-[0_0_8px_rgba(255,42,79,0.6)]">
              <Flame className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-['Tajawal'] text-[15px] font-black text-white">
              {g.name}
            </h4>
            {g.badge && (
              <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                {g.badge}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(110,231,183,0.8)]" />
              {g.online.toLocaleString("en-US")} لاعب أونلاين
            </span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">{g.category}</div>
        </div>

        <Button
          size="sm"
          className="h-9 rounded-lg border-0 bg-gradient-to-l from-[#ff2a4f] to-[#ff5577] px-3 text-[12px] font-black text-white shadow-[0_8px_20px_-10px_rgba(255,42,79,0.8)] hover:from-[#ff3a5f] hover:to-[#ff6587]"
        >
          <PlayCircle className="ml-1 h-4 w-4" />
          ابدأ الآن
        </Button>
      </div>
    </CardShell>
  );
}

function HistoryCard({ h, active }: { h: HistoryEvent; active: boolean }) {
  const icon =
    h.type === "tournament_end" ? (
      <Trophy className="h-4 w-4 text-amber-300" />
    ) : h.type === "personal" ? (
      <Crosshair className="h-4 w-4 text-[#ff7a90]" />
    ) : h.type === "upset" ? (
      <Zap className="h-4 w-4 text-amber-300" />
    ) : (
      <Star className="h-4 w-4 text-amber-300" />
    );
  return (
    <CardShell kind="history" active={active}>
      <div className="flex gap-3 p-4">
        <div className="relative">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            {icon}
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 inline-flex h-3 w-3 rounded-full border-2 border-[#0c0810] bg-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-['Tajawal'] text-[14px] font-bold text-white">
              {h.title}
            </h4>
            <span className="text-[10px] text-zinc-500">{h.timeAgo}</span>
          </div>
          <p className="mt-0.5 text-[12px] text-zinc-400">{h.detail}</p>
          {h.amount !== undefined && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5">
              <Coins className="h-3 w-3 text-amber-300" />
              <span
                className={`font-['Inter'] text-[12px] font-extrabold ${
                  h.positive ? "text-emerald-300" : "text-[#ff7a90]"
                }`}
              >
                {h.positive ? "+" : "−"}
                {h.amount.toLocaleString("en-US")} USDT
              </span>
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
}

function BroadcastCard({ b, active }: { b: BroadcastEvent; active: boolean }) {
  return (
    <CardShell kind="broadcast" active={active}>
      <div className="flex items-center gap-3 p-4">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ff2a4f]/15">
          <Radio className="h-4 w-4 text-[#ff7a90]" />
          <span
            className="absolute -inset-1 rounded-full"
            style={{
              boxShadow:
                "0 0 0 0 rgba(255,42,79,0.6)",
              animation: "vex-glow 2.4s ease-out infinite",
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-['Tajawal'] text-[14px] font-bold text-white">
            {b.text}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
            <span>{b.source}</span>
            <span className="h-1 w-1 rounded-full bg-zinc-600" />
            <span>{b.timeAgo}</span>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function LeaderboardCard({ l, active }: { l: LeaderboardSnapshot; active: boolean }) {
  return (
    <CardShell kind="leaderboard" active={active}>
      <div className="px-4 pb-2 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-['Tajawal'] text-[14px] font-black text-white">
            {l.scope}
          </h4>
          <span className="text-[10px] text-zinc-500">يُحدَّث الآن</span>
        </div>
        <div className="space-y-1.5">
          {l.entries.map((e) => (
            <div
              key={e.rank}
              className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-black ${
                    e.rank === 1
                      ? "bg-amber-400 text-black"
                      : e.rank === 2
                        ? "bg-zinc-300 text-black"
                        : e.rank === 3
                          ? "bg-amber-700/80 text-white"
                          : "bg-white/[0.05] text-zinc-300"
                  }`}
                >
                  {e.rank}
                </span>
                <span className="font-['Tajawal'] text-[13px] font-bold text-zinc-100">
                  {e.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-['Inter'] text-[12px] font-extrabold text-amber-200">
                  {e.score.toLocaleString("en-US")}
                </span>
                <TrendingUp
                  className={`h-3 w-3 ${
                    e.trend === "up"
                      ? "text-emerald-400"
                      : e.trend === "down"
                        ? "rotate-180 text-[#ff7a90]"
                        : "text-zinc-500"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-black/30 px-4 py-2 text-center">
        <button className="text-[11px] font-bold text-amber-300 hover:text-amber-200">
          شاهد لوحة الشرف الكاملة
        </button>
      </div>
    </CardShell>
  );
}

function WalletCard({ w, active }: { w: WalletPulse; active: boolean }) {
  return (
    <CardShell kind="wallet" active={active}>
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
          <Coins className="h-4 w-4 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-['Tajawal'] text-[14px] font-bold text-white">
            {w.reason}
          </p>
          <div className="mt-0.5 text-[11px] text-zinc-400">
            {w.game} — {w.timeAgo}
          </div>
        </div>
        <div className="text-left">
          <div
            className={`font-['Inter'] text-[16px] font-extrabold ${
              w.delta >= 0 ? "text-emerald-300" : "text-[#ff7a90]"
            }`}
          >
            {w.delta >= 0 ? "+" : "−"}
            {Math.abs(w.delta).toLocaleString("en-US")}
          </div>
          <div className="text-[10px] font-bold text-zinc-500">USDT</div>
        </div>
      </div>
    </CardShell>
  );
}

function FeedItemRenderer({
  item,
  active,
}: {
  item: FeedItem;
  active: boolean;
}) {
  switch (item.kind) {
    case "tournament":
      return <TournamentCard t={item.data} active={active} />;
    case "challenge":
      return <ChallengeCard c={item.data} active={active} />;
    case "game":
      return <GameCard g={item.data} active={active} />;
    case "history":
      return <HistoryCard h={item.data} active={active} />;
    case "broadcast":
      return <BroadcastCard b={item.data} active={active} />;
    case "leaderboard":
      return <LeaderboardCard l={item.data} active={active} />;
    case "wallet":
      return <WalletCard w={item.data} active={active} />;
  }
}

function buildFeed(): FeedItem[] {
  // Interleave heterogeneous cards so it never feels like a sectioned page.
  const f: FeedItem[] = [];
  f.push({ kind: "broadcast", data: BROADCASTS[0] });
  f.push({ kind: "tournament", data: TOURNAMENTS[0] });
  f.push({ kind: "challenge", data: CHALLENGES[0] });
  f.push({ kind: "game", data: GAMES_MULTI[0] });
  f.push({ kind: "history", data: HISTORY[0] });
  f.push({ kind: "tournament", data: TOURNAMENTS[3] });
  f.push({ kind: "challenge", data: CHALLENGES[1] });
  f.push({ kind: "game", data: GAMES_SOLO[2] });
  f.push({
    kind: "wallet",
    data: { id: "w1", delta: 80, reason: "ربحت رهان Valorant 1v1", game: "Valorant", timeAgo: "قبل 14 دقيقة" },
  });
  f.push({ kind: "history", data: HISTORY[1] });
  f.push({ kind: "tournament", data: TOURNAMENTS[1] });
  f.push({ kind: "game", data: GAMES_MULTI[1] });
  f.push({ kind: "broadcast", data: BROADCASTS[1] });
  f.push({ kind: "challenge", data: CHALLENGES[2] });
  f.push({
    kind: "leaderboard",
    data: {
      id: "lb1",
      scope: "أبطال الأسبوع — كل الألعاب",
      entries: [
        { rank: 1, name: "AbuFlash", score: 9420, trend: "up" },
        { rank: 2, name: "M7md_Sniper", score: 8980, trend: "up" },
        { rank: 3, name: "Layla_Ace", score: 8755, trend: "up" },
        { rank: 4, name: "ZAYED_99", score: 8210, trend: "flat" },
        { rank: 5, name: "Sultan_King", score: 7880, trend: "up" },
      ],
    },
  });
  f.push({ kind: "history", data: HISTORY[2] });
  f.push({ kind: "game", data: GAMES_MULTI[3] });
  f.push({ kind: "tournament", data: TOURNAMENTS[2] });
  f.push({ kind: "challenge", data: CHALLENGES[3] });
  f.push({ kind: "history", data: HISTORY[3] });
  f.push({ kind: "game", data: GAMES_SOLO[0] });
  f.push({ kind: "game", data: GAMES_MULTI[2] });
  f.push({
    kind: "wallet",
    data: { id: "w2", delta: -30, reason: "خسرت رهان FIFA 25", game: "FIFA 25", timeAgo: "قبل ساعة" },
  });
  f.push({ kind: "history", data: HISTORY[4] });
  f.push({ kind: "tournament", data: TOURNAMENTS[4] });
  f.push({ kind: "game", data: GAMES_SOLO[1] });
  f.push({ kind: "challenge", data: CHALLENGES[4] });
  f.push({ kind: "broadcast", data: BROADCASTS[2] });
  f.push({ kind: "game", data: GAMES_SOLO[3] });
  f.push({ kind: "history", data: HISTORY[5] });
  f.push({ kind: "game", data: GAMES_MULTI[4] });
  f.push({ kind: "game", data: GAMES_SOLO[4] });
  f.push({
    kind: "leaderboard",
    data: {
      id: "lb2",
      scope: "نجوم FIFA 25 — هذا الشهر",
      entries: [
        { rank: 1, name: "ZAYED_99", score: 5240, trend: "up" },
        { rank: 2, name: "Sultan_King", score: 4980, trend: "up" },
        { rank: 3, name: "AbuFlash", score: 4720, trend: "down" },
      ],
    },
  });
  f.push({ kind: "history", data: HISTORY[6] });
  f.push({ kind: "game", data: GAMES_MULTI[5] });
  f.push({ kind: "game", data: GAMES_SOLO[5] });
  return f;
}

function FloatingFAB({ scrollY }: { scrollY: number }) {
  const showTop = scrollY > 800;
  return (
    <>
      <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2">
        <div className="relative">
          <div
            className="absolute -inset-2 rounded-full opacity-90"
            style={{
              background:
                "conic-gradient(from 0deg, #ff2a4f, #ffd86b, #ff2a4f)",
              filter: "blur(10px)",
              animation: "vex-spin 4s linear infinite",
            }}
          />
          <button
            className="relative inline-flex items-center gap-2 rounded-full border border-white/15 bg-gradient-to-l from-[#ff2a4f] to-[#ff5577] px-5 py-3 font-['Tajawal'] text-[14px] font-black text-white shadow-[0_20px_40px_-15px_rgba(255,42,79,0.9)]"
          >
            <Swords className="h-4 w-4" />
            ابدأ تحدي
          </button>
        </div>
      </div>

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 left-5 z-[70] inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/70 text-zinc-300 backdrop-blur-md hover:text-white"
          aria-label="للأعلى"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

function FeedDivider({ label }: { label: string }) {
  return (
    <div className="my-1 flex items-center gap-3 px-1 py-2 text-zinc-500">
      <span className="h-px flex-1 bg-gradient-to-l from-white/10 to-transparent" />
      <span className="font-['Tajawal'] text-[10px] font-bold uppercase tracking-[0.3em]">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  );
}

function GamesGroupSection({
  label,
  sublabel,
  accent,
  games,
}: {
  label: string;
  sublabel: string;
  accent: "sky" | "amber";
  games: GameSuggestion[];
}) {
  const accentMap = {
    sky: {
      chip: "bg-sky-400/15 text-sky-200 ring-sky-400/30",
      bar: "from-sky-400/0 via-sky-400/70 to-sky-400/0",
      glow: "0 0 28px rgba(56,189,248,0.18)",
    },
    amber: {
      chip: "bg-amber-400/15 text-amber-200 ring-amber-400/30",
      bar: "from-amber-400/0 via-amber-400/80 to-amber-400/0",
      glow: "0 0 28px rgba(255,210,90,0.20)",
    },
  }[accent];

  return (
    <section
      className="mb-5"
      style={{ perspective: "1400px" }}
      aria-label={label}
    >
      <header className="mb-2 flex items-end justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ${accentMap.chip}`}
            style={{ boxShadow: accentMap.glow }}
          >
            <Gamepad2 className="h-3 w-3" />
            {label}
          </span>
          <span className="text-[11px] text-zinc-400">{sublabel}</span>
        </div>
        <button
          type="button"
          className="text-[11px] font-semibold text-zinc-300 transition hover:text-white"
        >
          عرض الكل
        </button>
      </header>
      <div className={`mb-2 h-px w-full bg-gradient-to-l ${accentMap.bar}`} />
      <div
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <style>{`
          section[aria-label="${label}"] > div::-webkit-scrollbar { display: none; }
        `}</style>
        {games.map((g) => (
          <div
            key={g.id}
            className="w-[230px] shrink-0 snap-start"
            style={{ transformStyle: "preserve-3d" }}
          >
            <GameCard g={g} active={false} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function LiveFeed() {
  useEffect(() => {
    ensureFonts();
  }, []);
  const scrollY = useScrollY();
  const feed = useMemo(() => buildFeed(), []);
  const [activeIdx, setActiveIdx] = useState(0);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const onScroll = () => {
      const center = window.innerHeight / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      itemRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const c = r.top + r.height / 2;
        const d = Math.abs(c - center);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      setActiveIdx(bestIdx);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [feed.length]);

  return (
    <div
      dir="rtl"
      lang="ar"
      className="relative min-h-screen overflow-x-hidden text-white"
      style={{
        fontFamily:
          "'Tajawal', 'Cairo', 'Inter', system-ui, -apple-system, sans-serif",
        background:
          "radial-gradient(120% 60% at 50% 0%, #1a0f18 0%, #0a0710 60%, #050308 100%)",
      }}
    >
      <style>{`
        @keyframes vex-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(50%); }
        }
        @keyframes vex-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes vex-glow {
          0% { box-shadow: 0 0 0 0 rgba(255,42,79,0.55); }
          80% { box-shadow: 0 0 0 14px rgba(255,42,79,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,42,79,0); }
        }
        @keyframes vex-rise {
          0% { opacity: 0; transform: translateY(18px) rotateX(-4deg); }
          100% { opacity: 1; transform: translateY(0) rotateX(0); }
        }
        .vex-rise { animation: vex-rise 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-50"
        style={{
          backgroundImage: `url(${GRAIN_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          mixBlendMode: "screen",
        }}
      />
      <FilmGrain />
      <ScanlineOverlay />

      <div className="relative z-10">
        <TopBar scrollY={scrollY} />
        <Ticker />
        <HeroOwnerCard scrollY={scrollY} />

        <main className="mx-auto max-w-[680px] px-3 pb-32 pt-2 sm:px-4">
          <GamesGroupSection
            label="ألعاب جماعية"
            sublabel="فرق وخصوم متصلون الآن"
            accent="sky"
            games={GAMES_MULTI}
          />
          <GamesGroupSection
            label="ألعاب فردية"
            sublabel="مبارزات ١ ضد ١ — ابدأ على طول"
            accent="amber"
            games={GAMES_SOLO}
          />

          <FeedDivider label="البث المباشر للحظة" />

          <div className="space-y-3" style={{ perspective: "1400px" }}>
            {feed.map((item, i) => {
              const showDivider =
                i === Math.floor(feed.length / 3) || i === Math.floor((feed.length * 2) / 3);
              const dividerLabel =
                i === Math.floor(feed.length / 3)
                  ? "يستمر التغطية الحية"
                  : "ذاكرة المنصة — أحداث سابقة";
              return (
                <div key={`${item.kind}-${i}`}>
                  {showDivider && <FeedDivider label={dividerLabel} />}
                  <div
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    className="vex-rise"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  >
                    <FeedItemRenderer item={item} active={activeIdx === i} />
                  </div>
                </div>
              );
            })}

            <FeedDivider label="جاري تحميل المزيد من السجل" />
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-500">
              <span className="inline-flex h-2 w-2 animate-bounce rounded-full bg-[#ff2a4f]" />
              <span
                className="inline-flex h-2 w-2 animate-bounce rounded-full bg-amber-400"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="inline-flex h-2 w-2 animate-bounce rounded-full bg-emerald-400"
                style={{ animationDelay: "240ms" }}
              />
              <span className="ml-3 text-[11px]">يحمّل المزيد من النشاط الحي…</span>
            </div>

            {/* Soft trailing teaser cards so the feed never abruptly ends. */}
            <div className="space-y-3 opacity-80">
              <div ref={(el) => { itemRefs.current[feed.length] = el; }}>
                <FeedItemRenderer
                  item={{ kind: "history", data: { id: "hT1", type: "milestone", title: "إنجاز جديد قادم", detail: "اقتربت من 100 فوز هذا الشهر — تبقّى 6 فقط", timeAgo: "قبل دقائق" } }}
                  active={false}
                />
              </div>
              <div ref={(el) => { itemRefs.current[feed.length + 1] = el; }}>
                <FeedItemRenderer
                  item={{ kind: "tournament", data: { id: "tT", name: "ليلة الأبطال — جولة الفجر", game: "Valorant", prize: 14000, registered: 36, capacity: 64, startsInMs: 1000 * 60 * 60 * 8, liveNow: false, region: "MENA", fee: 20 } }}
                  active={false}
                />
              </div>
              <div ref={(el) => { itemRefs.current[feed.length + 2] = el; }}>
                <FeedItemRenderer
                  item={{ kind: "broadcast", data: { id: "bT", text: "AbuFlash يبثّ الآن — تابع الأكشن المباشر", source: "البث الحي", timeAgo: "الآن" } }}
                  active={false}
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
              <div className="font-['Tajawal'] text-[13px] font-bold text-zinc-300">
                البث لا يتوقف. كل ثانية فيه بطل جديد.
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                ابدأ تحدي — وكن أنت الحدث القادم في السجل
              </div>
              <Button
                size="sm"
                className="mt-3 h-9 rounded-lg border-0 bg-gradient-to-l from-[#ff2a4f] to-[#ff5577] px-4 text-[12px] font-black text-white shadow-[0_10px_25px_-10px_rgba(255,42,79,0.8)]"
              >
                <Plus className="ml-1 h-4 w-4" />
                اصنع تحدي الآن
              </Button>
            </div>
          </div>
        </main>

        <FloatingFAB scrollY={scrollY} />
      </div>
    </div>
  );
}

export default LiveFeed;
