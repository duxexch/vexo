import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from '../types';
import type { DominoTile, DominoState } from './types';
import { getMaxDrawsPerTurn } from './types';
import {
  createAllTiles,
  shuffleTiles,
  canPlayTile,
  matchesTile,
  getPlayableTiles,
  advanceTurn,
  findBlockedGameWinner,
  validateDominoStateIntegrity,
} from './helpers';
import { cryptoRandomInt } from '../../lib/game-utils';

export class DominoEngine implements GameEngine {
  gameType = 'domino';
  minPlayers = 2;
  maxPlayers = 4;

  /** C7-F10: Lightweight stub — real games always use initializeWithPlayers() */
  createInitialState(): string {
    return JSON.stringify({
      board: [], leftEnd: -1, rightEnd: -1,
      hands: {}, boneyard: [], currentPlayer: '',
      playerOrder: [], passCount: 0, drawsThisTurn: 0,
      drewThisRound: [],
      gameOver: false, scores: {},
      targetScore: 101,
      roundNumber: 1,
    });
  }

  initializeWithPlayers(playerIds: string[], targetScore?: number): string {
    const state = this.createNewGame(playerIds, this.normalizeTargetScore(targetScore));

    // Identify bot players (IDs starting with 'bot-')
    const botPlayers = playerIds.filter(id => id.startsWith('bot-'));
    if (botPlayers.length > 0) {
      state.botPlayers = botPlayers;
    }

    // Auto-play any initial bot turns
    if (botPlayers.length > 0 && this.isBotPlayer(state, state.currentPlayer)) {
      return this.runBotTurns(state);
    }
    return JSON.stringify(state);
  }

  // ─── Bot Helpers ─────────────────────────────────────────────────

  private isBotPlayer(state: DominoState, playerId: string): boolean {
    return state.botPlayers?.includes(playerId) ?? false;
  }

  /** F4: Check if a just-drawn tile can be played immediately, returning the move if so.
   *  C10-F10: Board is never empty here — bots only draw when they have no playable tiles,
   *  and on an empty board all tiles are playable. Guard removed as dead code. */
  private tryAutoPlayDrawnTile(state: DominoState, playerId: string, tile: DominoTile): MoveData | null {
    const canLeft = canPlayTile(state, tile, 'left');
    const canRight = canPlayTile(state, tile, 'right');
    if (canLeft && canRight) {
      // C13-F2: Consider both new end and the unchanged opposite end for hand connectivity
      const remainingHand = state.hands[playerId].filter(t => t.id !== tile.id);
      const leftEndNew = tile.left === state.leftEnd ? tile.right : tile.left;
      const rightEndNew = tile.left === state.rightEnd ? tile.right : tile.left;
      // Score each option: connectivity to new end + connectivity to unchanged opposite end
      const leftScore = remainingHand.filter(t => t.left === leftEndNew || t.right === leftEndNew).length
        + remainingHand.filter(t => t.left === state.rightEnd || t.right === state.rightEnd).length * 0.5;
      const rightScore = remainingHand.filter(t => t.left === rightEndNew || t.right === rightEndNew).length
        + remainingHand.filter(t => t.left === state.leftEnd || t.right === state.leftEnd).length * 0.5;
      return { type: 'play', tile, end: leftScore >= rightScore ? 'left' : 'right' };
    }
    if (canLeft) return { type: 'play', tile, end: 'left' };
    if (canRight) return { type: 'play', tile, end: 'right' };
    return null;
  }

  /** F7: Unified bot auto-play loop. Collects events when eventsList is provided. */
  private runBotLoop(state: DominoState, eventsList?: GameEvent[]): { state: DominoState; events: GameEvent[] } {
    let current = state;
    const allEvents: GameEvent[] = eventsList ? [...eventsList] : [];
    let iterations = 0;
    while (iterations < 200 && !current.gameOver && this.isBotPlayer(current, current.currentPlayer)) {
      const botMove = this.generateBotMoveFromState(current, current.currentPlayer);
      const result = this.applyMoveInternal(current, current.currentPlayer, botMove);
      if (!result.success || !result.state) {
        console.warn('[Domino] Bot move failed inside loop', { playerId: current.currentPlayer, moveType: botMove.type, error: result.error });
        break;
      }
      current = result.state;
      allEvents.push(...result.events);
      iterations++;
      // C8-F2: After a draw, immediately check if the drawn tile is playable and auto-play it
      // If not playable, fall through to next loop iteration (generateBotMoveFromState handles draw/pass)
      if (botMove.type === 'draw' && !current.gameOver && this.isBotPlayer(current, current.currentPlayer)) {
        const botHand = current.hands[current.currentPlayer];
        const drawnTile = botHand?.[botHand.length - 1];
        if (drawnTile) {
          const autoPlay = this.tryAutoPlayDrawnTile(current, current.currentPlayer, drawnTile);
          if (autoPlay) {
            const playResult = this.applyMoveInternal(current, current.currentPlayer, autoPlay);
            if (playResult.success && playResult.state) {
              current = playResult.state;
              allEvents.push(...playResult.events);
              iterations++;
              continue; // C18-F12: Skip redundant re-evaluation — go straight to while condition
            }
          }
        }
        // No continue — let loop re-evaluate current state naturally
      }
    }
    // C9-F7: Warn if bot loop hit max iterations — may indicate a logic bug
    if (iterations >= 200 && !current.gameOver) {
      console.warn(`[Domino] Bot loop hit 200 iterations without game over — currentPlayer=${current.currentPlayer}`);
    }
    return { state: current, events: allEvents };
  }

