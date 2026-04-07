import type { GameEngine } from './types';
import { chessEngine } from './chess';
import { backgammonEngine } from './backgammon';
import { dominoEngine } from './domino';
import { tarneebEngine } from './tarneeb';
import { balootEngine } from './baloot';
import { languageDuelEngine } from './languageduel';

const engines: Map<string, GameEngine> = new Map();

engines.set('chess', chessEngine);
engines.set('backgammon', backgammonEngine);
engines.set('domino', dominoEngine);
engines.set('tarneeb', tarneebEngine);
engines.set('baloot', balootEngine);
engines.set('languageduel', languageDuelEngine);

export function getGameEngine(gameType: string): GameEngine | undefined {
  return engines.get(gameType);
}

export function getSupportedGameTypes(): string[] {
  return Array.from(engines.keys());
}

export function registerGameEngine(engine: GameEngine): void {
  engines.set(engine.gameType, engine);
}

export * from './types';
export { chessEngine } from './chess';
export { backgammonEngine } from './backgammon';
export { dominoEngine } from './domino';
export { tarneebEngine } from './tarneeb';
export { balootEngine } from './baloot';
export { languageDuelEngine } from './languageduel';
