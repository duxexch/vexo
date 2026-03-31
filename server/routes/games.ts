import type { Express, Request, Response } from "express";
import { authMiddleware, type AuthRequest } from "./middleware";
import { db } from "../db";
import { games } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { getErrorMessage } from "./helpers";
import { cacheGet } from "../lib/redis";

export function registerGamesRoutes(app: Express): void {
  // Public: List active games (cached 120s — game catalog rarely changes)
  app.get("/api/games", async (_req: Request, res: Response) => {
    try {
      const allGames = await cacheGet("games:active", 120, async () => {
        return db.select().from(games)
          .where(eq(games.status, "active"))
          .orderBy(games.sortOrder);
      });
      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Auth: List available games for logged-in user (cached 120s)
  app.get("/api/games/available", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const allGames = await cacheGet("games:available", 120, async () => {
        return db.select().from(games)
          .where(eq(games.status, "active"))
          .orderBy(games.sortOrder);
      });
      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Public: Most played games (cached 120s)
  app.get("/api/games/most-played", async (_req: Request, res: Response) => {
    try {
      const topGames = await cacheGet("games:most-played", 120, async () => {
        return db.select().from(games)
          .where(eq(games.status, "active"))
          .orderBy(desc(games.playCount));
      });
      res.json(topGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Public: Get game by ID
  app.get("/api/games/:id", async (req: Request, res: Response) => {
    try {
      const [game] = await db.select().from(games).where(eq(games.id, req.params.id));
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      res.json(game);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
