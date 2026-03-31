import type { Express, Request, Response } from "express";
import { AuthRequest, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, sql } from "drizzle-orm";
import { advertisements, insertAdvertisementSchema } from "@shared/schema";

export function registerAdvertisementsRoutes(app: Express): void {

  // ==================== ADVERTISEMENTS API ====================

  // Get active advertisements (public)
  app.get("/api/advertisements", async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const ads = await db.select().from(advertisements)
        .where(and(
          eq(advertisements.isActive, true),
          or(
            sql`${advertisements.startsAt} IS NULL`,
            sql`${advertisements.startsAt} <= ${now}`
          ),
          or(
            sql`${advertisements.endsAt} IS NULL`,
            sql`${advertisements.endsAt} >= ${now}`
          )
        ))
        .orderBy(advertisements.sortOrder);
      res.json(ads);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Get all advertisements
  app.get("/api/admin/advertisements", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const ads = await db.select().from(advertisements).orderBy(advertisements.sortOrder);
      res.json(ads);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Create advertisement
  app.post("/api/admin/advertisements", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertAdvertisementSchema.parse(req.body);
      const [ad] = await db.insert(advertisements).values({
        ...data,
        createdBy: req.user!.id,
      }).returning();
      res.status(201).json(ad);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Update advertisement
  app.patch("/api/admin/advertisements/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [ad] = await db.update(advertisements)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(advertisements.id, id))
        .returning();
      if (!ad) {
        return res.status(404).json({ error: "Advertisement not found" });
      }
      res.json(ad);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Delete advertisement
  app.delete("/api/admin/advertisements/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await db.delete(advertisements).where(eq(advertisements.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
