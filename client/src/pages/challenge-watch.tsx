import { useState, useEffect, useRef, useCallback } from "react";
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
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import { BackButton } from "@/components/BackButton";
import { ChessBoard } from "@/components/games/ChessBoard";
import { DominoBoard } from "@/components/games/DominoBoard";
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
  DollarSign,
  Users,
  Star,
  Gift,
  Info,
  ArrowRightLeft,
} from "lucide-react";

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
}

interface Challenge {
  id: string;
  gameType: string;
  betAmount: string;
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
  [key: string]: unknown;
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
  const [receivedGifts, setReceivedGifts] = useState<WatchGiftInfo[]>([]);

  const [supportAmount, setSupportAmount] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [supportMode, setSupportMode] = useState<"instant" | "wait_for_match">("instant");
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
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

  const quickConvertMutation = useMutation({
    mutationFn: (amount: string) => apiRequest("POST", "/api/project-currency/convert", { amount }),
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
      case "gift_received":
        if (data.gift) {
          const gift = data.gift;
          setReceivedGifts(prev => [...prev, gift]);
          toast({
            title: language === "ar" ? "هدية!" : "Gift!",
            description: `${gift.senderName} sent ${gift.giftName}`,
          });
          setTimeout(() => {
            setReceivedGifts(prev => prev.filter(g => g.id !== gift.id));
          }, 3000);
        }
        break;
      case "game_ended":
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
  ]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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

  const openGiftPanel = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar"
          ? `المبلغ يجب أن يكون بين $${oddsData.minSupportAmount} و $${oddsData.maxSupportAmount}`
          : `Amount must be between $${oddsData.minSupportAmount} and $${oddsData.maxSupportAmount}`,
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
                ${parseFloat(challenge.betAmount).toFixed(2)}
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
              <div className="p-4 pb-24 lg:pb-4 flex flex-col items-center">
                <div className="w-full max-w-lg mb-4">
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
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className={`font-mono text-lg ${(gameSession?.player1TimeRemaining || 0) < 30 ? "text-destructive" : ""}`}>
                        {formatTime(gameSession?.player1TimeRemaining || challenge.timeLimit)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative">
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
                    <DominoBoard
                      gameState={playerView || gameSession?.gameState}
                      currentTurn={gameSession?.currentTurn || undefined}
                      isMyTurn={false}
                      isSpectator={true}
                      onMove={() => { }}
                      status={gameSession?.status}
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
                      onPlayCard={() => { }}
                      onBid={() => { }}
                      onPass={() => { }}
                      onSetTrump={() => { }}
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
                    />
                  )}

                  {(challenge.gameType === "backgammon" || challenge.gameType === "tarneeb" || challenge.gameType === "baloot") && !playerView && (
                    <div className="w-full max-w-lg rounded-lg border bg-card p-6 text-center text-muted-foreground">
                      {language === "ar" ? "جاري مزامنة حالة المباراة..." : "Synchronizing live game state..."}
                    </div>
                  )}
                </div>

                <div className="w-full max-w-lg mt-4">
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
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className={`font-mono text-lg ${(gameSession?.player2TimeRemaining || 0) < 30 ? "text-destructive" : ""}`}>
                        {formatTime(gameSession?.player2TimeRemaining || challenge.timeLimit)}
                      </span>
                    </div>
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
                                {language === "ar" ? "مبلغ الدعم ($)" : "Support Amount ($)"}
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
                                    ${amount}
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
                                    ${calculatePotentialWinnings().toFixed(2)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  ${supportAmount} × {getPlayerOdds(selectedPlayer).toFixed(2)} = ${calculatePotentialWinnings().toFixed(2)}
                                </p>
                              </div>
                            )}

                            {oddsData && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Info className="h-3 w-3" />
                                <span>
                                  {language === "ar"
                                    ? `رسوم المنصة: ${oddsData.houseFeePercent}% • الحد الأدنى: $${oddsData.minSupportAmount} • الحد الأقصى: $${oddsData.maxSupportAmount}`
                                    : `House fee: ${oddsData.houseFeePercent}% • Min: $${oddsData.minSupportAmount} • Max: $${oddsData.maxSupportAmount}`}
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
                                  <DollarSign className="h-4 w-4" />
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
                              <p className="text-sm font-bold text-primary">${parseFloat(support.amount).toFixed(2)}</p>
                              <p className="text-xs text-green-500">
                                → ${parseFloat(support.potentialWinnings).toFixed(2)}
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

            <div className="w-full lg:w-80 border-s flex flex-col bg-card">
              <SpectatorPanel
                challengeId={challengeId!}
                player1={challenge.player1}
                player2={challenge.player2}
                spectatorCount={gameSession?.spectatorCount || 0}
                onSendGift={handleSendGift}
              />
            </div>
          </div>
        </div>
      </div>

      <FloatingGiftsOverlay
        gifts={receivedGifts.map(g => ({ id: g.id, giftId: g.giftId || 'heart', senderName: g.senderName }))}
      />

      {/* Floating Gift FAB */}
      {user && (
        <Button
          onClick={openGiftPanel}
          className="hidden lg:inline-flex fixed bottom-20 start-4 z-30 h-14 w-14 rounded-full shadow-lg shadow-primary/30 p-0"
          data-testid="fab-gift"
        >
          <Gift className="h-6 w-6" />
        </Button>
      )}

      {user && (
        <div className="fixed bottom-4 inset-x-4 z-30 lg:hidden">
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card/95 backdrop-blur-sm p-2 shadow-xl">
            <Button onClick={openGiftPanel} className="gap-2" data-testid="button-mobile-open-gift">
              <Gift className="h-4 w-4" />
              {language === "ar" ? "هدية" : "Gift"}
            </Button>
            <Button
              variant="outline"
              onClick={jumpToSupportSection}
              disabled={!challenge?.player2 || gameSession?.status !== "playing" || isTeamGame}
              className="gap-2"
              data-testid="button-mobile-jump-support"
            >
              <TrendingUp className="h-4 w-4" />
              {language === "ar" ? "ادعم" : "Support"}
            </Button>
          </div>
        </div>
      )}

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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDepositDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const suggestedDeposit = Math.max(1, Number(fundingUsdNeeded.toFixed(2) || 0));
                setShowDepositDialog(false);
                setLocation(`/wallet?modal=deposit&amount=${suggestedDeposit.toFixed(2)}`);
              }}
              data-testid="button-watch-open-wallet-deposit"
            >
              {language === "ar" ? "فتح كارت الإيداع" : "Open Deposit Card"}
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
