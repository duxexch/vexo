import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiRequest, financialQueryOptions } from "@/lib/queryClient";
import { formatWalletAmountFromUsd } from "@/lib/wallet-currency";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertTriangle, Maximize2, Minimize2, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface GameSession {
  sessionId: string;
  sessionToken: string;
  gameUrl: string;
  game: {
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string;
    sandboxPermissions: string;
    orientation: string;
    sdkVersion: string;
  };
  player: {
    id: number;
    username: string;
    balance: string;
    language: string;
    avatar: string;
  };
}

type SessionState = "loading" | "ready" | "playing" | "ended" | "error";

export default function GamePlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { user, refreshUser } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [state, setState] = useState<SessionState>("loading");
  const [error, setError] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<string>("0.00");
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const { data: depositConfig } = useQuery<{
    balanceCurrency?: string;
    usdRateByCurrency?: Record<string, number>;
    currencySymbolByCode?: Record<string, string>;
  }>({
    queryKey: ["/api/transactions/deposit-config"],
    ...financialQueryOptions,
  });

  const formattedBalance = useMemo(
    () => formatWalletAmountFromUsd(currentBalance || "0", {
      balanceCurrency: depositConfig?.balanceCurrency,
      usdRateByCurrency: depositConfig?.usdRateByCurrency,
      currencySymbolByCode: depositConfig?.currencySymbolByCode,
    }, { withCode: true }),
    [currentBalance, depositConfig?.balanceCurrency, depositConfig?.usdRateByCurrency, depositConfig?.currencySymbolByCode],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<string>("");
  const pendingCallbacks = useRef<Map<string, (data: any) => void>>(new Map());

  // Start game session
  useEffect(() => {
    if (!slug) return;
    startSession();
  }, [slug]);

  async function startSession() {
    try {
      setState("loading");
      setError("");
      const res = await apiRequest("POST", `/api/external-games/${slug}/start`, {
        betAmount: 0,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to start game");
      }
      const data = await res.json();
      setSession(data);
      sessionTokenRef.current = data.sessionToken;
      setCurrentBalance(data.player.balance);
      setState("ready");
    } catch (err: any) {
      setError(err.message || "Failed to start game session");
      setState("error");
    }
  }

  // Listen for PostMessage from game iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.source !== "vex-game-sdk") return;

      const { type, payload, id } = data;

      switch (type) {
        case "init":
          handleInit(id);
          break;
        case "get_player":
          sendToGame(id, { player: session?.player });
          break;
        case "get_session_token":
          sendToGame(id, { token: sessionTokenRef.current });
          break;
        case "debit":
          handleDebit(payload, id);
          break;
        case "credit":
          handleCredit(payload, id);
          break;
        case "end_session":
          handleEndSession(payload, id);
          break;
        case "report_score":
          handleReportScore(payload, id);
          break;
        case "close":
          handleClose();
          break;
        case "show_toast":
          toast({
            title: payload?.message || "",
            variant: payload?.type === "error" ? "destructive" : "default",
          });
          break;
        case "get_platform_info":
          sendToGame(id, {
            platform: "vex",
            version: "1.0",
            language,
            deviceType: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
          });
          break;
        case "set_data":
          handleSetData(payload, id);
          break;
        case "get_data":
          handleGetData(payload, id);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [session, language]);

  function sendToGame(requestId: string, payload: any) {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { source: "vex-platform", id: requestId, ...payload },
      "*"
    );
  }

  function sendEvent(event: string, data?: any) {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { source: "vex-platform", event, ...data },
      "*"
    );
  }

  function handleInit(requestId: string) {
    setState("playing");
    sendToGame(requestId, {
      success: true,
      player: session?.player,
      sessionToken: sessionTokenRef.current,
      config: {
        language,
        platform: "vex",
      },
    });
    // Send ready event
    sendEvent("ready", { player: session?.player });
  }

  async function handleDebit(payload: any, requestId: string) {
    try {
      const res = await apiRequest("POST", "/api/external-games/session/debit", {
        sessionToken: sessionTokenRef.current,
        amount: payload.amount,
        reason: payload.reason,
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentBalance(data.newBalance);
        sendToGame(requestId, { success: true, newBalance: data.newBalance });
        sendEvent("balanceUpdate", { balance: data.newBalance });
      } else {
        sendToGame(requestId, { success: false, error: data.message });
      }
    } catch (err: any) {
      sendToGame(requestId, { success: false, error: err.message });
    }
  }

  async function handleCredit(payload: any, requestId: string) {
    try {
      const res = await apiRequest("POST", "/api/external-games/session/credit", {
        sessionToken: sessionTokenRef.current,
        amount: payload.amount,
        reason: payload.reason,
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentBalance(data.newBalance);
        sendToGame(requestId, { success: true, newBalance: data.newBalance });
        sendEvent("balanceUpdate", { balance: data.newBalance });
      } else {
        sendToGame(requestId, { success: false, error: data.message });
      }
    } catch (err: any) {
      sendToGame(requestId, { success: false, error: err.message });
    }
  }

  async function handleEndSession(payload: any, requestId: string) {
    try {
      const res = await apiRequest("POST", "/api/external-games/session/end", {
        sessionToken: sessionTokenRef.current,
        result: payload.result || "none",
        score: payload.score,
        winAmount: payload.winAmount,
        metadata: payload.metadata,
      });
      const data = await res.json();
      if (res.ok) {
        setState("ended");
        setCurrentBalance(data.newBalance || currentBalance);
        sendToGame(requestId, { success: true, newBalance: data.newBalance });
        refreshUser();
      } else {
        sendToGame(requestId, { success: false, error: data.message });
      }
    } catch (err: any) {
      sendToGame(requestId, { success: false, error: err.message });
    }
  }

  async function handleReportScore(payload: any, requestId: string) {
    // Store score - could post to leaderboard API later
    sendToGame(requestId, { success: true });
  }

  function handleClose() {
    setState("ended");
    setLocation("/games");
    refreshUser();
  }

  function handleSetData(payload: any, requestId: string) {
    try {
      const storageKey = `vex_game_${session?.game.id}_${user?.id}_${payload.key}`;
      localStorage.setItem(storageKey, JSON.stringify(payload.value));
      sendToGame(requestId, { success: true });
    } catch {
      sendToGame(requestId, { success: false, error: "Storage error" });
    }
  }

  function handleGetData(payload: any, requestId: string) {
    try {
      const storageKey = `vex_game_${session?.game.id}_${user?.id}_${payload.key}`;
      const stored = localStorage.getItem(storageKey);
      sendToGame(requestId, { success: true, value: stored ? JSON.parse(stored) : null });
    } catch {
      sendToGame(requestId, { success: false, error: "Storage error" });
    }
  }

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Pause/resume on visibility change
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        sendEvent("pause");
      } else {
        sendEvent("resume");
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [session]);

  const gameName = session?.game
    ? language === "ar" ? session.game.nameAr : session.game.nameEn
    : slug;

  if (state === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70svh] gap-4 p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">{t("game_load_failed") || "Failed to load game"}</h2>
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
        <div className="grid w-full max-w-sm grid-cols-1 sm:grid-cols-2 gap-2">
          <Button className="min-h-[44px]" variant="outline" onClick={() => setLocation("/games")}>
            <ArrowLeft className="h-4 w-4 me-1 rtl-flip" />
            {t("back") || "Back"}
          </Button>
          <Button className="min-h-[44px]" onClick={startSession}>
            <RotateCcw className="h-4 w-4 me-1" />
            {t("retry") || "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  if (state === "loading" || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70svh] gap-4 p-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">{t("loading_game") || "Loading game..."}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-[100svh] bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-card border-b shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => {
            if (state === "playing") {
              setShowExitConfirm(true);
            } else {
              setLocation("/games");
            }
          }} className="min-h-[44px] min-w-[44px]">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="font-medium text-sm leading-tight line-clamp-1 max-w-[46vw] sm:max-w-none">{gameName}</div>
            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[46vw] sm:max-w-none">
              {t("balance") || "Balance"}: {formattedBalance}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button className="min-h-[44px] min-w-[44px]" variant="ghost" size="icon" onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Game iframe */}
      <div className="flex-1 relative">
        <iframe
          ref={iframeRef}
          src={session.gameUrl}
          sandbox={session.game.sandboxPermissions || "allow-scripts allow-same-origin"}
          allow="autoplay; fullscreen"
          className="absolute inset-0 w-full h-full border-0"
          title={gameName}
          onLoad={() => {
            // Game loaded in iframe, wait for SDK init message
          }}
          onError={() => {
            setError("Game failed to load in iframe");
            setState("error");
          }}
        />
      </div>

      {/* Ended overlay */}
      {state === "ended" && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 text-center space-y-4 max-w-xs mx-4">
            <h3 className="text-lg font-bold">{t("game_over") || "Game Over"}</h3>
            <p className="text-sm text-muted-foreground">
              {t("balance") || "Balance"}: {formattedBalance}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 justify-center">
              <Button className="min-h-[44px]" variant="outline" onClick={() => setLocation("/games")}>
                <ArrowLeft className="h-4 w-4 me-1 rtl-flip" />
                {t("back_to_games") || "Games"}
              </Button>
              <Button className="min-h-[44px]" onClick={() => {
                setState("loading");
                startSession();
              }}>
                <RotateCcw className="h-4 w-4 me-1" />
                {t("play_again") || "Play Again"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showExitConfirm}
        title={t("exit_game_confirm") || "Exit game? Progress may be lost."}
        variant="destructive"
        onConfirm={() => { setShowExitConfirm(false); handleClose(); }}
        onCancel={() => setShowExitConfirm(false)}
      />
    </div>
  );
}
