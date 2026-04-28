import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trophy,
  Swords,
  Bell,
  Wallet,
  Sparkles,
  Crown,
  Flame,
  Users,
  Zap,
  ShieldCheck,
  Search,
  ChevronLeft,
  Plus,
  Activity,
  Radio,
  TrendingUp,
  Gamepad2,
  Target,
  Gem,
  Hexagon,
  ArrowUpRight,
  Check,
  X,
  Clock,
  Joystick,
  Cpu,
  Ghost,
  Skull,
  Mountain,
  Sword,
  Headphones,
  Globe,
  Star,
  ShoppingBag,
  History,
  Filter,
} from "lucide-react";

const HOLO_STYLES = `
  @keyframes holo-aurora-1 { 0%,100% { transform: translate3d(-10%, -8%, 0) rotate(0deg); } 50% { transform: translate3d(8%, 6%, 0) rotate(180deg); } }
  @keyframes holo-aurora-2 { 0%,100% { transform: translate3d(8%, 10%, 0) rotate(0deg); } 50% { transform: translate3d(-12%, -6%, 0) rotate(-180deg); } }
  @keyframes holo-aurora-3 { 0%,100% { transform: translate3d(0%, 0%, 0) rotate(0deg); } 50% { transform: translate3d(6%, -10%, 0) rotate(120deg); } }
  @keyframes holo-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
  @keyframes holo-pulse-dot { 0%,100% { box-shadow: 0 0 0 0 rgba(255,60,80,.7), 0 0 12px 2px rgba(255,60,80,.6); } 50% { box-shadow: 0 0 0 9px rgba(255,60,80,0), 0 0 14px 3px rgba(255,60,80,.9); } }
  @keyframes holo-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  @keyframes holo-stagger-in { 0% { opacity: 0; transform: translateY(18px) rotateX(-6deg); } 100% { opacity: 1; transform: translateY(0) rotateX(0); } }
  @keyframes holo-grid-drift { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }
  @keyframes holo-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes holo-stream { 0% { transform: translateY(0); opacity: 0.0; } 10% { opacity: 1; } 100% { transform: translateY(-100%); opacity: 0; } }
  @keyframes holo-glow-breath { 0%,100% { filter: drop-shadow(0 0 8px rgba(120,220,255,.45)) drop-shadow(0 0 22px rgba(220,80,255,.25)); } 50% { filter: drop-shadow(0 0 14px rgba(120,220,255,.7)) drop-shadow(0 0 32px rgba(220,80,255,.45)); } }
  @keyframes holo-shift { 0% { background-position: 0% 0%; } 50% { background-position: 100% 100%; } 100% { background-position: 0% 0%; } }

  .holo-root {
    --holo-bg: #05060d;
    --holo-c1: #00e7ff;
    --holo-c2: #ff3df0;
    --holo-c3: #ffd24a;
    --holo-c4: #7a5cff;
    font-family: 'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif;
    background: radial-gradient(ellipse at 20% 0%, rgba(122,92,255,.18), transparent 55%),
                radial-gradient(ellipse at 90% 30%, rgba(0,231,255,.14), transparent 55%),
                radial-gradient(ellipse at 60% 100%, rgba(255,61,240,.18), transparent 60%),
                #05060d;
    color: #e8ecff;
    perspective: 1800px;
  }
  .holo-aurora { position: absolute; inset: -20%; pointer-events: none; mix-blend-mode: screen; opacity: .55; }
  .holo-aurora .blob { position: absolute; width: 60vw; height: 60vw; border-radius: 50%; filter: blur(80px); }
  .holo-aurora .b1 { top: -10%; left: -10%; background: radial-gradient(circle, rgba(0,231,255,.55), transparent 60%); animation: holo-aurora-1 28s ease-in-out infinite; }
  .holo-aurora .b2 { bottom: -20%; right: -15%; background: radial-gradient(circle, rgba(255,61,240,.45), transparent 60%); animation: holo-aurora-2 36s ease-in-out infinite; }
  .holo-aurora .b3 { top: 30%; left: 40%; background: radial-gradient(circle, rgba(255,210,74,.30), transparent 60%); animation: holo-aurora-3 42s ease-in-out infinite; }

  .holo-grid-bg {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(120,220,255,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120,220,255,.06) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%);
    animation: holo-grid-drift 18s linear infinite;
  }

  .holo-card {
    position: relative;
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
    border: 1px solid rgba(255,255,255,.08);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    transform-style: preserve-3d;
    transition: transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .5s;
    overflow: hidden;
    animation: holo-stagger-in .7s both;
  }
  .holo-card::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; padding: 1px;
    background: conic-gradient(from var(--ang,0deg), rgba(0,231,255,.35), rgba(255,61,240,.35), rgba(255,210,74,.35), rgba(0,231,255,.35));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: .55;
  }
  .holo-card::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.08) 50%, transparent 70%);
    background-size: 220% 100%; opacity: 0; transition: opacity .4s;
  }
  .holo-card:hover { box-shadow: 0 30px 60px -20px rgba(0,231,255,.25), 0 10px 30px -10px rgba(255,61,240,.25); }
  .holo-card:hover::after { opacity: 1; animation: holo-shimmer 2.4s linear infinite; }

  .tilt-l { transform: rotateY(3deg) rotateX(1.5deg); }
  .tilt-r { transform: rotateY(-3deg) rotateX(1.5deg); }
  .tilt-d { transform: rotateX(-2.5deg); }
  .tilt-u { transform: rotateX(2.5deg); }
  .tilt-x { transform: rotateY(2deg) rotateX(-1.5deg); }

  .holo-text-grad {
    background: linear-gradient(90deg, #fff 0%, #b6ecff 25%, #ffb1f5 50%, #ffd680 75%, #fff 100%);
    background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    animation: holo-shimmer 6s linear infinite;
  }

  .holo-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,.12);
    background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    font-size: 11px; letter-spacing: .04em;
    backdrop-filter: blur(6px);
  }

  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff3c50; animation: holo-pulse-dot 1.6s ease-in-out infinite; }

  .holo-trophy {
    background: conic-gradient(from 0deg at 50% 50%, #ffd24a, #ff8a3d, #ff3df0, #00e7ff, #ffd24a);
    -webkit-mask: linear-gradient(#000,#000); mask: linear-gradient(#000,#000);
    animation: holo-glow-breath 3s ease-in-out infinite;
  }

  .holo-marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
  .holo-marquee-track { display: inline-flex; gap: 40px; animation: holo-marquee 50s linear infinite; white-space: nowrap; }

  .holo-mono { font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

  .holo-conic {
    background: conic-gradient(from 0deg at 50% 50%,
      rgba(0,231,255,.55), rgba(255,61,240,.55), rgba(255,210,74,.55), rgba(122,92,255,.55), rgba(0,231,255,.55));
    filter: blur(.5px);
  }

  .holo-foil {
    background: linear-gradient(135deg, #00e7ff 0%, #ff3df0 35%, #ffd24a 65%, #00e7ff 100%);
    background-size: 200% 200%;
    animation: holo-shift 7s ease-in-out infinite;
  }

  .holo-ring {
    position: absolute; inset: -2px; border-radius: inherit; pointer-events: none;
    background: conic-gradient(from 0deg, #00e7ff, #ff3df0, #ffd24a, #00e7ff);
    filter: blur(8px); opacity: .55; z-index: -1;
  }

  .holo-stream-row { animation: holo-stagger-in .8s both; }

  .holo-divider {
    height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
  }

  .game-tile {
    position: relative; overflow: hidden;
    border-radius: 16px; padding: 14px;
    background: linear-gradient(160deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
    border: 1px solid rgba(255,255,255,.07);
    transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s;
    transform-style: preserve-3d;
  }
  .game-tile:hover { transform: translateY(-4px) rotateX(4deg); border-color: rgba(0,231,255,.4); }
  .game-tile .ico { width: 44px; height: 44px; border-radius: 12px; display:flex; align-items:center; justify-content:center; }

  .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#00e7ff,#ff3df0); border-radius: 999px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
`;

