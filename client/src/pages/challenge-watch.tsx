import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRequestWithPaymentToken } from "@/lib/payment-operation";
import type { CountryPaymentMethod } from "@shared/schema";
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import { normalizeDominoChallengePlayerView } from "@/lib/domino-challenge-adapter";
import { BackButton } from "@/components/BackButton";
import { ChessBoard } from "@/components/games/ChessBoard";
import {
  DominoChallengeContainer,
  type DominoEndgameSummary,
  type DominoScoreRow,
  type DominoTimelineEntry,
} from "@/components/games/DominoChallengeContainer";
import { BackgammonBoard } from "@/components/games/backgammon/BackgammonBoard";
import TarneebBoard from "@/components/games/TarneebBoard";
import type { TarneebState } from "@/components/games/TarneebBoard";
import BalootBoard from "@/components/games/BalootBoard";
import type { BalootState } from "@/components/games/BalootBoard";
import { ProjectCurrencyAmount } from "@/components/ProjectCurrencySymbol";
import { SpectatorPanel } from "@/components/games/SpectatorPanel";
import { ShareMatchButton } from "@/components/games/ShareMatchButton";
import { FloatingGiftsOverlay } from "@/components/games/TikTokGiftBar";
import { FullScreenGiftPanel } from "@/components/games/FullScreenGiftPanel";
import {
  Crown,
  Target,
  Dice5,
  Spade,
  Heart,
  Clock,
  Trophy,
  Eye,
  Loader2,
  X,
  TrendingUp,
  Zap,
  Timer,
  Users,
  Star,
  Gift,
  Info,
  ArrowRightLeft,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  vipLevel?: number;
}

interface GameSession {
  id: string;
  challengeId: string;
  gameType: "chess" | "domino" | "backgammon" | "tarneeb" | "baloot";
  currentTurn: string | null;
  player1TimeRemaining: number;
  player2TimeRemaining: number;
  gameState?: string;
  status: "waiting" | "playing" | "paused" | "finished";
  winnerId?: string;
  winReason?: string;
  totalMoves: number;
  spectatorCount: number;
  lastMoveAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface Challenge {
  id: string;
  gameType: string;
  betAmount: string;
  currencyType?: "project" | "usd";
  visibility: "public" | "private";
  status: string;
  player1Id: string;
  player2Id?: string;
  player3Id?: string;
  player4Id?: string;
  player1?: Player;
  player2?: Player;
  player3?: Player;
  player4?: Player;
  requiredPlayers: number;
  timeLimit: number;
}

interface OddsData {
  challengeId: string;
  gameType: string;
  player1: {
    id: string;
    username: string;
    odds: number;
    probability: number;
  } | null;
  player2: {
    id: string;
    username: string;
    odds: number;
    probability: number;
  } | null;
  houseFeePercent: number;
  instantMatchOdds: string;
  allowInstantMatch: boolean;
  minSupportAmount: number;
  maxSupportAmount: number;
}

interface SupportEntry {
  id: string;
  challengeId: string;
  supporterId: string;
  supporterName: string;
  supporterAvatar?: string;
  playerId: string;
  playerName: string;
  amount: string;
  potentialWinnings: string;
  mode: "instant" | "wait_for_match";
  status: "pending" | "matched" | "won" | "lost" | "cancelled" | "refunded";
  createdAt: string;
}

interface WatchGiftInfo {
  id: string;
  senderName: string;
  giftName: string;
  giftId?: string;
  amount?: number | string;
  [key: string]: unknown;
}

interface WatchChatMessage {
  id?: string;
  userId?: string;
  username: string;
  message: string;
  timestamp: string | number;
}

interface ChallengeWatchWSMessage {
  type: string;
  payload?: {
    message?: string;
    code?: string;
    [key: string]: unknown;
  };
  session?: GameSession;
  view?: Record<string, unknown>;
  message?: WatchChatMessage;
  gift?: WatchGiftInfo;
  error?: string;
  code?: string;
  winnerId?: string;
  reason?: string;
  count?: number;
  [key: string]: unknown;
}

interface ProjectCurrencySettings {
  isActive: boolean;
  exchangeRate: string;
  conversionCommissionRate: string;
  minConversionAmount: string;
  maxConversionAmount: string;
}

export default function ChallengeWatchPage() {
  const [, params] = useRoute("/challenge/:id/watch");
  const [, setLocation] = useLocation();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const challengeId = params?.id;

  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [playerView, setPlayerView] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<WatchChatMessage[]>([]);
  const [receivedGifts, setReceivedGifts] = useState<WatchGiftInfo[]>([]);
  const [giftAggregate, setGiftAggregate] = useState<{ count: number; totalValue: number }>({ count: 0, totalValue: 0 });

  const [supportAmount, setSupportAmount] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [supportMode, setSupportMode] = useState<"instant" | "wait_for_match">("instant");
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [mobileChatInput, setMobileChatInput] = useState("");
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [autoPlayNotice, setAutoPlayNotice] = useState<{
    mode: "grace" | "autoplay";
    username?: string;
    reason?: string;
    seconds?: number;
    startedAtMs?: number;
  } | null>(null);
  const [autoPlayNowMs, setAutoPlayNowMs] = useState(() => Date.now());
  const [fundingShortageProject, setFundingShortageProject] = useState(0);
  const [fundingUsdNeeded, setFundingUsdNeeded] = useState(0);
  const [quickConvertAmount, setQuickConvertAmount] = useState("5");

  const wsRef = useRef<WebSocket | null>(null);
  const wsErrorToastRef = useRef<{ signature: string; at: number }>({ signature: "", at: 0 });
  const lastGiftAttemptRef = useRef<{ giftId: string; price: number } | null>(null);
  const supportSectionRef = useRef<HTMLDivElement | null>(null);
  const WS_ERROR_TOAST_DEDUPE_MS = 2000;

  const showWsErrorToast = useCallback((message: string, code?: string) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;

    const signature = `${code || "unknown"}:${normalizedMessage}`;
    const now = Date.now();
    const isDuplicate = wsErrorToastRef.current.signature === signature
      && (now - wsErrorToastRef.current.at) < WS_ERROR_TOAST_DEDUPE_MS;

    if (isDuplicate) return;

    wsErrorToastRef.current = { signature, at: now };
    toast({
      title: language === "ar" ? "خطأ" : "Error",
      description: normalizedMessage,
      variant: "destructive",
    });
  }, [language, toast]);

  const { data: challenge, isLoading, isError: isChallengeError, error: challengeError } = useQuery<Challenge, Error>({
    queryKey: [`/api/challenges/${challengeId}`],
    enabled: !!challengeId,
  });

  useEffect(() => {
    if (!challengeId || !challenge || !user?.id) return;

    const participantIds = [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id].filter(Boolean);
    if (participantIds.includes(user.id)) {
      setLocation(`/challenge/${challengeId}/play`);
    }
  }, [challengeId, challenge, user?.id, setLocation]);

