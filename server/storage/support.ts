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

const PAYMENT_METHOD_DUPLICATE_ERROR = "PAYMENT_METHOD_DUPLICATE";

function normalizePaymentMethodKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildCountryPaymentMethodKey(input: {
  countryCode: string | null | undefined;
  name: string | null | undefined;
  type: string | null | undefined;
  currencyId?: string | null | undefined;
}): string {
  return [
    normalizePaymentMethodKeyPart(input.countryCode),
    normalizePaymentMethodKeyPart(input.name),
    normalizePaymentMethodKeyPart(input.type),
    normalizePaymentMethodKeyPart(input.currencyId),
  ].join("|");
}

function getCountryPaymentMethodRank(method: CountryPaymentMethod): number {
  return (method.isActive ? 4 : 0)
    + (method.isAvailable ? 2 : 0)
    + (method.isWithdrawalEnabled ? 1 : 0);
}

function shouldPreferCountryPaymentMethod(candidate: CountryPaymentMethod, current: CountryPaymentMethod): boolean {
  const rankDiff = getCountryPaymentMethodRank(candidate) - getCountryPaymentMethodRank(current);
  if (rankDiff !== 0) {
    return rankDiff > 0;
  }

  if (candidate.sortOrder !== current.sortOrder) {
    return candidate.sortOrder < current.sortOrder;
  }

  const nameDiff = candidate.name.localeCompare(current.name);
  if (nameDiff !== 0) {
    return nameDiff < 0;
  }

  return candidate.id.localeCompare(current.id) < 0;
}

function createDuplicatePaymentMethodError(): Error {
  return new Error(PAYMENT_METHOD_DUPLICATE_ERROR);
}

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
  const methods = await db
    .select()
    .from(countryPaymentMethods)
    .orderBy(
      asc(countryPaymentMethods.sortOrder),
      asc(countryPaymentMethods.name),
      asc(countryPaymentMethods.id),
    );

  const uniqueMethods = new Map<string, CountryPaymentMethod>();

  for (const method of methods) {
    const methodKey = buildCountryPaymentMethodKey(method);
    const current = uniqueMethods.get(methodKey);

    if (!current || shouldPreferCountryPaymentMethod(method, current)) {
      uniqueMethods.set(methodKey, method);
    }
  }

  return Array.from(uniqueMethods.values()).sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    const nameDiff = left.name.localeCompare(right.name);
    if (nameDiff !== 0) {
      return nameDiff;
    }

    const countryDiff = String(left.countryCode).localeCompare(String(right.countryCode));
    if (countryDiff !== 0) {
      return countryDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

export async function createCountryPaymentMethod(method: InsertCountryPaymentMethod): Promise<CountryPaymentMethod> {
  const normalizedCountryCode = method.countryCode.trim().toUpperCase();
  const normalizedName = method.name.trim();
  const normalizedMethodNumber = (method.methodNumber ?? "").trim();
  const normalizedCurrencyId = method.currencyId?.trim() || null;
  const candidateKey = buildCountryPaymentMethodKey({
    countryCode: normalizedCountryCode,
    name: normalizedName,
    type: method.type,
    currencyId: normalizedCurrencyId,
  });

  const existingForCountryAndType = await db
    .select()
    .from(countryPaymentMethods)
    .where(
      and(
        eq(countryPaymentMethods.countryCode, normalizedCountryCode),
        eq(countryPaymentMethods.type, method.type),
      ),
    );

  const hasDuplicate = existingForCountryAndType.some((existingMethod) =>
    buildCountryPaymentMethodKey(existingMethod) === candidateKey,
  );

  if (hasDuplicate) {
    throw createDuplicatePaymentMethodError();
  }

  const [created] = await db.insert(countryPaymentMethods).values({
    ...method,
    countryCode: normalizedCountryCode,
    name: normalizedName,
    methodNumber: normalizedMethodNumber,
    currencyId: normalizedCurrencyId,
  }).returning();
  return created;
}

export async function updateCountryPaymentMethod(id: string, data: Partial<InsertCountryPaymentMethod>): Promise<CountryPaymentMethod | undefined> {
  const [existingMethod] = await db
    .select()
    .from(countryPaymentMethods)
    .where(eq(countryPaymentMethods.id, id));

  if (!existingMethod) {
    return undefined;
  }

  const normalizedCountryCode = (data.countryCode ?? existingMethod.countryCode).trim().toUpperCase();
  const normalizedName = (data.name ?? existingMethod.name).trim();
  const normalizedMethodNumber = data.methodNumber !== undefined
    ? data.methodNumber.trim()
    : existingMethod.methodNumber;
  const normalizedType = data.type ?? existingMethod.type;
  const normalizedCurrencyId = data.currencyId !== undefined
    ? (data.currencyId?.trim() || null)
    : (existingMethod.currencyId || null);

  const currentKey = buildCountryPaymentMethodKey(existingMethod);
  const nextKey = buildCountryPaymentMethodKey({
    countryCode: normalizedCountryCode,
    name: normalizedName,
    type: normalizedType,
    currencyId: normalizedCurrencyId,
  });

  if (nextKey !== currentKey) {
    const existingForCountryAndType = await db
      .select()
      .from(countryPaymentMethods)
      .where(
        and(
          eq(countryPaymentMethods.countryCode, normalizedCountryCode),
          eq(countryPaymentMethods.type, normalizedType),
        ),
      );

    const hasDuplicate = existingForCountryAndType.some((method) =>
      method.id !== id && buildCountryPaymentMethodKey(method) === nextKey,
    );

    if (hasDuplicate) {
      throw createDuplicatePaymentMethodError();
    }
  }

  const [updated] = await db.update(countryPaymentMethods).set({
    ...data,
    countryCode: normalizedCountryCode,
    name: normalizedName,
    methodNumber: normalizedMethodNumber,
    type: normalizedType,
    currencyId: normalizedCurrencyId,
  }).where(eq(countryPaymentMethods.id, id)).returning();
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
