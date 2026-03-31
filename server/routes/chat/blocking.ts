import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

export function registerBlockingRoutes(app: Express): void {

  // Block a user (chat context - uses users.blockedUsers array)
  app.post("/api/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;
      
      if (userId === targetUserId) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }
      
      const [targetUser] = await db.select({ id: users.id })
        .from(users).where(eq(users.id, targetUserId));
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const [user] = await db.select({ blockedUsers: users.blockedUsers })
        .from(users).where(eq(users.id, userId));
      
      const blockedUsers = user?.blockedUsers || [];
      if (blockedUsers.includes(targetUserId)) {
        return res.status(400).json({ error: "User already blocked" });
      }
      
      const newBlockedUsers = [...new Set([...blockedUsers, targetUserId])];
      
      await db.update(users)
        .set({ blockedUsers: newBlockedUsers })
        .where(eq(users.id, userId));
      
      res.json({ success: true, message: "User blocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Unblock a user (chat context)
  app.delete("/api/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;
      
      const [user] = await db.select({ blockedUsers: users.blockedUsers })
        .from(users).where(eq(users.id, userId));
      
      const blockedUsers = user?.blockedUsers || [];
      const newBlockedUsers = blockedUsers.filter((id: string) => id !== targetUserId);
      
      await db.update(users)
        .set({ blockedUsers: newBlockedUsers })
        .where(eq(users.id, userId));
      
      res.json({ success: true, message: "User unblocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Mute a user
  app.post("/api/users/:userId/mute", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;
      
      if (userId === targetUserId) {
        return res.status(400).json({ error: "Cannot mute yourself" });
      }
      
      const [targetUser] = await db.select({ id: users.id })
        .from(users).where(eq(users.id, targetUserId));
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const [user] = await db.select({ mutedUsers: users.mutedUsers })
        .from(users).where(eq(users.id, userId));
      
      const mutedUsers = user?.mutedUsers || [];
      if (mutedUsers.includes(targetUserId)) {
        return res.status(400).json({ error: "User already muted" });
      }
      
      const newMutedUsers = [...new Set([...mutedUsers, targetUserId])];
      
      await db.update(users)
        .set({ mutedUsers: newMutedUsers })
        .where(eq(users.id, userId));
      
      res.json({ success: true, message: "User muted" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Unmute a user
  app.delete("/api/users/:userId/mute", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;
      
      const [user] = await db.select({ mutedUsers: users.mutedUsers })
        .from(users).where(eq(users.id, userId));
      
      const mutedUsers = user?.mutedUsers || [];
      const newMutedUsers = mutedUsers.filter((id: string) => id !== targetUserId);
      
      await db.update(users)
        .set({ mutedUsers: newMutedUsers })
        .where(eq(users.id, userId));
      
      res.json({ success: true, message: "User unmuted" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get blocked and muted users
  app.get("/api/users/blocked-muted", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      
      const [user] = await db.select({ 
        blockedUsers: users.blockedUsers,
        mutedUsers: users.mutedUsers
      }).from(users).where(eq(users.id, userId));
      
      res.json({ 
        blockedUsers: user?.blockedUsers || [],
        mutedUsers: user?.mutedUsers || []
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
