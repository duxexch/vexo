import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGameSounds } from "@/hooks/use-game-sounds";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { apiRequestWithPaymentToken } from "@/lib/payment-operation";
import type { CountryPaymentMethod } from "@shared/schema";
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import {
  adaptDominoBoardMoveToEngine,
  extractDominoHandFromPlayerView,
  normalizeDominoChallengePlayerView,
} from "@/lib/domino-challenge-adapter";
import { BackButton } from "@/components/BackButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ChessBoard } from "@/components/games/ChessBoard";
import {
  DominoChallengeContainer,
  type DominoBoardMove,
  type DominoEndgameSummary,
  type DominoScoreRow,
  type DominoTimelineEntry,
} from "@/components/games/DominoChallengeContainer";
import { BackgammonBoard } from "@/components/games/backgammon/BackgammonBoard";
import TarneebBoard from "@/components/games/TarneebBoard";
import type { TarneebState } from "@/components/games/TarneebBoard";
import BalootBoard from "@/components/games/BalootBoard";
import type { BalootState } from "@/components/games/BalootBoard";
import LanguageDuelBoard from "@/components/games/LanguageDuelBoard";
import { GameChat } from "@/components/games/GameChat";
import { VoiceChat } from "@/components/games/VoiceChat";
import { SpectatorPanel } from "@/components/games/SpectatorPanel";
import { DominoSpectatorInsights } from "@/components/games/DominoSpectatorInsights";
import { ShareMatchButton } from "@/components/games/ShareMatchButton";
import { GiftAnimation } from "@/components/games/GiftAnimation";
import { ProjectCurrencyAmount } from "@/components/ProjectCurrencySymbol";
import {
  Crown,
  Target,
  Clock,
  Trophy,
  MessageCircle,
  Mic,
  MicOff,
  Eye,
  Users,
  Gift,
  Star,
  Send,
  ArrowRightLeft,
  Share2,
  Flag,
  X,
  Check,
  Loader2,
  Volume2,
  VolumeX,
  Dice5,
  Spade,
  Heart,
} from "lucide-react";

interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  vipLevel?: number;
  rating?: {
    wins: number;
    losses: number;
    winRate: number;
    rank: string;
  };
}

interface GameSession {
  id: string;
  challengeId: string;
  gameType: "chess" | "domino" | "backgammon" | "tarneeb" | "baloot" | "languageduel";
  currentTurn: string;
  player1TimeRemaining: number;
  player2TimeRemaining: number;
  gameState: string;
  status: "waiting" | "playing" | "paused" | "finished";
  winnerId?: string;
  winReason?: string;
  totalMoves: number;
  spectatorCount: number;
  totalGiftsValue: string;
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

interface GiftInfo {
  id: string;
  senderName: string;
  giftName: string;
  amount?: number;
  senderId?: string;
  recipientId?: string;
  [key: string]: unknown;
}

interface GiftAnimationState {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  giftItem: {
    id: string;
    name: string;
    nameAr?: string;
    icon: string;
    price: string;
  };
  quantity: number;
  message?: string;
}

interface ProjectCurrencySettings {
  isActive: boolean;
  exchangeRate: string;
  conversionCommissionRate: string;
  minConversionAmount: string;
  maxConversionAmount: string;
}

interface ChallengeWSMessage {
  type: string;
  seq?: number;
  role?: "player" | "spectator";
  error?: string;
  errorKey?: string;
  code?: string;
  requiresSync?: boolean;
  session?: GameSession;
  view?: Record<string, unknown>;
  message?: Record<string, unknown>;
  spectator?: { id: string; username: string; avatarUrl?: string };
  spectatorId?: string;
  gift?: GiftInfo;
  winnerId?: string;
  reason?: string;
  isDraw?: boolean;
  scores?: Record<string, number>;
  lowestPips?: number;
  winningTeamPips?: number;
  offeredBy?: string;
  count?: number;
  moveType?: string;
  gameType?: string;
  [key: string]: unknown;
}

interface DominoGameResultMeta {
  winnerId?: string;
  reason?: string;
  isDraw?: boolean;
  scores?: Record<string, number>;
  lowestPips?: number;
  winningTeamPips?: number;
}

interface ChatMsg {
  id?: string;
  userId?: string;
  username: string;
  message: string;
  timestamp: string | number;
}

interface SpectatorInfo {
  id: string;
  username: string;
  avatarUrl?: string;
}

const QUICK_MESSAGES = [
  { key: "good_luck", en: "Good luck!", ar: "حظاً موفقاً!" },
  { key: "nice_move", en: "Nice move!", ar: "حركة رائعة!" },
  { key: "gg", en: "GG!", ar: "لعبة جيدة!" },
  { key: "thanks", en: "Thanks!", ar: "شكراً!" },
  { key: "hurry", en: "Hurry up!", ar: "أسرع!" },
  { key: "rematch", en: "Rematch?", ar: "إعادة المباراة؟" },
  { key: "wow", en: "Wow!", ar: "واو!" },
  { key: "oops", en: "Oops!", ar: "أوبس!" },
  { key: "well_played", en: "Well played!", ar: "أحسنت اللعب!" },
  { key: "thinking", en: "Let me think...", ar: "دقيقة أفكر..." },
];

export default function ChallengeGamePage() {
  const [, params] = useRoute("/challenge/:id/play");
  const [, setLocation] = useLocation();
  const { t, language } = useI18n();
  const { user, token: authToken } = useAuth();
  const { toast } = useToast();
  const challengeId = params?.id;

  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceMicMuted, setIsVoiceMicMuted] = useState(false);
  const { play: playSound, setMuted: setSoundMuted } = useGameSounds();
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [spectators, setSpectators] = useState<SpectatorInfo[]>([]);
  const [receivedGifts, setReceivedGifts] = useState<GiftInfo[]>([]);
  const [activeGiftAnimation, setActiveGiftAnimation] = useState<GiftAnimationState | null>(null);
  const [serverRole, setServerRole] = useState<"player" | "spectator" | null>(null);
  const [playerView, setPlayerView] = useState<Record<string, unknown> | null>(null);
  const [localTimerTick, setLocalTimerTick] = useState(0);
  const [drawOffered, setDrawOffered] = useState<string | null>(null); // offeredBy userId
  const [wsConnState, setWsConnState] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");
  const [showQuickConvertCard, setShowQuickConvertCard] = useState(false);
  const [quickConvertAmount, setQuickConvertAmount] = useState("5");
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [fundingShortageProject, setFundingShortageProject] = useState(0);
  const [fundingUsdNeeded, setFundingUsdNeeded] = useState(0);
  const [dominoMoveError, setDominoMoveError] = useState<string | null>(null);
  const [dominoResyncing, setDominoResyncing] = useState(false);
  const [dominoTimeline, setDominoTimeline] = useState<DominoTimelineEntry[]>([]);
  const [dominoResultMeta, setDominoResultMeta] = useState<DominoGameResultMeta | null>(null);
  const [autoPlayNotice, setAutoPlayNotice] = useState<{
    mode: "grace" | "autoplay";
    username?: string;
    seconds?: number;
    startedAtMs?: number;
  } | null>(null);
  const [voicePeerMutedMap, setVoicePeerMutedMap] = useState<Record<string, boolean>>({});
  const [connectedVoicePeers, setConnectedVoicePeers] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const authReadyRef = useRef(false);
  const pendingJoinRef = useRef(false);
  const roleAssignmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const serverRoleRef = useRef<"player" | "spectator" | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(Date.now());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intentionalCloseRef = useRef(false);
  const wsErrorToastRef = useRef<{ signature: string; at: number }>({ signature: "", at: 0 });
  const latestWsSeqRef = useRef(0);
  const latestTotalMovesRef = useRef(0);
  const latestViewMovesRef = useRef(0);
  const chessMovePendingRef = useRef(false);
  const chessMoveAckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutSignalSentRef = useRef(false);
  const lastGiftAttemptRef = useRef<{ giftId: string; price: number } | null>(null);
  const dominoLastActionSigRef = useRef<string>("");
  const dominoCanPlayRef = useRef(false);
  const dominoStatusRef = useRef<GameSession["status"] | null>(null);

  const { data: challenge, isLoading, isError: isChallengeError, error: challengeError } = useQuery<Challenge, Error>({
    queryKey: [`/api/challenges/${challengeId}`],
    enabled: !!challengeId,
  });

  const { data: currencyPolicy } = useQuery<{ mode: "project_only" | "mixed"; projectOnly: boolean }>({
    queryKey: ["/api/project-currency/play-gift-policy"],
    queryFn: async () => {
      const res = await fetch("/api/project-currency/play-gift-policy");
      if (!res.ok) throw new Error("Failed to fetch currency policy");
      return res.json();
    },
  });

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

