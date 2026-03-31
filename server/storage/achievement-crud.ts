import {
  achievements, userAchievements, users,
  type Achievement, type InsertAchievement,
  type UserAchievement,
  type AchievementCategory,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, sql } from "drizzle-orm";

// ==================== ACHIEVEMENTS ====================

export async function getAchievements(category?: string): Promise<Achievement[]> {
  if (category) {
    return db.select().from(achievements)
      .where(and(eq(achievements.isActive, true), eq(achievements.category, category as AchievementCategory)))
      .orderBy(asc(achievements.sortOrder));
  }
  return db.select().from(achievements)
    .where(eq(achievements.isActive, true))
    .orderBy(asc(achievements.sortOrder));
}

export async function getAchievement(id: string): Promise<Achievement | undefined> {
  const [achievement] = await db.select().from(achievements).where(eq(achievements.id, id));
  return achievement || undefined;
}

export async function getAchievementByKey(key: string): Promise<Achievement | undefined> {
  const [achievement] = await db.select().from(achievements).where(eq(achievements.key, key));
  return achievement || undefined;
}

export async function createAchievement(achievement: InsertAchievement): Promise<Achievement> {
  const [created] = await db.insert(achievements).values(achievement).returning();
  return created;
}

export async function getUserAchievements(userId: string): Promise<(UserAchievement & { achievement: Achievement })[]> {
  const results = await db.select({
    userAchievement: userAchievements,
    achievement: achievements,
  }).from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
    .where(eq(userAchievements.userId, userId))
    .orderBy(desc(userAchievements.unlockedAt));
  
  return results.map(r => ({
    ...r.userAchievement,
    achievement: r.achievement,
  }));
}

export async function getUserAchievement(userId: string, achievementId: string): Promise<UserAchievement | undefined> {
  const [ua] = await db.select().from(userAchievements)
    .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId)));
  return ua || undefined;
}

export async function updateAchievementProgress(userId: string, achievementKey: string, progress: number): Promise<{ unlocked: boolean; achievement?: Achievement }> {
  const achievement = await getAchievementByKey(achievementKey);
  if (!achievement) return { unlocked: false };

  let userAchievement = await getUserAchievement(userId, achievement.id);
  
  if (!userAchievement) {
    const [created] = await db.insert(userAchievements).values({
      userId,
      achievementId: achievement.id,
      progress: 0,
    }).returning();
    userAchievement = created;
  }

  if (userAchievement.unlockedAt) {
    return { unlocked: false };
  }

  const newProgress = Math.max(userAchievement.progress, progress);
  const unlocked = newProgress >= achievement.requirement;

  await db.update(userAchievements)
    .set({
      progress: newProgress,
      unlockedAt: unlocked ? new Date() : null,
    })
    .where(eq(userAchievements.id, userAchievement.id));

  return { unlocked, achievement: unlocked ? achievement : undefined };
}

export async function claimAchievementReward(userId: string, achievementId: string): Promise<{ success: boolean; amount?: string; error?: string }> {
  return db.transaction(async (tx) => {
    const [ua] = await tx.select().from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId)))
      .for('update');

    if (!ua || !ua.unlockedAt) {
      return { success: false, error: 'Achievement not unlocked' };
    }

    if (ua.rewardClaimed) {
      return { success: false, error: 'Reward already claimed' };
    }

    const [achievement] = await tx.select().from(achievements).where(eq(achievements.id, achievementId));
    if (!achievement || parseFloat(achievement.rewardAmount) <= 0) {
      return { success: false, error: 'No reward for this achievement' };
    }

    await tx.update(users)
      .set({ balance: sql`${users.balance} + ${achievement.rewardAmount}` })
      .where(eq(users.id, userId));

    await tx.update(userAchievements)
      .set({ rewardClaimed: true, rewardClaimedAt: new Date() })
      .where(eq(userAchievements.id, ua.id));

    return { success: true, amount: achievement.rewardAmount };
  });
}