type HoloVariant = "cyan" | "magenta" | "gold" | "violet" | "mix";

function tileGradient(v: HoloVariant) {
  switch (v) {
    case "cyan": return "linear-gradient(135deg, rgba(0,231,255,.35), rgba(0,231,255,.05))";
    case "magenta": return "linear-gradient(135deg, rgba(255,61,240,.35), rgba(255,61,240,.05))";
    case "gold": return "linear-gradient(135deg, rgba(255,210,74,.35), rgba(255,210,74,.05))";
    case "violet": return "linear-gradient(135deg, rgba(122,92,255,.35), rgba(122,92,255,.05))";
    default: return "linear-gradient(135deg, rgba(0,231,255,.30), rgba(255,61,240,.30), rgba(255,210,74,.20))";
  }
}

const TICKER = [
  "ZAYED_99 رفع رصيده +2,400 USDT في تحدّي FIFA",
  "بطولة CS2 الكبرى — 32 لاعب — جائزة 12,500 USDT — تبدأ بعد 14 دقيقة",
  "AbuFlash تأهّل لنصف نهائي Valorant Cup الموسم الثالث",
  "M7md_Sniper كسر الرقم القياسي في PUBG: 28 إصابة في مباراة واحدة",
  "بطولة eFootball Ramadan الجمعة — التسجيل مفتوح الآن",
  "XGen_Reem فازت بـ 950 USDT في Tarneeb Royale",
  "Khalid_KSA انضمّ إلى تحدّي 1v1 مقابل OmarPro برصيد 1,200 USDT",
];

const TOURNAMENTS = [
  { name: "VEX FIFA Champions Cup", game: "FIFA 24", prize: "25,000", players: 124, cap: 128, time: "00:14:32", live: true, art: "/__mockup/images/vex-home-holographic-tournament-1.png", tilt: "tilt-l" },
  { name: "Desert Storm Valorant", game: "Valorant", prize: "18,500", players: 86, cap: 96, time: "01:42:10", live: true, art: "/__mockup/images/vex-home-holographic-tournament-2.png", tilt: "tilt-r" },
  { name: "Riyadh CS2 Major", game: "CS2", prize: "32,750", players: 48, cap: 64, time: "03:08:55", live: false, art: "/__mockup/images/vex-home-holographic-tournament-2.png", tilt: "tilt-d" },
  { name: "Khaleej PUBG Royale", game: "PUBG Mobile", prize: "9,200", players: 92, cap: 100, time: "00:46:20", live: true, art: "/__mockup/images/vex-home-holographic-tournament-1.png", tilt: "tilt-u" },
  { name: "FC Mobile Ramadan League", game: "FC Mobile", prize: "14,400", players: 60, cap: 80, time: "06:25:10", live: false, art: "/__mockup/images/vex-home-holographic-tournament-1.png", tilt: "tilt-x" },
  { name: "eFootball Pro Series", game: "eFootball", prize: "11,800", players: 71, cap: 96, time: "12:00:00", live: false, art: "/__mockup/images/vex-home-holographic-tournament-2.png", tilt: "tilt-l" },
];

const MULTI_GAMES = [
  { name: "Valorant", ar: "فالورانت", icon: Target, online: 4280, color: "#ff3df0" },
  { name: "CS2", ar: "كاونتر سترايك ٢", icon: Cpu, online: 3920, color: "#00e7ff" },
  { name: "PUBG Mobile", ar: "ببجي موبايل", icon: Skull, online: 6710, color: "#ffd24a" },
  { name: "FIFA 24", ar: "فيفا ٢٤", icon: Trophy, online: 2114, color: "#7a5cff" },
  { name: "FC Mobile", ar: "إف سي موبايل", icon: Joystick, online: 1860, color: "#00e7ff" },
  { name: "Tarneeb", ar: "ترنيب", icon: Crown, online: 980, color: "#ffd24a" },
  { name: "Baloot", ar: "بلوت", icon: Sword, online: 1240, color: "#ff3df0" },
  { name: "Domino", ar: "دومينو", icon: Hexagon, online: 740, color: "#7a5cff" },
];

