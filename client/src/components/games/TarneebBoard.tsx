import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Volume2, VolumeX, Flag, Eye, Star, History, Clock, Layers, Timer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isGameSoundEnabled, toggleGameSound } from "@/lib/game-sounds";

// ─── Turn Timer Constants ────────────────────────────────────────
const TURN_TIME_LIMIT_SEC = 60; // 60 seconds per turn

// ─── Types ───────────────────────────────────────────────────────────
interface PlayingCard {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: string;
  value: number;
  hidden?: boolean;
}

export interface TarneebState {
  phase: "bidding" | "playing" | "finished";
  hands: { [playerId: string]: PlayingCard[] };
  hand?: PlayingCard[];
  otherHandCounts?: { [playerId: string]: number };
  currentTrick: { playerId: string; card: PlayingCard }[];
  trumpSuit: "hearts" | "diamonds" | "clubs" | "spades" | null;
  currentPlayer: string;
  currentTurn?: string;
  isMyTurn?: boolean;
  gamePhase?: string;
  bids: { playerId: string; bid: number | null }[];
  highestBid: { playerId: string; bid: number } | null;
  biddingTeam?: number | null;
  tricksWon: { team0?: number; team1?: number };
  scores: { team0?: number; team1?: number };
  totalScores?: { team0?: number; team1?: number };
  roundScores?: { team0?: number; team1?: number };
  dealerId: string;
  winningTeam?: number;
  myTeam?: number;
  partner?: string;
  playerOrder?: string[];
  trickLeader?: string;
  roundNumber?: number;
  targetScore?: number;
  lastTrickWinner?: string;
  validMoves?: { type: string; card?: string; suit?: string; bid?: number }[];
  lastCompletedTrick?: { playerId: string; card: PlayingCard }[];
  botPlayers?: string[];
  redealCount?: number;
  lastRoundScores?: { team0: number; team1: number };
  lastBidValue?: number;
  lastBiddingTeam?: number;
  lastBiddingTeamMade?: boolean;
  lastIsKaboot?: boolean;
}

interface TarneebBoardProps {
  sessionId: string;
  gameState: TarneebState | null;
  playerId: string;
  playerPosition: number;
  playerNames?: { [id: string]: string };
  onPlayCard: (card: PlayingCard) => void;
  onBid: (bid: number) => void;
  onPass: () => void;
  onSetTrump?: (suit: string) => void;
  onResign?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────
const SUITS: Record<string, { symbol: string; color: string; nameAr: string; nameEn: string }> = {
  hearts:   { symbol: "♥", color: "text-red-500",     nameAr: "كبة",    nameEn: "Hearts" },
  diamonds: { symbol: "♦", color: "text-red-500",     nameAr: "ديناري", nameEn: "Diamonds" },
  clubs:    { symbol: "♣", color: "text-foreground",  nameAr: "سباتي",  nameEn: "Clubs" },
  spades:   { symbol: "♠", color: "text-foreground",  nameAr: "بستوني", nameEn: "Spades" },
};

const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };

// ─── Helpers ─────────────────────────────────────────────────────────
type Seat = "bottom" | "left" | "top" | "right";
const SEAT_ORDER: Seat[] = ["bottom", "left", "top", "right"];

function getSeatForPlayer(playerId: string, playerOrder: string[], myIndex: number): Seat {
  const idx = playerOrder.indexOf(playerId);
  if (idx < 0) return "bottom";
  const relativePos = (idx - myIndex + 4) % 4;
  return SEAT_ORDER[relativePos];
}

