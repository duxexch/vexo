import type { Express, Response } from "express";
import { db } from "../../db";
import { and, eq } from "drizzle-orm";
import { challengerFollows as challengerFollowsTable } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

export function registerFollowsRoutes(app: Express) {
  app.get("/api/challenger-follows", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const follows = await db.select()
        .from(challengerFollowsTable)
        .where(eq(challengerFollowsTable.followerId, req.user!.id));
      res.json(follows.map(f => ({ userId: f.followedId })));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/challenger-follows", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { followedId } = req.body;
      
      if (followedId === req.user!.id) {
        return res.status(400).json({ error: "Cannot follow yourself" });
      }
      
      const [existing] = await db.select()
        .from(challengerFollowsTable)
        .where(and(
          eq(challengerFollowsTable.followerId, req.user!.id),
          eq(challengerFollowsTable.followedId, followedId)
        ));
      
      if (existing) {
        return res.status(400).json({ error: "Already following this challenger" });
      }
      
      const [follow] = await db.insert(challengerFollowsTable).values({
        followerId: req.user!.id,
        followedId,
      }).returning();
      
      res.json(follow);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/challenger-follows/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const result = await db.delete(challengerFollowsTable)
        .where(and(
          eq(challengerFollowsTable.followerId, req.user!.id),
          eq(challengerFollowsTable.followedId, userId)
        ))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Follow not found" });
      }
      
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