const SOLO_GAMES = [
  { name: "Chess", ar: "شطرنج", icon: ShieldCheck, online: 1430, color: "#00e7ff" },
  { name: "Backgammon", ar: "طاولة الزهر", icon: Gem, online: 2100, color: "#ffd24a" },
  { name: "Speed Math", ar: "رياضيات سريعة", icon: Zap, online: 510, color: "#ff3df0" },
  { name: "Word Duel", ar: "كلمات", icon: Sparkles, online: 690, color: "#7a5cff" },
  { name: "Memory Pro", ar: "ذاكرة احترافية", icon: Ghost, online: 320, color: "#00e7ff" },
  { name: "Reflex Arena", ar: "حلبة الردود", icon: Flame, online: 880, color: "#ff3df0" },
  { name: "Sudoku Battle", ar: "سودوكو", icon: Mountain, online: 410, color: "#ffd24a" },
  { name: "Type Storm", ar: "عاصفة الكتابة", icon: Headphones, online: 260, color: "#7a5cff" },
];

const CHALLENGES = [
  { from: "M7md_Sniper", level: 47, game: "Valorant 1v1", stake: "1,200", direction: "in", avatar: "MS" },
  { from: "AbuFlash", level: 62, game: "FIFA 24", stake: "850", direction: "in", avatar: "AF" },
  { from: "ZAYED_99", level: 38, game: "PUBG Solo", stake: "600", direction: "out", avatar: "Z9" },
  { from: "OmarPro", level: 51, game: "CS2 Aim", stake: "2,000", direction: "in", avatar: "OP" },
  { from: "XGen_Reem", level: 44, game: "Tarneeb", stake: "400", direction: "out", avatar: "XR" },
  { from: "Khalid_KSA", level: 56, game: "FC Mobile", stake: "1,500", direction: "in", avatar: "KK" },
];

const ACTIVITY = [
  { t: "قبل 18 ثانية", txt: "ZAYED_99 ربح تحدي FIFA ضد AbuFlash", val: "+2,400 USDT", kind: "win" },
  { t: "قبل دقيقة", txt: "بدأت بطولة Desert Storm Valorant", val: "86/96 لاعب", kind: "tournament" },
  { t: "قبل 3 دقائق", txt: "M7md_Sniper كسر الرقم القياسي في PUBG", val: "28 إصابة", kind: "record" },
  { t: "قبل 5 دقائق", txt: "أنت — انتصار في تحدّي 1v1 ضد OmarPro", val: "+1,800 USDT", kind: "you" },
  { t: "قبل 7 دقائق", txt: "Khalid_KSA انضمّ إلى FC Mobile Ramadan League", val: "بطولة #14", kind: "join" },
  { t: "قبل 11 دقيقة", txt: "اشتعلت مفاجأة كبرى — Reem أطاحت بالمصنّف #3", val: "Upset", kind: "upset" },
  { t: "قبل 14 دقيقة", txt: "أنت — تأهّلت إلى ربع نهائي VEX Champions Cup", val: "Round of 8", kind: "you" },
  { t: "قبل 17 دقيقة", txt: "Khaleej PUBG Royale أُعلن عن الفائز", val: "9,200 USDT", kind: "tournament" },
  { t: "قبل 21 دقيقة", txt: "AbuFlash اشترى لقب \"بطل الموسم\"", val: "نادر", kind: "shop" },
  { t: "قبل 26 دقيقة", txt: "أنت — استلمت مكافأة المهمة اليومية", val: "+120 XP", kind: "you" },
  { t: "قبل 33 دقيقة", txt: "OmarPro أنشأ تحدّي مفتوح في CS2 Aim", val: "2,000 USDT", kind: "challenge" },
  { t: "قبل 41 دقيقة", txt: "بطولة eFootball Pro Series اكتمل التسجيل بنسبة 74%", val: "71/96", kind: "tournament" },
  { t: "قبل ساعة", txt: "XGen_Reem فازت بـ Tarneeb Royale", val: "+950 USDT", kind: "win" },
  { t: "قبل ساعتين", txt: "أنت — رفعت لقبك إلى مرتبة Diamond III", val: "Promo", kind: "you" },
];

const RECENT_MATCHES = [
  { vs: "OmarPro", game: "Valorant 1v1", result: "W", score: "13 - 9", profit: "+1,800" },
  { vs: "Khalid_KSA", game: "FC Mobile", result: "L", score: "1 - 3", profit: "-500" },
  { vs: "AbuFlash", game: "FIFA 24", result: "W", score: "4 - 2", profit: "+1,200" },
  { vs: "M7md_Sniper", game: "PUBG Solo", result: "W", score: "#3 / 100", profit: "+650" },
  { vs: "XGen_Reem", game: "Tarneeb", result: "L", score: "131 - 152", profit: "-300" },
  { vs: "ZAYED_99", game: "Chess Blitz", result: "W", score: "Mate 24", profit: "+420" },
];

const SECOND_WAVE_TOURNAMENTS = [
  { name: "Cairo Apex Legends Cup", game: "Apex", prize: "7,800", players: 38, cap: 60, time: "08:12:00", live: false },
  { name: "Jeddah Rocket League", game: "Rocket League", prize: "5,400", players: 22, cap: 32, time: "10:45:30", live: false },
  { name: "Doha Brawl Stars Open", game: "Brawl Stars", prize: "3,200", players: 71, cap: 96, time: "02:18:00", live: true },
  { name: "VEX Mobile Legends Showdown", game: "MLBB", prize: "12,000", players: 54, cap: 64, time: "05:00:00", live: false },
];

