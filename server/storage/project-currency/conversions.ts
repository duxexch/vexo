import {
  projectCurrencyConversions, projectCurrencyLedger, projectCurrencyWallets, users,
  type ProjectCurrencyConversion, type InsertProjectCurrencyConversion,
  type CurrencyConversionStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, gte, ne, sql, type SQL } from "drizzle-orm";
import { getErrorMessage } from "../helpers";

function parseFiniteAmount(value: string): number | null {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

// ==================== CONVERSIONS ====================

export async function createProjectCurrencyConversion(conversion: InsertProjectCurrencyConversion): Promise<ProjectCurrencyConversion> {
  const [created] = await db.insert(projectCurrencyConversions).values(conversion).returning();
  return created;
}

export async function getProjectCurrencyConversion(id: string): Promise<ProjectCurrencyConversion | undefined> {
  const [conversion] = await db.select().from(projectCurrencyConversions).where(eq(projectCurrencyConversions.id, id));
  return conversion || undefined;
}

export async function listProjectCurrencyConversions(options?: { userId?: string; status?: string; limit?: number }): Promise<ProjectCurrencyConversion[]> {
  let query = db.select().from(projectCurrencyConversions);
  const conditions: SQL[] = [];
  const safeLimit = Math.max(1, Math.min(options?.limit ?? 100, 500));

  if (options?.userId) conditions.push(eq(projectCurrencyConversions.userId, options.userId));
  if (options?.status) conditions.push(eq(projectCurrencyConversions.status, options.status as CurrencyConversionStatus));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query.orderBy(desc(projectCurrencyConversions.createdAt)).limit(safeLimit);
}

export async function updateProjectCurrencyConversion(id: string, data: Partial<ProjectCurrencyConversion>): Promise<ProjectCurrencyConversion | undefined> {
  const [updated] = await db.update(projectCurrencyConversions)
    .set(data)
    .where(eq(projectCurrencyConversions.id, id))
    .returning();
  return updated || undefined;
}

export async function approveProjectCurrencyConversion(conversionId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [conversion] = await tx
        .select()
        .from(projectCurrencyConversions)
        .where(and(
          eq(projectCurrencyConversions.id, conversionId),
          eq(projectCurrencyConversions.status, 'pending'),
        ))
        .for('update');

      if (!conversion) {
        return { success: false, error: 'Conversion not found or already processed' };
      }

      const netAmount = parseFiniteAmount(conversion.netAmount);
      if (netAmount === null || netAmount <= 0) {
        return { success: false, error: 'Invalid conversion net amount' };
      }

      await tx.insert(projectCurrencyWallets).values({ userId: conversion.userId }).onConflictDoNothing();

      const [wallet] = await tx
        .select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, conversion.userId))
        .for('update');

      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
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

      await tx
        .update(projectCurrencyConversions)
        .set({
          status: 'completed',
          approvedById: adminId,
          approvedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(projectCurrencyConversions.id, conversionId));

      await tx.insert(projectCurrencyLedger).values({
        userId: conversion.userId,
        walletId: wallet.id,
        type: 'conversion',
        amount: conversion.netAmount,
        balanceBefore: walletTotalBalance.toFixed(2),
        balanceAfter: (walletTotalBalance + netAmount).toFixed(2),
        referenceId: conversionId,
        referenceType: 'conversion',
        description: `Converted ${conversion.baseCurrencyAmount} to project currency`,
      });

      return { success: true };
    });
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function rejectProjectCurrencyConversion(conversionId: string, adminId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedReason = String(reason || "").trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      return { success: false, error: 'Rejection reason must be between 3 and 500 characters' };
    }

    return await db.transaction(async (tx) => {
      const [conversion] = await tx
        .select()
        .from(projectCurrencyConversions)
        .where(and(
          eq(projectCurrencyConversions.id, conversionId),
          eq(projectCurrencyConversions.status, 'pending'),
        ))
        .for('update');

      if (!conversion) {
        return { success: false, error: 'Conversion not found or already processed' };
      }

      const baseAmount = parseFiniteAmount(conversion.baseCurrencyAmount);
      if (baseAmount === null || baseAmount <= 0) {
        return { success: false, error: 'Invalid conversion base amount' };
      }

      await tx
        .update(users)
        .set({ balance: sql`${users.balance} + ${baseAmount}` })
        .where(eq(users.id, conversion.userId));

      await tx
        .update(projectCurrencyConversions)
        .set({
          status: 'rejected',
          approvedById: adminId,
          rejectionReason: normalizedReason,
        })
        .where(eq(projectCurrencyConversions.id, conversionId));

      return { success: true };
    });
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

// ==================== DAILY TOTALS ====================

export async function getUserDailyConversionTotal(userId: string): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${projectCurrencyConversions.baseCurrencyAmount} AS DECIMAL)), 0)`,
    })
    .from(projectCurrencyConversions)
    .where(and(
      eq(projectCurrencyConversions.userId, userId),
      gte(projectCurrencyConversions.createdAt, today),
      ne(projectCurrencyConversions.status, 'rejected'),
    ));

  return result?.total?.toString() || '0';
}

export async function getPlatformDailyConversionTotal(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${projectCurrencyConversions.baseCurrencyAmount} AS DECIMAL)), 0)`,
    })
    .from(projectCurrencyConversions)
    .where(and(
      gte(projectCurrencyConversions.createdAt, today),
      eq(projectCurrencyConversions.status, 'completed'),
    ));

  return result?.total?.toString() || '0';
}
