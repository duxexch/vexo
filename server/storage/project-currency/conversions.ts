import {
  projectCurrencyConversions, projectCurrencyLedger,
  type ProjectCurrencyConversion, type InsertProjectCurrencyConversion,
  type CurrencyConversionStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, sql, type SQL } from "drizzle-orm";
import { getErrorMessage } from "../helpers";
import { getOrCreateProjectCurrencyWallet } from "./wallets";

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
  
  if (options?.userId) conditions.push(eq(projectCurrencyConversions.userId, options.userId));
  if (options?.status) conditions.push(eq(projectCurrencyConversions.status, options.status as CurrencyConversionStatus));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  
  return query.orderBy(desc(projectCurrencyConversions.createdAt)).limit(options?.limit || 100);
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
      const conversionResult = await tx.execute(sql`
        SELECT * FROM project_currency_conversions 
        WHERE id = ${conversionId} AND status = 'pending'
        FOR UPDATE
      `);
      const conversion = (conversionResult.rows as Record<string, unknown>[])[0];
      
      if (!conversion) {
        return { success: false, error: 'Conversion not found or already processed' };
      }

      const conv = conversion as unknown as ProjectCurrencyConversion;
      const wallet = await getOrCreateProjectCurrencyWallet(conv.userId);

      await tx.execute(sql`
        UPDATE project_currency_wallets
        SET 
          purchased_balance = purchased_balance + ${parseFloat(conv.netAmount)},
          total_balance = total_balance + ${parseFloat(conv.netAmount)},
          total_converted = total_converted + ${parseFloat(conv.netAmount)},
          updated_at = NOW()
        WHERE id = ${wallet.id}
      `);

      await tx.execute(sql`
        UPDATE project_currency_conversions
        SET 
          status = 'completed',
          approved_by_id = ${adminId},
          approved_at = NOW(),
          completed_at = NOW()
        WHERE id = ${conversionId}
      `);

      await tx.insert(projectCurrencyLedger).values({
        userId: conv.userId,
        walletId: wallet.id,
        type: 'conversion',
        amount: conv.netAmount,
        balanceBefore: wallet.totalBalance,
        balanceAfter: (parseFloat(wallet.totalBalance) + parseFloat(conv.netAmount)).toFixed(2),
        referenceId: conversionId,
        referenceType: 'conversion',
        description: `Converted ${conv.baseCurrencyAmount} to project currency`,
      });

      return { success: true };
    });
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function rejectProjectCurrencyConversion(conversionId: string, adminId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const conversionResult = await tx.execute(sql`
        SELECT * FROM project_currency_conversions 
        WHERE id = ${conversionId} AND status = 'pending'
        FOR UPDATE
      `);
      const conversion = (conversionResult.rows as Record<string, unknown>[])[0];
      
      if (!conversion) {
        return { success: false, error: 'Conversion not found or already processed' };
      }

      const conv = conversion as unknown as ProjectCurrencyConversion;

      await tx.execute(sql`
        UPDATE users
        SET balance = balance + ${parseFloat(conv.baseCurrencyAmount)}
        WHERE id = ${conv.userId}
      `);

      await tx.execute(sql`
        UPDATE project_currency_conversions
        SET 
          status = 'rejected',
          approved_by_id = ${adminId},
          rejection_reason = ${reason}
        WHERE id = ${conversionId}
      `);

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
  
  const queryResult = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(base_currency_amount AS DECIMAL)), 0) as total
    FROM project_currency_conversions
    WHERE user_id = ${userId}
      AND created_at >= ${today}
      AND status != 'rejected'
  `);
  const result = (queryResult.rows as Record<string, unknown>[])[0];
  
  return result?.total?.toString() || '0';
}

export async function getPlatformDailyConversionTotal(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const queryResult = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(base_currency_amount AS DECIMAL)), 0) as total
    FROM project_currency_conversions
    WHERE created_at >= ${today}
      AND status = 'completed'
  `);
  const result = (queryResult.rows as Record<string, unknown>[])[0];
  
  return result?.total?.toString() || '0';
}
