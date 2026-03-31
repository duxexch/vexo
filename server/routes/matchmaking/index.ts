import type { Express } from "express";
import { registerQueueRoutes } from "./queue";
import { registerMatchRoutes } from "./matches";

export function registerMatchmakingRoutes(app: Express): void {
  registerQueueRoutes(app);
  registerMatchRoutes(app);
}
