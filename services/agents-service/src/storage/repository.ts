import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  agents,
  agentWallets,
  agentWalletTransactions,
  type Agent,
  type AgentWallet,
  users,
} from "@shared/schema";
import { db } from "../db";

export interface AgentListFilters {
  isActive?: boolean;
  isOnline?: boolean;
  defaultCurrency?: string;
  search?: string; // matches agent code or username
  limit?: number;
  offset?: number;
}

export interface AgentWithUser extends Agent {
  username: string | null;
  email: string | null;
}

export async function listAgents(filters: AgentListFilters = {}): Promise<AgentWithUser[]> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const conditions = [] as ReturnType<typeof eq>[];
  if (filters.isActive !== undefined) conditions.push(eq(agents.isActive, filters.isActive));
  if (filters.isOnline !== undefined) conditions.push(eq(agents.isOnline, filters.isOnline));
  if (filters.defaultCurrency) conditions.push(eq(agents.defaultCurrency, filters.defaultCurrency));

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ agent: agents, username: users.username, email: users.email })
    .from(agents)
    .leftJoin(users, eq(agents.userId, users.id))
    .where(where)
    .orderBy(desc(agents.createdAt))
    .limit(limit)
    .offset(offset);

  let result = rows.map((r) => ({ ...r.agent, username: r.username, email: r.email }));

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (a) =>
        a.agentCode.toLowerCase().includes(q) ||
        (a.username ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q),
    );
  }

  return result;
}

export async function getAgentById(id: string): Promise<AgentWithUser | null> {
  const rows = await db
    .select({ agent: agents, username: users.username, email: users.email })
    .from(agents)
    .leftJoin(users, eq(agents.userId, users.id))
    .where(eq(agents.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return { ...rows[0].agent, username: rows[0].username, email: rows[0].email };
}

export async function getAgentByCode(code: string): Promise<Agent | null> {
  const rows = await db.select().from(agents).where(eq(agents.agentCode, code)).limit(1);
  return rows[0] ?? null;
}

export async function getAgentByUserId(userId: string): Promise<Agent | null> {
  const rows = await db.select().from(agents).where(eq(agents.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export interface AgentStatsPeriod {
  totalDeposits: number;
  totalWithdrawals: number;
  totalCommission: number;
  approvedCount: number;
  rejectedCount: number;
}

export interface AgentStatsResponse {
  today: AgentStatsPeriod;
  week: AgentStatsPeriod;
  month: AgentStatsPeriod;
}

export async function getAgentStats(agentId: string): Promise<AgentStatsResponse> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(startOfMonth.getDate() - 30);

  async function aggregate(since: Date): Promise<AgentStatsPeriod> {
    const ledger = await db
      .select({ type: agentWalletTransactions.type, amount: agentWalletTransactions.amount })
      .from(agentWalletTransactions)
      .where(
        and(
          eq(agentWalletTransactions.agentId, agentId),
          gte(agentWalletTransactions.createdAt, since),
        ),
      );

    let deposits = 0;
    let withdrawals = 0;
    let commission = 0;
    let approved = 0;
    let rejected = 0;

    for (const row of ledger) {
      const amt = Math.abs(Number(row.amount));
      if (row.type === "deposit_user_credit") {
        deposits += amt;
        approved += 1;
      } else if (row.type === "withdraw_user_debit") {
        withdrawals += amt;
        approved += 1;
      } else if (row.type === "commission_earned") {
        commission += Number(row.amount);
      } else if (row.type === "complaint_refund" || row.type === "complaint_penalty") {
        rejected += 1;
      }
    }

    return {
      totalDeposits: Math.round(deposits * 100) / 100,
      totalWithdrawals: Math.round(withdrawals * 100) / 100,
      totalCommission: Math.round(commission * 100) / 100,
      approvedCount: approved,
      rejectedCount: rejected,
    };
  }

  const [today, week, month] = await Promise.all([
    aggregate(startOfToday),
    aggregate(startOfWeek),
    aggregate(startOfMonth),
  ]);

  return { today, week, month };
}

export async function setAgentActive(
  agentId: string,
  isActive: boolean,
  reason?: string,
): Promise<Agent | null> {
  const updates: Partial<typeof agents.$inferInsert> = {
    isActive,
    updatedAt: new Date(),
  };
  if (!isActive) {
    updates.suspendedAt = new Date();
    updates.suspendedReason = reason ?? "manual_suspension";
    updates.isOnline = false;
  } else {
    updates.suspendedAt = null;
    updates.suspendedReason = null;
  }

  const rows = await db.update(agents).set(updates).where(eq(agents.id, agentId)).returning();
  return rows[0] ?? null;
}

export type AgentUpdatableFields = Partial<
  Pick<
    typeof agents.$inferInsert,
    | "commissionRateDeposit"
    | "commissionRateWithdraw"
    | "commissionFixedDeposit"
    | "commissionFixedWithdraw"
    | "dailyLimit"
    | "monthlyLimit"
    | "balanceWarnThreshold"
    | "balanceFreezeThreshold"
    | "balanceMinThreshold"
    | "maxConcurrentRequests"
    | "trafficWeight"
    | "allowedCurrencies"
    | "defaultCurrency"
    | "awayMode"
  >
>;

export async function updateAgent(
  agentId: string,
  fields: AgentUpdatableFields,
): Promise<Agent | null> {
  if (Object.keys(fields).length === 0) {
    const existing = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    return existing[0] ?? null;
  }
  const rows = await db
    .update(agents)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(agents.id, agentId))
    .returning();
  return rows[0] ?? null;
}

// Suppress unused-import noise (asc, inArray, sql) — re-exported for future use.
export { asc, inArray, sql };
