import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, adminMiddleware, type AuthRequest } from "./middleware";
import { getErrorMessage } from "./helpers";
import { toSafeUser, toSafeUsers } from "../lib/safe-user";

export function registerUsersRoutes(app: Express): void {
  app.get("/api/users", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { role } = req.query;
      const users = await storage.listUsers(role as string);
      res.json(toSafeUsers(users));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Non-admin, non-self requests get limited public profile
      if (req.user!.id !== req.params.id && req.user!.role !== 'admin') {
        return res.json({
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.profilePicture,
          accountId: user.accountId,
          status: user.status,
          createdAt: user.createdAt,
        });
      }

      res.json(toSafeUser(user));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/users/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Whitelist allowed fields — never pass raw req.body
      const allowedFields = ['status', 'role', 'firstName', 'lastName', 'email', 'phone', 'profilePicture', 'country', 'language'];
      const sanitizedUpdate: Record<string, unknown> = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          let value = req.body[field];
          // Sanitize string values — strip HTML tags
          if (typeof value === 'string') {
            value = value.replace(/<[^>]*>/g, '').trim();
            if (value.length > 255) value = value.slice(0, 255);
          }
          sanitizedUpdate[field] = value;
        }
      }

      // Validate role if provided
      if (sanitizedUpdate.role && !['player', 'admin', 'agent'].includes(String(sanitizedUpdate.role))) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // Validate status if provided
      if (sanitizedUpdate.status && !['active', 'suspended', 'banned', 'inactive'].includes(String(sanitizedUpdate.status))) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const user = await storage.updateUser(req.params.id, sanitizedUpdate);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(toSafeUser(user));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
