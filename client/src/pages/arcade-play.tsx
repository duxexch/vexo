import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, RotateCcw, Trophy, Star, Sparkles, Users, Globe, Monitor, User } from "lucide-react";
import { getArcadeGame, gameKeyToSlug, isArcadeGameKey } from "@shared/arcade-games";
import ArcadeInlineLoader from "@/components/games/ArcadeInlineLoader";

interface ArcadeBanter {
  key: string;
  text: string;
  mood: string;
}

interface ArcadeEconomy {
  rewardVex: number;
  netVex: number;
  multiplier: number;
  rarity: "miss" | "refund" | "small" | "medium" | "big" | "jackpot";
  psychologyMode: string;
  reason: string;
  entryCostVex: number;
  freePlay: boolean;
  balanceBefore: number;
  balanceAfter: number;
}

interface ArcadeSubmitResponse {
  ok: boolean;
  session?: { id: string; score: number; result: string; isPersonalBest: boolean };
  personalBest?: number;
  previousBest?: number;
  totalRuns?: number;
  banter?: ArcadeBanter;
  economy?: ArcadeEconomy;
}

type Phase = "mode" | "boot" | "playing" | "ended" | "error";

const RARITY_BADGE_BG = {
  jackpot: "#ffb627",
  big: "#1e88ff",
  default: "rgba(255,255,255,0.15)",
} as const;

const RARITY_BADGE_FG = {
  jackpot: "#0a0e1a",
  default: "#fff",
} as const;

const NET_VEX_FG = {
  positive: "#ffb627",
  negative: "#fb7185",
  zero: "#fff",
} as const;

const BOOT_FALLBACK_MS = 2500;

