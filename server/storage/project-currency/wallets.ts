import {
  projectCurrencyWallets,
  type ProjectCurrencyWallet,
} from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { getErrorMessage } from "../helpers";

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
  return createProjectCurrencyWallet(userId);
}

// ==================== BALANCE OPERATIONS ====================

export async function updateProjectCurrencyWalletBalance(
  walletId: string, 
  amount: string, 
  operation: 'add' | 'subtract', 
  balanceType: 'purchased' | 'earned'
): Promise<{ success: boolean; wallet?: ProjectCurrencyWallet; error?: string }> {
  const changeAmount = parseFloat(amount);
  if (isNaN(changeAmount) || changeAmount < 0) {
    return { success: false, error: 'Invalid amount' };
  }

  try {
    // SECURITY: Whitelist column names to prevent any future sql.raw() injection
    const balanceColumn = balanceType === 'purchased' ? 'purchased_balance' : 'earned_balance';
    const totalColumn = balanceType === 'purchased' ? 'total_converted' : 'total_earned';
    if (!['purchased_balance', 'earned_balance'].includes(balanceColumn)) {
      return { success: false, error: 'Invalid balance type' };
    }

    if (operation === 'subtract') {
      const queryResult = await db.execute(sql`
        UPDATE project_currency_wallets
        SET 
          ${sql.raw(balanceColumn)} = ${sql.raw(balanceColumn)} - ${changeAmount},
          total_balance = total_balance - ${changeAmount},
          total_spent = total_spent + ${changeAmount},
          updated_at = NOW()
        WHERE id = ${walletId}
          AND ${sql.raw(balanceColumn)} >= ${changeAmount}
        RETURNING *
      `);
      const result = (queryResult.rows as Record<string, unknown>[])[0];
      if (!result) {
        return { success: false, error: 'Insufficient balance' };
      }
      return { success: true, wallet: result as unknown as ProjectCurrencyWallet };
    } else {
      const queryResult = await db.execute(sql`
        UPDATE project_currency_wallets
        SET 
          ${sql.raw(balanceColumn)} = ${sql.raw(balanceColumn)} + ${changeAmount},
          total_balance = total_balance + ${changeAmount},
          ${sql.raw(totalColumn)} = ${sql.raw(totalColumn)} + ${changeAmount},
          updated_at = NOW()
        WHERE id = ${walletId}
        RETURNING *
      `);
      const result = (queryResult.rows as Record<string, unknown>[])[0];
      return { success: true, wallet: result as unknown as ProjectCurrencyWallet };
    }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function lockProjectCurrencyBalance(walletId: string, amount: string): Promise<{ success: boolean; error?: string }> {
  const lockAmount = parseFloat(amount);
  try {
    const result = await db.execute(sql`
      UPDATE project_currency_wallets
      SET 
        total_balance = total_balance - ${lockAmount},
        locked_balance = locked_balance + ${lockAmount},
        updated_at = NOW()
      WHERE id = ${walletId}
        AND total_balance >= ${lockAmount}
      RETURNING id
    `);
    if ((result.rows as unknown[]).length === 0) {
      return { success: false, error: 'Insufficient balance to lock' };
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function unlockProjectCurrencyBalance(walletId: string, amount: string): Promise<{ success: boolean; error?: string }> {
  const unlockAmount = parseFloat(amount);
  try {
    const result = await db.execute(sql`
      UPDATE project_currency_wallets
      SET 
        total_balance = total_balance + ${unlockAmount},
        locked_balance = locked_balance - ${unlockAmount},
        updated_at = NOW()
      WHERE id = ${walletId}
        AND locked_balance >= ${unlockAmount}
      RETURNING id
    `);
    if ((result.rows as unknown[]).length === 0) {
      return { success: false, error: 'Insufficient locked balance' };
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function forfeitLockedProjectCurrencyBalance(walletId: string, amount: string): Promise<{ success: boolean; error?: string }> {
  const forfeitAmount = parseFloat(amount);
  try {
    const result = await db.execute(sql`
      UPDATE project_currency_wallets
      SET 
        locked_balance = locked_balance - ${forfeitAmount},
        updated_at = NOW()
      WHERE id = ${walletId}
        AND locked_balance >= ${forfeitAmount}
      RETURNING id
    `);
    if ((result.rows as unknown[]).length === 0) {
      return { success: false, error: 'Insufficient locked balance to forfeit' };
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
