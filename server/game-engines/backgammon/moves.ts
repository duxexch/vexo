import type { MoveData, ApplyMoveResult, GameStatus, GameEvent } from '../types';
import type { BackgammonState } from './types';
import { cryptoRandomDicePair } from '../../lib/game-utils';
import { getPlayerColor, getAllValidMoves, isHighestCheckerInHome, hasCheckerInOpponentHome } from './board-utils';

/** Create a new backgammon game with standard board setup */
export function createNewGame(whitePlayerId: string, blackPlayerId: string): BackgammonState {
  const board: number[] = new Array(24).fill(0);
  
  board[0] = 2;
  board[11] = 5;
  board[16] = 3;
  board[18] = 5;
  
  board[23] = -2;
  board[12] = -5;
  board[7] = -3;
  board[5] = -5;

  return {
    board,
    bar: { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 },
    players: { white: whitePlayerId, black: blackPlayerId },
    currentTurn: 'white',
    dice: [],
    diceUsed: [],
    doublingCube: 1,
    cubeOwner: null,
    cubeOffered: false,
    cubeOfferedBy: null,
    gamePhase: 'rolling',
    startTime: Date.now(),
    lastMoveTime: Date.now(),
    moveHistory: [],
    mustRoll: true
  };
}

/** Apply a single checker move on the board, updating state in place */
function applySingleMove(
  state: BackgammonState, 
  playerColor: 'white' | 'black', 
  from: number, 
  to: number,
  events: GameEvent[]
): { success: boolean; error?: string; hit?: boolean } {
  const barPosition = playerColor === 'white' ? -1 : 24;
  const bearOffPosition = playerColor === 'white' ? 24 : -1;
  const checkerValue = playerColor === 'white' ? 1 : -1;

  let distance: number;
  if (from === barPosition) {
    distance = playerColor === 'white' ? to + 1 : 24 - to;
  } else if (to === bearOffPosition) {
    distance = playerColor === 'white' ? 24 - from : from + 1;
  } else {
    distance = Math.abs(to - from);
  }

  let dieIndex = state.dice.findIndex((d, i) => !state.diceUsed[i] && d === distance);
  
  if (dieIndex === -1 && to === bearOffPosition) {
    const unusedDice = state.dice.map((d, i) => ({ die: d, index: i }))
      .filter(x => !state.diceUsed[x.index]);
    const higherDie = unusedDice.find(x => x.die > distance);
    if (higherDie && isHighestCheckerInHome(state, playerColor, from)) {
      dieIndex = higherDie.index;
    }
  }

  if (dieIndex === -1) {
    return { success: false, error: 'No matching die' };
  }

  state.diceUsed[dieIndex] = true;

  if (from === barPosition) {
    state.bar[playerColor]--;
  } else {
    state.board[from] -= checkerValue;
  }

  let hit = false;
  if (to === bearOffPosition) {
    state.borneOff[playerColor]++;
    events.push({
      type: 'move',
      data: { action: 'bear_off', from, player: playerColor }
    });
  } else {
    const targetValue = state.board[to];
    const opponentColor = playerColor === 'white' ? 'black' : 'white';
    const opponentChecker = playerColor === 'white' ? targetValue === -1 : targetValue === 1;
    
    if (opponentChecker) {
      state.board[to] = checkerValue;
      state.bar[opponentColor]++;
      hit = true;
      events.push({
        type: 'capture',
        data: { point: to, hitPlayer: opponentColor }
      });
    } else {
      state.board[to] += checkerValue;
    }

    events.push({
      type: 'move',
      data: { action: 'move', from, to, hit, player: playerColor }
    });
  }

  state.lastMoveTime = Date.now();

  return { success: true, hit };
}

/** End the current player's turn, switching to the other player */
function endTurn(state: BackgammonState, events: GameEvent[]): void {
  // Check if game is over before changing turn
  const status = getGameStatus(JSON.stringify(state));
  if (status.isOver) {
    return; // Don't emit turn_change if game is over
  }
  
  const previousTurn = state.currentTurn;
  state.currentTurn = state.currentTurn === 'white' ? 'black' : 'white';
  state.dice = [];
  state.diceUsed = [];
  state.mustRoll = true;
  state.gamePhase = 'rolling';

  events.push({
    type: 'turn_change',
    data: { 
      previousTurn,
      nextTurn: state.currentTurn,
      nextPlayer: state.players[state.currentTurn]
    }
  });
}

