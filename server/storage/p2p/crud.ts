import {
  p2pTrades, p2pOffers, p2pTradeMessages, p2pTraderRatings, p2pTraderMetrics,
  type P2PTrade, type InsertP2PTrade,
  type P2POffer,
  type InsertP2POffer,
  type P2PTradeMessage, type InsertP2PTradeMessage,
  type P2PTraderRating,
  type P2PTraderMetric,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, asc, or, and } from "drizzle-orm";

// ==================== P2P TRADING CRUD ====================

export async function createP2PTrade(trade: InsertP2PTrade): Promise<P2PTrade> {
  const [created] = await db.insert(p2pTrades).values(trade).returning();
  return created;
}

export async function getP2PTrade(id: string): Promise<P2PTrade | undefined> {
  const [trade] = await db.select().from(p2pTrades).where(eq(p2pTrades.id, id));
  return trade || undefined;
}

export async function updateP2PTrade(id: string, data: Partial<InsertP2PTrade>): Promise<P2PTrade | undefined> {
  const [updated] = await db.update(p2pTrades)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(p2pTrades.id, id))
    .returning();
  return updated || undefined;
}

export async function getUserP2PTrades(userId: string): Promise<P2PTrade[]> {
  return db.select().from(p2pTrades)
    .where(or(eq(p2pTrades.buyerId, userId), eq(p2pTrades.sellerId, userId)))
    .orderBy(desc(p2pTrades.createdAt));
}

export async function createP2PTradeMessage(message: InsertP2PTradeMessage): Promise<P2PTradeMessage> {
  const [created] = await db.insert(p2pTradeMessages).values(message).returning();
  return created;
}

export async function getP2PTradeMessages(tradeId: string): Promise<P2PTradeMessage[]> {
  return db.select().from(p2pTradeMessages)
    .where(eq(p2pTradeMessages.tradeId, tradeId))
    .orderBy(asc(p2pTradeMessages.createdAt));
}

export async function createP2PTraderRating(rating: Omit<P2PTraderRating, 'id' | 'createdAt'>): Promise<P2PTraderRating> {
  const [created] = await db.insert(p2pTraderRatings).values(rating).returning();
  return created;
}

export async function getP2PTraderRatings(userId: string): Promise<P2PTraderRating[]> {
  return db.select().from(p2pTraderRatings)
    .where(eq(p2pTraderRatings.ratedUserId, userId))
    .orderBy(desc(p2pTraderRatings.createdAt));
}

export async function updateP2PTraderMetrics(userId: string, data: Partial<P2PTraderMetric>): Promise<P2PTraderMetric> {
  const existing = await getP2PTraderMetrics(userId);
  if (existing) {
    const [updated] = await db.update(p2pTraderMetrics)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(p2pTraderMetrics.userId, userId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(p2pTraderMetrics)
      .values({ userId, ...data })
      .returning();
    return created;
  }
}

export async function getP2PTraderMetrics(userId: string): Promise<P2PTraderMetric | undefined> {
  const [metrics] = await db.select().from(p2pTraderMetrics)
    .where(eq(p2pTraderMetrics.userId, userId));
  return metrics || undefined;
}

export async function getP2POffer(id: string): Promise<P2POffer | undefined> {
  const [offer] = await db.select().from(p2pOffers).where(eq(p2pOffers.id, id));
  return offer || undefined;
}

export async function createP2POffer(offer: InsertP2POffer): Promise<P2POffer> {
  const [created] = await db.insert(p2pOffers).values(offer).returning();
  return created;
}

export async function getActiveP2POffers(filters?: {
  type?: string;
  currency?: string;
  payment?: string;
}): Promise<P2POffer[]> {
  const conditions = [eq(p2pOffers.status, 'active')];

  if (filters?.type && filters.type !== 'all') {
    conditions.push(eq(p2pOffers.type, filters.type as 'buy' | 'sell'));
  }

  if (filters?.currency && filters.currency !== 'all') {
    conditions.push(eq(p2pOffers.cryptoCurrency, filters.currency.toUpperCase()));
  }

  let offers = await db.select().from(p2pOffers)
    .where(and(...conditions))
    .orderBy(desc(p2pOffers.createdAt));

  if (filters?.payment && filters.payment !== 'all') {
    offers = offers.filter((offer) => (offer.paymentMethods || []).includes(filters.payment!));
  }

  return offers;
}

export async function getUserP2POffers(userId: string): Promise<P2POffer[]> {
  return db.select().from(p2pOffers)
    .where(eq(p2pOffers.userId, userId))
    .orderBy(desc(p2pOffers.createdAt));
}

export async function cancelP2POfferByOwner(offerId: string, userId: string): Promise<P2POffer | undefined> {
  const [updated] = await db.update(p2pOffers)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(p2pOffers.id, offerId), eq(p2pOffers.userId, userId)))
    .returning();

  return updated || undefined;
}

export async function updateP2POffer(id: string, data: Partial<P2POffer>): Promise<P2POffer | undefined> {
  const [updated] = await db.update(p2pOffers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(p2pOffers.id, id))
    .returning();
  return updated || undefined;
}
