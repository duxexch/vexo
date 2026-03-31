import type { Express } from "express";
import { registerTournamentCrudRoutes } from "./crud";
import { registerTournamentLifecycleRoutes } from "./lifecycle";
import { registerTournamentMatchRoutes } from "./matches";

export function registerAdminTournamentsRoutes(app: Express) {
  registerTournamentCrudRoutes(app);
  registerTournamentLifecycleRoutes(app);
  registerTournamentMatchRoutes(app);
}
