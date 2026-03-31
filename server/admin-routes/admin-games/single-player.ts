import type { Express, Response } from "express";
import { games, type GameStatus } from "@shared/schema";
import { broadcastSystemEvent } from "../../websocket";
import { db } from "../../db";
import { eq, and, sql, like, type SQL } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerSinglePlayerRoutes(app: Express) {

  // ==================== SINGLE-PLAYER GAMES MANAGEMENT ====================

  app.get("/api/admin/games", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { category, status, search } = req.query;
      const conditions: SQL[] = [];

      if (category && category !== "all") {
        conditions.push(eq(games.category, String(category)));
      }
      if (status && status !== "all") {
        conditions.push(eq(games.status, String(status) as GameStatus));
      }
      if (search) {
        const searchTerm = `%${String(search).toLowerCase()}%`;
        conditions.push(
          like(sql`LOWER(${games.name})`, searchTerm)
        );
      }

      const allGames = conditions.length > 0
        ? await db.select().from(games).where(and(...conditions)).orderBy(games.sortOrder)
        : await db.select().from(games).orderBy(games.sortOrder);

      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [game] = await db.select().from(games).where(eq(games.id, id));
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      res.json(game);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/games", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = req.body;
      const [existing] = await db.select().from(games).where(eq(games.name, data.name));
      if (existing) {
        return res.status(400).json({ error: "A game with this name already exists" });
      }

      const [newGame] = await db.insert(games).values({
        name: data.name,
        description: data.description,
        category: data.category,
        imageUrl: data.imageUrl,
        status: data.status,
        sortOrder: data.sortOrder,
        isFeatured: data.isFeatured,
        createdBy: req.admin!.id,
      }).returning();

      await logAdminAction(req.admin!.id, "settings_change", "game", newGame.id, {
        newValue: JSON.stringify({ name: newGame.name, category: newGame.category })
      }, req);

      broadcastSystemEvent({
        type: 'game_config_changed',
        data: { action: 'create', gameId: newGame.id, gameName: newGame.name }
      });

      res.status(201).json(newGame);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [existing] = await db.select().from(games).where(eq(games.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Game not found" });
      }

      // SECURITY: Whitelist game update fields
      const safeUpdates: Record<string, any> = {};
      const allowedGameFields = ['name', 'nameAr', 'description', 'descriptionAr', 'category', 'sections', 'gameType', 'imageUrl', 'thumbnailUrl', 'iconUrl', 'status', 'sortOrder', 'isFeatured', 'minBet', 'maxBet', 'rtp', 'houseEdge', 'volatility', 'minPlayers', 'maxPlayers', 'isFreeToPlay', 'playPrice', 'pricingType'];
      for (const key of allowedGameFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }

      const [updated] = await db.update(games)
        .set({ ...safeUpdates, updatedAt: new Date() })
        .where(eq(games.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "game", id, {
        previousValue: JSON.stringify({ name: existing.name, status: existing.status }),
        newValue: JSON.stringify({ name: updated.name, status: updated.status })
      }, req);

      broadcastSystemEvent({
        type: 'game_config_changed',
        data: { action: 'update', gameId: updated.id, gameName: updated.name, changes: Object.keys(updates) }
      });

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [existing] = await db.select().from(games).where(eq(games.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Game not found" });
      }

      await db.delete(games).where(eq(games.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "game", id, {
        previousValue: JSON.stringify({ name: existing.name }),
        reason: "Game deleted"
      }, req);

      broadcastSystemEvent({
        type: 'game_config_changed',
        data: { action: 'delete', gameId: id, gameName: existing.name }
      });

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
