import type { Express } from "express";
import { AuthRequest, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import type { Response } from "express";

export function registerScheduledChangesRoutes(app: Express): void {

  // ==================== SCHEDULED CONFIG CHANGES API ====================

  // Admin: List scheduled config changes
  app.get("/api/admin/scheduled-changes", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { gameId, status } = req.query;
      const changes = await storage.listScheduledConfigChanges(
        gameId as string | undefined,
        status as string | undefined
      );
      res.json(changes);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Create scheduled config change
  app.post("/api/admin/scheduled-changes", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { gameId, action, scheduledAt, changes, description } = req.body;

      if (!gameId || !action || !scheduledAt) {
        return res.status(400).json({ error: "gameId, action, and scheduledAt are required" });
      }

      // Validate game exists
      const game = await storage.getMultiplayerGame(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Validate scheduledAt is in the future
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: "Scheduled time must be in the future" });
      }

      const scheduled = await storage.createScheduledConfigChange({
        gameId,
        action,
        scheduledAt: scheduledDate,
        changes: changes ? JSON.stringify(changes) : null,
        description,
        createdBy: req.user!.id,
      });

      // Log admin action
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: 'create',
        entityType: 'scheduled_config_change',
        entityId: scheduled.id,
        newValue: scheduled,
      });

      res.status(201).json(scheduled);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Cancel scheduled config change
  app.post("/api/admin/scheduled-changes/:id/cancel", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const change = await storage.getScheduledConfigChange(id);

      if (!change) {
        return res.status(404).json({ error: "Scheduled change not found" });
      }

      const success = await storage.cancelScheduledConfigChange(id);
      if (!success) {
        return res.status(400).json({ error: "Cannot cancel - change is not pending" });
      }

      // Log admin action
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: 'cancel',
        entityType: 'scheduled_config_change',
        entityId: id,
        oldValue: change,
      });

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Get single scheduled change
  app.get("/api/admin/scheduled-changes/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const change = await storage.getScheduledConfigChange(id);
      if (!change) {
        return res.status(404).json({ error: "Scheduled change not found" });
      }
      res.json(change);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