  /** Auto-play bot turns until a human player or game over. */
  private runBotTurns(state: DominoState): string {
    return JSON.stringify(this.runBotLoop(state).state);
  }

  /** Auto-play bot turns, accumulating events. */
  private runBotTurnsWithEvents(state: DominoState, events: GameEvent[]): { stateJson: string; events: GameEvent[] } {
    const result = this.runBotLoop(state, events);
    return { stateJson: JSON.stringify(result.state), events: result.events };
  }

  private normalizeTargetScore(targetScore: unknown): number {
    return Number(targetScore) === 201 ? 201 : 101;
  }

  private hydrateState(state: DominoState): void {
    state.targetScore = this.normalizeTargetScore(state.targetScore);
    state.roundNumber = Number.isInteger(state.roundNumber) && state.roundNumber > 0 ? state.roundNumber : 1;
    if (!state.scores || typeof state.scores !== 'object') {
      state.scores = {};
    }
    for (const playerId of state.playerOrder) {
      if (!Number.isFinite(state.scores[playerId])) {
        state.scores[playerId] = 0;
      }
    }
    // Backward-compat only: legacy persisted rounds predate drewThisRound. Backfill the
    // missing field so old states stay playable. Malformed or unknown entries are NOT
    // sanitized here — integrity validation must reject them so corrupt data surfaces loudly.
    if (state.drewThisRound === undefined || state.drewThisRound === null) {
      state.drewThisRound = [];
    }
  }

  private getWinningTeam(state: DominoState, winnerId: string): number | undefined {
    if (state.playerOrder.length !== 4) {
      return undefined;
    }
    const winnerIdx = state.playerOrder.indexOf(winnerId);
    if (winnerIdx === -1) {
      return undefined;
    }
    return winnerIdx % 2 === 0 ? 0 : 1;
  }

  /** C7-F1: Shared scoring helper — sums opponent pips for winner, credits teammate in 4p mode */
  private scoreWinner(state: DominoState, winnerId: string): number {
    let winnerScore = 0;
    const winnerIdx = state.playerOrder.indexOf(winnerId);
    // C12-F4: Guard invalid winnerId — prevents incorrect teammate calculation
    if (winnerIdx === -1) return 0;
    const isTeamMode = state.playerOrder.length === 4;
    for (const pid of state.playerOrder) {
      if (pid === winnerId) continue;
      if (isTeamMode) {
        const pidIdx = state.playerOrder.indexOf(pid);
        if ((winnerIdx + 2) % 4 === pidIdx) continue;
      }
      // C9-F1: Defensive null guard on hands (mirrors C8-F9 in findBlockedGameWinner)
      winnerScore += (state.hands[pid] ?? []).reduce((sum, t) => sum + t.left + t.right, 0);
    }
    // C14-F9: Guard undefined scores — prevents NaN accumulation
    state.scores[winnerId] = (state.scores[winnerId] || 0) + winnerScore;
    if (isTeamMode) {
      const teammateId = state.playerOrder[(winnerIdx + 2) % 4];
      state.scores[teammateId] = (state.scores[teammateId] || 0) + winnerScore;
    }
    return winnerScore;
  }

  private sumPlayerPips(state: DominoState, playerId: string): number {
    return (state.hands[playerId] ?? []).reduce((sum, tile) => sum + tile.left + tile.right, 0);
  }

  /** Blocked-game scoring: winner gains the pip difference between winning and losing sides. */
  private scoreBlockedWinnerByDifference(state: DominoState, winnerId: string): number {
    if (!state.playerOrder.includes(winnerId)) {
      return 0;
    }

    if (state.playerOrder.length === 4) {
      const teamA = [state.playerOrder[0], state.playerOrder[2]];
      const teamB = [state.playerOrder[1], state.playerOrder[3]];
      const teamAPips = teamA.reduce((sum, pid) => sum + this.sumPlayerPips(state, pid), 0);
      const teamBPips = teamB.reduce((sum, pid) => sum + this.sumPlayerPips(state, pid), 0);
      const winnerOnTeamA = teamA.includes(winnerId);
      const winningTeam = winnerOnTeamA ? teamA : teamB;
      const winningTeamPips = winnerOnTeamA ? teamAPips : teamBPips;
      const losingTeamPips = winnerOnTeamA ? teamBPips : teamAPips;
      const scoreDelta = Math.max(0, losingTeamPips - winningTeamPips);

      for (const pid of winningTeam) {
        state.scores[pid] = (state.scores[pid] || 0) + scoreDelta;
      }

      return scoreDelta;
    }

    const winnerPips = this.sumPlayerPips(state, winnerId);
    const highestOpponentPips = state.playerOrder
      .filter(pid => pid !== winnerId)
      .reduce((max, pid) => Math.max(max, this.sumPlayerPips(state, pid)), 0);

    const scoreDelta = Math.max(0, highestOpponentPips - winnerPips);
    state.scores[winnerId] = (state.scores[winnerId] || 0) + scoreDelta;
    return scoreDelta;
  }