export default function ArcadePlayPage() {
  const { gameKey: rawKey } = useParams<{ gameKey: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const sessionStartRef = useRef<number>(Date.now());
  const submittedRef = useRef<boolean>(false);
  const bootTimerRef = useRef<number | null>(null);
  const [replayKey, setReplayKey] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>("mode");
  const [playMode, setPlayMode] = useState<"online" | "local">("online");
  const [resultUi, setResultUi] = useState<{
    score: number;
    result: string;
    isPersonalBest: boolean;
    previousBest: number;
    personalBest: number;
    banter?: ArcadeBanter;
    economy?: ArcadeEconomy;
  } | null>(null);

  const game = useMemo(() => (rawKey ? getArcadeGame(rawKey) : null), [rawKey]);
  const lang: "ar" | "en" = language === "en" ? "en" : "ar";

  useEffect(() => {
    if (!rawKey || !isArcadeGameKey(rawKey)) {
      setPhase("error");
    }
  }, [rawKey]);

  const clearBootTimer = useCallback(() => {
    if (bootTimerRef.current) {
      window.clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
  }, []);

  const submitResult = useCallback(
    async (payload: {
      score: number;
      result: "win" | "loss" | "draw";
      metadata?: Record<string, unknown>;
    }): Promise<{ ok: boolean; data?: ArcadeSubmitResponse; error?: string }> => {
      if (submittedRef.current || !game) {
        return { ok: false, error: "already_submitted_or_no_game" };
      }
      submittedRef.current = true;
      const durationMs = Math.max(0, Date.now() - sessionStartRef.current);
      try {
        const res = await apiRequest("POST", "/api/arcade/sessions", {
          gameKey: game.key,
          score: payload.score,
          result: payload.result,
          durationMs,
          metadata: payload.metadata ?? {},
        });
        const data = (await res.json()) as ArcadeSubmitResponse;
        if (data?.ok && data.session) {
          setResultUi({
            score: data.session.score,
            result: data.session.result,
            isPersonalBest: data.session.isPersonalBest,
            previousBest: data.previousBest ?? 0,
            personalBest: data.personalBest ?? data.session.score,
            banter: data.banter,
            economy: data.economy,
          });
          setPhase("ended");
          return { ok: true, data };
        }
        setPhase("ended");
        return { ok: false, error: "server_rejected", data };
      } catch (err) {
        toast({ title: lang === "ar" ? "تعذّر حفظ النتيجة" : "Failed to save score", variant: "destructive" });
        setResultUi({
          score: payload.score,
          result: payload.result,
          isPersonalBest: false,
          previousBest: 0,
          personalBest: payload.score,
        });
        setPhase("ended");
        return { ok: false, error: err instanceof Error ? err.message : "submit_failed" };
      }
    },
    [game, lang, toast],
  );

  const beginGame = useCallback((mode: "online" | "local") => {
    setPlayMode(mode);
    submittedRef.current = false;
    setResultUi(null);
    setPhase("boot");
    sessionStartRef.current = Date.now();
    clearBootTimer();
    bootTimerRef.current = window.setTimeout(() => {
      setPhase((current) => (current === "boot" ? "playing" : current));
    }, BOOT_FALLBACK_MS);
  }, [clearBootTimer]);

  const handleBoot = useCallback(() => {
    clearBootTimer();
    if (phase === "boot") {
      setPhase("playing");
      sessionStartRef.current = Date.now();
    }
  }, [clearBootTimer, phase]);

  const handleEndSession = useCallback(
    (payload: { score: number; result: "win" | "loss" | "draw"; metadata?: Record<string, unknown> }) => {
      void submitResult(payload);
    },
    [submitResult],
  );

  const handleInlineError = useCallback(
    (error: string) => {
      console.error("[ArcadeInline]", error);
      setPhase("error");
    },
    [],
  );

  const handleReplay = () => {
    submittedRef.current = false;
    setResultUi(null);
    setPhase("mode");
    clearBootTimer();
    sessionStartRef.current = Date.now();
    setReplayKey((k: number) => k + 1);
  };

  useEffect(() => {
    return () => clearBootTimer();
  }, [clearBootTimer]);

  if (!game) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{lang === "ar" ? "اللعبة غير معروفة" : "Game not found"}</h1>
        <p className="text-muted-foreground">
          {lang === "ar" ? "هذه اللعبة غير مسجلة في النظام." : "This game is not registered in the system."}
        </p>
        <Button onClick={() => navigate("/games")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {lang === "ar" ? "العودة للألعاب" : "Back to games"}
        </Button>
      </div>
    );
  }

  const slug = gameKeyToSlug(game.key);
  const title = lang === "ar" ? game.titleAr : game.titleEn;

  if (phase === "mode") {
    return (
      <div className="min-h-[100svh] bg-gradient-to-b from-[#070b14] via-[#0a0f1a] to-[#040713] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="h-12 w-12 rounded-2xl grid place-items-center text-2xl shrink-0"
              style={{ background: `linear-gradient(135deg, ${game.color}, ${game.color}aa)`, boxShadow: `0 0 18px -3px ${game.color}` }}
            >
              {game.iconEmoji}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{title}</h1>
              <p className="text-sm text-slate-300">{lang === "ar" ? "اختر طريقة اللعب قبل البدء" : "Choose how you want to play"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="h-4 w-4 text-cyan-300" />
                <span className="font-semibold">{lang === "ar" ? "أونلاين" : "Online"}</span>
                <Badge variant="secondary" className="ms-auto">{lang === "ar" ? "مستحسن" : "Recommended"}</Badge>
              </div>
              <p className="text-sm text-slate-300 mb-3">
                {lang === "ar"
                  ? "اللاعبون يتصلون من أجهزة مختلفة والجلسة تُسجل على السيرفر."
                  : "Players can join from different devices and the session is saved on the server."}
              </p>
              <Button className="w-full min-h-[44px]" onClick={() => beginGame("online")}>
                <Globe className="h-4 w-4 me-2" />
                {lang === "ar" ? "ابدأ أونلاين" : "Start online"}
              </Button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-fuchsia-300" />
                <span className="font-semibold">{lang === "ar" ? "محلي" : "Local"}</span>
              </div>
              <p className="text-sm text-slate-300 mb-3">
                {lang === "ar"
                  ? "وضع تجريبي لنفس الجهاز، مفيد للاختبار فقط."
                  : "Single-device test mode, useful only for local testing."}
              </p>
              <Button variant="outline" className="w-full min-h-[44px]" onClick={() => beginGame("local")}>
                <Users className="h-4 w-4 me-2" />
                {lang === "ar" ? "ابدأ محلي" : "Start local"}
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            {lang === "ar"
              ? "تنبيه: الألعاب التي تدعم أكثر من لاعب ستعمل أونلاين افتراضيًا، وليس على نفس الجهاز."
              : "Note: multiplayer-capable games default to online play, not same-device play."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-[#070b14] via-[#0a0f1a] to-[#040713] text-white flex flex-col">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/games")}
            className="text-white hover:bg-white/10"
            data-testid="button-back-to-games"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl grid place-items-center text-lg sm:text-xl shrink-0"
            style={{ background: `linear-gradient(135deg, ${game.color}, ${game.color}aa)`, boxShadow: `0 0 18px -3px ${game.color}` }}
          >
            {game.iconEmoji}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base truncate">{title}</div>
            <div className="text-[11px] sm:text-xs text-slate-400 truncate">
              {(game.kind === "solo"
                ? lang === "ar" ? "لاعب واحد" : "Single player"
                : game.kind === "duo"
                  ? lang === "ar" ? "1-2 لاعبين" : "1-2 players"
                  : lang === "ar" ? "2-8 لاعبين" : "2-8 players") +
                (playMode === "online"
                  ? (lang === "ar" ? " · أونلاين" : " · Online")
                  : (lang === "ar" ? " · محلي" : " · Local"))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleReplay} className="text-white hover:bg-white/10">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative flex-1 flex items-stretch justify-center bg-black overflow-hidden">
        {phase === "boot" && (
          <div className="absolute inset-0 grid place-items-center z-10 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </div>
        )}
        {phase !== "error" && (
          <div key={replayKey} className="contents">
            <ArcadeInlineLoader
              gameSlug={slug}
              lang={lang}
              onBoot={handleBoot}
              onEndSession={handleEndSession}
              onError={handleInlineError}
            />
          </div>
        )}
        {phase === "boot" && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-300 bg-black/50 border border-white/10 rounded-full px-3 py-1">
            {playMode === "online"
              ? (lang === "ar" ? "جارٍ إعداد جلسة أونلاين..." : "Preparing online session...")
              : (lang === "ar" ? "جارٍ إعداد جلسة محلية..." : "Preparing local session...")}
          </div>
        )}
      </div>

      {phase === "ended" && resultUi && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-gradient-to-b from-[#10172a] to-[#070b14] border border-white/10 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.8)]">
            <div
              className="mx-auto mb-3 h-14 w-14 grid place-items-center rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${game.color}, ${game.color}aa)`, boxShadow: `0 0 24px -4px ${game.color}` }}
            >
              {resultUi.isPersonalBest ? <Star className="h-7 w-7 text-white" /> : <Trophy className="h-7 w-7 text-white" />}
            </div>
            <h2 className="text-xl font-bold mb-1">
              {resultUi.isPersonalBest
                ? lang === "ar" ? "رقم شخصي جديد!" : "New personal best!"
                : resultUi.result === "win"
                  ? lang === "ar" ? "أحسنت!" : "Well played!"
                  : resultUi.result === "loss"
                    ? lang === "ar" ? "حظ أوفر" : "Better luck"
                    : lang === "ar" ? "جولة منتهية" : "Round complete"}
            </h2>
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="rounded-xl p-3 bg-black/30 border border-white/10">
                <div className="text-[11px] text-slate-400">{lang === "ar" ? "نتيجتك" : "Score"}</div>
                <div className="text-2xl font-bold" style={{ color: game.color }}>
                  {resultUi.score}
                </div>
              </div>
              <div className="rounded-xl p-3 bg-black/30 border border-white/10">
                <div className="text-[11px] text-slate-400">{lang === "ar" ? "أفضل رقم" : "Best"}</div>
                <div className="text-2xl font-bold text-white">{resultUi.personalBest}</div>
              </div>
            </div>

            {resultUi.economy && !resultUi.economy.freePlay && (
              <div
                className={`rounded-xl p-4 my-3 border ${resultUi.economy.netVex > 0
                  ? "bg-gradient-to-br from-brand-gold/15 to-brand-gold/5 border-brand-gold/40"
                  : resultUi.economy.netVex === 0
                    ? "bg-white/5 border-white/15"
                    : "bg-rose-500/10 border-rose-500/30"
                  }`}
                data-testid="card-arcade-economy"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-slate-300">
                      {lang === "ar" ? "المكافأة" : "Reward"}
                    </span>
                    {resultUi.economy.rarity !== "miss" && resultUi.economy.rarity !== "refund" && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold"
                        style={{
                          background:
                            resultUi.economy.rarity === "jackpot"
                              ? RARITY_BADGE_BG.jackpot
                              : resultUi.economy.rarity === "big"
                                ? RARITY_BADGE_BG.big
                                : RARITY_BADGE_BG.default,
                          color: resultUi.economy.rarity === "jackpot" ? RARITY_BADGE_FG.jackpot : RARITY_BADGE_FG.default,
                        }}
                      >
                        {resultUi.economy.rarity === "jackpot"
                          ? lang === "ar"
                            ? "جاكبوت"
                            : "JACKPOT"
                          : resultUi.economy.rarity === "big"
                            ? lang === "ar"
                              ? "ربح كبير"
                              : "BIG WIN"
                            : resultUi.economy.rarity === "medium"
                              ? lang === "ar"
                                ? "ربح متوسط"
                                : "MEDIUM"
                              : lang === "ar"
                                ? "ربح صغير"
                                : "SMALL"}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{
                      color:
                        resultUi.economy.netVex > 0
                          ? NET_VEX_FG.positive
                          : resultUi.economy.netVex < 0
                            ? NET_VEX_FG.negative
                            : NET_VEX_FG.zero,
                    }}
                  >
                    {resultUi.economy.netVex > 0 ? "+" : ""}
                    {resultUi.economy.netVex.toFixed(2)} VEX
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    {lang === "ar" ? "الرسوم" : "Entry"}: {resultUi.economy.entryCostVex} VEX
                  </span>
                  <span>
                    {lang === "ar" ? "صافي الجائزة" : "Payout"}: {resultUi.economy.rewardVex.toFixed(2)} VEX
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">
                    {lang === "ar" ? "الرصيد" : "Balance"}
                  </span>
                  <span className="text-white font-semibold tabular-nums">
                    {resultUi.economy.balanceAfter.toFixed(2)} VEX
                  </span>
                </div>
              </div>
            )}

            {resultUi.economy?.freePlay && (
              <div
                className="rounded-xl p-3 my-3 border border-blue-500/30 bg-blue-500/10 text-center text-xs text-blue-200"
                data-testid="badge-arcade-freeplay"
              >
                {lang === "ar"
                  ? "وضع اللعب المجاني — لا يوجد خصم أو مكافأة"
                  : "Free play mode — no entry fee or reward"}
              </div>
            )}

            {resultUi.banter && (
              <div className="text-sm text-slate-200 mb-4 px-2 py-3 rounded-xl bg-white/5 border border-white/10 flex gap-2 items-start">
                <Sparkles className="h-4 w-4 text-brand-gold shrink-0 mt-0.5" />
                <span className="text-right flex-1" dir={lang === "ar" ? "rtl" : "ltr"}>
                  {resultUi.banter.text}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => navigate("/games")}
                className="border-white/10 text-white hover:bg-white/10"
              >
                {lang === "ar" ? "خروج" : "Exit"}
              </Button>
              <Button
                onClick={handleReplay}
                className="text-white"
                style={{ background: `linear-gradient(135deg, ${game.color}, ${game.color}cc)` }}
                data-testid="button-replay-arcade"
              >
                {lang === "ar" ? "جولة جديدة" : "Play again"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
