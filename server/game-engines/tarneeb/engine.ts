import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from '../types';
import type { PlayingCard, TarneebState } from './types';
import { createShuffledDeck, getCardValue } from './helpers';

// ── F12: Extracted AI constants — no more magic numbers ──
const TARNEEB_AI = {
  // Bidding thresholds
  NEAR_WIN_RATIO: 0.8,         // myScore >= target * this → cautious
  OPP_NEAR_WIN_RATIO: 0.8,     // oppScore >= target * this → aggressive
  SACRIFICE_RATIO: 0.85,       // oppScore >= target * this → sacrifice bid
  SCORE_ADJUST_DIVISOR: 15,    // Math.floor(behindBy / this)
  SACRIFICE_MIN_TRICKS: 5,     // only sacrifice if estimated tricks >= this
  SACRIFICE_MAX_BID: 10,       // only sacrifice if minRequired <= this
  KABOOT_MIN_TRICKS: 8,        // bid 13 only if tricks >= this
  KABOOT_POINTS: 26,           // 13 * 2 multiplier
  // Game phase
  ENDGAME_TRICKS: 9,           // totalTricksPlayed >= this = endgame
  EARLY_GAME_TRICKS: 3,        // totalTricksPlayed <= this = early
  // Card power thresholds
  POWER_ACE: 12,
  POWER_KING: 11,
  POWER_QUEEN: 10,
  POWER_JACK: 9,
  POWER_LOW_MAX: 8,            // cards at or below this are "low"
  // Defender trump lead
  PROACTIVE_TRUMP_MIN_LENGTH: 3, // lead trump proactively with 3+ trumps
  // Partner bid boost (F9)
  PARTNER_BID_HIGH: 8,           // partner bid >= this triggers boost
  PARTNER_BID_SCALE: 0.7,        // scale factor for partner bid bonus
  PARTNER_BID_MAX_BOOST: 3,      // max tricks to add from partner bid
  // Suit establishment (F4)
  ESTABLISH_MIN_LENGTH: 5,       // need 5+ cards to attempt suit establishment
  ESTABLISH_LOW_MAX: 7,          // power <= this is a "low" card for establishment
  // Trump promotion (F8)
  PROMOTION_TRUMP_POWER: 9,      // J+ for promotion candidates
} as const;

export class TarneebEngine implements GameEngine {
  gameType = 'tarneeb';
  minPlayers = 4;
  maxPlayers = 4;

  createInitialState(): string {
    return JSON.stringify(this.createNewGame(['', '', '', ''], 31));
  }

  /**
   * Initialize game with players. Accepts 2 OR 4 player IDs.
   * When 2 players are provided, 2 bot players are generated automatically.
   */
  initializeWithPlayers(playerIds: string[], targetScore: number = 31): string {
    let ids = [...playerIds];
    let botPlayers: string[] = [];

    if (ids.length === 2) {
      // 2 humans → generate 2 bot partners
      // Layout: [human1, human2, bot1, bot2]
      // Teams: team0=[human1(0), bot1(2)], team1=[human2(1), bot2(3)]
      const bot1 = `bot-${ids[0].slice(-4)}-1`;
      const bot2 = `bot-${ids[1].slice(-4)}-2`;
      ids = [ids[0], ids[1], bot1, bot2];
      botPlayers = [bot1, bot2];
    }

    if (ids.length !== 4) {
      throw new Error('Tarneeb requires exactly 4 players (or 2 humans + auto bots)');
    }

    // dealerIndex=3 → first bidder = ids[0] = human1 (matches session currentTurn)
    const state = this.createNewGame(ids, targetScore, 3);
    state.botPlayers = botPlayers.length > 0 ? botPlayers : undefined;
    state.redealCount = 0;

    // Auto-play any initial bot turns
    if (botPlayers.length > 0) {
      return this.runBotTurns(state);
    }
    return JSON.stringify(state);
  }

  private createNewGame(playerIds: string[], targetScore: number, dealerIndex: number = 0, teams?: { team0: string[]; team1: string[] }): TarneebState {
    if (playerIds.length !== 4) {
      throw new Error('Tarneeb requires exactly 4 players');
    }

    const deck = createShuffledDeck();
    const hands: { [playerId: string]: PlayingCard[] } = {};

    for (let i = 0; i < 4; i++) {
      hands[playerIds[i]] = deck.slice(i * 13, (i + 1) * 13);
    }

    const fixedTeams = teams || {
      team0: [playerIds[0], playerIds[2]],
      team1: [playerIds[1], playerIds[3]],
    };

    const firstBidder = playerIds[(dealerIndex + 1) % 4];

    return {
      phase: 'bidding',
      hands,
      currentTrick: [],
      trumpSuit: null,
      currentPlayer: firstBidder,
      playerOrder: playerIds,
      bids: [],
      highestBid: null,
      biddingTeam: null,
      tricksWon: { team0: 0, team1: 0 },
      roundScores: { team0: 0, team1: 0 },
      totalScores: { team0: 0, team1: 0 },
      dealerId: playerIds[dealerIndex],
      dealerIndex,
      trickLeader: firstBidder,
      roundNumber: 1,
      targetScore,
      teams: fixedTeams,
      lastCompletedTrick: undefined,
      botPlayers: undefined,
      redealCount: 0,
      playedCardsMemo: [],
      playerVoids: {},
    };
  }

  // ─── Bot AI ──────────────────────────────────────────────────────

  private isBotPlayer(state: TarneebState, playerId: string): boolean {
    return state.botPlayers?.includes(playerId) ?? false;
  }

  /** Card power: 2=0 ... A=12 (static map for performance) */
  private static readonly RANK_POWER: Record<string, number> = {
    '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
    '9': 7, '10': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12
  };
  private cardPower(rank: string): number {
    return TarneebEngine.RANK_POWER[rank] ?? 0;
  }

