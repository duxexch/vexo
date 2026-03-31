import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useGameSounds } from "@/hooks/use-game-sounds";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import { BackButton } from "@/components/BackButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ChessBoard } from "@/components/games/ChessBoard";
import { DominoBoard } from "@/components/games/DominoBoard";
import { BackgammonBoard } from "@/components/games/backgammon/BackgammonBoard";
import TarneebBoard from "@/components/games/TarneebBoard";
import type { TarneebState } from "@/components/games/TarneebBoard";
import BalootBoard from "@/components/games/BalootBoard";
import type { BalootState } from "@/components/games/BalootBoard";
import { GameChat } from "@/components/games/GameChat";
import { VoiceChat } from "@/components/games/VoiceChat";
import { SpectatorPanel } from "@/components/games/SpectatorPanel";
import { ShareMatchButton } from "@/components/games/ShareMatchButton";
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
  gameType: "chess" | "domino" | "backgammon" | "tarneeb" | "baloot";
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

interface GiftInfo {
  id: string;
  senderName: string;
  giftName: string;
  [key: string]: unknown;
}

interface ChallengeWSMessage {
  type: string;
  role?: "player" | "spectator";
  session?: GameSession;
  view?: Record<string, unknown>;
  message?: Record<string, unknown>;
  spectator?: { id: string; username: string; avatarUrl?: string };
  spectatorId?: string;
  gift?: GiftInfo;
  winnerId?: string;
  reason?: string;
  offeredBy?: string;
  count?: number;
  [key: string]: unknown;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const challengeId = params?.id;

  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const { play: playSound, setMuted: setSoundMuted } = useGameSounds();
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [spectators, setSpectators] = useState<SpectatorInfo[]>([]);
  const [receivedGifts, setReceivedGifts] = useState<GiftInfo[]>([]);
  const [serverRole, setServerRole] = useState<"player" | "spectator" | null>(null);
  const [playerView, setPlayerView] = useState<Record<string, unknown> | null>(null);
  const [localTimerTick, setLocalTimerTick] = useState(0);
  const [drawOffered, setDrawOffered] = useState<string | null>(null); // offeredBy userId
  const [wsConnState, setWsConnState] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(Date.now());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intentionalCloseRef = useRef(false);
  const wsErrorToastRef = useRef<{ signature: string; at: number }>({ signature: "", at: 0 });

  const { data: challenge, isLoading } = useQuery<Challenge>({
    queryKey: ["/api/challenges", challengeId],
    enabled: !!challengeId,
  });

  // Fetch dynamic commission/surrender settings for this game type
  const { data: challengeConfig } = useQuery<{
    commissionPercent: string;
    surrenderWinnerPercent: string;
    surrenderLoserRefundPercent: string;
    withdrawPenaltyPercent: string;
  }>({
    queryKey: ["/api/challenge-config", challenge?.gameType],
    enabled: !!challenge?.gameType,
  });

  const isPlayer = serverRole === "player" || (serverRole === null && user && (
    challenge?.player1Id === user.id ||
    challenge?.player2Id === user.id ||
    challenge?.player3Id === user.id ||
    challenge?.player4Id === user.id
  ));
  const isSpectator = serverRole === "spectator" || (serverRole === null && !isPlayer);
  const canPlayActions = Boolean(isPlayer && !isSpectator);
  const myColor = challenge?.player1Id === user?.id ? "white" : "black";

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
    if (!challengeId || !user) return;

