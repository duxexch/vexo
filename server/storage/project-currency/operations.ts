import {
  projectCurrencyConversions, projectCurrencyLedger, projectCurrencyWallets, users,
  type ProjectCurrencyConversion,
  type ProjectCurrencyLedger as ProjectCurrencyLedgerType, type InsertProjectCurrencyLedger,
  type CurrencyLedgerType,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, gte, ne, sql, type SQL } from "drizzle-orm";
import { getErrorMessage } from "../helpers";
import { getProjectCurrencySettings } from "./settings";

const MAX_DECIMAL_15_2 = 9999999999999.99;

function parsePositiveAmount(value: string): number | null {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Number(parsed.toFixed(2));
  if (normalized <= 0 || normalized > MAX_DECIMAL_15_2) {
    return null;
  }

  return normalized;
}

function parseFiniteAmount(value: string): number | null {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

// ==================== LEDGER ====================

export async function createProjectCurrencyLedgerEntry(entry: InsertProjectCurrencyLedger): Promise<ProjectCurrencyLedgerType> {
  const [created] = await db.insert(projectCurrencyLedger).values(entry).returning();
  return created;
}

export async function getProjectCurrencyLedger(options?: { userId?: string; walletId?: string; type?: string; limit?: number; offset?: number }): Promise<ProjectCurrencyLedgerType[]> {
  let query = db.select().from(projectCurrencyLedger);
  const conditions: SQL[] = [];
  const safeLimit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const safeOffset = Math.max(0, options?.offset ?? 0);

  if (options?.userId) conditions.push(eq(projectCurrencyLedger.userId, options.userId));
  if (options?.walletId) conditions.push(eq(projectCurrencyLedger.walletId, options.walletId));
  if (options?.type) conditions.push(eq(projectCurrencyLedger.type, options.type as CurrencyLedgerType));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query
    .orderBy(desc(projectCurrencyLedger.createdAt))
    .limit(safeLimit)
    .offset(safeOffset);
}

// ==================== ATOMIC OPERATIONS ====================

export async function convertToProjectCurrencyAtomic(userId: string, baseCurrencyAmount: string): Promise<{ success: boolean; conversion?: ProjectCurrencyConversion; error?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const settings = await getProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return { success: false, error: 'Project currency is not active' };
      }

      const amount = parsePositiveAmount(baseCurrencyAmount);
      if (amount === null) {
        return { success: false, error: 'Invalid conversion amount' };
      }

      const minConversionAmount = parseFiniteAmount(settings.minConversionAmount);
      const maxConversionAmount = parseFiniteAmount(settings.maxConversionAmount);
      const dailyLimitPerUser = parseFiniteAmount(settings.dailyConversionLimitPerUser);
      const exchangeRate = parseFiniteAmount(settings.exchangeRate);
      const commissionRate = parseFiniteAmount(settings.conversionCommissionRate);

      if (
        minConversionAmount === null ||
        maxConversionAmount === null ||
        dailyLimitPerUser === null ||
        exchangeRate === null ||
        commissionRate === null ||
        minConversionAmount < 0 ||
        maxConversionAmount <= 0 ||
        dailyLimitPerUser <= 0 ||
        exchangeRate <= 0 ||
        commissionRate < 0
      ) {
        return { success: false, error: 'Invalid project currency settings' };
      }

      if (amount < minConversionAmount) {
        return { success: false, error: `Minimum conversion is ${settings.minConversionAmount}` };
      }
      if (amount > maxConversionAmount) {
        return { success: false, error: `Maximum conversion is ${settings.maxConversionAmount}` };
      }

      // Serialize conversion checks and debits per user to prevent daily-limit race conditions.
      const [userRow] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!userRow) {
        return { success: false, error: 'User not found' };
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [dailyTotalResult] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${projectCurrencyConversions.baseCurrencyAmount} AS DECIMAL)), 0)`,
        })
        .from(projectCurrencyConversions)
        .where(and(
          eq(projectCurrencyConversions.userId, userId),
          gte(projectCurrencyConversions.createdAt, today),
          ne(projectCurrencyConversions.status, 'rejected'),
        ));

      const dailyTotalValue = parseFiniteAmount(dailyTotalResult?.total?.toString() || '0');
      if (dailyTotalValue === null) {
        return { success: false, error: 'Unable to validate daily conversion total' };
      }

      const newDailyTotal = dailyTotalValue + amount;
      if (newDailyTotal > dailyLimitPerUser) {
        return { success: false, error: 'Daily conversion limit exceeded' };
      }

      const [debitedUser] = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(users.id, userId),
          gte(users.balance, sql`${amount}`),
        ))
        .returning({ id: users.id });

      if (!debitedUser) {
        return { success: false, error: 'Insufficient balance' };
      }

      const grossAmount = amount * exchangeRate;
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      const [conversion] = await tx.insert(projectCurrencyConversions).values({
        userId,
        baseCurrencyAmount: amount.toFixed(2),
        projectCurrencyAmount: grossAmount.toFixed(2),
        exchangeRateUsed: settings.exchangeRate,
        commissionAmount: commissionAmount.toFixed(2),
        netAmount: netAmount.toFixed(2),
        status: settings.approvalMode === 'automatic' ? 'completed' : 'pending',
      }).returning();

      if (settings.approvalMode === 'automatic') {
        await tx.insert(projectCurrencyWallets).values({ userId }).onConflictDoNothing();

        const [wallet] = await tx
          .select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, userId))
          .for('update');

        if (!wallet) {
          return { success: false, error: 'Project currency wallet not found' };
        }

        const walletTotalBalance = parseFiniteAmount(wallet.totalBalance || '0');
        if (walletTotalBalance === null) {
          return { success: false, error: 'Invalid wallet balance state' };
        }

        await tx
          .update(projectCurrencyWallets)
          .set({
            purchasedBalance: sql`${projectCurrencyWallets.purchasedBalance} + ${netAmount}`,
            totalBalance: sql`${projectCurrencyWallets.totalBalance} + ${netAmount}`,
            totalConverted: sql`${projectCurrencyWallets.totalConverted} + ${netAmount}`,
            updatedAt: new Date(),
          })
          .where(eq(projectCurrencyWallets.id, wallet.id));

        await tx.insert(projectCurrencyLedger).values({
          userId,
          walletId: wallet.id,
          type: 'conversion',
          amount: netAmount.toFixed(2),
          balanceBefore: walletTotalBalance.toFixed(2),
          balanceAfter: (walletTotalBalance + netAmount).toFixed(2),
          referenceId: conversion.id,
          referenceType: 'conversion',
          description: `Converted ${amount} to project currency`,
        });

        await tx
          .update(projectCurrencyConversions)
          .set({ completedAt: new Date() })
          .where(eq(projectCurrencyConversions.id, conversion.id));
      }

      return { success: true, conversion };
    });
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function spendProjectCurrencyAtomic(userId: string, amount: string, type: string, referenceId?: string, description?: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const spendAmount = parsePositiveAmount(amount);
      if (spendAmount === null) {
        return { success: false, error: 'Invalid amount' };
      }

      const [wallet] = await tx
        .select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, userId))
        .for('update');

      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      const walletTotalBalance = parseFiniteAmount(wallet.totalBalance || '0');
      const earnedBalance = parseFiniteAmount(wallet.earnedBalance || '0');
      const purchasedBalance = parseFiniteAmount(wallet.purchasedBalance || '0');
      const totalSpent = parseFiniteAmount(wallet.totalSpent || '0');

      if (
        walletTotalBalance === null ||
        earnedBalance === null ||
        purchasedBalance === null ||
        totalSpent === null
      ) {
        return { success: false, error: 'Invalid wallet balance state' };
      }

      if (spendAmount > walletTotalBalance) {
        return { success: false, error: 'Insufficient project currency balance' };
      }

      let fromEarned = Math.min(earnedBalance, spendAmount);
      let fromPurchased = spendAmount - fromEarned;

      const newEarnedBalance = earnedBalance - fromEarned;
      const newPurchasedBalance = purchasedBalance - fromPurchased;
      const newTotalBalance = walletTotalBalance - spendAmount;
      const newTotalSpent = totalSpent + spendAmount;

      const [updatedWallet] = await tx
        .update(projectCurrencyWallets)
        .set({
          earnedBalance: newEarnedBalance.toFixed(2),
          purchasedBalance: newPurchasedBalance.toFixed(2),
          totalBalance: newTotalBalance.toFixed(2),
          totalSpent: newTotalSpent.toFixed(2),
          updatedAt: new Date(),
        })
        .where(and(
          eq(projectCurrencyWallets.id, wallet.id),
          gte(projectCurrencyWallets.totalBalance, sql`${spendAmount}`),
        ))
        .returning({ id: projectCurrencyWallets.id });

      if (!updatedWallet) {
        return { success: false, error: 'Insufficient project currency balance' };
      }

      await tx.insert(projectCurrencyLedger).values({
        userId,
        walletId: wallet.id,
        type: type as CurrencyLedgerType,
        amount: (-spendAmount).toFixed(2),
        balanceBefore: walletTotalBalance.toFixed(2),
        balanceAfter: newTotalBalance.toFixed(2),
        referenceId,
        referenceType: type,
        description,
      });

      return { success: true };
    });
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function earnProjectCurrencyAtomic(userId: string, amount: string, type: string, referenceId?: string, description?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const earnAmount = parsePositiveAmount(amount);
    if (earnAmount === null) {
      return { success: false, error: 'Invalid amount' };
    }

    return await db.transaction(async (tx) => {
      await tx.insert(projectCurrencyWallets).values({ userId }).onConflictDoNothing();

      const [wallet] = await tx
        .select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, userId))
        .for('update');

      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      const walletTotalBalance = parseFiniteAmount(wallet.totalBalance || '0');
      const walletEarnedBalance = parseFiniteAmount(wallet.earnedBalance || '0');
      const walletTotalEarned = parseFiniteAmount(wallet.totalEarned || '0');
      if (walletTotalBalance === null || walletEarnedBalance === null || walletTotalEarned === null) {
        return { success: false, error: 'Invalid wallet balance state' };
      }

      const newEarnedBalance = walletEarnedBalance + earnAmount;
      const newTotalBalance = walletTotalBalance + earnAmount;
      const newTotalEarned = walletTotalEarned + earnAmount;

      await tx
        .update(projectCurrencyWallets)
        .set({
          earnedBalance: newEarnedBalance.toFixed(2),
          totalBalance: newTotalBalance.toFixed(2),
          totalEarned: newTotalEarned.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(projectCurrencyWallets.id, wallet.id));

      await tx.insert(projectCurrencyLedger).values({
        userId,
        walletId: wallet.id,
        type: type as CurrencyLedgerType,
        amount: earnAmount.toFixed(2),
        balanceBefore: walletTotalBalance.toFixed(2),
        balanceAfter: newTotalBalance.toFixed(2),
        referenceId,
        referenceType: type,
        description,
      });

      return { success: true };
    });
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
