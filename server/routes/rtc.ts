import type { Express, Response } from "express";
import { authMiddleware, type AuthRequest } from "./middleware";
import { buildIceServers } from "../lib/turn-credentials";

/**
 * GET /api/rtc/ice-servers
 *
 * Returns ephemeral STUN+TURN configuration for the authenticated user.
 * The TURN credentials use the standard time-limited shared-secret format
 * supported by coturn.
 */
export function registerRtcRoutes(app: Express): void {
  app.get("/api/rtc/ice-servers", authMiddleware, (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const config = buildIceServers(userId);
      res.set("Cache-Control", "no-store");
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