  /** Evaluate hand strength => estimated number of tricks */
  private evaluateHandStrength(hand: PlayingCard[]): { tricks: number; bestSuit: string; suitScores: Record<string, number>; voids: number } {
    const suits: Record<string, PlayingCard[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
    for (const c of hand) suits[c.suit].push(c);

    let tricks = 0;
    let voids = 0;
    const suitScores: Record<string, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };

    for (const [suit, cards] of Object.entries(suits)) {
      let score = 0;
      const hasAce = cards.some(c => c.rank === 'A');
      const hasKing = cards.some(c => c.rank === 'K');
      const hasQueen = cards.some(c => c.rank === 'Q');

      for (const c of cards) {
        const p = this.cardPower(c.rank);
        if (p === 12) { tricks += 1.5; score += 5; }      // Ace
        else if (p === 11) { tricks += 0.8; score += 3; }  // King
        else if (p === 10) { tricks += 0.4; score += 2; }  // Queen
        else if (p === 9)  { tricks += 0.15; score += 1; } // Jack
      }

      // A-K sequence bonus: controlling the suit
      if (hasAce && hasKing) {
        tricks += 0.3; // guaranteed 2 tricks from this suit
        score += 3;
      }
      // A-K-Q = almost guaranteed 3 tricks from this suit
      if (hasAce && hasKing && hasQueen) {
        tricks += 0.2;
        score += 2;
      }

      // Unprotected King penalty: K without Ace in short suit
      if (hasKing && !hasAce && cards.length <= 2) {
        tricks -= 0.3; // King might get captured
      }

      // Length bonus: extra cards beyond 3 are potential trump tricks
      if (cards.length > 3) tricks += (cards.length - 3) * 0.4;
      // Void bonus: empty suit = can trump opponents' leads
      if (cards.length === 0) {
        voids++;
      } else if (cards.length === 1) {
        tricks += 0.3; // singleton = likely void after 1 trick
      }
      score += cards.length * 2; // length weight
      suitScores[suit] = score;
    }

    // Voids are valuable if we have trump length
    const bestSuitName = Object.entries(suitScores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'spades';
    // F6-cycle8: Reduce length bonus for non-trump (side) suits — rarely produce full tricks
    for (const [suit, sCards] of Object.entries(suits)) {
      if (suit !== bestSuitName && sCards.length > 3) {
        tricks -= (sCards.length - 3) * 0.15;
      }
    }
    if (voids > 0 && suits[bestSuitName].length >= 4) {
      tricks += voids * 0.5; // each void ~ half a trick when we have trump
    }

    // ── Distribution weight (A1): uneven hands are stronger as trump ──
    const lengths = Object.values(suits).map(s => s.length);
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    const spread = maxLen - minLen; // 5-4-3-1 = spread 4, 4-3-3-3 = spread 1
    if (spread >= 3) tricks += 0.5; // strong uneven distribution
    else if (spread >= 2) tricks += 0.2;

    return { tricks, bestSuit: bestSuitName, suitScores, voids };
  }

  private generateBotMove(state: TarneebState): MoveData {
    const botId = state.currentPlayer;
    const hand = state.hands[botId] || [];

    // ── Team & score context ─────────────────────────────────────
    const botTeamKey = state.teams.team0.includes(botId) ? 'team0' as const : 'team1' as const;
    const oppTeamKey = botTeamKey === 'team0' ? 'team1' as const : 'team0' as const;
    const myScore = state.totalScores[botTeamKey];
    const oppScore = state.totalScores[oppTeamKey];
    const target = state.targetScore || 31;
    const behindBy = oppScore - myScore;
    const iAmBidder = state.biddingTeam !== null && (
      botTeamKey === (state.biddingTeam === 0 ? 'team0' : 'team1')
    );

    // F8: Dispatch to sub-methods
    if (state.phase === 'bidding') {
      return this.generateBotBid(state, botId, hand, botTeamKey, myScore, oppScore, target, behindBy);
    }
    if (state.phase === 'playing' && !state.trumpSuit) {
      return this.selectBotTrump(state, botId, hand);
    }

    // ── Card Play — Advanced Strategic AI ────────────────────────
    if (state.phase === 'playing' && state.trumpSuit) {
      const trumpSuit = state.trumpSuit;
      const trick = state.currentTrick;
      const partnerIdx = (state.playerOrder.indexOf(botId) + 2) % 4;
      const partnerId = state.playerOrder[partnerIdx];
      const botIdx = state.playerOrder.indexOf(botId);
      const opponents = state.teams[oppTeamKey];

      // ── F1: Pre-compute card memo lookups — O(1) instead of O(n) per call ──
      const memo = state.playedCardsMemo || [];
      const playedSet = new Set(memo.map(c => `${c.suit}:${c.rank}`));
      const playedBySuit: Record<string, Set<string>> = {};
      const playedCountBySuit: Record<string, number> = {};
      for (const c of memo) {
        if (!playedBySuit[c.suit]) playedBySuit[c.suit] = new Set();
        playedBySuit[c.suit].add(c.rank);
        playedCountBySuit[c.suit] = (playedCountBySuit[c.suit] || 0) + 1;
      }
      const myCountBySuit: Record<string, number> = {};
      for (const c of hand) myCountBySuit[c.suit] = (myCountBySuit[c.suit] || 0) + 1;

      const isCardPlayed = (suit: string, rank: string) => playedSet.has(`${suit}:${rank}`);
      const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const isMasterCard = (suit: string, rank: string): boolean => {
        const rankIdx = RANK_ORDER.indexOf(rank);
        for (let i = RANK_ORDER.length - 1; i > rankIdx; i--) {
          if (!playedSet.has(`${suit}:${RANK_ORDER[i]}`)) return false;
        }
        return true;
      };
      const remainingInSuit = (suit: string): number => {
        return Math.max(0, 13 - (playedCountBySuit[suit] || 0) - (myCountBySuit[suit] || 0));
      };

      // Count remaining trump cards in opponents' hands (exclude partner's known trumps)
      const cachedPlayedTrumps = playedCountBySuit[trumpSuit] || 0;
      const cachedMyTrumps = myCountBySuit[trumpSuit] || 0;
      // F4: Count partner's known played trumps from memo for precise calculation
      const partnerPlayedTrumps = memo.filter(c => c.suit === trumpSuit && c.playerId === partnerId).length;
      const opponentTrumpsRemaining = (): number => {
        const partnerVoidInTrump = (state.playerVoids?.[partnerId] || []).includes(trumpSuit);
        const totalRemaining = Math.max(0, 13 - cachedPlayedTrumps - cachedMyTrumps);
        if (partnerVoidInTrump) return totalRemaining; // all remaining are opponents'
        // F3+F12-cycle9: Better estimate using known partner played trumps
        // Partner started with roughly (13 - cachedMyTrumps) / 3 trumps (equal dist among 3 others)
        // They've played partnerPlayedTrumps of those already
        const estimatedPartnerStart = Math.round((13 - cachedMyTrumps) / 3);
        const estimatedPartnerRemaining = partnerVoidInTrump ? 0 : Math.max(0, estimatedPartnerStart - partnerPlayedTrumps);
        return Math.max(0, totalRemaining - estimatedPartnerRemaining);
      };

      // Track if all trumps have been played out
      const allTrumpsPlayed = (): boolean => (cachedPlayedTrumps + cachedMyTrumps) >= 13;

      // ── Opponent void tracking: use inline-tracked playerVoids (B3 fix) ──
      const allVoids = state.playerVoids || {};
      const opponentVoids: Record<string, Set<string>> = {};
      for (const oppId of opponents) {
        opponentVoids[oppId] = new Set(allVoids[oppId] || []);
      }
      const isOpponentVoid = (suit: string): boolean =>
        opponents.some(opId => opponentVoids[opId]?.has(suit));
      // B1 fix: isPartnerVoid was a function reference used as boolean — now correct
      const partnerVoidSuits = new Set(allVoids[partnerId] || []);
      const isPartnerVoidIn = (suit: string): boolean => partnerVoidSuits.has(suit);

      // ── F4-cycle8: Read partner count signals — high = even count (more cards), low = odd ──
      const partnerSignalStrength = (suit: string): number => {
        const partnerPlays = memo.filter(m => m.playerId === partnerId && m.suit === suit);
        if (partnerPlays.length === 0) return 0;
        const lastPlay = partnerPlays[partnerPlays.length - 1];
        return this.cardPower(lastPlay.rank) >= 8 ? 1 : -1;
      };

      // ── Game phase awareness ──
      const totalTricksPlayed = state.tricksWon.team0 + state.tricksWon.team1;
      // F10: Dynamic endgame — also enters endgame when tricks needed is tight regardless of total played
      const remainingTricksTotal = 13 - totalTricksPlayed;
      const isEarlyGame = totalTricksPlayed <= TARNEEB_AI.EARLY_GAME_TRICKS;
      const myTeamTricks = state.tricksWon[botTeamKey];
      const oppTeamTricks = state.tricksWon[oppTeamKey];
      const bidValue = state.highestBid?.bid || 7;
      // F2 fix: defender uses OWN team tricks, not opponent's
      const tricksNeeded = iAmBidder ? Math.max(0, bidValue - myTeamTricks) : Math.max(0, (14 - bidValue) - myTeamTricks);
      // F7/F10: Composite endgame flags — dynamic threshold
      const desperateMode = tricksNeeded > 0 && tricksNeeded >= remainingTricksTotal - 1;
      const comfortableMode = tricksNeeded === 0;
      // F8-cycle9: Pressured mode — need most of remaining tricks but not quite desperate
      const pressuredMode = !comfortableMode && !desperateMode && tricksNeeded > 0 && tricksNeeded >= remainingTricksTotal / 2;
      const aggressiveEndgame = desperateMode && remainingTricksTotal <= 5;
      // F10: isEndgame is now dynamic — either by total tricks OR by desperation
      const isEndgame = totalTricksPlayed >= TARNEEB_AI.ENDGAME_TRICKS || (tricksNeeded > 0 && remainingTricksTotal <= tricksNeeded + 1);

      // F4: Get valid cards using internal method (no double-serialization)
      const validMoves = this.getValidMovesFromState(state, botId);
      const playMoves = validMoves.filter(m => m.type === 'playCard');
      if (playMoves.length === 0) {
        // Safety fallback: play any card from hand
        if (hand.length > 0) return { type: 'playCard', card: JSON.stringify(hand[0]) };
        return { type: 'playCard', card: JSON.stringify({ suit: 'spades', rank: '2', value: 0 }) };
      }
      if (playMoves.length === 1) return playMoves[0]; // only one option

      // F12: Pre-parse all card objects once per bot decision (no repeated JSON.parse)
      const parsedCardCache = new Map<string, PlayingCard>();
      const parseCard = (m: MoveData): PlayingCard => {
        const key = typeof m.card === 'string' ? m.card as string : JSON.stringify(m.card);
        let cached = parsedCardCache.get(key);
        if (!cached) {
          cached = (typeof m.card === 'string' ? JSON.parse(m.card as string) : m.card) as PlayingCard;
          parsedCardCache.set(key, cached);
        }
        return cached;
      };

      const cards = playMoves.map(m => ({ move: m, card: parseCard(m) }));
      cards.sort((a, b) => this.cardPower(a.card.rank) - this.cardPower(b.card.rank)); // low to high

      // ── Leading (first card in trick) ──
      if (trick.length === 0) {
        const nonTrumpCards = cards.filter(c => c.card.suit !== trumpSuit);
        const trumpCards = cards.filter(c => c.card.suit === trumpSuit);

        // ── Trump drawing: lead trump to exhaust opponents — continue until they're dry ──
        if (iAmBidder && trumpCards.length > 0) {
          const oppTrumpLeft = opponentTrumpsRemaining();
          const hasStrong = trumpCards.some(c => this.cardPower(c.card.rank) >= 12); // A
          const hasDecent = trumpCards.some(c => this.cardPower(c.card.rank) >= 11); // K+
          const hasMidTrump = trumpCards.some(c => this.cardPower(c.card.rank) >= 9); // J+
          // F5: Count rounds needed to exhaust opponents' trump — can we afford it?
          const roundsToExhaust = Math.ceil(oppTrumpLeft / 2); // each trump lead removes ~2 opp trumps (one per opponent)
          const canAfford = trumpCards.length >= roundsToExhaust;
          // Continue trump drawing even in mid-game if opponents still have trumps
          const shouldDrawTrump = oppTrumpLeft > 0 && canAfford && (
            (hasStrong && trumpCards.length >= 2) ||
            (hasDecent && trumpCards.length >= 3) ||
            (hasMidTrump && trumpCards.length >= 4 && isEarlyGame)
          );
          if (shouldDrawTrump) {
            // Lead highest trump to draw out opponents' trump
            trumpCards.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
            return trumpCards[0].move;
          }
        }

        // ── Defender trump lead: if opponents exhausted a suit, lead trump to remove their ruffs ──
        if (!iAmBidder && trumpCards.length > 0 && !isEndgame) {
          // If we know opponents are void in a suit, they might ruff — lead trump to prevent
          const oppVoidCount = opponents.reduce((cnt, opId) => cnt + (opponentVoids[opId]?.size || 0), 0);
          if (oppVoidCount > 0 && trumpCards.some(c => this.cardPower(c.card.rank) >= TARNEEB_AI.POWER_KING)) {
            trumpCards.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
            return trumpCards[0].move;
          }
          // F8: Proactive defender trump drawing — strong trumps (A/K/Q) with 3+ cards
          const hasStrongTrump = trumpCards.some(c => this.cardPower(c.card.rank) >= TARNEEB_AI.POWER_ACE);
          if (hasStrongTrump && trumpCards.length >= TARNEEB_AI.PROACTIVE_TRUMP_MIN_LENGTH && opponentTrumpsRemaining() > 0) {
            trumpCards.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
            return trumpCards[0].move;
          }
        }

        // ── F2: Comfortable mode — play conservatively, cash safe winners only ──
        if (comfortableMode && nonTrumpCards.length > 0) {
          const safeMastersComf = nonTrumpCards.filter(c => isMasterCard(c.card.suit, c.card.rank) && !isOpponentVoid(c.card.suit));
          if (safeMastersComf.length > 0) {
            // F7-cycle8: Cash from shortest master-holding first (avoid blocking sequences)
            safeMastersComf.sort((a, b) => {
              const aLen = hand.filter(h => h.suit === a.card.suit).length;
              const bLen = hand.filter(h => h.suit === b.card.suit).length;
              return aLen - bLen;
            });
            return safeMastersComf[0].move;
          }
          // F12-cycle10: Avoid suits where opponents showed strength (played A/K)
          const oppStrongSuits = new Set<string>();
          for (const m of memo) {
            if (opponents.includes(m.playerId) && (m.rank === 'A' || m.rank === 'K')) {
              oppStrongSuits.add(m.suit);
            }
          }
          // Comfortable — lead low, avoiding opponent strong suits and ruffs
          const lowNonTrumpSafe = nonTrumpCards.filter(c => this.cardPower(c.card.rank) <= TARNEEB_AI.POWER_LOW_MAX && !oppStrongSuits.has(c.card.suit));
          if (lowNonTrumpSafe.length > 0) return lowNonTrumpSafe[0].move;
          const lowNonTrump = nonTrumpCards.filter(c => this.cardPower(c.card.rank) <= TARNEEB_AI.POWER_LOW_MAX);
          if (lowNonTrump.length > 0) return lowNonTrump[0].move;
          // F5-cycle9: Comfortable fallback — lead lowest from longest non-trump (stay conservative)
          const comfSuitLens: Record<string, number> = {};
          for (const c of nonTrumpCards) comfSuitLens[c.card.suit] = (comfSuitLens[c.card.suit] || 0) + 1;
          const comfSorted = [...nonTrumpCards].sort((a, b) => {
            const aLen = comfSuitLens[a.card.suit] || 0;
            const bLen = comfSuitLens[b.card.suit] || 0;
            if (bLen !== aLen) return bLen - aLen; // longest suit first
            return this.cardPower(a.card.rank) - this.cardPower(b.card.rank); // lowest card
          });
          if (comfSorted.length > 0) return comfSorted[0].move;
        }

        // ── Endgame: cash master cards to secure tricks ──
        if (isEndgame) {
          // F6: Precise counting in endgame — when ≤3 cards left, use exact knowledge
          if (hand.length <= 3) {
            // We know exactly what's out: 52 - played - myHand
            // Find guaranteed winners considering what opponents could have
            const guaranteedWinners = cards.filter(c => {
              if (c.card.suit === trumpSuit) {
                // Trump card: wins if it's the highest remaining trump
                return isMasterCard(c.card.suit, c.card.rank);
              }
              // Non-trump: wins if master AND opponents can't ruff
              if (isMasterCard(c.card.suit, c.card.rank)) {
                // Check if all opponents are void (would ruff)
                return !isOpponentVoid(c.card.suit) || allTrumpsPlayed();
              }
              return false;
            });
            if (guaranteedWinners.length > 0) {
              // Play guaranteed winners first
              guaranteedWinners.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
              return guaranteedWinners[0].move;
            }
          }
          const allMasters = cards.filter(c => isMasterCard(c.card.suit, c.card.rank));
          if (allMasters.length > 0) {
            // F3-cycle10: Prefer masters from suits opponents can't ruff
            const safeEndgameMasters = allMasters.filter(c => !isOpponentVoid(c.card.suit) || c.card.suit === trumpSuit);
            if (safeEndgameMasters.length > 0) {
              safeEndgameMasters.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
              return safeEndgameMasters[0].move;
            }
            allMasters.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
            return allMasters[0].move;
          }
        }

        // ── F2: Aggressive endgame — must win every trick, lead strongest ──
        if (aggressiveEndgame) {
          const strongCards = [...cards].sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
          if (strongCards.length > 0) return strongCards[0].move;
        }

        // F8-cycle9: Pressured mode — prioritize strong leads, avoid wasting time on low cards
        if (pressuredMode && nonTrumpCards.length > 0) {
          const pressureMasters = nonTrumpCards.filter(c => isMasterCard(c.card.suit, c.card.rank) && !isOpponentVoid(c.card.suit));
          if (pressureMasters.length > 0) return pressureMasters[pressureMasters.length - 1].move;
          const pressureHigh = nonTrumpCards.filter(c => this.cardPower(c.card.rank) >= TARNEEB_AI.POWER_KING && !isOpponentVoid(c.card.suit));
          if (pressureHigh.length > 0) return pressureHigh[pressureHigh.length - 1].move;
        }

        // Priority 1: Lead master cards (guaranteed winners)
        const masterCards = nonTrumpCards.filter(c => isMasterCard(c.card.suit, c.card.rank));
        if (masterCards.length > 0) {
          // Avoid leading master in a suit where opponents are void (they'll trump it!)
          const safeMasters = masterCards.filter(c => !isOpponentVoid(c.card.suit));
          if (safeMasters.length > 0) {
            return safeMasters[safeMasters.length - 1].move;
          }
          // All masters are in opponent-void suits — lead highest anyway if endgame
          if (isEndgame) return masterCards[masterCards.length - 1].move;
        }

        // ── Trumps-out detection: when all trumps played, any master wins guaranteed ──
        if (allTrumpsPlayed()) {
          const allMastersNoTrump = nonTrumpCards.filter(c => isMasterCard(c.card.suit, c.card.rank));
          if (allMastersNoTrump.length > 0) {
            // Cash all masters — no one can trump them!
            allMastersNoTrump.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
            return allMastersNoTrump[0].move;
          }
        }

        // ── F4: Entry management — lead back to partner's established suit ──
        if (nonTrumpCards.length > 0 && memo.length > 0) {
          // Find suits where partner won tricks by leading Ace/King
          const partnerWonSuits = new Set<string>();
          for (const m of memo) {
            if (m.playerId === partnerId && (m.rank === 'A' || m.rank === 'K')) {
              partnerWonSuits.add(m.suit);
            }
          }
          if (partnerWonSuits.size > 0) {
            // Lead back to partner's strong suit (they likely have more winners)
            // F5-cycle8: Verify partner's suit isn't dead — still has remaining cards
            const entryCards = nonTrumpCards.filter(c =>
              partnerWonSuits.has(c.card.suit) &&
              !isOpponentVoid(c.card.suit) &&
              remainingInSuit(c.card.suit) > 0
            );
            if (entryCards.length > 0) {
              // Lead low to let partner win with remaining winners
              return entryCards[0].move;
            }
          }
        }

        // ── F5: Exit card strategy — plan re-entry to partner after winning ──
        // If we have no masters but partner has established a suit, keep an exit card
        if (!comfortableMode && nonTrumpCards.length > 1 && memo.length > 0) {
          const partnerLeadSuits = new Set<string>();
          for (const m of memo) {
            if (m.playerId === partnerId) partnerLeadSuits.add(m.suit);
          }
          // Avoid leading from a suit we plan to use as exit to partner
          if (partnerLeadSuits.size > 0) {
            const nonExitCards = nonTrumpCards.filter(c => {
              // Keep one card in partner's suit as exit
              if (partnerLeadSuits.has(c.card.suit)) {
                const myCardsInSuit = nonTrumpCards.filter(x => x.card.suit === c.card.suit);
                return myCardsInSuit.length > 1; // only lead if we have 2+ in this suit
              }
              return true;
            });
            // If we filtered some cards, prefer leading from non-exit suits
            if (nonExitCards.length > 0 && nonExitCards.length < nonTrumpCards.length) {
              const exitFiltered = nonExitCards.filter(c => !partnerLeadSuits.has(c.card.suit));
              if (exitFiltered.length > 0) {
                // Lead from a non-partner suit
                return exitFiltered[0].move;
              }
            }
          }
        }

        // F10-cycle9: Proactive void creation — lead singleton to create void for future ruffing
        if (!comfortableMode && nonTrumpCards.length > 0 && trumpCards.length >= 2) {
          const singletonCards = nonTrumpCards.filter(c => {
            const mySuitCount = hand.filter(h => h.suit === c.card.suit).length;
            return mySuitCount === 1 && !isMasterCard(c.card.suit, c.card.rank);
          });
          if (singletonCards.length > 0 && !isOpponentVoid(singletonCards[0].card.suit)) {
            return singletonCards[0].move;
          }
        }

        // ── Lead into partner's void (partner can ruff) — B1 fix ──
        if (nonTrumpCards.length > 0) {
          const partnerVoidCards = nonTrumpCards.filter(c => isPartnerVoidIn(c.card.suit));
          if (partnerVoidCards.length > 0 && !isOpponentVoid(partnerVoidCards[0].card.suit)) {
            // F7-cycle9: If we have master in partner's void suit, cash it first (guaranteed win)
            const masterInVoidSuit = partnerVoidCards.filter(c => isMasterCard(c.card.suit, c.card.rank));
            if (masterInVoidSuit.length > 0) {
              return masterInVoidSuit[masterInVoidSuit.length - 1].move;
            }
            // Lead low from a suit partner is void in
            return partnerVoidCards[0].move;
          }
        }

        if (nonTrumpCards.length > 0) {
          // ── Void-aware leading: avoid leading where opponents are void ──
          const safeNonTrump = nonTrumpCards.filter(c => !isOpponentVoid(c.card.suit));
          const leadPool = safeNonTrump.length > 0 ? safeNonTrump : nonTrumpCards;

          // ── Avoid leading exposed honors (K or Q without A protection) ──
          const safeLeads = leadPool.filter(c => {
            const rank = c.card.rank;
            const suit = c.card.suit;
            const suitCards = hand.filter(h => h.suit === suit);
            // K without A in short suit = risky lead
            if (rank === 'K' && !suitCards.some(h => h.rank === 'A') && suitCards.length <= 2) return false;
            // Q without K or A = risky
            if (rank === 'Q' && !suitCards.some(h => h.rank === 'K' || h.rank === 'A') && suitCards.length <= 2) return false;
            return true;
          });
          const finalPool = safeLeads.length > 0 ? safeLeads : leadPool;

          // Priority 2: High cards that aren't guaranteed masters but still strong
          const highCards = finalPool.filter(c => this.cardPower(c.card.rank) >= 11);
          if (highCards.length > 0) return highCards[highCards.length - 1].move;

          // ── Duck-then-cash: from A-x-x-x, lead low first to draw out honors ──
          // F6: Extended to A-K-x-x-x — duck once then cash A-K and run winners
          for (const c of finalPool) {
            const suitCards = hand.filter(h => h.suit === c.card.suit);
            // A-K-x-x-x pattern: duck first, then cash A-K and established winners
            if (suitCards.length >= 5 && suitCards.some(h => h.rank === 'A') && suitCards.some(h => h.rank === 'K') && c.card.rank !== 'A' && c.card.rank !== 'K') {
              const lowCards = finalPool.filter(x => x.card.suit === c.card.suit && this.cardPower(x.card.rank) <= 8);
              if (lowCards.length > 0) return lowCards[0].move;
            }
            // Original A-x-x-x pattern — F1-cycle10: skip if K also present (A-K-x-x-x handled above)
            if (suitCards.length >= 4 && suitCards.some(h => h.rank === 'A') && !suitCards.some(h => h.rank === 'K') && c.card.rank !== 'A') {
              const lowCards = finalPool.filter(x => x.card.suit === c.card.suit && this.cardPower(x.card.rank) <= 8);
              if (lowCards.length > 0) return lowCards[0].move;
            }
          }

          // ── F4: Suit establishment — lead low from long suits (5+) without A to set up small cards ──
          for (const c of finalPool) {
            const suitCards = hand.filter(h => h.suit === c.card.suit);
            if (suitCards.length >= TARNEEB_AI.ESTABLISH_MIN_LENGTH && !suitCards.some(h => h.rank === 'A')) {
              // Long suit without Ace — lead low to force out opponents' honors
              const lowEstab = finalPool.filter(x => x.card.suit === c.card.suit && this.cardPower(x.card.rank) <= TARNEEB_AI.ESTABLISH_LOW_MAX);
              if (lowEstab.length > 0) return lowEstab[0].move;
            }
          }

          // ── F5: Lead through strength — lead from bidder's left (through their hand) ──
          if (!iAmBidder && state.highestBid) {
            const bidderIdx = state.playerOrder.indexOf(state.highestBid.playerId);
            const isLeftOfBidder = (bidderIdx + 1) % 4 === botIdx;
            if (isLeftOfBidder && finalPool.length > 0) {
              // We sit left of bidder — bidder plays after us, partner plays before bidder
              // Lead mid-strength cards to put pressure on bidder
              const midCards = finalPool.filter(c => this.cardPower(c.card.rank) >= 8 && this.cardPower(c.card.rank) <= 11);
              if (midCards.length > 0) return midCards[0].move;
            }
          }

          // ── F10: Lead toward partner's tenace (A-Q or K-J position) ──
          // If partner might hold tenace and we can lead through the opponent toward them
          if (!iAmBidder && state.highestBid) {
            const bidderIdx = state.playerOrder.indexOf(state.highestBid.playerId);
            const isRightOfBidder = (bidderIdx + 3) % 4 === botIdx;
            if (isRightOfBidder && finalPool.length > 0) {
              // We sit right of bidder — partner sits left of bidder (through position)
              // Lead low from suits where we have length but not the top card
              // This leads THROUGH bidder TOWARD partner (tenace attack)
              const tenaceLeads = finalPool.filter(c => {
                const mySuitCards = hand.filter(h => h.suit === c.card.suit);
                return mySuitCards.length >= 2 && !mySuitCards.some(h => h.rank === 'A') && this.cardPower(c.card.rank) <= TARNEEB_AI.POWER_LOW_MAX;
              });
              if (tenaceLeads.length > 0) return tenaceLeads[0].move;
            }
          }
          
          // Priority 3: Lead from depleted suits to force opponents to waste trump
          const suitRemaining = finalPool.map(c => ({ ...c, remaining: remainingInSuit(c.card.suit) }));
          const lowRemaining = suitRemaining.filter(c => c.remaining <= 3);
          if (lowRemaining.length > 0) {
            lowRemaining.sort((a, b) => a.remaining - b.remaining);
            return lowRemaining[0].move;
          }
          
          // Lead from longest suit to establish winners
          const suitLens: Record<string, number> = {};
          for (const c of hand) suitLens[c.suit] = (suitLens[c.suit] || 0) + 1;
          const byLength = [...finalPool].sort((a, b) => {
            const aLen = suitLens[a.card.suit] ?? 0;
            const bLen = suitLens[b.card.suit] ?? 0;
            // F11-cycle10: Partner signal is primary when suit lengths are close (≤1 apart)
            const aSig = partnerSignalStrength(a.card.suit);
            const bSig = partnerSignalStrength(b.card.suit);
            if (Math.abs(aLen - bLen) <= 1 && aSig !== bSig) return bSig - aSig;
            if (bLen !== aLen) return bLen - aLen;
            // F4-cycle8: Partner count signal as tiebreaker
            if (bSig !== aSig) return bSig - aSig;
            return this.cardPower(a.card.rank) - this.cardPower(b.card.rank);
          });
          if (byLength.length > 0) return byLength[0].move;
          
          return finalPool[0].move;
        }
        // ── F8: Trump promotion — lead mid-trump to force out opponent's A/K ──
        if (trumpCards.length > 0) {
          const midTrumps = trumpCards.filter(c => this.cardPower(c.card.rank) >= TARNEEB_AI.PROMOTION_TRUMP_POWER && this.cardPower(c.card.rank) < TARNEEB_AI.POWER_ACE);
          if (midTrumps.length > 0 && opponentTrumpsRemaining() > 0) {
            midTrumps.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
            return midTrumps[0].move;
          }
        }
        // Only trump left — play lowest
        return cards[0].move;
      }

      // ── Following ──
      const leadSuit = trick[0].card.suit;

      // Find current winning card in trick
      let winningValue = 0;
      let winningPlayerId = '';
      for (const play of trick) {
        const val = getCardValue(play.card, trumpSuit, leadSuit);
        if (val > winningValue) {
          winningValue = val;
          winningPlayerId = play.playerId;
        }
      }
      const partnerIsWinning = winningPlayerId === partnerId;
      const isLastToPlay = trick.length === 3;

      // Following suit
      const followingSuit = cards.filter(c => c.card.suit === leadSuit);
      if (followingSuit.length > 0) {
        const canWin = followingSuit.filter(c => getCardValue(c.card, trumpSuit, leadSuit) > winningValue);
        if (canWin.length > 0) {
          if (partnerIsWinning && isLastToPlay) {
            // F10: Partner winning & last to play — unblock any honor from short holdings
            const suitLen = followingSuit.length;
            if (suitLen <= 2) {
              // K-x without A: unblock K
              if (followingSuit.some(c => c.card.rank === 'K') && !followingSuit.some(c => c.card.rank === 'A')) {
                const king = followingSuit.find(c => c.card.rank === 'K');
                if (king) return king.move;
              }
              // Q-x without K or A: unblock Q
              if (followingSuit.some(c => c.card.rank === 'Q') && !followingSuit.some(c => c.card.rank === 'K') && !followingSuit.some(c => c.card.rank === 'A')) {
                const queen = followingSuit.find(c => c.card.rank === 'Q');
                if (queen) return queen.move;
              }
              // J-x without Q/K/A: unblock J
              if (followingSuit.some(c => c.card.rank === 'J') && !followingSuit.some(c => c.card.rank === 'Q') && !followingSuit.some(c => c.card.rank === 'K') && !followingSuit.some(c => c.card.rank === 'A')) {
                const jack = followingSuit.find(c => c.card.rank === 'J');
                if (jack) return jack.move;
              }
            }
            return followingSuit[0].move; // duck
          }
          if (partnerIsWinning && !isLastToPlay && !desperateMode) {
            // F1-cycle9: Partner winning & not last — always duck (save resources), except when desperate
            return followingSuit[0].move;
          }

          // ── Second-hand low: as 2nd player, play low by default ──
          if (trick.length === 1 && !partnerIsWinning) {
            // 2nd to play — play low unless we have a master card
            const hasMaster = canWin.some(c => isMasterCard(c.card.suit, c.card.rank));
            // F2-cycle10: Always duck without master in 2nd seat (even with single winner — save resources)
            if (!hasMaster) {
              // Play lowest — let partner (4th player) win
              return followingSuit[0].move;
            }
            // We have a master — grab the trick
            if (hasMaster) {
              const master = canWin.find(c => isMasterCard(c.card.suit, c.card.rank));
              if (master) return master.move;
            }
          }

          // ── Third-hand covering: as 3rd player, cover 2nd player's card ──
          if (trick.length === 2) {
            const nextPlayerIdx = (state.playerOrder.indexOf(botId) + 1) % 4;
            const nextPlayer = state.playerOrder[nextPlayerIdx];
            const nextIsOpponent = opponents.includes(nextPlayer);
            if (nextIsOpponent) {
              // Opponent plays last — play high enough to force them to waste a strong card
              const midWinners = canWin.filter(c => this.cardPower(c.card.rank) >= 10); // Q+
              if (midWinners.length > 0) return midWinners[0].move;
            }
          }

          // ── F7: Extended finessing — A-Q vs K, K-J vs Q, A-J-10 vs K-Q ──
          // F2-fix: Check both played memo AND current trick cards for accurate finesse
          // F2-cycle8: No finesse in 4th seat — nobody plays after us
          if (trick.length >= 1 && trick.length <= 2) {
            const isCardGone = (suit: string, rank: string): boolean => {
              if (isCardPlayed(suit, rank)) return true;
              if (trick.some(t => t.card.suit === suit && t.card.rank === rank)) return true;
              // F2-cycle9: Also check own hand — don't finesse against a card we hold
              return hand.some(h => h.suit === suit && h.rank === rank);
            };
            // F7-cycle10: A-Q-J finesse — play J first (lower risk) when K is missing
            const hasAce = followingSuit.some(c => c.card.rank === 'A');
            const hasQueen = canWin.find(c => c.card.rank === 'Q');
            const hasJackForAQJ = canWin.find(c => c.card.rank === 'J');
            if (hasAce && hasQueen && hasJackForAQJ && !isCardGone(leadSuit, 'K')) {
              return hasJackForAQJ.move; // play J — if K covers, we still have A-Q tenace
            }
            // Classic: A-Q finesse against missing K
            if (hasAce && hasQueen && !isCardGone(leadSuit, 'K')) {
              return hasQueen.move;
            }
            // K-J finesse against missing Q (when A is out)
            const hasKing = followingSuit.some(c => c.card.rank === 'K');
            const hasJack = canWin.find(c => c.card.rank === 'J');
            if (hasKing && hasJack && isCardGone(leadSuit, 'A') && !isCardGone(leadSuit, 'Q')) {
              return hasJack.move;
            }
            // A-J-10 deep finesse — play 10 hoping Q is on the right
            const hasTen = canWin.find(c => c.card.rank === '10');
            if (hasAce && hasJack && hasTen && !isCardGone(leadSuit, 'K') && !isCardGone(leadSuit, 'Q')) {
              return hasTen.move;
            }
          }

          // ── F7: Trick importance: use composite desperate flag ──
          if (desperateMode) {
            // Must win almost every remaining trick — play strongest
            return canWin[canWin.length - 1].move;
          }

          // Win with lowest winning card (economy of force)
          return canWin[0].move;
        }
        // Can't win
        if (partnerIsWinning) {
          // Partner winning — duck hard (play lowest)
          return followingSuit[0].move;
        }
        // ── Endgame: if desperate for tricks, play highest to fight ──
        if (isEndgame && tricksNeeded > (13 - totalTricksPlayed) / 2) {
          return followingSuit[followingSuit.length - 1].move; // play highest
        }
        // F9: Count signal — when can't win, signal suit length to partner
        // High card = even count, low card = odd count (standard count signal)
        if (followingSuit.length >= 2 && followingSuit.length % 2 === 0) {
          // Even count — play second-highest to signal
          return followingSuit[followingSuit.length - 2].move;
        }
        // Odd count — play lowest (default)
        return followingSuit[0].move;
      }

      // ── Can't follow suit (void) ──
      const trumpCards = cards.filter(c => c.card.suit === trumpSuit);
      const nonTrumpCards = cards.filter(c => c.card.suit !== trumpSuit);

      if (partnerIsWinning) {
        // Partner winning — don't waste trump, discard smartly (F9: signal via high discard)
        if (nonTrumpCards.length > 0) {
          return this.pickVoidDiscard(nonTrumpCards, isMasterCard, true).move;
        }
        // Only trump left — play lowest trump
        return cards[0].move;
      }

      // Partner not winning — trump if possible
      if (trumpCards.length > 0) {
        const higherTrumps = trumpCards.filter(c => getCardValue(c.card, trumpSuit, leadSuit) > winningValue);
        if (higherTrumps.length > 0) {
          // ── F9: Overruff awareness: check ALL remaining opponents after us ──
          if (!isLastToPlay) {
            let overruffRisk = false;
            const myPos = state.playerOrder.indexOf(botId);
            // Check every player after us in this trick
            for (let offset = 1; offset <= 3 - trick.length; offset++) {
              const checkIdx = (myPos + offset) % 4;
              const checkPid = state.playerOrder[checkIdx];
              if (!opponents.includes(checkPid)) continue; // partner, skip
              const isVoidInLead = opponentVoids[checkPid]?.has(leadSuit) ?? false;
              const hasTrump = !(opponentVoids[checkPid]?.has(trumpSuit) ?? false);
              if (isVoidInLead && hasTrump) {
                overruffRisk = true;
                break;
              }
              // F12-cycle8: Heuristic — if opponent played few cards in lead suit, likely void soon
              // F6-cycle10: Scale threshold by game phase — early game, one play is normal
              if (!isVoidInLead && hasTrump && totalTricksPlayed >= 3) {
                const oppPlaysInLead = memo.filter(m => m.playerId === checkPid && m.suit === leadSuit).length;
                const voidThreshold = totalTricksPlayed >= 7 ? 1 : 0;
                if (oppPlaysInLead <= voidThreshold) {
                  overruffRisk = true;
                  break;
                }
              }
            }
            if (overruffRisk) {
              // F9-cycle9: Dynamic safe ruff threshold — lower in endgame when trumps depleted
              const oppTrumpsLeft = opponentTrumpsRemaining();
              const safeThreshold = (isEndgame || oppTrumpsLeft <= 3) ? TARNEEB_AI.POWER_JACK : TARNEEB_AI.POWER_QUEEN;
              const safeRuff = higherTrumps.filter(c => this.cardPower(c.card.rank) >= safeThreshold);
              if (safeRuff.length > 0) return safeRuff[0].move;
            }
          }
          // ── F3-cycle8: Trump conservation — adapt to game phase ──
          if (higherTrumps.length > 1) {
            if (desperateMode || isEndgame) {
              // Late/desperate: highest trump to guarantee win vs overruffs
              return higherTrumps[higherTrumps.length - 1].move;
            }
            // Early/mid: lowest winning trump (economy)
            return higherTrumps[0].move;
          }
          // Only one option — play it
          return higherTrumps[0].move;
        }
        // Can't overtrump — save trump, discard non-trump instead
        if (nonTrumpCards.length > 0) {
          return this.pickVoidDiscard(nonTrumpCards, isMasterCard).move;
        }
        return cards[0].move; // lowest trump
      }

      // F5-cycle10: No trump — voids useless without trump, discard lowest non-master
      if (nonTrumpCards.length > 0) {
        const noTrumpNonMasters = nonTrumpCards.filter(c => !isMasterCard(c.card.suit, c.card.rank));
        if (noTrumpNonMasters.length > 0) {
          noTrumpNonMasters.sort((a, b) => this.cardPower(a.card.rank) - this.cardPower(b.card.rank));
          return noTrumpNonMasters[0].move;
        }
        return this.pickVoidDiscard(nonTrumpCards, isMasterCard).move;
      }
      return cards[0].move;
    }

    return { type: 'bid' }; // Fallback: pass
  }

  // inferVoidsFromMemo removed — replaced by inline playerVoids tracking in applyMoveInternal (B3 fix)

  // ── F8: Extracted bidding logic ──
  private generateBotBid(
    state: TarneebState, botId: string, hand: PlayingCard[],
    botTeamKey: 'team0' | 'team1', myScore: number, oppScore: number, target: number, behindBy: number
  ): MoveData {
    const { tricks, voids } = this.evaluateHandStrength(hand);
    let estimatedBid = Math.min(13, Math.max(7, Math.round(tricks)));
    const minRequired = state.highestBid ? state.highestBid.bid + 1 : 7;
    const { NEAR_WIN_RATIO, OPP_NEAR_WIN_RATIO, SACRIFICE_RATIO, SCORE_ADJUST_DIVISOR, SACRIFICE_MIN_TRICKS, SACRIFICE_MAX_BID, KABOOT_MIN_TRICKS, KABOOT_POINTS } = TARNEEB_AI;

    // Position awareness
    const myBidPosition = state.bids.length;
    if (myBidPosition === 0) {
      estimatedBid = Math.max(7, estimatedBid - (tricks < 8 ? 1 : 0));
    } else if (myBidPosition === 1 && tricks < 8.5) {
      // F8-cycle10: 2nd seat caution — two opponents haven't spoken yet
      estimatedBid = Math.max(7, estimatedBid - (tricks < 7.5 ? 1 : 0));
    } else if (myBidPosition === 3 && !state.highestBid && tricks >= 6.8) {
      estimatedBid = Math.max(estimatedBid, 7);
    }

    // Partner awareness
    const partnerIdx = (state.playerOrder.indexOf(botId) + 2) % 4;
    const partnerId = state.playerOrder[partnerIdx];
    const partnerBid = state.bids.find(b => b.playerId === partnerId);
    if (partnerBid?.bid && partnerBid.bid >= TARNEEB_AI.PARTNER_BID_HIGH) {
      const ownStrengthFactor = Math.min(1, (tricks - 5) / 4);
      const rawBoost = (partnerBid.bid - 7) * TARNEEB_AI.PARTNER_BID_SCALE * (0.5 + 0.5 * ownStrengthFactor);
      estimatedBid = Math.min(13, estimatedBid + Math.min(TARNEEB_AI.PARTNER_BID_MAX_BOOST, Math.round(rawBoost)));
    }

    // Infer from opponent bids
    for (const ob of state.bids) {
      if (!ob.bid) continue;
      const isOpp = !state.teams[botTeamKey].includes(ob.playerId);
      if (isOpp && ob.bid >= 9 && tricks < ob.bid) {
        estimatedBid = Math.max(7, estimatedBid - 1);
      }
    }

    // Score-aware bidding
    const scoreAdjust = Math.min(1, Math.max(-1, Math.floor(behindBy / SCORE_ADJUST_DIVISOR)));
    estimatedBid = Math.min(13, Math.max(7, estimatedBid + scoreAdjust));

    if (myScore >= target * NEAR_WIN_RATIO && estimatedBid <= 8) {
      estimatedBid = Math.max(7, estimatedBid - 1);
    }
    if (oppScore >= target * OPP_NEAR_WIN_RATIO) {
      estimatedBid = Math.min(13, estimatedBid + 1);
    }

    // Sacrifice bidding
    if (oppScore >= target * SACRIFICE_RATIO && state.highestBid) {
      const highBidderTeam = state.teams.team0.includes(state.highestBid.playerId) ? 'team0' : 'team1';
      if (highBidderTeam !== botTeamKey && tricks >= SACRIFICE_MIN_TRICKS && minRequired <= SACRIFICE_MAX_BID) {
        estimatedBid = Math.max(estimatedBid, minRequired);
      }
    }

    // Kaboot consideration
    if (tricks >= KABOOT_MIN_TRICKS && voids >= 1 && estimatedBid >= 12 && myScore + KABOOT_POINTS >= target) {
      estimatedBid = 13;
    }

    // Competitive bidding
    if (state.highestBid) {
      const highBidderTeam = state.teams.team0.includes(state.highestBid.playerId) ? 'team0' : 'team1';
      if (highBidderTeam !== botTeamKey && estimatedBid >= minRequired && tricks >= state.highestBid.bid - 1) {
        estimatedBid = Math.max(estimatedBid, minRequired);
      }
    }

    // Tiebreaker-aware bidding
    if (myScore >= target * NEAR_WIN_RATIO && oppScore >= target * NEAR_WIN_RATIO) {
      if (tricks >= 6 || estimatedBid >= minRequired) {
        estimatedBid = Math.max(estimatedBid, minRequired);
      }
    }

    if (estimatedBid >= minRequired && estimatedBid >= 7) {
      return { type: 'bid', bid: Math.min(estimatedBid, 13) };
    }
    return { type: 'bid' }; // pass
  }

  // ── F8: Extracted trump selection logic ──
  private selectBotTrump(state: TarneebState, botId: string, hand: PlayingCard[]): MoveData {
    const { bestSuit, suitScores } = this.evaluateHandStrength(hand);
    const suits: Record<string, PlayingCard[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
    for (const c of hand) suits[c.suit].push(c);

    let finalSuit = bestSuit;
    let bestTrumpScore = -1;

    const partnerBidEntry = state.bids.find(b => b.playerId === state.playerOrder[(state.playerOrder.indexOf(botId) + 2) % 4]);
    const partnerBidLevel = partnerBidEntry?.bid || 0;
    // F8-cycle8: Detect if any opponent bid strongly — penalize short trump choices
    const botTeamKey8 = state.teams.team0.includes(botId) ? 'team0' : 'team1';
    const oppBidHigh = state.bids.some(b => b.bid && b.bid >= 9 && !state.teams[botTeamKey8].includes(b.playerId));

    for (const [suit, cards] of Object.entries(suits)) {
      if (cards.length < 2) continue;
      let score = suitScores[suit] || 0;
      if (cards.some(c => c.rank === 'A')) score += 6;
      if (cards.some(c => c.rank === 'K')) score += 4;
      // F4-cycle10: Include Q and J in trump suit evaluation
      if (cards.some(c => c.rank === 'Q')) score += 2;
      if (cards.some(c => c.rank === 'J')) score += 1;
      if (cards.length > 3) score += (cards.length - 3) * 5;
      for (const [otherSuit, otherCards] of Object.entries(suits)) {
        if (otherSuit === suit) continue;
        if (otherCards.length === 0) score += 8;
        else if (otherCards.length === 1) score += 4;
      }
      if (partnerBidLevel >= 8 && cards.length >= 4) {
        score += Math.min(4, partnerBidLevel - 7);
      }
      // F8-cycle8: Penalize short suits when opponent bid strongly
      if (oppBidHigh && cards.length <= 3) {
        score -= (4 - cards.length) * 3;
      }
      if (cards.length === 2 && !cards.some(c => c.rank === 'A')) score -= 3;
      if (score > bestTrumpScore) {
        bestTrumpScore = score;
        finalSuit = suit;
      }
    }

    return { type: 'setTrump', suit: finalSuit };
  }

  // ── Unified discard helper — pick optimally from non-trump suit ──
  // F9: Attitude signaling — on partner's winning trick, discard high from unwanted suits
  private pickVoidDiscard(
    nonTrumpCards: { move: MoveData; card: PlayingCard }[],
    isMasterCard: (suit: string, rank: string) => boolean,
    partnerIsWinning?: boolean
  ): { move: MoveData; card: PlayingCard } {
    const suitCounts: Record<string, number> = {};
    for (const c of nonTrumpCards) suitCounts[c.card.suit] = (suitCounts[c.card.suit] || 0) + 1;

    // F9: When partner is winning, signal by discarding high from a suit we DON'T want led
    if (partnerIsWinning) {
      // Find suits we DON'T have strength in (no masters, short) — discard high from those
      const weakSuitCards = nonTrumpCards.filter(c => {
        const len = suitCounts[c.card.suit] || 0;
        return !isMasterCard(c.card.suit, c.card.rank) && len <= 2;
      });
      if (weakSuitCards.length > 0) {
        // Discard highest from weak suit to signal "don't lead here"
        weakSuitCards.sort((a, b) => this.cardPower(b.card.rank) - this.cardPower(a.card.rank));
        return weakSuitCards[0];
      }
      // F6-cycle9: Positive signal — discard lowest from strongest suit to say "lead here"
      const strongSuitCards = nonTrumpCards.filter(c => {
        const len = suitCounts[c.card.suit] || 0;
        return len >= 3 || isMasterCard(c.card.suit, c.card.rank);
      });
      if (strongSuitCards.length > 0) {
        strongSuitCards.sort((a, b) => this.cardPower(a.card.rank) - this.cardPower(b.card.rank));
        return strongSuitCards[0];
      }
    }

    // Prefer discarding from shortest suit to create void
    const shortestSuit = Object.entries(suitCounts).sort((a, b) => a[1] - b[1])[0]?.[0];
    const shortSuitCards = nonTrumpCards.filter(c => c.card.suit === shortestSuit);

    // If shortest suit has only 1 low card, discard it to create void
    if (shortSuitCards.length === 1 && this.cardPower(shortSuitCards[0].card.rank) <= TARNEEB_AI.POWER_LOW_MAX) {
      return shortSuitCards[0];
    }

    // Among shortest suit cards, avoid discarding masters — play lowest non-master
    const nonMasterShort = shortSuitCards.filter(c => !isMasterCard(c.card.suit, c.card.rank));
    if (nonMasterShort.length > 0) {
      nonMasterShort.sort((a, b) => this.cardPower(a.card.rank) - this.cardPower(b.card.rank));
      return nonMasterShort[0];
    }

    // All are masters — discard lowest from any non-trump suit
    const sorted = [...nonTrumpCards].sort((a, b) => this.cardPower(a.card.rank) - this.cardPower(b.card.rank));
    return sorted[0];
  }

  // ── F4: Internal getValidMoves from parsed state — avoids double serialization ──
  private getValidMovesFromState(state: TarneebState, playerId: string): MoveData[] {
    if (state.phase === 'finished' || state.currentPlayer !== playerId) {
      return [];
    }

    if (state.phase === 'bidding') {
      const moves: MoveData[] = [{ type: 'bid' }];
      const minBid = state.highestBid ? state.highestBid.bid + 1 : 7;
      for (let bid = minBid; bid <= 13; bid++) {
        moves.push({ type: 'bid', bid });
      }
      return moves;
    }

    if (state.phase === 'playing' && !state.trumpSuit && state.highestBid?.playerId === playerId) {
      return [
        { type: 'setTrump', suit: 'hearts' },
        { type: 'setTrump', suit: 'diamonds' },
        { type: 'setTrump', suit: 'clubs' },
        { type: 'setTrump', suit: 'spades' }
      ];
    }

    if (state.phase === 'playing' && state.trumpSuit) {
      const hand = state.hands[playerId];
      let playableCards = hand;

      if (state.currentTrick.length > 0) {
        const leadSuit = state.currentTrick[0].card.suit;
        const suitCards = hand.filter(c => c.suit === leadSuit);
        if (suitCards.length > 0) {
          playableCards = suitCards;
        }
      }

      return playableCards.map(card => ({ type: 'playCard', card: JSON.stringify(card) }));
    }

    return [];
  }

  /** Auto-play bot turns until human player or game finished. Returns state JSON. */
  // F11: Track round number to break on round boundary (prevents partial-round processing)
  private runBotTurns(state: TarneebState): string {
    let current = state;
    let iterations = 0;
    const startRound = current.roundNumber;
    while (iterations < 100 && current.phase !== 'finished' && this.isBotPlayer(current, current.currentPlayer)) {
      const botMove = this.generateBotMove(current);
      const result = this.applyMoveInternal(current, botMove);
      if (!result.success || !result.state) break;
      current = result.state;
      iterations++;
      // F11: Stop if a new round started (let human see round summary)
      if (current.roundNumber !== startRound) break;
    }
    return JSON.stringify(current);
  }

  /** Auto-play bot turns, accumulating events. */
  // F11: Same round-boundary safety
  private runBotTurnsWithEvents(state: TarneebState, events: GameEvent[]): { stateJson: string; events: GameEvent[] } {
    let current = state;
    const allEvents = [...events];
    let iterations = 0;
    const startRound = current.roundNumber;
    while (iterations < 100 && current.phase !== 'finished' && this.isBotPlayer(current, current.currentPlayer)) {
      const botMove = this.generateBotMove(current);
      const result = this.applyMoveInternal(current, botMove);
      if (!result.success || !result.state) break;
      current = result.state;
      allEvents.push(...result.events);
      iterations++;
      // F11: Stop if a new round started (let human see round summary)
      if (current.roundNumber !== startRound) break;
    }
    return { stateJson: JSON.stringify(current), events: allEvents };
  }

  // F2: validateMove delegates to validateMoveInternal — DRY, single source of truth
  validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
    try {
      const state: TarneebState = JSON.parse(stateJson);
      return this.validateMoveInternal(state, playerId, move);
    } catch (error) {
      console.error('[TarneebEngine] validateMove error:', error);
      return { valid: false, error: 'Invalid game state', errorKey: 'tarneeb.invalidState' };
    }
  }

  // Internal validation from parsed state — single implementation for both public and internal use
  private validateMoveInternal(state: TarneebState, playerId: string, move: MoveData): ValidationResult {
    if (state.phase === 'finished') {
      return { valid: false, error: 'Game is finished', errorKey: 'tarneeb.gameFinished' };
    }
    if (state.currentPlayer !== playerId) {
      return { valid: false, error: 'Not your turn', errorKey: 'tarneeb.notYourTurn' };
    }
    if (move.type === 'bid') {
      if (state.phase !== 'bidding') {
        return { valid: false, error: 'Not in bidding phase', errorKey: 'tarneeb.notBiddingPhase' };
      }
      const bid = move.bid as number | null;
      if (bid !== null) {
        if (bid < 7 || bid > 13) {
          return { valid: false, error: 'Bid must be between 7 and 13', errorKey: 'tarneeb.invalidBidRange' };
        }
        if (state.highestBid && bid <= state.highestBid.bid) {
          return { valid: false, error: 'Bid must be higher than current highest', errorKey: 'tarneeb.bidTooLow' };
        }
      }
      return { valid: true };
    }
    if (move.type === 'setTrump') {
      if (state.phase !== 'playing' || state.trumpSuit !== null) {
        return { valid: false, error: 'Cannot set trump now', errorKey: 'tarneeb.cannotSetTrump' };
      }
      if (!state.highestBid || state.highestBid.playerId !== playerId) {
        return { valid: false, error: 'Only winning bidder can set trump', errorKey: 'tarneeb.notBidWinner' };
      }
      return { valid: true };
    }
    if (move.type === 'playCard') {
      if (state.phase !== 'playing') {
        return { valid: false, error: 'Not in playing phase', errorKey: 'tarneeb.notPlayingPhase' };
      }
      if (!state.trumpSuit) {
        return { valid: false, error: 'Trump suit not set yet', errorKey: 'tarneeb.trumpNotSet' };
      }
      const card = typeof move.card === 'string' ? JSON.parse(move.card) : move.card;
      const hand = state.hands[playerId];
      if (!hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
        return { valid: false, error: 'Card not in hand', errorKey: 'tarneeb.cardNotInHand' };
      }
      if (state.currentTrick.length > 0) {
        const leadSuit = state.currentTrick[0].card.suit;
        if (hand.some(c => c.suit === leadSuit) && card.suit !== leadSuit) {
          return { valid: false, error: 'Must follow suit', errorKey: 'tarneeb.mustFollowSuit' };
        }
      }
      return { valid: true };
    }
    return { valid: false, error: 'Invalid move type', errorKey: 'tarneeb.invalidMoveType' };
  }

  applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
    try {
      const state: TarneebState = JSON.parse(stateJson);

      // F11: Use internal validation from already-parsed state
      const validation = this.validateMoveInternal(state, playerId, move);
      if (!validation.valid) {
        return { success: false, newState: stateJson, events: [], error: validation.error };
      }

      const result = this.applyMoveInternal(state, move);
      if (!result.success || !result.state) {
        return { success: false, newState: stateJson, events: [], error: result.error || 'Failed to apply move' };
      }

      // Auto-play any bot turns after this human move
      if (result.state.botPlayers && result.state.botPlayers.length > 0) {
        const botResult = this.runBotTurnsWithEvents(result.state, result.events);
        return { success: true, newState: botResult.stateJson, events: botResult.events };
      }

      return { success: true, newState: JSON.stringify(result.state), events: result.events };
    } catch (error) {
      console.error('[TarneebEngine] applyMove error:', error);
      return { success: false, newState: stateJson, events: [], error: 'Failed to apply move' };
    }
  }

