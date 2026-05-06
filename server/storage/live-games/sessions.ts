import {
  liveGameSessions,
  gameMoves, gameSpectators,
  gameChatMessages,
  type LiveGameSession, type InsertLiveGameSession,
  type GameMove, type InsertGameMove,
  type GameSpectator, type InsertGameSpectator,
  type GameChatMessage, type InsertGameChatMessage,
  type LiveGameStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, asc, or, sql } from "drizzle-orm";

// ==================== LIVE GAME SESSIONS ====================

export async function createLiveGameSession(session: InsertLiveGameSession): Promise<LiveGameSession> {
  const [created] = await db.insert(liveGameSessions).values(session).returning();
  return created;
}

export async function getLiveGameSession(id: string): Promise<LiveGameSession | undefined> {
  const [session] = await db.select().from(liveGameSessions).where(eq(liveGameSessions.id, id));
  return session || undefined;
}

export async function updateLiveGameSession(id: string, data: Partial<InsertLiveGameSession>): Promise<LiveGameSession | undefined> {
  const [updated] = await db.update(liveGameSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(liveGameSessions.id, id))
    .returning();
  return updated || undefined;
}

export async function listLiveGameSessions(status?: string, gameType?: string): Promise<LiveGameSession[]> {
  let query = db.select().from(liveGameSessions);
  const conditions = [];
  if (status) conditions.push(eq(liveGameSessions.status, status as LiveGameStatus));
  if (gameType) conditions.push(eq(liveGameSessions.gameType, gameType));
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  return query.orderBy(desc(liveGameSessions.createdAt));
}

export async function getActiveLiveGamesByPlayer(playerId: string): Promise<LiveGameSession[]> {
  return db.select().from(liveGameSessions)
    .where(and(
      or(
        eq(liveGameSessions.player1Id, playerId),
        eq(liveGameSessions.player2Id, playerId),
        eq(liveGameSessions.player3Id, playerId),
        eq(liveGameSessions.player4Id, playerId)
      ),
      or(
        eq(liveGameSessions.status, 'waiting'),
        eq(liveGameSessions.status, 'starting'),
        eq(liveGameSessions.status, 'in_progress')
      )
    ))
    .orderBy(desc(liveGameSessions.createdAt));
}

// ==================== GAME MOVES ====================

export async function addGameMove(move: InsertGameMove): Promise<GameMove> {
  const [created] = await db.insert(gameMoves).values(move).returning();
  return created;
}

export async function getGameMoves(sessionId: string): Promise<GameMove[]> {
  return db.select().from(gameMoves)
    .where(eq(gameMoves.sessionId, sessionId))
    .orderBy(asc(gameMoves.moveNumber));
}

// ==================== GAME SPECTATORS ====================

export async function addGameSpectator(spectator: InsertGameSpectator): Promise<GameSpectator> {
  const [created] = await db.insert(gameSpectators).values(spectator).returning();
  return created;
}

export async function removeGameSpectator(sessionId: string, userId: string): Promise<void> {
  await db.update(gameSpectators)
    .set({ leftAt: new Date() })
    .where(and(
      eq(gameSpectators.sessionId, sessionId),
      eq(gameSpectators.userId, userId)
    ));
}

export async function getSessionSpectators(sessionId: string): Promise<GameSpectator[]> {
  return db.select().from(gameSpectators)
    .where(and(
      eq(gameSpectators.sessionId, sessionId),
      sql`${gameSpectators.leftAt} IS NULL`
    ));
}

// ==================== GAME CHAT MESSAGES ====================

export async function addGameChatMessage(message: InsertGameChatMessage): Promise<GameChatMessage> {
  const [created] = await db.insert(gameChatMessages).values(message).returning();
  return created;
}

export async function getGameChatMessages(sessionId: string, limit: number = 100): Promise<GameChatMessage[]> {
  return db.select().from(gameChatMessages)
    .where(eq(gameChatMessages.sessionId, sessionId))
    .orderBy(desc(gameChatMessages.createdAt))
    .limit(limit);
}

// ==================== GAME SESSION SNAPSHOTS (forensics / recovery) ====================

export async function upsertGameSessionSnapshot(input: {
  sessionId: string;
  orderingIndex: number;
  stateJson: string; // stored as JSONB in `game_session_snapshots.state`
  correlationId?: string;
}): Promise<void> {
  // Idempotent: unique(session_id, ordering_index) enforced by migration.
  await db.execute(sql`
    INSERT INTO game_session_snapshots (session_id, ordering_index, state, correlation_id)
    VALUES (
      ${input.sessionId},
      ${input.orderingIndex},
      CAST(${input.stateJson} AS jsonb),
      ${input.correlationId ?? null}
    )
    ON CONFLICT (session_id, ordering_index) DO NOTHING
  `);
}

export async function getGameSessionSnapshots(sessionId: string): Promise<Array<{
  orderingIndex: number;
  stateJson: string;
  correlationId: string | null;
  createdAt: Date;
}>> {
  const rows = await db.execute(sql`
    SELECT ordering_index, state::text AS state_json, correlation_id, created_at
    FROM game_session_snapshots
    WHERE session_id = ${sessionId}
    ORDER BY ordering_index ASC
  `);

  // drizzle `db.execute` returns raw rows; normalize to expected shape.
  return rows.rows.map((r: any) => ({
    orderingIndex: Number(r.ordering_index ?? r.orderingIndex),
    stateJson: String(r.state_json ?? r.stateJson),
    correlationId: r.correlation_id ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}

export async function getLatestGameSessionSnapshot(sessionId: string, orderingIndexMax: number): Promise<{
  orderingIndex: number;
  stateJson: string;
  correlationId: string | null;
  createdAt: Date;
} | null> {
  const rows = await db.execute(sql`
    SELECT ordering_index, state::text AS state_json, correlation_id, created_at
    FROM game_session_snapshots
    WHERE session_id = ${sessionId}
      AND ordering_index <= ${orderingIndexMax}
    ORDER BY ordering_index DESC
    LIMIT 1
  `);

  const row = rows.rows[0] as any | undefined;
  if (!row) return null;

  return {
    orderingIndex: Number(row.ordering_index ?? row.orderingIndex),
    stateJson: String(row.state_json ?? row.stateJson),
    correlationId: row.correlation_id ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}
