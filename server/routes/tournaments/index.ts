import type { Express } from "express";
import { registerTournamentListingRoutes } from "./listing";
import { registerTournamentRegistrationRoutes } from "./registration";
// Phase 52: admin.ts → tournament-setup.ts + tournament-results.ts
import { registerTournamentSetupRoutes } from "./tournament-setup";
import { registerTournamentResultRoutes } from "./tournament-results";

export function registerTournamentRoutes(app: Express): void {
  registerTournamentListingRoutes(app);
  registerTournamentRegistrationRoutes(app);
  registerTournamentSetupRoutes(app);
  registerTournamentResultRoutes(app);
}
