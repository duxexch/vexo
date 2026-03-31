import crypto from "crypto";
import { users, type User, type InsertUser, type UserRole } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, inArray } from "drizzle-orm";
import { type UpdateUserData } from "../helpers";

// ==================== USERS CRUD ====================

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || undefined;
}

/** Batch fetch multiple users by IDs in a single query — eliminates N+1 */
export async function getUsersByIds(ids: string[]): Promise<Map<string, User>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = [...new Set(ids)];
  const rows = await db.select().from(users).where(inArray(users.id, uniqueIds));
  const map = new Map<string, User>();
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user || undefined;
}

export async function createUser(insertUser: InsertUser): Promise<User> {
  const [user] = await db.insert(users).values(insertUser).returning();
  return user;
}

export async function updateUser(id: string, data: UpdateUserData): Promise<User | undefined> {
  const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
  return user || undefined;
}

export async function listUsers(role?: string): Promise<User[]> {
  if (role) {
    return db.select().from(users).where(eq(users.role, role as UserRole)).orderBy(desc(users.createdAt));
  }
  return db.select().from(users).orderBy(desc(users.createdAt));
}

// ==================== USER LOOKUPS ====================

export async function getUserByAccountId(accountId: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.accountId, accountId));
  return user || undefined;
}

export async function getUserByPhone(phone: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.phone, phone));
  return user || undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user || undefined;
}

export async function getUserByNickname(nickname: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.nickname, nickname));
  return user || undefined;
}

export async function generateUniqueAccountId(): Promise<string> {
  let accountId: string;
  let exists = true;
  while (exists) {
    accountId = crypto.randomInt(100000000, 999999999).toString();
    const user = await getUserByAccountId(accountId);
    exists = !!user;
  }
  return accountId!;
}
