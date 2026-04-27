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

type AccountLinkingPolicy = "merge-by-email" | "strict-verified-email" | "separate-account";
type RefreshTokenStrategy = "always" | "google" | "none";

function resolveAccountLinkingPolicy(): AccountLinkingPolicy {
  const policy = typeof process.env.SOCIAL_ACCOUNT_LINKING_POLICY === "string"
    ? process.env.SOCIAL_ACCOUNT_LINKING_POLICY.trim().toLowerCase()
    : "";

  if (policy === "merge-by-email" || policy === "merge") {
    return "merge-by-email";
  }

  if (policy === "strict-verified-email") {
    return "strict-verified-email";
  }

  if (policy === "separate-account" || policy === "separate") {
    return "separate-account";
  }

  // Secure default: do not auto-merge on unverified provider emails.
  return "strict-verified-email";
}

function canLinkByEmail(policy: AccountLinkingPolicy, profile: NormalizedProfile): boolean {
  if (policy === "separate-account") {
    return false;
  }

  if (policy === "strict-verified-email") {
    return profile.emailVerified === true;
  }

  return true;
}

function resolveRefreshTokenStrategy(): RefreshTokenStrategy {
  const strategy = typeof process.env.OAUTH_REFRESH_TOKEN_STRATEGY === "string"
    ? process.env.OAUTH_REFRESH_TOKEN_STRATEGY.trim().toLowerCase()
    : "";

  if (strategy === "none") {
    return "none";
  }

  if (strategy === "google" || strategy === "google-only") {
    return "google";
  }

  return "always";
}

function shouldPersistRefreshToken(platformName: string, tokens: OAuthTokenResponse): boolean {
  if (!tokens.refresh_token) {
    return false;
  }

  const strategy = resolveRefreshTokenStrategy();
  if (strategy === "none") {
    return false;
  }

  if (strategy === "google") {
    return platformName.trim().toLowerCase() === "google";
  }

  return true;
}

// ==================== Account Linking ====================
export async function findOrCreateUser(
  platformName: string,
  profile: NormalizedProfile,
  tokens: OAuthTokenResponse,
): Promise<{ user: User; isNew: boolean; linked: boolean }> {
  const accountLinkingPolicy = resolveAccountLinkingPolicy();
  const persistRefreshToken = shouldPersistRefreshToken(platformName, tokens);

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
        refreshToken: persistRefreshToken
          ? (tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existingLink.refreshToken)
          : null,
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

  const existingEmailUser = profile.email
    ? (await storage.getUserByEmail(profile.email) || null)
    : null;

  if (profile.email) {
    const emailLinkAllowed = canLinkByEmail(accountLinkingPolicy, profile);
    if (existingEmailUser && emailLinkAllowed) {
      user = existingEmailUser;
    } else if (existingEmailUser && !emailLinkAllowed) {
      throw new Error("social_email_linking_blocked_by_policy");
    }
  }

  // 3. Create new user if not found
  if (!user) {
    const username = await generateUniqueUsername(profile.displayName || platformName);
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    // The username we just generated is derived from the verified social
    // profile name (e.g. Google "name" claim). The user already presented
    // this identity to the provider — asking them to "choose a username"
    // again is redundant friction and was the root cause of the post-OAuth
    // /profile?setup=true loop. So we mark usernameSelectedAt up front and
    // skip the selection gate entirely for social-registered accounts.
    user = await storage.createUser({
      username,
      email: profile.email || null,
      emailVerified: profile.emailVerified === true,
      password: hashedPassword,
      nickname: profile.displayName || username,
      profilePicture: profile.avatar || null,
      registrationType: `social_${platformName}`,
      usernameSelectedAt: new Date(),
    } as InsertUser);
    isNew = true;
  } else if (
    user.usernameSelectedAt === null &&
    typeof user.username === "string" &&
    user.username.trim().length > 0 &&
    // Skip both placeholder patterns:
    //   - `player_<accountId>` from one-click registration
    //   - `user_<hex>` from generateUniqueUsername's UUID fallback when
    //     the social profile had no usable display name
    !/^(player|user)_/i.test(user.username)
  ) {
    // Backfill for existing social users created before this fix: if they
    // already have a real (non-placeholder) username derived from their
    // social profile, treat the social re-login as confirming it so the
    // username-selection middleware stops blocking their requests.
    try {
      await storage.updateUser(user.id, { usernameSelectedAt: new Date() });
      user = { ...user, usernameSelectedAt: new Date() };
    } catch {
      // Non-fatal — login still succeeds; the gate will just remain active.
    }
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
    refreshToken: persistRefreshToken && tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
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
