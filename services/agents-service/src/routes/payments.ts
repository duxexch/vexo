import type { Express, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import {
  agents,
  agentPaymentMethods,
  users,
  type InsertAgent,
  type InsertAgentPaymentMethod,
  type InsertUser,
} from "@shared/schema";
import { db } from "../db";
import { internalAuthMiddleware, type AdminRequest } from "../lib/auth";
import { getErrorMessage } from "../lib/errors";
import { sanitizePlainText } from "../lib/input-security";
import { toSafeUser } from "../lib/safe-user";

/**
 * Routes that mirror the legacy /api/agents/* endpoints used by the older
 * "payments" namespace in the main server. Trust is enforced by
 * internalAuthMiddleware (shared internal token + admin pass-through).
 */
export function registerAgentPaymentRoutes(app: Express): void {
  app.get(
    "/api/agents",
    internalAuthMiddleware,
    async (_req: AdminRequest, res: Response) => {
      try {
        const rows = await db.select().from(agents);
        res.json(rows);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.post(
    "/api/agents",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const { username, password, email, firstName, lastName, ...agentData } = req.body ?? {};

        if (!username || !password) {
          return res.status(400).json({ error: "username and password are required" });
        }

        const hashedPassword = await bcrypt.hash(String(password), 12);

        const userInsert: InsertUser = {
          username: String(username),
          usernameSelectedAt: new Date(),
          passwordHash: hashedPassword,
          email: email ? String(email) : null,
          fullName: [firstName, lastName].filter(Boolean).join(" ").trim() || null,
          role: "agent",
          status: "active",
        } as unknown as InsertUser;

        const [user] = await db.insert(users).values(userInsert).returning();

        const agentCode = `AGT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const insertAgent: InsertAgent = {
          userId: user.id,
          agentCode,
          ...(agentData as object),
        } as InsertAgent;

        const [agent] = await db.insert(agents).values(insertAgent).returning();

        res.status(201).json({ user: toSafeUser(user as unknown as Record<string, unknown>), agent });
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.get(
    "/api/agents/:id",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const [agent] = await db.select().from(agents).where(eq(agents.id, req.params.id)).limit(1);
        if (!agent) return res.status(404).json({ error: "Agent not found" });
        res.json(agent);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/agents/:id",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const { status, commissionRate, maxDailyVolume, regions, isAvailable } = req.body ?? {};
        const safeData: Record<string, unknown> = {};
        if (status) safeData.status = String(status).slice(0, 20);
        if (commissionRate !== undefined) safeData.commissionRate = String(commissionRate);
        if (maxDailyVolume !== undefined) safeData.maxDailyVolume = String(maxDailyVolume);
        if (regions) safeData.regions = regions;
        if (isAvailable !== undefined) safeData.isAvailable = Boolean(isAvailable);

        const [agent] = await db
          .update(agents)
          .set({ ...safeData, updatedAt: new Date() })
          .where(eq(agents.id, req.params.id))
          .returning();
        if (!agent) return res.status(404).json({ error: "Agent not found" });
        res.json(agent);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.get(
    "/api/agents/:id/payment-methods",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const methods = await db
          .select()
          .from(agentPaymentMethods)
          .where(eq(agentPaymentMethods.agentId, req.params.id));
        res.json(methods);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.post(
    "/api/agents/:id/payment-methods",
    internalAuthMiddleware,
    async (req: AdminRequest, res: Response) => {
      try {
        const { type, name, accountNumber, holderName, bankName, isActive } = req.body ?? {};
        if (!type || !name) {
          return res.status(400).json({ error: "Type and name are required" });
        }

        const insert: InsertAgentPaymentMethod = {
          agentId: req.params.id,
          type: String(type).slice(0, 50) as InsertAgentPaymentMethod["type"],
          name: sanitizePlainText(name, { maxLength: 100 }),
          accountNumber: accountNumber ? String(accountNumber).slice(0, 50) : null,
          holderName: holderName ? sanitizePlainText(holderName, { maxLength: 100 }) : null,
          bankName: bankName ? sanitizePlainText(bankName, { maxLength: 100 }) : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        } as InsertAgentPaymentMethod;

        const [method] = await db.insert(agentPaymentMethods).values(insert).returning();
        res.status(201).json(method);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );
}
