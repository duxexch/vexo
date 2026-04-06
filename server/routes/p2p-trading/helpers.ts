import { db } from "../../db";
import { p2pSettings, p2pTraderProfiles, p2pTrades, type User } from "@shared/schema";
import { and, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { getBadgeEntitlementForUser, resolveEffectiveP2PMonthlyLimit } from "../../lib/user-badge-entitlements";

export type P2PVerificationLevel = "none" | "email" | "phone" | "kyc_basic" | "kyc_full";

const verificationRank: Record<P2PVerificationLevel, number> = {
  none: 0,
  email: 1,
  phone: 2,
  kyc_basic: 3,
  kyc_full: 4,
};

export const MIN_P2P_VERIFICATION_LEVEL: P2PVerificationLevel = "phone";

function normalizeP2PVerificationLevel(level: unknown): P2PVerificationLevel {
  if (level === "kyc_full" || level === "kyc_basic" || level === "phone" || level === "email" || level === "none") {
    return level;
  }

  return "none";
}

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function hasRequiredP2PVerification(
  currentLevel: P2PVerificationLevel,
  requiredLevel: P2PVerificationLevel = MIN_P2P_VERIFICATION_LEVEL,
): boolean {
  return verificationRank[currentLevel] >= verificationRank[requiredLevel];
}

export function deriveP2PVerificationLevelFromUser(
  user: Pick<User, "idVerificationStatus" | "phoneVerified" | "emailVerified">,
): P2PVerificationLevel {
  if (user.idVerificationStatus === "approved") {
    return "kyc_basic";
  }

  if (user.phoneVerified) {
    return "phone";
  }

  if (user.emailVerified) {
    return "email";
  }

  return "none";
}

export async function getEffectiveP2PVerificationLevel(user: User): Promise<P2PVerificationLevel> {
  const [profile] = await db
    .select({ verificationLevel: p2pTraderProfiles.verificationLevel })
    .from(p2pTraderProfiles)
    .where(eq(p2pTraderProfiles.userId, user.id))
    .limit(1);

  const profileLevel = normalizeP2PVerificationLevel(profile?.verificationLevel);
  const accountLevel = deriveP2PVerificationLevelFromUser(user);

  return verificationRank[profileLevel] >= verificationRank[accountLevel]
    ? profileLevel
    : accountLevel;
}

export function getP2PVerificationErrorMessage(requiredLevel: P2PVerificationLevel = MIN_P2P_VERIFICATION_LEVEL): string {
  if (requiredLevel === "phone") {
    return "P2P access requires verified phone or KYC. Please complete verification first.";
  }

  if (requiredLevel === "kyc_basic" || requiredLevel === "kyc_full") {
    return "P2P access requires KYC verification. Please complete identity verification first.";
  }

  if (requiredLevel === "email") {
    return "P2P access requires verified email. Please verify your email first.";
  }

  return "P2P access is restricted until verification requirements are met.";
}

export async function calculateP2PFee(tradeAmount: number): Promise<number> {
  const [settings] = await db.select().from(p2pSettings).limit(1);
  if (!settings) {
    return tradeAmount * 0.005;
  }

  let fee = 0;
  const percentageRate = parseFloat(settings.platformFeePercentage);
  const fixedAmount = parseFloat(settings.platformFeeFixed);
  const minFee = parseFloat(settings.minFee);
  const maxFee = settings.maxFee ? parseFloat(settings.maxFee) : null;

  switch (settings.feeType) {
    case "percentage":
      fee = tradeAmount * percentageRate;
      break;
    case "fixed":
      fee = fixedAmount;
      break;
    case "hybrid":
      fee = (tradeAmount * percentageRate) + fixedAmount;
      break;
    default:
      fee = tradeAmount * 0.005;
  }

  if (fee < minFee) fee = minFee;
  if (maxFee !== null && fee > maxFee) fee = maxFee;

  return fee;
}

export function getCurrentMonthBounds(referenceDate: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

export async function getUserCurrentMonthP2PTradeVolume(userId: string): Promise<number> {
  const { start, end } = getCurrentMonthBounds();
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as numeric)), 0)`,
    })
    .from(p2pTrades)
    .where(and(
      or(eq(p2pTrades.buyerId, userId), eq(p2pTrades.sellerId, userId)),
      ne(p2pTrades.status, "cancelled"),
      gte(p2pTrades.createdAt, start),
      lt(p2pTrades.createdAt, end),
    ));

  return Number(row?.total || 0);
}

export interface P2PTradingPermissionResult {
  allowed: boolean;
  reason?: string;
  monthlyLimit: number | null;
  monthlyUsed: number;
}

export async function checkUserP2PTradingPermission(
  userId: string,
  requestedFiatAmount: number = 0,
): Promise<P2PTradingPermissionResult> {
  const [profile] = await db
    .select({
      canTradeP2P: p2pTraderProfiles.canTradeP2P,
      monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
    })
    .from(p2pTraderProfiles)
    .where(eq(p2pTraderProfiles.userId, userId))
    .limit(1);

  const badgeEntitlements = await getBadgeEntitlementForUser(userId);
  const hasProfile = Boolean(profile);
  const baseMonthlyLimit = profile?.monthlyTradeLimit !== null && profile?.monthlyTradeLimit !== undefined
    ? Number(profile.monthlyTradeLimit)
    : null;
  const effectiveMonthlyLimit = resolveEffectiveP2PMonthlyLimit(
    baseMonthlyLimit,
    badgeEntitlements.maxP2PMonthlyLimit,
    hasProfile,
  );
  const canTradeP2P = Boolean(profile?.canTradeP2P) || badgeEntitlements.grantsP2pPrivileges;

  if (!canTradeP2P) {
    return {
      allowed: false,
      reason: "Your account is not approved for P2P trading. Contact support or an administrator.",
      monthlyLimit: effectiveMonthlyLimit,
      monthlyUsed: 0,
    };
  }

  const monthlyUsed = await getUserCurrentMonthP2PTradeVolume(userId);
  const monthlyLimit = effectiveMonthlyLimit;

  if (monthlyLimit !== null && (monthlyUsed + Math.max(requestedFiatAmount, 0)) > monthlyLimit) {
    return {
      allowed: false,
      reason: `Monthly P2P trading limit reached. Limit: ${monthlyLimit.toFixed(2)}, used: ${monthlyUsed.toFixed(2)}.`,
      monthlyLimit,
      monthlyUsed,
    };
  }

  return {
    allowed: true,
    monthlyLimit,
    monthlyUsed,
  };
}

