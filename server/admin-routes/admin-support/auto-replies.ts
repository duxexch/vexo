import type { Express, Response } from "express";
import { supportAutoReplies } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "../helpers";

export function registerAutoRepliesRoutes(app: Express) {

  // ==================== AUTO-REPLIES CRUD ====================

  app.get("/api/admin/support-chat/auto-replies", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const replies = await db.select().from(supportAutoReplies)
        .orderBy(desc(supportAutoReplies.priority));
      res.json(replies);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/support-chat/auto-replies", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { trigger, response, responseAr, priority } = req.body;
      if (!trigger || !response) return res.status(400).json({ error: "Trigger and response required" });

      const [reply] = await db.insert(supportAutoReplies).values({
        trigger: trigger.trim(),
        response: response.trim(),
        responseAr: responseAr?.trim() || null,
        priority: priority || 0,
        isEnabled: true,
      }).returning();

      res.json(reply);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/support-chat/auto-replies/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { trigger, response, responseAr, priority, isEnabled } = req.body;

      const [reply] = await db.update(supportAutoReplies)
        .set({
          ...(trigger !== undefined && { trigger: trigger.trim() }),
          ...(response !== undefined && { response: response.trim() }),
          ...(responseAr !== undefined && { responseAr: responseAr?.trim() || null }),
          ...(priority !== undefined && { priority }),
          ...(isEnabled !== undefined && { isEnabled }),
          updatedAt: new Date(),
        })
        .where(eq(supportAutoReplies.id, id))
        .returning();

      if (!reply) return res.status(404).json({ error: "Auto-reply not found" });
      res.json(reply);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/support-chat/auto-replies/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [deleted] = await db.delete(supportAutoReplies)
        .where(eq(supportAutoReplies.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "Auto-reply not found" });
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
