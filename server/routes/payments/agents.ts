import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, adminMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { toSafeUser } from "../../lib/safe-user";

export function registerAgentRoutes(app: Express): void {

  app.get("/api/agents", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const agents = await storage.listAgents();
      res.json(agents);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/agents", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, email, firstName, lastName, ...agentData } = req.body;
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await storage.createUser({
        username, password: hashedPassword, email, firstName, lastName, role: "agent", status: "active",
      });
      const agentCode = `AGT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const agent = await storage.createAgent({ userId: user.id, agentCode, ...agentData });
      res.status(201).json({ user: toSafeUser(user), agent });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/agents/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(agent);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/agents/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Whitelist allowed update fields
      const { status, commissionRate, maxDailyVolume, regions, isAvailable } = req.body;
      const safeData: Record<string, any> = {};
      if (status) safeData.status = String(status).slice(0, 20);
      if (commissionRate !== undefined) safeData.commissionRate = String(commissionRate);
      if (maxDailyVolume !== undefined) safeData.maxDailyVolume = String(maxDailyVolume);
      if (regions) safeData.regions = regions;
      if (isAvailable !== undefined) safeData.isAvailable = Boolean(isAvailable);
      const agent = await storage.updateAgent(req.params.id, safeData);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(agent);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/agents/:id/payment-methods", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const methods = await storage.getAgentPaymentMethods(req.params.id);
      res.json(methods);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/agents/:id/payment-methods", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Whitelist allowed fields for payment method creation
      const { type, name, accountNumber, holderName, bankName, isActive } = req.body;
      if (!type || !name) {
        return res.status(400).json({ error: "Type and name are required" });
      }
      const method = await storage.createAgentPaymentMethod({
        agentId: req.params.id,
        type: String(type).slice(0, 50) as any,
        name: String(name).replace(/<[^>]*>/g, '').slice(0, 100),
        accountNumber: accountNumber ? String(accountNumber).slice(0, 50) : undefined,
        holderName: holderName ? String(holderName).replace(/<[^>]*>/g, '').slice(0, 100) : undefined,
        bankName: bankName ? String(bankName).replace(/<[^>]*>/g, '').slice(0, 100) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });
      res.status(201).json(method);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
