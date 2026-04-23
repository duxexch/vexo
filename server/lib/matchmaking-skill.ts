import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";

export type SkillTier = "rookie" | "regular" | "elite";

export interface UserSkillSnapshot {
  userId: string;
  tier: SkillTier;
  rating: number; // 0..1 normalized skill score
  gamesPlayed: number;
  vipLevel: number;
}

const TIER_THRESHOLDS = { regular: 0.35, elite: 0.6 } as const;

export function bucketize(rating: number): SkillTier {
  if (rating >= TIER_THRESHOLDS.elite) return "elite";
  if (rating >= TIER_THRESHOLDS.regular) return "regular";
  return "rookie";
}

/**
 * Compute a soft skill score in [0,1] from win-rate weighted by experience.
 * - Players with very few games are dampened toward 0 (so they match other rookies).
 * - VIP level adds a small bonus (loyalty-based).
 */
export function computeRating(opts: {
  gamesPlayed: number;
  gamesWon: number;
  vipLevel: number;
  longestWinStreak: number;
}): number {
  const { gamesPlayed, gamesWon, vipLevel, longestWinStreak } = opts;
  if (gamesPlayed <= 0) return 0;
  const winRate = Math.max(0, Math.min(1, gamesWon / gamesPlayed));
  // experience factor ramps from 0..1 over first 50 games
  const exp = Math.min(1, gamesPlayed / 50);
  const streakBonus = Math.min(0.1, longestWinStreak / 100);
  const vipBonus = Math.min(0.1, vipLevel / 100);
  return Math.max(0, Math.min(1, winRate * exp + streakBonus + vipBonus));
}

export async function getUserSkill(userId: string): Promise<UserSkillSnapshot> {
  const [row] = await db.select({
    id: users.id,
    gamesPlayed: users.gamesPlayed,
    gamesWon: users.gamesWon,
    vipLevel: users.vipLevel,
    longestWinStreak: users.longestWinStreak,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!row) return { userId, tier: "rookie", rating: 0, gamesPlayed: 0, vipLevel: 0 };
  const rating = computeRating({
    gamesPlayed: row.gamesPlayed ?? 0,
    gamesWon: row.gamesWon ?? 0,
    vipLevel: row.vipLevel ?? 0,
    longestWinStreak: row.longestWinStreak ?? 0,
  });
  return {
    userId: row.id,
    tier: bucketize(rating),
    rating,
    gamesPlayed: row.gamesPlayed ?? 0,
    vipLevel: row.vipLevel ?? 0,
  };
}

export async function getUserSkillsBulk(userIds: string[]): Promise<Map<string, UserSkillSnapshot>> {
  const map = new Map<string, UserSkillSnapshot>();
  if (userIds.length === 0) return map;
  const rows = await db.select({
    id: users.id,
    gamesPlayed: users.gamesPlayed,
    gamesWon: users.gamesWon,
    vipLevel: users.vipLevel,
    longestWinStreak: users.longestWinStreak,
  }).from(users).where(inArray(users.id, userIds));

  for (const r of rows) {
    const rating = computeRating({
      gamesPlayed: r.gamesPlayed ?? 0,
      gamesWon: r.gamesWon ?? 0,
      vipLevel: r.vipLevel ?? 0,
      longestWinStreak: r.longestWinStreak ?? 0,
    });
    map.set(r.id, {
      userId: r.id,
      tier: bucketize(rating),
      rating,
      gamesPlayed: r.gamesPlayed ?? 0,
      vipLevel: r.vipLevel ?? 0,
    });
  }
  return map;
}

export interface Waiter { id?: string; userId: string; createdAt: Date | string; [extra: string]: unknown }

/**
 * Pick the best opponent for `me` from `waiters` based on:
 * 1. Skill closeness (smallest |Δrating|)
 * 2. With a tier-tolerance window that widens with the waiter's wait time
 *    (after 15s waiting, tolerance opens to all tiers).
 * 3. Tie-break: longest waiting first (fairness).
 */
export function pickOpponentBySkill<W extends Waiter>(
  me: UserSkillSnapshot,
  waiters: W[],
  skills: Map<string, UserSkillSnapshot>,
  now: Date = new Date(),
): W | null {
  if (waiters.length === 0) return null;

  const scored = waiters.map((w) => {
    const s = skills.get(w.userId);
    const rating = s?.rating ?? 0;
    const tier = s?.tier ?? "rookie";
    const waitMs = now.getTime() - new Date(w.createdAt).getTime();
    const waitedSec = Math.max(0, Math.floor(waitMs / 1000));
    const diff = Math.abs(rating - me.rating);
    // Tolerance: 0.1 default, widens by 0.05 per 5s waited, max 1.0
    const tolerance = Math.min(1.0, 0.1 + Math.floor(waitedSec / 5) * 0.05);
    const sameTier = tier === me.tier;
    const eligible = diff <= tolerance || sameTier || waitedSec >= 15;
    // Score: lower is better. Heavy penalty if not eligible.
    const score = (eligible ? 0 : 1000) + diff - waitedSec * 0.001;
    return { waiter: w, score, eligible };
  });

  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];
  if (!best || !best.eligible) return null;
  return best.waiter;
}

export const QUEUE_EXPIRY_MS = 60_000;
export function isExpired(createdAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAt).getTime() > QUEUE_EXPIRY_MS;
}
