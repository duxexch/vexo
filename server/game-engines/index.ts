import type { GameEngine } from './types';
import { chessEngine } from './chess';
import { backgammonEngine } from './backgammon';
import { dominoEngine } from './domino';
import { tarneebEngine } from './tarneeb';
import { balootEngine } from './baloot';
import { languageDuelEngine } from './languageduel';
import { aimTrainerEngine } from './aim-trainer';
import { ArcadeScoreEngine } from './arcade-score';

const engines: Map<string, GameEngine> = new Map();

const arcadeScoreGames = [
  ['pong', 2, 2],
  ['air_hockey', 2, 2],
  ['typing_duel', 2, 2],
  ['bomb_pass', 2, 8],
  ['quiz_rush', 2, 8],
  ['dice_battle', 2, 8],
] as const;

engines.set('chess', chessEngine);
engines.set('backgammon', backgammonEngine);
engines.set('domino', dominoEngine);
engines.set('tarneeb', tarneebEngine);
engines.set('baloot', balootEngine);
engines.set('languageduel', languageDuelEngine);
engines.set('aim_trainer', aimTrainerEngine);
for (const [gameType, minPlayers, maxPlayers] of arcadeScoreGames) {
  engines.set(gameType, new ArcadeScoreEngine(gameType, minPlayers, maxPlayers));
}

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
export { aimTrainerEngine } from './aim-trainer';
export { ArcadeScoreEngine } from './arcade-score';
