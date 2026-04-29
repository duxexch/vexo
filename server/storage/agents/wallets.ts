import { and, desc, eq, sql } from "drizzle-orm";
import {
  agentWallets,
  agentWalletTransactions,
  agents,
  type AgentLedgerType,
  type AgentWallet,
  type AgentWalletTransaction,
} from "@shared/schema";
import { db } from "../../db";

type AnyTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface LedgerEntryInput {
  agentId: string;
  currency: string;
  type: AgentLedgerType;
  /** Signed amount: positive = credit, negative = debit. */
  amount: number;
  refType?: string;
  refId?: string;
  note?: string;
  createdByUserId?: string | null;
}

export interface LedgerResult {
  wallet: AgentWallet;
  ledger: AgentWalletTransaction;
}

/**
 * Ensure the (agentId, currency) wallet exists. Returns existing or newly
 * created. Always called inside the same tx as the mutation it precedes.
 */
export async function ensureAgentWallet(
  tx: AnyTx,
  agentId: string,
  currency: string,
): Promise<AgentWallet> {
  const existing = await tx
    .select()
    .from(agentWallets)
    .where(and(eq(agentWallets.agentId, agentId), eq(agentWallets.currency, currency)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const inserted = await tx
    .insert(agentWallets)
    .values({ agentId, currency })
    .returning();
  return inserted[0];
}

/**
 * Apply a signed ledger entry to the (agentId, currency) wallet inside a
 * transaction. The caller is responsible for opening the tx so that the
 * ledger entry, balance update, and any sibling business mutation (e.g.
 * deposit_request status change) commit atomically.
 *
 * For debits (amount < 0) the call rejects when the wallet would go below
 * zero. Top-up and credit entries never block.
 */
export async function applyLedgerEntry(
  tx: AnyTx,
  input: LedgerEntryInput,
): Promise<LedgerResult> {
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("ledger amount must be a non-zero finite number");
  }

  const wallet = await ensureAgentWallet(tx, input.agentId, input.currency);
  const balanceBefore = Number(wallet.balance);
  const balanceAfter = balanceBefore + input.amount;

  if (input.amount < 0 && balanceAfter < 0) {
    const err = new Error(
      `insufficient agent balance: have ${balanceBefore.toFixed(2)} ${input.currency}, need ${Math.abs(input.amount).toFixed(2)}`,
    );
    (err as Error & { code?: string }).code = "AGENT_INSUFFICIENT_BALANCE";
    throw err;
  }

  const isCredit = input.amount > 0;
  const totalCreditedDelta = isCredit ? input.amount : 0;
  const totalDebitedDelta = isCredit ? 0 : Math.abs(input.amount);

  const updated = await tx
    .update(agentWallets)
    .set({
      balance: sql`CAST(CAST(${agentWallets.balance} AS DECIMAL) + ${input.amount} AS TEXT)`,
      totalCredited: sql`CAST(CAST(${agentWallets.totalCredited} AS DECIMAL) + ${totalCreditedDelta} AS TEXT)`,
      totalDebited: sql`CAST(CAST(${agentWallets.totalDebited} AS DECIMAL) + ${totalDebitedDelta} AS TEXT)`,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentWallets.id, wallet.id))
    .returning();

  const ledger = await tx
    .insert(agentWalletTransactions)
    .values({
      agentId: input.agentId,
      walletId: wallet.id,
      currency: input.currency,
      type: input.type,
      amount: input.amount.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  // Mirror the default-currency wallet onto agents.currentBalance so
  // existing dashboard widgets keep working without joining agent_wallets.
  const agentRow = await tx
    .select({ defaultCurrency: agents.defaultCurrency })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);

  if (agentRow[0]?.defaultCurrency === input.currency) {
    await tx
      .update(agents)
      .set({
        currentBalance: balanceAfter.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, input.agentId));
  }

  return { wallet: updated[0], ledger: ledger[0] };
}

/**
 * Convenience: top-up the agent wallet (e.g. agent deposits operating
 * capital) — always a positive credit.
 */
export async function topUpAgentWallet(
  tx: AnyTx,
  args: { agentId: string; currency: string; amount: number; note?: string; createdByUserId?: string | null },
): Promise<LedgerResult> {
  if (args.amount <= 0) throw new Error("top-up amount must be > 0");
  return applyLedgerEntry(tx, {
    agentId: args.agentId,
    currency: args.currency,
    type: "agent_topup",
    amount: args.amount,
    note: args.note,
    createdByUserId: args.createdByUserId,
  });
}

/** Admin-side balance adjustment with a written reason; recorded in ledger. */
export async function adminAdjustAgentWallet(
  tx: AnyTx,
  args: {
    agentId: string;
    currency: string;
    amount: number; // signed
    reason: string;
    adminUserId: string;
  },
): Promise<LedgerResult> {
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("adjustment reason is required (min 3 chars)");
  }
  const type: AgentLedgerType = args.amount >= 0 ? "admin_adjust_credit" : "admin_adjust_debit";
  return applyLedgerEntry(tx, {
    agentId: args.agentId,
    currency: args.currency,
    type,
    amount: args.amount,
    note: args.reason,
    createdByUserId: args.adminUserId,
  });
}

export async function listAgentWallets(agentId: string): Promise<AgentWallet[]> {
  return db.select().from(agentWallets).where(eq(agentWallets.agentId, agentId));
}

export async function listAgentLedger(
  agentId: string,
  opts: { limit?: number; offset?: number; currency?: string } = {},
): Promise<AgentWalletTransaction[]> {
  const limit = Math.min(opts.limit ?? 50, 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = opts.currency
    ? and(eq(agentWalletTransactions.agentId, agentId), eq(agentWalletTransactions.currency, opts.currency))
    : eq(agentWalletTransactions.agentId, agentId);

  return db
    .select()
    .from(agentWalletTransactions)
    .where(where)
    .orderBy(desc(agentWalletTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}
