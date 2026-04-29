import type { Express, Response } from "express";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { activeSessions, agents, users } from "@shared/schema";
import { db } from "../../db";
import { revokeAllUserSessions } from "../../storage/users/auth";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage, logAdminAction } from "../helpers";
import {
  MAX_SUB_ACCOUNTS_PER_AGENT,
  listSubAccounts,
  countActiveSubAccounts,
  getSubAccountById,
  createSubAccount,
  updateSubAccount,
  resetSubAccountPassword,
  type AgentSubRole,
  type SubAccountCreationError,
} from "../../storage/agents";
import { getAgentById } from "../../storage/agents";

const SUB_ROLES: ReadonlyArray<AgentSubRole> = ["operator", "supervisor", "viewer"];

function parseRole(input: unknown, fallback: AgentSubRole = "operator"): AgentSubRole {
  const value = String(input ?? "").trim().toLowerCase();
  return (SUB_ROLES as readonly string[]).includes(value) ? (value as AgentSubRole) : fallback;
}

function mapCreationError(error: unknown): { status: number; body: { error: string; code?: string } } {
  const code = (error as SubAccountCreationError | undefined)?.code;
  switch (code) {
    case "SUB_ACCOUNT_LIMIT_REACHED":
      return { status: 409, body: { error: getErrorMessage(error), code } };
    case "USERNAME_TAKEN":
      return { status: 409, body: { error: "username already exists", code } };
    case "EMAIL_TAKEN":
      return { status: 409, body: { error: "email already exists", code } };
    case "AGENT_NOT_FOUND":
      return { status: 404, body: { error: "agent not found", code } };
    case "INVALID_INPUT":
      return { status: 400, body: { error: getErrorMessage(error), code } };
    default:
      return { status: 500, body: { error: getErrorMessage(error) } };
  }
}

