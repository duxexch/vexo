import {
  passwordResetTokens, userSessions, loginHistory, userPreferences,
  type PasswordResetToken,
  type UserSession, type InsertUserSession,
  type LoginHistory, type InsertLoginHistory,
  type UserPreferences, type InsertUserPreferences,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, sql } from "drizzle-orm";

// ==================== PASSWORD RESET TOKENS ====================

export async function createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordResetToken> {
  const [resetToken] = await db.insert(passwordResetTokens).values(data).returning();
  return resetToken;
}

export async function getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
  const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
  return resetToken || undefined;
}

export async function markTokenAsUsed(id: string): Promise<void> {
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
}

export async function invalidateUserResetTokens(userId: string): Promise<void> {
  await db.update(passwordResetTokens).set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), sql`${passwordResetTokens.usedAt} IS NULL`));
}

// ==================== USER SESSIONS ====================

export async function createUserSession(session: InsertUserSession): Promise<UserSession> {
  const [created] = await db.insert(userSessions).values(session).returning();
  return created;
}

export async function getUserSessions(userId: string): Promise<UserSession[]> {
  return db.select().from(userSessions)
    .where(and(eq(userSessions.userId, userId), eq(userSessions.isActive, true)))
    .orderBy(desc(userSessions.lastActiveAt));
}

export async function revokeUserSession(id: string): Promise<void> {
  await db.update(userSessions).set({ isActive: false }).where(eq(userSessions.id, id));
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  if (exceptSessionId) {
    await db.update(userSessions)
      .set({ isActive: false })
      .where(and(
        eq(userSessions.userId, userId),
        eq(userSessions.isActive, true),
        sql`${userSessions.id} != ${exceptSessionId}`
      ));
  } else {
    await db.update(userSessions)
      .set({ isActive: false })
      .where(and(eq(userSessions.userId, userId), eq(userSessions.isActive, true)));
  }
}

// ==================== LOGIN HISTORY ====================

export async function createLoginHistory(entry: InsertLoginHistory): Promise<LoginHistory> {
  const [created] = await db.insert(loginHistory).values(entry).returning();
  return created;
}

export async function getUserLoginHistory(userId: string, limit = 20): Promise<LoginHistory[]> {
  return db.select().from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.createdAt))
    .limit(limit);
}

// ==================== USER PREFERENCES ====================

export async function getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
  const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  return prefs || undefined;
}

export async function createOrUpdateUserPreferences(userId: string, prefs: Partial<InsertUserPreferences>): Promise<UserPreferences> {
  const existing = await getUserPreferences(userId);
  if (existing) {
    const [updated] = await db.update(userPreferences)
      .set({ ...prefs, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(userPreferences)
      .values({ userId, ...prefs } as InsertUserPreferences)
      .returning();
    return created;
  }
}