export function Holographic() {
  const [now, setNow] = useState(0);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  return (
    <div dir="rtl" className="holo-root min-h-screen w-full relative overflow-hidden" ref={scrollRef as never}>
      <style>{HOLO_STYLES}</style>

      {/* Aurora + grid */}
      <div className="holo-aurora">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="holo-grid-bg" />

      {/* Top Bar */}
      <header className="relative z-30 px-6 lg:px-10 pt-5 pb-3">
        <div className="holo-card !rounded-2xl px-4 py-3 flex items-center gap-4 tilt-d" style={{ ["--ang" as never]: "60deg" }}>
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl holo-foil grid place-items-center" style={{ boxShadow: "0 0 22px rgba(0,231,255,.35)" }}>
              <Hexagon className="w-5 h-5 text-black" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold tracking-[.18em] holo-text-grad">VEX</div>
              <div className="text-[10px] text-white/50 tracking-[.32em]">CHAMPIONSHIP GRID</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 mr-2">
            {["الرئيسية", "البطولات", "التحديات", "السوق", "التصنيف", "الأصدقاء"].map((label, i) => (
              <button key={label} className={`px-3 py-1.5 rounded-lg text-[12.5px] transition ${i === 0 ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}>
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 mx-2 flex-1 max-w-[280px]">
            <Search className="w-4 h-4 text-white/40" />
            <input className="bg-transparent outline-none text-[12.5px] flex-1 placeholder:text-white/40" placeholder="ابحث عن لاعب، بطولة، أو لعبة…" />
            <kbd className="text-[10px] text-white/40 holo-mono">⌘K</kbd>
          </div>

          <div className="ms-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5">
              <Wallet className="w-4 h-4 text-cyan-300" />
              <div className="leading-tight text-end">
                <div className="text-[10px] text-white/50">المحفظة</div>
                <div className="text-[13px] holo-mono font-semibold">8,420.55 <span className="text-white/40">USDT</span></div>
              </div>
              <div className="w-px h-7 bg-white/10 mx-1" />
              <Button size="sm" className="h-7 px-2 text-[11px] bg-gradient-to-l from-cyan-400 to-fuchsia-500 text-black hover:opacity-90">
                <Plus className="w-3 h-3 me-1" /> شحن
              </Button>
            </div>
            <button className="relative w-9 h-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center hover:bg-white/10">
              <Bell className="w-4 h-4 text-white/80" />
              <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(255,61,240,.9)]" />
            </button>
            <Avatar className="w-9 h-9 border border-white/15">
              <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-fuchsia-600 text-white text-xs">FX</AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Live ticker */}
        <div className="mt-3 holo-marquee text-[12px] text-white/70">
          <div className="holo-marquee-track">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                <span className="live-dot" />
                <span>{t}</span>
                <span className="text-white/20">◆</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Main Bento */}
      <main className="relative z-10 px-6 lg:px-10 pb-16 grid grid-cols-12 gap-5">
        {/* Activity sidebar — visually on LEFT in RTL */}
        <aside className="col-span-12 lg:col-span-3 lg:order-2 lg:sticky lg:top-4 self-start" style={{ height: "calc(100vh - 24px)" }}>
          <div className="holo-card h-full p-4 flex flex-col tilt-x" style={{ ["--ang" as never]: "210deg" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg holo-foil grid place-items-center">
                  <Activity className="w-4 h-4 text-black" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-wide">سجل المنصة</div>
                  <div className="text-[10px] text-white/50 tracking-widest">VEX • DATA STREAM</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="live-dot" />
                <span className="text-[10px] text-white/60 holo-mono">LIVE</span>
              </div>
            </div>

            <Tabs defaultValue="all" className="flex-1 flex flex-col">
              <TabsList className="bg-white/5 border border-white/10 h-8 p-0.5 grid grid-cols-3">
                <TabsTrigger value="all" className="text-[11px] data-[state=active]:bg-white/10">الكل</TabsTrigger>
                <TabsTrigger value="me" className="text-[11px] data-[state=active]:bg-white/10">أنا</TabsTrigger>
                <TabsTrigger value="big" className="text-[11px] data-[state=active]:bg-white/10">كبيرة</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="flex-1 mt-3 min-h-0">
                <ScrollArea className="h-[calc(100vh-200px)] pr-2">
                  <ol className="relative ms-2 border-s border-white/10 ps-4 space-y-3">
                    {ACTIVITY.map((a, i) => (
                      <li key={i} className="holo-stream-row" style={{ animationDelay: `${i * 50}ms` }}>
                        <span className="absolute -start-[5px] mt-1 w-2 h-2 rounded-full" style={{ background: a.kind === "you" ? "#00e7ff" : a.kind === "win" ? "#7CFFB5" : a.kind === "upset" ? "#ff3df0" : "#ffd24a", boxShadow: "0 0 8px currentColor" }} />
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[10px] text-white/40 holo-mono">{a.t}</span>
                          <span className={`text-[10.5px] holo-mono ${a.val.startsWith("+") ? "text-emerald-300" : a.val.startsWith("-") ? "text-rose-300" : "text-amber-200"}`}>{a.val}</span>
                        </div>
                        <p className="text-[12px] leading-snug text-white/85">{a.txt}</p>
                        {a.kind === "you" && <span className="holo-chip mt-1.5 text-cyan-200 border-cyan-400/30">أنت</span>}
                      </li>
                    ))}
                  </ol>
                  <div className="text-center text-[11px] text-white/40 mt-4 pb-2">يتم تحديث السجل تلقائيًا • منذ بدء المنصة</div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="me" className="flex-1 mt-3 min-h-0">
                <ScrollArea className="h-[calc(100vh-200px)] pr-2">
                  <ol className="relative ms-2 border-s border-white/10 ps-4 space-y-3">
                    {ACTIVITY.filter((a) => a.kind === "you").map((a, i) => (
                      <li key={i} className="holo-stream-row">
                        <span className="absolute -start-[5px] mt-1 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(0,231,255,.9)]" />
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[10px] text-white/40 holo-mono">{a.t}</span>
                          <span className="text-[10.5px] holo-mono text-amber-200">{a.val}</span>
                        </div>
                        <p className="text-[12px] leading-snug text-white/85">{a.txt}</p>
                      </li>
                    ))}
                  </ol>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="big" className="flex-1 mt-3 min-h-0">
                <ScrollArea className="h-[calc(100vh-200px)] pr-2">
                  <ol className="relative ms-2 border-s border-white/10 ps-4 space-y-3">
                    {ACTIVITY.filter((a) => a.val.includes("USDT") || a.kind === "upset" || a.kind === "record").map((a, i) => (
                      <li key={i} className="holo-stream-row">
                        <span className="absolute -start-[5px] mt-1 w-2 h-2 rounded-full bg-fuchsia-300 shadow-[0_0_8px_rgba(255,61,240,.9)]" />
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[10px] text-white/40 holo-mono">{a.t}</span>
                          <span className="text-[10.5px] holo-mono text-amber-200">{a.val}</span>
                        </div>
                        <p className="text-[12px] leading-snug text-white/85">{a.txt}</p>
                      </li>
                    ))}
                  </ol>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </aside>

        {/* Right side: Bento mosaic */}
        <section className="col-span-12 lg:col-span-9 lg:order-1 grid grid-cols-12 gap-5">
          {/* COMMAND CARD — owner */}
          <div ref={heroRef} className="col-span-12 relative" style={{ animationDelay: "0ms" }}>
            <CommandCard scrollY={scrollY} />
          </div>

          {/* Live tournaments — primary section */}
          <div className="col-span-12 lg:col-span-8 holo-card p-5 tilt-l" style={{ ["--ang" as never]: "30deg", animationDelay: "120ms" }}>
            <SectionHeader
              icon={<Trophy className="w-4 h-4" />}
              title="بطولات مباشرة"
              subtitle="LIVE TOURNAMENTS"
              right={
                <div className="flex items-center gap-2">
                  <span className="holo-chip text-cyan-200 border-cyan-400/30"><Radio className="w-3 h-3" /> 14 مباشرة الآن</span>
                  <button className="holo-chip text-white/70 hover:text-white"><Filter className="w-3 h-3" /> تصفية</button>
                </div>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {TOURNAMENTS.slice(0, 4).map((t, i) => (
                <TournamentTile key={t.name} t={t} delay={i * 80} />
              ))}
            </div>
          </div>

          {/* Wallet snapshot + Daily mission */}
          <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-5">
            <div className="holo-card p-5 tilt-r" style={{ ["--ang" as never]: "150deg", animationDelay: "180ms" }}>
              <SectionHeader
                icon={<Wallet className="w-4 h-4" />}
                title="محفظتي"
                subtitle="WALLET"
                right={<button className="holo-chip text-white/70">سجل</button>}
              />
              <div className="mt-4">
                <div className="text-[10px] text-white/50 tracking-widest">الرصيد المتاح</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold holo-mono holo-text-grad">8,420.55</span>
                  <span className="text-xs text-white/50">USDT</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] mt-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-emerald-300 holo-mono">+412.30</span>
                  <span className="text-white/40">آخر 24 ساعة</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Button size="sm" className="h-8 text-[11px] bg-cyan-400/20 border border-cyan-300/30 text-cyan-100 hover:bg-cyan-400/30">إيداع</Button>
                <Button size="sm" className="h-8 text-[11px] bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-100 hover:bg-fuchsia-500/30">سحب</Button>
                <Button size="sm" variant="ghost" className="h-8 text-[11px] border border-white/10">P2P</Button>
              </div>
              <div className="holo-divider my-4" />
              <div className="text-[10px] text-white/50 tracking-widest mb-2">المهمة اليومية</div>
              <div className="text-[12.5px] mb-2">اربح 3 تحدّيات قبل منتصف الليل</div>
              <div className="flex items-center gap-2">
                <Progress value={66} className="h-1.5 bg-white/10 [&>div]:bg-gradient-to-l [&>div]:from-cyan-400 [&>div]:to-amber-300" />
                <span className="holo-mono text-[11px] text-amber-200">2/3</span>
              </div>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="text-white/50">المكافأة</span>
                <span className="holo-mono text-amber-200">+250 XP • 50 USDT</span>
              </div>
            </div>
          </div>

          {/* Multiplayer games */}
          <div className="col-span-12 lg:col-span-7 holo-card p-5 tilt-d" style={{ ["--ang" as never]: "90deg", animationDelay: "240ms" }}>
            <SectionHeader
              icon={<Users className="w-4 h-4" />}
              title="ألعاب جماعية"
              subtitle="MULTIPLAYER ARENAS"
              right={<span className="holo-chip text-emerald-200 border-emerald-400/30"><span className="live-dot !w-1.5 !h-1.5" /> 21,944 متّصل</span>}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
              {MULTI_GAMES.map((g, i) => (
                <GameTile key={g.name} g={g} delay={i * 40} />
              ))}
            </div>
          </div>

          {/* Single-player games */}
          <div className="col-span-12 lg:col-span-5 holo-card p-5 tilt-u" style={{ ["--ang" as never]: "270deg", animationDelay: "280ms" }}>
            <SectionHeader
              icon={<Joystick className="w-4 h-4" />}
              title="ألعاب فردية"
              subtitle="SOLO ARCADES"
              right={<span className="holo-chip text-cyan-200 border-cyan-400/30"><span className="live-dot !w-1.5 !h-1.5 !bg-cyan-300" /> 6,500 متّصل</span>}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {SOLO_GAMES.slice(0, 6).map((g, i) => (
                <GameTile key={g.name} g={g} delay={i * 40} compact />
              ))}
            </div>
          </div>

          {/* Challenges */}
          <div className="col-span-12 lg:col-span-7 holo-card p-5 tilt-x" style={{ ["--ang" as never]: "330deg", animationDelay: "320ms" }}>
            <SectionHeader
              icon={<Swords className="w-4 h-4" />}
              title="تحدّيات نشطة"
              subtitle="HEAD-TO-HEAD"
              right={
                <Button size="sm" className="h-7 px-3 text-[11px] bg-gradient-to-l from-fuchsia-500 to-cyan-400 text-black">
                  <Plus className="w-3 h-3 me-1" /> أنشئ تحدّي
                </Button>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {CHALLENGES.slice(0, 4).map((c, i) => (
                <ChallengeTile key={c.from + i} c={c} delay={i * 60} />
              ))}
            </div>
          </div>

          {/* Recent matches */}
          <div className="col-span-12 lg:col-span-5 holo-card p-5 tilt-r" style={{ ["--ang" as never]: "120deg", animationDelay: "360ms" }}>
            <SectionHeader
              icon={<History className="w-4 h-4" />}
              title="آخر مبارياتي"
              subtitle="MY RECENT MATCHES"
              right={<button className="holo-chip text-white/70">عرض الكل</button>}
            />
            <ul className="mt-4 divide-y divide-white/5">
              {RECENT_MATCHES.map((m, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <div className={`w-8 h-8 rounded-lg grid place-items-center text-[11px] holo-mono font-bold ${m.result === "W" ? "bg-emerald-400/20 text-emerald-200 border border-emerald-300/30" : "bg-rose-400/20 text-rose-200 border border-rose-300/30"}`}>{m.result}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate">ضد <span className="text-white">{m.vs}</span></div>
                    <div className="text-[10.5px] text-white/50 holo-mono">{m.game} • {m.score}</div>
                  </div>
                  <span className={`holo-mono text-[12px] ${m.profit.startsWith("+") ? "text-emerald-300" : "text-rose-300"}`}>{m.profit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Second wave row — more tournaments + leaderboard */}
          <div className="col-span-12 lg:col-span-8 holo-card p-5 tilt-l" style={{ ["--ang" as never]: "210deg", animationDelay: "420ms" }}>
            <SectionHeader
              icon={<Crown className="w-4 h-4" />}
              title="بطولات قادمة بالقرب منك"
              subtitle="UPCOMING NEAR YOU"
              right={<span className="holo-chip text-amber-200 border-amber-400/30"><Globe className="w-3 h-3" /> الخليج وشمال أفريقيا</span>}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {SECOND_WAVE_TOURNAMENTS.map((t, i) => (
                <TournamentTile key={t.name} t={{ ...t, art: i % 2 ? "/__mockup/images/vex-home-holographic-tournament-1.png" : "/__mockup/images/vex-home-holographic-tournament-2.png", tilt: i % 2 ? "tilt-d" : "tilt-u" }} delay={i * 80} compact />
              ))}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 holo-card p-5 tilt-u" style={{ ["--ang" as never]: "0deg", animationDelay: "480ms" }}>
            <SectionHeader
              icon={<Star className="w-4 h-4" />}
              title="الأفضل هذا الأسبوع"
              subtitle="WEEKLY TOP PLAYERS"
              right={<span className="holo-chip text-white/60">Season 3</span>}
            />
            <ol className="mt-4 space-y-2">
              {[
                { rank: 1, name: "AbuFlash", points: "12,840", change: "+3" },
                { rank: 2, name: "ZAYED_99", points: "11,520", change: "+1" },
                { rank: 3, name: "OmarPro", points: "10,975", change: "-1" },
                { rank: 4, name: "M7md_Sniper", points: "10,210", change: "+2" },
                { rank: 5, name: "Khalid_KSA", points: "9,870", change: "0" },
                { rank: 6, name: "XGen_Reem", points: "9,640", change: "+5" },
              ].map((p) => (
                <li key={p.rank} className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition border border-white/5">
                  <div className={`w-7 h-7 rounded-md grid place-items-center holo-mono text-[12px] font-bold ${p.rank === 1 ? "holo-foil text-black" : p.rank === 2 ? "bg-white/15" : p.rank === 3 ? "bg-amber-300/20 text-amber-200" : "bg-white/5"}`}>{p.rank}</div>
                  <Avatar className="w-7 h-7"><AvatarFallback className="bg-gradient-to-br from-cyan-500 to-fuchsia-600 text-[10px]">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate">{p.name}</div>
                    <div className="text-[10px] text-white/50 holo-mono">{p.points} نقطة</div>
                  </div>
                  <span className={`text-[10.5px] holo-mono ${p.change.startsWith("+") ? "text-emerald-300" : p.change.startsWith("-") ? "text-rose-300" : "text-white/40"}`}>{p.change}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Marketplace strip */}
          <div className="col-span-12 holo-card p-5 tilt-d" style={{ ["--ang" as never]: "60deg", animationDelay: "540ms" }}>
            <SectionHeader
              icon={<ShoppingBag className="w-4 h-4" />}
              title="سوق VEX"
              subtitle="HOLO MARKET"
              right={<span className="holo-chip text-fuchsia-200 border-fuchsia-400/30"><Sparkles className="w-3 h-3" /> عناصر نادرة جديدة</span>}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
              {[
                { n: "هالة بطل الموسم", p: "1,250", r: "أسطورية" },
                { n: "إطار صورة هولوغرافي", p: "320", r: "نادرة" },
                { n: "تأثير دخول CS2 ذهبي", p: "880", r: "ملحمية" },
                { n: "لقب Champion III", p: "560", r: "نادرة" },
                { n: "بطاقة طاقة XP x2", p: "120", r: "شائعة" },
              ].map((it, i) => (
                <div key={i} className="game-tile">
                  <div className="absolute inset-0 opacity-40 holo-conic" style={{ filter: "blur(34px)" }} />
                  <div className="relative">
                    <div className="w-full h-20 rounded-lg holo-foil mb-2 grid place-items-center">
                      <Gem className="w-6 h-6 text-black/70" />
                    </div>
                    <div className="text-[12.5px] truncate">{it.n}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="holo-mono text-[11px] text-amber-200">{it.p} USDT</span>
                      <span className="text-[10px] text-white/50">{it.r}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Infinite-feel: more challenges + history teaser */}
          <div className="col-span-12 holo-card p-5 tilt-x" style={{ ["--ang" as never]: "180deg", animationDelay: "600ms" }}>
            <SectionHeader
              icon={<Flame className="w-4 h-4" />}
              title="مشهور الآن"
              subtitle="TRENDING ON VEX"
              right={<span className="holo-chip text-white/60 holo-mono">SCROLL ↓</span>}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {CHALLENGES.slice(2, 5).map((c, i) => (
                <ChallengeTile key={c.from + i} c={c} delay={i * 60} compact />
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {SOLO_GAMES.slice(2, 6).map((g, i) => <GameTile key={g.name + i} g={g} delay={i * 40} compact />)}
            </div>

            <div className="mt-4 flex items-center justify-center text-[11px] text-white/50 holo-mono">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
                جاري تحميل المزيد من المحتوى…
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 animate-pulse" />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Holographic;

/* ----- Sub-components ----- */

function SectionHeader({ icon, title, subtitle, right }: { icon: React.ReactNode; title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-cyan-200">{icon}</div>
        <div className="leading-tight">
          <div className="text-[14.5px] font-semibold tracking-wide">{title}</div>
          <div className="text-[10px] text-white/45 tracking-[.28em] holo-mono">{subtitle}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

function CommandCard({ scrollY }: { scrollY: number }) {
  const tilt = Math.max(-3, Math.min(3, scrollY / 80));
  return (
    <div className="relative" style={{ transform: `perspective(1600px) rotateX(${(-2 + tilt).toFixed(2)}deg)` }}>
      <div className="holo-card p-0 overflow-hidden" style={{ ["--ang" as never]: "0deg" }}>
        <div className="holo-ring" />
        {/* Bg image */}
        <div className="relative h-[260px] md:h-[300px]">
          <img src="/__mockup/images/vex-home-holographic-stadium.png" alt="VEX Stadium" className="absolute inset-0 w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05060d] via-[#05060d]/50 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(0,231,255,0.18),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(255,61,240,0.18),transparent_60%)]" />

          {/* Floating orbital chips */}
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <span className="holo-chip text-cyan-200 border-cyan-400/30"><Crown className="w-3 h-3" /> Diamond III</span>
            <span className="holo-chip text-amber-200 border-amber-400/30"><Trophy className="w-3 h-3" /> #87 عالميًا</span>
          </div>
          <div className="absolute top-4 left-4 z-10">
            <span className="holo-chip text-fuchsia-200 border-fuchsia-400/30"><Flame className="w-3 h-3" /> 7 انتصارات متتالية</span>
          </div>
        </div>

        {/* Hero content over the image */}
        <div className="relative -mt-32 md:-mt-36 px-6 md:px-8 pb-6 grid grid-cols-12 gap-5 z-10">
          {/* Left: avatar + identity */}
          <div className="col-span-12 md:col-span-4 flex items-end gap-4">
            <div className="relative">
              {/* Chromatic aberration ring */}
              <div className="absolute -inset-2 rounded-full holo-conic blur-[14px] opacity-80" />
              <div className="absolute -inset-2 rounded-full holo-conic blur-[2px] opacity-30 animate-[holo-orbit_18s_linear_infinite]" />
              <Avatar className="relative w-28 h-28 border-2 border-white/30 shadow-[0_0_40px_rgba(0,231,255,0.45)]">
                <AvatarFallback className="bg-gradient-to-br from-cyan-500 via-fuchsia-500 to-amber-400 text-2xl font-bold">FX</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-rose-500 grid place-items-center border-2 border-[#05060d]">
                <Crown className="w-3.5 h-3.5 text-black" />
              </div>
            </div>
            <div className="leading-tight pb-2">
              <div className="text-[10px] text-white/50 tracking-widest">أهلاً بعودتك</div>
              <h1 className="text-3xl font-bold holo-text-grad">FaresX_KSA</h1>
              <div className="flex items-center gap-2 mt-1 text-[12px]">
                <span className="text-white/70">المستوى</span>
                <span className="holo-mono text-amber-200">58</span>
                <span className="text-white/30">•</span>
                <span className="text-white/70">الرياض</span>
                <span className="text-white/30">•</span>
                <span className="text-emerald-300">متّصل</span>
              </div>
            </div>
          </div>

          {/* Middle: stats */}
          <div className="col-span-12 md:col-span-5 grid grid-cols-3 gap-3">
            <StatTile label="رصيد المحفظة" value="8,420.55" unit="USDT" accent="cyan" icon={<Wallet className="w-3.5 h-3.5" />} />
            <StatTile label="اليوم — فوز/خسارة" value="9 / 3" unit="75%" accent="emerald" icon={<TrendingUp className="w-3.5 h-3.5" />} />
            <StatTile label="نقاط XP" value="14,820" unit="+412" accent="amber" icon={<Zap className="w-3.5 h-3.5" />} />
          </div>

          {/* Right: progress + CTAs */}
          <div className="col-span-12 md:col-span-3 flex flex-col gap-3 justify-end">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-white/60">تقدّم الأسبوع</span>
                <span className="holo-mono text-amber-200">14,820 / 18,000 XP</span>
              </div>
              <Progress value={82} className="h-2 bg-white/10 [&>div]:bg-gradient-to-l [&>div]:from-cyan-300 [&>div]:via-fuchsia-400 [&>div]:to-amber-300" />
              <div className="text-[10px] text-white/50 mt-1.5">3,180 XP حتى مرتبة Diamond II</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-10 bg-gradient-to-l from-fuchsia-500 to-cyan-400 text-black font-semibold hover:opacity-90 shadow-[0_0_24px_rgba(255,61,240,0.35)]">
                <Swords className="w-4 h-4 me-1.5" /> تحدى صديق
              </Button>
              <Button variant="ghost" className="h-10 border border-white/15 bg-white/5 hover:bg-white/10">
                <Sparkles className="w-4 h-4 me-1.5" /> مطابقة سريعة
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, unit, accent, icon }: { label: string; value: string; unit: string; accent: "cyan" | "emerald" | "amber"; icon: React.ReactNode }) {
  const accentMap: Record<string, string> = {
    cyan: "from-cyan-400/40 to-cyan-300/0 text-cyan-200 border-cyan-300/20",
    emerald: "from-emerald-400/40 to-emerald-300/0 text-emerald-200 border-emerald-300/20",
    amber: "from-amber-400/40 to-amber-300/0 text-amber-200 border-amber-300/20",
  };
  return (
    <div className={`relative rounded-xl border bg-gradient-to-br ${accentMap[accent]} p-3 backdrop-blur-md overflow-hidden`}>
      <div className="absolute inset-0 opacity-20 holo-conic blur-[18px]" />
      <div className="relative">
        <div className="flex items-center justify-between text-[10px] text-white/60">
          <span>{label}</span>
          <span className="opacity-70">{icon}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold holo-mono">{value}</span>
          <span className="text-[11px] opacity-80">{unit}</span>
        </div>
      </div>
    </div>
  );
}

function TournamentTile({ t, delay = 0, compact = false }: { t: { name: string; game: string; prize: string; players: number; cap: number; time: string; live: boolean; art?: string; tilt?: string }; delay?: number; compact?: boolean }) {
  return (
    <div className="relative rounded-xl border border-white/10 overflow-hidden group" style={{ animation: `holo-stagger-in .7s both`, animationDelay: `${delay}ms` }}>
      <div className="absolute inset-0 opacity-50 group-hover:opacity-80 transition-opacity" style={{ background: tileGradient("mix") }} />
      {t.art && <img src={t.art} alt={t.name} className="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:opacity-35 transition-opacity" />}
      <div className="relative p-3 backdrop-blur-[2px]">
        <div className="flex items-center justify-between mb-2">
          <span className="holo-chip text-white/85 border-white/20 holo-mono text-[10px]">{t.game}</span>
          {t.live ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] holo-mono text-rose-200 px-2 py-0.5 rounded-full border border-rose-300/40 bg-rose-500/10">
              <span className="live-dot" /> LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] holo-mono text-cyan-200 px-2 py-0.5 rounded-full border border-cyan-300/30 bg-cyan-500/10">
              <Clock className="w-3 h-3" /> قريبًا
            </span>
          )}
        </div>
        <div className={`font-semibold tracking-wide ${compact ? "text-[13px]" : "text-[14.5px]"} text-white/95`}>{t.name}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-white/45 text-[9.5px] tracking-widest">جائزة</div>
            <div className="holo-mono text-amber-200">{t.prize} <span className="text-white/50">USDT</span></div>
          </div>
          <div>
            <div className="text-white/45 text-[9.5px] tracking-widest">اللاعبون</div>
            <div className="holo-mono">{t.players}/{t.cap}</div>
          </div>
          <div>
            <div className="text-white/45 text-[9.5px] tracking-widest">يبدأ خلال</div>
            <div className="holo-mono text-cyan-200">{t.time}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={(t.players / t.cap) * 100} className="h-1 bg-white/10 [&>div]:bg-gradient-to-l [&>div]:from-cyan-400 [&>div]:to-fuchsia-500" />
          <Button size="sm" className="h-7 px-3 text-[11px] bg-white/10 hover:bg-white/20 border border-white/15">
            انضم <ChevronLeft className="w-3 h-3 ms-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GameTile({ g, delay = 0, compact = false }: { g: { name: string; ar: string; icon: typeof Trophy; online: number; color: string }; delay?: number; compact?: boolean }) {
  const Icon = g.icon;
  return (
    <div className="game-tile" style={{ animation: `holo-stagger-in .6s both`, animationDelay: `${delay}ms` }}>
      <div className="absolute inset-0 opacity-30 holo-conic blur-[24px]" />
      <div className="relative">
        <div className="ico" style={{ background: `linear-gradient(135deg, ${g.color}33, ${g.color}11)`, border: `1px solid ${g.color}55`, boxShadow: `0 0 18px ${g.color}33` }}>
          <Icon className="w-5 h-5" style={{ color: g.color }} />
        </div>
        <div className={`mt-2.5 ${compact ? "text-[12.5px]" : "text-[13px]"} font-semibold`}>{g.ar}</div>
        <div className="text-[10px] text-white/45 holo-mono uppercase tracking-widest">{g.name}</div>
        <div className="flex items-center justify-between mt-2">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(110,255,160,0.7)]" />
            <span className="holo-mono">{g.online.toLocaleString("en")}</span>
          </span>
          <button className="text-[10.5px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 hover:border-white/30 hover:bg-white/5">
            ابدأ <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeTile({ c, delay = 0, compact = false }: { c: { from: string; level: number; game: string; stake: string; direction: string; avatar: string }; delay?: number; compact?: boolean }) {
  const incoming = c.direction === "in";
  return (
    <div className="relative rounded-xl border border-white/10 overflow-hidden p-3 bg-white/[0.02]" style={{ animation: `holo-stagger-in .6s both`, animationDelay: `${delay}ms` }}>
      <div className={`absolute -inset-px rounded-xl blur-[18px] opacity-25 ${incoming ? "bg-gradient-to-l from-fuchsia-500/30 to-cyan-400/30" : "bg-gradient-to-l from-amber-400/30 to-rose-400/30"}`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] holo-mono px-2 py-0.5 rounded-full border ${incoming ? "text-fuchsia-200 border-fuchsia-400/30 bg-fuchsia-500/10" : "text-amber-200 border-amber-400/30 bg-amber-500/10"}`}>
            {incoming ? "تحدّاني" : "أرسلتُه"}
          </span>
          <span className="text-[10px] text-white/40 holo-mono">{c.game}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full holo-conic blur-[10px] opacity-70" />
            <Avatar className="relative w-10 h-10 border border-white/20">
              <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-fuchsia-600 text-[11px]">{c.avatar}</AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0">
            <div className={`${compact ? "text-[12.5px]" : "text-[13.5px]"} font-semibold truncate`}>{c.from}</div>
            <div className="text-[10.5px] text-white/50 holo-mono">المستوى {c.level}</div>
          </div>
          <div className="text-end">
            <div className="text-[9.5px] text-white/45 tracking-widest">رهان</div>
            <div className="holo-mono text-amber-200">{c.stake} <span className="text-white/50">USDT</span></div>
          </div>
        </div>
        <div className="mt-2.5 flex gap-2">
          {incoming ? (
            <>
              <Button size="sm" className="h-7 flex-1 text-[11px] bg-emerald-400/20 border border-emerald-300/30 text-emerald-100 hover:bg-emerald-400/30">
                <Check className="w-3.5 h-3.5 me-1" /> قبول
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-3 text-[11px] border border-white/10 text-white/70 hover:bg-white/10">
                <X className="w-3.5 h-3.5 me-1" /> رفض
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" className="h-7 flex-1 text-[11px] bg-cyan-400/20 border border-cyan-300/30 text-cyan-100 hover:bg-cyan-400/30">
                بانتظار الرد
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-3 text-[11px] border border-white/10 text-white/70 hover:bg-white/10">
                إلغاء
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
