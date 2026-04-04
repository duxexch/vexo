/** Backgammon-specific type definitions */

export interface BackgammonState {
  board: number[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
  openingRoll: { white: number | null; black: number | null; resolved: boolean };
  players: { white: string; black: string };
  currentTurn: 'white' | 'black';
  dice: number[];
  diceUsed: boolean[];
  doublingCube: number;
  cubeOwner: 'white' | 'black' | null;
  cubeOffered: boolean;
  cubeOfferedBy: 'white' | 'black' | null;
  gamePhase: 'rolling' | 'moving' | 'doubling' | 'finished';
  startTime: number;
  lastMoveTime: number;
  moveHistory: MoveRecord[];
  mustRoll: boolean;
  botPlayers?: string[];
}

export interface MoveRecord {
  player: 'white' | 'black';
  dice: number[];
  moves: SingleMove[];
}

export interface SingleMove {
  from: number;
  to: number;
  hit: boolean;
}
