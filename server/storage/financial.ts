import {
  transactions, financialLimits,
  agents, agentPaymentMethods, affiliates, promoCodes,
  type Transaction, type InsertTransaction,
  type FinancialLimit, type InsertFinancialLimit,
  type Agent, type InsertAgent,
  type AgentPaymentMethod, type InsertAgentPaymentMethod,
  type Affiliate, type InsertAffiliate,
  type PromoCode, type InsertPromoCode,
  type TransactionType, type TransactionStatus,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, sql } from "drizzle-orm";

// ==================== TRANSACTIONS ====================

export async function getTransaction(id: string): Promise<Transaction | undefined> {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
  return tx || undefined;
}

export async function createTransaction(insertTx: InsertTransaction): Promise<Transaction> {
  const [tx] = await db.insert(transactions).values(insertTx).returning();
  return tx;
}

export async function updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
  const [tx] = await db.update(transactions).set({ ...data, updatedAt: new Date() }).where(eq(transactions.id, id)).returning();
  return tx || undefined;
}

export async function listTransactions(userId?: string, type?: string, status?: string): Promise<Transaction[]> {
  const conditions = [];
  if (userId) conditions.push(eq(transactions.userId, userId));
  if (type) conditions.push(eq(transactions.type, type as TransactionType));
  if (status) conditions.push(eq(transactions.status, status as TransactionStatus));
  
  if (conditions.length > 0) {
    return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.createdAt)).limit(1000);
  }
  return db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(1000);
}

export async function listTransactionsPaginated(userId?: string, type?: string, status?: string, page: number = 1, pageSize: number = 50): Promise<{ data: Transaction[]; total: number }> {
  const conditions = [];
  if (userId) conditions.push(eq(transactions.userId, userId));
  if (type) conditions.push(eq(transactions.type, type as TransactionType));
  if (status) conditions.push(eq(transactions.status, status as TransactionStatus));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(whereClause);
  const total = Number(countResult?.count ?? 0);

  const offset = (page - 1) * pageSize;
  const data = await db.select().from(transactions)
    .where(whereClause)
    .orderBy(desc(transactions.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { data, total };
}

export async function getPendingTransactions(): Promise<Transaction[]> {
  return db.select().from(transactions).where(eq(transactions.status, 'pending')).orderBy(asc(transactions.createdAt));
}

// ==================== AGENTS ====================

export async function getAgent(id: string): Promise<Agent | undefined> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  return agent || undefined;
}

export async function getAgentByUserId(userId: string): Promise<Agent | undefined> {
  const [agent] = await db.select().from(agents).where(eq(agents.userId, userId));
  return agent || undefined;
}

export async function createAgent(insertAgent: InsertAgent): Promise<Agent> {
  const [agent] = await db.insert(agents).values(insertAgent).returning();
  return agent;
}

export async function updateAgent(id: string, data: Partial<InsertAgent>): Promise<Agent | undefined> {
  const [agent] = await db.update(agents).set({ ...data, updatedAt: new Date() }).where(eq(agents.id, id)).returning();
  return agent || undefined;
}

export async function listAgents(activeOnly = false): Promise<Agent[]> {
  if (activeOnly) {
    return db.select().from(agents).where(eq(agents.isActive, true)).orderBy(desc(agents.createdAt));
  }
  return db.select().from(agents).orderBy(desc(agents.createdAt));
}

export async function getAvailableAgentForAssignment(): Promise<Agent | undefined> {
  const [agent] = await db.select().from(agents)
    .where(and(eq(agents.isActive, true), eq(agents.isOnline, true)))
    .orderBy(asc(agents.assignedCustomersCount), desc(agents.performanceScore))
    .limit(1);
  return agent || undefined;
}

// ==================== AGENT PAYMENT METHODS ====================

export async function getAgentPaymentMethods(agentId: string): Promise<AgentPaymentMethod[]> {
  return db.select().from(agentPaymentMethods).where(eq(agentPaymentMethods.agentId, agentId));
}

export async function createAgentPaymentMethod(method: InsertAgentPaymentMethod): Promise<AgentPaymentMethod> {
  const [pm] = await db.insert(agentPaymentMethods).values(method).returning();
  return pm;
}

export async function deleteAgentPaymentMethod(id: string): Promise<boolean> {
  await db.delete(agentPaymentMethods).where(eq(agentPaymentMethods.id, id));
  return true;
}

// ==================== AFFILIATES ====================

export async function getAffiliate(id: string): Promise<Affiliate | undefined> {
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, id));
  return affiliate || undefined;
}

export async function getAffiliateByCode(code: string): Promise<Affiliate | undefined> {
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.affiliateCode, code));
  return affiliate || undefined;
}

export async function createAffiliate(insertAffiliate: InsertAffiliate): Promise<Affiliate> {
  const [affiliate] = await db.insert(affiliates).values(insertAffiliate).returning();
  return affiliate;
}

export async function updateAffiliate(id: string, data: Partial<InsertAffiliate>): Promise<Affiliate | undefined> {
  const [affiliate] = await db.update(affiliates).set({ ...data, updatedAt: new Date() }).where(eq(affiliates.id, id)).returning();
  return affiliate || undefined;
}

export async function listAffiliates(): Promise<Affiliate[]> {
  return db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
}

// ==================== PROMO CODES ====================

export async function getPromoCode(id: string): Promise<PromoCode | undefined> {
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
  return promo || undefined;
}

export async function getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase()));
  return promo || undefined;
}

export async function createPromoCode(insertPromo: InsertPromoCode): Promise<PromoCode> {
  const [promo] = await db.insert(promoCodes).values({ ...insertPromo, code: insertPromo.code.toUpperCase() }).returning();
  return promo;
}

export async function updatePromoCode(id: string, data: Partial<InsertPromoCode>): Promise<PromoCode | undefined> {
  const [promo] = await db.update(promoCodes).set(data).where(eq(promoCodes.id, id)).returning();
  return promo || undefined;
}

export async function listPromoCodes(affiliateId?: string): Promise<PromoCode[]> {
  if (affiliateId) {
    return db.select().from(promoCodes).where(eq(promoCodes.affiliateId, affiliateId)).orderBy(desc(promoCodes.createdAt));
  }
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

export async function incrementPromoCodeUsage(id: string): Promise<void> {
  await db.update(promoCodes).set({ usageCount: sql`${promoCodes.usageCount} + 1` }).where(eq(promoCodes.id, id));
}

// ==================== FINANCIAL LIMITS ====================

export async function getFinancialLimits(vipLevel?: number): Promise<FinancialLimit[]> {
  if (vipLevel !== undefined) {
    return db.select().from(financialLimits).where(eq(financialLimits.vipLevel, vipLevel));
  }
  return db.select().from(financialLimits).orderBy(asc(financialLimits.vipLevel));
}

export async function createFinancialLimit(limit: InsertFinancialLimit): Promise<FinancialLimit> {
  const [fl] = await db.insert(financialLimits).values(limit).returning();
  return fl;
}

export async function updateFinancialLimit(id: string, data: Partial<InsertFinancialLimit>): Promise<FinancialLimit | undefined> {
  const [fl] = await db.update(financialLimits).set({ ...data, updatedAt: new Date() }).where(eq(financialLimits.id, id)).returning();
  return fl || undefined;
}