function sortHand(hand: PlayingCard[], trumpSuit?: string | null): PlayingCard[] {
  return [...hand].sort((a, b) => {
    // During play phase, show trump suit last (right side) for clarity
    if (trumpSuit) {
      const aIsTrump = a.suit === trumpSuit ? 1 : 0;
      const bIsTrump = b.suit === trumpSuit ? 1 : 0;
      if (aIsTrump !== bIsTrump) return aIsTrump - bIsTrump;
    }
    const suitDiff = (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return a.value - b.value;
  });
}

// ─── Component ───────────────────────────────────────────────────────
export function TarneebBoard({
  sessionId,
  gameState,
  playerId,
  playerPosition,
  playerNames = {},
  onPlayCard,
  onBid,
  onPass,
  onSetTrump,
  onResign,
}: TarneebBoardProps) {
  const [selectedCard, setSelectedCard] = useState<PlayingCard | null>(null);
  const [soundOn, setSoundOn] = useState(isGameSoundEnabled);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showLastTrick, setShowLastTrick] = useState(false);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [roundSummaryData, setRoundSummaryData] = useState<{
    roundScores: { team0: number; team1: number };
    totalScores: { team0: number; team1: number };
    made: boolean;
    bidValue: number;
    biddingTeam: number;
    isKaboot?: boolean;
  } | null>(null);
  const [showRedealToast, setShowRedealToast] = useState(false);
  const [showRoundHistory, setShowRoundHistory] = useState(false);
  const [showPlayedCards, setShowPlayedCards] = useState(false);
  const [showHighCards, setShowHighCards] = useState(false);
  const [playedCardsLog, setPlayedCardsLog] = useState<Array<{ suit: string; rank: string; playerId: string }>>([] as Array<{ suit: string; rank: string; playerId: string }>);
  const [trickSweeping, setTrickSweeping] = useState(false);
  const [sweepingCards, setSweepingCards] = useState<{ playerId: string; card: PlayingCard }[]>([]);
  const lastTrackedTrickRef = useRef<string>('');
  const [roundHistory, setRoundHistory] = useState<Array<{
    round: number;
    team0Score: number;
    team1Score: number;
    bidValue: number;
    biddingTeam: number;
    made: boolean;
  }>>([] as Array<{ round: number; team0Score: number; team1Score: number; bidValue: number; biddingTeam: number; made: boolean }>);
  const prevTrickLenRef = useRef(0);
  const prevRoundRef = useRef(0);
  const prevRedealRef = useRef(0);
  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_TIME_LIMIT_SEC);
  const turnStartRef = useRef(Date.now());
  const [showConfetti, setShowConfetti] = useState(false);
  const { language } = useI18n();
  const isAr = language === "ar";

  const state = gameState || {
    phase: "bidding" as const,
    hands: {},
    currentTrick: [],
    trumpSuit: null,
    currentPlayer: "",
    bids: [],
    highestBid: null,
    tricksWon: { team0: 0, team1: 0 },
    scores: { team0: 0, team1: 0 },
    dealerId: "",
    playerOrder: [] as string[],
  };

  const playerOrder = state.playerOrder || [];
  const myIndex = playerOrder.indexOf(playerId);
  const myHand = useMemo(() => sortHand(state.hand || state.hands[playerId] || [], state.trumpSuit), [state.hand, state.hands, playerId, state.trumpSuit]);
  const isMyTurn = state.isMyTurn ?? (state.currentPlayer === playerId || state.currentTurn === playerId);
  const gamePhase = state.gamePhase || state.phase;
  const myTeam = state.myTeam ?? (myIndex >= 0 ? myIndex % 2 : 0);
  const opponentTeam = myTeam === 0 ? 1 : 0;
  const partnerId = state.partner || (myIndex >= 0 ? playerOrder[(myIndex + 2) % 4] : undefined);
  const currentPlayer = state.currentTurn || state.currentPlayer;
  const roundNumber = state.roundNumber ?? 1;
  const targetScore = state.targetScore ?? 31;

  // ─── Trick-won indicator with sweep animation ─────────────────────
  const [trickWonBy, setTrickWonBy] = useState<string | null>(null);

  // Cache trick cards when 4th card is played (before server clears them)
  useEffect(() => {
    if (state.currentTrick && state.currentTrick.length === 4) {
      setSweepingCards([...state.currentTrick]);
    }
  }, [state.currentTrick?.length]);

  useEffect(() => {
    if (state.lastTrickWinner) {
      // Show sweep animation with cached cards
      setTrickSweeping(true);
      // Haptic feedback on trick won
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const winnerTeam = playerOrder.indexOf(state.lastTrickWinner) % 2;
        navigator.vibrate(winnerTeam === myTeam ? [50, 30, 50] : [30]);
      }
      const sweepTimer = setTimeout(() => {
        setTrickSweeping(false);
        setSweepingCards([]);
        setTrickWonBy(state.lastTrickWinner!);
      }, 500);
      const clearTimer = setTimeout(() => setTrickWonBy(null), 2000);
      return () => { clearTimeout(sweepTimer); clearTimeout(clearTimer); };
    }
  }, [state.lastTrickWinner, state.tricksWon?.team0, state.tricksWon?.team1]);

  // ─── Round-end summary overlay ──────────────────────────────────
  useEffect(() => {
    const round = roundNumber;
    if (round > prevRoundRef.current && prevRoundRef.current > 0) {
      // A new round started — use lastRoundScores (persisted across round transition)
      const rs = state.lastRoundScores || state.roundScores || { team0: 0, team1: 0 };
      const ts = state.totalScores || { team0: 0, team1: 0 };
      const bTeam = state.lastBiddingTeam ?? state.biddingTeam ?? 0;
      const bValue = state.lastBidValue ?? state.highestBid?.bid ?? 0;
      const madeCalc = state.lastBiddingTeamMade ?? (bTeam === 0 ? (rs.team0 || 0) : (rs.team1 || 0)) > 0;
      const isKab = state.lastIsKaboot ?? (bValue === 13);
      // Compute tricks won from the round (use last known values from state)
      const lastTeam0Tricks = state.tricksWon?.team0 ?? 0;
      const lastTeam1Tricks = state.tricksWon?.team1 ?? 0;
      setRoundSummaryData({
        roundScores: { team0: rs.team0 || 0, team1: rs.team1 || 0 },
        totalScores: { team0: ts.team0 || 0, team1: ts.team1 || 0 },
        made: madeCalc,
        bidValue: bValue,
        biddingTeam: bTeam,
        isKaboot: isKab,
      });
      // Track round history with tricks
      setRoundHistory(prev => [...prev, {
        round: prevRoundRef.current,
        team0Score: rs.team0 || 0,
        team1Score: rs.team1 || 0,
        bidValue: bValue,
        biddingTeam: bTeam,
        made: madeCalc,
      }]);
      setShowRoundSummary(true);
      // Auto-dismiss after 6s as backup (tap-to-close is primary)
      const timer = setTimeout(() => setShowRoundSummary(false), 6000);
      return () => clearTimeout(timer);
    }
    prevRoundRef.current = round;
  }, [roundNumber]);

  // ─── Redeal notification ────────────────────────────────────────
  useEffect(() => {
    const rd = state.redealCount ?? 0;
    if (rd > prevRedealRef.current && prevRedealRef.current >= 0) {
      setShowRedealToast(true);
      const timer = setTimeout(() => setShowRedealToast(false), 2500);
      prevRedealRef.current = rd;
      return () => clearTimeout(timer);
    }
    prevRedealRef.current = rd;
  }, [state.redealCount]);

  // ─── Track played cards for the card tracker (dedup with ref) ───
  useEffect(() => {
    if (state.lastCompletedTrick && state.lastCompletedTrick.length > 0) {
      // Build a unique key for this trick to prevent duplicate tracking on reconnect
      const trickKey = state.lastCompletedTrick.map(p => `${p.playerId}:${p.card.suit}${p.card.rank}`).join('|');
      if (trickKey === lastTrackedTrickRef.current) return; // already tracked
      lastTrackedTrickRef.current = trickKey;
      const newCards = state.lastCompletedTrick.map(p => ({
        suit: p.card.suit,
        rank: p.card.rank,
        playerId: p.playerId,
      }));
      setPlayedCardsLog(prev => [...prev, ...newCards]);
    }
  }, [state.lastCompletedTrick]);

  // Reset played cards log on new round
  useEffect(() => {
    if (roundNumber > 1) {
      setPlayedCardsLog([]);
      lastTrackedTrickRef.current = '';
    }
  }, [roundNumber]);

  // ─── Confetti celebration on game win ───────────────────────────
  useEffect(() => {
    if (gamePhase === 'finished' && state.winningTeam !== undefined && state.winningTeam === myTeam) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [gamePhase, state.winningTeam, myTeam]);

  // ─── Turn Timer countdown with auto-play ────────────────────────
  useEffect(() => {
    // Reset timer every time turn changes
    turnStartRef.current = Date.now();
    setTurnTimeLeft(TURN_TIME_LIMIT_SEC);
  }, [currentPlayer]);

  // ─── F3: Auto-play single valid card after short delay ──────────
  // F12: Track when we first become "my turn" to add reconnect grace period
  const turnBecameMyTurnAtRef = useRef<number>(0);
  const [graceExpired, setGraceExpired] = useState(0); // F1-cycle8: force re-eval after grace
  useEffect(() => {
    if (isMyTurn) {
      if (turnBecameMyTurnAtRef.current === 0) turnBecameMyTurnAtRef.current = Date.now();
    } else {
      turnBecameMyTurnAtRef.current = 0;
    }
  }, [isMyTurn]);

  useEffect(() => {
    if (!isMyTurn || gamePhase !== 'playing' || !state.trumpSuit) return;
    // F12: Skip auto-play if turn just started (reconnect grace) — give player 1.5s to see the state
    const elapsed = Date.now() - turnBecameMyTurnAtRef.current;
    if (elapsed < 1500) {
      // F1-cycle8: Re-check after grace period by triggering state update
      const graceTimer = setTimeout(() => setGraceExpired(c => c + 1), 1500 - elapsed);
      return () => clearTimeout(graceTimer);
    }
    const playable = myHand.filter(c => {
      if (state.currentTrick.length === 0) return true;
      const leadSuit = state.currentTrick[0].card.suit;
      const hasSuit = myHand.some(h => h.suit === leadSuit);
      if (hasSuit) return c.suit === leadSuit;
      return true;
    });
    if (playable.length === 1) {
      const timer = setTimeout(() => {
        onPlayCard(playable[0]);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isMyTurn, gamePhase, state.trumpSuit, myHand, state.currentTrick, onPlayCard, graceExpired]);

  useEffect(() => {
    if (gamePhase === 'finished') return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - turnStartRef.current) / 1000);
      const remaining = Math.max(0, TURN_TIME_LIMIT_SEC - elapsed);
      setTurnTimeLeft(remaining);

      // ── Auto-play on timeout (only for the local player) ──
      if (remaining <= 0 && isMyTurn) {
        if (gamePhase === 'bidding') {
          // Auto-pass when timeout during bidding
          onPass();
        } else if (gamePhase === 'playing') {
          if (!state.trumpSuit && state.highestBid?.playerId === playerId && onSetTrump) {
            // Auto-select trump: pick the suit with most cards
            const h = state.hand || state.hands?.[playerId] || [];
            const suitCounts: Record<string, number> = {};
            for (const c of h) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
            const best = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'spades';
            onSetTrump(best);
          } else {
            // Auto-play: pick a random valid card
            const h = state.hand || state.hands?.[playerId] || [];
            if (h.length > 0) {
              // Must follow suit if possible
              const leadSuit = state.currentTrick?.[0]?.card?.suit;
              const followCards = leadSuit ? h.filter((c: PlayingCard) => c.suit === leadSuit) : [];
              const pool = followCards.length > 0 ? followCards : h;
              // Play the first card from pool (lowest)
              onPlayCard(pool[0]);
            }
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentPlayer, gamePhase, isMyTurn, playerId]);

  // ─── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    if (gamePhase === 'finished') return;
    const handler = (e: KeyboardEvent) => {
      // Bidding shortcuts: number keys 7-9, 0=10, -, =, +
      if (gamePhase === 'bidding' && isMyTurn) {
        const minBid = state.highestBid ? state.highestBid.bid + 1 : 7;
        const bidMap: Record<string, number> = { '7': 7, '8': 8, '9': 9, '0': 10, '-': 11, '=': 12, '+': 13 };
        const bid = bidMap[e.key];
        if (bid && bid >= minBid && bid <= 13) {
          e.preventDefault();
          onBid(bid);
          return;
        }
        if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
          e.preventDefault();
          onPass();
          return;
        }
      }
      // Playing: Enter to play selected card, Escape to deselect
      if (gamePhase === 'playing' && isMyTurn) {
        if (e.key === 'Enter' && selectedCard) {
          e.preventDefault();
          onPlayCard(selectedCard);
          setSelectedCard(null);
          return;
        }
        if (e.key === 'Escape') {
          setSelectedCard(null);
          return;
        }
        // Arrow keys to navigate cards
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const playable = myHand.filter(c => isValidPlay(c));
          if (playable.length === 0) return;
          if (!selectedCard) {
            setSelectedCard(e.key === 'ArrowRight' ? playable[0] : playable[playable.length - 1]);
          } else {
            const idx = playable.findIndex(c => c.suit === selectedCard.suit && c.rank === selectedCard.rank);
            const next = e.key === 'ArrowRight' ? (idx + 1) % playable.length : (idx - 1 + playable.length) % playable.length;
            setSelectedCard(playable[next]);
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gamePhase, isMyTurn, selectedCard, myHand, state.highestBid, onBid, onPass, onPlayCard]);

  // ─── Seat mapping ─────────────────────────────────────────────────
  const seats = useMemo(() => {
    if (playerOrder.length < 4 || myIndex < 0) return {} as Record<Seat, string>;
    return {
      bottom: playerOrder[myIndex],
      left: playerOrder[(myIndex + 1) % 4],
      top: playerOrder[(myIndex + 2) % 4],
      right: playerOrder[(myIndex + 3) % 4],
    };
  }, [playerOrder, myIndex]);

  const getName = useCallback((pid: string) => {
    if (pid === playerId) return isAr ? "أنت" : "You";
    if (playerNames[pid]) return playerNames[pid];
    return `P${pid.slice(-4)}`;
  }, [playerId, playerNames, isAr]);

  const getTeamForSeat = (seat: Seat): "mine" | "opponent" => {
    if (!seats[seat]) return "opponent";
    const idx = playerOrder.indexOf(seats[seat]);
    return idx % 2 === myTeam ? "mine" : "opponent";
  };

  // ─── Opponent hand count by seat (BUG #3 fix) ────────────────────
  const getCardCount = (seat: Seat): number => {
    if (!seats[seat] || !state.otherHandCounts) return 0;
    return state.otherHandCounts[seats[seat]] ?? 0;
  };

  // ─── Card validation ─────────────────────────────────────────────
  const isValidPlay = (card: PlayingCard): boolean => {
    if (!isMyTurn || gamePhase !== "playing" || !state.trumpSuit) return false;
    if (state.currentTrick.length === 0) return true;
    const leadSuit = state.currentTrick[0].card.suit;
    const hasSuit = myHand.some(c => c.suit === leadSuit);
    if (hasSuit) return card.suit === leadSuit;
    return true;
  };

  const handleCardClick = (card: PlayingCard) => {
    if (!isValidPlay(card)) return;
    if (selectedCard?.suit === card.suit && selectedCard?.rank === card.rank) {
      onPlayCard(card);
      setSelectedCard(null);
      // Haptic feedback on card play
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(15);
      }
    } else {
      setSelectedCard(card);
      // Light haptic on card select
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(5);
      }
    }
  };

  const handlePlayCard = () => {
    if (selectedCard) {
      onPlayCard(selectedCard);
      setSelectedCard(null);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(15);
      }
    }
  };

  const handleToggleSound = () => {
    const newVal = toggleGameSound();
    setSoundOn(newVal);
  };

  // ─── Score display ────────────────────────────────────────────────
  const myScore = myTeam === 0 ? (state.totalScores?.team0 ?? state.scores.team0 ?? 0) : (state.totalScores?.team1 ?? state.scores.team1 ?? 0);
  const oppScore = opponentTeam === 0 ? (state.totalScores?.team0 ?? state.scores.team0 ?? 0) : (state.totalScores?.team1 ?? state.scores.team1 ?? 0);
  const myTricks = myTeam === 0 ? (state.tricksWon.team0 ?? 0) : (state.tricksWon.team1 ?? 0);
  const oppTricks = opponentTeam === 0 ? (state.tricksWon.team0 ?? 0) : (state.tricksWon.team1 ?? 0);

  // ─── Render player card ───────────────────────────────────────────
  const renderPlayerCard = (card: PlayingCard, index: number, totalCards: number) => {
    const suit = SUITS[card.suit];
    const canPlay = isValidPlay(card);
    const isSelected = selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
    const isTrumpCard = state.trumpSuit && card.suit === state.trumpSuit;

    const maxSpread = Math.min(totalCards * 32, 380);
    const startOffset = -maxSpread / 2;
    const step = totalCards > 1 ? maxSpread / (totalCards - 1) : 0;
    const xOffset = startOffset + step * index;
    const angle = totalCards > 1 ? ((index - (totalCards - 1) / 2) * 3) : 0;

    return (
      <div
        key={`${card.suit}-${card.rank}`}
        data-testid={`card-${card.suit}-${card.rank}`}
        onClick={() => handleCardClick(card)}
        role="button"
        tabIndex={canPlay ? 0 : -1}
        aria-label={`${card.rank} ${isAr ? SUITS[card.suit].nameAr : SUITS[card.suit].nameEn}${isSelected ? (isAr ? ' — محددة' : ' — selected') : ''}${!canPlay ? (isAr ? ' — غير قابلة للعب' : ' — not playable') : ''}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(card); } }}
        className={`
          absolute w-[3.2rem] h-[4.5rem] sm:w-[3.8rem] sm:h-[5.2rem] bg-white rounded-lg border-2 shadow-lg
          flex flex-col items-center justify-between py-1
          transition-all duration-200 origin-bottom
          ${canPlay ? "cursor-pointer hover:-translate-y-3 hover:shadow-xl" : "opacity-60 cursor-not-allowed"}
          ${isSelected ? "ring-2 ring-yellow-400 -translate-y-5 shadow-yellow-400/30 shadow-xl z-10" : ""}
          ${isTrumpCard && !isSelected ? "ring-1 ring-yellow-500/40" : ""}
          animate-card-deal
        `}
        style={{
          left: "50%",
          transform: `translateX(${xOffset}px) rotate(${angle}deg) ${isSelected ? "translateY(-1.25rem)" : ""}`,
          animationDelay: `${index * 40}ms`,
          zIndex: isSelected ? 50 : index,
        }}
      >
        <span className={`text-[10px] sm:text-xs font-bold leading-none ${suit.color}`}>{card.rank}</span>
        <span className={`text-xl sm:text-2xl leading-none ${suit.color}`}>{suit.symbol}</span>
        <span className={`text-[10px] sm:text-xs font-bold leading-none rotate-180 ${suit.color}`}>{card.rank}</span>
        {isTrumpCard && <span className="absolute top-0.5 end-0.5 text-[7px] leading-none" title={isAr ? 'حكم' : 'Trump'}>👑</span>}
      </div>
    );
  };

  // ─── Render opponent hand with name ───────────────────────────────
  const renderOpponentHand = (seat: Seat) => {
    const count = getCardCount(seat);
    const pid = seats[seat];
    if (!pid) return null;

    const isTeammate = getTeamForSeat(seat) === "mine";
    const isTurn = currentPlayer === pid;
    const name = getName(pid);
    const isDealer = state.dealerId === pid;

    return (
      <div className={`flex flex-col items-center gap-1 ${isTurn ? "scale-105" : ""} transition-transform`}>
        {/* Player name badge */}
        <div className={`flex items-center gap-1.5 mb-1 ${isTurn ? "animate-pulse" : ""}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white
              ${isTeammate ? "bg-blue-600 ring-2 ring-blue-400" : "bg-red-600 ring-2 ring-red-400"}
              ${isTurn ? "ring-yellow-400 ring-2" : ""}
            `}
          >
            {name[0]?.toUpperCase()}
          </div>
          <span className={`text-[11px] font-medium max-w-[60px] truncate
            ${isTeammate ? "text-blue-300" : "text-red-300"}
            ${isTurn ? "text-yellow-400 font-bold" : ""}
          `}>{name}</span>
          {isDealer && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-yellow-900/50 border-yellow-600 text-yellow-300">
              D
            </Badge>
          )}
          {state.botPlayers?.includes(pid) && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-gray-900/50 border-gray-500 text-gray-300">
              🤖
            </Badge>
          )}
          {isTeammate && pid === partnerId && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-blue-900/50 border-blue-600 text-blue-300">
              {isAr ? "شريك" : "Partner"}
            </Badge>
          )}
        </div>

        {/* Trick count badge during play */}
        {gamePhase === "playing" && state.trumpSuit && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isTeammate ? 'bg-blue-900/60 text-blue-300' : 'bg-red-900/60 text-red-300'}`}>
              {isTeammate
                ? `${myTricks} ${isAr ? 'أكلة' : 't'}`
                : `${oppTricks} ${isAr ? 'أكلة' : 't'}`
              }
            </span>
          </div>
        )}

        {/* Cards fan */}
        <div className="flex items-center">
          {Array.from({ length: Math.min(count, 13) }).map((_, i) => (
            <div
              key={i}
              className="w-8 h-11 sm:w-9 sm:h-12 bg-gradient-to-br from-blue-900 to-blue-700
                rounded-md border border-blue-600 shadow-md animate-card-deal"
              style={{
                marginInlineStart: i > 0 ? "-18px" : "0",
                animationDelay: `${i * 30}ms`,
                zIndex: i,
              }}
            >
              <div className="w-full h-full rounded-md border border-blue-500/30 flex items-center justify-center">
                <span className="text-blue-400/40 text-lg">♠</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Trick cards positioned by seat (BUG #6 fix) ─────────────────
  const renderTrick = () => {
    const seatPositions: Record<Seat, React.CSSProperties> = {
      bottom: { bottom: "28%", left: "50%", transform: "translateX(-50%)" },
      left:   { left: "28%",   top: "50%",  transform: "translateY(-50%)" },
      top:    { top: "28%",    left: "50%", transform: "translateX(-50%)" },
      right:  { right: "28%",  top: "50%",  transform: "translateY(-50%)" },
    };

    // Show sweep animation with cached cards when trick completes
    if (trickSweeping && sweepingCards.length > 0) {
      // Compute sweep direction towards winner's seat
      const winnerSeat = state.lastTrickWinner && playerOrder.length >= 4 && myIndex >= 0
        ? getSeatForPlayer(state.lastTrickWinner, playerOrder, myIndex)
        : 'top';
      const sweepDir: Record<string, { x: string; y: string }> = {
        bottom: { x: '0px', y: '60px' },
        top: { x: '0px', y: '-60px' },
        left: { x: '-60px', y: '0px' },
        right: { x: '60px', y: '0px' },
      };
      const dir = sweepDir[winnerSeat] || { x: '0px', y: '0px' };

      return (
        <div className="absolute inset-0 pointer-events-none z-10">
          {sweepingCards.map((play, i) => {
            const seat = playerOrder.length >= 4 && myIndex >= 0
              ? getSeatForPlayer(play.playerId, playerOrder, myIndex)
              : SEAT_ORDER[i % 4];
            const pos = seatPositions[seat];
            const suit = SUITS[play.card.suit];
            return (
              <div
                key={`sweep-${play.playerId}-${play.card.suit}-${play.card.rank}`}
                className="absolute w-12 h-[4.2rem] sm:w-14 sm:h-[4.8rem] bg-white rounded-lg shadow-xl
                  flex flex-col items-center justify-center animate-trick-sweep border-2"
                style={{ ...pos, animationDelay: `${i * 40}ms`, '--sweep-x': dir.x, '--sweep-y': dir.y } as React.CSSProperties}
              >
                <span className={`text-sm font-bold ${suit.color}`}>{play.card.rank}</span>
                <span className={`text-2xl ${suit.color}`}>{suit.symbol}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (!state.currentTrick || state.currentTrick.length === 0) {
      if (trickWonBy) {
        const winnerTeamIdx = playerOrder.indexOf(trickWonBy) % 2;
        const isMyTeamWin = winnerTeamIdx === myTeam;
        return (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <Badge className={`${isMyTeamWin ? 'bg-green-600/90' : 'bg-red-600/90'} text-white animate-bounce text-sm px-3 py-1`}>
              {getName(trickWonBy)} {isAr ? "فاز بالأكلة! ✓" : "won the trick! ✓"}
            </Badge>
          </div>
        );
      }
      return null;
    }

    return (
      <div className="absolute inset-0 pointer-events-none z-10">
        {state.currentTrick.map((play, i) => {
          const seat = playerOrder.length >= 4 && myIndex >= 0
            ? getSeatForPlayer(play.playerId, playerOrder, myIndex)
            : SEAT_ORDER[i % 4];
          const pos = seatPositions[seat];
          const suit = SUITS[play.card.suit];
          const isLead = i === 0;
          const isPartner = play.playerId === partnerId;
          const isMe = play.playerId === playerId;
          const isTeammate = isPartner || isMe;

          // U2: Highlight the currently winning card in the trick
          let isCurrentWinner = false;
          if (state.currentTrick.length > 1) {
            let bestIdx = 0;
            let bestVal = 0;
            for (let j = 0; j < state.currentTrick.length; j++) {
              const c = state.currentTrick[j].card;
              const trickLeadSuit = state.currentTrick[0].card.suit;
              let val = 0;
              if (c.suit === state.trumpSuit) val = 100 + (c.value || 0);
              else if (c.suit === trickLeadSuit) val = c.value || 0;
              if (val > bestVal) { bestVal = val; bestIdx = j; }
            }
            isCurrentWinner = i === bestIdx;
          }

          return (
            <div
              key={`${play.playerId}-${play.card.suit}-${play.card.rank}`}
              className={`absolute w-12 h-[4.2rem] sm:w-14 sm:h-[4.8rem] bg-white rounded-lg shadow-xl
                flex flex-col items-center justify-center animate-card-play
                ${isLead ? 'border-2 border-yellow-400 ring-1 ring-yellow-400/50' : isTeammate ? 'border-2 border-blue-400/50' : 'border-2 border-red-400/30'}
                ${isCurrentWinner ? 'ring-2 ring-green-400 shadow-green-400/40 shadow-lg' : ''}`}
              style={{ ...pos, animationDelay: `${i * 60}ms` }}
            >
              {isLead && <span className="absolute -top-1.5 -end-1.5 text-[8px]">⭐</span>}
              {isCurrentWinner && !isLead && <span className="absolute -top-1.5 -start-1.5 text-[8px]">👑</span>}
              <span className={`text-sm font-bold ${suit.color}`}>{play.card.rank}</span>
              <span className={`text-2xl ${suit.color}`}>{suit.symbol}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Bidding Phase (hand stays visible below) ──────────────────
  const renderBiddingPhase = () => (
    <div className="absolute inset-x-0 top-0 bottom-24 flex items-center justify-center bg-black/40 z-20 backdrop-blur-sm rounded-b-xl">
      <Card className="w-full max-w-sm mx-4 bg-card/95 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-yellow-500" />
            {isAr ? "مرحلة المزايدة" : "Bidding Phase"}
            <Badge variant="outline" className="ms-auto text-xs">
              {isAr ? `الجولة ${roundNumber}` : `Round ${roundNumber}`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Bid history with player names (#12) */}
          {state.bids.length > 0 && (
            <div className="space-y-1.5 p-2 bg-muted/50 rounded-lg">
              {state.bids.map((bid, i) => {
                const bidderName = getName(bid.playerId);
                const isTeammate = playerOrder.indexOf(bid.playerId) % 2 === myTeam;
                return (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className={`flex items-center gap-1.5 ${isTeammate ? "text-blue-400" : "text-red-400"}`}>
                      <span className={`w-2 h-2 rounded-full ${isTeammate ? "bg-blue-500" : "bg-red-500"}`} />
                      {bidderName}
                    </span>
                    <Badge variant={bid.bid !== null && bid.bid > 0 ? "default" : "secondary"} className="text-xs">
                      {bid.bid !== null && bid.bid > 0 ? bid.bid : (isAr ? "باس" : "Pass")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {/* Highest bid */}
          {state.highestBid && (
            <div className="p-2.5 bg-yellow-500/15 border border-yellow-600/30 rounded-lg text-center text-sm">
              <span className="text-yellow-500 font-medium">
                {isAr ? "أعلى مزايدة:" : "Highest bid:"} <strong className="text-base">{state.highestBid.bid}</strong>
              </span>
              <span className="text-muted-foreground text-xs block">
                {getName(state.highestBid.playerId)}
              </span>
            </div>
          )}

          {/* Current bidder indicator (#14) */}
          <div className="text-center text-xs text-muted-foreground">
            {isMyTurn
              ? (isAr ? "🎯 دورك في المزايدة!" : "🎯 Your turn to bid!")
              : (isAr ? `انتظر ${getName(currentPlayer)}...` : `Waiting for ${getName(currentPlayer)}...`)}
          </div>

          {/* Bid suggestion for beginners (matches server evaluateHandStrength) */}
          {isMyTurn && (() => {
            const hand = state.hand || state.hands?.[playerId] || [];
            if (hand.length === 0) return null;
            let tricks = 0;
            const suitCounts: Record<string, number> = {};
            const suitHasAce: Record<string, boolean> = {};
            const suitHasKing: Record<string, boolean> = {};
            const suitHasQueen: Record<string, boolean> = {};
            for (const c of hand) {
              suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
              if (c.rank === 'A') suitHasAce[c.suit] = true;
              if (c.rank === 'K') suitHasKing[c.suit] = true;
              if (c.rank === 'Q') suitHasQueen[c.suit] = true;
            }
            let voids = 0;
            for (const c of hand) {
              const rank = c.rank;
              if (rank === 'A') tricks += 1.5;
              else if (rank === 'K') tricks += 0.8;
              else if (rank === 'Q') tricks += 0.4;
              else if (rank === 'J') tricks += 0.15;
            }
            for (const [suit, count] of Object.entries(suitCounts)) {
              if (count > 3) tricks += (count - 3) * 0.4;
              // A-K bonus
              if (suitHasAce[suit] && suitHasKing[suit]) tricks += 0.3;
              if (suitHasAce[suit] && suitHasKing[suit] && suitHasQueen[suit]) tricks += 0.2;
              // Unprotected King penalty
              if (suitHasKing[suit] && !suitHasAce[suit] && count <= 2) tricks -= 0.3;
            }
            // Void & singleton bonus
            for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
              const cnt = suitCounts[suit] || 0;
              if (cnt === 0) voids++;
              else if (cnt === 1) tricks += 0.3;
            }
            const maxLen = Math.max(...Object.values(suitCounts));
            if (voids > 0 && maxLen >= 4) tricks += voids * 0.5;
            // F4-cycle9: Sync side suit length penalty with server (F6-cycle8)
            const bestSuitName9 = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
            for (const [suit9, count9] of Object.entries(suitCounts)) {
              if (suit9 !== bestSuitName9 && count9 > 3) {
                tricks -= (count9 - 3) * 0.15;
              }
            }
            // F7: Distribution weight (synced with server evaluateHandStrength)
            const lengths = Object.values(suitCounts).map(v => v || 0);
            const minLen = Math.min(...lengths.map(l => l || 0), ...[0, 0, 0, 0].slice(lengths.length));
            const spread = maxLen - minLen;
            if (spread >= 3) tricks += 0.5;
            else if (spread >= 2) tricks += 0.2;
            // F9-cycle10: Partner bid boost — sync with server generateBotBid
            if (partnerId) {
              const pBidEntry = (state.bids || []).find(b => b.playerId === partnerId);
              if (pBidEntry?.bid && pBidEntry.bid >= 8) {
                const ownF = Math.min(1, (tricks - 5) / 4);
                const pBoost = Math.min(3, Math.round((pBidEntry.bid - 7) * 0.7 * (0.5 + 0.5 * ownF)));
                tricks += pBoost;
              }
            }
            const suggested = Math.min(13, Math.max(7, Math.round(tricks)));
            const minRequired = state.highestBid ? state.highestBid.bid + 1 : 7;
            if (suggested < minRequired) return null;
            return (
              <div className="text-center">
                <Badge variant="outline" className="text-[9px] bg-blue-900/30 border-blue-500/40 text-blue-300">
                  💡 {isAr ? `مقترح: ${suggested}` : `Suggested: ${suggested}`}
                </Badge>
              </div>
            );
          })()}

          {/* Bid buttons (#20 improved mobile layout) */}
          {isMyTurn && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-4 gap-1.5">
                {[7, 8, 9, 10, 11, 12, 13].map(bid => {
                  const disabled = !!(state.highestBid && bid <= state.highestBid.bid);
                  return (
                    <Button
                      key={bid}
                      variant={disabled ? "ghost" : "outline"}
                      size="sm"
                      disabled={disabled}
                      onClick={() => onBid(bid)}
                      className={`text-base font-bold h-10 ${!disabled ? "hover:bg-yellow-500/20 hover:border-yellow-500" : ""}`}
                      data-testid={`button-bid-${bid}`}
                    >
                      {bid}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="secondary"
                className="w-full h-10"
                onClick={onPass}
                data-testid="button-pass"
              >
                {isAr ? "باس ✋" : "Pass ✋"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ─── Trump Selection (BUG #1 fix — now callable) ─────────────────
  const renderTrumpSelection = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 backdrop-blur-sm">
      <Card className="w-full max-w-xs mx-4 bg-card/95 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-yellow-500" />
            {isAr ? "اختر نوع الحكم" : "Choose Trump Suit"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3 text-center">
            {isAr
              ? `فزت بالمزايدة بـ ${state.highestBid?.bid ?? "?"} — اختر الحكم`
              : `You won the bid with ${state.highestBid?.bid ?? "?"} — choose trump`}
          </p>
          {/* F12: Trump suit suggestion — analyze hand to recommend best trump */}
          {(() => {
            const h = state.hand || state.hands?.[playerId] || [];
            if (h.length === 0) return null;
            const suitCards: Record<string, PlayingCard[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
            for (const c of h) suitCards[c.suit]?.push(c);
            let bestSuit = 'spades';
            let bestScore = -1;
            for (const [suit, cards] of Object.entries(suitCards)) {
              if (cards.length < 2) continue;
              let score = cards.length * 2;
              if (cards.some(c => c.rank === 'A')) score += 6;
              if (cards.some(c => c.rank === 'K')) score += 4;
              if (cards.some(c => c.rank === 'Q')) score += 2;
              if (cards.length > 3) score += (cards.length - 3) * 5;
              for (const [otherSuit, otherCards] of Object.entries(suitCards)) {
                if (otherSuit === suit) continue;
                if (otherCards.length === 0) score += 8;
                else if (otherCards.length === 1) score += 4;
              }
              // F11-cycle9: Penalize short suits when opponent bid strongly (sync with server F8-cycle8)
              const oppBidHigh9 = (state.bids || []).some(b => b.bid && b.bid >= 9 &&
                state.playerOrder && state.playerOrder.indexOf(b.playerId) % 2 !== myTeam);
              if (oppBidHigh9 && cards.length <= 3) {
                score -= (4 - cards.length) * 3;
              }
              if (score > bestScore) { bestScore = score; bestSuit = suit; }
            }
            const suggestedInfo = SUITS[bestSuit as keyof typeof SUITS];
            return (
              <div className="text-center mb-2">
                <Badge variant="outline" className="text-[9px] bg-yellow-900/30 border-yellow-500/40 text-yellow-300">
                  💡 {isAr ? `مقترح: ${suggestedInfo.nameAr} ${suggestedInfo.symbol}` : `Suggested: ${suggestedInfo.nameEn} ${suggestedInfo.symbol}`}
                </Badge>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(SUITS) as Array<keyof typeof SUITS>).map(suit => {
              const suitCount = (state.hand || state.hands?.[playerId] || []).filter((c: PlayingCard) => c.suit === suit).length;
              return (
              <Button
                key={suit}
                variant="outline"
                className="h-16 text-xl flex flex-col gap-1 hover:bg-primary/10 hover:border-primary"
                onClick={() => onSetTrump?.(suit)}
                data-testid={`button-trump-${suit}`}
              >
                <span className={`text-3xl ${SUITS[suit].color}`}>{SUITS[suit].symbol}</span>
                <span className="text-xs">{isAr ? SUITS[suit].nameAr : SUITS[suit].nameEn}</span>
                <span className="text-[9px] text-muted-foreground">({suitCount})</span>
              </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── Resign Confirm (#10) ─────────────────────────────────────────
  const renderResignConfirm = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 backdrop-blur-sm">
      <Card className="w-full max-w-xs mx-4">
        <CardContent className="pt-6 text-center space-y-4">
          <Flag className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-sm font-medium">
            {isAr ? "هل تريد الاستسلام؟ سيخسر فريقك." : "Resign? Your team will lose."}
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => setShowResignConfirm(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { onResign?.(); setShowResignConfirm(false); }}>
              {isAr ? "استسلام" : "Resign"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────
  return (
    <div
      className="relative w-full h-[min(620px,calc(100vh-100px))] bg-game-felt rounded-xl overflow-hidden"
      data-testid="tarneeb-board"
      style={{ touchAction: "manipulation" }}
      role="application"
      aria-label={isAr ? 'لوحة لعبة الطرنيب' : 'Tarneeb game board'}
      aria-live="polite"
    >
      {/* ── Turn Timer Bar ── */}
      {gamePhase !== 'finished' && (
        <div className="absolute top-0 start-0 end-0 h-1 z-30">
          <div
            className={`h-full transition-all duration-1000 ease-linear rounded-e-full ${
              turnTimeLeft <= 15 ? 'bg-red-500 animate-pulse' : turnTimeLeft <= 30 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${(turnTimeLeft / TURN_TIME_LIMIT_SEC) * 100}%` }}
            role="progressbar"
            aria-label={isAr ? `الوقت المتبقي: ${turnTimeLeft} ثانية` : `Time remaining: ${turnTimeLeft} seconds`}
            aria-valuenow={turnTimeLeft}
            aria-valuemin={0}
            aria-valuemax={TURN_TIME_LIMIT_SEC}
          />
        </div>
      )}

      {/* ── Confetti celebration ── */}
      {showConfetti && (
        <div className="absolute inset-0 z-[50] pointer-events-none overflow-hidden" aria-hidden="true">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-3 rounded-sm animate-confetti-fall"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#4caf50', '#ffeb3b', '#ff9800'][i % 9],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Top info bar ── */}
      <div className="absolute top-1 start-0 end-0 flex items-center justify-between px-3 py-2 bg-black/30 z-20">
        <div className="flex items-center gap-2">
          {/* Round & Target (#13) */}
          <Badge variant="outline" className="bg-background/70 text-[10px] h-6">
            {isAr ? `ج${roundNumber}` : `R${roundNumber}`} • {isAr ? `هدف ${targetScore}` : `${targetScore}pt`}
          </Badge>
          {/* Trump suit */}
          {state.trumpSuit && SUITS[state.trumpSuit] && (
            <Badge className="bg-yellow-600/80 text-white text-[10px] h-6 gap-1">
              {isAr ? "حكم" : "Trump"} {SUITS[state.trumpSuit].symbol}
            </Badge>
          )}
          {/* Bid info + tricks needed during play */}
          {gamePhase === "playing" && state.highestBid && (() => {
            const bidTeam = state.biddingTeam ?? 0;
            const iMyBid = bidTeam === myTeam;
            const bidderTricks = bidTeam === 0 ? (state.tricksWon?.team0 ?? 0) : (state.tricksWon?.team1 ?? 0);
            const needed = Math.max(0, state.highestBid.bid - bidderTricks);
            // F8: Defender tricks needed to set the contract
            const defenderTricks = bidTeam === 0 ? (state.tricksWon?.team1 ?? 0) : (state.tricksWon?.team0 ?? 0);
            const defNeeded = Math.max(0, (14 - state.highestBid.bid) - defenderTricks);
            return (
              <>
              <Badge variant="outline" className={`bg-background/70 text-[10px] h-6 ${state.highestBid.bid === 13 ? 'border-purple-500 text-purple-300' : iMyBid ? 'border-blue-500/50' : 'border-red-500/50'}`}>
                {isAr ? "مزايدة" : "Bid"}: {state.highestBid.bid}
                {state.highestBid.bid === 13 && " 👑"}
                {needed > 0 && (
                  <span className={`ms-1 ${iMyBid ? 'text-blue-300' : 'text-red-300'}`}>
                    ({isAr ? `بحاجة ${needed}` : `need ${needed}`})
                  </span>
                )}
                {needed === 0 && (
                  <span className="ms-1 text-green-400">✓</span>
                )}
              </Badge>
              {/* F8: Show defender objective — tricks needed to set */}
              {!iMyBid && defNeeded > 0 && (
                <Badge variant="outline" className="bg-background/70 text-[10px] h-6 border-green-500/50">
                  <span className="text-green-300">
                    {isAr ? `كسر: ${defNeeded}` : `set: ${defNeeded}`}
                  </span>
                </Badge>
              )}
              {iMyBid && defNeeded > 0 && (
                <Badge variant="outline" className="bg-background/70 text-[10px] h-6 border-orange-500/50">
                  <span className="text-orange-300">
                    {isAr ? `هدفهم: ${defNeeded}` : `def: ${defNeeded}`}
                  </span>
                </Badge>
              )}
              </>
            );
          })()}
        </div>
        <div className="flex items-center gap-1.5">
          {/* High cards remaining HUD */}
          {gamePhase === "playing" && state.trumpSuit && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => setShowHighCards(p => !p)}
              title={isAr ? 'الأوراق العالية المتبقية' : 'High cards remaining'}
            >
              <Star className="w-3.5 h-3.5" />
            </Button>
          )}
          {/* Played cards tracker button */}
          {gamePhase === "playing" && playedCardsLog.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => setShowPlayedCards(p => !p)}>
              <Layers className="w-3.5 h-3.5" />
            </Button>
          )}
          {/* Round history button */}
          {roundHistory.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => setShowRoundHistory(true)}>
              <History className="w-3.5 h-3.5" />
            </Button>
          )}
          {/* Turn time display */}
          {gamePhase !== 'finished' && turnTimeLeft <= 30 && (
            <Badge variant="outline" className={`text-[10px] h-6 ${turnTimeLeft <= 15 ? 'bg-red-900/60 border-red-500 text-red-300 animate-pulse' : 'bg-yellow-900/60 border-yellow-500 text-yellow-300'}`}>
              <Timer className="w-3 h-3 me-0.5" />
              {Math.floor(turnTimeLeft / 60)}:{(turnTimeLeft % 60).toString().padStart(2, '0')}
            </Badge>
          )}
          {/* Sound toggle (#22) */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={handleToggleSound} aria-label={isAr ? 'تبديل الصوت' : 'Toggle sound'}>
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </Button>
          {/* Resign button (#10) */}
          {gamePhase !== "finished" && onResign && (
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-red-400/70 hover:text-red-400"
              onClick={() => setShowResignConfirm(true)}
              aria-label={isAr ? 'استسلام' : 'Resign'}
            >
              <Flag className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Score panel (#15 fixed layout) ── */}
      <div className="absolute top-10 start-0 end-0 flex flex-col items-center gap-1 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-blue-600/80 rounded-full px-3 py-1 text-white text-xs font-bold shadow">
            <span className="opacity-80">{isAr ? "فريقك" : "You"}</span>
            <span className="text-sm">{myScore}</span>
            <span className="text-[10px] opacity-60">({myTricks}{isAr ? "أكلة" : "t"})</span>
          </div>
          <div className="text-white/50 text-xs font-bold">vs</div>
          <div className="flex items-center gap-1.5 bg-red-600/80 rounded-full px-3 py-1 text-white text-xs font-bold shadow">
            <span className="opacity-80">{isAr ? "الخصم" : "Opp"}</span>
            <span className="text-sm">{oppScore}</span>
            <span className="text-[10px] opacity-60">({oppTricks}{isAr ? "أكلة" : "t"})</span>
          </div>
        </div>

        {/* ── Trick Progress Bar ── */}
        {gamePhase === "playing" && state.trumpSuit && (myTricks + oppTricks > 0) && (
          <div className="w-36 h-1.5 bg-gray-700/60 rounded-full overflow-hidden flex" title={`${myTricks} vs ${oppTricks}`}>
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${(myTricks / 13) * 100}%` }}
            />
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${(oppTricks / 13) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Top player (partner) (#4, #5) ── */}
      <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-10">
        {renderOpponentHand("top")}
      </div>

      {/* ── Left player (opponent) ── */}
      <div className="absolute start-2 top-1/2 -translate-y-1/2 z-10">
        {renderOpponentHand("left")}
      </div>

      {/* ── Right player (opponent) ── */}
      <div className="absolute end-2 top-1/2 -translate-y-1/2 z-10">
        {renderOpponentHand("right")}
      </div>

      {/* ── Current trick (#6 fixed positions) ── */}
      {gamePhase === "playing" && renderTrick()}

      {/* ── My hand (sorted #9, fan layout #21) ── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-full px-4 z-10" data-testid="my-hand">
        {/* My card count badge */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-900/60 text-blue-300">
            {myHand.length} {isAr ? 'ورقة' : 'cards'}
          </span>
        </div>
        <div className="relative h-[5.5rem] sm:h-[6rem] mx-auto" style={{ maxWidth: "420px" }}>
          {myHand.map((card, i) => renderPlayerCard(card, i, myHand.length))}
        </div>
      </div>

      {/* ── Turn indicator & Play button ── */}
      <div className="absolute bottom-[5.5rem] sm:bottom-[6.2rem] left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        {isMyTurn && gamePhase === "playing" && (
          <Badge className="animate-pulse bg-yellow-500 text-black text-xs font-bold">
            {isAr ? "دورك!" : "Your turn!"}
          </Badge>
        )}
        {selectedCard && (
          <Button size="sm" className="h-8 shadow-lg" onClick={handlePlayCard} data-testid="button-play-card">
            {isAr ? "العب ▶" : "Play ▶"}
          </Button>
        )}
        {/* Last trick peek button */}
        {state.lastCompletedTrick && state.lastCompletedTrick.length > 0 && gamePhase === "playing" && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-background/60 text-xs"
            onClick={() => setShowLastTrick(!showLastTrick)}
            data-testid="button-last-trick"
          >
            <Eye className="w-3.5 h-3.5 me-1" />
            {isAr ? "الأكلة السابقة" : "Last Trick"}
          </Button>
        )}
      </div>

      {/* ── Bidding overlay ── */}
      {gamePhase === "bidding" && renderBiddingPhase()}

      {/* ── Trump selection overlay (BUG #1 — now uses onSetTrump) ── */}
      {gamePhase === "playing" && !state.trumpSuit && isMyTurn && state.highestBid?.playerId === playerId && renderTrumpSelection()}

      {/* ── Waiting for trump selection overlay ── */}
      {gamePhase === "playing" && !state.trumpSuit && !isMyTurn && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 backdrop-blur-sm pointer-events-none">
          <Card className="w-full max-w-xs mx-4 bg-card/95 backdrop-blur">
            <CardContent className="pt-6 text-center space-y-3">
              <Clock className="w-8 h-8 text-yellow-500 mx-auto animate-pulse" />
              <p className="text-sm font-medium">
                {isAr
                  ? `${getName(currentPlayer)} يختار نوع الحكم...`
                  : `${getName(currentPlayer)} is choosing trump suit...`}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Last Trick peek overlay ── */}
      {showLastTrick && state.lastCompletedTrick && state.lastCompletedTrick.length > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-[25] backdrop-blur-sm"
          onClick={() => setShowLastTrick(false)}
        >
          <Card className="w-full max-w-xs mx-4 bg-card/95 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {isAr ? "الأكلة السابقة" : "Last Trick"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center gap-2">
                {state.lastCompletedTrick.map((play, i) => {
                  const suit = SUITS[play.card.suit];
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-12 h-[4.2rem] bg-white rounded-lg border-2 shadow flex flex-col items-center justify-center">
                        <span className={`text-sm font-bold ${suit.color}`}>{play.card.rank}</span>
                        <span className={`text-2xl ${suit.color}`}>{suit.symbol}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[50px]">
                        {getName(play.playerId)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-2">
                {isAr ? "انقر للإغلاق" : "Tap to close"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Round Summary overlay ── */}
      {showRoundSummary && roundSummaryData && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-[25] backdrop-blur-sm cursor-pointer"
          onClick={() => setShowRoundSummary(false)}
        >
          <Card className="w-full max-w-xs mx-4 bg-card/95 backdrop-blur animate-in fade-in zoom-in-95 duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 justify-center">
                <Star className="h-4 w-4 text-yellow-500" />
                {isAr ? `نهاية الجولة ${(roundNumber ?? 1) - 1}` : `Round ${(roundNumber ?? 1) - 1} Complete`}
                {roundSummaryData.isKaboot && (
                  <Badge className="bg-purple-600 text-white text-[9px]">KABOOT!</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-blue-400">{isAr ? "فريقك" : "Your Team"}</span>
                <span className={`font-bold text-sm ${(roundSummaryData.roundScores[myTeam === 0 ? 'team0' : 'team1'] || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {roundSummaryData.roundScores[myTeam === 0 ? 'team0' : 'team1'] > 0 ? '+' : ''}
                  {roundSummaryData.roundScores[myTeam === 0 ? 'team0' : 'team1'] || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-red-400">{isAr ? "الخصم" : "Opponents"}</span>
                <span className={`font-bold text-sm ${(roundSummaryData.roundScores[myTeam === 0 ? 'team1' : 'team0'] || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {roundSummaryData.roundScores[myTeam === 0 ? 'team1' : 'team0'] > 0 ? '+' : ''}
                  {roundSummaryData.roundScores[myTeam === 0 ? 'team1' : 'team0'] || 0}
                </span>
              </div>
              {/* Bid result detail */}
              <div className="flex justify-center text-[10px] text-muted-foreground gap-2">
                <span>
                  {isAr ? 'المزايد:' : 'Bidder:'} {roundSummaryData.biddingTeam === myTeam ? (isAr ? 'فريقك' : 'You') : (isAr ? 'الخصم' : 'Opp')}
                </span>
                <span>•</span>
                <span>
                  {isAr ? 'المزايدة:' : 'Bid:'} {roundSummaryData.bidValue}
                </span>
                <span>•</span>
                <span className={roundSummaryData.made ? 'text-green-400' : 'text-red-400'}>
                  {roundSummaryData.made ? (isAr ? 'نجح ✓' : 'Made ✓') : (isAr ? 'فشل ✗' : 'Failed ✗')}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center text-xs text-muted-foreground">
                <span>{isAr ? "المجموع" : "Total"}</span>
                <span className="font-bold">
                  {roundSummaryData.totalScores[myTeam === 0 ? 'team0' : 'team1'] || 0} — {roundSummaryData.totalScores[myTeam === 0 ? 'team1' : 'team0'] || 0}
                </span>
              </div>
              <p className="text-center text-[10px] text-muted-foreground mt-1">
                {isAr ? "انقر للإغلاق" : "Tap to close"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Round History panel ── */}
      {showRoundHistory && roundHistory.length > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-[25] backdrop-blur-sm"
          onClick={() => setShowRoundHistory(false)}
        >
          <Card className="w-full max-w-sm mx-4 bg-card/95 backdrop-blur max-h-[70vh] overflow-y-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4" />
                {isAr ? "سجل الجولات" : "Round History"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground border-b pb-1 mb-1">
                  <span>{isAr ? "الجولة" : "Round"}</span>
                  <span className="text-blue-400">{isAr ? "فريقك" : "You"}</span>
                  <span className="text-red-400">{isAr ? "الخصم" : "Opp"}</span>
                  <span>{isAr ? "المزايدة" : "Bid"}</span>
                </div>
                {roundHistory.map((rh, i) => (
                  <div key={i} className="flex justify-between text-xs items-center">
                    <span className="text-muted-foreground w-6">#{rh.round}</span>
                    <span className={`w-8 text-center font-bold ${(myTeam === 0 ? rh.team0Score : rh.team1Score) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {myTeam === 0 ? rh.team0Score : rh.team1Score}
                    </span>
                    <span className={`w-8 text-center font-bold ${(myTeam === 0 ? rh.team1Score : rh.team0Score) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {myTeam === 0 ? rh.team1Score : rh.team0Score}
                    </span>
                    <span className="w-10 text-center">
                      <Badge variant={rh.made ? "default" : "destructive"} className="text-[9px] px-1 h-4">
                        {rh.bidValue}{rh.made ? '✓' : '✗'}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                {isAr ? "انقر للإغلاق" : "Tap to close"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Played Cards Tracker panel ── */}
      {showPlayedCards && playedCardsLog.length > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-[25] backdrop-blur-sm"
          onClick={() => setShowPlayedCards(false)}
        >
          <Card className="w-full max-w-sm mx-4 bg-card/95 backdrop-blur max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {isAr ? "الأوراق الملعوبة" : "Played Cards"}
                <Badge variant="outline" className="ms-auto text-[10px]">{playedCardsLog.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2">
                {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map(suit => {
                  const suitInfo = SUITS[suit];
                  const suitCards = playedCardsLog.filter(c => c.suit === suit);
                  const isTrump = state.trumpSuit === suit;
                  return (
                    <div key={suit} className={`p-1.5 rounded-lg ${isTrump ? 'bg-yellow-900/30 border border-yellow-600/50' : 'bg-muted/30'}`}>
                      <div className={`text-center text-lg ${suitInfo.color}`}>
                        {suitInfo.symbol}
                        {isTrump && <span className="text-[8px] ml-0.5">👑</span>}
                      </div>
                      <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                        {suitCards.length === 0 ? (
                          <span className="text-[9px] text-muted-foreground">—</span>
                        ) : (
                          [...suitCards].sort((a, b) => {
                            const RANK_VAL: Record<string, number> = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
                            return (RANK_VAL[b.rank] || 0) - (RANK_VAL[a.rank] || 0);
                          }).map((c, i) => (
                            <span
                              key={i}
                              className={`text-[10px] font-mono font-bold ${suitInfo.color} ${
                                ['A', 'K', 'Q'].includes(c.rank) ? 'underline' : ''
                              }`}
                            >
                              {c.rank}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3 cursor-pointer" onClick={() => setShowPlayedCards(false)}>
                {isAr ? "انقر للإغلاق" : "Tap to close"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── High Cards Remaining HUD ── */}
      {showHighCards && gamePhase === "playing" && state.trumpSuit && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-[25] backdrop-blur-sm"
          onClick={() => setShowHighCards(false)}
        >
          <Card className="w-full max-w-sm mx-4 bg-card/95 backdrop-blur" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                {isAr ? "الأوراق العالية المتبقية" : "High Cards Remaining"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2">
                {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map(suit => {
                  const suitInfo = SUITS[suit];
                  const isTrump = state.trumpSuit === suit;
                  const HIGH_RANKS = ['A', 'K', 'Q', 'J', '10'];
                  const playedHigh = playedCardsLog.filter(c => c.suit === suit && HIGH_RANKS.includes(c.rank));
                  const myHighInHand = myHand.filter(c => c.suit === suit && HIGH_RANKS.includes(c.rank));
                  // F10-cycle10: Also exclude high cards currently in the trick
                  const trickHigh = (state.currentTrick || []).filter(t => t.card.suit === suit && HIGH_RANKS.includes(t.card.rank));
                  const remainingHigh = HIGH_RANKS.filter(r => 
                    !playedHigh.some(p => p.rank === r) && !myHighInHand.some(h => h.rank === r) && !trickHigh.some(t => t.card.rank === r)
                  );
                  return (
                    <div key={suit} className={`p-1.5 rounded-lg text-center ${isTrump ? 'bg-yellow-900/30 border border-yellow-600/50' : 'bg-muted/30'}`}>
                      <div className={`text-lg ${suitInfo.color}`}>
                        {suitInfo.symbol}
                        {isTrump && <span className="text-[8px] ml-0.5">👑</span>}
                      </div>
                      <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                        {remainingHigh.length === 0 ? (
                          <span className="text-[9px] text-green-400">✓</span>
                        ) : (
                          remainingHigh.map(r => (
                            <span key={r} className={`text-[11px] font-bold ${suitInfo.color}`}>{r}</span>
                          ))
                        )}
                      </div>
                      <div className="text-[8px] text-muted-foreground mt-0.5">
                        {/* F11-cycle8: Include current trick cards in count */}
                        {13 - playedCardsLog.filter(c => c.suit === suit).length - myHand.filter(c => c.suit === suit).length - (state.currentTrick?.filter(t => t.card.suit === suit).length || 0)} {isAr ? 'متبقي' : 'left'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3 cursor-pointer" onClick={() => setShowHighCards(false)}>
                {isAr ? "انقر للإغلاق" : "Tap to close"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Redeal notification toast ── */}
      {showRedealToast && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[25] pointer-events-none">
          <Badge className="bg-orange-600/90 text-white text-sm px-4 py-2 animate-bounce shadow-lg">
            {isAr ? "🔄 الكل باس — توزيع جديد!" : "🔄 All passed — Redealing!"}
          </Badge>
        </div>
      )}

      {/* ── Dealer indicator for self ── */}
      {state.dealerId === playerId && (
        <div className="absolute bottom-[3.5rem] start-4 z-20">
          <Badge variant="outline" className="bg-yellow-900/50 border-yellow-600 text-yellow-300 text-[9px]">
            D — {isAr ? "موزع" : "Dealer"}
          </Badge>
        </div>
      )}

      {/* ── Resign confirm ── */}
      {showResignConfirm && renderResignConfirm()}

      {/* ── Game Finished overlay ── */}
      {gamePhase === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-[40] backdrop-blur-sm">
          <Card className="w-full max-w-sm mx-4 bg-card/95 backdrop-blur animate-in fade-in zoom-in-95 duration-500">
            <CardHeader className="pb-3 text-center">
              <CardTitle className="text-xl flex items-center justify-center gap-2">
                {state.winningTeam === myTeam ? (
                  <>
                    <Trophy className="h-6 w-6 text-yellow-500" />
                    <span className="text-yellow-400">{isAr ? "🎉 فريقك فاز!" : "🎉 Your Team Wins!"}</span>
                  </>
                ) : (
                  <>
                    <Flag className="h-6 w-6 text-red-500" />
                    <span className="text-red-400">{isAr ? "خسارة 😔" : "Defeat 😔"}</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Final score */}
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-xs text-blue-400 mb-1">{isAr ? "فريقك" : "Your Team"}</div>
                  <div className={`text-3xl font-bold ${state.winningTeam === myTeam ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {myScore}
                  </div>
                </div>
                <div className="text-muted-foreground text-lg font-bold">–</div>
                <div className="text-center">
                  <div className="text-xs text-red-400 mb-1">{isAr ? "الخصم" : "Opponents"}</div>
                  <div className={`text-3xl font-bold ${state.winningTeam !== myTeam ? 'text-yellow-400' : 'text-red-400'}`}>
                    {oppScore}
                  </div>
                </div>
              </div>

              {/* Target */}
              <div className="text-center text-xs text-muted-foreground">
                {isAr ? `الهدف: ${targetScore} نقطة` : `Target: ${targetScore} points`}
              </div>

              {/* Round history summary */}
              {roundHistory.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  <div className="text-xs font-medium text-center text-muted-foreground mb-1">
                    {isAr ? "ملخص الجولات" : "Round Summary"}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground border-b pb-1">
                    <span className="w-6">#</span>
                    <span className="w-8 text-center text-blue-400">{isAr ? "أنت" : "You"}</span>
                    <span className="w-8 text-center text-red-400">{isAr ? "خصم" : "Opp"}</span>
                    <span className="w-10 text-center">{isAr ? "مزايدة" : "Bid"}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {roundHistory.map((rh, i) => (
                      <div key={i} className="flex justify-between text-xs items-center">
                        <span className="text-muted-foreground w-6">{rh.round}</span>
                        <span className={`w-8 text-center font-bold ${(myTeam === 0 ? rh.team0Score : rh.team1Score) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {myTeam === 0 ? rh.team0Score : rh.team1Score}
                        </span>
                        <span className={`w-8 text-center font-bold ${(myTeam === 0 ? rh.team1Score : rh.team0Score) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {myTeam === 0 ? rh.team1Score : rh.team0Score}
                        </span>
                        <span className="w-10 text-center">
                          <Badge variant={rh.made ? "default" : "destructive"} className="text-[9px] px-1 h-4">
                            {rh.bidValue}{rh.made ? '✓' : '✗'}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default TarneebBoard;
