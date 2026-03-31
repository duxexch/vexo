import type { Express, Request, Response } from "express";
import { AuthRequest, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { gameSections, insertGameSectionSchema } from "@shared/schema";

export function registerSectionsRoutes(app: Express): void {

  // ==================== GAME SECTIONS API ====================

  // Public: Get active game sections
  app.get("/api/game-sections", async (_req: Request, res: Response) => {
    try {
      const sections = await db.select().from(gameSections)
        .where(eq(gameSections.isActive, true))
        .orderBy(asc(gameSections.sortOrder));
      res.json(sections);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: List all game sections
  app.get("/api/admin/game-sections", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const sections = await db.select().from(gameSections)
        .orderBy(asc(gameSections.sortOrder));
      res.json(sections);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Create game section
  app.post("/api/admin/game-sections", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertGameSectionSchema.parse(req.body);
      // Check for duplicate key
      const [existing] = await db.select().from(gameSections).where(eq(gameSections.key, data.key));
      if (existing) {
        return res.status(400).json({ error: "A section with this key already exists" });
      }
      const [section] = await db.insert(gameSections).values(data).returning();
      res.status(201).json(section);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Update game section
  app.patch("/api/admin/game-sections/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [existing] = await db.select().from(gameSections).where(eq(gameSections.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Section not found" });
      }
      const [updated] = await db.update(gameSections)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(gameSections.id, id))
        .returning();
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Delete game section
  app.delete("/api/admin/game-sections/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [existing] = await db.select().from(gameSections).where(eq(gameSections.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Section not found" });
      }
      await db.delete(gameSections).where(eq(gameSections.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
