import type { GameVolatility } from "@shared/schema";

/**
 * Default games data for initial database seed.
 * Only includes games with actual implementations:
 * - Multiplayer: Chess, Backgammon, Domino, Tarneeb, Baloot (server engines)
 * - Single-player: Snake Arena, Puzzle Challenge, Memory Challenge (HTML5 games)
 */
export const defaultGames: Array<{
  name: string;
  description: string;
  category: string;
  rtp: string;
  houseEdge: string;
  volatility: GameVolatility;
  minBet: string;
  maxBet: string;
  multiplierMin: string;
  multiplierMax: string;
  isFeatured: boolean;
  sortOrder: number;
  sections?: string[];
  gameType?: string;
  minPlayers?: number;
  maxPlayers?: number;
}> = [
  // Multiplayer Board Games (for Challenges)
  {
    name: "Domino",
    description: "Classic domino game. Match tiles and be the first to empty your hand!",
    category: "board",
    sections: ["challenges", "multiplayer"],
    gameType: "multiplayer",
    rtp: "98.00",
    houseEdge: "2.00",
    volatility: "low",
    minBet: "1.00",
    maxBet: "1000.00",
    multiplierMin: "1.00",
    multiplierMax: "2.00",
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 4,
    sortOrder: 20,
  },
  {
    name: "Chess",
    description: "The ultimate strategy game. Checkmate your opponent to win!",
    category: "strategy",
    sections: ["challenges", "multiplayer"],
    gameType: "multiplayer",
    rtp: "100.00",
    houseEdge: "0.00",
    volatility: "low",
    minBet: "1.00",
    maxBet: "500.00",
    multiplierMin: "1.00",
    multiplierMax: "2.00",
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 2,
    sortOrder: 21,
  },
  {
    name: "Backgammon",
    description: "Ancient board game of strategy and luck. Race to bear off all your pieces!",
    category: "board",
    sections: ["challenges", "multiplayer"],
    gameType: "multiplayer",
    rtp: "98.00",
    houseEdge: "2.00",
    volatility: "medium",
    minBet: "1.00",
    maxBet: "500.00",
    multiplierMin: "1.00",
    multiplierMax: "2.00",
    isFeatured: false,
    minPlayers: 2,
    maxPlayers: 2,
    sortOrder: 22,
  },
  {
    name: "Tarneeb",
    description: "Popular Arabic trick-taking card game. Team up and win!",
    category: "cards",
    sections: ["challenges", "multiplayer"],
    gameType: "multiplayer",
    rtp: "100.00",
    houseEdge: "0.00",
    volatility: "medium",
    minBet: "1.00",
    maxBet: "500.00",
    multiplierMin: "1.00",
    multiplierMax: "2.00",
    isFeatured: true,
    minPlayers: 4,
    maxPlayers: 4,
    sortOrder: 23,
  },
  {
    name: "Baloot",
    description: "Traditional Saudi Arabian card game. Strategy meets luck!",
    category: "cards",
    sections: ["challenges", "multiplayer"],
    gameType: "multiplayer",
    rtp: "100.00",
    houseEdge: "0.00",
    volatility: "medium",
    minBet: "1.00",
    maxBet: "500.00",
    multiplierMin: "1.00",
    multiplierMax: "2.00",
    isFeatured: true,
    minPlayers: 4,
    maxPlayers: 4,
    sortOrder: 24,
  },
  {
    name: "Snake Arena",
    description: "VEX Snake Arena — 3D arena with 360° movement, evolving snake tiers, weather effects, and power-ups!",
    category: "arcade",
    sections: ["featured", "popular"],
    gameType: "single",
    rtp: "100.00",
    houseEdge: "0.00",
    volatility: "low",
    minBet: "0.00",
    maxBet: "0.00",
    multiplierMin: "1.00",
    multiplierMax: "1.00",
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 4,
    sortOrder: 25,
  },
  {
    name: "Puzzle Challenge",
    description: "تحدي الألغاز — حل ألغاز الصور بسحب وإسقاط القطع! مستويات متعددة من السهل للخبير",
    category: "puzzle",
    sections: ["featured", "popular"],
    gameType: "single",
    rtp: "100.00",
    houseEdge: "0.00",
    volatility: "low",
    minBet: "0.00",
    maxBet: "0.00",
    multiplierMin: "1.00",
    multiplierMax: "1.00",
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 1,
    sortOrder: 26,
  },
  {
    name: "Memory Challenge",
    description: "تحدي الذاكرة — تذكّر تسلسل الألوان واختبر ذاكرتك! مستويات متصاعدة وأوضاع متعددة",
    category: "puzzle",
    sections: ["featured", "popular"],
    gameType: "single",
    rtp: "100.00",
    houseEdge: "0.00",
    volatility: "low",
    minBet: "0.00",
    maxBet: "0.00",
    multiplierMin: "1.00",
    multiplierMax: "1.00",
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 1,
    sortOrder: 27,
  },
];
