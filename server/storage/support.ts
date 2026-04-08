import {
  complaints, complaintMessages,
  countryPaymentMethods,
  supportSettings, spectatorSupports, matchedSupports,
  type Complaint, type InsertComplaint,
  type ComplaintMessage, type InsertComplaintMessage,
  type ComplaintStatus,
  type CountryPaymentMethod, type InsertCountryPaymentMethod,
  type SupportSettings, type InsertSupportSettings,
  type SpectatorSupport, type InsertSpectatorSupport,
  type MatchedSupport, type InsertMatchedSupport,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, asc, inArray } from "drizzle-orm";

// ==================== COMPLAINTS ====================

export async function getComplaint(id: string): Promise<Complaint | undefined> {
  const [complaint] = await db.select().from(complaints).where(eq(complaints.id, id));
  return complaint || undefined;
}

export async function createComplaint(insertComplaint: InsertComplaint): Promise<Complaint> {
  const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
  const [complaint] = await db.insert(complaints).values({ ...insertComplaint, ticketNumber }).returning();
  return complaint;
}

export async function updateComplaint(id: string, data: Partial<InsertComplaint>): Promise<Complaint | undefined> {
  const [complaint] = await db.update(complaints).set({ ...data, updatedAt: new Date() }).where(eq(complaints.id, id)).returning();
  return complaint || undefined;
}

export async function listComplaints(userId?: string, status?: string): Promise<Complaint[]> {
  const conditions = [];
  if (userId) conditions.push(eq(complaints.userId, userId));
  if (status) conditions.push(eq(complaints.status, status as ComplaintStatus));

  if (conditions.length > 0) {
    return db.select().from(complaints).where(and(...conditions)).orderBy(desc(complaints.createdAt));
  }
  return db.select().from(complaints).orderBy(desc(complaints.createdAt));
}

export async function getComplaintsByAgent(agentId: string): Promise<Complaint[]> {
  return db.select().from(complaints).where(eq(complaints.assignedAgentId, agentId)).orderBy(desc(complaints.createdAt));
}

export async function addComplaintMessage(message: InsertComplaintMessage): Promise<ComplaintMessage> {
  const [msg] = await db.insert(complaintMessages).values(message).returning();
  return msg;
}

export async function getComplaintMessages(complaintId: string): Promise<ComplaintMessage[]> {
  return db.select().from(complaintMessages).where(eq(complaintMessages.complaintId, complaintId)).orderBy(asc(complaintMessages.createdAt));
}

// ==================== COUNTRY PAYMENT METHODS ====================

export async function listCountryPaymentMethods(): Promise<CountryPaymentMethod[]> {
  return db.select().from(countryPaymentMethods).orderBy(asc(countryPaymentMethods.sortOrder), asc(countryPaymentMethods.name));
}

export async function createCountryPaymentMethod(method: InsertCountryPaymentMethod): Promise<CountryPaymentMethod> {
  const [created] = await db.insert(countryPaymentMethods).values(method).returning();
  return created;
}

export async function updateCountryPaymentMethod(id: string, data: Partial<InsertCountryPaymentMethod>): Promise<CountryPaymentMethod | undefined> {
  const [updated] = await db.update(countryPaymentMethods).set(data).where(eq(countryPaymentMethods.id, id)).returning();
  return updated;
}

export async function updateCountryPaymentMethodsBulk(
  ids: string[],
  data: Partial<InsertCountryPaymentMethod>,
): Promise<CountryPaymentMethod[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0)));
  if (uniqueIds.length === 0) {
    return [];
  }

  return db.update(countryPaymentMethods)
    .set(data)
    .where(inArray(countryPaymentMethods.id, uniqueIds))
    .returning();
}

export async function deleteCountryPaymentMethod(id: string): Promise<boolean> {
  const existing = await db.select().from(countryPaymentMethods).where(eq(countryPaymentMethods.id, id));
  if (existing.length === 0) {
    return false;
  }
  await db.delete(countryPaymentMethods).where(eq(countryPaymentMethods.id, id));
  return true;
}

export async function deleteCountryPaymentMethodsBulk(ids: string[]): Promise<number> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0)));
  if (uniqueIds.length === 0) {
    return 0;
  }

  const deletedRows = await db.delete(countryPaymentMethods)
    .where(inArray(countryPaymentMethods.id, uniqueIds))
    .returning({ id: countryPaymentMethods.id });

  return deletedRows.length;
}