  const { data: supports = [] } = useQuery<Array<{ playerId: string; amount: string }>>({
    queryKey: [`/api/challenges/${challengeId}/supports`],
    enabled: !!challengeId,
  });

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
      setShowQuickConvertCard(false);
      setShowConvertDialog(false);
      setShowDepositDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch dynamic commission/surrender settings for this game type
  const { data: challengeConfig } = useQuery<{
    commissionPercent: string;
    surrenderWinnerPercent: string;
    surrenderLoserRefundPercent: string;
    withdrawPenaltyPercent: string;
  }>({
    queryKey: [`/api/challenge-config/${challenge?.gameType || ""}`],
    enabled: !!challenge?.gameType,
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

  const getDominoMoveErrorText = useCallback((errorText: string, errorKey?: string): string => {
    if (errorKey && errorKey.startsWith("domino.")) {
      return t(errorKey);
    }

    const normalized = String(errorText || "").toLowerCase();
    if (normalized.includes("not your turn")) return t("domino.notYourTurn");
    if (normalized.includes("cannot pass")) return t("domino.cannotPass");
    if (normalized.includes("must draw")) return t("domino.mustDraw");
    if (normalized.includes("cannot draw")) return t("domino.cannotDraw");
    if (normalized.includes("boneyard is empty")) return t("domino.boneyardEmpty");
    if (normalized.includes("tile not in your hand")) return t("domino.tileNotInHand");
    if (normalized.includes("maximum draws reached")) return t("domino.maxDrawsReached");
    if (normalized.includes("cannot play this tile on this end") || normalized.includes("invalid placement")) {
      return t("domino.invalidPlacement");
    }
    if (normalized.includes("invalid game state") || normalized.includes("corrupted game state")) {
      return t("domino.invalidState");
    }
    if (normalized.includes("invalid")) return t("domino.invalidMoveType");
    return errorText;
  }, [t]);

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
    setShowQuickConvertCard(false);
    setShowConvertDialog(false);
    setShowDepositDialog(false);

    if (!projectCurrencySettings?.isActive || userUsdBalance < suggestedConvert) {
      setShowDepositDialog(true);
      return;
    }

    setShowConvertDialog(true);
  }, [estimateUsdForProjectCurrency, projectCurrencySettings?.isActive, projectCurrencySettings?.minConversionAmount, projectCurrencySettings?.maxConversionAmount, user?.balance]);

  const toFiniteNumber = useCallback((value: unknown): number | null => {
    const num = typeof value === "string" ? Number(value) : (typeof value === "number" ? value : Number.NaN);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }, []);

  const isPlayer = serverRole === "player";
  const isSpectator = serverRole === "spectator";
  const isChallengeParticipant = Boolean(
    user?.id
    && [challenge?.player1Id, challenge?.player2Id, challenge?.player3Id, challenge?.player4Id]
      .filter(Boolean)
      .includes(user.id)
  );
  // Do not allow gameplay actions until the server explicitly assigns role.
  const canPlayActions = serverRole === "player";
  const myColor = challenge?.player1Id === user?.id ? "white" : "black";

  const dominoPlayerLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const addPlayerLabel = (id?: string, username?: string, seat?: number) => {
      if (!id) return;
      if (id === user?.id) {
        labels.set(id, t("domino.you"));
        return;
      }

      if (username) {
        labels.set(id, username);
        return;
      }

      if (typeof seat === "number") {
        labels.set(id, `${t("domino.player")} ${seat}`);
        return;
      }

      labels.set(id, t("domino.player"));
    };

    addPlayerLabel(challenge?.player1Id, challenge?.player1?.username, 1);
    addPlayerLabel(challenge?.player2Id, challenge?.player2?.username, 2);
    addPlayerLabel(challenge?.player3Id, challenge?.player3?.username, 3);
    addPlayerLabel(challenge?.player4Id, challenge?.player4?.username, 4);

