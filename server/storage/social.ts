import {
  users, userRelationships, socialPlatforms,
  type User, type UserRelationship, type InsertUserRelationship,
  type SocialPlatform, type InsertSocialPlatform,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, or, ilike, ne } from "drizzle-orm";
import { encryptPlatformSecrets, decryptPlatformSecrets } from "../lib/crypto-utils";

// ==================== USER RELATIONSHIPS ====================

export async function createUserRelationship(relationship: InsertUserRelationship): Promise<UserRelationship> {
  const [created] = await db.insert(userRelationships)
    .values(relationship)
    .onConflictDoUpdate({
      target: [userRelationships.userId, userRelationships.targetUserId, userRelationships.type],
      set: {
        status: relationship.status ?? "active",
        updatedAt: new Date(),
      },
    })
    .returning();
  return created;
}

export async function deleteUserRelationship(userId: string, targetUserId: string, type: string): Promise<boolean> {
  await db.delete(userRelationships)
    .where(and(
      eq(userRelationships.userId, userId),
      eq(userRelationships.targetUserId, targetUserId),
      eq(userRelationships.type, type)
    ));
  return true;
}

export async function getUserRelationship(userId: string, targetUserId: string, type: string): Promise<UserRelationship | undefined> {
  const [relationship] = await db.select().from(userRelationships)
    .where(and(
      eq(userRelationships.userId, userId),
      eq(userRelationships.targetUserId, targetUserId),
      eq(userRelationships.type, type)
    ));
  return relationship || undefined;
}

export async function getUserFollowing(userId: string): Promise<UserRelationship[]> {
  return db.select().from(userRelationships)
    .where(and(
      eq(userRelationships.userId, userId),
      eq(userRelationships.type, "follow"),
      eq(userRelationships.status, "active")
    ))
    .orderBy(desc(userRelationships.createdAt));
}

export async function getUserFollowers(userId: string): Promise<UserRelationship[]> {
  return db.select().from(userRelationships)
    .where(and(
      eq(userRelationships.targetUserId, userId),
      eq(userRelationships.type, "follow"),
      eq(userRelationships.status, "active")
    ))
    .orderBy(desc(userRelationships.createdAt));
}

export async function searchUsers(query: string, excludeUserId: string): Promise<User[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const searchQuery = `%${searchTerm}%`;
  return db.select().from(users)
    .where(and(
      ne(users.id, excludeUserId),
      eq(users.status, "active"),
      or(
        ilike(users.username, searchQuery),
        ilike(users.accountId, searchQuery)
      )
    ))
    .orderBy(users.username)
    .limit(50);
}

// ==================== SOCIAL PLATFORMS ====================

export async function listSocialPlatforms(): Promise<SocialPlatform[]> {
  const platforms = await db.select().from(socialPlatforms).orderBy(asc(socialPlatforms.sortOrder));
  return platforms.map(p => decryptPlatformSecrets(p));
}

export async function getEnabledSocialPlatforms(): Promise<SocialPlatform[]> {
  const platforms = await db.select().from(socialPlatforms)
    .where(eq(socialPlatforms.isEnabled, true))
    .orderBy(asc(socialPlatforms.sortOrder));
  return platforms.map(p => decryptPlatformSecrets(p));
}

export async function getSocialPlatform(id: string): Promise<SocialPlatform | undefined> {
  const [platform] = await db.select().from(socialPlatforms).where(eq(socialPlatforms.id, id));
  return platform ? decryptPlatformSecrets(platform) : undefined;
}

export async function getSocialPlatformByName(name: string): Promise<SocialPlatform | undefined> {
  const [platform] = await db.select().from(socialPlatforms).where(eq(socialPlatforms.name, name));
  return platform ? decryptPlatformSecrets(platform) : undefined;
}

export async function createSocialPlatform(platform: InsertSocialPlatform): Promise<SocialPlatform> {
  const encrypted = encryptPlatformSecrets(platform);
  const [created] = await db.insert(socialPlatforms).values(encrypted).returning();
  return decryptPlatformSecrets(created);
}

export async function updateSocialPlatform(id: string, data: Partial<InsertSocialPlatform>): Promise<SocialPlatform | undefined> {
  const encrypted = encryptPlatformSecrets(data);
  const [updated] = await db.update(socialPlatforms)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(socialPlatforms.id, id))
    .returning();
  return updated ? decryptPlatformSecrets(updated) : undefined;
}

export async function deleteSocialPlatform(id: string): Promise<boolean> {
  const result = await db.delete(socialPlatforms).where(eq(socialPlatforms.id, id)).returning({ id: socialPlatforms.id });
  return result.length > 0;
}