  private hasReachedTarget(state: DominoState, winnerId: string): boolean {
    return (state.scores[winnerId] || 0) >= state.targetScore;
  }

  private startNextRound(state: DominoState): void {
    const nextRoundState = this.createNewGame(
      state.playerOrder,
      state.targetScore,
      state.scores,
      (state.roundNumber || 1) + 1,
    );

    if (state.botPlayers?.length) {
      nextRoundState.botPlayers = [...state.botPlayers];
    }

    Object.assign(state, nextRoundState);
  }

  private finalizeRound(
    state: DominoState,
    events: GameEvent[],
    roundResult: {
      winner: string | null;
      reason: 'domino' | 'domino_drawn' | 'blocked' | 'draw';
      scoreDelta: number;
      lowestPips?: number;
      winningTeamPips?: number;
    },
  ): void {
    const { winner, reason, scoreDelta, lowestPips, winningTeamPips } = roundResult;

    if (winner && this.hasReachedTarget(state, winner)) {
      const winningTeam = this.getWinningTeam(state, winner);
      state.gameOver = true;
      state.winner = winner;
      state.winningTeam = winningTeam;
      state.isDraw = false;
      state.reason = reason;

      events.push({
        type: 'game_over',
        data: {
          winner,
          winningTeam,
          reason,
          isDraw: false,
          score: scoreDelta,
          lowestPips,
          winningTeamPips,
          targetScore: state.targetScore,
          scores: state.scores,
          roundNumber: state.roundNumber,
        }
      });
      return;
    }

    events.push({
      type: 'score',
      data: {
        reason,
        roundWinner: winner,
        isDraw: winner === null,
        roundNumber: state.roundNumber,
        score: scoreDelta,
        lowestPips,
        winningTeamPips,
        targetScore: state.targetScore,
        scores: state.scores,
      }
    });

    this.startNextRound(state);
    events.push({ type: 'turn_change', data: { nextPlayer: state.currentPlayer, roundNumber: state.roundNumber } });
  }

  private finalizeBlockedRound(state: DominoState, events: GameEvent[]): void {
    const { winner, lowestPips, winningTeamPips } = findBlockedGameWinner(state);
    const scoreDelta = winner ? this.scoreBlockedWinnerByDifference(state, winner) : 0;

    this.finalizeRound(state, events, {
      winner,
      reason: winner ? 'blocked' : 'draw',
      scoreDelta,
      lowestPips,
      winningTeamPips,
    });
  }

  /** Auto-pass players who have no playable tiles so turns never stall. */
  private autoPassUnplayableTurns(state: DominoState, events: GameEvent[]): void {
    let safety = 0;
    const maxIterations = Math.max(1, state.playerOrder.length + 1);

    while (!state.gameOver && safety < maxIterations) {
      const currentPlayer = state.currentPlayer;
      if (!currentPlayer || !state.hands[currentPlayer]) {
        break;
      }

      const playable = getPlayableTiles(state, currentPlayer);
      if (playable.length > 0) {
        break;
      }

      // Auto-draw immediately when no playable tile exists.
      let autoDrewAny = false;
      while (
        state.boneyard.length > 0 &&
        (state.drawsThisTurn || 0) < getMaxDrawsPerTurn(state.playerOrder.length)
      ) {
        const drawIdx = cryptoRandomInt(state.boneyard.length);
        const drawnTile = state.boneyard.splice(drawIdx, 1)[0];
        state.hands[currentPlayer].push(drawnTile);
        state.drawsThisTurn = (state.drawsThisTurn || 0) + 1;
        state.lastAction = { type: 'draw', playerId: currentPlayer };
        autoDrewAny = true;

        events.push({
          type: 'move',
          data: {
            action: 'draw',
            playerId: currentPlayer,
            auto: true,
            boneyardCount: state.boneyard.length,
          },
        });

        if (getPlayableTiles(state, currentPlayer).length > 0) {
          break;
        }
      }

      // Pure domino-out: auto-draws also disqualify the player from full-pip scoring.
      if (autoDrewAny) {
        if (!Array.isArray(state.drewThisRound)) {
          state.drewThisRound = [];
        }
        if (!state.drewThisRound.includes(currentPlayer)) {
          state.drewThisRound.push(currentPlayer);
        }
      }

      if (getPlayableTiles(state, currentPlayer).length > 0) {
        // The player can now play immediately; keep turn on the same player.
        break;
      }

      state.passCount++;
      state.lastAction = { type: 'pass', playerId: currentPlayer };
      events.push({ type: 'move', data: { action: 'pass', playerId: currentPlayer, auto: true } });

      if (state.passCount >= state.playerOrder.length) {
        this.finalizeBlockedRound(state, events);
        break;
      }

      advanceTurn(state);
      events.push({ type: 'turn_change', data: { nextPlayer: state.currentPlayer } });
      safety++;
    }

    if (safety >= maxIterations && !state.gameOver) {
      console.warn('[Domino] autoPassUnplayableTurns hit safety limit', {
        currentPlayer: state.currentPlayer,
        passCount: state.passCount,
      });
    }
  }

