import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from '../types';
import type { PlayingCard, BalootState } from './types';
import { BALOOT_HOKM_VALUES, BALOOT_SUN_VALUES } from './types';
import {
  createNewGame,
  getCardStrength,
  getHighestTrumpStrength,
  detectProjects,
  getCardPoints,
} from './helpers';

export class BalootEngine implements GameEngine {
  gameType = 'baloot';
  minPlayers = 4;
  maxPlayers = 4;

  createInitialState(): string {
    return JSON.stringify(createNewGame(['', '', '', ''], 152));
  }

  /**
   * Initialize with players. Accepts 2 OR 4 player IDs.
   * When 2 players are provided, 2 bot players are generated automatically.
   */
  initializeWithPlayers(playerIds: string[], targetPoints: number = 152): string {
    if (!Number.isInteger(targetPoints) || targetPoints < 1 || targetPoints > 500) {
      throw new Error('Baloot targetPoints must be an integer between 1 and 500');
    }

    if (new Set(playerIds).size !== playerIds.length) {
      throw new Error('Baloot does not allow duplicate player IDs');
    }

    let ids = [...playerIds];
    let botPlayers: string[] = [];

    if (ids.length === 2) {
      // 2 humans → 2 bots: [human1, human2, bot1, bot2]
      // Teams: team0=[human1(0), bot1(2)], team1=[human2(1), bot2(3)]
      const bot1 = `bot-${ids[0].slice(-4)}-1`;
      const bot2 = `bot-${ids[1].slice(-4)}-2`;
      ids = [ids[0], ids[1], bot1, bot2];
      botPlayers = [bot1, bot2];
    }

    if (ids.length !== 4) {
      throw new Error('Baloot requires exactly 4 players (or 2 humans + auto bots)');
    }

    if (new Set(ids).size !== ids.length) {
      throw new Error('Baloot final player list contains duplicates');
    }

    const state = createNewGame(ids, targetPoints, 3);
    state.botPlayers = botPlayers.length > 0 ? botPlayers : undefined;

    // Auto-play any initial bot turns (choosing phase)
    if (botPlayers.length > 0 && this.isBotPlayer(state, state.currentPlayer)) {
      return this.runBotTurns(state);
    }
    return JSON.stringify(state);
  }

  // ─── Bot AI ──────────────────────────────────────────────────────

  private isBotPlayer(state: BalootState, playerId: string): boolean {
    return state.botPlayers?.includes(playerId) ?? false;
  }

  private static readonly RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  private cardPower(rank: string): number {
    return BalootEngine.RANK_ORDER.indexOf(rank);
  }

  /** Evaluate hand for choosing phase — estimate how good the hand is for hokm/sun */
  private evaluateHandForChoosing(hand: PlayingCard[]): {
    bestSuit: PlayingCard['suit'];
    hokmStrength: number;
    sunStrength: number;
    projectBonus: number;
  } {
    const suits: Record<string, PlayingCard[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
    for (const c of hand) suits[c.suit].push(c);

    let bestSuit: PlayingCard['suit'] = 'spades';
    let bestScore = -1;

    for (const [suit, cards] of Object.entries(suits)) {
      let score = 0;
      for (const c of cards) {
        score += BALOOT_HOKM_VALUES[c.rank] || 0;
      }
      // Length bonus for trump
      score += cards.length * 3;
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit as PlayingCard['suit'];
      }
    }

    // Calculate hokm strength with best suit as trump
    let hokmStrength = 0;
    for (const c of suits[bestSuit]) {
      hokmStrength += BALOOT_HOKM_VALUES[c.rank] || 0;
    }
    hokmStrength += suits[bestSuit].length * 5;

    // Sun strength — sum of all sun values + bonus for high cards across suits
    let sunStrength = 0;
    let aceCount = 0;
    let tenCount = 0;
    for (const c of hand) {
      sunStrength += BALOOT_SUN_VALUES[c.rank] || 0;
      if (c.rank === 'A') aceCount++;
      if (c.rank === '10') tenCount++;
    }
    // Aces are dominant in sun (highest with no J/9 trump override)
    sunStrength += aceCount * 5;
    // Having 10s is risky without protection — penalize unprotected 10s
    for (const [suit, cards] of Object.entries(suits)) {
      const hasTen = cards.some(c => c.rank === '10');
      const hasAce = cards.some(c => c.rank === 'A');
      if (hasTen && !hasAce && cards.length <= 2) {
        sunStrength -= 8; // Unprotected 10 penalty
      }
    }

    // Project bonus — detect potential projects for extra choosing incentive
    let projectBonus = 0;
    const rankOrder = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    for (const [, cards] of Object.entries(suits)) {
      if (cards.length < 3) continue;
      const indices = cards.map(c => rankOrder.indexOf(c.rank)).sort((a, b) => a - b);
      let maxSeq = 1, curSeq = 1;
      for (let i = 1; i < indices.length; i++) {
        if (indices[i] === indices[i - 1] + 1) { curSeq++; maxSeq = Math.max(maxSeq, curSeq); }
        else curSeq = 1;
      }
      if (maxSeq >= 5) projectBonus += 100;
      else if (maxSeq >= 4) projectBonus += 50;
      else if (maxSeq >= 3) projectBonus += 20;
    }
    // Four-of-a-kind project check
    for (const rank of ['10', 'J', 'Q', 'K', 'A', '9']) {
      if (hand.filter(c => c.rank === rank).length === 4) {
        projectBonus += 100;
      }
    }

    // Baloot project: K+Q of best suit → hokm only (doesn't score in sun)
    if (suits[bestSuit].some(c => c.rank === 'K') && suits[bestSuit].some(c => c.rank === 'Q')) {
      hokmStrength += 30; // Baloot project (20pts) only in hokm + K+Q pair bonus
    }

    // Void/singleton bonus: unbalanced distribution is powerful in hokm
    for (const [suit, cards] of Object.entries(suits)) {
      if (suit === bestSuit) continue; // skip trump suit
      if (cards.length === 0) hokmStrength += 12; // void = can trump immediately
      else if (cards.length === 1) hokmStrength += 6; // singleton = void after 1 trick
    }

    // Sun void penalty: voids are BAD in sun — you lose control of that suit
    for (const [, cards] of Object.entries(suits)) {
      if (cards.length === 0) sunStrength -= 8; // void = opponents dominate that suit
      else if (cards.length === 1 && cards[0].rank !== 'A') sunStrength -= 4; // singleton without Ace
    }

    // Short trump penalty: fewer than 3 trump cards is risky for hokm
    if (suits[bestSuit].length < 3) {
      hokmStrength -= 10;
    }

    return { bestSuit, hokmStrength, sunStrength, projectBonus };
  }

