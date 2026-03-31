import {
  giftItems, spectatorGifts, giftCatalog, userGiftInventory, challengeGifts,
  type GiftItem, type InsertGiftItem,
  type SpectatorGift, type InsertSpectatorGift,
  type GiftCatalog as GiftCatalogType, type InsertGiftCatalog,
  type UserGiftInventory as UserGiftInventoryType,
  type ChallengeGift, type InsertChallengeGift,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, asc } from "drizzle-orm";

// ==================== GIFT ITEMS ====================

export async function createGiftItem(item: InsertGiftItem): Promise<GiftItem> {
  const [created] = await db.insert(giftItems).values(item).returning();
  return created;
}

export async function getGiftItem(id: string): Promise<GiftItem | undefined> {
  const [item] = await db.select().from(giftItems).where(eq(giftItems.id, id));
  return item || undefined;
}

export async function listGiftItems(activeOnly: boolean = true): Promise<GiftItem[]> {
  let query = db.select().from(giftItems);
  if (activeOnly) {
    query = query.where(eq(giftItems.isActive, true)) as typeof query;
  }
  return query.orderBy(asc(giftItems.sortOrder));
}

export async function updateGiftItem(id: string, data: Partial<InsertGiftItem>): Promise<GiftItem | undefined> {
  const [updated] = await db.update(giftItems)
    .set(data)
    .where(eq(giftItems.id, id))
    .returning();
  return updated || undefined;
}

// ==================== SPECTATOR GIFTS ====================

export async function addSpectatorGift(gift: InsertSpectatorGift): Promise<SpectatorGift> {
  const [created] = await db.insert(spectatorGifts).values(gift).returning();
  return created;
}

export async function getSessionGifts(sessionId: string): Promise<SpectatorGift[]> {
  return db.select().from(spectatorGifts)
    .where(eq(spectatorGifts.sessionId, sessionId))
    .orderBy(desc(spectatorGifts.createdAt));
}

export async function getPlayerReceivedGifts(playerId: string): Promise<SpectatorGift[]> {
  return db.select().from(spectatorGifts)
    .where(eq(spectatorGifts.recipientId, playerId))
    .orderBy(desc(spectatorGifts.createdAt));
}

// ==================== GIFT CATALOG ====================

export async function listGiftCatalog(activeOnly: boolean = true): Promise<GiftCatalogType[]> {
  let query = db.select().from(giftCatalog);
  if (activeOnly) {
    query = query.where(eq(giftCatalog.isActive, true)) as typeof query;
  }
  return query.orderBy(asc(giftCatalog.sortOrder));
}

export async function getGiftFromCatalog(id: string): Promise<GiftCatalogType | undefined> {
  const [gift] = await db.select().from(giftCatalog).where(eq(giftCatalog.id, id));
  return gift || undefined;
}

export async function createGiftInCatalog(gift: InsertGiftCatalog): Promise<GiftCatalogType> {
  const [created] = await db.insert(giftCatalog).values(gift).returning();
  return created;
}

// ==================== USER GIFT INVENTORY ====================

export async function getUserGiftInventory(userId: string): Promise<(UserGiftInventoryType & { gift: GiftCatalogType })[]> {
  const results = await db.select({
    inventory: userGiftInventory,
    gift: giftCatalog,
  }).from(userGiftInventory)
    .innerJoin(giftCatalog, eq(userGiftInventory.giftId, giftCatalog.id))
    .where(eq(userGiftInventory.userId, userId));
  
  return results.map(r => ({ ...r.inventory, gift: r.gift }));
}

export async function addToUserGiftInventory(userId: string, giftId: string, quantity: number = 1): Promise<UserGiftInventoryType> {
  const existing = await db.select().from(userGiftInventory)
    .where(and(
      eq(userGiftInventory.userId, userId),
      eq(userGiftInventory.giftId, giftId)
    ));
  
  if (existing.length > 0) {
    const [updated] = await db.update(userGiftInventory)
      .set({ quantity: existing[0].quantity + quantity, updatedAt: new Date() })
      .where(eq(userGiftInventory.id, existing[0].id))
      .returning();
    return updated;
  }
  
  const [created] = await db.insert(userGiftInventory)
    .values({ userId, giftId, quantity })
    .returning();
  return created;
}

export async function removeFromUserGiftInventory(userId: string, giftId: string, quantity: number = 1): Promise<{ success: boolean; error?: string }> {
  const [existing] = await db.select().from(userGiftInventory)
    .where(and(
      eq(userGiftInventory.userId, userId),
      eq(userGiftInventory.giftId, giftId)
    ));
  
  if (!existing || existing.quantity < quantity) {
    return { success: false, error: "Insufficient gift quantity" };
  }
  
  if (existing.quantity === quantity) {
    await db.delete(userGiftInventory).where(eq(userGiftInventory.id, existing.id));
  } else {
    await db.update(userGiftInventory)
      .set({ quantity: existing.quantity - quantity, updatedAt: new Date() })
      .where(eq(userGiftInventory.id, existing.id));
  }
  
  return { success: true };
}

// ==================== CHALLENGE GIFTS ====================

export async function sendChallengeGift(gift: InsertChallengeGift): Promise<ChallengeGift> {
  const [created] = await db.insert(challengeGifts).values(gift).returning();
  return created;
}

export async function getChallengeGifts(challengeId: string): Promise<ChallengeGift[]> {
  return db.select().from(challengeGifts)
    .where(eq(challengeGifts.challengeId, challengeId))
    .orderBy(desc(challengeGifts.sentAt));
}
