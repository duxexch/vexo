import { eq } from "drizzle-orm";
import { agents, agentSubAccounts, type AgentSubAccount } from "@shared/schema";
import { db } from "../db";
import type { AgentWithUser } from "../storage/agents/repository";
import { getAgentById } from "../storage/agents";

export interface AgentContext {
  /** The parent agent record (always populated, even for sub-account logins). */
  agent: AgentWithUser;
  /** ID of the parent agent (== agent.id). */
  agentId: string;
  /** True if the logged-in user is the main agent; false if a sub-account. */
  isMainAgent: boolean;
  /**
   * The user that performed the action (main agent's userId OR sub-account's
   * userId). Always equals the request's authenticated user id. Use this for
   * action attribution columns (processedByActorId, actorUserId, etc).
   */
  actorUserId: string;
  /** Sub-account record if the actor is a sub-account, else null. */
  subAccount: AgentSubAccount | null;
}

/**
 * Resolve the agent context for an authenticated user. Returns null if the
 * user is neither a main agent nor a sub-account, or if the parent agent
 * record cannot be loaded.
 *
 * Lookup order:
 *   1. agents.userId == userId  → main agent
 *   2. agent_sub_accounts.userId == userId AND isActive  → sub-account
 *
 * Inactive sub-accounts are intentionally excluded so a deactivated
 * employee cannot perform agent actions even if their session token was
 * issued before deactivation.
 */
export async function resolveAgentContext(userId: string): Promise<AgentContext | null> {
  const [mainRow] = await db.select({ id: agents.id }).from(agents).where(eq(agents.userId, userId)).limit(1);
  if (mainRow) {
    const agent = await getAgentById(mainRow.id);
    if (!agent) return null;
    return { agent, agentId: agent.id, isMainAgent: true, actorUserId: userId, subAccount: null };
  }

  const [sub] = await db.select().from(agentSubAccounts).where(eq(agentSubAccounts.userId, userId)).limit(1);
  if (!sub || !sub.isActive) return null;
  const agent = await getAgentById(sub.agentId);
  if (!agent) return null;
  return { agent, agentId: agent.id, isMainAgent: false, actorUserId: userId, subAccount: sub };
}
