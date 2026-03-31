/**
 * OAuth Account Linking — Find or create users from OAuth profiles, manage social accounts
 */
import crypto from "crypto";
import { db } from "../../db";
import { socialAuthAccounts, type InsertUser, type User } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../../storage";
import { encryptSecret } from "../crypto-utils";
import type { NormalizedProfile, OAuthTokenResponse } from "./types";

// ==================== Account Linking ====================
export async function findOrCreateUser(
  platformName: string,
  profile: NormalizedProfile,
  tokens: OAuthTokenResponse,
): Promise<{ user: User; isNew: boolean; linked: boolean }> {
  // 1. Check if this social account is already linked
  const [existingLink] = await db
    .select()
    .from(socialAuthAccounts)
    .where(
      and(
        eq(socialAuthAccounts.platformName, platformName),
        eq(socialAuthAccounts.providerUserId, profile.id),
      ),
    );

  if (existingLink) {
    // Update tokens and last used
    await db
      .update(socialAuthAccounts)
      .set({
        accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : existingLink.accessToken,
        refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existingLink.refreshToken,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : existingLink.tokenExpiresAt,
        lastUsedAt: new Date(),
        providerEmail: profile.email || existingLink.providerEmail,
        providerDisplayName: profile.displayName || existingLink.providerDisplayName,
        providerAvatar: profile.avatar || existingLink.providerAvatar,
      })
      .where(eq(socialAuthAccounts.id, existingLink.id));

    const user = await storage.getUser(existingLink.userId);
    if (!user) throw new Error("Linked user not found");
    return { user, isNew: false, linked: false };
  }

  // 2. Check if a user with this email already exists
  let user: User | null = null;
  let isNew = false;

  if (profile.email) {
    user = await storage.getUserByEmail(profile.email) || null;
  }

  // 3. Create new user if not found
  if (!user) {
    const username = await generateUniqueUsername(profile.displayName || platformName);
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    user = await storage.createUser({
      username,
      email: profile.email || null,
      emailVerified: !!profile.email, // Trust verified emails from OAuth providers
      password: hashedPassword,
      nickname: profile.displayName || username,
      profilePicture: profile.avatar || null,
      registrationType: `social_${platformName}`,
    } as InsertUser);
    isNew = true;
  }

  // 4. Link social account
  await db.insert(socialAuthAccounts).values({
    userId: user.id,
    platformName,
    providerUserId: profile.id,
    providerEmail: profile.email || null,
    providerDisplayName: profile.displayName || null,
    providerAvatar: profile.avatar || null,
    accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : null,
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    tokenExpiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
    rawProfile: JSON.stringify(profile.raw),
  });

  return { user, isNew, linked: true };
}

// ==================== Utility ====================
async function generateUniqueUsername(base: string): Promise<string> {
  // Clean the base name
  let clean = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .substring(0, 15);

  if (!clean || clean.length < 3) {
    clean = "user";
  }

  // Try the clean name first, then add random suffix
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? clean : `${clean}_${crypto.randomInt(1000, 9999)}`;
    const existing = await storage.getUserByUsername(candidate);
    if (!existing) return candidate;
  }

  // Fallback: UUID-based
  return `user_${crypto.randomBytes(4).toString("hex")}`;
}

export async function getUserSocialAccounts(userId: string) {
  return db
    .select({
      id: socialAuthAccounts.id,
      platformName: socialAuthAccounts.platformName,
      providerEmail: socialAuthAccounts.providerEmail,
      providerDisplayName: socialAuthAccounts.providerDisplayName,
      providerAvatar: socialAuthAccounts.providerAvatar,
      linkedAt: socialAuthAccounts.linkedAt,
      lastUsedAt: socialAuthAccounts.lastUsedAt,
    })
    .from(socialAuthAccounts)
    .where(eq(socialAuthAccounts.userId, userId));
}

export async function unlinkSocialAccount(userId: string, accountId: string): Promise<boolean> {
  const result = await db
    .delete(socialAuthAccounts)
    .where(
      and(
        eq(socialAuthAccounts.id, accountId),
        eq(socialAuthAccounts.userId, userId),
      ),
    )
    .returning({ id: socialAuthAccounts.id });
  return result.length > 0;
}