  private createNewGame(
    playerIds: string[],
    targetScore = 101,
    existingScores?: { [playerId: string]: number },
    roundNumber = 1,
  ): DominoState {
    if (playerIds.length < 2 || playerIds.length > 4) {
      throw new Error('Domino requires 2-4 players');
    }
    // C12-F5: Reject duplicate player IDs — prevents corrupted hands/scores
    if (new Set(playerIds).size !== playerIds.length) {
      throw new Error('Duplicate player IDs are not allowed');
    }

    const tiles = shuffleTiles(createAllTiles());
    const tilesPerPlayer = 7;

    const hands: { [playerId: string]: DominoTile[] } = {};
    let tileIndex = 0;

    for (const playerId of playerIds) {
      hands[playerId] = tiles.slice(tileIndex, tileIndex + tilesPerPlayer);
      tileIndex += tilesPerPlayer;
    }

    const boneyard = tiles.slice(tileIndex);

    const startingPlayer = playerIds[cryptoRandomInt(playerIds.length)];

    const normalizedTargetScore = this.normalizeTargetScore(targetScore);
    const safeRoundNumber = Number.isInteger(roundNumber) && roundNumber > 0 ? roundNumber : 1;
    const scores = Object.fromEntries(
      playerIds.map((id) => [id, Number.isFinite(existingScores?.[id]) ? Number(existingScores?.[id]) : 0]),
    );

    const initialState: DominoState = {
      board: [],
      leftEnd: -1,
      rightEnd: -1,
      hands,
      boneyard,
      currentPlayer: startingPlayer,
      playerOrder: playerIds,
      passCount: 0,
      drawsThisTurn: 0,
      drewThisRound: [],
      gameOver: false,
      targetScore: normalizedTargetScore,
      roundNumber: safeRoundNumber,
      scores,
      winner: undefined,
      winningTeam: undefined,
      isDraw: false,
      reason: undefined,
      lastAction: undefined,
    };

    return initialState;
  }

  /** Bot AI — strategic domino tile selection (works on parsed state directly) */
  private generateBotMoveFromState(state: DominoState, botPlayerId: string): MoveData {
    const playable = getPlayableTiles(state, botPlayerId);

    // No playable tiles → draw or pass
    if (playable.length === 0) {
      if (state.boneyard.length > 0 && (state.drawsThisTurn || 0) < getMaxDrawsPerTurn(state.playerOrder.length)) {
        return { type: 'draw' };
      }
      return { type: 'pass' };
    }

    // Score each possible play for smart selection
    const hand = state.hands[botPlayerId] || [];
    let bestScore = -Infinity;
    let bestMove: { tile: DominoTile; end: 'left' | 'right' } = { tile: playable[0].tile, end: playable[0].ends[0] };

    // C11-F1: Hoisted — invariant across all tile and end iterations
    const botIdx = state.playerOrder.indexOf(botPlayerId);
    const isTeam4p = state.playerOrder.length === 4;
    // C13-F9: Hoist teammate ID — invariant across loop iterations
    const teammateId = isTeam4p ? state.playerOrder[(botIdx + 2) % 4] : null;
    // C12-F10/C16-F10: Value frequency histogram — higher board frequency means harder future matching
    const boardValueFreq = new Map<number, number>();
    for (const t of state.board) {
      boardValueFreq.set(t.left, (boardValueFreq.get(t.left) || 0) + 1);
      boardValueFreq.set(t.right, (boardValueFreq.get(t.right) || 0) + 1);
    }

    for (const { tile, ends } of playable) {
      // C10-F3: Hoist remainingHand — doesn't depend on end
      const remainingHand = hand.filter(t => t.id !== tile.id);
      for (const end of ends) {
        let score = 0;

        // Prefer doubles — they're harder to play later (only match one value)
        if (tile.left === tile.right) score += 15;

        // Prefer heavy tiles — shed high pips to reduce blocked-game loss risk
        score += (tile.left + tile.right) * 2;

        // Compute what the new board-end value would be after placing this tile
        let newEndValue: number;
        const targetValue = end === 'left' ? state.leftEnd : state.rightEnd;
        if (state.board.length === 0) {
          // C9-F3: First tile creates both ends — evaluate both for hand connectivity
          newEndValue = tile.right; // leftEnd=tile.left, rightEnd=tile.right
        } else if (tile.left === targetValue) {
          newEndValue = tile.right;
        } else {
          newEndValue = tile.left;
        }
        // C9-F3: On empty board, both ends matter (leftEnd=tile.left, rightEnd=tile.right)
        const otherEndValue = state.board.length === 0 ? tile.left : (end === 'left' ? state.rightEnd : state.leftEnd);
        for (const t of remainingHand) {
          if (t.left === newEndValue || t.right === newEndValue) score += 3;
          if (t.left === otherEndValue || t.right === otherEndValue) score += 1;
        }

        // F3: Opponent awareness — when an opponent is close to winning, prefer
        // moves that leave board-end values they're unlikely to match (block them)
        for (const opId of state.playerOrder) {
          if (opId === botPlayerId) continue;
          // F6: Skip teammate in 4-player team mode
          if (isTeam4p && opId === teammateId) continue;
          const opHand = state.hands[opId];
          if (opHand && opHand.length <= 2) {
            // C14-F1: Higher frequency on board = fewer unplayed = harder for opponent to match
            const freq = boardValueFreq.get(newEndValue) || 0;
            score += freq >= 4 ? 5 : (freq >= 2 ? 2 : 0);
            // If we create a double-end (both ends same value), opponent is more blocked
            if (state.board.length > 0 && newEndValue === otherEndValue) score += 4;
          }
        }

        // C12-F9: Assist teammate close to winning in 4p team mode
        if (isTeam4p && teammateId) {
          const tmHand = state.hands[teammateId];
          if (tmHand && tmHand.length <= 2) {
            // C14-F10: Reward matching / penalize blocking teammate's end values
            if (tmHand.some(t => t.left === newEndValue || t.right === newEndValue)) score += 6;
            else score -= 3;
            if (tmHand.some(t => t.left === otherEndValue || t.right === otherEndValue)) score += 3;
          }
        }

        // C14-F2: Prioritize winning — playing last tile (domino out) is always best
        if (remainingHand.length === 0) score += 100;

        // C16-F9: Use crypto random for tiebreak (stronger + test-friendly if abstracted later)
        if (score > bestScore || (score === bestScore && cryptoRandomInt(2) === 1)) {
          bestScore = score;
          bestMove = { tile, end };
        }
      }
    }

    return { type: 'play', tile: bestMove.tile, end: bestMove.end };
  }

