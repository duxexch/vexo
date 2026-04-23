import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  chatMessages,
  chatSettings,
  projectCurrencyLedger,
  projectCurrencyWallets,
  userRelationships,
} from "@shared/schema";

const DEFAULT_STRANGER_UNLOCK_FEE_VXC = 1.0;

const num = (s?: string | null, fallback = 0): number => {
  const n = Number.parseFloat(s ?? "");
  return Number.isFinite(n) ? n : fallback;
};
const money = (n: number): string => n.toFixed(2);

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(chatSettings).where(eq(chatSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export interface ChatPricingConfig {
  strangerUnlockEnabled: boolean;
  strangerUnlockFeeVxc: number;
  friendsAlwaysFree: boolean;
}

export async function getChatPricingConfig(): Promise<ChatPricingConfig> {
  const [enabledRaw, feeRaw, friendsFreeRaw] = await Promise.all([
    getSetting("chat_stranger_unlock_enabled"),
    getSetting("chat_stranger_unlock_fee_vxc"),
    getSetting("chat_friends_always_free"),
  ]);

  return {
    strangerUnlockEnabled: enabledRaw === null ? true : enabledRaw === "1" || enabledRaw === "true",
    strangerUnlockFeeVxc: num(feeRaw, DEFAULT_STRANGER_UNLOCK_FEE_VXC),
    friendsAlwaysFree: friendsFreeRaw === null ? true : friendsFreeRaw === "1" || friendsFreeRaw === "true",
  };
}

/**
 * Friendship is mutual follow (matches server/routes/social/search.ts logic).
 */
export async function areMutualFriends(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return true;
  const rows = await db
    .select({ userId: userRelationships.userId, targetUserId: userRelationships.targetUserId })
    .from(userRelationships)
    .where(and(
      eq(userRelationships.type, "follow"),
      or(
        and(eq(userRelationships.userId, userA), eq(userRelationships.targetUserId, userB)),
        and(eq(userRelationships.userId, userB), eq(userRelationships.targetUserId, userA)),
      ),
    ));
  return rows.length >= 2;
}

/**
 * Returns true if there is any prior message between the two users (any direction).
 * Used to detect "first contact" so the unlock fee is charged at most once per pair.
 */
export async function hasPriorChatHistory(userA: string, userB: string): Promise<boolean> {
  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(or(
      and(eq(chatMessages.senderId, userA), eq(chatMessages.receiverId, userB)),
      and(eq(chatMessages.senderId, userB), eq(chatMessages.receiverId, userA)),
    ))
    .limit(1);
  return Boolean(row);
}

/**
 * Stable pair-keyed advisory lock signature so two concurrent unlock attempts
 * on the same (sender, receiver) pair are serialized inside a tx.
 * `pg_advisory_xact_lock(int8)` accepts a single bigint; we hash a sorted-pair
 * string into 64 bits using sha256.
 */
function chatUnlockReferenceId(senderId: string, receiverId: string): string {
  // Direction-aware: only the sender pays. Marker survives in the ledger.
  return `chat_unlock:${senderId}->${receiverId}`;
}

export type StrangerUnlockResult =
  | { kind: "free" }
  | { kind: "already_unlocked" }
  | { kind: "charged"; amount: number; newBalance: number }
  | { kind: "needs_unlock"; amount: number; balance: number }
  | { kind: "insufficient_balance"; required: number; balance: number };

/**
 * Apply the stranger-DM unlock fee policy.
 *
 * - If sender and receiver are friends: free.
 * - If a prior message between them exists: already unlocked, free.
 * - If `confirm=false`: returns `needs_unlock` (the client should show a confirm dialog).
 * - If `confirm=true`: charges the sender's project-currency wallet atomically.
 */
export async function applyStrangerUnlockFee(opts: {
  senderId: string;
  receiverId: string;
  confirm: boolean;
}): Promise<StrangerUnlockResult> {
  const { senderId, receiverId, confirm } = opts;
  const config = await getChatPricingConfig();

  if (!config.strangerUnlockEnabled) return { kind: "free" };
  if (config.strangerUnlockFeeVxc <= 0) return { kind: "free" };

  if (config.friendsAlwaysFree && (await areMutualFriends(senderId, receiverId))) {
    return { kind: "free" };
  }

  if (await hasPriorChatHistory(senderId, receiverId)) {
    return { kind: "already_unlocked" };
  }

  // Stranger first-contact path
  const fee = config.strangerUnlockFeeVxc;
  const refId = chatUnlockReferenceId(senderId, receiverId);

  if (!confirm) {
    // Read balance for UX preview without charging
    const [wallet] = await db.select().from(projectCurrencyWallets)
      .where(eq(projectCurrencyWallets.userId, senderId)).limit(1);
    const balance = wallet ? num(wallet.totalBalance) : 0;
    return { kind: "needs_unlock", amount: fee, balance };
  }

  // Charge atomically. Use a pair-keyed advisory lock to serialize concurrent
  // first-contact attempts, and re-check inside the tx that no prior unlock
  // ledger entry exists (idempotency guard).
  return await db.transaction(async (tx) => {
    // Pair-stable bigint lock key (deterministic hash of sorted pair).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(
      ('x' || substr(md5(${[senderId, receiverId].sort().join('|')}), 1, 16))::bit(64)::bigint
    )`);

    // Idempotency: if an unlock ledger entry already exists for this pair, no-op.
    const existing = await tx.execute<{ id: string }>(sql`
      SELECT id FROM project_currency_ledger
      WHERE reference_id = ${refId}
        AND reference_type = 'chat_stranger_unlock'
      LIMIT 1
    `);
    const existingArr = Array.isArray(existing) ? existing : ((existing as { rows?: unknown[] }).rows || []);
    if (existingArr.length > 0) {
      return { kind: "already_unlocked" } as StrangerUnlockResult;
    }

    // Re-check chat history inside the tx; concurrent insert may have just
    // landed, in which case the conversation is already free.
    const priorRow = await tx.execute<{ id: string }>(sql`
      SELECT id FROM chat_messages
      WHERE (sender_id = ${senderId} AND receiver_id = ${receiverId})
         OR (sender_id = ${receiverId} AND receiver_id = ${senderId})
      LIMIT 1
    `);
    const priorArr = Array.isArray(priorRow) ? priorRow : ((priorRow as { rows?: unknown[] }).rows || []);
    if (priorArr.length > 0) {
      return { kind: "already_unlocked" } as StrangerUnlockResult;
    }

    await tx.execute(sql`
      INSERT INTO project_currency_wallets (user_id)
      VALUES (${senderId})
      ON CONFLICT (user_id) DO NOTHING
    `);

    const [wallet] = await tx.select().from(projectCurrencyWallets)
      .where(eq(projectCurrencyWallets.userId, senderId)).for("update");
    if (!wallet) throw new Error("wallet_not_found");

    let earned = num(wallet.earnedBalance);
    let purchased = num(wallet.purchasedBalance);
    const total = earned + purchased;
    if (total < fee) {
      return { kind: "insufficient_balance", required: fee, balance: total };
    }

    let remaining = fee;
    if (earned >= remaining) {
      earned = +(earned - remaining).toFixed(2);
      remaining = 0;
    } else {
      remaining = +(remaining - earned).toFixed(2);
      earned = 0;
      purchased = Math.max(0, +(purchased - remaining).toFixed(2));
    }
    const balanceBefore = num(wallet.totalBalance);
    const balanceAfter = +(earned + purchased).toFixed(2);

    await tx.update(projectCurrencyWallets).set({
      earnedBalance: money(earned),
      purchasedBalance: money(purchased),
      totalBalance: money(balanceAfter),
      totalSpent: money(num(wallet.totalSpent) + fee),
      updatedAt: new Date(),
    }).where(eq(projectCurrencyWallets.id, wallet.id));

    await tx.insert(projectCurrencyLedger).values({
      userId: senderId,
      walletId: wallet.id,
      type: "admin_adjustment",
      amount: (-fee).toFixed(2),
      balanceBefore: money(balanceBefore),
      balanceAfter: money(balanceAfter),
      referenceId: refId,
      referenceType: "chat_stranger_unlock",
      description: "Stranger DM unlock fee",
    });

    return { kind: "charged", amount: fee, newBalance: balanceAfter };
  });
}
