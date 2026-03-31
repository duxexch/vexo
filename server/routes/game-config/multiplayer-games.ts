import type { Express, Request, Response } from "express";
import { AuthRequest, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { broadcastSystemEvent } from "../../websocket";
import { cacheGet } from "../../lib/redis";

export function registerMultiplayerGamesRoutes(app: Express): void {

  // ==================== MULTIPLAYER GAMES API (Single Source of Truth) ====================

  // Public: Get active multiplayer games
  app.get("/api/multiplayer-games", async (_req: Request, res: Response) => {
    try {
      const multiplayerGames = await cacheGet("multiplayer-games:active", 300, async () => {
        return await storage.listMultiplayerGames(true); // activeOnly = true
      });
      res.json(multiplayerGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Public: Get multiplayer game by key
  app.get("/api/multiplayer-games/:key", async (req: Request, res: Response) => {
    try {
      const game = await storage.getMultiplayerGameByKey(req.params.key);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      if (!game.isActive) {
        return res.status(404).json({ error: "Game is not available" });
      }
      res.json(game);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Public: Get config version for cache invalidation
  app.get("/api/config-version/:key", async (req: Request, res: Response) => {
    try {
      const version = await storage.getConfigVersion(req.params.key);
      res.json({ version });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Get all multiplayer games (including inactive)
  app.get("/api/admin/multiplayer-games", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const allGames = await storage.listMultiplayerGames(false); // all games
      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Create multiplayer game
  app.post("/api/admin/multiplayer-games", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { key, nameEn, nameAr, ...rest } = req.body;
      
      if (!key || !nameEn || !nameAr) {
        return res.status(400).json({ error: "key, nameEn, and nameAr are required" });
      }

      // Check if game with key already exists
      const existing = await storage.getMultiplayerGameByKey(key);
      if (existing) {
        return res.status(400).json({ error: `Game with key '${key}' already exists` });
      }

      const game = await storage.createMultiplayerGame({ key, nameEn, nameAr, ...rest });

      // Log admin action
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: 'game_update',
        entityType: 'multiplayer_game',
        entityId: game.id,
        newValue: game,
      });

      // Increment config version
      await storage.setSystemConfig('multiplayer_games_version', Date.now().toString(), req.user!.id);

      // Broadcast to all clients to refresh game config
      broadcastSystemEvent({ type: 'game_config_changed', data: { action: 'create', gameKey: game.key } });

      res.status(201).json(game);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Update multiplayer game
  app.patch("/api/admin/multiplayer-games/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const oldGame = await storage.getMultiplayerGame(id);
      
      if (!oldGame) {
        return res.status(404).json({ error: "Game not found" });
      }

      const updated = await storage.updateMultiplayerGame(id, req.body);

      // Log admin action
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: 'game_update',
        entityType: 'multiplayer_game',
        entityId: id,
        oldValue: oldGame,
        newValue: updated,
      });

      // Increment config version
      await storage.setSystemConfig('multiplayer_games_version', Date.now().toString(), req.user!.id);

      // Broadcast to all clients to refresh game config
      broadcastSystemEvent({ type: 'game_config_changed', data: { action: 'update', gameKey: updated?.key } });

      res.json(updated);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Toggle multiplayer game active status
  app.post("/api/admin/multiplayer-games/:id/toggle", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const game = await storage.getMultiplayerGame(id);
      
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const updated = await storage.updateMultiplayerGame(id, { isActive: !game.isActive });

      // Log admin action
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: 'game_update',
        entityType: 'multiplayer_game',
        entityId: id,
        oldValue: { isActive: game.isActive },
        newValue: { isActive: updated?.isActive },
      });

      // Increment config version
      await storage.setSystemConfig('multiplayer_games_version', Date.now().toString(), req.user!.id);

      // Broadcast to all clients to refresh game config
      broadcastSystemEvent({ type: 'game_config_changed', data: { action: 'toggle', gameKey: updated?.key, isActive: updated?.isActive } });

      res.json(updated);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Delete multiplayer game
  app.delete("/api/admin/multiplayer-games/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const game = await storage.getMultiplayerGame(id);
      
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await storage.deleteMultiplayerGame(id);

      // Log admin action
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: 'game_update',
        entityType: 'multiplayer_game',
        entityId: id,
        oldValue: game,
      });

      // Increment config version
      await storage.setSystemConfig('multiplayer_games_version', Date.now().toString(), req.user!.id);

      // Broadcast to all clients to refresh game config
      broadcastSystemEvent({ type: 'game_config_changed', data: { action: 'delete', gameKey: game.key } });

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