    const connect = () => {
      const token = localStorage.getItem("pwm_token");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnState("connected");
        reconnectAttemptRef.current = 0;
        ws.send(JSON.stringify({ type: "auth", token }));
        ws.send(JSON.stringify({
          type: "join_challenge_game",
          challengeId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ChallengeWSMessage;
          handleWebSocketMessage(data);
        } catch {
          showWsErrorToast(t("common.retry"), "invalid_server_message");
        }
      };

      ws.onclose = (event) => {
        setServerRole(null);
        if (intentionalCloseRef.current || event.code === 4001) return;
        // Auto-reconnect with exponential backoff (max 10s)
        const attempt = reconnectAttemptRef.current++;
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        setWsConnState("reconnecting");
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    };

    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "leave_challenge_game", challengeId }));
      }
      wsRef.current?.close();
    };
  }, [challengeId, user]);

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
    if (isWsErrorType(data.type)) {
      const { message, code } = extractWsErrorInfo(data);
      if (message) {
        showWsErrorToast(message, code);
      }
      return;
    }

    switch (data.type) {
      case "role_assigned":
        setServerRole(data.role ?? null);
        break;
      case "game_state_sync":
        lastSyncRef.current = Date.now();
        if (data.session) setGameSession(data.session);
        if (data.view) setPlayerView(data.view);
        break;
      case "game_move":
        lastSyncRef.current = Date.now();
        if (data.session) setGameSession(prev => prev ? { ...prev, ...data.session } : null);
        if (data.view) setPlayerView(data.view);
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
          const gift = data.gift;
          setReceivedGifts(prev => [...prev, gift]);
          toast({
            title: t('challenge.newGift'),
            description: `${gift.senderName} sent ${gift.giftName}`,
          });
          setTimeout(() => {
            setReceivedGifts(prev => prev.filter(g => g.id !== gift.id));
          }, 3000);
        }
        break;
      case "game_ended":
        setGameSession(prev => prev ? { ...prev, status: "finished", winnerId: data.winnerId ?? undefined, winReason: data.reason ?? undefined } : null);
        setDrawOffered(null);
        if (data.winnerId === user?.id) playSound("gameWin");
        else if (data.reason === "draw_agreement") playSound("draw");
        else playSound("gameLose");
        break;
      case "draw_offered":
        setDrawOffered(data.offeredBy ?? null);
        playSound("draw");
        toast({
          title: t('challenge.drawOffered'),
          description: t('challenge.opponentOffersDraw'),
        });
        break;
      case "draw_declined":
        setDrawOffered(null);
        toast({
          title: t('challenge.drawDeclined'),
          description: t('challenge.drawDeclinedDesc'),
        });
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
        setGameSession(prev => prev ? { ...prev, spectatorCount: (data.count as number) ?? 0 } : null);
        break;
    }
  }, [toast, playSound, user, gameSession?.gameType, showWsErrorToast]);

  const sendMove = useCallback((move: object) => {
    if (!canPlayActions) {
      showSpectatorActionBlocked();
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "game_move",
        challengeId,
        move,
      }));
    }
  }, [challengeId, canPlayActions, showSpectatorActionBlocked]);

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
    sendMove({ type: "pass" });
  }, [sendMove]);

  // Tarneeb: set trump suit after winning bid
  const sendSetTrump = useCallback((suit: string) => {
    sendMove({ type: "setTrump", suit });
  }, [sendMove]);

  // Baloot: choose game type (sun/hokm)
  const sendChooseTrump = useCallback((gameType: "sun" | "hokm", suit?: string) => {
    sendMove({ type: "choose", gameType, trumpSuit: suit });
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  if (serverRole === null && wsRef.current?.readyState === WebSocket.OPEN) {
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

  // Compute live timer: server time minus elapsed seconds since last sync
  const elapsedSinceSyncSec = Math.floor((Date.now() - lastSyncRef.current) / 1000);
  // Determine whose turn it is to subtract elapsed time from the correct player
  const isMyTurnForTimer = gameSession?.currentTurn === user?.id;
  const serverMyTime = challenge.player1Id === user?.id
    ? gameSession?.player1TimeRemaining || challenge.timeLimit
    : gameSession?.player2TimeRemaining || challenge.timeLimit;
  const serverOppTime = challenge.player1Id === user?.id
    ? gameSession?.player2TimeRemaining || challenge.timeLimit
    : gameSession?.player1TimeRemaining || challenge.timeLimit;
  void localTimerTick; // referenced to trigger re-render
  const myTimeRemaining = Math.max(0, isMyTurnForTimer ? serverMyTime - elapsedSinceSyncSec : serverMyTime);
  const opponentTimeRemaining = Math.max(0, !isMyTurnForTimer ? serverOppTime - elapsedSinceSyncSec : serverOppTime);

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
  const playerIds = [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id].filter(Boolean);
  const mySeatIndex = playerIds.indexOf(user?.id || "");
  const myTeam = mySeatIndex % 2 === 0 ? 0 : 1;

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
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-card">
            <div className="flex items-center gap-3">
              <BackButton />
              <div className="flex items-center gap-2">
                <GameIcon className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  {language === "ar" ? gameInfo.nameAr : gameInfo.nameEn}
                </span>
                <Badge variant={isSpectator ? "outline" : "default"}>
                  {isSpectator
                    ? (language === "ar" ? "مشاهد" : "Spectator")
                    : (language === "ar" ? "لاعب" : "Player")}
                </Badge>
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

              {isPlayer && (
                <VoiceChat
                  challengeId={challengeId!}
                  isEnabled={isVoiceEnabled}
                  onToggle={() => setIsVoiceEnabled(!isVoiceEnabled)}
                  isMuted={isMuted}
                  onMuteToggle={() => setIsMuted(!isMuted)}
                />
              )}
            </div>
          </header>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <div className="flex-1 p-2 sm:p-4 flex flex-col items-center justify-center overflow-y-auto relative">
              <div className="w-full max-w-lg mb-4">
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

              <div className="relative">
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
                    gameState={(gameSession?.gameState as string) || (playerView?.board as string)}
                    currentTurn={gameSession?.currentTurn}
                    myColor={myColor}
                    isMyTurn={gameSession?.currentTurn === user?.id}
                    isSpectator={isSpectator}
                    onMove={canPlayActions ? sendMove : () => { }}
                    status={gameSession?.status}
                  />
                )}
                {challenge.gameType === "domino" && (
                  <DominoBoard
                    gameState={(gameSession?.gameState as string) || (playerView ? JSON.stringify(playerView) : undefined)}
                    currentTurn={gameSession?.currentTurn}
                    isMyTurn={canPlayActions && ((playerView?.isMyTurn as boolean) ?? (gameSession?.currentTurn === user?.id))}
                    isSpectator={isSpectator}
                    onMove={canPlayActions ? sendMove : () => { }}
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
                    onPlayCard={canPlayActions ? sendPlayCard : () => { }}
                    onBid={canPlayActions ? sendBid : () => { }}
                    onPass={canPlayActions ? sendPass : () => { }}
                    onSetTrump={canPlayActions ? sendSetTrump : () => { }}
                  />
                )}
                {challenge.gameType === "baloot" && (
                  <BalootBoard
                    gameState={playerView as BalootState | null}
                    playerId={isSpectator ? "__spectator__" : (user?.id || "")}
                    playerPosition={isSpectator ? 0 : ((playerView?.playerPosition as number) ?? 0)}
                    onPlayCard={canPlayActions ? sendPlayCard : () => { }}
                    onChooseTrump={canPlayActions ? sendChooseTrump : () => { }}
                    onPass={canPlayActions ? sendPass : () => { }}
                  />
                )}
              </div>

              <div className="w-full max-w-lg mt-4">
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
                <GameChat
                  messages={messages as unknown as { id: string; senderId: string; senderName: string; message: string; createdAt: string }[]}
                  onSendMessage={sendChatMessage}
                  quickMessages={QUICK_MESSAGES}
                  language={language}
                />
              )}
            </div>

            {/* Spectator sidebar - only shown for spectators */}
            {isSpectator && (
              <div className="w-full lg:w-80 border-s flex flex-col bg-card max-h-[30vh] lg:max-h-none">
                <SpectatorPanel
                  challengeId={challengeId!}
                  player1={challenge.player1}
                  player2={challenge.player2}
                  spectatorCount={gameSession?.spectatorCount || 0}
                  totalMoves={gameSession?.totalMoves}
                  currentTurn={gameSession?.currentTurn}
                  gameStatus={gameSession?.status}
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
                {gameSession.winReason === "stalemate" && (language === "ar" ? "طريق مسدود" : "Stalemate")}
                {gameSession.winReason === "gammon" && (language === "ar" ? "غامون!" : "Gammon!")}
                {gameSession.winReason === "backgammon" && (language === "ar" ? "باكغامون!" : "Backgammon!")}
                {gameSession.winReason === "double_declined" && (language === "ar" ? "رفض المضاعفة" : "Double declined")}
                {gameSession.winReason === "target_reached" && (language === "ar" ? "وصل للهدف" : "Target score reached")}
                {gameSession.winReason === "normal" && (language === "ar" ? "فوز عادي" : "Normal win")}
                {gameSession.winReason === "draw_agreement" && (language === "ar" ? "تعادل بالاتفاق" : "Draw by agreement")}
              </p>
              {canPlayActions && gameSession.winnerId === user?.id && (
                <p className="text-lg font-bold text-green-500 mt-2">
                  +${(parseFloat(challenge.betAmount) * 2 * (1 - parseFloat(challengeConfig?.commissionPercent || '5') / 100)).toFixed(2)}
                </p>
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
    </div>
  );
}
