import {
  users, userRelationships, socialPlatforms, userPreferences,
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

interface SearchUsersOptions {
  limit?: number;
  language?: string;
  countryCode?: string;
  regionCode?: string;
  city?: string;
}

export async function searchUsers(query: string, excludeUserId: string, options: SearchUsersOptions = {}): Promise<User[]> {
  const normalizedQuery = query.trim().replace(/^@+/, "").replace(/[\\%_]/g, "");
  const searchTerm = normalizedQuery;
  if (!searchTerm) return [];

  const normalizedLanguage = String(options.language || "").trim().toLowerCase();
  const normalizedCountryCode = String(options.countryCode || "").trim().toUpperCase();
  const normalizedRegionCode = String(options.regionCode || "").trim().toUpperCase();
  const normalizedCity = String(options.city || "").trim().replace(/[\\%_]/g, "");

  const requestedLimit = Number.isFinite(options.limit) ? Number(options.limit) : 50;
  const limit = Math.max(10, Math.min(100, requestedLimit));

  const searchQuery = `%${searchTerm}%`;

  const whereConditions = [
    ne(users.id, excludeUserId),
    eq(users.status, "active"),
    eq(users.stealthMode, false),
    or(
      ilike(users.username, searchQuery),
      ilike(users.accountId, searchQuery),
      ilike(users.nickname, searchQuery),
      ilike(users.firstName, searchQuery),
      ilike(users.lastName, searchQuery),
      ilike(users.email, searchQuery),
      ilike(users.phone, searchQuery)
    ),
  ];

  if (normalizedLanguage) {
    whereConditions.push(eq(userPreferences.language, normalizedLanguage));
  }

  if (normalizedCountryCode) {
    whereConditions.push(eq(userPreferences.countryCode, normalizedCountryCode));
  }

  if (normalizedRegionCode) {
    whereConditions.push(eq(userPreferences.regionCode, normalizedRegionCode));
  }

  if (normalizedCity) {
    whereConditions.push(ilike(userPreferences.city, `%${normalizedCity}%`));
  }

  const rows = await db.select({ user: users })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(and(...whereConditions))
    .orderBy(asc(users.username))
    .limit(limit);

  return rows.map((row) => row.user);
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
