import {
  projectCurrencyWallets,
  type ProjectCurrencyWallet,
} from "@shared/schema";
import { db } from "../../db";
import { and, eq, gte, sql } from "drizzle-orm";
import { getErrorMessage } from "../helpers";

const MAX_DECIMAL_15_2 = 9999999999999.99;

function parsePositiveWalletAmount(amount: string): number | null {
  const parsed = Number.parseFloat(String(amount));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Number(parsed.toFixed(2));
  if (normalized <= 0 || normalized > MAX_DECIMAL_15_2) {
    return null;
  }

  return normalized;
}

// ==================== PROJECT CURRENCY WALLETS ====================

export async function getProjectCurrencyWallet(userId: string): Promise<ProjectCurrencyWallet | undefined> {
  const [wallet] = await db.select().from(projectCurrencyWallets).where(eq(projectCurrencyWallets.userId, userId));
  return wallet || undefined;
}

export async function createProjectCurrencyWallet(userId: string): Promise<ProjectCurrencyWallet> {
  const [wallet] = await db.insert(projectCurrencyWallets).values({ userId }).returning();
  return wallet;
}

export async function getOrCreateProjectCurrencyWallet(userId: string): Promise<ProjectCurrencyWallet> {
  const existing = await getProjectCurrencyWallet(userId);
  if (existing) return existing;

  await db.insert(projectCurrencyWallets).values({ userId }).onConflictDoNothing();
  const [wallet] = await db.select().from(projectCurrencyWallets).where(eq(projectCurrencyWallets.userId, userId));
  if (!wallet) {
    throw new Error("Failed to resolve project currency wallet");
  }

  return wallet;
}

// ==================== BALANCE OPERATIONS ====================

export async function updateProjectCurrencyWalletBalance(
  walletId: string,
  amount: string,
  operation: 'add' | 'subtract',
  balanceType: 'purchased' | 'earned'
): Promise<{ success: boolean; wallet?: ProjectCurrencyWallet; error?: string }> {
  const changeAmount = parsePositiveWalletAmount(amount);
  if (changeAmount === null) {
    return { success: false, error: 'Invalid amount' };
  }

  try {
    const now = new Date();

    if (operation === 'subtract') {
      const [updated] = balanceType === 'purchased'
        ? await db
          .update(projectCurrencyWallets)
          .set({
            purchasedBalance: sql`${projectCurrencyWallets.purchasedBalance} - ${changeAmount}`,
            totalBalance: sql`${projectCurrencyWallets.totalBalance} - ${changeAmount}`,
            totalSpent: sql`${projectCurrencyWallets.totalSpent} + ${changeAmount}`,
            updatedAt: now,
          })
          .where(and(
            eq(projectCurrencyWallets.id, walletId),
            gte(projectCurrencyWallets.purchasedBalance, sql`${changeAmount}`),
          ))
          .returning()
        : await db
          .update(projectCurrencyWallets)
          .set({
            earnedBalance: sql`${projectCurrencyWallets.earnedBalance} - ${changeAmount}`,
            totalBalance: sql`${projectCurrencyWallets.totalBalance} - ${changeAmount}`,
            totalSpent: sql`${projectCurrencyWallets.totalSpent} + ${changeAmount}`,
            updatedAt: now,
          })
          .where(and(
            eq(projectCurrencyWallets.id, walletId),
            gte(projectCurrencyWallets.earnedBalance, sql`${changeAmount}`),
          ))
          .returning();

      if (!updated) {
        return { success: false, error: 'Insufficient balance' };
      }

      return { success: true, wallet: updated };
    } else {
      const [updated] = balanceType === 'purchased'
        ? await db
          .update(projectCurrencyWallets)
          .set({
            purchasedBalance: sql`${projectCurrencyWallets.purchasedBalance} + ${changeAmount}`,
            totalBalance: sql`${projectCurrencyWallets.totalBalance} + ${changeAmount}`,
            totalConverted: sql`${projectCurrencyWallets.totalConverted} + ${changeAmount}`,
            updatedAt: now,
          })
          .where(eq(projectCurrencyWallets.id, walletId))
          .returning()
        : await db
          .update(projectCurrencyWallets)
          .set({
            earnedBalance: sql`${projectCurrencyWallets.earnedBalance} + ${changeAmount}`,
            totalBalance: sql`${projectCurrencyWallets.totalBalance} + ${changeAmount}`,
            totalEarned: sql`${projectCurrencyWallets.totalEarned} + ${changeAmount}`,
            updatedAt: now,
          })
          .where(eq(projectCurrencyWallets.id, walletId))
          .returning();

      if (!updated) {
        return { success: false, error: 'Wallet not found' };
      }

      return { success: true, wallet: updated };
    }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function lockProjectCurrencyBalance(walletId: string, amount: string): Promise<{ success: boolean; error?: string }> {
  const lockAmount = parsePositiveWalletAmount(amount);
  if (lockAmount === null) {
    return { success: false, error: 'Invalid amount' };
  }

  try {
    const [updated] = await db
      .update(projectCurrencyWallets)
      .set({
        totalBalance: sql`${projectCurrencyWallets.totalBalance} - ${lockAmount}`,
        lockedBalance: sql`${projectCurrencyWallets.lockedBalance} + ${lockAmount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(projectCurrencyWallets.id, walletId),
        gte(projectCurrencyWallets.totalBalance, sql`${lockAmount}`),
      ))
      .returning({ id: projectCurrencyWallets.id });

    if (!updated) {
      return { success: false, error: 'Insufficient balance to lock' };
    }

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function unlockProjectCurrencyBalance(walletId: string, amount: string): Promise<{ success: boolean; error?: string }> {
  const unlockAmount = parsePositiveWalletAmount(amount);
  if (unlockAmount === null) {
    return { success: false, error: 'Invalid amount' };
  }

  try {
    const [updated] = await db
      .update(projectCurrencyWallets)
      .set({
        totalBalance: sql`${projectCurrencyWallets.totalBalance} + ${unlockAmount}`,
        lockedBalance: sql`${projectCurrencyWallets.lockedBalance} - ${unlockAmount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(projectCurrencyWallets.id, walletId),
        gte(projectCurrencyWallets.lockedBalance, sql`${unlockAmount}`),
      ))
      .returning({ id: projectCurrencyWallets.id });

    if (!updated) {
      return { success: false, error: 'Insufficient locked balance' };
    }

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function forfeitLockedProjectCurrencyBalance(walletId: string, amount: string): Promise<{ success: boolean; error?: string }> {
  const forfeitAmount = parsePositiveWalletAmount(amount);
  if (forfeitAmount === null) {
    return { success: false, error: 'Invalid amount' };
  }

  try {
    const [updated] = await db
      .update(projectCurrencyWallets)
      .set({
        lockedBalance: sql`${projectCurrencyWallets.lockedBalance} - ${forfeitAmount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(projectCurrencyWallets.id, walletId),
        gte(projectCurrencyWallets.lockedBalance, sql`${forfeitAmount}`),
      ))
      .returning({ id: projectCurrencyWallets.id });

    if (!updated) {
      return { success: false, error: 'Insufficient locked balance to forfeit' };
    }

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
