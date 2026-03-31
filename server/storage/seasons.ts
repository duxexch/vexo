import {
  users, seasons, seasonalStats, seasonRewards,
  type User,
  type Season, type InsertSeason,
  type SeasonalStats,
  type SeasonReward, type InsertSeasonReward,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, sql } from "drizzle-orm";

// ==================== SEASONS ====================

export async function getSeasons(): Promise<Season[]> {
  return db.select().from(seasons).orderBy(desc(seasons.number));
}

export async function getActiveSeason(): Promise<Season | undefined> {
  const [season] = await db.select().from(seasons).where(eq(seasons.status, 'active'));
  return season || undefined;
}

export async function getSeason(id: string): Promise<Season | undefined> {
  const [season] = await db.select().from(seasons).where(eq(seasons.id, id));
  return season || undefined;
}

export async function getSeasonByNumber(number: number): Promise<Season | undefined> {
  const [season] = await db.select().from(seasons).where(eq(seasons.number, number));
  return season || undefined;
}

export async function createSeason(season: InsertSeason): Promise<Season> {
  const [created] = await db.insert(seasons).values(season).returning();
  return created;
}

export async function updateSeason(id: string, data: Partial<InsertSeason>): Promise<Season | undefined> {
  const [updated] = await db.update(seasons).set(data).where(eq(seasons.id, id)).returning();
  return updated || undefined;
}

export async function getSeasonalStats(seasonId: string, limit: number = 100, gameType?: string): Promise<(SeasonalStats & { user: Pick<User, 'id' | 'username' | 'nickname' | 'profilePicture'> })[]> {
  let orderColumn = seasonalStats.gamesWon;
  
  const results = await db.select({
    stats: seasonalStats,
    user: {
      id: users.id,
      username: users.username,
      nickname: users.nickname,
      profilePicture: users.profilePicture,
    },
  }).from(seasonalStats)
    .innerJoin(users, eq(seasonalStats.userId, users.id))
    .where(eq(seasonalStats.seasonId, seasonId))
    .orderBy(desc(orderColumn))
    .limit(limit);

  return results.map(r => ({
    ...r.stats,
    user: r.user,
  }));
}

export async function getUserSeasonalStats(userId: string, seasonId: string): Promise<SeasonalStats | undefined> {
  const [stats] = await db.select().from(seasonalStats)
    .where(and(eq(seasonalStats.userId, userId), eq(seasonalStats.seasonId, seasonId)));
  return stats || undefined;
}

export async function getOrCreateSeasonalStats(userId: string, seasonId: string): Promise<SeasonalStats> {
  let stats = await getUserSeasonalStats(userId, seasonId);
  if (!stats) {
    const [created] = await db.insert(seasonalStats).values({
      userId,
      seasonId,
    }).returning();
    stats = created;
  }
  return stats;
}

export async function updateSeasonalStatsForGame(
  userId: string, 
  seasonId: string, 
  gameType: string, 
  won: boolean, 
  isDraw: boolean,
  earnings: string = '0'
): Promise<void> {
  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot'];
  const isValidGameType = validGameTypes.includes(gameType);

  await db.transaction(async (tx) => {
    const [stats] = await tx.select().from(seasonalStats)
      .where(and(eq(seasonalStats.userId, userId), eq(seasonalStats.seasonId, seasonId)))
      .for('update');

    if (!stats) {
      const insertData: Record<string, unknown> = {
        userId,
        seasonId,
        gamesPlayed: 1,
        gamesWon: won ? 1 : 0,
        gamesLost: !won && !isDraw ? 1 : 0,
        gamesDraw: isDraw ? 1 : 0,
        totalEarnings: earnings,
        currentWinStreak: won ? 1 : 0,
        longestWinStreak: won ? 1 : 0,
      };

      if (isValidGameType) {
        insertData[`${gameType}Played`] = 1;
        insertData[`${gameType}Won`] = won ? 1 : 0;
      }

      await tx.insert(seasonalStats).values(insertData as typeof seasonalStats.$inferInsert);
      return;
    }

    const newStreak = won ? stats.currentWinStreak + 1 : 0;
    const updateData: Record<string, unknown> = {
      gamesPlayed: stats.gamesPlayed + 1,
      gamesWon: stats.gamesWon + (won ? 1 : 0),
      gamesLost: stats.gamesLost + (!won && !isDraw ? 1 : 0),
      gamesDraw: stats.gamesDraw + (isDraw ? 1 : 0),
      totalEarnings: sql`${seasonalStats.totalEarnings} + ${earnings}`,
      currentWinStreak: newStreak,
      longestWinStreak: Math.max(stats.longestWinStreak, newStreak),
      updatedAt: new Date(),
    };

    if (isValidGameType) {
      const playedField = `${gameType}Played` as keyof typeof stats;
      const wonField = `${gameType}Won` as keyof typeof stats;
      updateData[playedField] = (stats[playedField] as number) + 1;
      if (won) {
        updateData[wonField] = (stats[wonField] as number) + 1;
      }
    }

    await tx.update(seasonalStats).set(updateData).where(eq(seasonalStats.id, stats.id));
  });
}

export async function getSeasonRewards(seasonId: string): Promise<SeasonReward[]> {
  return db.select().from(seasonRewards)
    .where(eq(seasonRewards.seasonId, seasonId))
    .orderBy(asc(seasonRewards.rankFrom));
}

export async function createSeasonReward(reward: InsertSeasonReward): Promise<SeasonReward> {
  const [created] = await db.insert(seasonRewards).values(reward).returning();
  return created;
}