    return labels;
  }, [challenge?.player1Id, challenge?.player1?.username, challenge?.player2Id, challenge?.player2?.username, challenge?.player3Id, challenge?.player3?.username, challenge?.player4Id, challenge?.player4?.username, t, user?.id]);

  const appendDominoTimeline = useCallback((view: Record<string, unknown> | undefined, moveNumber?: number) => {
    if (challenge?.gameType !== "domino" || !view) {
      return;
    }

    const actionRaw = view.lastAction;
    if (!actionRaw || typeof actionRaw !== "object") {
      return;
    }

    const action = actionRaw as Record<string, unknown>;
    const actionType = typeof action.type === "string" ? action.type : "";
    const playerId = typeof action.playerId === "string" ? action.playerId : "";
    const tile = action.tile && typeof action.tile === "object"
      ? action.tile as { left?: number; right?: number }
      : undefined;

    if (!actionType || !playerId) {
      return;
    }

    const signature = `${actionType}:${playerId}:${typeof tile?.left === "number" ? tile.left : ""}:${typeof tile?.right === "number" ? tile.right : ""}:${typeof moveNumber === "number" ? moveNumber : ""}`;
    if (signature === dominoLastActionSigRef.current) {
      return;
    }
    dominoLastActionSigRef.current = signature;

    const actor = dominoPlayerLabels.get(playerId) || t("domino.player");
    let text = `${actor} ${t("domino.lastMove")}`;

    if (actionType === "draw") {
      text = `${actor} ${t("domino.drewTile")}`;
    } else if (actionType === "pass") {
      text = `${actor} ${t("domino.passedTurn")}`;
    } else if (actionType === "play") {
      if (typeof tile?.left === "number" && typeof tile?.right === "number") {
        text = `${actor} ${t("domino.played")} [${tile.left}|${tile.right}]`;
      } else {
        text = `${actor} ${t("domino.played")}`;
      }
    }

    setDominoTimeline((prev) => [
      {
        id: `${signature}-${Date.now()}`,
        text,
        moveNumber,
      },
      ...prev,
    ].slice(0, 12));
  }, [challenge?.gameType, dominoPlayerLabels, t]);

  useEffect(() => {
    dominoCanPlayRef.current = canPlayActions;
    dominoStatusRef.current = gameSession?.status ?? null;
  }, [canPlayActions, gameSession?.status]);

  const showSpectatorActionBlocked = useCallback(() => {
    toast({
      title: language === "ar" ? "وضع المشاهدة" : "Spectator mode",
      description: language === "ar"
        ? "هذا الإجراء متاح للاعبين فقط."
        : "This action is available to players only.",
      variant: "destructive",
    });
  }, [toast, language]);

  const showWsErrorToast = useCallback((message: string, code?: string) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;

    const signature = `${code || "unknown"}:${normalizedMessage}`;
    const now = Date.now();
    const isDuplicate = wsErrorToastRef.current.signature === signature
      && (now - wsErrorToastRef.current.at) < 2000;

    if (isDuplicate) return;

    wsErrorToastRef.current = { signature, at: now };
    toast({
      title: t("common.error"),
      description: normalizedMessage,
      variant: "destructive",
    });
  }, [t, toast]);

  useEffect(() => {
    latestWsSeqRef.current = 0;
    latestTotalMovesRef.current = 0;
    latestViewMovesRef.current = 0;
    dominoLastActionSigRef.current = "";
    setGameSession(null);
    setPlayerView(null);
    setServerRole(null);
    setDominoTimeline([]);
    setDominoResultMeta(null);
    setDominoMoveError(null);
  }, [challengeId]);

  const clearRoleAssignmentTimer = useCallback(() => {
    if (roleAssignmentTimerRef.current) {
      clearTimeout(roleAssignmentTimerRef.current);
      roleAssignmentTimerRef.current = null;
    }
  }, []);

  const clearChessMovePending = useCallback(() => {
    chessMovePendingRef.current = false;
    if (chessMoveAckTimerRef.current) {
      clearTimeout(chessMoveAckTimerRef.current);
      chessMoveAckTimerRef.current = null;
    }
  }, []);

  const requestRoleAssignment = useCallback((socket: WebSocket) => {
    if (!challengeId || socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({
      type: "join_challenge_game",
      challengeId,
    }));
    pendingJoinRef.current = false;

    clearRoleAssignmentTimer();
    roleAssignmentTimerRef.current = setTimeout(() => {
      if (serverRoleRef.current === null && authReadyRef.current && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "join_challenge_game",
          challengeId,
        }));
      }
    }, 2500);
  }, [challengeId, clearRoleAssignmentTimer]);

  useEffect(() => {
    serverRoleRef.current = serverRole;
    if (serverRole) {
      clearRoleAssignmentTimer();
    }
  }, [serverRole, clearRoleAssignmentTimer]);

  useEffect(() => {
    if (!challengeId || !user) return;

    const connect = () => {
      const existingSocket = wsRef.current;
      if (existingSocket && (
        existingSocket.readyState === WebSocket.OPEN
        || existingSocket.readyState === WebSocket.CONNECTING
      )) {
        return;
      }

      const token = authToken || localStorage.getItem("pwm_token") || sessionStorage.getItem("pwm_token_backup");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setWsConnState("connected");
        reconnectAttemptRef.current = 0;
        authReadyRef.current = false;
        pendingJoinRef.current = true;
        setServerRole(null);
        clearRoleAssignmentTimer();
        ws.send(JSON.stringify({ type: "auth", token }));
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const data = JSON.parse(event.data) as ChallengeWSMessage;

          if (data.type === "auth_success") {
            authReadyRef.current = true;
            if (pendingJoinRef.current) {
              requestRoleAssignment(ws);
            }
            return;
          }

          if (data.type === "auth_error") {
            const description = typeof data.error === "string"
              ? data.error
              : (language === "ar" ? "فشل توثيق الجلسة" : "Session authentication failed");
            showWsErrorToast(description, "auth_error");
            authReadyRef.current = false;
            pendingJoinRef.current = true;
            setServerRole(null);

            if (token) {
              setWsConnState("reconnecting");
              if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
              }
              return;
            }

            setWsConnState("disconnected");
            setTimeout(() => setLocation("/login"), 500);
            return;
          }

          if (data.type === "challenge_error" && authReadyRef.current) {
            const code = typeof data.code === "string" ? data.code : "";
            if (code === "auth_required" || code === "rejoin_required" || code === "room_not_ready") {
              pendingJoinRef.current = true;
              requestRoleAssignment(ws);
              return;
            }
          }

          handleWebSocketMessage(data);
        } catch {
          showWsErrorToast(t("common.retry"), "invalid_server_message");
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        setServerRole(null);
        authReadyRef.current = false;
        pendingJoinRef.current = false;
        clearRoleAssignmentTimer();
        if (intentionalCloseRef.current || event.code === 4001) return;
        // Auto-reconnect with exponential backoff (max 10s)
        const attempt = reconnectAttemptRef.current++;
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        setWsConnState("reconnecting");
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    };

    connect();

    return () => {
      intentionalCloseRef.current = true;
      authReadyRef.current = false;
      pendingJoinRef.current = false;
      clearRoleAssignmentTimer();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      clearChessMovePending();
      const activeSocket = wsRef.current;
      if (activeSocket?.readyState === WebSocket.OPEN) {
        activeSocket.send(JSON.stringify({ type: "leave_challenge_game", challengeId }));
      }
      activeSocket?.close();
      wsRef.current = null;
    };
  }, [authToken, challengeId, user, clearRoleAssignmentTimer, language, requestRoleAssignment, setLocation, showWsErrorToast, t, clearChessMovePending]);

  useEffect(() => {
    if (challenge?.gameType !== "domino" || !challengeId) {
      return;
    }

    const pushGuardHistory = () => {
      window.history.pushState({ dominoChallengeId: challengeId }, "", window.location.href);
    };

    const onPopState = () => {
      const inActiveMatch = dominoCanPlayRef.current && dominoStatusRef.current === "playing";
      if (inActiveMatch) {
        const leavePrompt = t("common.leaveConfirm") || t("challenge.backToChallenges");
        const shouldLeave = window.confirm(leavePrompt);
        if (!shouldLeave) {
          pushGuardHistory();
          return;
        }
      }

      setLocation("/challenges");
    };

    pushGuardHistory();
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [challenge?.gameType, challengeId, setLocation, t]);

  // Live countdown timer — ticks every second when game is playing
  useEffect(() => { setSoundMuted(isMuted); }, [isMuted, setSoundMuted]);
  useEffect(() => {
    if (gameSession?.status !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    lastSyncRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setLocalTimerTick(t => t + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameSession?.status, gameSession?.currentTurn]);

  const handleWebSocketMessage = useCallback((data: ChallengeWSMessage) => {
    const shouldAcceptSeqOnly = (seq?: number): boolean => {
      if (typeof seq !== "number") return true;
      if (seq < latestWsSeqRef.current) return false;
      latestWsSeqRef.current = seq;
      return true;
    };

    const getViewMoveCount = (view?: Record<string, unknown>): number | null => {
      if (!view) return null;
      const moveHistory = view.moveHistory;
      if (Array.isArray(moveHistory)) return moveHistory.length;
      const history = view.history;
      if (Array.isArray(history)) return history.length;
      return null;
    };

    const shouldApplySessionUpdate = (session?: GameSession, view?: Record<string, unknown>, seq?: number): boolean => {
      if (typeof seq === "number") {
        if (seq < latestWsSeqRef.current) return false;
        latestWsSeqRef.current = seq;
      }

      const sessionMoves = (session && typeof session.totalMoves === "number") ? session.totalMoves : null;
      const viewMoves = getViewMoveCount(view);

      if (sessionMoves !== null) {
        if (sessionMoves < latestTotalMovesRef.current) return false;
        if (sessionMoves === latestTotalMovesRef.current && viewMoves !== null && viewMoves < latestViewMovesRef.current) {
          return false;
        }
        latestTotalMovesRef.current = sessionMoves;
      } else if (viewMoves !== null && viewMoves < latestViewMovesRef.current) {
        return false;
      }

      if (viewMoves !== null) {
        latestViewMovesRef.current = Math.max(latestViewMovesRef.current, viewMoves);
      }
      return true;
    };

    if (isWsErrorType(data.type)) {
      const { message, code } = extractWsErrorInfo(data);
      if (message) {
        const parsedError = parseApiErrorMessage(message);
        const rawErrorKey = typeof data.errorKey === "string" ? data.errorKey : undefined;
        const displayError = challenge?.gameType === "domino"
          ? getDominoMoveErrorText(parsedError, rawErrorKey)
          : parsedError;

        showWsErrorToast(displayError, code);

        if (challenge?.gameType === "domino") {
          setDominoMoveError(displayError);
        }

        if (data.requiresSync && wsRef.current?.readyState === WebSocket.OPEN) {
          if (challenge?.gameType === "domino") {
            setDominoResyncing(true);
          }
          requestRoleAssignment(wsRef.current);
        }

        const normalized = parsedError.toLowerCase();
        const isGiftFundingError = code === "project_currency_required" || (
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
          } else {
            setShowQuickConvertCard(true);
          }
        }
      }
      return;
    }

    switch (data.type) {
      case "role_assigned": {
        const assignedRole = data.role ?? null;

        if (assignedRole === "spectator" && isChallengeParticipant) {
          setServerRole("player");
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            requestRoleAssignment(wsRef.current);
          }
          break;
        }

        setServerRole(assignedRole);
        if (assignedRole && challenge?.gameType === "domino") {
          dominoLastActionSigRef.current = "";
          setDominoTimeline([]);
          setDominoResultMeta(null);
        }
        break;
      }
      case "joined_challenge_game":
        setDominoResyncing(false);
        if (challenge?.gameType === "domino") {
          dominoLastActionSigRef.current = "";
          setDominoTimeline([]);
          setDominoResultMeta(null);
        }
        break;
      case "game_state_sync":
        lastSyncRef.current = Date.now();
        if (shouldApplySessionUpdate(data.session, data.view, data.seq)) {
          if (data.session) setGameSession(data.session);
          if (data.view) {
            setPlayerView(data.view);
            appendDominoTimeline(data.view, data.session?.totalMoves);
          }
          setDominoResyncing(false);
          setDominoMoveError(null);
        }
        break;
      case "game_move":
        lastSyncRef.current = Date.now();
        if (shouldApplySessionUpdate(data.session, data.view, data.seq)) {
          if (data.session) {
            setGameSession(prev => prev ? { ...prev, ...data.session } : (data.session ?? null));
            clearChessMovePending();
          }
          if (data.view) {
            setPlayerView(data.view);
            appendDominoTimeline(data.view, data.session?.totalMoves);
          }
          setDominoResyncing(false);
          setDominoMoveError(null);
        }
        // Sound: determine move type from game context
        if (gameSession?.gameType === "chess") {
          const view = data.view as Record<string, unknown> | undefined;
          if (view?.lastMoveCapture) playSound("capture");
          else if (view?.inCheck) playSound("check");
          else playSound("move");
        } else if (gameSession?.gameType === "backgammon") {
          playSound("diceRoll");
        } else {
          playSound("cardPlay");
        }
        break;
      case "chat_message":
        if (data.message) setMessages(prev => [...prev, data.message as unknown as ChatMsg]);
        break;
      case "spectator_joined":
        if (data.spectator) setSpectators(prev => [...prev, data.spectator as SpectatorInfo]);
        break;
      case "spectator_left":
        setSpectators(prev => prev.filter(s => s.id !== data.spectatorId));
        break;
      case "gift_received":
        if (data.gift) {
          const gift = data.gift as GiftInfo;
          const displayId = `${String(gift.id || "gift")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const displayGift: GiftInfo = {
            ...gift,
            id: displayId,
          };
          setReceivedGifts(prev => [...prev, displayGift]);
          setActiveGiftAnimation({
            id: displayId,
            senderId: String(gift.senderId || "unknown"),
            senderUsername: String(gift.senderName || "Supporter"),
            recipientId: String(gift.recipientId || "unknown"),
            giftItem: {
              id: String(gift.id || "gift"),
              name: String(gift.giftName || "Gift"),
              nameAr: String(gift.giftName || "هدية"),
              icon: "sparkles",
              price: String(gift.amount || 0),
            },
            quantity: 1,
          });
          toast({
            title: t('challenge.newGift'),
            description: `${gift.senderName} sent ${gift.giftName}`,
          });
          setTimeout(() => {
            setReceivedGifts(prev => prev.filter(g => g.id !== displayId));
          }, 1500);
        }
        break;
      case "player_disconnected_grace": {
        const payload = (data.payload || {}) as Record<string, unknown>;
        const graceMs = Number(payload.graceMs);
        setAutoPlayNotice({
          mode: "grace",
          username: typeof payload.username === "string" ? payload.username : undefined,
          seconds: Number.isFinite(graceMs) && graceMs > 0 ? Math.max(1, Math.round(graceMs / 1000)) : 60,
          startedAtMs: Date.now(),
        });
        break;
      }
      case "player_absent_auto": {
        const payload = (data.payload || {}) as Record<string, unknown>;
        const username = typeof payload.username === "string" ? payload.username : undefined;
        const turnTimeLimitMs = Number(payload.turnTimeLimitMs);
        const seconds = Number.isFinite(turnTimeLimitMs) && turnTimeLimitMs > 0 ? Math.max(1, Math.round(turnTimeLimitMs / 1000)) : 30;
        setAutoPlayNotice({
          mode: "autoplay",
          username,
          seconds,
          startedAtMs: Date.now(),
        });
        toast({
          title: language === "ar" ? "تم تفعيل اللعب التلقائي" : "Auto Play enabled",
          description: language === "ar"
            ? `${username || "أحد اللاعبين"} أصبح غائبًا، وسيكمل النظام اللعب تلقائيًا كل ${seconds} ثانية حتى نهاية التحدي.`
            : `${username || "A player"} is absent, so the system will auto-play every ${seconds} seconds until the challenge ends.`,
        });
        break;
      }
      case "game_ended":
        setAutoPlayNotice(null);
        if (!shouldAcceptSeqOnly(data.seq)) {
          break;
        }
        setDominoResyncing(false);
        if (challenge?.gameType === "domino") {
          setDominoResultMeta({
            winnerId: data.winnerId,
            reason: data.reason,
            isDraw: data.isDraw,
            scores: data.scores,
            lowestPips: data.lowestPips,
            winningTeamPips: data.winningTeamPips,
          });
        }
        clearChessMovePending();
        setGameSession(prev => prev ? { ...prev, status: "finished", winnerId: data.winnerId ?? undefined, winReason: data.reason ?? undefined } : {
          id: "",
          challengeId: challengeId || "",
          gameType: (challenge?.gameType as GameSession["gameType"]) || "chess",
          currentTurn: "",
          player1TimeRemaining: 0,
          player2TimeRemaining: 0,
          gameState: "",
          status: "finished",
          winnerId: data.winnerId ?? undefined,
          winReason: data.reason ?? undefined,
          totalMoves: latestTotalMovesRef.current,
          spectatorCount: 0,
          totalGiftsValue: "0",
        });
        setDrawOffered(null);
        const isDrawResult = data.reason === "draw_agreement"
          || data.reason === "draw"
          || data.isDraw === true;
        if (data.winnerId === user?.id) playSound("gameWin");
        else if (isDrawResult) playSound("draw");
        else playSound("gameLose");
        break;
      case "draw_offered":
        if (!shouldAcceptSeqOnly(data.seq)) {
          break;
        }
        setDrawOffered(data.offeredBy ?? null);
        playSound("draw");
        toast({
          title: t('challenge.drawOffered'),
          description: t('challenge.opponentOffersDraw'),
        });
        break;
      case "draw_declined":
        if (!shouldAcceptSeqOnly(data.seq)) {
          break;
        }
        setDrawOffered(null);
        toast({
          title: t('challenge.drawDeclined'),
          description: t('challenge.drawDeclinedDesc'),
        });
        break;
      case "dice_rolled":
      case "turn_ended":
        if (!shouldAcceptSeqOnly(data.seq)) {
          break;
        }
        lastSyncRef.current = Date.now();
        if (data.view) setPlayerView(data.view);
        break;
      case "session_replaced":
        toast({
          title: t('challenge.openedOtherTab'),
          description: t('challenge.redirecting'),
          variant: "destructive",
        });
        setTimeout(() => setLocation("/challenges"), 2000);
        break;
      case "spectator_count":
        setGameSession(prev => prev ? { ...prev, spectatorCount: (data.count as number) ?? 0 } : prev);
        break;
    }
  }, [
    toast,
    playSound,
    user,
    gameSession?.gameType,
    showWsErrorToast,
    clearChessMovePending,
    challengeId,
    challenge?.gameType,
    parseApiErrorMessage,
    openFundingAssistance,
    projectWallet?.totalBalance,
    toFiniteNumber,
    isChallengeParticipant,
    requestRoleAssignment,
    getDominoMoveErrorText,
    appendDominoTimeline,
    language,
  ]);

  const sendMove = useCallback((move: object) => {
    if (!canPlayActions) {
      showSpectatorActionBlocked();
      return;
    }

    const isChessMove = gameSession?.gameType === "chess"
      && typeof (move as { from?: unknown }).from === "string"
      && typeof (move as { to?: unknown }).to === "string";

    if (isChessMove && chessMovePendingRef.current) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setDominoMoveError(null);
      if (isChessMove) {
        chessMovePendingRef.current = true;
        if (chessMoveAckTimerRef.current) {
          clearTimeout(chessMoveAckTimerRef.current);
        }
        chessMoveAckTimerRef.current = setTimeout(() => {
          chessMovePendingRef.current = false;
          chessMoveAckTimerRef.current = null;
        }, 3000);
      }

      wsRef.current.send(JSON.stringify({
        type: "game_move",
        challengeId,
        move,
      }));
    }
  }, [challengeId, canPlayActions, showSpectatorActionBlocked, gameSession?.gameType]);

  // DominoBoard emits UI-friendly move shape; challenge websocket expects engine move shape.
  const sendDominoMove = useCallback((move: DominoBoardMove) => {
    setDominoMoveError(null);
    setDominoResyncing(false);

    const hand = extractDominoHandFromPlayerView(playerView);
    const adaptedMove = adaptDominoBoardMoveToEngine(move, hand);
    sendMove(adaptedMove);
  }, [sendMove, playerView]);

  const dominoBoardState = useMemo(() => {
    const normalized = normalizeDominoChallengePlayerView(playerView);
    return normalized as Record<string, unknown> | undefined;
  }, [playerView]);

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

  const dominoScoreRows = useMemo<DominoScoreRow[]>(() => {
    const metaScores = dominoResultMeta?.scores;
    const liveScores = playerView?.scores && typeof playerView.scores === "object"
      ? playerView.scores as Record<string, unknown>
      : undefined;
    const source = metaScores || liveScores;

    if (!source || typeof source !== "object") {
      return [];
    }

    return Object.entries(source)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([playerId, value], index) => ({
        id: playerId,
        label: dominoPlayerLabels.get(playerId) || `${t("domino.player")} ${index + 1}`,
        score: value as number,
      }))
      .sort((a, b) => b.score - a.score);
  }, [dominoResultMeta?.scores, playerView?.scores, dominoPlayerLabels, t]);

  const dominoEndgameSummary = useMemo<DominoEndgameSummary>(() => {
    const reason = dominoResultMeta?.reason || gameSession?.winReason;
    const winnerId = dominoResultMeta?.winnerId || gameSession?.winnerId;
    const isDraw = Boolean(dominoResultMeta?.isDraw)
      || reason === "draw"
      || reason === "draw_agreement";

    const winnerLabel = winnerId
      ? (winnerId === user?.id ? t("domino.you") : (dominoPlayerLabels.get(winnerId) || t("domino.player")))
      : undefined;

    const isFinished = challenge?.gameType === "domino"
      && (gameSession?.status === "finished" || Boolean(dominoResultMeta));

    return {
      isFinished,
      isDraw,
      reason,
      winnerLabel,
      lowestPips: dominoResultMeta?.lowestPips,
      winningTeamPips: dominoResultMeta?.winningTeamPips,
    };
  }, [challenge?.gameType, dominoPlayerLabels, dominoResultMeta, gameSession?.status, gameSession?.winReason, gameSession?.winnerId, t, user?.id]);

  // Backgammon-specific: roll dice
  const sendRoll = useCallback(() => {
    sendMove({ type: "roll" });
  }, [sendMove]);

  // Backgammon: move checker
  const sendBackgammonMove = useCallback((from: number, to: number) => {
    sendMove({ type: "move", from: String(from), to: String(to) });
  }, [sendMove]);

  // Backgammon: doubling cube
  const sendDouble = useCallback(() => {
    sendMove({ type: "double" });
  }, [sendMove]);

  const sendAcceptDouble = useCallback(() => {
    sendMove({ type: "accept_double" });
  }, [sendMove]);

  const sendDeclineDouble = useCallback(() => {
    sendMove({ type: "decline_double" });
  }, [sendMove]);

  // Card games: play a card
  const sendPlayCard = useCallback((card: object) => {
    sendMove({ type: "playCard", card });
  }, [sendMove]);

  // Tarneeb/Baloot: bid
  const sendBid = useCallback((bid: number) => {
    sendMove({ type: "bid", bid });
  }, [sendMove]);

  // Tarneeb/Baloot: pass
  const sendPass = useCallback(() => {
    if (challenge?.gameType === "tarneeb") {
      // Tarneeb engine treats pass as a bid=null move.
      sendMove({ type: "bid", bid: null });
      return;
    }

    sendMove({ type: "pass" });
  }, [challenge?.gameType, sendMove]);

  // Tarneeb: set trump suit after winning bid
  const sendSetTrump = useCallback((suit: string) => {
    sendMove({ type: "setTrump", suit });
  }, [sendMove]);

  // Baloot: choose game type (sun/hokm)
  const sendChooseTrump = useCallback((gameType: "sun" | "hokm", suit?: string) => {
    sendMove({ type: "choose", gameType, trumpSuit: suit });
  }, [sendMove]);

  const sendLanguageDuelAnswer = useCallback((answerText: string, responseMs: number) => {
    sendMove({ type: "submit_answer", answerText, responseMs });
  }, [sendMove]);

  // Chess: draw offer
  const sendOfferDraw = useCallback(() => {
    if (!canPlayActions) {
      showSpectatorActionBlocked();
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "offer_draw",
        challengeId,
      }));
      setDrawOffered(user?.id || null);
    }
  }, [challengeId, user, canPlayActions, showSpectatorActionBlocked]);

  const sendRespondDraw = useCallback((accept: boolean) => {
    if (!canPlayActions) {
      showSpectatorActionBlocked();
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "respond_draw",
        challengeId,
        accept,
      }));
      setDrawOffered(null);
    }
  }, [challengeId, canPlayActions, showSpectatorActionBlocked]);

  const sendChatMessage = useCallback((message: string, isQuickMessage = false, quickMessageKey?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "challenge_chat",
        challengeId,
        message,
        isQuickMessage,
        quickMessageKey,
      }));
    }
    setMessageInput("");
  }, [challengeId]);

  const sendGiftToPlayer = useCallback((giftId: string, recipientId: string, meta?: { price?: number }) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast({
        title: language === "ar" ? "الاتصال غير جاهز" : "Connection not ready",
        description: language === "ar" ? "أعد المحاولة خلال لحظة." : "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    const attemptedGiftPrice = Number(meta?.price || 0);
    lastGiftAttemptRef.current = {
      giftId,
      price: Number.isFinite(attemptedGiftPrice) ? attemptedGiftPrice : 0,
    };

    const idempotencyKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    wsRef.current.send(JSON.stringify({
      type: "gift_to_player",
      challengeId,
      giftId,
      recipientId,
      idempotencyKey,
    }));
  }, [challengeId, toast, language]);

  const clearGiftAnimation = useCallback(() => {
    setActiveGiftAnimation(null);
  }, []);

  const handleResign = useCallback(() => {
    if (!canPlayActions) {
      showSpectatorActionBlocked();
      setShowResignDialog(false);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "game_resign",
        challengeId,
      }));
    }
    setShowResignDialog(false);
  }, [challengeId, canPlayActions, showSpectatorActionBlocked]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Keep timer calculations and timeout effect above conditional returns
  // so hook order stays stable across loading/error/success renders.
  const elapsedSinceSyncSec = Math.floor((Date.now() - lastSyncRef.current) / 1000);
  const isMyTurnForTimer = gameSession?.currentTurn === user?.id;
  const fallbackTimeLimit = challenge?.timeLimit ?? 0;
  const isPlayerOne = challenge?.player1Id === user?.id;
  const serverMyTime = isPlayerOne
    ? (gameSession?.player1TimeRemaining ?? fallbackTimeLimit)
    : (gameSession?.player2TimeRemaining ?? fallbackTimeLimit);
  const serverOppTime = isPlayerOne
    ? (gameSession?.player2TimeRemaining ?? fallbackTimeLimit)
    : (gameSession?.player1TimeRemaining ?? fallbackTimeLimit);
  void localTimerTick; // referenced to trigger re-render
  const myTimeRemaining = Math.max(0, isMyTurnForTimer ? serverMyTime - elapsedSinceSyncSec : serverMyTime);
  const opponentTimeRemaining = Math.max(0, !isMyTurnForTimer ? serverOppTime - elapsedSinceSyncSec : serverOppTime);
  const player1TurnActive = gameSession?.currentTurn === challenge?.player1Id;
  const player2TurnActive = gameSession?.currentTurn === challenge?.player2Id;
  const rawPlayer1Time = gameSession?.player1TimeRemaining ?? fallbackTimeLimit;
  const rawPlayer2Time = gameSession?.player2TimeRemaining ?? fallbackTimeLimit;
  const player1TimeRemaining = Math.max(0, player1TurnActive ? rawPlayer1Time - elapsedSinceSyncSec : rawPlayer1Time);
  const player2TimeRemaining = Math.max(0, player2TurnActive ? rawPlayer2Time - elapsedSinceSyncSec : rawPlayer2Time);
  const autoPlayActorName = autoPlayNotice?.username || (language === "ar" ? "أحد اللاعبين" : "A player");
  const autoPlayBaseSeconds = Math.max(1, autoPlayNotice?.seconds ?? (autoPlayNotice?.mode === "grace" ? 60 : 30));
  const autoPlayElapsedSeconds = autoPlayNotice
    ? Math.max(0, Math.floor((Date.now() - (autoPlayNotice.startedAtMs ?? Date.now())) / 1000))
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
      ? `${autoPlayActorName} أصبح غائبًا، وسيقوم النظام بحركة تلقائية كل ${autoPlayBaseSeconds} ثانية حتى تنتهي المباراة.`
      : `${autoPlayActorName} is absent, so the system will auto-play every ${autoPlayBaseSeconds} seconds until the match ends.`)
    : (language === "ar"
      ? `${autoPlayActorName} انقطع عن المباراة. إذا لم يعد خلال ${autoPlayLiveSeconds ?? autoPlayBaseSeconds} ثانية سيدخل التحدي وضع Auto Play.`
      : `${autoPlayActorName} disconnected from the match. If they do not return within ${autoPlayLiveSeconds ?? autoPlayBaseSeconds} seconds, Auto Play will take over.`);
  const dominoScoreLookup = useMemo(() => new Map(dominoScoreRows.map((row) => [row.id, row.score])), [dominoScoreRows]);
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

  useEffect(() => {
    if (gameSession?.status !== "playing" || !canPlayActions || challenge?.gameType !== "chess") {
      timeoutSignalSentRef.current = false;
      return;
    }

    const iAmCurrentTurn = gameSession.currentTurn === user?.id;
    if (!iAmCurrentTurn || myTimeRemaining > 0 || timeoutSignalSentRef.current) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      timeoutSignalSentRef.current = true;
      wsRef.current.send(JSON.stringify({
        type: "game_resign",
        challengeId,
        reason: "timeout",
      }));
    }
  }, [gameSession?.status, gameSession?.currentTurn, canPlayActions, challenge?.gameType, myTimeRemaining, user?.id, challengeId]);

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
        ? (language === "ar" ? "غير مصرح لك بالدخول لهذه المباراة" : "You are not authorized to access this match")
        : isNotFound
          ? (language === "ar" ? "التحدي غير موجود" : "Challenge not found")
          : isRateLimited
            ? (language === "ar" ? "تم تجاوز الحد المسموح من الطلبات" : "Too many requests")
            : (language === "ar" ? "تعذر تحميل التحدي" : "Failed to load challenge");

    const description = isUnauthorized
      ? (language === "ar" ? "الجلسة مفقودة أو منتهية." : "Your session is missing or expired.")
      : isForbidden
        ? (language === "ar" ? "هذا التحدي غير متاح لهذا الحساب." : "This challenge is not available for this account.")
        : isNotFound
          ? (language === "ar" ? "قد يكون التحدي أُلغي أو انتهى." : "The challenge may have been cancelled or completed.")
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
            <p>{t('challenge.notFound')}</p>
            <Button className="mt-4" onClick={() => setLocation("/challenges")}>
              {t('challenge.backToChallenges')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (serverRole === null && wsConnState === "connecting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {t('challenge.determiningRole')}
        </p>
      </div>
    );
  }

  const opponent = challenge.player1Id === user?.id ? challenge.player2 : challenge.player1;

  const chessStatePayload = (() => {
    const fen = typeof playerView?.fen === "string" ? playerView.fen : "";
    if (fen) {
      return JSON.stringify({ fen });
    }

    const sessionState = typeof gameSession?.gameState === "string" ? gameSession.gameState.trim() : "";
    if (sessionState.length > 0) {
      return sessionState;
    }

    return undefined;
  })();

  const GAME_INFO: Record<string, { icon: React.ComponentType<{ className?: string }>; nameAr: string; nameEn: string }> = {
    chess: { icon: Crown, nameAr: "الشطرنج", nameEn: "Chess" },
    domino: { icon: Target, nameAr: "الدومينو", nameEn: "Domino" },
    backgammon: { icon: Dice5, nameAr: "الطاولة", nameEn: "Backgammon" },
    tarneeb: { icon: Spade, nameAr: "الطرنيب", nameEn: "Tarneeb" },
    baloot: { icon: Heart, nameAr: "البلوت", nameEn: "Baloot" },
    languageduel: { icon: MessageCircle, nameAr: t('languageduel.title'), nameEn: t('languageduel.title') },
  };
  const gameInfo = GAME_INFO[challenge.gameType] || GAME_INFO.chess;
  const GameIcon = gameInfo.icon;
  const challengeCurrencyType = challenge.currencyType === "project" ? "project" : "usd";
  const isProjectChallengeCurrency = challengeCurrencyType === "project";
  const challengeBetAmountValue = Number.parseFloat(String(challenge.betAmount || 0));

  const isDominoGame = challenge.gameType === "domino";
  const isTeamGame = challenge.gameType === "tarneeb" || challenge.gameType === "baloot";
  const isWideBoardGame = isDominoGame || challenge.gameType === "backgammon" || isTeamGame;
  const boardShellWidthClass = challenge.gameType === "baloot"
    ? "w-full max-w-6xl"
    : (isWideBoardGame ? "w-full max-w-5xl" : "w-full max-w-lg");
  const playerIds = [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id].filter(Boolean);
  const mySeatIndex = playerIds.indexOf(user?.id || "");
  const myTeam = mySeatIndex % 2 === 0 ? 0 : 1;

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

  const supportSummaryByPlayer = useMemo(() => {
    const map = new Map<string, { count: number; totalAmount: number }>();
    for (const support of supports) {
      if (!support?.playerId) continue;
      const existing = map.get(support.playerId) || { count: 0, totalAmount: 0 };
      const numericAmount = Number.parseFloat(String(support.amount || 0));
      map.set(support.playerId, {
        count: existing.count + 1,
        totalAmount: existing.totalAmount + (Number.isFinite(numericAmount) ? numericAmount : 0),
      });
    }
    return map;
  }, [supports]);

  const giftSummaryByPlayer = useMemo(() => {
    const map = new Map<string, { count: number; totalAmount: number }>();
    for (const gift of receivedGifts) {
      const recipientId = typeof gift.recipientId === "string" ? gift.recipientId : "";
      if (!recipientId) continue;
      const existing = map.get(recipientId) || { count: 0, totalAmount: 0 };
      const giftAmount = Number.parseFloat(String(gift.amount || 0));
      map.set(recipientId, {
        count: existing.count + 1,
        totalAmount: existing.totalAmount + (Number.isFinite(giftAmount) ? giftAmount : 0),
      });
    }
    return map;
  }, [receivedGifts]);

  const participantCards = useMemo(() => {
    const rawList = [
      { id: challenge.player1Id, seat: 1, player: challenge.player1 },
      { id: challenge.player2Id, seat: 2, player: challenge.player2 },
      { id: challenge.player3Id, seat: 3, player: challenge.player3 },
      { id: challenge.player4Id, seat: 4, player: challenge.player4 },
    ];

    const list = rawList.flatMap((entry) => (entry.id ? [{ ...entry, id: entry.id }] : []));

    return list.map((entry) => {
      const supportSummary = supportSummaryByPlayer.get(entry.id) || { count: 0, totalAmount: 0 };
      const giftSummary = giftSummaryByPlayer.get(entry.id) || { count: 0, totalAmount: 0 };
      const scoreValue = challenge.gameType === "domino" ? (dominoScoreLookup.get(entry.id) ?? 0) : 0;
      const timeRemaining = entry.seat === 1 ? player1TimeRemaining : player2TimeRemaining;

      return {
        id: entry.id,
        seat: entry.seat,
        username: entry.player?.username || `${language === "ar" ? "لاعب" : "Player"} ${entry.seat}`,
        avatarUrl: entry.player?.avatarUrl,
        scoreValue,
        timeRemaining,
        giftCount: giftSummary.count,
        giftTotal: giftSummary.totalAmount,
        supportCount: supportSummary.count,
        supportTotal: supportSummary.totalAmount,
        isCurrentUser: entry.id === user?.id,
        isMutedForViewer: Boolean(voicePeerMutedMap[entry.id]),
        isConnectedToVoice: connectedVoicePeers.includes(entry.id),
      };
    });
  }, [challenge.gameType, challenge.player1, challenge.player1Id, challenge.player2, challenge.player2Id, challenge.player3, challenge.player3Id, challenge.player4, challenge.player4Id, connectedVoicePeers, dominoScoreLookup, giftSummaryByPlayer, language, player1TimeRemaining, player2TimeRemaining, supportSummaryByPlayer, user?.id, voicePeerMutedMap]);

  const togglePeerListening = useCallback((peerUserId: string) => {
    setVoicePeerMutedMap((previous) => ({
      ...previous,
      [peerUserId]: !previous[peerUserId],
    }));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Reconnection overlay */}
      {wsConnState === "reconnecting" && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-white text-lg font-medium">
            {t('challenge.reconnecting')}
          </p>
          <p className="text-white/60 text-sm">
            {t('challenge.dontClose')}
          </p>
        </div>
      )}
      <div className="flex flex-col lg:flex-row h-screen">
        <div className="flex-1 flex flex-col">
          <header className="flex items-center justify-between gap-2 p-2 sm:p-3 border-b bg-card">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <BackButton fallbackPath="/challenges" className="shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <GameIcon className="h-5 w-5 text-primary" />
                <span className="font-semibold truncate">
                  {language === "ar" ? gameInfo.nameAr : gameInfo.nameEn}
                </span>
                <Badge variant={isSpectator ? "outline" : "default"} className="hidden sm:inline-flex">
                  {isSpectator
                    ? (language === "ar" ? "مشاهد" : "Spectator")
                    : (language === "ar" ? "لاعب" : "Player")}
                </Badge>
              </div>
              <Badge variant="secondary" className="inline-flex shrink-0 text-[11px] sm:text-xs">
                {isProjectChallengeCurrency ? (
                  <ProjectCurrencyAmount amount={challengeBetAmountValue} symbolClassName="text-xs" amountClassName="text-xs font-medium" />
                ) : (
                  `$${challengeBetAmountValue.toFixed(2)}`
                )}
              </Badge>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <ShareMatchButton challengeId={challengeId!} gameType={challenge.gameType} />

              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span className="text-sm">{gameSession?.spectatorCount || 0}</span>
              </div>

              {isPlayer && (
                <VoiceChat
                  challengeId={challengeId!}
                  isEnabled={true}
                  onToggle={() => { }}
                  isMicMuted={isVoiceMicMuted}
                  onMicMuteToggle={() => setIsVoiceMicMuted((prev) => !prev)}
                  role="player"
                  showInlineControls={false}
                  peerAudioMutedOverride={voicePeerMutedMap}
                  onConnectedPeersChange={setConnectedVoicePeers}
                />
              )}
            </div>
          </header>

          {autoPlayNotice && (
            <div className="px-2 pt-2 sm:px-3">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-amber-950 shadow-sm dark:text-amber-100">
                <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-300" />
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

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <div className={`flex-1 p-2 sm:p-4 flex flex-col items-center relative ${isWideBoardGame ? "justify-start overflow-y-auto" : "justify-center overflow-y-auto"}`}>
              {isDominoGame && (
                <div className="mb-3 w-full max-w-5xl space-y-2">
                  {dominoAutoPlayBadgeText && (
                    <div className="flex justify-center">
                      <Badge variant="outline" className="rounded-full border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                        <Clock className="me-1 h-3.5 w-3.5" />
                        <span className="font-mono tabular-nums">{dominoAutoPlayBadgeText}</span>
                      </Badge>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    <div className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
                      <div className="min-w-0 me-2">
                        <p className="truncate text-xs text-muted-foreground">
                          {challenge.player1?.username || "Player 1"}
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 shrink-0">
                        <span className="text-[11px] text-muted-foreground">{t("domino.score")}</span>
                        <span className="font-mono text-sm font-semibold sm:text-base">{dominoPlayer1Score}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
                      <div className="min-w-0 me-2">
                        <p className="truncate text-xs text-muted-foreground">
                          {challenge.player2?.username || "Player 2"}
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 shrink-0">
                        <span className="text-[11px] text-muted-foreground">{t("domino.score")}</span>
                        <span className="font-mono text-sm font-semibold sm:text-base">{dominoPlayer2Score}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className={`${boardShellWidthClass} mb-3`}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {participantCards.map((participant) => (
                    <div
                      key={`participant-play-card-${participant.id}`}
                      className="rounded-xl border bg-card px-3 py-2"
                      data-testid={`participant-play-card-${participant.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={participant.avatarUrl} />
                            <AvatarFallback>{participant.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{participant.username}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {language === "ar" ? `المقعد ${participant.seat}` : `Seat ${participant.seat}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {participant.isCurrentUser ? (
                            <Button
                              type="button"
                              size="icon"
                              variant={isVoiceMicMuted ? "destructive" : "outline"}
                              className="h-8 w-8"
                              onClick={() => setIsVoiceMicMuted((prev) => !prev)}
                              data-testid={`participant-self-mic-${participant.id}`}
                            >
                              {isVoiceMicMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="icon"
                              variant={participant.isMutedForViewer ? "destructive" : "outline"}
                              className="h-8 w-8"
                              disabled={!participant.isConnectedToVoice}
                              onClick={() => togglePeerListening(participant.id)}
                              data-testid={`participant-peer-listen-${participant.id}`}
                            >
                              {participant.isMutedForViewer ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <Badge variant="outline" className="font-mono">
                          {isDominoGame
                            ? `${t("domino.score")}: ${participant.scoreValue}`
                            : `${language === "ar" ? "الوقت" : "Time"}: ${formatTime(participant.timeRemaining)}`}
                        </Badge>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5">
                          <p className="text-muted-foreground">{language === "ar" ? "الهدايا" : "Gifts"}</p>
                          <p className="font-semibold">
                            {participant.giftCount}
                            {participant.giftTotal > 0 ? ` · ${participant.giftTotal.toFixed(2)}` : ""}
                          </p>
                        </div>
                        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
                          <p className="text-muted-foreground">{language === "ar" ? "الدعم" : "Support"}</p>
                          <p className="font-semibold">
                            {participant.supportCount}
                            {participant.supportTotal > 0 ? ` · ${participant.supportTotal.toFixed(2)}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!isDominoGame && (
                <div className={`${boardShellWidthClass} mb-4`}>
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={opponent?.avatarUrl} />
                        <AvatarFallback>{opponent?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{opponent?.username || "Waiting..."}</p>
                        {opponent?.rating && (
                          <p className="text-xs text-muted-foreground">
                            {opponent.rating.wins}W / {opponent.rating.losses}L
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className={`font-mono text-lg ${opponentTimeRemaining < 30 ? "text-destructive" : ""}`}>
                        {formatTime(opponentTimeRemaining)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className={`relative ${boardShellWidthClass}`}>
                {receivedGifts.map((gift) => (
                  <div
                    key={gift.id}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 animate-bounce"
                  >
                    <div className="bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg">
                      <Gift className="h-6 w-6 inline-block me-2" />
                      {gift.giftName} from {gift.senderName}
                    </div>
                  </div>
                ))}

                {challenge.gameType === "chess" && (
                  <ChessBoard
                    gameState={chessStatePayload}
                    currentTurn={gameSession?.currentTurn}
                    myColor={myColor}
                    isMyTurn={canPlayActions && ((playerView?.isMyTurn as boolean) ?? (gameSession?.currentTurn === user?.id))}
                    isSpectator={isSpectator}
                    authoritativeValidMoves={playerView?.validMoves}
                    onMove={canPlayActions ? sendMove : () => { }}
                    status={gameSession?.status}
                  />
                )}
                {challenge.gameType === "domino" && (
                  <DominoChallengeContainer
                    boardState={dominoBoardState}
                    currentTurn={gameSession?.currentTurn}
                    isMyTurn={canPlayActions && ((playerView?.isMyTurn as boolean) ?? (gameSession?.currentTurn === user?.id))}
                    isSpectator={isSpectator}
                    onMove={canPlayActions ? sendDominoMove : () => { }}
                    status={gameSession?.status}
                    turnTimeLimitSeconds={30}
                    turnStartedAtMs={dominoTurnStartedAtMs}
                    dominoResyncing={dominoResyncing}
                    dominoMoveError={dominoMoveError}
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
                    onMove={canPlayActions ? sendBackgammonMove : () => { }}
                    onRoll={canPlayActions ? sendRoll : () => { }}
                    onDouble={canPlayActions ? sendDouble : () => { }}
                    onAcceptDouble={canPlayActions ? sendAcceptDouble : () => { }}
                    onDeclineDouble={canPlayActions ? sendDeclineDouble : () => { }}
                    doublingCube={(playerView.doublingCube as number) ?? 1}
                    cubeOwner={(playerView.cubeOwner as "white" | "black" | null) ?? null}
                    cubeOffered={(playerView.cubeOffered as boolean) ?? false}
                    cubeOfferedBy={(playerView.cubeOfferedBy as "white" | "black" | null) ?? null}
                    disabled={isSpectator}
                  />
                )}
                {challenge.gameType === "tarneeb" && (
                  <TarneebBoard
                    sessionId={gameSession?.id || ""}
                    gameState={playerView as TarneebState | null}
                    playerId={isSpectator ? "__spectator__" : (user?.id || "")}
                    playerPosition={isSpectator ? 0 : ((playerView?.playerPosition as number) ?? mySeatIndex)}
                    playerNames={balootPlayerNames}
                    onPlayCard={canPlayActions ? sendPlayCard : () => { }}
                    onBid={canPlayActions ? sendBid : () => { }}
                    onPass={canPlayActions ? sendPass : () => { }}
                    onSetTrump={canPlayActions ? sendSetTrump : () => { }}
                    turnTimeLimitSeconds={30}
                    turnStartedAtMs={tarneebTurnStartedAtMs}
                  />
                )}
                {challenge.gameType === "baloot" && (
                  <BalootBoard
                    gameState={playerView as BalootState | null}
                    playerId={isSpectator ? "__spectator__" : (user?.id || "")}
                    playerPosition={isSpectator ? 0 : ((playerView?.playerPosition as number) ?? mySeatIndex)}
                    onPlayCard={canPlayActions ? sendPlayCard : () => { }}
                    onChooseTrump={canPlayActions ? sendChooseTrump : () => { }}
                    onPass={canPlayActions ? sendPass : () => { }}
                    playerNames={balootPlayerNames}
                    turnTimeLimitSeconds={30}
                    turnStartedAtMs={balootTurnStartedAtMs}
                  />
                )}
                {challenge.gameType === "languageduel" && (
                  <LanguageDuelBoard
                    playerView={playerView}
                    isSpectator={isSpectator}
                    canPlay={canPlayActions}
                    onSubmitAnswer={canPlayActions ? sendLanguageDuelAnswer : undefined}
                  />
                )}
              </div>

              {!isDominoGame && (
                <div className={`${boardShellWidthClass} mt-4`}>
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 ring-2 ring-primary">
                        <AvatarImage src={user?.profilePicture || undefined} />
                        <AvatarFallback>{user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {isSpectator
                            ? `${user?.username} ${language === "ar" ? "(مشاهدة)" : "(Watching)"}`
                            : `${user?.username} ${t('challenge.you')}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isSpectator
                            ? (language === "ar" ? "وضع المشاهدة" : "Spectator mode")
                            : isTeamGame
                              ? t('challenge.team', { num: String(myTeam + 1) })
                              : challenge.gameType === "backgammon"
                                ? (playerView?.myColor === "white" ? "⚪" : "⚫")
                                : (myColor === "white" ? "⚪" : "⚫")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className={`font-mono text-lg ${myTimeRemaining < 30 ? "text-destructive" : ""}`}>
                        {formatTime(myTimeRemaining)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {canPlayActions && gameSession?.status === "playing" && (
                <div className="mt-4 flex gap-2 items-center">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowResignDialog(true)}
                    data-testid="button-resign"
                  >
                    <Flag className="h-4 w-4 me-2" />
                    {t('challenge.resign')}
                  </Button>

                  {/* Draw offer button (chess/backgammon only) */}
                  {(challenge.gameType === "chess" || challenge.gameType === "backgammon") && !drawOffered && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={sendOfferDraw}
                      data-testid="button-offer-draw"
                    >
                      {t('challenge.offerDraw')}
                    </Button>
                  )}

                  {/* Draw offered by me — waiting */}
                  {drawOffered === user?.id && (
                    <Badge variant="secondary" className="animate-pulse">
                      {t('challenge.waitingResponse')}
                    </Badge>
                  )}

                  {/* Draw offered by opponent — accept/decline */}
                  {drawOffered && drawOffered !== user?.id && (
                    <div className="flex gap-1 items-center">
                      <Badge>{t('challenge.drawOffer')}</Badge>
                      <Button size="sm" variant="default" onClick={() => sendRespondDraw(true)}>
                        {t('challenge.accept')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendRespondDraw(false)}>
                        {t('challenge.decline')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Floating game chat for players (Ludo King style) */}
              {!isSpectator && (
                <div className={`w-full mt-3 h-36 sm:h-40 relative ${isWideBoardGame ? "max-w-5xl" : "max-w-lg"}`}>
                  <GameChat
                    messages={messages as unknown as { id: string; senderId: string; senderName: string; message: string; createdAt: string }[]}
                    onSendMessage={sendChatMessage}
                    quickMessages={QUICK_MESSAGES}
                    language={language}
                    currentUserId={user?.id}
                  />
                </div>
              )}
            </div>

            {/* Sidebar with gifts/comments for spectators and domino players */}
            {(isSpectator || isDominoGame) && (
              <div className="w-full lg:w-[22rem] border-t lg:border-t-0 lg:border-s flex flex-col bg-card max-h-[46vh] lg:max-h-none">
                {isSpectator && challenge.gameType === "domino" && (
                  <DominoSpectatorInsights
                    spectatorCount={gameSession?.spectatorCount || 0}
                    totalMoves={gameSession?.totalMoves}
                    currentTurn={gameSession?.currentTurn}
                    gameStatus={gameSession?.status}
                    boardState={dominoBoardState}
                    player1={challenge.player1 ? { id: challenge.player1.id, username: challenge.player1.username, avatarUrl: challenge.player1.avatarUrl } : undefined}
                    player2={challenge.player2 ? { id: challenge.player2.id, username: challenge.player2.username, avatarUrl: challenge.player2.avatarUrl } : undefined}
                    timeline={dominoTimeline}
                    scoreRows={dominoScoreRows}
                    endgameSummary={dominoEndgameSummary}
                    dominoResyncing={dominoResyncing}
                    dominoMoveError={dominoMoveError}
                  />
                )}

                <SpectatorPanel
                  challengeId={challengeId!}
                  player1={challenge.player1}
                  player2={challenge.player2}
                  spectatorCount={gameSession?.spectatorCount || 0}
                  totalMoves={gameSession?.totalMoves}
                  currentTurn={gameSession?.currentTurn}
                  gameStatus={gameSession?.status}
                  panelMode={isSpectator ? "spectator" : "player"}
                  onSendGift={sendGiftToPlayer}
                  chatMessages={messages}
                  supportCount={receivedGifts.length}
                  giftCount={receivedGifts.length}
                  giftTotalText={gameSession?.totalGiftsValue}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showResignDialog}
        title={language === "ar" ? "تأكيد الاستسلام" : "Confirm Resignation"}
        description={
          language === "ar"
            ? "هل أنت متأكد من الاستسلام؟ ستخسر المباراة والتحدي."
            : "Are you sure you want to resign? You will lose the match and your entry."
        }
        variant="destructive"
        confirmLabel={language === "ar" ? "استسلام" : "Resign"}
        cancelLabel={language === "ar" ? "إلغاء" : "Cancel"}
        onConfirm={handleResign}
        onCancel={() => setShowResignDialog(false)}
      />

      {gameSession?.status === "finished" && (
        <Dialog open={true}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-center">
                {isSpectator ? (
                  <div className="flex flex-col items-center gap-2">
                    <Trophy className="h-12 w-12 text-yellow-500" />
                    <span className="text-2xl">
                      {language === "ar" ? "انتهت المباراة" : "Match Finished"}
                    </span>
                  </div>
                ) : challenge.gameType === "domino" && gameSession.winReason === "draw" ? (
                  <div className="flex flex-col items-center gap-2">
                    <ArrowRightLeft className="h-12 w-12 text-yellow-500" />
                    <span className="text-2xl">
                      {language === "ar" ? "انتهت المباراة بالتعادل" : "Match Draw"}
                    </span>
                  </div>
                ) : gameSession.winnerId === user?.id ? (
                  <div className="flex flex-col items-center gap-2">
                    <Trophy className="h-12 w-12 text-yellow-500" />
                    <span className="text-2xl">
                      {language === "ar" ? "مبروك! فزت!" : "Congratulations! You Won!"}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <X className="h-12 w-12 text-destructive" />
                    <span className="text-2xl">
                      {language === "ar" ? "للأسف خسرت" : "You Lost"}
                    </span>
                  </div>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="text-center text-muted-foreground">
              <p>
                {gameSession.winReason === "checkmate" && (language === "ar" ? "كش مات!" : "Checkmate!")}
                {gameSession.winReason === "timeout" && (language === "ar" ? "انتهى الوقت" : "Time out")}
                {gameSession.winReason === "resignation" && (language === "ar" ? "استسلام" : "Resignation")}
                {gameSession.winReason === "domino_blocked" && (language === "ar" ? "اللعبة محظورة" : "Game blocked")}
                {gameSession.winReason === "blocked" && (language === "ar" ? "اللعبة محظورة" : "Game blocked")}
                {gameSession.winReason === "stalemate" && (language === "ar" ? "طريق مسدود" : "Stalemate")}
                {gameSession.winReason === "gammon" && (language === "ar" ? "غامون!" : "Gammon!")}
                {gameSession.winReason === "backgammon" && (language === "ar" ? "باكغامون!" : "Backgammon!")}
                {gameSession.winReason === "double_declined" && (language === "ar" ? "رفض المضاعفة" : "Double declined")}
                {gameSession.winReason === "target_reached" && (language === "ar" ? "وصل للهدف" : "Target score reached")}
                {gameSession.winReason === "normal" && (language === "ar" ? "فوز عادي" : "Normal win")}
                {gameSession.winReason === "draw_agreement" && (language === "ar" ? "تعادل بالاتفاق" : "Draw by agreement")}
                {gameSession.winReason === "draw" && (language === "ar" ? "تعادل" : "Draw")}
              </p>
              {canPlayActions && gameSession.winnerId === user?.id && (
                <div className="mt-2 inline-flex items-center gap-1 text-lg font-bold text-green-500">
                  <span>+</span>
                  {isProjectChallengeCurrency ? (
                    <ProjectCurrencyAmount
                      amount={challengeBetAmountValue * 2 * (1 - parseFloat(challengeConfig?.commissionPercent || "5") / 100)}
                      symbolClassName="text-base"
                      amountClassName="text-lg font-bold text-green-500"
                    />
                  ) : (
                    <span>${(challengeBetAmountValue * 2 * (1 - parseFloat(challengeConfig?.commissionPercent || "5") / 100)).toFixed(2)}</span>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setLocation("/challenges")}>
                {language === "ar" ? "العودة للتحديات" : "Back to Challenges"}
              </Button>
              <Button onClick={() => {
                setLocation("/challenges");
              }}>
                {language === "ar" ? "مباراة جديدة" : "New Match"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <GiftAnimation
        gift={activeGiftAnimation}
        onComplete={clearGiftAnimation}
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
                  data-testid="input-game-popup-convert-amount"
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
              data-testid="button-game-popup-quick-convert"
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
                data-testid="button-game-open-p2p-market"
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
                data-testid="button-game-open-wallet-deposit"
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

      {showQuickConvertCard && currencyPolicy?.projectOnly && (
        <div className="fixed bottom-4 end-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {language === "ar" ? "مطلوب عملة المشروع" : "Project currency required"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ar"
                  ? "حوّل رصيداً سريعاً للمتابعة داخل المباراة والهدايا."
                  : "Convert quickly to continue gameplay and gifting."}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowQuickConvertCard(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              min="1"
              step="1"
              value={quickConvertAmount}
              onChange={(e) => setQuickConvertAmount(e.target.value)}
            />
            <Button
              onClick={() => quickConvertMutation.mutate(quickConvertAmount)}
              disabled={quickConvertMutation.isPending}
            >
              {quickConvertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (language === "ar" ? "تحويل" : "Convert")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {language === "ar" ? "رصيدك الحالي:" : "Current balance:"}{" "}
            <ProjectCurrencyAmount amount={projectWallet?.totalBalance || 0} symbolClassName="text-xs" />
          </p>
        </div>
      )}
    </div>
  );
}