  const { data: projectWallet, refetch: refetchProjectWallet } = useQuery<{ totalBalance: string; currencySymbol: string }>({
    queryKey: ["/api/project-currency/wallet"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/project-currency/wallet", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load project wallet");
      return res.json();
    },
  });

  const { data: projectCurrencySettings } = useQuery<ProjectCurrencySettings>({
    queryKey: ["/api/project-currency/settings"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/project-currency/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load currency settings");
      return res.json();
    },
  });

  const { data: activePaymentMethods = [] } = useQuery<CountryPaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/payment-methods", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasActivePaymentMethod = activePaymentMethods.some(
    (method) => method.isActive && (method.isAvailable ?? true),
  );

  const quickConvertMutation = useMutation({
    mutationFn: (amount: string) => apiRequestWithPaymentToken("POST", "/api/project-currency/convert", { amount }, "convert"),
    onSuccess: async (res: Response) => {
      const payload = await res.json().catch(() => ({} as { status?: string }));
      await refetchProjectWallet();
      queryClient.invalidateQueries({ queryKey: ["/api/project-currency/conversions"] });
      toast({
        title: language === "ar" ? "تم التحويل" : "Converted",
        description: payload?.status === "pending"
          ? (language === "ar" ? "تم إرسال طلب التحويل للمراجعة" : "Conversion request submitted for review")
          : (language === "ar" ? "تمت إضافة رصيد عملة المشروع بنجاح." : "Project currency balance was updated successfully."),
      });
      setShowConvertDialog(false);
      setShowDepositDialog(false);
    },
    onError: (err: Error) => {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const parseHttpStatus = (error: Error | null): number | null => {
    if (!error?.message) return null;
    const match = error.message.match(/^(\d{3})\s*:/);
    if (!match) return null;
    const status = Number(match[1]);
    return Number.isNaN(status) ? null : status;
  };

  const challengeErrorStatus = parseHttpStatus(challengeError ?? null);

  const parseApiErrorMessage = useCallback((message: string): string => {
    const raw = String(message || "").trim();
    if (!raw) return language === "ar" ? "حدث خطأ غير متوقع" : "Unexpected error occurred";

    const jsonStartIndex = raw.indexOf("{");
    if (jsonStartIndex >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStartIndex)) as { error?: string };
        if (parsed?.error) return parsed.error;
      } catch {
        // Fallback to normalized message below
      }
    }

    return raw.replace(/^\d+\s*:\s*/, "").trim();
  }, [language]);

  const estimateUsdForProjectCurrency = useCallback((projectAmount: number): number => {
    const exchangeRate = Number(projectCurrencySettings?.exchangeRate || 0);
    const commissionRate = Number(projectCurrencySettings?.conversionCommissionRate || 0);
    const netRate = exchangeRate * Math.max(0, 1 - commissionRate);

    if (!Number.isFinite(netRate) || netRate <= 0) {
      return projectAmount;
    }

    return projectAmount / netRate;
  }, [projectCurrencySettings?.exchangeRate, projectCurrencySettings?.conversionCommissionRate]);

  const openFundingAssistance = useCallback((projectAmountNeeded: number, usdFallbackAmount = 0): void => {
    const safeProjectAmount = Math.max(0, Number(projectAmountNeeded) || 0);
    const estimatedUsd = Math.max(Number(usdFallbackAmount) || 0, estimateUsdForProjectCurrency(safeProjectAmount));
    const minConvert = Number(projectCurrencySettings?.minConversionAmount || 1);
    const maxConvert = Number(projectCurrencySettings?.maxConversionAmount || 10000);
    const suggestedConvert = Math.min(maxConvert, Math.max(minConvert, Number(estimatedUsd.toFixed(2))));
    const userUsdBalance = Number(user?.balance || 0);

    setFundingShortageProject(safeProjectAmount);
    setFundingUsdNeeded(estimatedUsd);
    setQuickConvertAmount(String(suggestedConvert));
    setShowConvertDialog(false);
    setShowDepositDialog(false);

    if (!projectCurrencySettings?.isActive || userUsdBalance < suggestedConvert) {
      setShowDepositDialog(true);
      return;
    }

    setShowConvertDialog(true);
  }, [estimateUsdForProjectCurrency, projectCurrencySettings?.isActive, projectCurrencySettings?.maxConversionAmount, projectCurrencySettings?.minConversionAmount, user?.balance]);

  const toFiniteNumber = useCallback((value: unknown): number | null => {
    const num = typeof value === "string" ? Number(value) : (typeof value === "number" ? value : Number.NaN);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }, []);

  const { data: oddsData, isLoading: isLoadingOdds } = useQuery<OddsData>({
    queryKey: [`/api/challenges/${challengeId}/odds`],
    enabled: !!challengeId,
  });

  const { data: supports, isLoading: isLoadingSupports } = useQuery<SupportEntry[]>({
    queryKey: [`/api/challenges/${challengeId}/supports`],
    enabled: !!challengeId,
  });

  const addSupportMutation = useMutation({
    mutationFn: (data: { playerId: string; amount: number; mode: string }) =>
      apiRequest("POST", `/api/challenges/${challengeId}/support`, data),
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم إضافة الدعم!" : "Support added!",
        description: language === "ar"
          ? "تم تسجيل دعمك بنجاح. حظاً موفقاً!"
          : "Your support has been registered. Good luck!",
      });
      setSupportAmount("");
      setSelectedPlayer(null);
      queryClient.invalidateQueries({ queryKey: [`/api/challenges/${challengeId}/supports`] });
    },
    onError: (err: Error) => {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: err.message || (language === "ar" ? "فشل إضافة الدعم" : "Failed to add support"),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!challengeId) return;

    const token = localStorage.getItem("pwm_token");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
      }
      // Small delay to ensure auth is processed before joining
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: "join_challenge_game",
          challengeId,
          isSpectator: true
        }));
      }, 100);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ChallengeWatchWSMessage;
        handleWebSocketMessage(data);
      } catch {
        showWsErrorToast(
          language === "ar" ? "رسالة غير صالحة من الخادم" : "Invalid server message",
          "invalid_server_message"
        );
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave_challenge_game", challengeId }));
      }
      ws.close();
    };
  }, [challengeId, language, showWsErrorToast]);

  const handleWebSocketMessage = useCallback((data: ChallengeWatchWSMessage) => {
    if (isWsErrorType(data.type)) {
      const { message, code } = extractWsErrorInfo(data);
      if (message) {
        const parsedError = parseApiErrorMessage(message);
        showWsErrorToast(parsedError, code);

        const normalized = parsedError.toLowerCase();
        const normalizedCode = String(code || "").toLowerCase();
        const isGiftFundingError = normalizedCode === "project_currency_required"
          || normalizedCode === "project_currency_wallet_required"
          || (
            normalized.includes("direct real-money gifts are disabled")
            || normalized.includes("purchase gifts with project currency first")
            || normalized.includes("insufficient project currency")
            || normalized.includes("project currency wallet")
          );

        if (isGiftFundingError) {
          const requiredFromServer = toFiniteNumber((data as { requiredProjectAmount?: unknown }).requiredProjectAmount)
            ?? toFiniteNumber((data as { giftPrice?: unknown }).giftPrice);
          const shortfallFromServer = toFiniteNumber((data as { shortfallProjectAmount?: unknown }).shortfallProjectAmount);
          const requiredFromRecentGift = toFiniteNumber(lastGiftAttemptRef.current?.price);
          const requiredProjectAmount = requiredFromServer ?? requiredFromRecentGift ?? shortfallFromServer ?? 0;

          if (requiredProjectAmount > 0) {
            const projectBalanceNow = Number(projectWallet?.totalBalance || 0);
            const projectShortage = shortfallFromServer ?? Math.max(0, requiredProjectAmount - projectBalanceNow);
            openFundingAssistance(projectShortage > 0 ? projectShortage : requiredProjectAmount, requiredProjectAmount);
          }
        }
      }
      return;
    }

    switch (data.type) {
      case "game_state_sync":
        if (data.session) setGameSession(data.session);
        if (data.view) setPlayerView(data.view);
        break;
      case "game_move":
        if (data.session) setGameSession(prev => prev ? { ...prev, ...data.session } : null);
        if (data.view) setPlayerView(data.view);
        break;
      case "chat_message":
        if (data.message) {
          setMessages((prev) => [...prev, data.message as WatchChatMessage].slice(-160));
        }
        break;
      case "gift_received":
        if (data.gift) {
          const gift = data.gift;
          const parsedGiftAmount = Number((gift as { amount?: unknown }).amount);
          const safeGiftAmount = Number.isFinite(parsedGiftAmount) && parsedGiftAmount > 0 ? parsedGiftAmount : 0;
          const displayId = `${String(gift.id || "gift")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const displayGift: WatchGiftInfo = {
            ...gift,
            id: displayId,
          };
          setReceivedGifts(prev => [...prev, displayGift]);
          setGiftAggregate((prev) => ({
            count: prev.count + 1,
            totalValue: prev.totalValue + safeGiftAmount,
          }));
          toast({
            title: language === "ar" ? "هدية!" : "Gift!",
            description: `${gift.senderName} sent ${gift.giftName}`,
          });
          setTimeout(() => {
            setReceivedGifts(prev => prev.filter(g => g.id !== displayId));
          }, 1500);
        }
        break;
      case "player_disconnected_grace": {
        const payload = (data.payload || {}) as Record<string, unknown>;
        const graceMs = toFiniteNumber(payload.graceMs);
        setAutoPlayNotice({
          mode: "grace",
          username: typeof payload.username === "string" ? payload.username : undefined,
          reason: "disconnect",
          seconds: graceMs ? Math.max(1, Math.round(graceMs / 1000)) : 60,
          startedAtMs: Date.now(),
        });
        break;
      }
      case "player_absent_auto": {
        const payload = (data.payload || {}) as Record<string, unknown>;
        const turnTimeLimitMs = toFiniteNumber(payload.turnTimeLimitMs);
        const username = typeof payload.username === "string" ? payload.username : undefined;
        const seconds = turnTimeLimitMs ? Math.max(1, Math.round(turnTimeLimitMs / 1000)) : 30;
        setAutoPlayNotice({
          mode: "autoplay",
          username,
          reason: typeof payload.reason === "string" ? payload.reason : "disconnect",
          seconds,
          startedAtMs: Date.now(),
        });
        toast({
          title: language === "ar" ? "تم تفعيل اللعب التلقائي" : "Auto Play enabled",
          description: language === "ar"
            ? `${username || "أحد اللاعبين"} أصبح غائبًا، وسيقوم النظام باللعب تلقائيًا كل ${seconds} ثانية حتى تنتهي المباراة.`
            : `${username || "A player"} is now absent, so the system will auto-play every ${seconds} seconds until the match ends.`,
        });
        break;
      }
      case "game_ended":
        setAutoPlayNotice(null);
        setGameSession(prev => prev ? { ...prev, status: "finished", winnerId: data.winnerId, winReason: data.reason } : null);
        break;
      case "spectator_count":
        setGameSession(prev => prev ? { ...prev, spectatorCount: (data.count as number) ?? 0 } : null);
        break;
      case "support_added":
        queryClient.invalidateQueries({ queryKey: [`/api/challenges/${challengeId}/supports`] });
        break;
    }
  }, [
    challengeId,
    showWsErrorToast,
    parseApiErrorMessage,
    toFiniteNumber,
    projectWallet?.totalBalance,
    openFundingAssistance,
    language,
    toast,
  ]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!autoPlayNotice || gameSession?.status !== "playing") {
      return;
    }

    setAutoPlayNowMs(Date.now());
    const ticker = setInterval(() => {
      setAutoPlayNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(ticker);
    };
  }, [autoPlayNotice?.mode, autoPlayNotice?.seconds, autoPlayNotice?.startedAtMs, gameSession?.status]);

  const formatChatTimestamp = (timestamp: string | number) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const autoPlayActorName = autoPlayNotice?.username || (language === "ar" ? "أحد اللاعبين" : "A player");
  const autoPlayBaseSeconds = Math.max(1, autoPlayNotice?.seconds ?? (autoPlayNotice?.mode === "grace" ? 60 : 30));
  const autoPlayElapsedSeconds = autoPlayNotice
    ? Math.max(0, Math.floor((autoPlayNowMs - (autoPlayNotice.startedAtMs ?? autoPlayNowMs)) / 1000))
    : 0;
  const autoPlayLiveSeconds = autoPlayNotice
    ? (autoPlayNotice.mode === "grace"
      ? Math.max(0, autoPlayBaseSeconds - autoPlayElapsedSeconds)
      : Math.max(1, autoPlayBaseSeconds - (autoPlayElapsedSeconds % autoPlayBaseSeconds)))
    : null;
  const autoPlayTitle = autoPlayNotice?.mode === "autoplay"
    ? (language === "ar" ? "تم تفعيل Auto Play" : "Auto Play is active")
    : (language === "ar" ? "بانتظار عودة اللاعب" : "Waiting for reconnection");
  const autoPlayDescription = autoPlayNotice?.mode === "autoplay"
    ? (language === "ar"
      ? `${autoPlayActorName} أصبح غائبًا، وسيكمل النظام اللعب تلقائيًا كل ${autoPlayBaseSeconds} ثانية حتى تنتهي المباراة.`
      : `${autoPlayActorName} is absent, so the system will auto-play every ${autoPlayBaseSeconds} seconds until the match ends.`)
    : (language === "ar"
      ? `${autoPlayActorName} انقطع عن المباراة. إذا لم يعد خلال ${autoPlayLiveSeconds ?? autoPlayBaseSeconds} ثانية سيدخل التحدي وضع Auto Play.`
      : `${autoPlayActorName} disconnected from the match. If they do not return within ${autoPlayLiveSeconds ?? autoPlayBaseSeconds} seconds, Auto Play will take over.`);

  const dominoTurnStartedAtMs = useMemo(() => {
    const rawLastMoveAt = gameSession?.lastMoveAt;
    if (!rawLastMoveAt) {
      return undefined;
    }

    const parsed = new Date(rawLastMoveAt).getTime();
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [gameSession?.lastMoveAt, gameSession?.totalMoves]);

  const balootTurnStartedAtMs = useMemo(() => {
    const rawStartedAt = gameSession?.lastMoveAt || gameSession?.updatedAt || gameSession?.createdAt;
    if (!rawStartedAt) {
      return undefined;
    }

    const parsed = new Date(rawStartedAt).getTime();
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [gameSession?.createdAt, gameSession?.lastMoveAt, gameSession?.totalMoves, gameSession?.updatedAt]);

  const tarneebTurnStartedAtMs = useMemo(() => {
    const rawStartedAt = gameSession?.lastMoveAt || gameSession?.updatedAt || gameSession?.createdAt;
    if (!rawStartedAt) {
      return undefined;
    }

    const parsed = new Date(rawStartedAt).getTime();
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [gameSession?.createdAt, gameSession?.lastMoveAt, gameSession?.totalMoves, gameSession?.updatedAt]);

  const getPlayerOdds = (playerId: string): number => {
    if (!oddsData || !challenge) return 1.5;
    const instantOdds = parseFloat(oddsData.instantMatchOdds) || 1.8;
    if (playerId === challenge.player1Id) {
      return supportMode === "instant" ? instantOdds : (oddsData.player1?.odds || 1.5);
    }
    return supportMode === "instant" ? instantOdds : (oddsData.player2?.odds || 1.5);
  };

  const calculatePotentialWinnings = () => {
    if (!supportAmount || !selectedPlayer) return 0;
    const amount = parseFloat(supportAmount);
    if (isNaN(amount)) return 0;
    const odds = getPlayerOdds(selectedPlayer);
    return amount * odds;
  };

  const handleSendGift = useCallback((giftId: string, playerId: string, meta?: { price?: number }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar" ? "غير متصل" : "Not connected",
        variant: "destructive",
      });
      return;
    }

    const attemptedGiftPrice = Number(meta?.price || 0);
    lastGiftAttemptRef.current = {
      giftId,
      price: Number.isFinite(attemptedGiftPrice) ? attemptedGiftPrice : 0,
    };

    wsRef.current.send(JSON.stringify({
      type: "send_gift",
      challengeId,
      giftId,
      recipientId: playerId,
    }));
  }, [challengeId, language, toast]);

  const sendLiveChatMessage = useCallback((message: string) => {
    const safeMessage = message.trim();
    if (!safeMessage) return;

    if (!user) {
      toast({
        title: language === "ar" ? "سجل الدخول أولاً" : "Login required",
        description: language === "ar" ? "سجّل الدخول للمشاركة في الدردشة المباشرة." : "Sign in to join the live chat.",
        variant: "destructive",
      });
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar" ? "الاتصال غير جاهز الآن" : "Connection is not ready right now",
        variant: "destructive",
      });
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: "challenge_chat",
      challengeId,
      message: safeMessage,
    }));
    setMobileChatInput("");
  }, [challengeId, language, toast, user]);

  const openGiftPanel = useCallback(() => {
    setShowGiftPanel(true);
  }, []);

  const jumpToSupportSection = useCallback(() => {
    supportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleAddSupport = () => {
    if (!selectedPlayer || !supportAmount) return;
    const amount = parseFloat(supportAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar" ? "أدخل مبلغاً صحيحاً" : "Enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    if (oddsData && (amount < oddsData.minSupportAmount || amount > oddsData.maxSupportAmount)) {
      const minAmountText = challenge?.currencyType === "project"
        ? `${oddsData.minSupportAmount.toFixed(2)} VXC`
        : `$${oddsData.minSupportAmount.toFixed(2)}`;
      const maxAmountText = challenge?.currencyType === "project"
        ? `${oddsData.maxSupportAmount.toFixed(2)} VXC`
        : `$${oddsData.maxSupportAmount.toFixed(2)}`;
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar"
          ? `المبلغ يجب أن يكون بين ${minAmountText} و ${maxAmountText}`
          : `Amount must be between ${minAmountText} and ${maxAmountText}`,
        variant: "destructive",
      });
      return;
    }
    addSupportMutation.mutate({
      playerId: selectedPlayer,
      amount,
      mode: supportMode,
    });
  };

  const minConvertAmount = Number(projectCurrencySettings?.minConversionAmount || 1);
  const maxConvertAmount = Number(projectCurrencySettings?.maxConversionAmount || 10000);
  const quickConvertAmountValue = Number(quickConvertAmount || 0);
  const quickConvertDisabled =
    quickConvertMutation.isPending
    || !quickConvertAmount
    || quickConvertAmountValue <= 0
    || quickConvertAmountValue < minConvertAmount
    || quickConvertAmountValue > maxConvertAmount
    || quickConvertAmountValue > Number(user?.balance || 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isChallengeError) {
    const isUnauthorized = challengeErrorStatus === 401;
    const isForbidden = challengeErrorStatus === 403;
    const isNotFound = challengeErrorStatus === 404;
    const isRateLimited = challengeErrorStatus === 429;

    const title = isUnauthorized
      ? (language === "ar" ? "تسجيل الدخول مطلوب" : "Login required")
      : isForbidden
        ? (language === "ar" ? "غير مصرح لك بمشاهدة هذا التحدي" : "You are not authorized to view this challenge")
        : isNotFound
          ? (language === "ar" ? "التحدي غير موجود" : "Challenge not found")
          : isRateLimited
            ? (language === "ar" ? "تم تجاوز الحد المسموح من الطلبات" : "Too many requests")
            : (language === "ar" ? "تعذر تحميل التحدي" : "Failed to load challenge");

    const description = isUnauthorized
      ? (language === "ar" ? "انتهت الجلسة أو لم يتم تسجيل الدخول." : "Your session is missing or expired.")
      : isForbidden
        ? (language === "ar" ? "هذا التحدي خاص ولا يمكن الوصول إليه بهذا الحساب." : "This challenge is private for your account.")
        : isNotFound
          ? (language === "ar" ? "قد يكون التحدي أُلغي أو لم يعد متاحًا." : "The challenge may have been cancelled or no longer available.")
          : isRateLimited
            ? (language === "ar" ? "يرجى الانتظار قليلًا ثم إعادة المحاولة." : "Please wait a moment and try again.")
            : (challengeError?.message || (language === "ar" ? "حدث خطأ غير متوقع." : "An unexpected error occurred."));

    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/challenges/${challengeId}`] })}>
                {language === "ar" ? "إعادة المحاولة" : "Retry"}
              </Button>
              <Button onClick={() => setLocation(isUnauthorized ? "/login" : "/challenges")}>
                {isUnauthorized
                  ? (language === "ar" ? "تسجيل الدخول" : "Go to Login")
                  : (language === "ar" ? "العودة للتحديات" : "Back to Challenges")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <p>{language === "ar" ? "التحدي غير موجود" : "Challenge not found"}</p>
            <Button className="mt-4" onClick={() => setLocation("/challenges")}>
              {language === "ar" ? "العودة للتحديات" : "Back to Challenges"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isRTL = language === "ar";
  const GAME_INFO: Record<string, { icon: React.ComponentType<{ className?: string }>; nameAr: string; nameEn: string }> = {
    chess: { icon: Crown, nameAr: "الشطرنج", nameEn: "Chess" },
    domino: { icon: Target, nameAr: "الدومينو", nameEn: "Domino" },
    backgammon: { icon: Dice5, nameAr: "الطاولة", nameEn: "Backgammon" },
    tarneeb: { icon: Spade, nameAr: "الطرنيب", nameEn: "Tarneeb" },
    baloot: { icon: Heart, nameAr: "البلوت", nameEn: "Baloot" },
  };
  const gameInfo = GAME_INFO[challenge.gameType] || GAME_INFO.chess;
  const GameIcon = gameInfo.icon;
  const isTeamGame = challenge.gameType === "tarneeb" || challenge.gameType === "baloot";
  const challengeCurrencyType = challenge.currencyType === "project" ? "project" : "usd";
  const isProjectChallengeCurrency = challengeCurrencyType === "project";

  const formatChallengeAmountText = (amount: number | string): string => {
    const parsed = typeof amount === "number" ? amount : Number.parseFloat(String(amount));
    const safeAmount = Number.isFinite(parsed) ? parsed : 0;
    return isProjectChallengeCurrency ? `${safeAmount.toFixed(2)} VXC` : `$${safeAmount.toFixed(2)}`;
  };

  const supportAggregate = !supports || supports.length === 0
    ? { count: 0, totalAmount: 0 }
    : {
      count: supports.length,
      totalAmount: supports.reduce((sum, support) => {
        const numericAmount = Number(support.amount);
        return sum + (Number.isFinite(numericAmount) ? numericAmount : 0);
      }, 0),
    };

  const participantIds = new Set(
    [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id]
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const liveChatMessages = messages
    .filter((msg) => String(msg.message || "").trim().length > 0)
    .slice(-80)
    .map((msg, index) => {
      const isPlayerMessage = Boolean(msg.userId && participantIds.has(msg.userId));
      return {
        id: msg.id || `${msg.userId || "chat"}-${index}-${String(msg.timestamp)}`,
        userId: msg.userId,
        username: msg.username || (isPlayerMessage
          ? (language === "ar" ? "لاعب" : "Player")
          : (language === "ar" ? "مشاهد" : "Viewer")),
        message: String(msg.message || ""),
        timestamp: msg.timestamp,
      };
    });

  const isWideBoardGame = challenge.gameType === "domino"
    || challenge.gameType === "backgammon"
    || challenge.gameType === "tarneeb"
    || challenge.gameType === "baloot";
  const playerInfoWidthClass = challenge.gameType === "baloot"
    ? "w-full max-w-6xl mb-4"
    : (isWideBoardGame ? "w-full max-w-5xl mb-4" : "w-full max-w-lg mb-4");
  const boardWidthClass = challenge.gameType === "baloot"
    ? "w-full max-w-6xl"
    : (isWideBoardGame ? "w-full max-w-5xl" : "w-full max-w-lg");
  const supportActionsDisabled = !challenge.player2 || gameSession?.status !== "playing" || isTeamGame;

  const balootPlayerNames: Record<string, string> = {};
  for (const [id, username] of [
    [challenge.player1Id, challenge.player1?.username],
    [challenge.player2Id, challenge.player2?.username],
    [challenge.player3Id, challenge.player3?.username],
    [challenge.player4Id, challenge.player4?.username],
  ] as const) {
    if (id && username) {
      balootPlayerNames[id] = username;
    }
  }

  const resolveWinnerName = (winnerId?: string) => {
    if (!winnerId) return language === "ar" ? "غير معروف" : "Unknown";
    const playerMap = new Map<string, string>([
      [challenge.player1?.id || challenge.player1Id, challenge.player1?.username || "Player 1"],
      [challenge.player2?.id || challenge.player2Id || "", challenge.player2?.username || "Player 2"],
      [challenge.player3?.id || challenge.player3Id || "", challenge.player3?.username || "Player 3"],
      [challenge.player4?.id || challenge.player4Id || "", challenge.player4?.username || "Player 4"],
    ]);
    return playerMap.get(winnerId) || winnerId;
  };

  const dominoPlayerLabels = new Map<string, string>();
  for (const player of [
    { id: challenge.player1Id, username: challenge.player1?.username, seat: 1 },
    { id: challenge.player2Id, username: challenge.player2?.username, seat: 2 },
    { id: challenge.player3Id, username: challenge.player3?.username, seat: 3 },
    { id: challenge.player4Id, username: challenge.player4?.username, seat: 4 },
  ]) {
    if (!player.id) continue;
    dominoPlayerLabels.set(player.id, player.username || `${t("domino.player")} ${player.seat}`);
  }

  const dominoRawView = (() => {
    if (playerView && typeof playerView === "object") {
      return playerView;
    }

    if (!gameSession?.gameState) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(gameSession.gameState) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }

    return undefined;
  })();

  const dominoBoardState = dominoRawView
    ? normalizeDominoChallengePlayerView(dominoRawView) as Record<string, unknown> | undefined
    : undefined;

  const dominoTimeline: DominoTimelineEntry[] = (() => {
    const state = dominoBoardState as { lastAction?: unknown } | undefined;
    const lastAction = state?.lastAction;

    if (!lastAction || typeof lastAction !== "object") {
      return [];
    }

    const action = lastAction as {
      type?: unknown;
      playerId?: unknown;
      tile?: { left?: unknown; right?: unknown };
    };

    if (typeof action.type !== "string" || typeof action.playerId !== "string") {
      return [];
    }

    const actor = dominoPlayerLabels.get(action.playerId) || t("domino.player");
    let text = `${actor} ${action.type}`;

    if (action.type === "pass") {
      text = `${actor} ${t("domino.passedTurn")}`;
    } else if (action.type === "draw") {
      text = `${actor} ${t("domino.drewTile")}`;
    } else if (
      action.type === "play"
      && action.tile
      && typeof action.tile.left === "number"
      && typeof action.tile.right === "number"
    ) {
      text = `${actor} ${t("domino.played")} ${action.tile.left}|${action.tile.right}`;
    }

    return [{
      id: `${action.type}-${action.playerId}`,
      text,
      moveNumber: typeof gameSession?.totalMoves === "number" ? gameSession.totalMoves : undefined,
    }];
  })();

  const dominoScoreRows: DominoScoreRow[] = (() => {
    const scores = dominoBoardState
      && typeof (dominoBoardState as { scores?: unknown }).scores === "object"
      ? (dominoBoardState as { scores?: Record<string, unknown> }).scores
      : undefined;

    if (!scores) {
      return [];
    }

    return Object.entries(scores)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([playerId, value], index) => ({
        id: playerId,
        label: dominoPlayerLabels.get(playerId) || `${t("domino.player")} ${index + 1}`,
        score: value as number,
      }))
      .sort((a, b) => b.score - a.score);
  })();

  const dominoScoreLookup = new Map(dominoScoreRows.map((row) => [row.id, row.score]));
  const dominoPlayer1Score = challenge?.player1Id ? (dominoScoreLookup.get(challenge.player1Id) ?? 0) : 0;
  const dominoPlayer2Score = challenge?.player2Id ? (dominoScoreLookup.get(challenge.player2Id) ?? 0) : 0;
  const dominoAutoPlayBadgeText = autoPlayNotice && autoPlayLiveSeconds !== null
    ? (autoPlayNotice.mode === "grace"
      ? (language === "ar"
        ? `اللعب التلقائي خلال ${autoPlayLiveSeconds}ث · ${autoPlayActorName}`
        : `Auto Play in ${autoPlayLiveSeconds}s · ${autoPlayActorName}`)
      : (language === "ar"
        ? `اللعب التلقائي ${autoPlayLiveSeconds}ث · ${autoPlayActorName}`
        : `Auto Play ${autoPlayLiveSeconds}s · ${autoPlayActorName}`))
    : null;

  const dominoEndgameSummary: DominoEndgameSummary = {
    isFinished: challenge.gameType === "domino" && gameSession?.status === "finished",
    isDraw: gameSession?.winReason === "draw" || gameSession?.winReason === "draw_agreement",
    reason: gameSession?.winReason,
    winnerLabel: gameSession?.winnerId ? (dominoPlayerLabels.get(gameSession.winnerId) || gameSession.winnerId) : undefined,
  };

  const dominoResyncing = challenge.gameType === "domino"
    && gameSession?.status === "playing"
    && !dominoBoardState;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-col lg:flex-row min-h-screen">
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-card">
            <div className="flex items-center gap-3">
              <BackButton />
              <Badge variant="outline" className="gap-1">
                <Eye className="h-3 w-3" />
                {language === "ar" ? "مشاهدة" : "Watching"}
              </Badge>
              <div className="flex items-center gap-2">
                <GameIcon className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  {language === "ar" ? gameInfo.nameAr : gameInfo.nameEn}
                </span>
              </div>
              <Badge variant="secondary">
                {isProjectChallengeCurrency ? (
                  <ProjectCurrencyAmount amount={challenge.betAmount} symbolClassName="text-xs" amountClassName="text-xs font-medium" />
                ) : (
                  `$${parseFloat(challenge.betAmount).toFixed(2)}`
                )}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <ShareMatchButton challengeId={challengeId!} gameType={challenge.gameType} />

              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span className="text-sm">{gameSession?.spectatorCount || 0}</span>
              </div>
            </div>
          </header>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 pb-28 lg:pb-6 flex flex-col items-center">
                <div className={playerInfoWidthClass}>
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={challenge.player1?.avatarUrl} />
                        <AvatarFallback>{challenge.player1?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{challenge.player1?.username || "Player 1"}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {challenge.gameType === "chess"
                              ? "⚪ White"
                              : challenge.gameType === "backgammon"
                                ? (language === "ar" ? "⚪ أبيض" : "⚪ White")
                                : (language === "ar" ? "المقعد 1" : "Seat 1")}
                          </p>
                          {oddsData?.player1 && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                              x{oddsData.player1.odds.toFixed(2)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {challenge.gameType === "domino" ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1">
                        <span className="text-xs text-muted-foreground">{t("domino.score")}</span>
                        <span className="font-mono text-base font-semibold">{dominoPlayer1Score}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className={`font-mono text-lg ${(gameSession?.player1TimeRemaining || 0) < 30 ? "text-destructive" : ""}`}>
                          {formatTime(gameSession?.player1TimeRemaining || challenge.timeLimit)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {challenge.gameType === "domino" && dominoAutoPlayBadgeText && (
                  <div className={cn(playerInfoWidthClass, "mt-3 mb-0 flex justify-center")}>
                    <Badge variant="outline" className="rounded-full border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                      <Timer className="me-1 h-3.5 w-3.5" />
                      <span className="font-mono tabular-nums">{dominoAutoPlayBadgeText}</span>
                    </Badge>
                  </div>
                )}

                {autoPlayNotice && (
                  <div className={cn(boardWidthClass, "mb-3")}>
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-amber-950 shadow-sm dark:text-amber-100">
                      <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
                        <Timer className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{autoPlayTitle}</p>
                          <Badge variant="secondary" className="rounded-full bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-200">
                            {autoPlayNotice.mode === "autoplay" ? "Auto Play" : (language === "ar" ? "مهلة عودة" : "Reconnect")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/85">
                          {autoPlayDescription}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full text-amber-700 hover:bg-amber-500/10 dark:text-amber-200"
                        onClick={() => setAutoPlayNotice(null)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">{language === "ar" ? "إغلاق" : "Dismiss"}</span>
                      </Button>
                    </div>
                  </div>
                )}

                <div className={cn("relative", boardWidthClass)}>
                  {receivedGifts.map((gift) => (
                    <div
                      key={gift.id}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 animate-bounce"
                    >
                      <div className="bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg shadow-lg">
                        {gift.giftName} from {gift.senderName}
                      </div>
                    </div>
                  ))}

                  {challenge.gameType === "chess" && (
                    <ChessBoard
                      gameState={(playerView?.fen as string) || gameSession?.gameState}
                      currentTurn={gameSession?.currentTurn || undefined}
                      myColor="white"
                      isMyTurn={false}
                      isSpectator={true}
                      onMove={() => { }}
                      status={gameSession?.status}
                    />
                  )}

                  {challenge.gameType === "domino" && (
                    <DominoChallengeContainer
                      boardState={dominoBoardState}
                      currentTurn={gameSession?.currentTurn || undefined}
                      isMyTurn={false}
                      isSpectator={true}
                      onMove={() => { }}
                      status={gameSession?.status}
                      turnTimeLimitSeconds={30}
                      turnStartedAtMs={dominoTurnStartedAtMs}
                      dominoResyncing={Boolean(dominoResyncing)}
                      dominoMoveError={null}
                      timeline={dominoTimeline}
                      scoreRows={dominoScoreRows}
                      endgameSummary={dominoEndgameSummary}
                    />
                  )}

                  {challenge.gameType === "backgammon" && playerView && (
                    <BackgammonBoard
                      board={(playerView.board as number[]) || []}
                      bar={(playerView.bar as { white: number; black: number }) || { white: 0, black: 0 }}
                      borneOff={(playerView.borneOff as { white: number; black: number }) || { white: 0, black: 0 }}
                      dice={(playerView.dice as number[]) || []}
                      diceUsed={(playerView.diceUsed as boolean[]) || []}
                      currentTurn={(playerView.currentTurn as "white" | "black") || "white"}
                      playerColor={(playerView.myColor as "white" | "black" | "spectator") || "spectator"}
                      validMoves={(playerView.validMoves as { type: string; from: string; to: string }[]) || []}
                      mustRoll={(playerView.mustRoll as boolean) || false}
                      onMove={() => { }}
                      onRoll={() => { }}
                      onDouble={() => { }}
                      onAcceptDouble={() => { }}
                      onDeclineDouble={() => { }}
                      doublingCube={(playerView.doublingCube as number) ?? 1}
                      cubeOwner={(playerView.cubeOwner as "white" | "black" | null) ?? null}
                      cubeOffered={(playerView.cubeOffered as boolean) ?? false}
                      cubeOfferedBy={(playerView.cubeOfferedBy as "white" | "black" | null) ?? null}
                      disabled={true}
                    />
                  )}

                  {challenge.gameType === "tarneeb" && (
                    <TarneebBoard
                      sessionId={gameSession?.id || ""}
                      gameState={playerView as TarneebState | null}
                      playerId="spectator"
                      playerPosition={0}
                      playerNames={balootPlayerNames}
                      onPlayCard={() => { }}
                      onBid={() => { }}
                      onPass={() => { }}
                      onSetTrump={() => { }}
                      turnTimeLimitSeconds={30}
                      turnStartedAtMs={tarneebTurnStartedAtMs}
                    />
                  )}

                  {challenge.gameType === "baloot" && (
                    <BalootBoard
                      gameState={playerView as BalootState | null}
                      playerId="spectator"
                      playerPosition={0}
                      onPlayCard={() => { }}
                      onChooseTrump={() => { }}
                      onPass={() => { }}
                      playerNames={balootPlayerNames}
                      turnTimeLimitSeconds={30}
                      turnStartedAtMs={balootTurnStartedAtMs}
                    />
                  )}

                  {(challenge.gameType === "backgammon" || challenge.gameType === "tarneeb" || challenge.gameType === "baloot") && !playerView && (
                    <div className="w-full max-w-lg rounded-lg border bg-card p-6 text-center text-muted-foreground">
                      {language === "ar" ? "جاري مزامنة حالة المباراة..." : "Synchronizing live game state..."}
                    </div>
                  )}
                </div>

                <div className={cn(playerInfoWidthClass, "mt-4 mb-0")}>
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={challenge.player2?.avatarUrl} />
                        <AvatarFallback>{challenge.player2?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{challenge.player2?.username || "Waiting..."}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {challenge.gameType === "chess"
                              ? "⚫ Black"
                              : challenge.gameType === "backgammon"
                                ? (language === "ar" ? "⚫ أسود" : "⚫ Black")
                                : (language === "ar" ? "المقعد 2" : "Seat 2")}
                          </p>
                          {oddsData?.player2 && challenge.player2 && (
                            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                              x{oddsData.player2.odds.toFixed(2)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {challenge.gameType === "domino" ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1">
                        <span className="text-xs text-muted-foreground">{t("domino.score")}</span>
                        <span className="font-mono text-base font-semibold">{dominoPlayer2Score}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className={`font-mono text-lg ${(gameSession?.player2TimeRemaining || 0) < 30 ? "text-destructive" : ""}`}>
                          {formatTime(gameSession?.player2TimeRemaining || challenge.timeLimit)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {!user && (
                  <div className="mt-4">
                    <Button onClick={() => setLocation("/")}>
                      {language === "ar" ? "سجل دخول للمشاركة" : "Login to participate"}
                    </Button>
                  </div>
                )}

                {user && challenge.player2 && gameSession?.status === "playing" && !isTeamGame && (
                  <div ref={supportSectionRef} className="w-full max-w-lg mt-6">
                    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <TrendingUp className="h-5 w-5 text-primary" />
                          <span>{language === "ar" ? "ادعم واربح" : "Support & Win"}</span>
                          <Star className="h-4 w-4 text-yellow-500" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setSelectedPlayer(challenge.player1Id)}
                            className={`p-3 rounded-lg border-2 transition-all ${selectedPlayer === challenge.player1Id
                              ? "border-green-500 bg-green-500/10"
                              : "border-transparent bg-card hover:bg-accent"
                              }`}
                            data-testid="support-player1-card"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={challenge.player1?.avatarUrl} />
                                <AvatarFallback>{challenge.player1?.username?.[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <p className="font-medium text-sm truncate w-full text-center">
                                {challenge.player1?.username}
                              </p>
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                x{supportMode === "instant" ? (parseFloat(oddsData?.instantMatchOdds || "1.50")).toFixed(2) : (oddsData?.player1?.odds?.toFixed(2) || "1.50")}
                              </Badge>
                              <Button
                                size="sm"
                                variant={selectedPlayer === challenge.player1Id ? "default" : "outline"}
                                className="w-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPlayer(challenge.player1Id);
                                }}
                                data-testid="button-support-player1"
                              >
                                {language === "ar" ? "ادعم" : "Support"}
                              </Button>
                            </div>
                          </button>

                          <button
                            onClick={() => setSelectedPlayer(challenge.player2Id!)}
                            className={`p-3 rounded-lg border-2 transition-all ${selectedPlayer === challenge.player2Id
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-transparent bg-card hover:bg-accent"
                              }`}
                            data-testid="support-player2-card"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={challenge.player2?.avatarUrl} />
                                <AvatarFallback>{challenge.player2?.username?.[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <p className="font-medium text-sm truncate w-full text-center">
                                {challenge.player2?.username}
                              </p>
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                x{supportMode === "instant" ? (parseFloat(oddsData?.instantMatchOdds || "1.50")).toFixed(2) : (oddsData?.player2?.odds?.toFixed(2) || "1.50")}
                              </Badge>
                              <Button
                                size="sm"
                                variant={selectedPlayer === challenge.player2Id ? "default" : "outline"}
                                className="w-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPlayer(challenge.player2Id!);
                                }}
                                data-testid="button-support-player2"
                              >
                                {language === "ar" ? "ادعم" : "Support"}
                              </Button>
                            </div>
                          </button>
                        </div>

                        {selectedPlayer && (
                          <div className="space-y-4 pt-3 border-t">
                            <Tabs value={supportMode} onValueChange={(v) => setSupportMode(v as "instant" | "wait_for_match")}>
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="instant" className="gap-2" data-testid="tab-instant">
                                  <Zap className="h-4 w-4" />
                                  {language === "ar" ? "فوري" : "Instant"}
                                </TabsTrigger>
                                <TabsTrigger value="wait_for_match" className="gap-2" data-testid="tab-wait">
                                  <Timer className="h-4 w-4" />
                                  {language === "ar" ? "انتظر مقابل" : "Wait for Match"}
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent value="instant" className="mt-3">
                                <p className="text-xs text-muted-foreground">
                                  {language === "ar"
                                    ? "معدل ربح ثابت x" + (parseFloat(oddsData?.instantMatchOdds || "1.50")).toFixed(2) + " - نتيجة فورية!"
                                    : "Fixed rate x" + (parseFloat(oddsData?.instantMatchOdds || "1.50")).toFixed(2) + " - instant result!"}
                                </p>
                              </TabsContent>
                              <TabsContent value="wait_for_match" className="mt-3">
                                <p className="text-xs text-muted-foreground">
                                  {language === "ar"
                                    ? "معدل ربح ديناميكي حسب أداء اللاعب - انتظر نهاية المباراة"
                                    : "Dynamic rate based on player performance - wait for match end"}
                                </p>
                              </TabsContent>
                            </Tabs>

                            <div>
                              <label className="text-sm font-medium mb-2 block">
                                {language === "ar"
                                  ? `مبلغ الدعم (${isProjectChallengeCurrency ? "عملة المشروع" : "USD"})`
                                  : `Support Amount (${isProjectChallengeCurrency ? "Project Currency" : "USD"})`}
                              </label>
                              <Input
                                type="number"
                                min={oddsData?.minSupportAmount || 1}
                                max={oddsData?.maxSupportAmount || 1000}
                                step="0.01"
                                value={supportAmount}
                                onChange={(e) => setSupportAmount(e.target.value)}
                                placeholder={`${oddsData?.minSupportAmount || 1} - ${oddsData?.maxSupportAmount || 1000}`}
                                className="text-lg"
                                data-testid="input-support-amount"
                              />
                              <div className="flex gap-2 mt-2">
                                {[5, 10, 25, 50, 100].map((amount) => (
                                  <Button
                                    key={amount}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSupportAmount(String(amount))}
                                    data-testid={`quick-amount-${amount}`}
                                  >
                                    {isProjectChallengeCurrency ? (
                                      <ProjectCurrencyAmount amount={amount} symbolClassName="text-xs" amountClassName="text-xs" fractionDigits={0} />
                                    ) : (
                                      `$${amount}`
                                    )}
                                  </Button>
                                ))}
                              </div>
                            </div>

                            {supportAmount && parseFloat(supportAmount) > 0 && (
                              <div className="p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">
                                    {language === "ar" ? "الربح المحتمل:" : "Potential Winnings:"}
                                  </span>
                                  <span className="text-xl font-bold text-green-500">
                                    {formatChallengeAmountText(calculatePotentialWinnings())}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatChallengeAmountText(parseFloat(supportAmount))} × {getPlayerOdds(selectedPlayer).toFixed(2)} = {formatChallengeAmountText(calculatePotentialWinnings())}
                                </p>
                              </div>
                            )}

                            {oddsData && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Info className="h-3 w-3" />
                                <span>
                                  {language === "ar"
                                    ? `رسوم المنصة: ${oddsData.houseFeePercent}% • الحد الأدنى: ${formatChallengeAmountText(oddsData.minSupportAmount)} • الحد الأقصى: ${formatChallengeAmountText(oddsData.maxSupportAmount)}`
                                    : `House fee: ${oddsData.houseFeePercent}% • Min: ${formatChallengeAmountText(oddsData.minSupportAmount)} • Max: ${formatChallengeAmountText(oddsData.maxSupportAmount)}`}
                                </span>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  setSelectedPlayer(null);
                                  setSupportAmount("");
                                }}
                                data-testid="button-cancel-support"
                              >
                                {language === "ar" ? "إلغاء" : "Cancel"}
                              </Button>
                              <Button
                                className="flex-1 gap-2"
                                onClick={handleAddSupport}
                                disabled={!supportAmount || parseFloat(supportAmount) <= 0 || addSupportMutation.isPending}
                                data-testid="button-add-support"
                              >
                                {addSupportMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <TrendingUp className="h-4 w-4" />
                                )}
                                {language === "ar" ? "أضف الدعم" : "Add Support"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {supports && supports.length > 0 && (
                  <Card className="w-full max-w-lg mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" />
                        <span>{language === "ar" ? "الدعم الحالي" : "Current Supports"}</span>
                        <Badge variant="secondary" className="ms-auto">{supports.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {supports.map((support) => (
                          <div
                            key={support.id}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                            data-testid={`support-entry-${support.id}`}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={support.supporterAvatar} />
                                <AvatarFallback className="text-xs">{support.supporterName?.[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{support.supporterName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {language === "ar" ? "يدعم" : "supports"} {support.playerName}
                                </p>
                              </div>
                            </div>
                            <div className="text-end">
                              <p className="text-sm font-bold text-primary">{formatChallengeAmountText(support.amount)}</p>
                              <p className="text-xs text-green-500">
                                → {formatChallengeAmountText(support.potentialWinnings)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>

            <div className="w-full border-s border-border/60 bg-gradient-to-b from-card via-card to-muted/10 lg:w-80">
              <SpectatorPanel
                challengeId={challengeId!}
                player1={challenge.player1}
                player2={challenge.player2}
                spectatorCount={gameSession?.spectatorCount || 0}
                totalMoves={gameSession?.totalMoves}
                currentTurn={gameSession?.currentTurn || undefined}
                gameStatus={gameSession?.status}
                panelMode="spectator"
                chatMessages={liveChatMessages}
                supportCount={supportAggregate.count}
                supportTotalText={formatChallengeAmountText(supportAggregate.totalAmount)}
                giftCount={giftAggregate.count}
                giftTotalText={`${giftAggregate.totalValue.toFixed(2)} VXC`}
                onSendGift={handleSendGift}
                onSendChat={sendLiveChatMessage}
                canSendChat={Boolean(user)}
              />
            </div>
          </div>
        </div>
      </div>

      <FloatingGiftsOverlay
        gifts={receivedGifts.map(g => ({ id: g.id, giftId: g.giftId || 'heart', senderName: g.senderName }))}
      />

      <div className="pointer-events-none fixed inset-y-0 start-0 end-0 z-40 flex items-center justify-between px-2 lg:hidden">
        <div className="pointer-events-auto flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => setShowMobileChat(true)}
            className="relative h-11 w-11 rounded-full border-primary/35 bg-background/90 p-0 shadow-2xl backdrop-blur-md"
            data-testid="button-mobile-open-chat"
            title={language === "ar" ? "الدردشة المباشرة" : "Live Chat"}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="sr-only">{language === "ar" ? "الدردشة" : "Chat"}</span>
            {liveChatMessages.length > 0 && (
              <span className="absolute -end-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                {liveChatMessages.length > 99 ? "99+" : liveChatMessages.length}
              </span>
            )}
          </Button>
        </div>

        {user && (
          <div className="pointer-events-auto flex flex-col gap-2">
            <Button
              onClick={openGiftPanel}
              className="h-11 w-11 rounded-full p-0 shadow-2xl"
              data-testid="fab-gift"
              title={language === "ar" ? "إرسال هدية" : "Send Gift"}
            >
              <Gift className="h-5 w-5" />
              <span className="sr-only">{language === "ar" ? "هدية" : "Gift"}</span>
            </Button>
            <Button
              variant="outline"
              onClick={jumpToSupportSection}
              disabled={supportActionsDisabled}
              className="h-11 w-11 rounded-full border-primary/35 bg-background/90 p-0 shadow-2xl backdrop-blur-md"
              data-testid="button-mobile-jump-support"
              title={language === "ar" ? "ادعم" : "Support"}
            >
              <TrendingUp className="h-5 w-5" />
              <span className="sr-only">{language === "ar" ? "ادعم" : "Support"}</span>
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showMobileChat} onOpenChange={setShowMobileChat}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md lg:hidden">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-primary" />
              {language === "ar" ? "الدردشة المباشرة للمباراة" : "Live Match Chat"}
              <Badge variant="secondary" className="ms-auto">{liveChatMessages.length}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto px-4 py-3">
            {liveChatMessages.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                {language === "ar" ? "لا توجد رسائل بعد — ستظهر رسائل الدردشة هنا لكل المشاهدين." : "No messages yet — live chat will appear here for all spectators."}
              </div>
            ) : (
              <div className="space-y-2">
                {liveChatMessages.map((msg) => (
                  <div key={msg.id} className="rounded-xl border bg-card/70 px-3 py-2 shadow-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{msg.username}</span>
                      <span className="text-[10px] text-muted-foreground">{formatChatTimestamp(msg.timestamp)}</span>
                    </div>
                    <p className="text-sm leading-6 break-words">{msg.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t px-4 py-3">
            {user ? (
              <div className="flex gap-2">
                <Input
                  value={mobileChatInput}
                  onChange={(e) => setMobileChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendLiveChatMessage(mobileChatInput);
                    }
                  }}
                  placeholder={language === "ar" ? "اكتب رسالة للمشاهدين..." : "Write a message to the viewers..."}
                  maxLength={300}
                />
                <Button onClick={() => sendLiveChatMessage(mobileChatInput)} disabled={!mobileChatInput.trim()}>
                  {language === "ar" ? "إرسال" : "Send"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {language === "ar" ? "سجّل الدخول للمشاركة في الدردشة المباشرة." : "Sign in to participate in the live chat."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FullScreenGiftPanel
        open={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        onSendGift={handleSendGift}
        player1Id={challenge?.player1Id}
        player2Id={challenge?.player2Id}
        player1Name={challenge?.player1?.username}
        player2Name={challenge?.player2?.username}
        player1Avatar={challenge?.player1?.avatarUrl}
        player2Avatar={challenge?.player2?.avatarUrl}
        disabled={!user}
      />

      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              {language === "ar" ? "تحويل سريع لإرسال الهدية" : "Quick Conversion To Send Gift"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar"
                ? (
                  <span className="inline-flex items-center gap-1">
                    <span>المطلوب للهدية:</span>
                    <ProjectCurrencyAmount amount={fundingShortageProject} symbolClassName="text-sm" />
                  </span>
                )
                : (
                  <span className="inline-flex items-center gap-1">
                    <span>Required for gift:</span>
                    <ProjectCurrencyAmount amount={fundingShortageProject} symbolClassName="text-sm" />
                  </span>
                )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                {language === "ar"
                  ? `الرصيد الحالي بالدولار: $${Number(user?.balance || 0).toFixed(2)}`
                  : `Current USD balance: $${Number(user?.balance || 0).toFixed(2)}`}
              </p>
              <p className="text-muted-foreground">
                {language === "ar"
                  ? `المبلغ المقترح للتحويل: $${fundingUsdNeeded.toFixed(2)}`
                  : `Estimated USD needed to convert: $${fundingUsdNeeded.toFixed(2)}`}
              </p>
            </div>

            <div>
              <Label>{language === "ar" ? "مبلغ التحويل (USD)" : "Conversion Amount (USD)"}</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={quickConvertAmount}
                  onChange={(e) => setQuickConvertAmount(e.target.value)}
                  data-testid="input-watch-popup-convert-amount"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuickConvertAmount(String(Math.max(Number(projectCurrencySettings?.minConversionAmount || 1), Number(fundingUsdNeeded.toFixed(2) || 0))))}
                >
                  {language === "ar" ? "اقتراح" : "Suggest"}
                </Button>
              </div>
            </div>

            {quickConvertAmountValue > Number(user?.balance || 0) && (
              <p className="text-xs text-destructive">
                {language === "ar" ? "الرصيد بالدولار غير كافٍ، قم بالإيداع أولًا." : "Insufficient USD balance, deposit first."}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowConvertDialog(false);
                setShowDepositDialog(true);
              }}
            >
              {language === "ar" ? "فتح نافذة الإيداع" : "Open Deposit Popup"}
            </Button>
            <Button
              onClick={() => quickConvertMutation.mutate(quickConvertAmount)}
              disabled={quickConvertDisabled}
              data-testid="button-watch-popup-quick-convert"
            >
              {quickConvertMutation.isPending ? t("common.loading") : (language === "ar" ? "تحويل الآن" : "Convert Now")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDepositDialog} onOpenChange={setShowDepositDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "الرصيد غير كافٍ" : "Insufficient Balance"}</DialogTitle>
            <DialogDescription>
              {language === "ar"
                ? "لا يوجد رصيد كافٍ للتحويل المطلوب لإرسال الهدية. يمكنك فتح نافذة الإيداع مباشرة."
                : "You do not have enough balance to convert for this gift. Open deposit popup directly."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <p>
              {language === "ar"
                ? `الرصيد الحالي بالدولار: $${Number(user?.balance || 0).toFixed(2)}`
                : `Current USD balance: $${Number(user?.balance || 0).toFixed(2)}`}
            </p>
            <p className="text-muted-foreground">
              {language === "ar"
                ? `الحد الأدنى المقترح للإيداع: $${Math.max(1, Number(fundingUsdNeeded.toFixed(2) || 0)).toFixed(2)}`
                : `Suggested minimum deposit: $${Math.max(1, Number(fundingUsdNeeded.toFixed(2) || 0)).toFixed(2)}`}
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:gap-2">
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDepositDialog(false);
                  setLocation("/p2p");
                }}
                disabled={!hasActivePaymentMethod}
                data-testid="button-watch-open-p2p-market"
                className="w-full"
              >
                {t("nav.p2p")}
              </Button>
              <Button
                onClick={() => {
                  const suggestedDeposit = Math.max(1, Number(fundingUsdNeeded.toFixed(2) || 0));
                  setShowDepositDialog(false);
                  setLocation(`/wallet?modal=deposit&amount=${suggestedDeposit.toFixed(2)}`);
                }}
                data-testid="button-watch-open-wallet-deposit"
                className="w-full"
              >
                {language === "ar" ? "فتح كارت الإيداع" : "Open Deposit Card"}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setShowDepositDialog(false)} className="w-full">
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {gameSession?.status === "finished" && (
        <Dialog open={true}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-center">
                <div className="flex flex-col items-center gap-2">
                  <Trophy className="h-12 w-12 text-yellow-500" />
                  <span className="text-2xl">
                    {language === "ar" ? "انتهت المباراة!" : "Match Ended!"}
                  </span>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">
                {language === "ar" ? "الفائز:" : "Winner:"}{" "}
                {resolveWinnerName(gameSession.winnerId)}
              </p>
              <p className="mt-2">
                {gameSession.winReason === "checkmate" && (language === "ar" ? "كش مات!" : "Checkmate!")}
                {gameSession.winReason === "timeout" && (language === "ar" ? "انتهى الوقت" : "Time out")}
                {gameSession.winReason === "resignation" && (language === "ar" ? "استسلام" : "Resignation")}
                {gameSession.winReason === "domino_blocked" && (language === "ar" ? "اللعبة محظورة" : "Game blocked")}
                {gameSession.winReason === "gammon" && (language === "ar" ? "غامون!" : "Gammon!")}
                {gameSession.winReason === "backgammon" && (language === "ar" ? "باكغامون!" : "Backgammon!")}
                {gameSession.winReason === "double_declined" && (language === "ar" ? "رفض المضاعفة" : "Double declined")}
                {gameSession.winReason === "target_reached" && (language === "ar" ? "وصل للهدف" : "Target score reached")}
                {gameSession.winReason === "draw_agreement" && (language === "ar" ? "تعادل بالاتفاق" : "Draw by agreement")}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setLocation("/challenges")}>
                {language === "ar" ? "العودة للتحديات" : "Back to Challenges"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
