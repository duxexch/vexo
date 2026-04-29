import { and, desc, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  activeSessions,
  agentSubAccounts,
  agents,
  users,
  type AgentSubAccount,
} from "@shared/schema";
import { db } from "../../db";
import { revokeAllUserSessions } from "../users/auth";

export const MAX_SUB_ACCOUNTS_PER_AGENT = 4;

/**
 * Per-agent advisory lock used inside transactions that mutate the active
 * sub-account count. PG advisory locks are released automatically at the
 * end of the transaction (`xact` variant). hashtext() is a stable Postgres
 * hash for text, returning int4 — adequate keyspace for the few thousand
 * agents we expect, and the lock only contends on the same agent_id.
 */
async function lockAgentForSubAccountMutation(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  agentId: string,
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${agentId})::bigint)`);
}

export type AgentSubRole = "operator" | "supervisor" | "viewer";

export interface SubAccountListRow {
  id: string;
  agentId: string;
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  label: string;
  role: AgentSubRole;
  isActive: boolean;
  userStatus: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lists every sub-account (active + inactive) for an agent, joined with the
 * underlying user record so the admin UI can show username / email / name
 * without an extra round-trip.
 */
export async function listSubAccounts(agentId: string): Promise<SubAccountListRow[]> {
  const rows = await db
    .select({
      id: agentSubAccounts.id,
      agentId: agentSubAccounts.agentId,
      userId: agentSubAccounts.userId,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      label: agentSubAccounts.label,
      role: agentSubAccounts.role,
      isActive: agentSubAccounts.isActive,
      userStatus: users.status,
      lastLoginAt: agentSubAccounts.lastLoginAt,
      createdAt: agentSubAccounts.createdAt,
      updatedAt: agentSubAccounts.updatedAt,
    })
    .from(agentSubAccounts)
    .innerJoin(users, eq(agentSubAccounts.userId, users.id))
    .where(eq(agentSubAccounts.agentId, agentId))
    .orderBy(desc(agentSubAccounts.createdAt));
  return rows.map((row) => ({
    ...row,
    role: row.role as AgentSubRole,
    userStatus: String(row.userStatus),
  }));
}

export async function countActiveSubAccounts(agentId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(agentSubAccounts)
    .where(and(eq(agentSubAccounts.agentId, agentId), eq(agentSubAccounts.isActive, true)));
  return Number(row?.n ?? 0);
}

export async function getSubAccountById(id: string): Promise<AgentSubAccount | null> {
  const [row] = await db.select().from(agentSubAccounts).where(eq(agentSubAccounts.id, id)).limit(1);
  return row ?? null;
}

export async function getSubAccountByUserId(userId: string): Promise<AgentSubAccount | null> {
  const [row] = await db.select().from(agentSubAccounts).where(eq(agentSubAccounts.userId, userId)).limit(1);
  return row ?? null;
}

export interface CreateSubAccountInput {
  agentId: string;
  username: string;
  password: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  label: string;
  role?: AgentSubRole;
  createdByAdminId: string;
}

export interface SubAccountCreationError extends Error {
  code:
  | "SUB_ACCOUNT_LIMIT_REACHED"
  | "AGENT_NOT_FOUND"
  | "USERNAME_TAKEN"
  | "EMAIL_TAKEN"
  | "INVALID_INPUT";
}

function makeError(code: SubAccountCreationError["code"], message: string): SubAccountCreationError {
  const err = new Error(message) as SubAccountCreationError;
  err.code = code;
  return err;
}

/**
 * Creates a new sub-account: a user record (role=agent_employee) + the linking
 * agent_sub_accounts row. Wrapped in a transaction so we never leave a user
 * orphaned without its sub-account row (or vice versa). Enforces the
 * MAX_SUB_ACCOUNTS_PER_AGENT cap on active rows. The cap counts only active
 * sub-accounts so an agent can deactivate one and immediately add a
 * replacement.
 */
export async function createSubAccount(input: CreateSubAccountInput) {
  const username = input.username.trim();
  const email = input.email ? input.email.trim().toLowerCase() : null;
  const label = input.label.trim();
  const role: AgentSubRole = input.role ?? "operator";

  if (username.length < 3) throw makeError("INVALID_INPUT", "username must be at least 3 chars");
  if (input.password.length < 8) throw makeError("INVALID_INPUT", "password must be at least 8 chars");
  if (label.length < 1) throw makeError("INVALID_INPUT", "label is required");
  if (email) {
    // Simple email validation to avoid ReDoS attacks
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw makeError("INVALID_INPUT", "invalid email format");
    }
    const domainParts = parts[1].split('.');
    if (domainParts.length < 2) {
      throw makeError("INVALID_INPUT", "invalid email format");
    }
  }

  const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) throw makeError("AGENT_NOT_FOUND", "agent not found");

  // Username/email pre-checks outside the transaction give a cleaner error
  // surface; the unique index on users.username + the 23505 race fallback in
  // the route layer handle the residual race window.
  const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existingUsername) throw makeError("USERNAME_TAKEN", "username already exists");

  if (email) {
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingEmail) throw makeError("EMAIL_TAKEN", "email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  return db.transaction(async (tx) => {
    // Serialize all sub-account count-and-mutate operations for this agent
    // so concurrent creates/reactivations cannot both pass the cap check.
    await lockAgentForSubAccountMutation(tx, input.agentId);

    const [{ n }] = await tx
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(agentSubAccounts)
      .where(and(eq(agentSubAccounts.agentId, input.agentId), eq(agentSubAccounts.isActive, true)));
    if (Number(n) >= MAX_SUB_ACCOUNTS_PER_AGENT) {
      throw makeError(
        "SUB_ACCOUNT_LIMIT_REACHED",
        `agent already has ${Number(n)}/${MAX_SUB_ACCOUNTS_PER_AGENT} active sub-accounts`,
      );
    }

    const [newUser] = await tx
      .insert(users)
      .values({
        username,
        email,
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        password: passwordHash,
        role: "agent_employee",
        status: "active",
        usernameSelectedAt: new Date(),
      })
      .returning();

    const [newSub] = await tx
      .insert(agentSubAccounts)
      .values({
        agentId: input.agentId,
        userId: newUser.id,
        label,
        role,
        createdByAdminId: input.createdByAdminId,
      })
      .returning();

    return { subAccount: newSub, user: newUser };
  });
}

export interface UpdateSubAccountInput {
  label?: string;
  role?: AgentSubRole;
  isActive?: boolean;
}

export async function updateSubAccount(id: string, input: UpdateSubAccountInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw makeError("INVALID_INPUT", "label cannot be empty");
    updates.label = label;
  }
  if (input.role !== undefined) updates.role = input.role;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(agentSubAccounts).where(eq(agentSubAccounts.id, id)).limit(1);
    if (!existing) return null;

    // If we're flipping isActive on, hold the per-agent advisory lock and
    // re-check the active count INSIDE the transaction so concurrent
    // create/reactivate calls cannot both exceed the cap.
    if (input.isActive === true && !existing.isActive) {
      await lockAgentForSubAccountMutation(tx, existing.agentId);
      const [{ n }] = await tx
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(agentSubAccounts)
        .where(and(eq(agentSubAccounts.agentId, existing.agentId), eq(agentSubAccounts.isActive, true)));
      if (Number(n) >= MAX_SUB_ACCOUNTS_PER_AGENT) {
        throw makeError(
          "SUB_ACCOUNT_LIMIT_REACHED",
          `agent already has ${Number(n)}/${MAX_SUB_ACCOUNTS_PER_AGENT} active sub-accounts`,
        );
      }
    }

    const [updated] = await tx
      .update(agentSubAccounts)
      .set(updates)
      .where(eq(agentSubAccounts.id, id))
      .returning();
    if (!updated) return null;

    // Mirror isActive onto the user's status so the user can't log in while
    // the sub-account is disabled. We use 'inactive' (not 'banned' or
    // 'suspended') because this is an administrative deactivation, not a
    // policy violation — the admin can re-enable it without escalation.
    if (input.isActive !== undefined) {
      await tx
        .update(users)
        .set({ status: input.isActive ? "active" : "inactive", updatedAt: new Date() })
        .where(eq(users.id, updated.userId));
      // When deactivating, force-revoke BOTH session tables and bump
      // passwordChangedAt so any outstanding JWT is rejected by the next
      // verify() call. This prevents reactivation-time replay of pre-
      // deactivation tokens.
      if (input.isActive === false) {
        await tx
          .update(users)
          .set({ passwordChangedAt: new Date() })
          .where(eq(users.id, updated.userId));
        await tx
          .update(activeSessions)
          .set({ isActive: false })
          .where(and(eq(activeSessions.userId, updated.userId), eq(activeSessions.isActive, true)));
        await revokeAllUserSessions(updated.userId);
      }
    }
    return updated;
  });
}

/**
 * Resets the sub-account user's password and revokes every active session
 * for that user. Returns true on success. Caller is responsible for the
 * admin audit log entry.
 *
 * Setting passwordChangedAt is what actually invalidates already-issued
 * JWTs (server/lib/auth-verification.ts compares decoded.iat against
 * passwordChangedAt). revokeAllUserSessions handles the userSessions
 * table; activeSessions are deactivated separately (see resetUserPassword
 * in the route layer for parity with the admin password reset path).
 */
export async function resetSubAccountPassword(subAccountId: string, newPassword: string): Promise<{ ok: boolean; userId?: string }> {
  if (newPassword.length < 8) throw makeError("INVALID_INPUT", "password must be at least 8 chars");
  const sub = await getSubAccountById(subAccountId);
  if (!sub) return { ok: false };
  const hash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ password: hash, passwordChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, sub.userId));
  await revokeAllUserSessions(sub.userId);
  return { ok: true, userId: sub.userId };
}

/**
 * Updates the lastLoginAt timestamp for whichever sub-account this user owns.
 * Safe no-op if the user is not a sub-account.
 */
export async function touchSubAccountLastLogin(userId: string): Promise<void> {
  await db
    .update(agentSubAccounts)
    .set({ lastLoginAt: new Date() })
    .where(eq(agentSubAccounts.userId, userId));
}