/** Apply a move to the game state, returning the new state and events */
export function applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
  try {
    // Clone parsed state defensively to avoid accidental mutation leakage.
    const parsedState: BackgammonState = JSON.parse(stateJson);
    const state: BackgammonState = structuredClone(parsedState);
    const playerColor = getPlayerColor(state, playerId);
    
    if (!playerColor) {
      return { success: false, newState: stateJson, events: [], error: 'Not a player' };
    }

    const events: GameEvent[] = [];

    if (move.type === 'roll') {
      const [die1, die2] = cryptoRandomDicePair();
      
      if (die1 === die2) {
        state.dice = [die1, die1, die1, die1];
        state.diceUsed = [false, false, false, false];
      } else {
        state.dice = [die1, die2];
        state.diceUsed = [false, false];
      }
      
      state.mustRoll = false;
      state.gamePhase = 'moving';
      
      events.push({
        type: 'move',
        data: { action: 'roll', dice: state.dice, player: playerColor }
      });

      const availableMoves = getAllValidMoves(state, playerColor);
      if (availableMoves.length === 0) {
        endTurn(state, events);
      }

      return {
        success: true,
        newState: JSON.stringify(state),
        events
      };
    }

    // Doubling cube actions
    if (move.type === 'double') {
      state.cubeOffered = true;
      state.cubeOfferedBy = playerColor;
      state.gamePhase = 'doubling';
      
      events.push({
        type: 'move',
        data: { action: 'double', player: playerColor, newValue: state.doublingCube * 2 }
      });

      return { success: true, newState: JSON.stringify(state), events };
    }

    if (move.type === 'accept_double') {
      state.doublingCube *= 2;
      state.cubeOwner = playerColor; // Accepter gets cube ownership
      state.cubeOffered = false;
      state.cubeOfferedBy = null;
      state.gamePhase = 'rolling';
      
      events.push({
        type: 'move',
        data: { action: 'accept_double', player: playerColor, cubeValue: state.doublingCube }
      });

      return { success: true, newState: JSON.stringify(state), events };
    }

    if (move.type === 'decline_double') {
      state.gamePhase = 'finished';
      const winner = state.cubeOfferedBy!;
      
      events.push({
        type: 'game_over',
        data: { 
          winner: state.players[winner], 
          reason: 'double_declined',
          cubeValue: state.doublingCube 
        }
      });

      return { success: true, newState: JSON.stringify(state), events };
    }

    if (move.type === 'move') {
      const from = typeof move.from === 'string' ? parseInt(move.from, 10) : Number(move.from);
      const to = typeof move.to === 'string' ? parseInt(move.to, 10) : Number(move.to);
      
      if (isNaN(from) || isNaN(to)) {
        return { success: false, newState: stateJson, events: [], error: 'Invalid move coordinates' };
      }
      
      const result = applySingleMove(state, playerColor, from, to, events);
      if (!result.success) {
        return { success: false, newState: stateJson, events: [], error: result.error };
      }

      // Track move in history
      if (state.moveHistory.length === 0 || state.moveHistory[state.moveHistory.length - 1].player !== playerColor) {
        state.moveHistory.push({ player: playerColor, dice: [...state.dice], moves: [{ from, to, hit: result.hit || false }] });
      } else {
        state.moveHistory[state.moveHistory.length - 1].moves.push({ from, to, hit: result.hit || false });
      }

      const unusedDice = state.dice.filter((_, i) => !state.diceUsed[i]);
      if (unusedDice.length === 0) {
        endTurn(state, events);
      } else {
        const availableMoves = getAllValidMoves(state, playerColor);
        if (availableMoves.length === 0) {
          endTurn(state, events);
        }
      }

      const status = getGameStatus(JSON.stringify(state));
      if (status.isOver) {
        state.gamePhase = 'finished';
        events.push({
          type: 'game_over',
          data: { winner: status.winner, reason: status.reason }
        });
      }

      return {
        success: true,
        newState: JSON.stringify(state),
        events
      };
    }

    if (move.type === 'end_turn') {
      endTurn(state, events);
      return {
        success: true,
        newState: JSON.stringify(state),
        events
      };
    }

    return { success: false, newState: stateJson, events: [], error: 'Unknown move type' };
  } catch (error) {
    return { success: false, newState: stateJson, events: [], error: 'Failed to apply move' };
  }
}

/** Check if the game is over and determine the winner */
export function getGameStatus(stateJson: string): GameStatus {
  try {
    const state: BackgammonState = JSON.parse(stateJson);

    if (state.borneOff.white === 15) {
      const isGammon = state.borneOff.black === 0;
      const isBackgammon = isGammon && (state.bar.black > 0 || hasCheckerInOpponentHome(state, 'black'));
      
      return {
        isOver: true,
        winner: state.players.white,
        reason: isBackgammon ? 'backgammon' : (isGammon ? 'gammon' : 'normal')
      };
    }

    if (state.borneOff.black === 15) {
      const isGammon = state.borneOff.white === 0;
      const isBackgammon = isGammon && (state.bar.white > 0 || hasCheckerInOpponentHome(state, 'white'));
      
      return {
        isOver: true,
        winner: state.players.black,
        reason: isBackgammon ? 'backgammon' : (isGammon ? 'gammon' : 'normal')
      };
    }

    return { isOver: false };
  } catch {
    return { isOver: false };
  }
}
