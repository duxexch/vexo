import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Maximize2, RotateCcw, Trophy, Star, Sparkles } from "lucide-react";
import { getArcadeGame, gameKeyToSlug, isArcadeGameKey } from "@shared/arcade-games";

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

type Phase = "boot" | "playing" | "ended" | "error";

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

export default function ArcadePlayPage() {
  const { gameKey: rawKey } = useParams<{ gameKey: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const submittedRef = useRef<boolean>(false);
  const [phase, setPhase] = useState<Phase>("boot");
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

  // VEX SDK message bridge.
  // Speaks the exact protocol that `/games/vex-sdk.js` uses:
  //   - Game posts JSON-stringified envelopes shaped like
  //     `{ source: 'vex-game-sdk', type, payload, id }`.
  //   - Host must reply with `{ source: 'vex-platform', type, payload, id }`
  //     using the SDK's expected reply names (`init_response`,
  //     `session_end_response`, `debit_response`, `credit_response`,
  //     `score_response`).
  useEffect(() => {
    if (!game || !user) return;
    const expectedOrigin = window.location.origin;
    const safeUser = user;
    const safeGame = game;

    function postReply(target: Window, type: string, payload: unknown, id?: number | string) {
      // Send as a plain object (not stringified) — vex-sdk.js handles both,
      // but the platform side stays consistent with object messages.
      target.postMessage({ source: "vex-platform", type, payload, id }, expectedOrigin);
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== expectedOrigin) return;
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      // SDK posts as JSON string — parse it. Also accept raw objects from
      // the lightweight VexGame fallback path for safety.
      let data: unknown = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== "object") return;
      const msg = data as { source?: string; type?: string; id?: number | string; payload?: Record<string, unknown> };
      if (msg.source !== "vex-game-sdk" || typeof msg.type !== "string") return;

      const target = iframe.contentWindow;
      if (!target) return;

      switch (msg.type) {
        case "game_init":
        case "game_ping": {
          // Establish the connection: SDK proceeds to "ready" only on
          // receiving an `init_response`. Send player + session token.
          postReply(
            target,
            "init_response",
            {
              player: {
                id: safeUser.id,
                username: safeUser.username ?? "",
                balance: "0",
                language: lang,
                avatarUrl: (safeUser as { avatarUrl?: string }).avatarUrl ?? "",
              },
              sessionToken: `arcade_${safeGame.key}_${Date.now()}`,
            },
            msg.id,
          );
          if (phase === "boot") {
            setPhase("playing");
            sessionStartRef.current = Date.now();
          }
          break;
        }
        case "end_session": {
          const p = (msg.payload ?? {}) as { score?: number; result?: string; metadata?: Record<string, unknown> };
          const score = Math.max(0, Math.floor(Number(p.score) || 0));
          const rawResult = (p.result ?? "draw").toString().toLowerCase();
          const result: "win" | "loss" | "draw" =
            rawResult === "win"
              ? "win"
              : rawResult === "loss" || rawResult === "lose"
                ? "loss"
                : rawResult === "draw"
                  ? "draw"
                  : score > 0 ? "win" : "loss";
          // Persist first, then reply with the server payload so the SDK
          // callback receives banter / personal-best / economy fields.
          const savedId = msg.id;
          submitResult({ score, result, metadata: p.metadata }).then((outcome) => {
            const liveTarget = iframeRef.current?.contentWindow;
            if (!liveTarget) return;
            if (outcome.ok && outcome.data?.session) {
              postReply(
                liveTarget,
                "session_end_response",
                {
                  success: true,
                  session: outcome.data.session,
                  banter: outcome.data.banter ?? null,
                  economy: outcome.data.economy ?? null,
                  personalBest: outcome.data.personalBest ?? outcome.data.session.score,
                  previousBest: outcome.data.previousBest ?? 0,
                  isPersonalBest: outcome.data.session.isPersonalBest === true,
                },
                savedId,
              );
            } else {
              postReply(
                liveTarget,
                "session_end_response",
                { success: false, error: outcome.error ?? "submit_failed" },
                savedId,
              );
            }
          });
          break;
        }
        case "report_score": {
          // Intermediate scores — no-op host-side for now.
          postReply(target, "score_response", { success: true }, msg.id);
          break;
        }
        case "debit":
        case "credit": {
          // Arcade games don't gate on balance from the iframe side — wallet
          // moves happen server-side via /api/arcade/sessions when the run
          // ends. Always succeed so the SDK callback fires.
          postReply(
            target,
            msg.type === "debit" ? "debit_response" : "credit_response",
            { success: true, newBalance: "0" },
            msg.id,
          );
          break;
        }
        case "close_request": {
          navigate("/games");
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [game, user, lang, phase, submitResult, navigate]);

  const handleReplay = () => {
    submittedRef.current = false;
    setResultUi(null);
    setPhase("boot");
    sessionStartRef.current = Date.now();
    if (iframeRef.current && game) {
      iframeRef.current.src = `/games/${game.slug}/index.html?t=${Date.now()}`;
    }
  };

  const handleFullscreen = () => {
    const el = iframeRef.current;
    if (!el) return;
    const anyEl = el as HTMLIFrameElement & { webkitRequestFullscreen?: () => void };
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen();
  };

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
  const iframeSrc = `/games/${slug}/index.html`;

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-[#070b14] via-[#0a0f1a] to-[#040713] text-white flex flex-col">
      {/* Top bar */}
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
              {game.kind === "solo"
                ? lang === "ar" ? "لاعب واحد" : "Single player"
                : game.kind === "duo"
                  ? lang === "ar" ? "1-2 لاعبين" : "1-2 players"
                  : lang === "ar" ? "2-8 لاعبين" : "2-8 players"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleReplay} className="text-white hover:bg-white/10">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleFullscreen} className="text-white hover:bg-white/10">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Iframe stage */}
      <div className="relative flex-1 flex items-stretch justify-center bg-black">
        {phase === "boot" && (
          <div className="absolute inset-0 grid place-items-center z-10 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={title}
          className="w-full h-full block bg-black"
          allow="autoplay; gamepad; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          data-testid="arcade-game-iframe"
        />
      </div>

      {/* Result overlay */}
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
                className={`rounded-xl p-4 my-3 border ${
                  resultUi.economy.netVex > 0
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
                    {lang === "ar" ? "صافي الجائزة" : "Payout"}:{" "}
                    {resultUi.economy.rewardVex.toFixed(2)} VEX
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
