import type { Express } from "express";
import { registerSpectatorAdminRoutes } from "./admin-settings";
import { registerSupportOddsRoutes } from "./support-odds";
import { registerSupportActionRoutes } from "./support-actions";

export function registerSpectatorRoutes(app: Express): void {
  registerSpectatorAdminRoutes(app);
  registerSupportOddsRoutes(app);
  registerSupportActionRoutes(app);
}