// ==================== SUPPORT SETTINGS ====================

export async function getSupportSettings(gameType: string): Promise<SupportSettings | undefined> {
  const [result] = await db.select().from(supportSettings).where(eq(supportSettings.gameType, gameType));
  if (result) return result;

  const defaultSettings: InsertSupportSettings = {
    gameType,
    isEnabled: true,
    minSupportAmount: "1.00",
    maxSupportAmount: "1000.00",
    houseFeePercent: "5.00",
    oddsMode: "automatic",
    instantMatchOdds: "1.80",
    allowInstantMatch: true,
    winRateWeight: "0.60",
    experienceWeight: "0.25",
    streakWeight: "0.15",
  };
  const [created] = await db.insert(supportSettings).values(defaultSettings).returning();
  return created;
}

export async function getSupportSettingsList(): Promise<SupportSettings[]> {
  return db.select().from(supportSettings).orderBy(asc(supportSettings.gameType));
}

export async function createSupportSettings(settings: InsertSupportSettings): Promise<SupportSettings> {
  const [result] = await db.insert(supportSettings).values(settings).returning();
  return result;
}

export async function updateSupportSettings(gameType: string, data: Partial<InsertSupportSettings>): Promise<SupportSettings | undefined> {
  const [result] = await db.update(supportSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(supportSettings.gameType, gameType))
    .returning();
  return result || undefined;
}

// ==================== SPECTATOR SUPPORTS ====================

export async function createSpectatorSupport(support: InsertSpectatorSupport): Promise<SpectatorSupport> {
  const [result] = await db.insert(spectatorSupports).values(support).returning();
  return result;
}

export async function getSpectatorSupport(id: string): Promise<SpectatorSupport | undefined> {
  const [result] = await db.select().from(spectatorSupports).where(eq(spectatorSupports.id, id));
  return result || undefined;
}

export async function getSpectatorSupportsByChallenge(challengeId: string): Promise<SpectatorSupport[]> {
  return db.select().from(spectatorSupports)
    .where(eq(spectatorSupports.challengeId, challengeId))
    .orderBy(desc(spectatorSupports.createdAt));
}

export async function getSpectatorSupportsByUser(userId: string): Promise<SpectatorSupport[]> {
  return db.select().from(spectatorSupports)
    .where(eq(spectatorSupports.supporterId, userId))
    .orderBy(desc(spectatorSupports.createdAt));
}

export async function getPendingSupportsForPlayer(challengeId: string, playerId: string): Promise<SpectatorSupport[]> {
  return db.select().from(spectatorSupports)
    .where(
      and(
        eq(spectatorSupports.challengeId, challengeId),
        eq(spectatorSupports.supportedPlayerId, playerId),
        eq(spectatorSupports.status, 'pending')
      )
    )
    .orderBy(asc(spectatorSupports.createdAt));
}

export async function updateSpectatorSupport(id: string, data: Partial<SpectatorSupport>): Promise<SpectatorSupport | undefined> {
  const [result] = await db.update(spectatorSupports)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(spectatorSupports.id, id))
    .returning();
  return result || undefined;
}

// ==================== MATCHED SUPPORTS ====================

export async function createMatchedSupport(matched: InsertMatchedSupport): Promise<MatchedSupport> {
  const [result] = await db.insert(matchedSupports).values(matched).returning();
  return result;
}

export async function getMatchedSupport(id: string): Promise<MatchedSupport | undefined> {
  const [result] = await db.select().from(matchedSupports).where(eq(matchedSupports.id, id));
  return result || undefined;
}

export async function getMatchedSupportsByChallenge(challengeId: string): Promise<MatchedSupport[]> {
  return db.select().from(matchedSupports)
    .where(eq(matchedSupports.challengeId, challengeId))
    .orderBy(desc(matchedSupports.createdAt));
}

export async function settleMatchedSupport(id: string, winnerId: string, winnerSupportId: string): Promise<MatchedSupport | undefined> {
  const [result] = await db.update(matchedSupports)
    .set({
      winnerId,
      winnerSupportId,
      settledAt: new Date(),
    })
    .where(eq(matchedSupports.id, id))
    .returning();
  return result || undefined;
}