export function registerAdminAgentSubAccountRoutes(app: Express) {
  // ---------- LIST sub-accounts of an agent ----------
  app.get(
    "/api/admin/agents/:agentId/sub-accounts",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const agent = await getAgentById(req.params.agentId);
        if (!agent) return res.status(404).json({ error: "agent not found" });
        const [subAccounts, activeCount] = await Promise.all([
          listSubAccounts(req.params.agentId),
          countActiveSubAccounts(req.params.agentId),
        ]);
        return res.json({
          subAccounts,
          activeCount,
          maxAllowed: MAX_SUB_ACCOUNTS_PER_AGENT,
        });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- CREATE a sub-account (max 4 active enforced) ----------
  app.post(
    "/api/admin/agents/:agentId/sub-accounts",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const { username, password, email, firstName, lastName, label, role } = req.body ?? {};

        const result = await createSubAccount({
          agentId: req.params.agentId,
          username: String(username ?? ""),
          password: String(password ?? ""),
          email: email ? String(email) : null,
          firstName: firstName ? String(firstName) : null,
          lastName: lastName ? String(lastName) : null,
          label: String(label ?? ""),
          role: parseRole(role),
          createdByAdminId: adminId,
        });

        await logAdminAction(
          adminId,
          "user_update",
          "agent_sub_account",
          result.subAccount.id,
          {
            newValue: JSON.stringify({
              agentId: req.params.agentId,
              username: result.user.username,
              label: result.subAccount.label,
              role: result.subAccount.role,
            }),
            metadata: JSON.stringify({ originalAction: "agent_sub_account_create" }),
          },
          req,
        );

        return res.status(201).json({ subAccount: result.subAccount, user: { id: result.user.id, username: result.user.username } });
      } catch (error: unknown) {
        // Postgres unique-violation race fallback (in case our pre-check missed
        // a concurrent create)
        if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
          const constraint = String((error as { constraint?: string }).constraint ?? "");
          if (constraint.includes("email")) return res.status(409).json({ error: "email already exists" });
          if (constraint.includes("username")) return res.status(409).json({ error: "username already exists" });
          return res.status(409).json({ error: "duplicate value violates a unique constraint" });
        }
        const mapped = mapCreationError(error);
        return res.status(mapped.status).json(mapped.body);
      }
    },
  );

  // ---------- UPDATE a sub-account (label / role / isActive) ----------
  app.patch(
    "/api/admin/agents/:agentId/sub-accounts/:id",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const existing = await getSubAccountById(req.params.id);
        if (!existing) return res.status(404).json({ error: "sub-account not found" });
        if (existing.agentId !== req.params.agentId) {
          return res.status(404).json({ error: "sub-account does not belong to this agent" });
        }

        const body = req.body ?? {};
        const updates: { label?: string; role?: AgentSubRole; isActive?: boolean } = {};
        if (body.label !== undefined) updates.label = String(body.label);
        if (body.role !== undefined) updates.role = parseRole(body.role, existing.role as AgentSubRole);
        if (body.isActive !== undefined) {
          const desiredActive = Boolean(body.isActive);
          // Re-activating: enforce the cap so an admin cannot bypass it by
          // toggling a previously-disabled sub-account back on.
          if (desiredActive && !existing.isActive) {
            const activeCount = await countActiveSubAccounts(req.params.agentId);
            if (activeCount >= MAX_SUB_ACCOUNTS_PER_AGENT) {
              return res.status(409).json({
                error: `agent already has ${activeCount}/${MAX_SUB_ACCOUNTS_PER_AGENT} active sub-accounts`,
                code: "SUB_ACCOUNT_LIMIT_REACHED",
              });
            }
          }
          updates.isActive = desiredActive;
        }

        let updated;
        try {
          updated = await updateSubAccount(req.params.id, updates);
        } catch (innerError: unknown) {
          // Storage layer can throw SUB_ACCOUNT_LIMIT_REACHED if a race
          // beats our pre-check above (concurrent reactivation between
          // pre-check and the in-transaction lock).
          const code = (innerError as SubAccountCreationError | undefined)?.code;
          if (code === "SUB_ACCOUNT_LIMIT_REACHED") {
            return res.status(409).json({ error: getErrorMessage(innerError), code });
          }
          throw innerError;
        }
        if (!updated) return res.status(404).json({ error: "sub-account not found" });

        await logAdminAction(
          adminId,
          updates.isActive === false ? "user_suspend" : "user_update",
          "agent_sub_account",
          req.params.id,
          {
            previousValue: JSON.stringify({
              label: existing.label,
              role: existing.role,
              isActive: existing.isActive,
            }),
            newValue: JSON.stringify(updates),
            metadata: JSON.stringify({
              originalAction:
                updates.isActive === false
                  ? "agent_sub_account_disable"
                  : updates.isActive === true
                    ? "agent_sub_account_enable"
                    : "agent_sub_account_update",
              agentId: req.params.agentId,
            }),
          },
          req,
        );

        return res.json({ subAccount: updated });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- DELETE (soft via isActive=false) a sub-account ----------
  app.delete(
    "/api/admin/agents/:agentId/sub-accounts/:id",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const existing = await getSubAccountById(req.params.id);
        if (!existing) return res.status(404).json({ error: "sub-account not found" });
        if (existing.agentId !== req.params.agentId) {
          return res.status(404).json({ error: "sub-account does not belong to this agent" });
        }

        if (existing.isActive) {
          await updateSubAccount(req.params.id, { isActive: false });
        }

        await logAdminAction(
          adminId,
          "user_suspend",
          "agent_sub_account",
          req.params.id,
          {
            previousValue: JSON.stringify({ isActive: existing.isActive }),
            newValue: JSON.stringify({ isActive: false }),
            metadata: JSON.stringify({
              originalAction: "agent_sub_account_disable",
              agentId: req.params.agentId,
              softDelete: true,
            }),
          },
          req,
        );

        return res.json({ ok: true });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- RESET sub-account password ----------
  app.post(
    "/api/admin/agents/:agentId/sub-accounts/:id/reset-password",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const newPassword = String(req.body?.newPassword ?? "");
        if (newPassword.length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });

        const existing = await getSubAccountById(req.params.id);
        if (!existing) return res.status(404).json({ error: "sub-account not found" });
        if (existing.agentId !== req.params.agentId) {
          return res.status(404).json({ error: "sub-account does not belong to this agent" });
        }

        const result = await resetSubAccountPassword(req.params.id, newPassword);
        if (!result.ok || !result.userId) return res.status(404).json({ error: "sub-account not found" });

        // Storage layer already revoked userSessions + bumped passwordChangedAt
        // (which invalidates any outstanding JWT). Mirror the admin-password
        // path by also deactivating activeSessions rows so MFA/session listings
        // reflect the forced logout.
        await db
          .update(activeSessions)
          .set({ isActive: false })
          .where(and(eq(activeSessions.userId, result.userId), eq(activeSessions.isActive, true)));

        await logAdminAction(
          adminId,
          "user_update",
          "agent_sub_account",
          req.params.id,
          {
            metadata: JSON.stringify({
              originalAction: "agent_sub_account_password_reset",
              agentId: req.params.agentId,
            }),
          },
          req,
        );

        return res.json({ ok: true });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- RESET MAIN agent password ----------
  app.post(
    "/api/admin/agents/:agentId/reset-password",
    adminAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const newPassword = String(req.body?.newPassword ?? "");
        if (newPassword.length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });

        const agent = await getAgentById(req.params.agentId);
        if (!agent) return res.status(404).json({ error: "agent not found" });

        const hash = await bcrypt.hash(newPassword, 12);
        // Bumping passwordChangedAt invalidates every JWT issued before this
        // moment (auth-verification compares decoded.iat). We then revoke
        // userSessions + activeSessions so the dashboards/listings agree.
        await db
          .update(users)
          .set({ password: hash, passwordChangedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, agent.userId));
        await revokeAllUserSessions(agent.userId);
        await db
          .update(activeSessions)
          .set({ isActive: false })
          .where(and(eq(activeSessions.userId, agent.userId), eq(activeSessions.isActive, true)));

        await logAdminAction(
          adminId,
          "user_update",
          "agent",
          agent.id,
          {
            metadata: JSON.stringify({
              originalAction: "agent_main_password_reset",
              targetUserId: agent.userId,
              sessionsRevoked: true,
            }),
          },
          req,
        );

        return res.json({ ok: true });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );
}

void agents; // imported for type-graph sanity (kept to avoid unused-import lint trips)