  private generateBotMove(state: BalootState): MoveData {
    const botId = state.currentPlayer;
    const hand = state.hands[botId] || [];

    // ── Choosing Phase ────────────────────────────────────────────
    if (state.phase === 'choosing') {
      const { bestSuit, hokmStrength, sunStrength, projectBonus } = this.evaluateHandForChoosing(hand);
      const effectiveHokm = hokmStrength + projectBonus;
      const effectiveSun = sunStrength + projectBonus;

      // Second pass round — all hands weak, sun is safer (no J/9 trump override)
      if (state.passRound >= 2) {
        // Only choose hokm if significantly stronger — weak hokm = easy kaboot
        if (effectiveHokm >= effectiveSun + 15) {
          return { type: 'choose', gameType: 'hokm', trumpSuit: bestSuit };
        }
        return { type: 'choose', gameType: 'sun' };
      }

      // Score-aware thresholds: bolder when behind, cautious when ahead
      const botTeamChoose = state.teams.team0.includes(botId) ? 'team0' : 'team1';
      const oppTeamChoose = botTeamChoose === 'team0' ? 'team1' : 'team0';
      const behindBy = state.totalPoints[oppTeamChoose] - state.totalPoints[botTeamChoose];
      const scoreAdjust = Math.min(10, Math.max(-5, Math.floor(behindBy / 15)));

      // Partner pass awareness: if partner already passed, they have a weak hand
      const partnerChooseIdx = (state.playerOrder.indexOf(botId) + 2) % 4;
      const partnerChooseId = state.playerOrder[partnerChooseIdx];
      const chooserStartPos = (state.dealerIndex + 1) % 4;
      const botChoosingPos = (state.playerOrder.indexOf(botId) - chooserStartPos + 4) % 4;
      const partnerChoosingPos = (state.playerOrder.indexOf(partnerChooseId) - chooserStartPos + 4) % 4;
      const partnerAlreadyPassed = partnerChoosingPos < botChoosingPos;
      const partnerWeakPenalty = partnerAlreadyPassed ? 5 : 0;

      // Near-win caution: raise thresholds when close to winning (kaboot = disaster)
      const myTeamPtsChoose = state.totalPoints[botTeamChoose];
      const nearWinPenalty = myTeamPtsChoose >= state.targetPoints * 0.8 ? 8 : 0;

      // Opponent near-win detection: lower thresholds when opponent is close (must fight)
      const oppTeamPtsChoose = state.totalPoints[oppTeamChoose];
      const oppNearWinBonus = oppTeamPtsChoose >= state.targetPoints * 0.8 ? -6 : 0;

      const hokmThresh = 35 - scoreAdjust + partnerWeakPenalty + nearWinPenalty + oppNearWinBonus;
      const sunThresh = 40 - scoreAdjust + partnerWeakPenalty + nearWinPenalty + oppNearWinBonus;

      // First round — pass if hand is weak, choose if strong
      if (effectiveHokm >= hokmThresh) {
        return { type: 'choose', gameType: 'hokm', trumpSuit: bestSuit };
      }
      if (effectiveSun >= sunThresh) {
        return { type: 'choose', gameType: 'sun' };
      }
      return { type: 'pass' };
    }

    // ── Card Play — Strategic AI ─────────────────────────────────
    if (state.phase === 'playing') {
      const gameType = state.gameType!;
      const trumpSuit = state.trumpSuit;
      const trick = state.currentTrick;
      const partnerIdx = (state.playerOrder.indexOf(botId) + 2) % 4;
      const partnerId = state.playerOrder[partnerIdx];
      const isSun = gameType === 'sun';
      const totalTricksPlayed = state.tricksWon.team0 + state.tricksWon.team1;
      const isEndgame = totalTricksPlayed >= 5; // Last 3 tricks

      // Card memory
      const memo = state.playedCardsMemo || [];
      const isCardPlayed = (suit: string, rank: string) =>
        memo.some(c => c.suit === suit && c.rank === rank);
      const RANK_ORDER = BalootEngine.RANK_ORDER;
      // Hokm trump order: J(20) > 9(14) > A > 10 > K > Q > 8 > 7
      const HOKM_TRUMP_RANK_ORDER = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
      const isMasterCard = (suit: string, rank: string): boolean => {
        const order = (!isSun && suit === trumpSuit) ? HOKM_TRUMP_RANK_ORDER : RANK_ORDER;
        const rankIdx = order.indexOf(rank);
        for (let i = order.length - 1; i > rankIdx; i--) {
          if (!isCardPlayed(suit, order[i])) return false;
        }
        return true;
      };
      const remainingInSuit = (suit: string): number => {
        const total = 8; // 32 cards / 4 suits
        const playedCount = memo.filter(c => c.suit === suit).length;
        // Note: currentTrick cards are NOT in playedCardsMemo yet (added on completion)
        const inTrickCount = trick.filter(p => p.card.suit === suit).length;
        const myCount = hand.filter(c => c.suit === suit).length;
        return total - playedCount - inTrickCount - myCount;
      };
      // Point value helper for smarter decisions
      const cardPointValue = (c: PlayingCard): number =>
        getCardPoints(c, gameType, trumpSuit === c.suit);

      // Remaining points in play (for endgame decisions)
      let totalRemainingPts = 0;
      for (const pid of state.playerOrder) {
        for (const c of (state.hands[pid] || [])) {
          totalRemainingPts += cardPointValue(c);
        }
      }
      // Include last-trick bonus if not yet awarded
      if (totalTricksPlayed < 7) totalRemainingPts += 10;

      // Opponent void map — which opponents are known void in which suits
      const voids = state.playerVoids || {};
      const botTeam = state.teams.team0.includes(botId) ? 'team0' : 'team1';
      const opponents = botTeam === 'team0' ? state.teams.team1 : state.teams.team0;
      const isOpponentVoid = (suit: string): boolean =>
        opponents.some(opId => voids[opId]?.includes(suit));
      const isPartnerVoid = (suit: string): boolean =>
        !!voids[partnerId]?.includes(suit);

      // Get valid cards
      const validMoves = this.getValidMovesFromState(state, botId);
      const playMoves = validMoves.filter(m => m.type === 'playCard');
      if (playMoves.length === 0) return { type: 'pass' };
      if (playMoves.length === 1) return playMoves[0];

      // Handle both PlayingCard objects (internal) and JSON strings (external)
      const parseCard = (m: MoveData): PlayingCard => {
        if (typeof m.card === 'string') return JSON.parse(m.card) as PlayingCard;
        return m.card as unknown as PlayingCard;
      };

      const cardStr = (c: PlayingCard) =>
        getCardStrength(c, gameType, trumpSuit, trick[0]?.card.suit || c.suit);
      const cards = playMoves.map(m => ({ move: m, card: parseCard(m) }));
      cards.sort((a, b) => cardStr(a.card) - cardStr(b.card)); // low to high

      // ── Leading (first card in trick) ──
      if (trick.length === 0) {
        const nonTrumpCards = isSun ? cards : cards.filter(c => c.card.suit !== trumpSuit);

        // ── Last-trick bonus hunting: trick 7 (6 completed) — fight to win and control lead for +10 bonus ──
        if (totalTricksPlayed === 6) {
          const masterHighPt = cards.filter(c => isMasterCard(c.card.suit, c.card.rank));
          if (masterHighPt.length > 0) {
            masterHighPt.sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
            return masterHighPt[0].move;
          }
        }

        // Endgame: prefer leading master high-point cards to cash guaranteed points
        if (isEndgame) {
          const masterHighPt = cards.filter(c => isMasterCard(c.card.suit, c.card.rank) && cardPointValue(c.card) >= 10);
          if (masterHighPt.length > 0) {
            // Pick the highest-point master card
            masterHighPt.sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
            return masterHighPt[0].move;
          }
        }

        // Lead master cards (guaranteed winners)
        const pool = nonTrumpCards.length > 0 ? nonTrumpCards : cards;
        const masterCards = pool.filter(c => isMasterCard(c.card.suit, c.card.rank));
        if (masterCards.length > 0) {
          // In hokm, avoid leading masters from suits where opponents are void (they'll trump)
          const safeMasters = !isSun
            ? masterCards.filter(c => !isOpponentVoid(c.card.suit))
            : masterCards;
          const masterPool = safeMasters.length > 0 ? safeMasters : masterCards;
          masterPool.sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
          return masterPool[0].move;
        }

        // ── Trump drawing: lead trump when holding J/9/A to exhaust opponents ──
        if (!isSun && trumpSuit) {
          const myTrumps = cards.filter(c => c.card.suit === trumpSuit);
          if (myTrumps.length > 0) {
            const hasJ = myTrumps.some(c => c.card.rank === 'J');
            const has9 = myTrumps.some(c => c.card.rank === '9');
            const hasA = myTrumps.some(c => c.card.rank === 'A');
            const othersTrump = remainingInSuit(trumpSuit);
            if ((hasJ || has9 || hasA) && othersTrump > 0) {
              myTrumps.sort((a, b) => cardStr(b.card) - cardStr(a.card));
              return myTrumps[0].move;
            }
          }
        }

        // ── Sequence leading: lead Ace from A+K suit for guaranteed winners ──
        if (nonTrumpCards.length > 0) {
          for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
            if (!isSun && suit === trumpSuit) continue;
            const sc = nonTrumpCards.filter(c => c.card.suit === suit);
            const ace = sc.find(c => c.card.rank === 'A');
            if (ace && sc.some(c => c.card.rank === 'K') && !isOpponentVoid(suit)) {
              return ace.move;
            }
          }
        }

        if (nonTrumpCards.length > 0) {
          // Void-aware leading: avoid high-point leads in suits where opponents are void (they can trump)
          const safeCards = !isSun
            ? nonTrumpCards.filter(c => !isOpponentVoid(c.card.suit))
            : nonTrumpCards;
          const leadPool = safeCards.length > 0 ? safeCards : nonTrumpCards;

          // Sun strategy: lead high cards (Aces dominate with no trump override)
          if (isSun) {
            const aces = leadPool.filter(c => c.card.rank === 'A');
            if (aces.length > 0) return aces[0].move;
            // Sun: lead master cards (dynamically computed — not just Aces)
            const sunMasters = leadPool.filter(c => isMasterCard(c.card.suit, c.card.rank));
            if (sunMasters.length > 0) {
              sunMasters.sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
              return sunMasters[0].move;
            }
            // Sun: lead from longest suit to exhaust opponents and create future masters
            const suitLens: Record<string, number> = {};
            for (const c of hand) suitLens[c.suit] = (suitLens[c.suit] || 0) + 1;
            const longestSuitCards = [...leadPool].sort((a, b) => {
              const aLen = suitLens[a.card.suit] ?? 0;
              const bLen = suitLens[b.card.suit] ?? 0;
              if (bLen !== aLen) return bLen - aLen;
              return cardPointValue(b.card) - cardPointValue(a.card);
            });
            if (longestSuitCards.length > 0) return longestSuitCards[0].move;
          }

          // Lead into partner's void in hokm — partner can trump and win
          if (!isSun && trumpSuit) {
            const partnerVoidSuit = leadPool.filter(c => isPartnerVoid(c.card.suit));
            if (partnerVoidSuit.length > 0) {
              // Lead lowest from partner-void suit so partner can trump
              partnerVoidSuit.sort((a, b) => cardPointValue(a.card) - cardPointValue(b.card));
              return partnerVoidSuit[0].move;
            }
          }

          // Avoid leading lone high-point cards (K/10 singleton) in hokm — opponents void in that suit will trump
          if (!isSun) {
            const high = leadPool.filter(c => this.cardPower(c.card.rank) >= 6);
            const safeHigh = high.filter(c => {
              const suitCount = hand.filter(h => h.suit === c.card.suit).length;
              // Don't lead a lone K or 10 — too risky
              if (suitCount === 1 && (c.card.rank === 'K' || c.card.rank === '10')) return false;
              return true;
            });
            if (safeHigh.length > 0) return safeHigh[safeHigh.length - 1].move;
            // If only unsafe high cards, fall through to depleted suit logic
          }

          // Lead high cards from safe suits
          const high = leadPool.filter(c => this.cardPower(c.card.rank) >= 6);
          if (high.length > 0 && isSun) return high[high.length - 1].move;

          // Lead from depleted suit (force others to discard)
          const suitRemaining = nonTrumpCards.map(c => ({ ...c, remaining: remainingInSuit(c.card.suit) }));
          const lowRemaining = suitRemaining.filter(c => c.remaining <= 2);
          if (lowRemaining.length > 0) {
            lowRemaining.sort((a, b) => a.remaining - b.remaining);
            return lowRemaining[0].move;
          }

          // Discard lowest-point card
          const sorted = [...nonTrumpCards].sort((a, b) => cardPointValue(a.card) - cardPointValue(b.card));
          return sorted[0].move;
        }
        return cards[0].move;
      }

      // ── Following ──
      const leadSuit = trick[0].card.suit;

      let winningValue = 0;
      let winningPlayerId = '';
      for (const play of trick) {
        const val = getCardStrength(play.card, gameType, trumpSuit, leadSuit);
        if (val > winningValue) {
          winningValue = val;
          winningPlayerId = play.playerId;
        }
      }
      const partnerIsWinning = winningPlayerId === partnerId;

      // Calculate trick point value for smarter decisions
      let trickPointsSoFar = 0;
      for (const play of trick) {
        trickPointsSoFar += cardPointValue(play.card);
      }

      // Endgame aggression: if team is behind, fight harder for high-value tricks
      const myTeamKey = botTeam as 'team0' | 'team1';
      const oppTeamKey = myTeamKey === 'team0' ? 'team1' : 'team0';
      const myTeamPts = state.roundPoints[myTeamKey];
      const oppTeamPts = state.roundPoints[oppTeamKey];
      const isBehind = myTeamPts < oppTeamPts;
      // Kaboot prevention: chooser's team fights harder early when significantly behind
      const chooserTeamForPlay = state.teams.team0.includes(state.choosingPlayer) ? 'team0' : 'team1';
      const isOnChooserTeam = (myTeamKey === chooserTeamForPlay);
      const kabootDanger = isOnChooserTeam && isBehind && (oppTeamPts - myTeamPts >= 15) && totalTricksPlayed >= 3;
      // Clean kaboot hunting: if opponent is chooser and has 0 tricks, play max aggression for ×2
      const isHuntingCleanKaboot = !isOnChooserTeam && state.tricksWon[chooserTeamForPlay] === 0 && totalTricksPlayed >= 3;
      // Score gap analysis: very behind → max aggression, comfortably ahead → conservative
      const pointGap = myTeamPts - oppTeamPts;
      const desperateMode = pointGap < -30 && totalTricksPlayed >= 2; // very behind
      const comfortableMode = pointGap > 25 && !isHuntingCleanKaboot; // well ahead
      const aggressiveEndgame = (isEndgame && isBehind && totalRemainingPts >= 20) || kabootDanger || desperateMode || isHuntingCleanKaboot;

      // Following suit
      const followingSuit = cards.filter(c => c.card.suit === leadSuit);
      if (followingSuit.length > 0) {
        const canWin = followingSuit.filter(c => getCardStrength(c.card, gameType, trumpSuit, leadSuit) > winningValue);
        if (canWin.length > 0) {
          // Partner winning + last to play → feed high-point cards to help score
          if (partnerIsWinning && trick.length === 3) {
            const sortedByPts = [...followingSuit].sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
            return sortedByPts[0].move; // Play highest-point card to maximize partner's trick
          }
          // Second position (before partner) → play conservatively, let partner close
          if (trick.length === 1 && !comfortableMode) {
            return canWin[0].move; // Play lowest winning card
          }
          // Third position: partner winning — don't overtake, save strong cards
          if (trick.length === 2 && partnerIsWinning) {
            const dumpSorted = [...followingSuit].sort((a, b) => cardPointValue(a.card) - cardPointValue(b.card));
            return dumpSorted[0].move;
          }
          // Third position: opponent winning — cost-benefit check
          if (trick.length === 2 && !partnerIsWinning) {
            const lowestWinCost = cardPointValue(canWin[0].card);
            // Skip dump on last 2 tricks: winning controls lead for 10pt last-trick bonus
            if (trickPointsSoFar < 8 && lowestWinCost >= 10 && totalTricksPlayed < 6 && !desperateMode) {
              // Low-value trick — don't waste high-point card
              const dumpSorted = [...followingSuit].sort((a, b) => cardPointValue(a.card) - cardPointValue(b.card));
              return dumpSorted[0].move;
            }
          }
          // Clean kaboot hunting: always play strongest card to deny chooser's team any trick
          if (isHuntingCleanKaboot) return canWin[canWin.length - 1].move;
          // Endgame: be aggressive when behind — fight for high-point tricks
          if (aggressiveEndgame && trickPointsSoFar >= 10) return canWin[canWin.length - 1].move;
          if (isEndgame && trickPointsSoFar >= 15) return canWin[0].move;
          return canWin[0].move;
        }
        // Can't win — feed partner high-point cards if they're winning, else dump lowest
        if (partnerIsWinning && trick.length === 3) {
          const sortedByPts = [...followingSuit].sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
          return sortedByPts[0].move;
        }
        const sortedByPts = [...followingSuit].sort((a, b) => cardPointValue(a.card) - cardPointValue(b.card));
        return sortedByPts[0].move;
      }

      // ── Void development: prefer discarding from shortest non-trump suit to create voids ──
      const pickVoidDiscard = (pool: typeof cards): typeof cards[0] => {
        // Group by suit, find shortest suit to develop a void
        const suitCounts: Record<string, number> = {};
        for (const c of hand) {
          if (!isSun && c.suit === trumpSuit) continue; // skip trump in hokm
          suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        }
        // Sort pool: prefer cards from shortest suit, then lowest points
        const sorted = [...pool].sort((a, b) => {
          const aSuitLen = suitCounts[a.card.suit] ?? 99;
          const bSuitLen = suitCounts[b.card.suit] ?? 99;
          if (aSuitLen !== bSuitLen) return aSuitLen - bSuitLen;
          return cardPointValue(a.card) - cardPointValue(b.card);
        });
        return sorted[0];
      };

      // Can't follow suit — Sun mode: no trump, just discard
      if (isSun) {
        if (partnerIsWinning) {
          // Feed partner high-point cards
          const sortedByPts = [...cards].sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
          return sortedByPts[0].move;
        }
        // Void development discard
        return pickVoidDiscard(cards).move;
      }

      // Hokm: can't follow suit
      const trumpCards = cards.filter(c => c.card.suit === trumpSuit);
      const nonTrumpCards = cards.filter(c => c.card.suit !== trumpSuit);

      if (partnerIsWinning) {
        // Feed partner high-point non-trump cards, but preserve master cards for future leads
        if (nonTrumpCards.length > 0) {
          const nonMasterHighPt = nonTrumpCards.filter(c => !isMasterCard(c.card.suit, c.card.rank));
          const feedPool = nonMasterHighPt.length > 0 ? nonMasterHighPt : nonTrumpCards;
          const sortedByPts = [...feedPool].sort((a, b) => cardPointValue(b.card) - cardPointValue(a.card));
          return sortedByPts[0].move;
        }
        return cards[0].move;
      }

      // Trump if possible — check for over-trump risk at position 2
      if (trumpCards.length > 0) {
        const higherTrumps = trumpCards.filter(c => getCardStrength(c.card, gameType, trumpSuit, leadSuit) > winningValue);
        if (higherTrumps.length > 0) {
          // Over-trump risk: at position 2 (before partner), opponents after us may have higher trumps
          if (trick.length === 1 && trickPointsSoFar < 8 && !aggressiveEndgame) {
            // Check if opponents could over-trump — avoid wasting trump on low-value tricks
            const highestAvailTrump = higherTrumps[higherTrumps.length - 1];
            const myTrumpRank = BALOOT_HOKM_VALUES[highestAvailTrump.card.rank] || 0;
            if (myTrumpRank < 14 && nonTrumpCards.length > 0) {
              // Low trump (not J/9) on a low-value trick — discard instead
              return pickVoidDiscard(nonTrumpCards).move;
            }
          }
          // Aggressive endgame: use highest trump when behind to lock down the trick
          if (aggressiveEndgame && trickPointsSoFar >= 10) return higherTrumps[higherTrumps.length - 1].move;
          // Normal endgame: use highest trump on high-point tricks
          if (isEndgame && trickPointsSoFar >= 15) return higherTrumps[higherTrumps.length - 1].move;
          return higherTrumps[0].move;
        }
        // Can't overtake — void development discard
        if (nonTrumpCards.length > 0) {
          return pickVoidDiscard(nonTrumpCards).move;
        }
        return cards[0].move;
      }

      // No trump — void development discard
      return pickVoidDiscard(cards).move;
    }