  /** Internal move application — raw logic without bot auto-play */
  private applyMoveInternal(
    _inputState: TarneebState,
    move: MoveData
  ): { success: boolean; state?: TarneebState; events: GameEvent[]; error?: string } {
    try {
      // F3: Deep clone using structuredClone (faster, preserves undefined)
      const state: TarneebState = structuredClone(_inputState);
      const events: GameEvent[] = [];
      const playerId = state.currentPlayer;

      if (move.type === 'bid') {
        const bid = move.bid as number | null;
        state.bids.push({ playerId, bid });
        if (bid !== null) {
          state.highestBid = { playerId, bid };
        }

        events.push({ type: 'move', data: { action: 'bid', playerId, bid } });

        const currentIndex = state.playerOrder.indexOf(playerId);
        state.currentPlayer = state.playerOrder[(currentIndex + 1) % 4];

        if (state.bids.length === 4) {
          if (!state.highestBid) {
            const currentRedealCount = (state.redealCount || 0) + 1;
            // Max 3 redeals — after that, dealer is forced to bid 7
            if (currentRedealCount >= 3) {
              const dealerId = state.playerOrder[state.dealerIndex];
              state.highestBid = { playerId: dealerId, bid: 7 };
              // F1: Use team membership check instead of dealerIndex % 2
              state.biddingTeam = state.teams.team0.includes(dealerId) ? 0 : 1;
              state.phase = 'playing';
              state.currentPlayer = dealerId;
              state.trickLeader = dealerId;
              events.push({ type: 'move', data: { action: 'forcedBid', playerId: dealerId, bid: 7, reason: 'maxRedeals' } });
              return { success: true, state, events };
            }
            // Rotate dealer and redeal
            const nextDealerIndex = (state.dealerIndex + 1) % 4;
            const newState = this.createNewGame(state.playerOrder, state.targetScore, nextDealerIndex, state.teams);
            newState.totalScores = state.totalScores;
            newState.roundNumber = state.roundNumber;
            newState.botPlayers = state.botPlayers;
            newState.redealCount = currentRedealCount;
            events.push({ type: 'move', data: { action: 'redeal', reason: 'allPassed', newDealer: state.playerOrder[nextDealerIndex], redealCount: newState.redealCount } });
            return { success: true, state: newState, events };
          }

          state.phase = 'playing';
          state.currentPlayer = state.highestBid.playerId;
          state.trickLeader = state.highestBid.playerId;
          state.biddingTeam = state.teams.team0.includes(state.highestBid.playerId) ? 0 : 1;
          events.push({ type: 'move', data: { action: 'biddingComplete', winner: state.highestBid.playerId, bid: state.highestBid.bid } });
        }

        return { success: true, state, events };
      }

      if (move.type === 'setTrump') {
        state.trumpSuit = move.suit as TarneebState['trumpSuit'];
        events.push({ type: 'move', data: { action: 'setTrump', playerId, suit: state.trumpSuit } });
        return { success: true, state, events };
      }

      if (move.type === 'playCard') {
        const card = typeof move.card === 'string' ? JSON.parse(move.card) : move.card;
        const hand = state.hands[playerId];
        const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);

        state.hands[playerId] = hand.filter((_, i) => i !== cardIndex);
        state.currentTrick.push({ playerId, card });

        // Track played card for bot AI memory
        if (!state.playedCardsMemo) state.playedCardsMemo = [];
        state.playedCardsMemo.push({ suit: card.suit, rank: card.rank, playerId });

        // ── Inline void tracking (B3 fix): detect voids as they happen ──
        if (state.currentTrick.length > 1) {
          const trickLeadSuit = state.currentTrick[0].card.suit;
          if (card.suit !== trickLeadSuit) {
            // Player didn't follow suit — they're void in the lead suit
            if (!state.playerVoids) state.playerVoids = {};
            if (!state.playerVoids[playerId]) state.playerVoids[playerId] = [];
            if (!state.playerVoids[playerId].includes(trickLeadSuit)) {
              state.playerVoids[playerId].push(trickLeadSuit);
            }
          }
        }

        events.push({ type: 'move', data: { action: 'playCard', playerId, card } });

        if (state.currentTrick.length === 4) {
          // Save last completed trick before clearing
          state.lastCompletedTrick = [...state.currentTrick];

          const leadSuit = state.currentTrick[0].card.suit;
          let winnerIndex = 0;
          let highestValue = getCardValue(state.currentTrick[0].card, state.trumpSuit, leadSuit);

          for (let i = 1; i < 4; i++) {
            const value = getCardValue(state.currentTrick[i].card, state.trumpSuit, leadSuit);
            if (value > highestValue) {
              highestValue = value;
              winnerIndex = i;
            }
          }

          const winnerId = state.currentTrick[winnerIndex].playerId;
          // F5: Use team membership check instead of fragile index % 2
          const winnerTeam = state.teams.team0.includes(winnerId) ? 0 : 1;

          if (winnerTeam === 0) {
            state.tricksWon.team0++;
          } else {
            state.tricksWon.team1++;
          }

          state.lastTrickWinner = winnerId;
          state.currentTrick = [];
          state.currentPlayer = winnerId;
          state.trickLeader = winnerId;

          events.push({ type: 'win', data: { action: 'trickWon', winner: winnerId, team: winnerTeam } });

          // 13 tricks per round with 52-card deck
          if (state.tricksWon.team0 + state.tricksWon.team1 === 13) {
            const biddingTeam = state.biddingTeam!;
            const biddingTeamTricks = biddingTeam === 0 ? state.tricksWon.team0 : state.tricksWon.team1;
            const bidValue = state.highestBid!.bid;

            // Kaboot: bid 13 = double scoring
            const isKaboot = bidValue === 13;
            const multiplier = isKaboot ? 2 : 1;

            if (biddingTeamTricks >= bidValue) {
              const score = biddingTeamTricks * multiplier;
              if (biddingTeam === 0) {
                state.roundScores.team0 = score;
              } else {
                state.roundScores.team1 = score;
              }
            } else {
              const penalty = bidValue * multiplier;
              const defenderScore = (13 - biddingTeamTricks) * multiplier;
              if (biddingTeam === 0) {
                state.roundScores.team0 = -penalty;
                state.roundScores.team1 = defenderScore;
              } else {
                state.roundScores.team1 = -penalty;
                state.roundScores.team0 = defenderScore;
              }
            }

            state.totalScores.team0 += state.roundScores.team0;
            state.totalScores.team1 += state.roundScores.team1;

            events.push({ type: 'score', data: {
              action: 'roundEnd',
              roundScores: state.roundScores,
              totalScores: state.totalScores,
              biddingTeam,
              bidValue,
              biddingTeamTricks,
              made: biddingTeamTricks >= bidValue,
              isKaboot,
            } });

            if (state.totalScores.team0 >= state.targetScore || state.totalScores.team1 >= state.targetScore) {
              state.phase = 'finished';
              // Tiebreaker: if BOTH teams reach target, bidding team wins
              let winningTeam: number;
              if (state.totalScores.team0 >= state.targetScore && state.totalScores.team1 >= state.targetScore) {
                winningTeam = biddingTeam; // bidding team has priority
              } else {
                winningTeam = state.totalScores.team0 >= state.targetScore ? 0 : 1;
              }
              // F1: Persist winningTeam in state for getGameStatus accuracy
              state.winningTeam = winningTeam;
              events.push({ type: 'game_over', data: { winningTeam, scores: state.totalScores } });
            } else {
              const nextDealerIndex = (state.dealerIndex + 1) % 4;
              const newState = this.createNewGame(state.playerOrder, state.targetScore, nextDealerIndex, state.teams);
              newState.totalScores = state.totalScores;
              newState.roundNumber = state.roundNumber + 1;
              newState.botPlayers = state.botPlayers;
              newState.redealCount = 0;
              newState.lastCompletedTrick = undefined;
              // Preserve last round data for UI summary display
              newState.lastRoundScores = { ...state.roundScores };
              newState.lastBidValue = bidValue;
              newState.lastBiddingTeam = biddingTeam;
              newState.lastBiddingTeamMade = biddingTeamTricks >= bidValue;
              newState.lastIsKaboot = isKaboot;
              events.push({ type: 'move', data: { action: 'newRound', round: newState.roundNumber } });
              return { success: true, state: newState, events };
            }
          }
        } else {
          const currentIndex = state.playerOrder.indexOf(playerId);
          state.currentPlayer = state.playerOrder[(currentIndex + 1) % 4];
        }

        return { success: true, state, events };
      }

      return { success: false, events: [], error: 'Unknown move type' };
    } catch (error) {
      console.error('[TarneebEngine] applyMoveInternal error:', error);
      return { success: false, events: [], error: 'Failed to apply move' };
    }
  }

  getGameStatus(stateJson: string): GameStatus {
    try {
      const state: TarneebState = JSON.parse(stateJson);

      // F1: Use persisted winningTeam from applyMoveInternal (handles tiebreaker correctly)
      let winningTeam: number | undefined;
      if (state.winningTeam !== undefined) {
        winningTeam = state.winningTeam;
      } else {
        // Fallback for states that didn't persist winningTeam
        winningTeam = state.totalScores.team0 >= state.targetScore ? 0 :
                     state.totalScores.team1 >= state.targetScore ? 1 : undefined;
      }

      // For team games, winner = first HUMAN player of winning team
      let winner: string | undefined;
      if (winningTeam !== undefined && state.teams) {
        const teamKey = winningTeam === 0 ? 'team0' : 'team1';
        const teamPlayers = state.teams[teamKey];
        winner = teamPlayers.find(p => !state.botPlayers?.includes(p)) || teamPlayers[0];
      }

      return {
        isOver: state.phase === 'finished',
        winningTeam,
        winner,
        teamScores: { team0: state.totalScores.team0, team1: state.totalScores.team1 },
        reason: state.phase === 'finished' ? 'targetReached' : undefined
      };
    } catch (error) {
      console.error('[TarneebEngine] getGameStatus error:', error);
      return { isOver: false };
    }
  }

  getValidMoves(stateJson: string, playerId: string): MoveData[] {
    try {
      const state: TarneebState = JSON.parse(stateJson);
      return this.getValidMovesFromState(state, playerId);
    } catch (error) {
      console.error('[TarneebEngine] getValidMoves error:', error);
      return [];
    }
  }

  getPlayerView(stateJson: string, playerId: string): PlayerView {
    try {
      const state: TarneebState = JSON.parse(stateJson);
      const isPlayer = state.playerOrder.includes(playerId);
      const team = state.teams ? (state.teams.team0.includes(playerId) ? 0 : state.teams.team1.includes(playerId) ? 1 : undefined) : undefined;

      const otherHandCounts: { [id: string]: number } = {};
      for (const pid of state.playerOrder) {
        if (pid !== playerId) {
          otherHandCounts[pid] = state.hands[pid]?.length || 0;
        }
      }

      return {
        hand: isPlayer ? state.hands[playerId] : [],
        otherHandCounts,
        currentTrick: state.currentTrick,
        trumpSuit: state.trumpSuit,
        currentTurn: state.currentPlayer,
        isMyTurn: state.currentPlayer === playerId,
        gamePhase: state.phase,
        bids: state.bids,
        highestBid: state.highestBid,
        biddingTeam: state.biddingTeam,
        tricksWon: state.tricksWon,
        roundScores: state.roundScores,
        totalScores: state.totalScores,
        playerOrder: state.playerOrder,
        myTeam: team,
        partner: team !== undefined && state.teams
          ? (state.teams[team === 0 ? 'team0' : 'team1'].find(id => id !== playerId))
          : undefined,
        trickLeader: state.trickLeader,
        roundNumber: state.roundNumber,
        targetScore: state.targetScore,
        // F3: Use internal method to avoid re-parsing JSON
        validMoves: state.currentPlayer === playerId ? this.getValidMovesFromState(state, playerId) : [],
        lastTrickWinner: state.lastTrickWinner,
        dealerId: state.dealerId,
        lastCompletedTrick: state.lastCompletedTrick,
        botPlayers: state.botPlayers,
        redealCount: state.redealCount,
        // Last round data for UI summary
        lastRoundScores: state.lastRoundScores,
        lastBidValue: state.lastBidValue,
        lastBiddingTeam: state.lastBiddingTeam,
        lastBiddingTeamMade: state.lastBiddingTeamMade,
        lastIsKaboot: state.lastIsKaboot,
        // F10-cycle8: Include winningTeam directly (avoids fragile index math on client)
        winningTeam: state.winningTeam,
      };
    } catch (error) {
      console.error('[TarneebEngine] getPlayerView error:', error);
      return { hand: undefined };
    }
  }
}

export const tarneebEngine = new TarneebEngine();