  private parseMoveTile(tile: MoveData['tile']): { ok: true; tile: DominoTile } | { ok: false; errorKey: string; error: string } {
    try {
      const parsed = typeof tile === 'string' ? JSON.parse(tile) : tile;
      if (!parsed || typeof parsed.left !== 'number' || typeof parsed.right !== 'number') {
        return { ok: false, errorKey: 'domino.invalidMoveType', error: 'Invalid tile payload' };
      }
      return { ok: true, tile: parsed as DominoTile };
    } catch {
      return { ok: false, errorKey: 'domino.invalidMoveType', error: 'Invalid tile payload' };
    }
  }

  private validateMoveFromState(
    state: DominoState,
    playerId: string,
    move: MoveData,
    cachedPlayable?: { tile: DominoTile; ends: ('left' | 'right')[] }[]
  ): ValidationResult {
    if (state.gameOver) {
      return { valid: false, error: 'Game is already over', errorKey: 'domino.gameAlreadyOver' };
    }

    if (state.currentPlayer !== playerId) {
      return { valid: false, error: 'Not your turn', errorKey: 'domino.notYourTurn' };
    }

    // C11-F2: Single computation — shared by pass and draw validation
    const playable = (move.type === 'pass' || move.type === 'draw')
      ? (cachedPlayable ?? getPlayableTiles(state, playerId)) : [];

    if (move.type === 'pass') {
      if (playable.length > 0) {
        return { valid: false, error: 'You have playable tiles, cannot pass', errorKey: 'domino.cannotPass' };
      }
      // F1: Allow pass when max draws reached even if boneyard isn't empty (prevents deadlock)
      const maxedDraws = (state.drawsThisTurn || 0) >= getMaxDrawsPerTurn(state.playerOrder.length);
      if (state.boneyard.length > 0 && !maxedDraws) {
        return { valid: false, error: 'Must draw from boneyard first', errorKey: 'domino.mustDraw' };
      }
      return { valid: true };
    }

    if (move.type === 'draw') {
      if (state.boneyard.length === 0) {
        return { valid: false, error: 'Boneyard is empty', errorKey: 'domino.boneyardEmpty' };
      }
      if (playable.length > 0) {
        return { valid: false, error: 'You have playable tiles, cannot draw', errorKey: 'domino.cannotDraw' };
      }
      if ((state.drawsThisTurn || 0) >= getMaxDrawsPerTurn(state.playerOrder.length)) {
        return { valid: false, error: 'Maximum draws reached this turn', errorKey: 'domino.maxDrawsReached' };
      }
      return { valid: true };
    }

    if (move.type === 'play') {
      const parsedTile = this.parseMoveTile(move.tile);
      if (!parsedTile.ok) {
        return { valid: false, error: parsedTile.error, errorKey: parsedTile.errorKey };
      }
      const tileData = parsedTile.tile;
      const end = move.end as 'left' | 'right';

      // C9-F4: Validate end is explicitly provided and valid
      if (!end || (end !== 'left' && end !== 'right')) {
        return { valid: false, error: 'Missing or invalid placement end', errorKey: 'domino.invalidPlacement' };
      }

      const hand = state.hands[playerId] || [];
      // C12-F3: Shared tile matching helper — avoids duplicated comparison logic
      const hasTile = hand.some(t => matchesTile(t, tileData));

      if (!hasTile) {
        return { valid: false, error: 'Tile not in your hand', errorKey: 'domino.tileNotInHand' };
      }

      if (!canPlayTile(state, tileData, end)) {
        return { valid: false, error: 'Cannot play this tile on this end', errorKey: 'domino.invalidPlacement' };
      }

      return { valid: true };
    }

    return { valid: false, error: 'Invalid move type', errorKey: 'domino.invalidMoveType' };
  }

  validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
    try {
      const state: DominoState = JSON.parse(stateJson);
      this.hydrateState(state);

      const integrityIssue = validateDominoStateIntegrity(state);
      if (integrityIssue) {
        return {
          valid: false,
          error: `Invalid game state integrity (${integrityIssue.code})`,
          errorKey: 'domino.invalidState',
        };
      }

      return this.validateMoveFromState(state, playerId, move);
    } catch {
      return { valid: false, error: 'Invalid game state', errorKey: 'domino.invalidState' };
    }
  }

  applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
    try {
      // C8-F1: Single parse — guards moved into cloned state (moves.ts already validates)
      const clonedState: DominoState = JSON.parse(stateJson);
      this.hydrateState(clonedState);

      const integrityIssue = validateDominoStateIntegrity(clonedState);
      if (integrityIssue) {
        return {
          success: false,
          newState: stateJson,
          events: [],
          error: `State integrity check failed (${integrityIssue.code})`,
        };
      }

      if (clonedState.gameOver) {
        return { success: false, newState: stateJson, events: [], error: 'Game is already over' };
      }
      if (clonedState.currentPlayer !== playerId) {
        return { success: false, newState: stateJson, events: [], error: 'Not your turn' };
      }

      // C15-F1: Defensive validation at apply boundary
      const cachedPlayable = (move.type === 'pass' || move.type === 'draw')
        ? getPlayableTiles(clonedState, playerId)
        : undefined;
      const validation = this.validateMoveFromState(clonedState, playerId, move, cachedPlayable);
      if (!validation.valid) {
        return { success: false, newState: stateJson, events: [], error: validation.error || 'Invalid move' };
      }

      // C18-F7: Pass validated=true — validateMoveFromState already ran above
      const result = this.applyMoveInternal(clonedState, playerId, move, cachedPlayable, true);
      if (!result.success || !result.state) {
        return { success: false, newState: stateJson, events: [], error: result.error || 'Failed to apply move' };
      }

      const postMoveIntegrityIssue = validateDominoStateIntegrity(result.state);
      if (postMoveIntegrityIssue) {
        console.error('[Domino] State integrity check failed after move', {
          playerId,
          moveType: move.type,
          code: postMoveIntegrityIssue.code,
          message: postMoveIntegrityIssue.message,
        });
        return {
          success: false,
          newState: stateJson,
          events: [],
          error: `State integrity check failed after move (${postMoveIntegrityIssue.code})`,
        };
      }

      // Auto-play any bot turns after this human move
      if (result.state.botPlayers && result.state.botPlayers.length > 0 && !result.state.gameOver
        && this.isBotPlayer(result.state, result.state.currentPlayer)) {
        const botResult = this.runBotTurnsWithEvents(result.state, result.events);

        try {
          const botState = JSON.parse(botResult.stateJson) as DominoState;
          this.hydrateState(botState);
          const botIntegrityIssue = validateDominoStateIntegrity(botState);
          if (botIntegrityIssue) {
            return {
              success: false,
              newState: stateJson,
              events: [],
              error: `Bot state integrity check failed (${botIntegrityIssue.code})`,
            };
          }
        } catch {
          return { success: false, newState: stateJson, events: [], error: 'Bot state is invalid' };
        }

        return { success: true, newState: botResult.stateJson, events: botResult.events };
      }

      return { success: true, newState: JSON.stringify(result.state), events: result.events };
    } catch (error) {
      // C15-F10: Keep lightweight context for production diagnostics
      console.warn('[Domino] applyMove failed', {
        playerId,
        moveType: move.type,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false, newState: stateJson, events: [], error: 'Failed to apply move' };
    }
  }

  /** Internal move application — raw logic without bot auto-play or re-parsing.
   *  Mutates state directly — caller must clone if needed (applyMove does this).
   *  C18-F7: When validated=true, skip redundant pass/draw guards (caller already validated). */
  private applyMoveInternal(
    state: DominoState,
    playerId: string,
    move: MoveData,
    cachedPlayable?: { tile: DominoTile; ends: ('left' | 'right')[] }[],
    validated = false
  ): { success: boolean; state?: DominoState; events: GameEvent[]; error?: string } {
    const events: GameEvent[] = [];

    if (move.type === 'pass') {
      if (!state.hands[playerId]) {
        return { success: false, events: [], error: 'Player hand not found' };
      }

      if (!validated) {
        const playable = cachedPlayable ?? getPlayableTiles(state, playerId);
        if (playable.length > 0) {
          return { success: false, events: [], error: 'You have playable tiles, cannot pass' };
        }
        const maxedDraws = (state.drawsThisTurn || 0) >= getMaxDrawsPerTurn(state.playerOrder.length);
        if (state.boneyard.length > 0 && !maxedDraws) {
          return { success: false, events: [], error: 'Must draw from boneyard first' };
        }
      }

      state.passCount++;
      state.lastAction = { type: 'pass', playerId };

      events.push({ type: 'move', data: { action: 'pass', playerId } });

      if (state.passCount >= state.playerOrder.length) {
        this.finalizeBlockedRound(state, events);
      } else {
        advanceTurn(state);
        events.push({ type: 'turn_change', data: { nextPlayer: state.currentPlayer } });
        this.autoPassUnplayableTurns(state, events);
      }

      return { success: true, state, events };
    }

    if (move.type === 'draw') {
      if (state.boneyard.length === 0) {
        return { success: false, events: [], error: 'Boneyard is empty' };
      }
      if (!validated) {
        const playable = cachedPlayable ?? getPlayableTiles(state, playerId);
        if (playable.length > 0) {
          return { success: false, events: [], error: 'You have playable tiles, cannot draw' };
        }
        if ((state.drawsThisTurn || 0) >= getMaxDrawsPerTurn(state.playerOrder.length)) {
          return { success: false, events: [], error: 'Maximum draws reached this turn' };
        }
      }
      // C12-F11: Guard missing hand — prevent undefined push error
      if (!state.hands[playerId]) {
        return { success: false, events: [], error: 'Player hand not found' };
      }

      let drewAtLeastOne = false;
      while (
        state.boneyard.length > 0 &&
        (state.drawsThisTurn || 0) < getMaxDrawsPerTurn(state.playerOrder.length) &&
        getPlayableTiles(state, playerId).length === 0
      ) {
        const drawIdx = cryptoRandomInt(state.boneyard.length);
        const drawnTile = state.boneyard.splice(drawIdx, 1)[0];
        state.hands[playerId].push(drawnTile);
        state.drawsThisTurn = (state.drawsThisTurn || 0) + 1;
        state.lastAction = { type: 'draw', playerId };
        drewAtLeastOne = true;

        events.push({
          type: 'move',
          data: { action: 'draw', playerId, auto: true, boneyardCount: state.boneyard.length },
        });
      }

      // Pure domino-out: track that this player drew during the round.
      if (drewAtLeastOne) {
        if (!Array.isArray(state.drewThisRound)) {
          state.drewThisRound = [];
        }
        if (!state.drewThisRound.includes(playerId)) {
          state.drewThisRound.push(playerId);
        }
      }

      if (!drewAtLeastOne) {
        return { success: false, events: [], error: 'Cannot draw right now' };
      }

      if (getPlayableTiles(state, playerId).length > 0) {
        return { success: true, state, events };
      }

      // No playable tile after draw exhaustion -> pass immediately without waiting timer.
      state.passCount++;
      state.lastAction = { type: 'pass', playerId };
      events.push({ type: 'move', data: { action: 'pass', playerId, auto: true, afterDraw: true } });

      if (state.passCount >= state.playerOrder.length) {
        this.finalizeBlockedRound(state, events);
      } else {
        advanceTurn(state);
        events.push({ type: 'turn_change', data: { nextPlayer: state.currentPlayer } });
        this.autoPassUnplayableTurns(state, events);
      }

      return { success: true, state, events };
    }

    if (move.type === 'play') {
      const parsedTile = this.parseMoveTile(move.tile);
      if (!parsedTile.ok) {
        return { success: false, events: [], error: parsedTile.error };
      }
      const tileData = parsedTile.tile;
      const end = move.end as 'left' | 'right';

      // C14-F7: Validate end — mirrors C9-F4 guard from validateMove
      if (!end || (end !== 'left' && end !== 'right')) {
        return { success: false, events: [], error: 'Missing or invalid placement end' };
      }

      // C13-F5: Guard missing hand — mirrors draw guard from C12-F11
      if (!state.hands[playerId]) {
        return { success: false, events: [], error: 'Player hand not found' };
      }

      // C12-F3: Shared tile matching helper
      const tileIndex = state.hands[playerId].findIndex(t => matchesTile(t, tileData));

      if (tileIndex === -1) {
        return { success: false, events: [], error: 'Tile not found in hand' };
      }

      const tileRef = state.hands[playerId][tileIndex];
      // C11-F3: Defensive guard — verify tile fits chosen end before mutating state
      if (state.board.length > 0 && !canPlayTile(state, tileRef, end)) {
        return { success: false, events: [], error: 'Tile cannot be placed on this end' };
      }

      const tile = state.hands[playerId].splice(tileIndex, 1)[0];

      if (state.board.length === 0) {
        state.board.push(tile);
        state.leftEnd = tile.left;
        state.rightEnd = tile.right;
      } else {
        const targetValue = end === 'left' ? state.leftEnd : state.rightEnd;
        let placedTile = tile;

        if (end === 'left') {
          if (tile.right === targetValue) {
            state.leftEnd = tile.left;
          } else {
            state.leftEnd = tile.right;
            placedTile = { ...tile, left: tile.right, right: tile.left };
          }
          state.board.unshift(placedTile);
        } else {
          if (tile.left === targetValue) {
            state.rightEnd = tile.right;
          } else {
            state.rightEnd = tile.left;
            placedTile = { ...tile, left: tile.right, right: tile.left };
          }
          state.board.push(placedTile);
        }
      }

      state.passCount = 0;
      state.lastAction = { type: 'play', playerId, tile, end };

      events.push({ type: 'move', data: { action: 'play', playerId, tile, end } });

      if (state.hands[playerId].length === 0) {
        // Pure domino-out: only winners who never drew this round score full opponent pips.
        // Winners who drew at least once score the blocked-style pip difference instead.
        const drewThisRound = Array.isArray(state.drewThisRound) ? state.drewThisRound : [];
        const winnerDrew = drewThisRound.includes(playerId);
        const reason: 'domino' | 'domino_drawn' = winnerDrew ? 'domino_drawn' : 'domino';
        const winnerScore = winnerDrew
          ? this.scoreBlockedWinnerByDifference(state, playerId)
          : this.scoreWinner(state, playerId);
        this.finalizeRound(state, events, {
          winner: playerId,
          reason,
          scoreDelta: winnerScore,
        });
      } else {
        advanceTurn(state);
        events.push({ type: 'turn_change', data: { nextPlayer: state.currentPlayer } });
        this.autoPassUnplayableTurns(state, events);
      }

      return { success: true, state, events };
    }

    return { success: false, events: [], error: 'Unknown move type' };
  }

  getGameStatus(stateJson: string): GameStatus {
    try {
      const state: DominoState = JSON.parse(stateJson);
      this.hydrateState(state);
      const integrityIssue = validateDominoStateIntegrity(state);
      if (integrityIssue) {
        return { isOver: false, reason: 'invalid_state' };
      }
      // C9-F10: Use pre-stored reason from applyMoveInternal when available
      return {
        isOver: state.gameOver,
        winner: state.winner || undefined,
        winningTeam: state.winningTeam,
        isDraw: state.isDraw || false,
        scores: state.scores,
        reason: state.reason
      };
    } catch {
      return { isOver: false };
    }
  }

  getValidMoves(stateJson: string, playerId: string): MoveData[] {
    try {
      const state: DominoState = JSON.parse(stateJson);
      this.hydrateState(state);
      const integrityIssue = validateDominoStateIntegrity(state);
      if (integrityIssue) {
        return [];
      }
      return this.getValidMovesFromState(state, playerId);
    } catch {
      return [];
    }
  }

  /** F5: Internal valid-moves logic on parsed state — avoids double JSON.parse
   *  C9-F2: Accepts optional pre-computed playable tiles to avoid redundant computation */
  private getValidMovesFromState(state: DominoState, playerId: string, cachedPlayable?: { tile: DominoTile; ends: ('left' | 'right')[] }[]): MoveData[] {
    if (state.gameOver || state.currentPlayer !== playerId) {
      return [];
    }

    const moves: MoveData[] = [];
    const playable = cachedPlayable ?? getPlayableTiles(state, playerId);

    for (const { tile, ends } of playable) {
      for (const end of ends) {
        moves.push({ type: 'play', tile, end });
      }
    }

    if (moves.length === 0) {
      // F1/F11: When no playable tiles, offer draw if allowed, otherwise pass
      const maxedDraws = (state.drawsThisTurn || 0) >= getMaxDrawsPerTurn(state.playerOrder.length);
      if (state.boneyard.length > 0 && !maxedDraws) {
        moves.push({ type: 'draw' });
      } else {
        moves.push({ type: 'pass' });
      }
    }

    return moves;
  }

  getPlayerView(stateJson: string, playerId: string): PlayerView {
    try {
      const state: DominoState = JSON.parse(stateJson);
      this.hydrateState(state);
      const integrityIssue = validateDominoStateIntegrity(state);
      if (integrityIssue) {
        return {
          board: undefined,
          isMyTurn: false,
          gamePhase: 'error',
          error: `state_integrity_failed:${integrityIssue.code}`,
        };
      }
      const isPlayer = state.playerOrder.includes(playerId);

      const otherHandCounts: { [id: string]: number } = {};
      for (const pid of state.playerOrder) {
        if (pid !== playerId) {
          otherHandCounts[pid] = state.hands[pid]?.length || 0;
        }
      }

      // C8-F4: Cache playable tiles to avoid double computation
      const isCurrentPlayer = state.currentPlayer === playerId;
      const playable = isPlayer && isCurrentPlayer ? getPlayableTiles(state, playerId) : [];

      return {
        board: state.board,
        leftEnd: state.leftEnd,
        rightEnd: state.rightEnd,
        hand: isPlayer ? state.hands[playerId] : undefined, // F12: undefined for spectators (not [])
        otherHandCounts,
        boneyardCount: state.boneyard.length,
        currentTurn: state.currentPlayer,
        isMyTurn: isCurrentPlayer,
        gamePhase: state.gameOver ? 'finished' : 'playing',
        // C9-F2: Pass cached playable tiles to avoid re-computing inside getValidMovesFromState
        validMoves: isCurrentPlayer ? this.getValidMovesFromState(state, playerId, playable) : [],
        scores: state.scores,
        targetScore: state.targetScore,
        roundNumber: state.roundNumber,
        playerOrder: state.playerOrder,
        lastAction: state.lastAction,
        winner: state.winner,
        passCount: state.passCount,
        drawsThisTurn: isPlayer ? state.drawsThisTurn : 0,
        canDraw: isPlayer && isCurrentPlayer
          ? (state.drawsThisTurn || 0) < getMaxDrawsPerTurn(state.playerOrder.length)
          && state.boneyard.length > 0
          && playable.length === 0
          : false
      };
    } catch {
      // C12-F6: Return safe defaults so client doesn't crash on parse error
      return { board: undefined, isMyTurn: false, gamePhase: 'error' };
    }
  }
}

export const dominoEngine = new DominoEngine();
