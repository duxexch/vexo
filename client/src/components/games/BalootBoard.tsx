import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Crown, Zap, Eye, Timer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cardSounds } from "@/lib/game-sounds";

interface BalootBoardProps {
  gameState: BalootState | null;
  playerId: string;
  playerPosition: number;
  onPlayCard: (card: PlayingCard) => void;
  onChooseTrump: (type: "sun" | "hokm", suit?: string) => void;
  onPass: () => void;
  playerNames?: { [id: string]: string };
}

interface PlayingCard {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: string;
  value: number;
}

export interface BalootState {
  phase: "choosing" | "playing" | "finished";
  hands: { [playerId: string]: PlayingCard[] };
  hand?: PlayingCard[];
  otherHandCounts?: { [playerId: string]: number };
  currentTrick: { playerId: string; card: PlayingCard }[];
  lastCompletedTrick?: { playerId: string; card: PlayingCard }[];
  gameType: "sun" | "hokm" | null;
  trumpSuit: string | null;
  currentPlayer: string;
  currentTurn?: string;
  isMyTurn?: boolean;
  gamePhase?: string;
  choosingPlayer: string;
  playerOrder?: string[];
  myTeam?: number;
  partner?: string;
  tricksWon: { team0: number; team1: number };
  totalPoints?: { team0: number; team1: number };
  roundPoints: { team0: number; team1: number };
  projects: { playerId: string; project: string; points: number }[];
  dealerId?: string;
  winningTeam?: number;
  validMoves?: PlayingCard[];
  trickLeader?: string;
  roundNumber?: number;
  targetPoints?: number;
  lastTrickWinner?: string;
  passRound?: number;
  lastRoundPoints?: { team0: number; team1: number };
  lastRoundGameType?: "sun" | "hokm" | null;
  lastRoundKaboot?: boolean;
  lastRoundProjects?: { playerId: string; project: string; points: number }[];
  passCount?: number;
  lastChoice?: { playerId: string; gameType: string; trumpSuit?: string | null };
  lastTrickPoints?: number;
}

const SUITS = {
  hearts: { symbol: "♥", color: "text-red-500", nameAr: "هاص", nameEn: "Hearts" },
  diamonds: { symbol: "♦", color: "text-red-500", nameAr: "ديناري", nameEn: "Diamonds" },
  clubs: { symbol: "♣", color: "text-foreground", nameAr: "كلفس", nameEn: "Clubs" },
  spades: { symbol: "♠", color: "text-foreground", nameAr: "سبيت", nameEn: "Spades" }
};

// ─── Constants (outside component to avoid re-creation) ─────────
const TURN_TIME_LIMIT = 60; // 60 seconds per turn
const CHOOSE_TIME_LIMIT = 30; // 30 seconds to choose
const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
const RANK_VALUE: Record<string, number> = { '7': 1, '8': 2, '9': 3, '10': 4, 'J': 5, 'Q': 6, 'K': 7, 'A': 8 };

