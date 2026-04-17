import { users, transactions, type User } from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";

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

// ==================== BALANCE OPERATIONS ====================

export async function updateUserBalance(id: string, amount: string, operation: 'add' | 'subtract'): Promise<User | undefined> {
  // ATOMIC balance update using SQL to prevent race conditions
  const changeAmount = parsePositiveAmount(amount);
  if (changeAmount === null) {
    throw new Error('Invalid amount');
  }

  if (operation === 'subtract') {
    // Use safe version with negative balance protection
    const result = await updateUserBalanceWithCheck(id, amount, 'subtract');
    if (!result.success) {
      throw new Error(result.error || 'Insufficient balance');
    }
    return result.user;
  }

  // Add operation — safe (can't go negative by adding)
  const [updated] = await db.update(users)
    .set({
      balance: sql`CAST(CAST(${users.balance} AS DECIMAL) + ${changeAmount} AS TEXT)`,
      updatedAt: new Date()
    })
    .where(eq(users.id, id))
    .returning();

  return updated || undefined;
}

// Atomic balance update with minimum balance check (prevents negative balance)
export async function updateUserBalanceWithCheck(id: string, amount: string, operation: 'add' | 'subtract'): Promise<{ success: boolean; user?: User; error?: string }> {
  const changeAmount = parsePositiveAmount(amount);
  if (changeAmount === null) {
    return { success: false, error: 'Invalid amount' };
  }

  return await db.transaction(async (tx) => {
    // Lock the row for update
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, id))
      .for('update');

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const currentBalance = parseFiniteAmount(user.balance);
    if (currentBalance === null) {
      return { success: false, error: 'Invalid stored balance state' };
    }

    if (operation === 'subtract' && currentBalance < changeAmount) {
      return { success: false, error: 'Insufficient balance' };
    }

    const newBalance = operation === 'add'
      ? (currentBalance + changeAmount).toFixed(2)
      : (currentBalance - changeAmount).toFixed(2);

    const [updated] = await tx.update(users)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return { success: true, user: updated as User };
  });
}

// Transactional transfer between two users (for game payouts, gifts, P2P)
export async function transferBalance(
  fromUserId: string,
  toUserId: string,
  amount: string,
  options?: {
    createTransactionRecords?: boolean;
    transactionType?: 'game_payout' | 'gift' | 'p2p_transfer';
    description?: string;
    sessionId?: string;
  }
): Promise<{ success: boolean; fromUser?: User; toUser?: User; error?: string }> {
  // SECURITY: Prevent self-transfers which could corrupt balance
  if (fromUserId === toUserId) {
    return { success: false, error: 'Cannot transfer to self' };
  }

  const transferAmount = parsePositiveAmount(amount);
  if (transferAmount === null) {
    return { success: false, error: 'Invalid amount' };
  }

  return await db.transaction(async (tx) => {
    // Lock both rows in consistent order to prevent deadlocks
    const [fromId, toId] = [fromUserId, toUserId].sort();

    const [user1] = await tx.select().from(users).where(eq(users.id, fromId)).for('update');
    const [user2] = await tx.select().from(users).where(eq(users.id, toId)).for('update');

    const fromUser = fromId === fromUserId ? user1 : user2;
    const toUser = fromId === fromUserId ? user2 : user1;

    if (!fromUser || !toUser) {
      return { success: false, error: 'User not found' };
    }

    const fromBalance = parseFiniteAmount(fromUser.balance);
    const toBalance = parseFiniteAmount(toUser.balance);

    if (fromBalance === null || toBalance === null) {
      return { success: false, error: 'Invalid stored balance state' };
    }

    if (fromBalance < transferAmount) {
      return { success: false, error: 'Insufficient balance' };
    }

    const fromNewBalance = (fromBalance - transferAmount).toFixed(2);
    const toNewBalance = (toBalance + transferAmount).toFixed(2);

    // Update balances atomically
    const [updatedFrom] = await tx.update(users)
      .set({ balance: fromNewBalance, updatedAt: new Date() })
      .where(eq(users.id, fromUserId))
      .returning();

    const [updatedTo] = await tx.update(users)
      .set({ balance: toNewBalance, updatedAt: new Date() })
      .where(eq(users.id, toUserId))
      .returning();

    // Optionally create transaction records for audit trail
    if (options?.createTransactionRecords) {
      await tx.insert(transactions).values({
        userId: fromUserId,
        type: 'withdrawal',
        amount: transferAmount.toFixed(2),
        balanceBefore: fromBalance.toFixed(2),
        balanceAfter: fromNewBalance,
        status: 'completed',
        description: options.description || `Transfer to user ${toUserId}`,
        processedAt: new Date()
      });

      await tx.insert(transactions).values({
        userId: toUserId,
        type: 'deposit',
        amount: transferAmount.toFixed(2),
        balanceBefore: toBalance.toFixed(2),
        balanceAfter: toNewBalance,
        status: 'completed',
        description: options.description || `Transfer from user ${fromUserId}`,
        processedAt: new Date()
      });
    }

    return { success: true, fromUser: updatedFrom as User, toUser: updatedTo as User };
  });
}
