import type { Express } from "express";
import { registerTournamentListingRoutes } from "./listing";
import { registerTournamentRegistrationRoutes } from "./registration";

export function registerTournamentRoutes(app: Express): void {
  registerTournamentListingRoutes(app);
  registerTournamentRegistrationRoutes(app);
}
