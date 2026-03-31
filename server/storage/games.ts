import {
  games, gameSessions, multiplayerGames,
  type Game, type InsertGame,
  type GameSession, type InsertGameSession,
  type MultiplayerGame, type InsertMultiplayerGame,
  type GameStatus,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, sql } from "drizzle-orm";

// ==================== GAMES ====================

export async function getGame(id: string): Promise<Game | undefined> {
  const [game] = await db.select().from(games).where(eq(games.id, id));
  return game || undefined;
}

export async function createGame(insertGame: InsertGame): Promise<Game> {
  const [game] = await db.insert(games).values(insertGame).returning();
  return game;
}

export async function updateGame(id: string, data: Partial<InsertGame>): Promise<Game | undefined> {
  const [game] = await db.update(games).set({ ...data, updatedAt: new Date() }).where(eq(games.id, id)).returning();
  return game || undefined;
}

export async function deleteGame(id: string): Promise<boolean> {
  await db.delete(games).where(eq(games.id, id));
  return true;
}

export async function listGames(status?: string, section?: string): Promise<Game[]> {
  const conditions = [];
  if (status) {
    conditions.push(eq(games.status, status as GameStatus));
  }
  if (section) {
    // Validate section against allowed values to prevent SQL injection
    const allowedSections = ['popular', 'new', 'featured', 'multiplayer', 'casino', 'board', 'card', 'dice', 'crash', 'wheel', 'slots', 'jackpot', 'live', 'puzzle', 'arcade'];
    const sanitizedSection = String(section).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (allowedSections.includes(sanitizedSection)) {
      conditions.push(sql`${sanitizedSection} = ANY(${games.sections})`);
    }
  }
  if (conditions.length > 0) {
    return db.select().from(games).where(and(...conditions)).orderBy(asc(games.sortOrder));
  }
  return db.select().from(games).orderBy(asc(games.sortOrder));
}

export async function incrementGamePlayCount(id: string, volume: string): Promise<void> {
  await db.update(games).set({ 
    playCount: sql`${games.playCount} + 1`,
    totalVolume: sql`${games.totalVolume} + ${volume}`
  }).where(eq(games.id, id));
}

// ==================== GAME SESSIONS ====================

export async function createGameSession(session: InsertGameSession): Promise<GameSession> {
  const [gs] = await db.insert(gameSessions).values(session).returning();
  return gs;
}

export async function getGameSessionsByUser(userId: string, limit = 50): Promise<GameSession[]> {
  return db.select().from(gameSessions).where(eq(gameSessions.userId, userId)).orderBy(desc(gameSessions.createdAt)).limit(limit);
}

export async function getGameSessionsByGame(gameId: string, limit = 50): Promise<GameSession[]> {
  return db.select().from(gameSessions).where(eq(gameSessions.gameId, gameId)).orderBy(desc(gameSessions.createdAt)).limit(limit);
}

// ==================== MULTIPLAYER GAMES (Single Source of Truth) ====================

export async function getMultiplayerGame(id: string): Promise<MultiplayerGame | undefined> {
  const [game] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.id, id));
  return game || undefined;
}

export async function getMultiplayerGameByKey(key: string): Promise<MultiplayerGame | undefined> {
  const [game] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.key, key));
  return game || undefined;
}

export async function listMultiplayerGames(activeOnly: boolean = false): Promise<MultiplayerGame[]> {
  if (activeOnly) {
    return db.select().from(multiplayerGames)
      .where(eq(multiplayerGames.isActive, true))
      .orderBy(asc(multiplayerGames.sortOrder), asc(multiplayerGames.key));
  }
  return db.select().from(multiplayerGames).orderBy(asc(multiplayerGames.sortOrder), asc(multiplayerGames.key));
}

export async function createMultiplayerGame(game: InsertMultiplayerGame): Promise<MultiplayerGame> {
  const [created] = await db.insert(multiplayerGames).values(game).returning();
  return created;
}

export async function updateMultiplayerGame(id: string, data: Partial<InsertMultiplayerGame>): Promise<MultiplayerGame | undefined> {
  const [updated] = await db.update(multiplayerGames)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(multiplayerGames.id, id))
    .returning();
  return updated || undefined;
}

export async function deleteMultiplayerGame(id: string): Promise<boolean> {
  await db.delete(multiplayerGames).where(eq(multiplayerGames.id, id));
  return true;
}

export async function incrementMultiplayerGameStats(key: string, volume: string): Promise<void> {
  await db.update(multiplayerGames)
    .set({
      totalGamesPlayed: sql`${multiplayerGames.totalGamesPlayed} + 1`,
      totalVolume: sql`${multiplayerGames.totalVolume} + ${parseFloat(volume)}`,
      updatedAt: new Date()
    })
    .where(eq(multiplayerGames.key, key));
}

export async function validateGameConfig(gameKey: string, stakeAmount: string): Promise<{ valid: boolean; error?: string; game?: MultiplayerGame }> {
  const game = await getMultiplayerGameByKey(gameKey);
  
  if (!game) {
    return { valid: false, error: `Game '${gameKey}' does not exist` };
  }
  
  if (!game.isActive) {
    return { valid: false, error: `Game '${gameKey}' is currently inactive` };
  }
  
  const stake = parseFloat(stakeAmount);
  const minStake = parseFloat(game.minStake);
  const maxStake = parseFloat(game.maxStake);
  
  if (stake < minStake) {
    return { valid: false, error: `Entry ${stake} is below minimum ${minStake}`, game };
  }
  
  if (stake > maxStake) {
    return { valid: false, error: `Entry ${stake} exceeds maximum ${maxStake}`, game };
  }
  
  return { valid: true, game };
}
