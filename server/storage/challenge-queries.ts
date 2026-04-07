import {
  challenges, challengeSettings,
  type ChallengeSettings, type InsertChallengeSettings,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, ne, sql } from "drizzle-orm";

// ==================== CHALLENGES ====================

function buildAvailableChallengesExclusion(userId: string) {
  return and(
    ne(challenges.player1Id, userId),
    sql`${challenges.player2Id} IS NULL OR ${challenges.player2Id} <> ${userId}`,
    sql`${challenges.player3Id} IS NULL OR ${challenges.player3Id} <> ${userId}`,
    sql`${challenges.player4Id} IS NULL OR ${challenges.player4Id} <> ${userId}`,
  );
}

export async function getAvailableChallenges(excludeUserId?: string): Promise<any[]> {
  const result = await db.select().from(challenges)
    .where(
      and(
        eq(challenges.status, 'waiting'),
        eq(challenges.visibility, 'public'),
        excludeUserId ? buildAvailableChallengesExclusion(excludeUserId) : sql`1=1`
      )
    )
    .orderBy(desc(challenges.createdAt))
    .limit(20);
  return result;
}

export async function getActiveChallenges(): Promise<any[]> {
  const result = await db.select().from(challenges)
    .where(
      and(
        eq(challenges.status, 'active'),
        eq(challenges.visibility, 'public')
      )
    )
    .orderBy(desc(challenges.startedAt))
    .limit(20);
  return result;
}

// ==================== CHALLENGE SETTINGS ====================

export async function getChallengeSettings(gameType: string): Promise<ChallengeSettings> {
  // SECURITY: Only allow valid game types to prevent DB pollution
  const VALID_GAME_TYPES = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot', 'languageduel'];
  const safeGameType = VALID_GAME_TYPES.includes(gameType) ? gameType : 'chess';

  const [result] = await db.select().from(challengeSettings).where(eq(challengeSettings.gameType, safeGameType));
  if (result) return result;
  // Auto-create with secure defaults if not exists
  const languageDuelDefaults = safeGameType === 'languageduel'
    ? {
      turnTimeoutSeconds: 30,
      minMovesBeforeSurrender: 0,
    }
    : {};

  const [created] = await db.insert(challengeSettings).values({
    gameType: safeGameType,
    isEnabled: true,
    commissionPercent: "5.00",
    allowSurrender: true,
    surrenderWinnerPercent: "70.00",
    surrenderLoserRefundPercent: "30.00",
    withdrawPenaltyPercent: "0.00",
    turnTimeoutSeconds: 300,
    reconnectGraceSeconds: 60,
    challengeExpiryMinutes: 30,
    minStake: "1.00",
    maxStake: "1000.00",
    allowDraw: true,
    maxSpectators: 100,
    allowSpectators: true,
    minMovesBeforeSurrender: 2,
    maxConcurrentChallenges: 3,
    ...languageDuelDefaults,
  }).onConflictDoNothing().returning();
  if (created) return created;
  // Race condition: another request created it - fetch again
  const [existing] = await db.select().from(challengeSettings).where(eq(challengeSettings.gameType, safeGameType));
  return existing;
}

export async function getChallengeSettingsList(): Promise<ChallengeSettings[]> {
  return db.select().from(challengeSettings).orderBy(asc(challengeSettings.gameType));
}

export async function upsertChallengeSettings(gameType: string, data: Partial<InsertChallengeSettings>): Promise<ChallengeSettings> {
  // SECURITY: Whitelist allowed fields — prevent id, gameType, createdAt override
  const ALLOWED_UPDATE_FIELDS = [
    'isEnabled', 'commissionPercent', 'allowSurrender', 'surrenderWinnerPercent',
    'surrenderLoserRefundPercent', 'withdrawPenaltyPercent', 'turnTimeoutSeconds',
    'reconnectGraceSeconds', 'challengeExpiryMinutes', 'minStake', 'maxStake',
    'allowDraw', 'maxSpectators', 'allowSpectators', 'minMovesBeforeSurrender',
    'maxConcurrentChallenges'
  ];
  const safeData: Record<string, unknown> = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      // SECURITY: Reject Object/Array values in all fields
      const val = (data as Record<string, unknown>)[key];
      if (val !== null && typeof val === 'object') continue;
      safeData[key] = val;
    }
  }

  const [existing] = await db.select().from(challengeSettings).where(eq(challengeSettings.gameType, gameType));
  if (existing) {
    const [updated] = await db.update(challengeSettings)
      .set({ ...safeData, updatedAt: new Date() })
      .where(eq(challengeSettings.gameType, gameType))
      .returning();
    return updated;
  }
  const [created] = await db.insert(challengeSettings).values({
    gameType,
    ...safeData,
  }).returning();
  return created;
}