    return { type: 'pass' };
  }

  /** Auto-play bot turns until human player or game finished. */
  private runBotTurns(state: BalootState): string {
    let current = state;
    let iterations = 0;
    while (iterations < 100 && current.phase !== 'finished' && this.isBotPlayer(current, current.currentPlayer)) {
      const botMove = this.generateBotMove(current);
      const result = this.applyMoveInternal(current, botMove);
      if (!result.success || !result.state) break;
      current = result.state;
      iterations++;
    }
    return JSON.stringify(current);
  }

  /** Auto-play bot turns, accumulating events. */
  private runBotTurnsWithEvents(state: BalootState, events: GameEvent[]): { stateJson: string; events: GameEvent[] } {
    let current = state;
    const allEvents = [...events];
    let iterations = 0;
    while (iterations < 100 && current.phase !== 'finished' && this.isBotPlayer(current, current.currentPlayer)) {
      const botMove = this.generateBotMove(current);
      const result = this.applyMoveInternal(current, botMove);
      if (!result.success || !result.state) break;
      current = result.state;
      allEvents.push(...result.events);
      iterations++;
    }
    return { stateJson: JSON.stringify(current), events: allEvents };
  }

  validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
    try {
      const state: BalootState = JSON.parse(stateJson);

      if (state.phase === 'finished') {
        return { valid: false, error: 'Game is finished', errorKey: 'baloot.gameFinished' };
      }

      if (move.type === 'choose') {
        if (state.phase !== 'choosing') {
          return { valid: false, error: 'Not in choosing phase', errorKey: 'baloot.notChoosingPhase' };
        }
        if (state.choosingPlayer !== playerId) {
          return { valid: false, error: 'Not your turn to choose', errorKey: 'baloot.notYourTurn' };
        }
        const gameType = move.gameType as string;
        if (gameType !== 'sun' && gameType !== 'hokm') {
          return { valid: false, error: 'Invalid game type — must be sun or hokm', errorKey: 'baloot.invalidGameType' };
        }
        if (gameType === 'hokm') {
          const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
          if (!move.trumpSuit || !validSuits.includes(move.trumpSuit as string)) {
            return { valid: false, error: 'Must specify valid trump suit for hokm', errorKey: 'baloot.mustSpecifyTrump' };
          }
        }
        return { valid: true };
      }

      if (move.type === 'pass') {
        if (state.phase !== 'choosing') {
          return { valid: false, error: 'Not in choosing phase', errorKey: 'baloot.notChoosingPhase' };
        }
        if (state.choosingPlayer !== playerId) {
          return { valid: false, error: 'Not your turn', errorKey: 'baloot.notYourTurn' };
        }
        // In second pass round, you cannot pass — must choose
        if (state.passRound >= 2) {
          return { valid: false, error: 'Must choose in second round (cannot pass)', errorKey: 'baloot.mustChooseSecondRound' };
        }
        return { valid: true };
      }

      if (move.type === 'playCard') {
        if (state.phase !== 'playing') {
          return { valid: false, error: 'Not in playing phase', errorKey: 'baloot.notPlayingPhase' };
        }
        if (state.currentPlayer !== playerId) {
          return { valid: false, error: 'Not your turn', errorKey: 'baloot.notYourTurn' };
        }

        let card: unknown;
        if (typeof move.card === 'string') {
          try {
            card = JSON.parse(move.card);
          } catch {
            return { valid: false, error: 'Invalid card payload', errorKey: 'baloot.invalidCardPayload' };
          }
        } else {
          card = move.card;
        }
        if (!card || typeof card !== 'object') {
          return { valid: false, error: 'Invalid card payload', errorKey: 'baloot.invalidCardPayload' };
        }
        const cardSuit = (card as { suit?: unknown }).suit;
        const cardRank = (card as { rank?: unknown }).rank;
        const validSuits = new Set(['hearts', 'diamonds', 'clubs', 'spades']);
        const validRanks = new Set(['7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
        if (typeof cardSuit !== 'string' || typeof cardRank !== 'string' || !validSuits.has(cardSuit) || !validRanks.has(cardRank)) {
          return { valid: false, error: 'Invalid card payload', errorKey: 'baloot.invalidCardPayload' };
        }
        const hand = state.hands[playerId];
        const hasCard = hand.some(c => c.suit === cardSuit && c.rank === cardRank);

        if (!hasCard) {
          return { valid: false, error: 'Card not in hand', errorKey: 'baloot.cardNotInHand' };
        }

        if (state.currentTrick.length > 0) {
          const leadSuit = state.currentTrick[0].card.suit;
          const hasSuit = hand.some(c => c.suit === leadSuit);

          if (hasSuit && cardSuit !== leadSuit) {
            return { valid: false, error: 'Must follow suit', errorKey: 'baloot.mustFollowSuit' };
          }

          if (state.gameType === 'hokm' && !hasSuit && state.trumpSuit) {
            const hasTrump = hand.some(c => c.suit === state.trumpSuit);
            if (hasTrump && cardSuit !== state.trumpSuit) {
              return { valid: false, error: 'Must play trump', errorKey: 'baloot.mustPlayTrump' };
            }
            // Must-overtake rule
            if (hasTrump && cardSuit === state.trumpSuit) {
              const highestTrumpInTrick = getHighestTrumpStrength(state.currentTrick, state.trumpSuit);
              if (highestTrumpInTrick > 0) {
                const playedTrumpStrength = BALOOT_HOKM_VALUES[cardRank] || 0;
                const canOvertake = hand.some(c => 
                  c.suit === state.trumpSuit && (BALOOT_HOKM_VALUES[c.rank] || 0) > highestTrumpInTrick
                );
                if (canOvertake && playedTrumpStrength <= highestTrumpInTrick) {
                  return { valid: false, error: 'Must play a higher trump (overtake rule)', errorKey: 'baloot.mustOvertake' };
                }
              }
            }
          }
        }

        return { valid: true };
      }

      return { valid: false, error: 'Invalid move type', errorKey: 'baloot.invalidMoveType' };
    } catch {
      return { valid: false, error: 'Invalid game state', errorKey: 'baloot.invalidState' };
    }
  }

  applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
    try {
      const state: BalootState = JSON.parse(stateJson);

      const validation = this.validateMove(stateJson, playerId, move);
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
      return { success: false, newState: stateJson, events: [], error: 'Failed to apply move' };
    }
  }

  /** Internal move application — raw logic without bot auto-play */
  private applyMoveInternal(
    _inputState: BalootState,
    move: MoveData
  ): { success: boolean; state?: BalootState; events: GameEvent[]; error?: string } {
    try {
      const state: BalootState = structuredClone(_inputState);
      const events: GameEvent[] = [];
      const playerId = state.choosingPlayer || state.currentPlayer;

      if (state.phase === 'finished') {
        return { success: false, events: [], error: 'Game is finished' };
      }

      if (move.type === 'choose') {
        const gameType = move.gameType as 'sun' | 'hokm';
        state.phase = 'playing';
        state.gameType = gameType;
        state.trumpSuit = gameType === 'hokm' ? move.trumpSuit as BalootState['trumpSuit'] : null;
        // First trick always led by player after dealer (not after chooser)
        const firstPlayerId = state.playerOrder[(state.dealerIndex + 1) % 4];
        state.currentPlayer = firstPlayerId;
        state.trickLeader = firstPlayerId;

        // Detect and score projects for all players
        state.projects = [];
        for (const pid of state.playerOrder) {
          const playerProjects = detectProjects(state.hands[pid], gameType, state.trumpSuit);
          for (const proj of playerProjects) {
            state.projects.push({ playerId: pid, project: proj.project, points: proj.points });
            const team = state.teams.team0.includes(pid) ? 'team0' : 'team1';
            state.roundPoints[team] += proj.points;
          }
        }

        // Store choice info for UI display
        state.lastChoice = { playerId, gameType, trumpSuit: state.trumpSuit };

        events.push({ type: 'move', data: { action: 'choose', playerId, gameType, trumpSuit: state.trumpSuit, projects: state.projects } });
        return { success: true, state, events };
      }

      if (move.type === 'pass') {
        state.passCount++;
        const currentIndex = state.playerOrder.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % 4;

        events.push({ type: 'move', data: { action: 'pass', playerId } });

        if (state.passCount >= 4) {
          if (state.passRound >= 2) {
            // Second round all passed (shouldn't happen due to validation, but fallback)
            state.phase = 'playing';
            state.gameType = 'sun';
            state.trumpSuit = null;
            const forcedFirstPlayer = state.playerOrder[(state.dealerIndex + 1) % 4];
            state.currentPlayer = forcedFirstPlayer;
            state.trickLeader = forcedFirstPlayer;
            state.choosingPlayer = forcedFirstPlayer;
            state.lastChoice = { playerId: forcedFirstPlayer, gameType: 'sun', trumpSuit: null };
            // Detect projects for forced sun
            state.projects = [];
            for (const pid of state.playerOrder) {
              const playerProjects = detectProjects(state.hands[pid], 'sun', null);
              for (const proj of playerProjects) {
                state.projects.push({ playerId: pid, project: proj.project, points: proj.points });
                const team = state.teams.team0.includes(pid) ? 'team0' : 'team1';
                state.roundPoints[team] += proj.points;
              }
            }
            events.push({ type: 'move', data: { action: 'forcedSun', projects: state.projects } });
          } else {
            // First round all passed — start second round (forced choosing)
            state.passRound = Math.min(2, state.passRound + 1);
            state.passCount = 0;
            state.choosingPlayer = state.playerOrder[(state.dealerIndex + 1) % 4];
            state.currentPlayer = state.choosingPlayer;
            events.push({ type: 'move', data: { action: 'secondPassRound' } });
          }
        } else {
          state.choosingPlayer = state.playerOrder[nextIndex];
          state.currentPlayer = state.playerOrder[nextIndex];
        }

        return { success: true, state, events };
      }

      if (move.type === 'playCard') {
        let card: unknown;
        if (typeof move.card === 'string') {
          try {
            card = JSON.parse(move.card);
          } catch {
            return { success: false, events: [], error: 'Invalid card payload' };
          }
        } else {
          card = move.card;
        }
        if (!card || typeof card !== 'object') {
          return { success: false, events: [], error: 'Invalid card payload' };
        }

        const cardSuit = (card as { suit?: unknown }).suit;
        const cardRank = (card as { rank?: unknown }).rank;
        const validSuits = new Set(['hearts', 'diamonds', 'clubs', 'spades']);
        const validRanks = new Set(['7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
        if (typeof cardSuit !== 'string' || typeof cardRank !== 'string' || !validSuits.has(cardSuit) || !validRanks.has(cardRank)) {
          return { success: false, events: [], error: 'Invalid card payload' };
        }

        const cardPlayerId = state.currentPlayer;
        const hand = state.hands[cardPlayerId];
        const normalizedCard = card as PlayingCard;
        const cardIndex = hand.findIndex(c => c.suit === normalizedCard.suit && c.rank === normalizedCard.rank);
        if (cardIndex < 0) {
          return { success: false, events: [], error: 'Card not in hand' };
        }

        state.hands[cardPlayerId] = hand.filter((_, i) => i !== cardIndex);
        state.currentTrick.push({ playerId: cardPlayerId, card: normalizedCard });

        // Track played cards for bot memory
        if (!state.playedCardsMemo) state.playedCardsMemo = [];
        state.playedCardsMemo.push({ suit: normalizedCard.suit, rank: normalizedCard.rank, playerId: cardPlayerId });

        // Track player voids: if player didn't follow lead suit, they're void in it
        if (state.currentTrick.length > 1) {
          const leadSuit = state.currentTrick[0].card.suit;
          if (normalizedCard.suit !== leadSuit) {
            if (!state.playerVoids) state.playerVoids = {};
            if (!state.playerVoids[cardPlayerId]) state.playerVoids[cardPlayerId] = [];
            if (!state.playerVoids[cardPlayerId].includes(leadSuit)) {
              state.playerVoids[cardPlayerId].push(leadSuit);
            }
          }
        }

        events.push({ type: 'move', data: { action: 'playCard', playerId: cardPlayerId, card: normalizedCard } });

        if (state.currentTrick.length === 4) {
          // Save last completed trick for UI peek
          state.lastCompletedTrick = [...state.currentTrick];

          const leadSuit = state.currentTrick[0].card.suit;
          let winnerIndex = 0;
          let highestValue = getCardStrength(state.currentTrick[0].card, state.gameType!, state.trumpSuit, leadSuit);
          let trickPoints = 0;

          for (let i = 0; i < 4; i++) {
            const c = state.currentTrick[i].card;
            const value = getCardStrength(c, state.gameType!, state.trumpSuit, leadSuit);
            if (value > highestValue) {
              highestValue = value;
              winnerIndex = i;
            }
            trickPoints += getCardPoints(c, state.gameType!, state.trumpSuit === c.suit);
          }

          const winnerId = state.currentTrick[winnerIndex].playerId;
          const winnerTeam = state.teams.team0.includes(winnerId) ? 0 : 1;

          if (winnerTeam === 0) {
            state.tricksWon.team0++;
            state.roundPoints.team0 += trickPoints;
          } else {
            state.tricksWon.team1++;
            state.roundPoints.team1 += trickPoints;
          }

          state.lastTrickWinner = winnerId;
          state.currentTrick = [];
          state.currentPlayer = winnerId;
          state.trickLeader = winnerId;

          // Include last-trick bonus (+10) in lastTrickPoints for correct UI display
          const isLastTrick = state.tricksWon.team0 + state.tricksWon.team1 === 8;
          state.lastTrickPoints = isLastTrick ? trickPoints + 10 : trickPoints;

          events.push({ type: 'win', data: { action: 'trickWon', winner: winnerId, team: winnerTeam, points: state.lastTrickPoints } });

          if (isLastTrick) {
            // Last trick bonus: 10 points
            if (winnerTeam === 0) {
              state.roundPoints.team0 += 10;
            } else {
              state.roundPoints.team1 += 10;
            }

            // Kaboot logic
            const chooserTeam = state.teams.team0.includes(state.choosingPlayer) ? 'team0' : 'team1';
            const opponentTeam = chooserTeam === 'team0' ? 'team1' : 'team0';
            const totalRoundPoints = state.roundPoints.team0 + state.roundPoints.team1;
            let kabootHappened = false;

            // Clean sweep kaboot: opponent wins ALL 8 tricks = double points
            if (state.tricksWon[chooserTeam] === 0) {
              // Chooser won zero tricks — clean sweep kaboot (double)
              state.roundPoints[opponentTeam] = totalRoundPoints * 2;
              state.roundPoints[chooserTeam] = 0;
              kabootHappened = true;
              events.push({ type: 'move', data: { action: 'kaboot', losingTeam: chooserTeam, cleanSweep: true } });
            } else if (state.roundPoints[chooserTeam] < state.roundPoints[opponentTeam]) {
              // Normal kaboot: chooser's team scored fewer points
              state.roundPoints[opponentTeam] = totalRoundPoints;
              state.roundPoints[chooserTeam] = 0;
              kabootHappened = true;
              events.push({ type: 'move', data: { action: 'kaboot', losingTeam: chooserTeam, cleanSweep: false } });
            }

            // Sun mode: double the round points (standard Saudi Baloot rule)
            if (state.gameType === 'sun') {
              state.roundPoints.team0 *= 2;
              state.roundPoints.team1 *= 2;
            }

            // Save round summary for UI
            state.lastRoundPoints = { ...state.roundPoints };
            state.lastRoundGameType = state.gameType;
            state.lastRoundKaboot = kabootHappened;
            state.lastRoundProjects = [...state.projects];

            state.totalPoints.team0 += state.roundPoints.team0;
            state.totalPoints.team1 += state.roundPoints.team1;

            events.push({ type: 'score', data: { roundPoints: state.roundPoints, totalPoints: state.totalPoints, kaboot: kabootHappened } });

            if (state.totalPoints.team0 >= state.targetPoints || state.totalPoints.team1 >= state.targetPoints) {
              state.phase = 'finished';
              // Tie-break: if both teams reach target, the chooser's team wins
              let wTeam: number;
              if (state.totalPoints.team0 >= state.targetPoints && state.totalPoints.team1 >= state.targetPoints) {
                wTeam = state.teams.team0.includes(state.choosingPlayer) ? 0 : 1;
              } else {
                wTeam = state.totalPoints.team0 >= state.targetPoints ? 0 : 1;
              }
              state.winningTeam = wTeam; // Persist in state for getGameStatus & getPlayerView
              events.push({ type: 'game_over', data: { winningTeam: wTeam, points: state.totalPoints } });
            } else {
              // Rotate dealer and start new round
              const nextDealerIndex = (state.dealerIndex + 1) % 4;
              const newState = createNewGame(state.playerOrder, state.targetPoints, nextDealerIndex, state.teams);
              newState.totalPoints = state.totalPoints;
              newState.roundNumber = Math.min(100, state.roundNumber + 1);
              newState.botPlayers = state.botPlayers;
              newState.lastRoundPoints = state.lastRoundPoints;
              newState.lastRoundGameType = state.lastRoundGameType;
              newState.lastRoundKaboot = state.lastRoundKaboot;
              newState.lastRoundProjects = state.lastRoundProjects;
              newState.lastChoice = state.lastChoice;
              events.push({ type: 'move', data: { action: 'newRound', round: newState.roundNumber } });
              return { success: true, state: newState, events };
            }
          }
        } else {
          const currentIndex = state.playerOrder.indexOf(cardPlayerId);
          state.currentPlayer = state.playerOrder[(currentIndex + 1) % 4];
        }

        return { success: true, state, events };
      }

      return { success: false, events: [], error: 'Unknown move type' };
    } catch (error) {
      return { success: false, events: [], error: 'Failed to apply move' };
    }
  }

  getGameStatus(stateJson: string): GameStatus {
    try {
      const state: BalootState = JSON.parse(stateJson);
      // Use persisted winningTeam (includes tie-break logic) with fallback calculation
      const winningTeam = state.winningTeam ?? (
        state.totalPoints.team0 >= state.targetPoints && state.totalPoints.team1 >= state.targetPoints
          ? (state.teams.team0.includes(state.choosingPlayer) ? 0 : 1) // tie-break: chooser's team wins
          : state.totalPoints.team0 >= state.targetPoints ? 0
          : state.totalPoints.team1 >= state.targetPoints ? 1
          : undefined
      );
      return {
        isOver: state.phase === 'finished',
        winningTeam,
        winner: winningTeam !== undefined && state.teams ? state.teams[winningTeam === 0 ? 'team0' : 'team1'][0] : undefined,
        teamScores: { team0: state.totalPoints.team0, team1: state.totalPoints.team1 },
        reason: state.phase === 'finished' ? 'targetReached' : undefined
      };
    } catch {
      return { isOver: false };
    }
  }

  /** Internal valid moves — accepts state object, returns card as PlayingCard (no JSON stringify). */
  private getValidMovesFromState(state: BalootState, playerId: string): MoveData[] {
    if (state.phase === 'finished') return [];

    if (state.phase === 'choosing') {
      if (state.choosingPlayer !== playerId) return [];
      const moves: MoveData[] = [];
      if (state.passRound < 2) moves.push({ type: 'pass' });
      moves.push({ type: 'choose', gameType: 'sun' });
      for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
        moves.push({ type: 'choose', gameType: 'hokm', trumpSuit: suit });
      }
      return moves;
    }

    if (state.phase === 'playing' && state.currentPlayer === playerId) {
      const hand = state.hands[playerId];
      let playableCards = hand;

      if (state.currentTrick.length > 0) {
        const leadSuit = state.currentTrick[0].card.suit;
        const suitCards = hand.filter(c => c.suit === leadSuit);

        if (suitCards.length > 0) {
          playableCards = suitCards;
        } else if (state.gameType === 'hokm' && state.trumpSuit) {
          const trumpCards = hand.filter(c => c.suit === state.trumpSuit);
          if (trumpCards.length > 0) {
            const highestTrumpInTrick = getHighestTrumpStrength(state.currentTrick, state.trumpSuit!);
            if (highestTrumpInTrick > 0) {
              const higherTrumps = trumpCards.filter(c => (BALOOT_HOKM_VALUES[c.rank] || 0) > highestTrumpInTrick);
              playableCards = higherTrumps.length > 0 ? higherTrumps : trumpCards;
            } else {
              playableCards = trumpCards;
            }
          }
        }
      }

      // Return card as object (cast via unknown to satisfy MoveData.card: string)
      return playableCards.map(card => ({ type: 'playCard', card: card as unknown as string }));
    }

    return [];
  }

  getValidMoves(stateJson: string, playerId: string): MoveData[] {
    try {
      const state: BalootState = JSON.parse(stateJson);
      const moves = this.getValidMovesFromState(state, playerId);
      // Public API: serialize card objects to JSON strings for external consumers
      return moves.map(m => {
        if (m.type === 'playCard' && m.card && typeof m.card !== 'string') {
          return { ...m, card: JSON.stringify(m.card) };
        }
        return m;
      });
    } catch {
      return [];
    }
  }

  getPlayerView(stateJson: string, playerId: string): PlayerView {
    try {
      const state: BalootState = JSON.parse(stateJson);
      const isPlayer = state.playerOrder.includes(playerId);
      const team = state.teams ? (state.teams.team0.includes(playerId) ? 0 : state.teams.team1.includes(playerId) ? 1 : undefined) : undefined;

      const otherHandCounts: { [id: string]: number } = {};
      for (const pid of state.playerOrder) {
        if (pid !== playerId) {
          otherHandCounts[pid] = state.hands[pid]?.length || 0;
        }
      }

      // Parse valid moves — use internal method to avoid double JSON roundtrip
      const rawValidMoves = this.getValidMovesFromState(state, playerId);
      const validCards = rawValidMoves
        .filter(m => m.type === 'playCard' && m.card)
        .map(m => m.card);

      return {
        hand: isPlayer ? state.hands[playerId] : [],
        otherHandCounts,
        currentTrick: state.currentTrick,
        lastCompletedTrick: state.lastCompletedTrick,
        gameType: state.gameType,
        trumpSuit: state.trumpSuit,
        currentTurn: state.currentPlayer,
        isMyTurn: state.currentPlayer === playerId || state.choosingPlayer === playerId,
        gamePhase: state.phase,
        choosingPlayer: state.choosingPlayer,
        tricksWon: state.tricksWon,
        roundPoints: state.roundPoints,
        totalPoints: state.totalPoints,
        projects: state.projects,
        playerOrder: state.playerOrder,
        myTeam: team,
        partner: team !== undefined && state.teams
          ? (state.teams[team === 0 ? 'team0' : 'team1'].find(id => id !== playerId))
          : undefined,
        trickLeader: state.trickLeader,
        roundNumber: state.roundNumber,
        targetPoints: state.targetPoints,
        validMoves: validCards as unknown as MoveData[],
        lastTrickWinner: state.lastTrickWinner,
        passRound: state.passRound,
        lastRoundPoints: state.lastRoundPoints,
        lastRoundGameType: state.lastRoundGameType,
        lastRoundKaboot: state.lastRoundKaboot,
        lastRoundProjects: state.lastRoundProjects,
        passCount: state.passCount,
        dealerId: state.dealerId,
        winningTeam: state.winningTeam,
        lastChoice: state.lastChoice,
        lastTrickPoints: state.lastTrickPoints,
      };
    } catch {
      return { hand: undefined };
    }
  }
}

export const balootEngine = new BalootEngine();
