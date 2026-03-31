import { db } from "../db";
import { games, multiplayerGames, type GameStatus, type GameVolatility } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Seed multiplayer games into both games and multiplayer_games tables */
export async function seedMultiplayerGames() {
  const multiplayerGamesList = [
    {
      name: "Domino",
      description: "Classic domino game. Match tiles and be the first to empty your hand!",
      category: "board",
      sections: ["challenges", "multiplayer"],
      gameType: "multiplayer",
      status: "active",
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
      sortOrder: 1,
    },
    {
      name: "Chess",
      description: "The ultimate strategy game. Checkmate your opponent to win!",
      category: "strategy",
      sections: ["challenges", "multiplayer"],
      gameType: "multiplayer",
      status: "active",
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
      sortOrder: 2,
    },
    {
      name: "Backgammon",
      description: "Ancient board game of strategy and luck. Race to bear off all your pieces!",
      category: "board",
      sections: ["challenges", "multiplayer"],
      gameType: "multiplayer",
      status: "active",
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
      sortOrder: 3,
    },
    {
      name: "Tarneeb",
      description: "Popular Arabic trick-taking card game. Team up and win!",
      category: "cards",
      sections: ["challenges", "multiplayer"],
      gameType: "multiplayer",
      status: "active",
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
      sortOrder: 4,
    },
    {
      name: "Baloot",
      description: "Traditional Saudi Arabian card game. Strategy meets luck!",
      category: "cards",
      sections: ["challenges", "multiplayer"],
      gameType: "multiplayer",
      status: "active",
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
      sortOrder: 5,
    },
  ];

  let addedCount = 0;
  for (const game of multiplayerGamesList) {
    // Check in multiplayer_games table by name
    const [existingMp] = await db.select().from(multiplayerGames).where(
      eq(multiplayerGames.nameEn, game.name)
    );
    if (!existingMp) {
      // Insert into multiplayer_games table with proper fields
      await db.insert(multiplayerGames).values({
        key: game.name.toLowerCase().replace(/\s+/g, '_'),
        nameEn: game.name,
        nameAr: game.name, // Will be updated by admin
        descriptionEn: game.description,
        category: "multiplayer",
        status: game.status as GameStatus,
        minStake: game.minBet,
        maxStake: game.maxBet,
        houseFee: (parseFloat(game.houseEdge) / 100).toFixed(4),
        isFeatured: game.isFeatured,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        sortOrder: game.sortOrder,
      });
      addedCount++;
      console.log(`[Seed] Added multiplayer game: ${game.name}`);
    }
    // Also ensure it exists in games table
    const [existingGame] = await db.select().from(games).where(
      eq(games.name, game.name)
    );
    if (!existingGame) {
      await db.insert(games).values({
        name: game.name,
        description: game.description,
        category: game.category,
        gameType: game.gameType,
        status: game.status as GameStatus,
        rtp: game.rtp,
        houseEdge: game.houseEdge,
        volatility: game.volatility as GameVolatility,
        minBet: game.minBet,
        maxBet: game.maxBet,
        multiplierMin: game.multiplierMin,
        multiplierMax: game.multiplierMax,
        isFeatured: game.isFeatured,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        sortOrder: game.sortOrder,
      });
    }
  }
  
  if (addedCount > 0) {
    console.log(`[Seed] Added ${addedCount} multiplayer games`);
  } else {
    console.log("Multiplayer games already seeded");
  }
}
