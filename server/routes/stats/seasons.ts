import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";

export function registerSeasonsRoutes(app: Express): void {

  app.get("/api/seasons", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const seasons = await storage.getSeasons();
      res.json(seasons);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/seasons/active", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const season = await storage.getActiveSeason();
      if (!season) return res.status(404).json({ error: "No active season" });
      res.json(season);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/seasons/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const season = await storage.getSeason(req.params.id);
      if (!season) return res.status(404).json({ error: "Season not found" });
      res.json(season);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/seasons/:id/leaderboard", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const seasonId = req.params.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const gameType = req.query.gameType as string | undefined;
      
      const season = await storage.getSeason(seasonId);
      if (!season) return res.status(404).json({ error: "Season not found" });
      
      const stats = await storage.getSeasonalStats(seasonId, limit, gameType);
      const rankedStats = stats.map((stat, index) => ({
        ...stat, rank: index + 1,
        winRate: stat.gamesPlayed > 0 ? Math.round((stat.gamesWon / stat.gamesPlayed) * 100) : 0,
      }));
      
      res.json({ season, leaderboard: rankedStats });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/seasons/:seasonId/stats", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const seasonId = req.params.seasonId;
      
      const stats = await storage.getUserSeasonalStats(userId, seasonId);
      if (!stats) {
        return res.json({
          seasonId, gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gamesDraw: 0,
          totalEarnings: "0.00", currentWinStreak: 0, longestWinStreak: 0,
        });
      }
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/seasons/:id/rewards", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const rewards = await storage.getSeasonRewards(req.params.id);
      res.json(rewards);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/seasons", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Whitelist allowed fields for season creation
      const { name, nameAr, description, descriptionAr, startDate, endDate, isActive, rewards } = req.body;
      const safeData: Record<string, any> = {};
      if (name) safeData.name = String(name).replace(/<[^>]*>/g, '').slice(0, 100);
      if (nameAr) safeData.nameAr = String(nameAr).replace(/<[^>]*>/g, '').slice(0, 100);
      if (description) safeData.description = String(description).replace(/<[^>]*>/g, '').slice(0, 1000);
      if (descriptionAr) safeData.descriptionAr = String(descriptionAr).replace(/<[^>]*>/g, '').slice(0, 1000);
      if (startDate) safeData.startDate = startDate;
      if (endDate) safeData.endDate = endDate;
      if (isActive !== undefined) safeData.isActive = Boolean(isActive);
      if (rewards) safeData.rewards = rewards;
      const season = await storage.createSeason(safeData as any);
      res.status(201).json(season);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/seasons/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Whitelist allowed fields for season update
      const { name, nameAr, description, descriptionAr, startDate, endDate, isActive, rewards } = req.body;
      const safeData: Record<string, any> = {};
      if (name) safeData.name = String(name).replace(/<[^>]*>/g, '').slice(0, 100);
      if (nameAr) safeData.nameAr = String(nameAr).replace(/<[^>]*>/g, '').slice(0, 100);
      if (description) safeData.description = String(description).replace(/<[^>]*>/g, '').slice(0, 1000);
      if (descriptionAr) safeData.descriptionAr = String(descriptionAr).replace(/<[^>]*>/g, '').slice(0, 1000);
      if (startDate) safeData.startDate = startDate;
      if (endDate) safeData.endDate = endDate;
      if (isActive !== undefined) safeData.isActive = Boolean(isActive);
      if (rewards) safeData.rewards = rewards;
      const season = await storage.updateSeason(req.params.id, safeData as any);
      if (!season) return res.status(404).json({ error: "Season not found" });
      res.json(season);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