export function BalootBoard({
  gameState,
  playerId,
  playerPosition,
  onPlayCard,
  onChooseTrump,
  onPass,
  playerNames = {},
}: BalootBoardProps) {
  const [selectedCard, setSelectedCard] = useState<PlayingCard | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(-1);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showLastTrick, setShowLastTrick] = useState(false);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [trickWonBy, setTrickWonBy] = useState<string | null>(null);
  const [trickWonPoints, setTrickWonPoints] = useState<number>(0);
  const [trickSweep, setTrickSweep] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_TIME_LIMIT);
  const [shakeCardKey, setShakeCardKey] = useState<string | null>(null);
  const [showKabootOverlay, setShowKabootOverlay] = useState(false);
  const [showChoiceNotification, setShowChoiceNotification] = useState(false);
  const turnTimerRef = useRef<ReturnType<typeof setInterval>>();
  const prevTricksRef = useRef(0);
  const prevRoundRef = useRef(1);
  const prevTrickLength = useRef(0);
  const prevChoiceRef = useRef<string | null>(null);
  const { t, language } = useI18n();
  const isAr = language === "ar";

  const state = gameState || {
    phase: "choosing" as const,
    hands: {},
    currentTrick: [],
    gameType: null,
    trumpSuit: null,
    currentPlayer: "",
    choosingPlayer: "",
    tricksWon: { team0: 0, team1: 0 },
    totalPoints: { team0: 0, team1: 0 },
    roundPoints: { team0: 0, team1: 0 },
    projects: [],
  };

  const rawHand = state.hand || state.hands?.[playerId] || [];
  // Sort hand by suit then by rank value descending
  const myHand = useMemo(() => {
    return [...rawHand].sort((a, b) => {
      const suitDiff = (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9);
      if (suitDiff !== 0) return suitDiff;
      return (RANK_VALUE[b.rank] ?? 0) - (RANK_VALUE[a.rank] ?? 0);
    });
  }, [rawHand]);
  // Dynamic card overlap for responsive touch targets
  const cardOverlap = myHand.length <= 3 ? -8 : myHand.length <= 5 ? -16 : -24;
  const gamePhase = state.gamePhase || state.phase;
  const isMyTurn = state.isMyTurn ?? state.currentPlayer === playerId;
  const isMyChoice = state.choosingPlayer === playerId;
  const myTeam = state.myTeam ?? (playerPosition % 2 === 0 ? 0 : 1);
  const passRound = (state as BalootState).passRound ?? 1;
  // Team-aware score helpers: "us" = myTeam, "them" = opponent
  const usKey = myTeam === 0 ? 'team0' : 'team1';
  const themKey = myTeam === 0 ? 'team1' : 'team0';  const usTotal = state.totalPoints?.[usKey as 'team0' | 'team1'] ?? 0;
  const themTotal = state.totalPoints?.[themKey as 'team0' | 'team1'] ?? 0;
  const target = state.targetPoints ?? 152;
  // ─── Project labels via i18n ────────────────────────────────────
  const projectLabels: Record<string, string> = useMemo(() => ({
    sra: t('baloot.projectSra'),
    "arba'in": t('baloot.projectArbain'),
    khamsin: t('baloot.projectKhamsin'),
    "mi'a": t('baloot.projectMia'),
    jami: t('baloot.projectJami'),
    baloot: t('baloot.projectBaloot'),
  }), [t]);

  // ─── Chooser name for waiting message ──────────────────────────
  const chooserName = useMemo(() => {
    const cid = state.choosingPlayer;
    if (!cid) return '';
    return playerNames[cid] || (cid.startsWith('bot-') ? (t('common.bot') || 'Bot') : `P${cid.slice(-3)}`);
  }, [state.choosingPlayer, playerNames, t]);

  // ─── Get opponent ID for a given screen position ───────────────
  const getOppId = useCallback((position: "left" | "top" | "right"): string => {
    const order = state.playerOrder || [];
    const myIdx = order.indexOf(playerId);
    if (myIdx === -1) return "";
    const offsets: Record<string, number> = { left: 1, top: 2, right: 3 };
    return order[(myIdx + offsets[position]) % 4] || "";
  }, [state.playerOrder, playerId]);

  // ─── Player name helper ─────────────────────────────────────────
  const getPlayerName = useCallback((position: "left" | "top" | "right"): string => {
    const order = state.playerOrder || [];
    const myIdx = order.indexOf(playerId);
    if (myIdx === -1) return "";
    const offsets: Record<string, number> = { left: 1, top: 2, right: 3 };
    const oppIdx = (myIdx + offsets[position]) % 4;
    const oppId = order[oppIdx];
    if (!oppId) return "";
    if (playerNames[oppId]) return playerNames[oppId];
    if (oppId.startsWith("bot-")) return isAr ? "بوت" : "Bot";
    return `P${oppId.slice(-3)}`;
  }, [state.playerOrder, playerId, playerNames, isAr]);

  const getPlayerTeamLabel = useCallback((position: "left" | "top" | "right"): string => {
    const order = state.playerOrder || [];
    const myIdx = order.indexOf(playerId);
    if (myIdx === -1) return "";
    const offsets: Record<string, number> = { left: 1, top: 2, right: 3 };
    const oppIdx = (myIdx + offsets[position]) % 4;
    const isPartner = oppIdx % 2 === myIdx % 2;
    return isPartner ? t('baloot.partner') : "";
  }, [state.playerOrder, playerId, t]);

  const getOpponentCardCount = (position: "top" | "left" | "right"): number => {
    if (state.otherHandCounts) {
      const oppId = getOppId(position);
      return oppId ? (state.otherHandCounts[oppId] ?? 8) : 8;
    }
    return 8;
  };

  // ─── Turn Timer with auto-play ──────────────────────────────────
  useEffect(() => {
    const isPlayTurn = isMyTurn && gamePhase === "playing";
    const isChooseTurn = isMyChoice && gamePhase === "choosing";
    if (isPlayTurn || isChooseTurn) {
      const timeLimit = isChooseTurn ? CHOOSE_TIME_LIMIT : TURN_TIME_LIMIT;
      setTurnTimeLeft(timeLimit);
      turnTimerRef.current = setInterval(() => {
        setTurnTimeLeft(prev => {
          if (prev <= 1) {
            if (isChooseTurn) {
              // Auto-pass in round 1, auto-choose sun in round 2
              if (passRound >= 2) {
                onChooseTrump("sun");
              } else {
                onPass();
              }
            } else {
              // Auto-play lowest-point valid card on timeout (minimize loss)
              const validCards = state.validMoves && state.validMoves.length > 0 ? state.validMoves : [];
              if (validCards.length > 0) {
                const HOKM_PTS: Record<string, number> = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3 };
                const SUN_PTS: Record<string, number> = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2 };
                const sorted = [...validCards].sort((a, b) => {
                  const aPts = (state.gameType === 'hokm' && a.suit === state.trumpSuit) ? (HOKM_PTS[a.rank] || 0) : (SUN_PTS[a.rank] || 0);
                  const bPts = (state.gameType === 'hokm' && b.suit === state.trumpSuit) ? (HOKM_PTS[b.rank] || 0) : (SUN_PTS[b.rank] || 0);
                  return aPts - bPts;
                });
                onPlayCard(sorted[0]);
              }
            }
            return 0;
          }
          if (prev === 11) {
            cardSounds.yourTurn();
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTurnTimeLeft(TURN_TIME_LIMIT);
    }
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
  }, [isMyTurn, isMyChoice, gamePhase, state.currentTurn, passRound]);

  const activeTimeLimit = (isMyChoice && gamePhase === "choosing") ? CHOOSE_TIME_LIMIT : TURN_TIME_LIMIT;
  const timerPercent = (turnTimeLeft / activeTimeLimit) * 100;
  const timerColor = timerPercent > 50 ? "bg-green-500" : timerPercent > 20 ? "bg-yellow-500" : "bg-red-500";
  const timerUrgent = turnTimeLeft <= 10;

  // ─── Sound on every card played (opponent & bot cards too) ─────
  useEffect(() => {
    const trickLen = state.currentTrick?.length || 0;
    if (trickLen > prevTrickLength.current && prevTrickLength.current >= 0) {
      cardSounds.playCard();
    }
    prevTrickLength.current = trickLen;
  }, [state.currentTrick?.length]);

  // ─── Trick won detection (sweep animation) ─────────────────────
  useEffect(() => {
    const totalTricks = (state.tricksWon?.team0 || 0) + (state.tricksWon?.team1 || 0);
    if (totalTricks > prevTricksRef.current && prevTricksRef.current > 0) {
      setTrickSweep(true);
      if (state.lastTrickWinner) setTrickWonBy(state.lastTrickWinner);
      setTrickWonPoints(state.lastTrickPoints || 0);
      const sweepTimer = setTimeout(() => setTrickSweep(false), 600);
      const clearTimer = setTimeout(() => { setTrickWonBy(null); setTrickWonPoints(0); }, 2500);
      return () => { clearTimeout(sweepTimer); clearTimeout(clearTimer); };
    }
    prevTricksRef.current = totalTricks;
  }, [state.tricksWon]);

  // ─── Round summary detection ───────────────────────────────────
  useEffect(() => {
    const currentRound = state.roundNumber || 1;
    if (currentRound > prevRoundRef.current) {
      setShowRoundSummary(true);      // Show kaboot overlay if kaboot happened
      if (state.lastRoundKaboot) {
        setShowKabootOverlay(true);
        setTimeout(() => setShowKabootOverlay(false), 3000);
      }      const timer = setTimeout(() => setShowRoundSummary(false), 12000);
      prevRoundRef.current = currentRound;
      return () => clearTimeout(timer);
    }
    prevRoundRef.current = currentRound;
  }, [state.roundNumber]);

  // ── Choice notification detection ──────────────────────────────
  useEffect(() => {
    const choiceKey = state.lastChoice ? `${state.roundNumber || 1}-${state.lastChoice.playerId}-${state.lastChoice.gameType}` : null;
    if (choiceKey && choiceKey !== prevChoiceRef.current) {
      setShowChoiceNotification(true);
      const timer = setTimeout(() => setShowChoiceNotification(false), 3000);
      prevChoiceRef.current = choiceKey;
      return () => clearTimeout(timer);
    }
    prevChoiceRef.current = choiceKey;
  }, [state.lastChoice]);

  // ─── Confetti celebration on game win ──────────────────────────
  useEffect(() => {
    if (gamePhase === "finished" && state.winningTeam === myTeam) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [gamePhase, state.winningTeam]);

  // ─── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gamePhase === "choosing" && isMyChoice) {
        if (e.key === "s" || e.key === "S" || e.key === "ص") {
          e.preventDefault();
          onChooseTrump("sun");
        } else if (e.key === "p" || e.key === "P" || e.key === "ب") {
          e.preventDefault();
          onPass();
        } else if (e.key === "1") { onChooseTrump("hokm", "hearts"); }
        else if (e.key === "2") { onChooseTrump("hokm", "diamonds"); }
        else if (e.key === "3") { onChooseTrump("hokm", "clubs"); }
        else if (e.key === "4") { onChooseTrump("hokm", "spades"); }
        return;
      }

      if (gamePhase !== "playing" || !isMyTurn) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        setSelectedCardIndex(prev => {
          const next = prev + dir;
          if (next < 0) return myHand.length - 1;
          if (next >= myHand.length) return 0;
          return next;
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (selectedCard) {
          onPlayCard(selectedCard);
          setSelectedCard(null);
          setSelectedCardIndex(-1);
        } else if (selectedCardIndex >= 0 && selectedCardIndex < myHand.length) {
          const card = myHand[selectedCardIndex];
          if (isValidPlay(card)) {
            onPlayCard(card);
            setSelectedCard(null);
            setSelectedCardIndex(-1);
          }
        }
      } else if (e.key === "Escape") {
        setSelectedCard(null);
        setSelectedCardIndex(-1);
      }

      // Escape closes overlays regardless of game phase
      if (e.key === "Escape") {
        if (showLastTrick) { setShowLastTrick(false); e.preventDefault(); }
        if (showRoundSummary) { setShowRoundSummary(false); e.preventDefault(); }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gamePhase, isMyTurn, isMyChoice, myHand, selectedCard, selectedCardIndex, showLastTrick, showRoundSummary]);

  // Sync selectedCardIndex with selectedCard
  useEffect(() => {
    if (selectedCardIndex >= 0 && selectedCardIndex < myHand.length) {
      const card = myHand[selectedCardIndex];
      if (isValidPlay(card)) {
        setSelectedCard(card);
      }
    }
  }, [selectedCardIndex]);

  const handleCardClick = (card: PlayingCard, index: number) => {
    if (!isMyTurn || gamePhase !== "playing") return;
    if (isValidPlay(card)) {
      setSelectedCard(card);
      setSelectedCardIndex(index);
    } else {
      // Shake invalid card
      const key = `${card.suit}-${card.rank}`;
      setShakeCardKey(key);
      setTimeout(() => setShakeCardKey(null), 500);
    }
  };

  const handlePlayCard = () => {
    if (selectedCard) {
      onPlayCard(selectedCard);
      setSelectedCard(null);
      setSelectedCardIndex(-1);
    }
  };

  const handleCardDoubleClick = (card: PlayingCard) => {
    if (!isMyTurn || gamePhase !== "playing") return;
    if (isValidPlay(card)) {
      onPlayCard(card);
      setSelectedCard(null);
      setSelectedCardIndex(-1);
    }
  };

  const isValidPlay = (card: PlayingCard): boolean => {
    if (state.validMoves && state.validMoves.length > 0) {
      return state.validMoves.some(c => c.suit === card.suit && c.rank === card.rank);
    }
    if (!state.currentTrick || state.currentTrick.length === 0) return true;
    const leadSuit = state.currentTrick[0].card.suit;
    const hasSuit = myHand.some(c => c.suit === leadSuit);
    if (hasSuit) return card.suit === leadSuit;
    return true;
  };

  const renderCard = (card: PlayingCard, isPlayable: boolean, index: number) => {
    const suit = SUITS[card.suit];
    const isSelected = selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
    const isKeyboardSelected = selectedCardIndex === index;
    const isTrump = state.trumpSuit === card.suit;

    return (
      <div
        key={`${card.suit}-${card.rank}`}
        data-testid={`baloot-card-${card.suit}-${card.rank}`}
        role="button"
        tabIndex={isPlayable ? 0 : -1}
        aria-label={`${card.rank} ${t('baloot.' + card.suit)}${isTrump ? ` (${t('baloot.trumpCard')})` : ""}${isSelected ? ` - ${t('baloot.selected')}` : ""}`}
        onClick={() => handleCardClick(card, index)}
        onDoubleClick={() => isPlayable && handleCardDoubleClick(card)}
        className={`
          relative w-12 h-[4.5rem] sm:w-14 sm:h-20 bg-white rounded-lg border-2 shadow-md
          flex flex-col items-center justify-between p-1
          transition-all duration-200 animate-card-deal
          ${isPlayable ? "cursor-pointer hover:-translate-y-2 focus:outline-none focus:ring-2 focus:ring-primary" : "opacity-70"}
          ${isSelected ? "ring-2 ring-primary -translate-y-4" : ""}
          ${isKeyboardSelected && !isSelected ? "ring-2 ring-blue-400 -translate-y-2" : ""}
          ${isTrump ? "ring-1 ring-yellow-500" : ""}
          ${!isPlayable && isMyTurn && gamePhase === "playing" ? "cursor-not-allowed" : ""}
          ${shakeCardKey === `${card.suit}-${card.rank}` ? "animate-shake" : ""}
        `}
        style={{ marginLeft: index > 0 ? `${cardOverlap}px` : "0", animationDelay: `${index * 50}ms` }}
      >
        <div className={`text-xs font-bold ${suit.color}`}>{card.rank}</div>
        <div className={`text-2xl ${suit.color}`}>{suit.symbol}</div>
        <div className={`text-xs font-bold ${suit.color} rotate-180`}>{card.rank}</div>
        {isTrump && <Crown className="absolute -top-1 -end-1 h-3 w-3 text-yellow-500" />}
      </div>
    );
  };

  const renderOpponentHand = (position: "top" | "left" | "right", cardCount: number) => {
    const isVertical = position === "left" || position === "right";
    const name = getPlayerName(position);
    const teamLabel = getPlayerTeamLabel(position);
    // Get opponent ID for turn/dealer/bot checks
    const oppId = getOppId(position);
    const order = state.playerOrder || [];
    const myIdx = order.indexOf(playerId);
    const oppIdx = order.indexOf(oppId);
    const isTurn = (state.currentTurn || state.currentPlayer) === oppId;
    const isDealer = state.dealerId === oppId;
    const isBot = oppId.startsWith("bot-");
    const isPartner = myIdx >= 0 && oppIdx >= 0 && oppIdx % 2 === myIdx % 2;

    return (
      <div
        className={`flex flex-col items-center gap-1 ${isTurn ? "scale-110" : ""} transition-all duration-300`}
        data-testid={`baloot-opponent-${position}`}
        aria-label={`${name} - ${cardCount} ${t('baloot.cards')}`}
      >
        <div className={`flex items-center gap-1.5 text-xs ${isTurn ? "animate-pulse" : ""}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white
              ${isPartner ? "bg-blue-600 ring-2 ring-blue-400" : "bg-red-600 ring-2 ring-red-400"}
              ${isTurn ? "ring-yellow-400 ring-3 shadow-[0_0_12px_rgba(250,204,21,0.6)]" : ""}
            `}
          >
            {name[0]?.toUpperCase()}
          </div>
          <span className={`font-medium truncate max-w-[60px]
            ${isPartner ? "text-blue-300" : "text-red-300"}
            ${isTurn ? "text-yellow-400 font-bold" : ""}
          `}>{name}</span>
          {isDealer && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-yellow-900/50 border-yellow-600 text-yellow-300">
              D
            </Badge>
          )}
          {isBot && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-gray-900/50 border-gray-500 text-gray-300">
              🤖
            </Badge>
          )}
          {teamLabel && <Badge variant="secondary" className="text-[10px] px-1 py-0">{teamLabel}</Badge>}
        </div>
        <div className={`flex ${isVertical ? "flex-col" : ""} items-center`}>
          {Array.from({ length: Math.min(cardCount, 8) }).map((_, i) => (
            <div
              key={i}
              className={`
                w-10 h-14 bg-gradient-to-br from-green-900 to-green-700
                rounded-lg border-2 border-green-800 shadow-md
                ${isVertical ? "mt-[-24px]" : "ml-[-24px]"}
              `}
              style={i === 0 ? { marginLeft: 0, marginTop: 0 } : {}}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderTrick = () => {
    // Map each card to the correct screen position relative to the current player
    const order = state.playerOrder || [];
    const myIdx = order.indexOf(playerId);

    return (
    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${trickSweep ? "animate-trick-sweep" : ""}`}>
      <div className="relative w-28 h-28">
        {state.currentTrick.map((play, i) => {
          // Position cards based on the player's seat relative to viewer
          const allPositions: React.CSSProperties[] = [
            { bottom: 0, left: "50%", transform: "translateX(-50%)" },   // bottom (me)
            { left: 0, top: "50%", transform: "translateY(-50%)" },      // left
            { top: 0, left: "50%", transform: "translateX(-50%)" },      // top
            { right: 0, top: "50%", transform: "translateY(-50%)" },     // right
          ];
          const playerIdx = order.indexOf(play.playerId);
          const relativePos = myIdx >= 0 && playerIdx >= 0
            ? (playerIdx - myIdx + 4) % 4
            : i % 4;
          const pos = allPositions[relativePos];
          const suit = SUITS[play.card.suit];

          return (
            <div
              key={i}
              className="absolute w-12 h-16 bg-white rounded-lg border shadow-lg flex flex-col items-center justify-center animate-card-play"
              style={{ ...pos, animationDelay: `${i * 80}ms` }}
              aria-label={`${play.card.rank} ${t('baloot.' + play.card.suit)}`}
            >
              <span className={`text-xs sm:text-sm font-bold ${suit.color}`}>{play.card.rank}</span>
              <span className={`text-xl ${suit.color}`}>{suit.symbol}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  };

  const renderChoosingPhase = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10" role="dialog" aria-label={t('baloot.chooseGameType')}>
      <Card className="w-full max-w-96 px-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('baloot.chooseGameType')}
            {passRound >= 2 && (
              <Badge variant="destructive" className="text-xs ms-2">{t('baloot.round2MustChoose')}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Pass progress indicator */}
          {state.passCount != null && state.passCount > 0 && passRound < 2 && (
            <div className="flex justify-center mb-3">
              <Badge variant="outline" className="text-xs">
                {state.passCount}/4 {t('baloot.passed')}
              </Badge>
            </div>
          )}
          {isMyChoice ? (
            <div className="space-y-4">
              {/* Partner identity indicator */}
              {state.partner && (
                <div className="flex justify-center">
                  <Badge variant="outline" className="text-xs bg-blue-900/30 border-blue-500/50 text-blue-300">
                    {t('baloot.partner')}: {playerNames[state.partner] || state.partner?.slice(-4)}
                  </Badge>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full h-16 text-lg"
                onClick={() => onChooseTrump("sun")}
                data-testid="button-choose-sun"
                aria-label={`${t('baloot.sunNoTrump')} - S`}
              >
                <Zap className="me-2 h-6 w-6 text-yellow-500" />
                {t('baloot.sunNoTrump')}
                <kbd className="ms-2 text-xs text-muted-foreground border px-1 rounded">S</kbd>
              </Button>

              <div className="space-y-2">
                <p className="text-xs sm:text-sm text-muted-foreground text-center">
                  {t('baloot.orChooseTrump')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(SUITS).map(([suit, info], idx) => (
                    <Button
                      key={suit}
                      variant="outline"
                      className="h-12"
                      onClick={() => onChooseTrump("hokm", suit)}
                      data-testid={`button-choose-hokm-${suit}`}
                      aria-label={`${t('baloot.hokm')} ${t('baloot.' + suit)} - ${idx + 1}`}
                    >
                      <span className={`text-2xl ${info.color} me-2`}>{info.symbol}</span>
                      {t('baloot.' + suit)}
                      <kbd className="ms-1 text-xs text-muted-foreground border px-1 rounded">{idx + 1}</kbd>
                    </Button>
                  ))}
                </div>
              </div>

              {passRound < 2 && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={onPass}
                  data-testid="button-baloot-pass"
                  aria-label={`${t('baloot.pass')} - P`}
                >
                  {t('baloot.pass')}
                  <kbd className="ms-2 text-xs text-muted-foreground border px-1 rounded">P</kbd>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {t('baloot.waitingForPlayerName')} <span className="font-bold text-foreground">{chooserName}</span> {t('baloot.toChoose')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="relative w-full h-[min(550px,calc(100vh-120px))] bg-game-felt rounded-xl p-4" style={{ touchAction: "manipulation" }} data-testid="baloot-board" role="region" aria-label={t('baloot.board')}>
      {/* ── Turn Timer Bar + Seconds Display ── */}
      {((isMyTurn && gamePhase === "playing") || (isMyChoice && gamePhase === "choosing")) && (
        <div className="absolute top-0 start-0 end-0 z-30">
          <div className={`h-1.5 bg-black/20 rounded-t-xl overflow-hidden ${timerUrgent ? "animate-pulse" : ""}`} aria-label={`${t('baloot.timeRemaining')}: ${Math.floor(turnTimeLeft / 60)}:${String(turnTimeLeft % 60).padStart(2, "0")}`}>
            <div
              className={`h-full ${timerColor} transition-all duration-1000 ease-linear`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2">
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/50 ${timerUrgent ? 'text-red-400' : 'text-white/80'}`}>
              {turnTimeLeft}s
            </span>
          </div>
        </div>
      )}

      {/* Game info header */}
      <div className="absolute top-2 start-2 end-2 flex justify-between items-center z-20">
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-background/80">
            {t('baloot.us')}: {state.roundPoints[usKey as keyof typeof state.roundPoints]}{state.gameType === 'sun' ? ' ×2' : ''}
          </Badge>
          <Badge variant="outline" className="bg-background/80">
            {t('baloot.them')}: {state.roundPoints[themKey as keyof typeof state.roundPoints]}{state.gameType === 'sun' ? ' ×2' : ''}
          </Badge>
          <Badge variant="outline" className="bg-background/80 text-xs">
            {t('baloot.tricksWonCount')}: {state.tricksWon[usKey as keyof typeof state.tricksWon]}-{state.tricksWon[themKey as keyof typeof state.tricksWon]}
          </Badge>
          {gamePhase === 'playing' && (
            <Badge variant="outline" className="bg-background/80 text-xs font-bold border-yellow-500/50">
              ⚔ {(state.tricksWon?.team0 || 0) + (state.tricksWon?.team1 || 0)}/8
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {state.gameType && (
            <Badge className={`bg-background/80 ${state.gameType === "sun" ? "text-yellow-500" : ""}`}>
              {state.gameType === "sun" ? (
                <><Zap className="h-3 w-3 me-1" />{t('baloot.sun')}</>
              ) : (
                <>
                  <span className={SUITS[state.trumpSuit as keyof typeof SUITS]?.color}>
                    {SUITS[state.trumpSuit as keyof typeof SUITS]?.symbol}
                  </span>
                  <span className="ms-1">{t('baloot.hokm')}</span>
                </>
              )}
            </Badge>
          )}

          {state.roundNumber && (
            <Badge variant="outline" className="bg-background/80 text-xs">
              {t('baloot.round')} {state.roundNumber}
            </Badge>
          )}
        </div>
      </div>

      {/* Total scores */}
      <div className="absolute top-10 start-2 end-2 flex justify-center gap-4 z-20">
        <Badge className={`bg-blue-600 ${usTotal >= target * 0.8 ? 'ring-1 ring-blue-300' : ''}`}>{t('baloot.totalUs')}: {usTotal}/{target}</Badge>
        <Badge className={`bg-red-600 ${themTotal >= target * 0.8 ? 'ring-1 ring-red-300' : ''}`}>{t('baloot.totalThem')}: {themTotal}/{target}</Badge>
        {/* Last trick peek button */}
        {state.lastCompletedTrick && state.lastCompletedTrick.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/60"
            onClick={() => setShowLastTrick(prev => !prev)}
            aria-label={t('baloot.showLastTrick')}
            data-testid="button-last-trick"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Projects display + chooser indicator */}
      {state.projects.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-1 z-20 flex-wrap justify-center">
          {state.projects.map((p, i) => {
            const isUs = p.playerId === playerId || p.playerId === state.partner;
            return (
              <Badge key={i} variant="secondary" className={`text-xs animate-in zoom-in ${isUs ? 'border-blue-500/60 text-blue-300' : 'border-red-500/60 text-red-300'}`}>
                {projectLabels[p.project] || p.project}
              </Badge>
            );
          })}
        </div>
      )}
      {gamePhase === "playing" && state.choosingPlayer && (
        <div className="absolute top-16 end-2 z-20">
          <Badge variant="outline" className="text-[10px] bg-purple-900/50 border-purple-500 text-purple-300">
            {t('baloot.chooser')}: {playerNames[state.choosingPlayer] || state.choosingPlayer.slice(-4)}
          </Badge>
        </div>
      )}

      {/* Opponent hands */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2">
        {renderOpponentHand("top", getOpponentCardCount("top"))}
      </div>
      <div className="absolute start-2 top-1/2 -translate-y-1/2">
        {renderOpponentHand("left", getOpponentCardCount("left"))}
      </div>
      <div className="absolute end-2 top-1/2 -translate-y-1/2">
        {renderOpponentHand("right", getOpponentCardCount("right"))}
      </div>

      {/* Trick won indicator */}
      {trickWonBy && (() => {
        const order = state.playerOrder || [];
        const myIdx = order.indexOf(playerId);
        const wonIdx = order.indexOf(trickWonBy);
        const isPartnerWon = myIdx >= 0 && wonIdx >= 0 && wonIdx % 2 === myIdx % 2;
        const isSelfWon = trickWonBy === playerId;
        const teamLabel = isSelfWon ? '' : isPartnerWon ? ` (${t('baloot.partner')})` : '';
        return (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-25 pointer-events-none">
            <Badge className={`${isPartnerWon || isSelfWon ? 'bg-green-600' : 'bg-red-600'} text-white text-sm animate-in zoom-in fade-in`}>
              ✓ {t('baloot.trickWon')}{trickWonPoints > 0 ? ` +${trickWonPoints}` : ''} — {playerNames[trickWonBy] || trickWonBy.slice(-4)}{teamLabel}
            </Badge>
          </div>
        );
      })()}

      {/* Current trick */}
      {gamePhase === "playing" && renderTrick()}

      {/* My hand */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex" data-testid="baloot-my-hand" role="group" aria-label={t('baloot.yourHand')}>
        {myHand.map((card, i) => (
          <div key={`${state.roundNumber ?? 1}-${card.suit}-${card.rank}`}>
            {renderCard(card, isMyTurn && gamePhase === "playing", i)}
          </div>
        ))}
      </div>

      {/* Play button */}
      {selectedCard && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20">
          <Button onClick={handlePlayCard} data-testid="button-baloot-play" aria-label={`${t('baloot.playCard')} - Enter`}>
            {t('baloot.play')}
            <kbd className="ms-2 text-xs border px-1 rounded">↵</kbd>
          </Button>
        </div>
      )}

      {/* Choosing phase overlay */}
      {gamePhase === "choosing" && renderChoosingPhase()}

      {/* ── Last Trick Peek Overlay ── */}
      {showLastTrick && state.lastCompletedTrick && state.lastCompletedTrick.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-30" onClick={() => setShowLastTrick(false)} role="dialog" aria-label={t('baloot.lastTrick')}>
          <Card className="px-4">
            <CardHeader>
              <CardTitle className="text-sm">{t('baloot.lastTrick')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {state.lastCompletedTrick.map((play, i) => {
                  const s = SUITS[play.card.suit];
                  const pName = playerNames[play.playerId] || play.playerId.slice(-4);
                  const isWinner = play.playerId === state.lastTrickWinner;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className={`w-12 h-16 bg-white rounded-lg border shadow flex flex-col items-center justify-center ${isWinner ? 'ring-2 ring-yellow-400 border-yellow-400' : ''}`}>
                        <span className={`text-sm font-bold ${s.color}`}>{play.card.rank}</span>
                        <span className={`text-xl ${s.color}`}>{s.symbol}</span>
                      </div>
                      <span className={`text-[10px] truncate max-w-[48px] ${isWinner ? 'text-yellow-400 font-bold' : 'text-muted-foreground'}`}>{pName}{isWinner ? ' ✓' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Round Summary Overlay ── */}
      {showRoundSummary && state.lastRoundPoints && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 cursor-pointer" onClick={() => setShowRoundSummary(false)} role="dialog" aria-label={t('baloot.roundSummary')}>
          <Card className="w-full max-w-72 px-4 text-center animate-in zoom-in">
            <CardHeader>
              <CardTitle className="text-lg">
                {t('baloot.roundSummary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-around">
                <div>
                  <p className="text-xs text-muted-foreground">{t('baloot.us')}</p>
                  <p className="text-xl font-bold text-blue-500">{state.lastRoundPoints[usKey as keyof typeof state.lastRoundPoints]}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('baloot.them')}</p>
                  <p className="text-xl font-bold text-red-500">{state.lastRoundPoints[themKey as keyof typeof state.lastRoundPoints]}</p>
                </div>
              </div>
              {state.lastRoundKaboot && (
                <div className="text-3xl font-black text-red-500 animate-bounce my-2">
                  🔥 {t('baloot.kaboot')} 🔥
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/70 mb-1">
                {isAr ? 'يشمل +10 مكافأة آخر لفة' : 'Includes +10 last trick bonus'}
              </p>
              <p className="text-xs text-muted-foreground">
                {state.lastRoundGameType === "sun"
                  ? `☀️ ${t('baloot.sun')} (×2)`
                  : <>{state.lastChoice?.trumpSuit && SUITS[state.lastChoice.trumpSuit as keyof typeof SUITS] ? (
                      <span className={SUITS[state.lastChoice.trumpSuit as keyof typeof SUITS].color}>
                        {SUITS[state.lastChoice.trumpSuit as keyof typeof SUITS].symbol}{' '}
                      </span>
                    ) : null}{t('baloot.hokm')}</>}
                {state.lastChoice && (
                  <span className="ms-1">— {playerNames[state.lastChoice.playerId] || state.lastChoice.playerId.slice(-4)}</span>
                )}
              </p>
              {state.lastRoundProjects && state.lastRoundProjects.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {state.lastRoundProjects.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {playerNames[p.playerId]?.slice(0, 6) || p.playerId.slice(-4)}: {projectLabels[p.project] || p.project}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">{t('baloot.tapToDismiss')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Game finished */}
      {gamePhase === "finished" && state.winningTeam !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
          <Card className="w-full max-w-80 px-4 text-center">
            <CardHeader>
              <CardTitle className="text-2xl">
                {state.winningTeam === myTeam
                  ? `🎉 ${t('baloot.youWon')}`
                  : `😔 ${t('baloot.youLost')}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold mb-2">
                {state.totalPoints?.[usKey as keyof typeof state.totalPoints] ?? 0} - {state.totalPoints?.[themKey as keyof typeof state.totalPoints] ?? 0}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('baloot.roundPoints')}: {state.roundPoints[usKey as keyof typeof state.roundPoints]} - {state.roundPoints[themKey as keyof typeof state.roundPoints]}
              </p>
              {state.roundNumber && (
                <p className="text-xs text-muted-foreground mt-1">
                  {state.roundNumber} {t('baloot.rounds')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Turn indicator */}
      {isMyTurn && gamePhase === "playing" && !selectedCard && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
          <Badge className="animate-pulse bg-primary flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {t('baloot.yourTurn')}!
          </Badge>
        </div>
      )}

      {/* ── Self-dealer indicator ── */}
      {state.dealerId === playerId && (
        <div className="absolute bottom-24 start-4 z-20">
          <Badge variant="outline" className="bg-yellow-900/50 border-yellow-600 text-yellow-300 text-[10px]">
            D — {t('baloot.dealer')}
          </Badge>
        </div>
      )}

      {/* ── Confetti ── */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-confetti-fall"
              style={{
                left: `${Math.random() * 100}%`,
                top: "-5%",
                backgroundColor: ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#00bcd4", "#4caf50", "#ffeb3b", "#ff9800"][i % 10],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Game Type Chosen Notification ── */}
      {showChoiceNotification && state.lastChoice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in fade-in zoom-in duration-300">
          <Badge className="bg-purple-600 text-white text-sm px-4 py-2 shadow-lg">
            {playerNames[state.lastChoice.playerId] || state.lastChoice.playerId.slice(-4)}
            {' '}
            {state.lastChoice.gameType === 'sun'
              ? `☀️ ${t('baloot.sun')}`
              : `${SUITS[state.lastChoice.trumpSuit as keyof typeof SUITS]?.symbol || '♠'} ${t('baloot.hokm')}`}
          </Badge>
        </div>
      )}

      {/* ── Kaboot Overlay ── */}
      {showKabootOverlay && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none" aria-hidden="true">
          <div className="text-center animate-in zoom-in-50 fade-in duration-500">
            <div className="text-6xl mb-2 animate-bounce">🔥</div>
            <div className="text-4xl font-black text-red-500 drop-shadow-lg animate-pulse">
              {t('baloot.kaboot')}
            </div>
            <div className="text-6xl mt-2 animate-bounce" style={{ animationDelay: '200ms' }}>🔥</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BalootBoard;