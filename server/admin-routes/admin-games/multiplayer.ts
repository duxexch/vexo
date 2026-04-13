import type { Express, Response } from "express";
import { multiplayerGames, insertMultiplayerGameSchema } from "@shared/schema";
import { broadcastSystemEvent } from "../../websocket";
import { emitGameChangeAlert } from "../../lib/admin-alerts";
import { db } from "../../db";
import { eq, and, or, sql, like, type SQL } from "drizzle-orm";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { storage } from "../../storage";

export function registerMultiplayerRoutes(app: Express) {

  // ==================== MULTIPLAYER GAMES MANAGEMENT ====================

  app.get("/api/admin/multiplayer-games", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { category, isActive, search } = req.query;

      const conditions: SQL[] = [];

      if (category && category !== "all") {
        conditions.push(eq(multiplayerGames.key, String(category)));
      }
      if (isActive !== undefined && isActive !== "all") {
        conditions.push(eq(multiplayerGames.isActive, isActive === "true"));
      }
      if (search) {
        const searchTerm = `%${String(search).toLowerCase()}%`;
        conditions.push(
          or(
            like(sql`LOWER(${multiplayerGames.nameEn})`, searchTerm),
            like(sql`LOWER(${multiplayerGames.nameAr})`, searchTerm),
            like(sql`LOWER(${multiplayerGames.key})`, searchTerm)
          )!
        );
      }

      const allGames = conditions.length > 0
        ? await db.select().from(multiplayerGames).where(and(...conditions)).orderBy(multiplayerGames.sortOrder)
        : await db.select().from(multiplayerGames).orderBy(multiplayerGames.sortOrder);

      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/multiplayer-games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [game] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.id, id));
      if (!game) {
        return res.status(404).json({ error: "Multiplayer game not found" });
      }
      res.json(game);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/multiplayer-games", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const validatedData = insertMultiplayerGameSchema.parse(req.body);

      const [existing] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.key, validatedData.key));
      if (existing) {
        return res.status(400).json({ error: "A game with this key already exists" });
      }

      const [newGame] = await db.insert(multiplayerGames).values(validatedData).returning();

      await logAdminAction(req.admin!.id, "settings_change", "multiplayer_game", newGame.id, {
        newValue: JSON.stringify({ key: newGame.key, nameEn: newGame.nameEn })
      }, req);

      await storage.setSystemConfig("multiplayer_games_version", Date.now().toString(), req.admin!.id);

      broadcastSystemEvent({
        type: 'game_config_changed',
        data: { action: 'create', gameId: newGame.id, gameKey: newGame.key }
      });

      await emitGameChangeAlert({
        gameId: newGame.id,
        gameKey: newGame.key,
        gameName: newGame.nameEn,
        action: "activated",
        message: `New multiplayer game "${newGame.nameEn}" created by ${req.admin!.username}`
      });

      res.status(201).json(newGame);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/multiplayer-games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [existing] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Multiplayer game not found" });
      }

      if (updates.key && updates.key !== existing.key) {
        const [keyExists] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.key, updates.key));
        if (keyExists) {
          return res.status(400).json({ error: "A game with this key already exists" });
        }
      }

      // SECURITY: Whitelist multiplayer game update fields
      const allowedMpFields = ['nameEn', 'nameAr', 'key', 'description', 'descriptionEn', 'descriptionAr', 'isActive', 'minPlayers', 'maxPlayers', 'minStake', 'maxStake', 'priceVex', 'houseFee', 'platformFeePercent', 'iconUrl', 'imageUrl', 'iconName', 'colorClass', 'gradientClass', 'sortOrder', 'rules', 'rulesAr', 'category', 'status', 'displayLocations', 'isFeatured', 'defaultTimeLimit', 'freePlayLimit', 'freePlayPeriod'];
      const safeUpdates: Record<string, any> = {};
      for (const key of allowedMpFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }

      const [updated] = await db.update(multiplayerGames)
        .set({
          ...safeUpdates,
          updatedAt: new Date()
        })
        .where(eq(multiplayerGames.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "multiplayer_game", id, {
        previousValue: JSON.stringify({
          nameEn: existing.nameEn,
          isActive: existing.isActive,
          minStake: existing.minStake,
          maxStake: existing.maxStake
        }),
        newValue: JSON.stringify({
          nameEn: updated.nameEn,
          isActive: updated.isActive,
          minStake: updated.minStake,
          maxStake: updated.maxStake
        })
      }, req);

      await storage.setSystemConfig("multiplayer_games_version", Date.now().toString(), req.admin!.id);

      broadcastSystemEvent({
        type: 'game_config_changed',
        data: { action: 'update', gameId: updated.id, gameKey: updated.key, changes: Object.keys(updates) }
      });

      const significantChange = updates.isActive !== undefined || updates.minStake || updates.maxStake;
      if (significantChange) {
        const action = updates.isActive === false ? "deactivated" : updates.isActive === true ? "activated" : "updated";
        await emitGameChangeAlert({
          gameId: updated.id,
          gameKey: updated.key,
          gameName: updated.nameEn,
          action,
          message: `Multiplayer game "${updated.nameEn}" ${action} by ${req.admin!.username}. Changed: ${Object.keys(updates).join(", ")}`
        });
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/multiplayer-games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [existing] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Multiplayer game not found" });
      }

      await db.delete(multiplayerGames).where(eq(multiplayerGames.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "multiplayer_game", id, {
        previousValue: JSON.stringify({ key: existing.key, nameEn: existing.nameEn }),
        reason: "Multiplayer game deleted"
      }, req);

      await storage.setSystemConfig("multiplayer_games_version", Date.now().toString(), req.admin!.id);

      broadcastSystemEvent({
        type: 'game_config_changed',
        data: { action: 'delete', gameId: id, gameKey: existing.key }
      });

      await emitGameChangeAlert({
        gameId: id,
        gameKey: existing.key,
        gameName: existing.nameEn,
        action: "deactivated",
        message: `Multiplayer game "${existing.nameEn}" deleted by ${req.admin!.username}`
      });

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
