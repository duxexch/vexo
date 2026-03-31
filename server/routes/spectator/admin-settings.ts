import type { Express, Response } from "express";
import { storage } from "../../storage";
import { adminTokenMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "../helpers";

export function registerSpectatorAdminRoutes(app: Express): void {

  // Get all support settings
  app.get("/api/admin/support-settings", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getSupportSettingsList();
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get support settings by game type
  app.get("/api/admin/support-settings/:gameType", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getSupportSettings(req.params.gameType);
      if (!settings) {
        return res.status(404).json({ error: "Support settings not found for this game type" });
      }
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update support settings
  app.put("/api/admin/support-settings/:gameType", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.updateSupportSettings(req.params.gameType, req.body);
      if (!settings) {
        return res.status(404).json({ error: "Support settings not found for this game type" });
      }
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create support settings
  app.post("/api/admin/support-settings", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { gameType, ...settingsData } = req.body;
      if (!gameType) {
        return res.status(400).json({ error: "gameType is required" });
      }
      const existing = await storage.getSupportSettings(gameType);
      if (existing) {
        return res.status(400).json({ error: "Support settings already exist for this game type" });
      }
      const settings = await storage.createSupportSettings({ gameType, ...settingsData });
      res.status(201).json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
