import type { Express, Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { agents, users, type AgentLedgerType } from "@shared/schema";
import { db } from "../db";
import { internalAuthMiddleware, type AdminRequest } from "../lib/auth";
import { getErrorMessage } from "../lib/errors";
import { logAdminAction } from "../storage/audit";
import {
  listAgents,
  getAgentById,
  getAgentByCode,
  getAgentStats,
  setAgentActive,
  updateAgent,
} from "../storage/repository";
import {
  listAgentWallets,
  listAgentLedger,
  adminAdjustAgentWallet,
  topUpAgentWallet,
  ensureAgentWallet,
} from "../storage/wallets";

const SUPPORTED_CURRENCIES = new Set([
  "USD", "EUR", "SAR", "AED", "EGP", "KWD", "QAR", "BHD", "OMR", "JOD", "VEX",
]);

function normalizeCurrencyList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const item of input) {
    const code = String(item ?? "").trim().toUpperCase();
    if (SUPPORTED_CURRENCIES.has(code)) out.add(code);
  }
  return Array.from(out);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clampDecimal(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function registerAdminAgentsRoutes(app: Express): void {
  // ---------- LIST ----------
  app.get(
    "/api/admin/agents",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const isActive = req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined;
        const isOnline = req.query.isOnline === "true" ? true : req.query.isOnline === "false" ? false : undefined;
        const defaultCurrency = typeof req.query.currency === "string" ? req.query.currency.toUpperCase() : undefined;
        const search = typeof req.query.q === "string" ? req.query.q : undefined;
        const limit = clampInt(req.query.limit, 1, 200, 50);
        const offset = clampInt(req.query.offset, 0, 100000, 0);

        const rows = await listAgents({ isActive, isOnline, defaultCurrency, search, limit, offset });
        return res.json({ agents: rows, count: rows.length });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- DETAIL ----------
  app.get(
    "/api/admin/agents/:id",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const agent = await getAgentById(req.params.id);
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        const [wallets, stats] = await Promise.all([
          listAgentWallets(agent.id),
          getAgentStats(agent.id),
        ]);
        return res.json({ agent, wallets, stats });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- LEDGER ----------
  app.get(
    "/api/admin/agents/:id/ledger",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const limit = clampInt(req.query.limit, 1, 500, 50);
        const offset = clampInt(req.query.offset, 0, 100000, 0);
        const currency = typeof req.query.currency === "string" ? req.query.currency.toUpperCase() : undefined;
        const ledger = await listAgentLedger(req.params.id, { limit, offset, currency });
        return res.json({ ledger, count: ledger.length });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- CREATE ----------
  app.post(
    "/api/admin/agents",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const {
          username,
          password,
          email,
          fullName,
          agentCode,
          defaultCurrency,
          allowedCurrencies,
          commissionRateDeposit,
          commissionRateWithdraw,
          commissionFixedDeposit,
          commissionFixedWithdraw,
          dailyLimit,
          monthlyLimit,
          balanceWarnThreshold,
          balanceFreezeThreshold,
          balanceMinThreshold,
          maxConcurrentRequests,
          trafficWeight,
          initialDeposit,
        } = req.body ?? {};

        const usernameStr = String(username ?? "").trim();
        const passwordStr = String(password ?? "");
        const codeStr = String(agentCode ?? "").trim().toUpperCase();
        if (usernameStr.length < 3) return res.status(400).json({ error: "username must be at least 3 chars" });
        if (passwordStr.length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });
        if (codeStr.length < 2) return res.status(400).json({ error: "agentCode required" });

        const defaultCur = String(defaultCurrency ?? "USD").trim().toUpperCase();
        if (!SUPPORTED_CURRENCIES.has(defaultCur)) {
          return res.status(400).json({ error: `unsupported defaultCurrency: ${defaultCur}` });
        }
        const allowed = normalizeCurrencyList(allowedCurrencies);
        if (!allowed.includes(defaultCur)) allowed.push(defaultCur);

        const emailStr = email ? String(email).trim().toLowerCase() : null;
        if (emailStr) {
          // Simple email validation to avoid ReDoS attacks
          const parts = emailStr.split('@');
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return res.status(400).json({ error: "invalid email format" });
          }
          const domainParts = parts[1].split('.');
          if (domainParts.length < 2) {
            return res.status(400).json({ error: "invalid email format" });
          }
        }

        const existingByCode = await getAgentByCode(codeStr);
        if (existingByCode) return res.status(409).json({ error: "agentCode already exists" });

        const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.username, usernameStr)).limit(1);
        if (existingUser.length > 0) return res.status(409).json({ error: "username already exists" });

        if (emailStr) {
          const existingByEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, emailStr)).limit(1);
          if (existingByEmail.length > 0) return res.status(409).json({ error: "email already exists" });
        }

        const passwordHash = await bcrypt.hash(passwordStr, 12);
        const initialDepositNum = clampDecimal(initialDeposit, 0, 1_000_000_000, 0);

        const fullNameStr = fullName ? String(fullName).trim() : "";
        const [firstNamePart, ...restName] = fullNameStr.split(/\s+/).filter(Boolean);
        const lastNamePart = restName.join(" ").trim() || null;

        const created = await db.transaction(async (tx) => {
          const newUserRows = await tx
            .insert(users)
            .values({
              username: usernameStr,
              email: emailStr,
              firstName: firstNamePart ?? null,
              lastName: lastNamePart,
              password: passwordHash,
              role: "agent",
              status: "active",
            })
            .returning();
          const newUser = newUserRows[0];

          const agentRows = await tx
            .insert(agents)
            .values({
              userId: newUser.id,
              agentCode: codeStr,
              commissionRateDeposit: clampDecimal(commissionRateDeposit, 0, 0.5, 0.02).toFixed(4),
              commissionRateWithdraw: clampDecimal(commissionRateWithdraw, 0, 0.5, 0.01).toFixed(4),
              commissionFixedDeposit: clampDecimal(commissionFixedDeposit, 0, 1_000_000, 0).toFixed(2),
              commissionFixedWithdraw: clampDecimal(commissionFixedWithdraw, 0, 1_000_000, 0).toFixed(2),
              dailyLimit: clampDecimal(dailyLimit, 0, 1_000_000_000, 100_000).toFixed(2),
              monthlyLimit: clampDecimal(monthlyLimit, 0, 100_000_000_000, 1_000_000).toFixed(2),
              balanceWarnThreshold: clampDecimal(balanceWarnThreshold, 0, 1_000_000_000, 150).toFixed(2),
              balanceFreezeThreshold: clampDecimal(balanceFreezeThreshold, 0, 1_000_000_000, 100).toFixed(2),
              balanceMinThreshold: clampDecimal(balanceMinThreshold, 0, 1_000_000_000, 50).toFixed(2),
              maxConcurrentRequests: clampInt(maxConcurrentRequests, 1, 100, 5),
              trafficWeight: clampInt(trafficWeight, 0, 10000, 100),
              allowedCurrencies: allowed,
              defaultCurrency: defaultCur,
              initialDeposit: initialDepositNum.toFixed(2),
              currentBalance: initialDepositNum.toFixed(2),
            })
            .returning();
          const newAgent = agentRows[0];

          for (const cur of allowed) {
            const wallet = await ensureAgentWallet(tx, newAgent.id, cur);
            if (cur === defaultCur && initialDepositNum > 0) {
              await topUpAgentWallet(tx, {
                agentId: newAgent.id,
                currency: cur,
                amount: initialDepositNum,
                note: "initial deposit on agent creation",
                createdByUserId: adminId,
              });
            }
            void wallet;
          }

          return { agent: newAgent, user: newUser };
        });

        await logAdminAction(
          adminId,
          "user_update",
          "agent",
          created.agent.id,
          {
            newValue: JSON.stringify({ agentCode: codeStr, username: usernameStr, defaultCurrency: defaultCur }),
            metadata: JSON.stringify({ originalAction: "agent_create", initialDeposit: initialDepositNum }),
          },
          req,
        );

        return res.status(201).json({ agent: created.agent });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- UPDATE ----------
  app.patch(
    "/api/admin/agents/:id",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });

        const existing = await getAgentById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Agent not found" });

        const body = req.body ?? {};
        const updates: Parameters<typeof updateAgent>[1] = {};

        if (body.commissionRateDeposit !== undefined) updates.commissionRateDeposit = clampDecimal(body.commissionRateDeposit, 0, 0.5, Number(existing.commissionRateDeposit)).toFixed(4);
        if (body.commissionRateWithdraw !== undefined) updates.commissionRateWithdraw = clampDecimal(body.commissionRateWithdraw, 0, 0.5, Number(existing.commissionRateWithdraw)).toFixed(4);
        if (body.commissionFixedDeposit !== undefined) updates.commissionFixedDeposit = clampDecimal(body.commissionFixedDeposit, 0, 1_000_000, Number(existing.commissionFixedDeposit)).toFixed(2);
        if (body.commissionFixedWithdraw !== undefined) updates.commissionFixedWithdraw = clampDecimal(body.commissionFixedWithdraw, 0, 1_000_000, Number(existing.commissionFixedWithdraw)).toFixed(2);
        if (body.dailyLimit !== undefined) updates.dailyLimit = clampDecimal(body.dailyLimit, 0, 1_000_000_000, Number(existing.dailyLimit)).toFixed(2);
        if (body.monthlyLimit !== undefined) updates.monthlyLimit = clampDecimal(body.monthlyLimit, 0, 100_000_000_000, Number(existing.monthlyLimit)).toFixed(2);
        if (body.balanceWarnThreshold !== undefined) updates.balanceWarnThreshold = clampDecimal(body.balanceWarnThreshold, 0, 1_000_000_000, Number(existing.balanceWarnThreshold)).toFixed(2);
        if (body.balanceFreezeThreshold !== undefined) updates.balanceFreezeThreshold = clampDecimal(body.balanceFreezeThreshold, 0, 1_000_000_000, Number(existing.balanceFreezeThreshold)).toFixed(2);
        if (body.balanceMinThreshold !== undefined) updates.balanceMinThreshold = clampDecimal(body.balanceMinThreshold, 0, 1_000_000_000, Number(existing.balanceMinThreshold)).toFixed(2);
        if (body.maxConcurrentRequests !== undefined) updates.maxConcurrentRequests = clampInt(body.maxConcurrentRequests, 1, 100, existing.maxConcurrentRequests);
        if (body.trafficWeight !== undefined) updates.trafficWeight = clampInt(body.trafficWeight, 0, 10000, existing.trafficWeight);
        if (body.awayMode !== undefined) updates.awayMode = Boolean(body.awayMode);
        if (body.allowedCurrencies !== undefined) {
          const list = normalizeCurrencyList(body.allowedCurrencies);
          if (list.length === 0) return res.status(400).json({ error: "allowedCurrencies cannot be empty" });
          updates.allowedCurrencies = list;
        }
        if (body.defaultCurrency !== undefined) {
          const def = String(body.defaultCurrency).toUpperCase();
          if (!SUPPORTED_CURRENCIES.has(def)) return res.status(400).json({ error: `unsupported defaultCurrency: ${def}` });
          updates.defaultCurrency = def;
        }

        const updated = await updateAgent(req.params.id, updates);

        await logAdminAction(
          adminId,
          "settings_update",
          "agent",
          req.params.id,
          {
            previousValue: JSON.stringify({
              commissionRateDeposit: existing.commissionRateDeposit,
              commissionRateWithdraw: existing.commissionRateWithdraw,
              dailyLimit: existing.dailyLimit,
            }),
            newValue: JSON.stringify(updates),
            metadata: JSON.stringify({ originalAction: "agent_update" }),
          },
          req,
        );

        return res.json({ agent: updated });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- TOGGLE ACTIVE ----------
  app.post(
    "/api/admin/agents/:id/toggle-active",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });
        const existing = await getAgentById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Agent not found" });
        const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
        const newActive = !existing.isActive;
        const updated = await setAgentActive(req.params.id, newActive, reason);
        await logAdminAction(
          adminId,
          newActive ? "user_update" : "user_suspend",
          "agent",
          req.params.id,
          {
            previousValue: String(existing.isActive),
            newValue: String(newActive),
            reason,
            metadata: JSON.stringify({ originalAction: newActive ? "agent_activate" : "agent_suspend" }),
          },
          req,
        );
        return res.json({ agent: updated });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ---------- ADJUST BALANCE ----------
  app.post(
    "/api/admin/agents/:id/adjust-balance",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const adminId = req.admin?.id;
        if (!adminId) return res.status(401).json({ error: "Unauthorized" });
        const existing = await getAgentById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Agent not found" });

        const amount = Number(req.body?.amount);
        const currency = String(req.body?.currency ?? existing.defaultCurrency).toUpperCase();
        const reason = String(req.body?.reason ?? "").trim();

        if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: "amount must be non-zero finite" });
        if (Math.abs(amount) > 1_000_000_000) return res.status(400).json({ error: "amount out of range" });
        if (reason.length < 3) return res.status(400).json({ error: "reason required (min 3 chars)" });
        const allowedCurrencies = Array.isArray(existing.allowedCurrencies) ? existing.allowedCurrencies : [];
        if (!allowedCurrencies.includes(currency)) {
          return res.status(400).json({ error: `currency ${currency} not allowed for this agent` });
        }

        const result = await db.transaction((tx) =>
          adminAdjustAgentWallet(tx, {
            agentId: req.params.id,
            currency,
            amount,
            reason,
            adminUserId: adminId,
          }),
        );

        await logAdminAction(
          adminId,
          "user_balance_adjust",
          "agent",
          req.params.id,
          {
            newValue: JSON.stringify({ amount, currency, balanceAfter: result.wallet.balance }),
            reason,
            metadata: JSON.stringify({ originalAction: "agent_balance_adjust", ledgerId: result.ledger.id }),
          },
          req,
        );

        return res.json({ wallet: result.wallet, ledger: result.ledger });
      } catch (error: unknown) {
        const code = (error as Error & { code?: string }).code;
        if (code === "AGENT_INSUFFICIENT_BALANCE") {
          return res.status(409).json({ error: getErrorMessage(error), code });
        }
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );
}

export type { AgentLedgerType };
