import {
  projectCurrencyConversions, projectCurrencyLedger,
  type ProjectCurrencyConversion,
  type ProjectCurrencyLedger as ProjectCurrencyLedgerType, type InsertProjectCurrencyLedger,
  type CurrencyLedgerType,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, sql, type SQL } from "drizzle-orm";
import { getErrorMessage } from "../helpers";
import { getProjectCurrencySettings } from "./settings";
import { getProjectCurrencyWallet, getOrCreateProjectCurrencyWallet } from "./wallets";
import { getUserDailyConversionTotal } from "./conversions";

// ==================== LEDGER ====================

export async function createProjectCurrencyLedgerEntry(entry: InsertProjectCurrencyLedger): Promise<ProjectCurrencyLedgerType> {
  const [created] = await db.insert(projectCurrencyLedger).values(entry).returning();
  return created;
}

export async function getProjectCurrencyLedger(options?: { userId?: string; walletId?: string; type?: string; limit?: number; offset?: number }): Promise<ProjectCurrencyLedgerType[]> {
  let query = db.select().from(projectCurrencyLedger);
  const conditions: SQL[] = [];
  
  if (options?.userId) conditions.push(eq(projectCurrencyLedger.userId, options.userId));
  if (options?.walletId) conditions.push(eq(projectCurrencyLedger.walletId, options.walletId));
  if (options?.type) conditions.push(eq(projectCurrencyLedger.type, options.type as CurrencyLedgerType));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  
  return query
    .orderBy(desc(projectCurrencyLedger.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);
}

// ==================== ATOMIC OPERATIONS ====================

export async function convertToProjectCurrencyAtomic(userId: string, baseCurrencyAmount: string): Promise<{ success: boolean; conversion?: ProjectCurrencyConversion; error?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const settings = await getProjectCurrencySettings();
      if (!settings || !settings.isActive) {
        return { success: false, error: 'Project currency is not active' };
      }

      const amount = parseFloat(baseCurrencyAmount);
      if (amount < parseFloat(settings.minConversionAmount)) {
        return { success: false, error: `Minimum conversion is ${settings.minConversionAmount}` };
      }
      if (amount > parseFloat(settings.maxConversionAmount)) {
        return { success: false, error: `Maximum conversion is ${settings.maxConversionAmount}` };
      }

      const dailyTotal = await getUserDailyConversionTotal(userId);
      const newDailyTotal = parseFloat(dailyTotal) + amount;
      if (newDailyTotal > parseFloat(settings.dailyConversionLimitPerUser)) {
        return { success: false, error: 'Daily conversion limit exceeded' };
      }

      const lockQueryResult = await tx.execute(sql`
        UPDATE users
        SET balance = balance - ${amount}
        WHERE id = ${userId} AND balance >= ${amount}
        RETURNING id
      `);
      const lockResult = (lockQueryResult.rows as Record<string, unknown>[])[0];

      if (!lockResult) {
        return { success: false, error: 'Insufficient balance' };
      }

      const exchangeRate = parseFloat(settings.exchangeRate);
      const commissionRate = parseFloat(settings.conversionCommissionRate);
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
        const wallet = await getOrCreateProjectCurrencyWallet(userId);
        await tx.execute(sql`
          UPDATE project_currency_wallets
          SET 
            purchased_balance = purchased_balance + ${netAmount},
            total_balance = total_balance + ${netAmount},
            total_converted = total_converted + ${netAmount},
            updated_at = NOW()
          WHERE id = ${wallet.id}
        `);

        await tx.insert(projectCurrencyLedger).values({
          userId,
          walletId: wallet.id,
          type: 'conversion',
          amount: netAmount.toFixed(2),
          balanceBefore: wallet.totalBalance,
          balanceAfter: (parseFloat(wallet.totalBalance) + netAmount).toFixed(2),
          referenceId: conversion.id,
          referenceType: 'conversion',
          description: `Converted ${amount} to project currency`,
        });

        await tx.execute(sql`
          UPDATE project_currency_conversions
          SET completed_at = NOW()
          WHERE id = ${conversion.id}
        `);
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
      const wallet = await getProjectCurrencyWallet(userId);
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      const spendAmount = parseFloat(amount);
      if (spendAmount > parseFloat(wallet.totalBalance)) {
        return { success: false, error: 'Insufficient project currency balance' };
      }

      const earnedBalance = parseFloat(wallet.earnedBalance);
      
      let fromEarned = Math.min(earnedBalance, spendAmount);
      let fromPurchased = spendAmount - fromEarned;

      await tx.execute(sql`
        UPDATE project_currency_wallets
        SET 
          earned_balance = earned_balance - ${fromEarned},
          purchased_balance = purchased_balance - ${fromPurchased},
          total_balance = total_balance - ${spendAmount},
          total_spent = total_spent + ${spendAmount},
          updated_at = NOW()
        WHERE id = ${wallet.id}
          AND total_balance >= ${spendAmount}
      `);

      await tx.insert(projectCurrencyLedger).values({
        userId,
        walletId: wallet.id,
        type: type as CurrencyLedgerType,
        amount: (-spendAmount).toFixed(2),
        balanceBefore: wallet.totalBalance,
        balanceAfter: (parseFloat(wallet.totalBalance) - spendAmount).toFixed(2),
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
    const wallet = await getOrCreateProjectCurrencyWallet(userId);
    const earnAmount = parseFloat(amount);

    await db.execute(sql`
      UPDATE project_currency_wallets
      SET 
        earned_balance = earned_balance + ${earnAmount},
        total_balance = total_balance + ${earnAmount},
        total_earned = total_earned + ${earnAmount},
        updated_at = NOW()
      WHERE id = ${wallet.id}
    `);

    await db.insert(projectCurrencyLedger).values({
      userId,
      walletId: wallet.id,
      type: type as CurrencyLedgerType,
      amount: earnAmount.toFixed(2),
      balanceBefore: wallet.totalBalance,
      balanceAfter: (parseFloat(wallet.totalBalance) + earnAmount).toFixed(2),
      referenceId,
      referenceType: type,
      description,
    });

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
