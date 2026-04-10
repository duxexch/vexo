import type { Express } from "express";
import { registerAdminProjectCurrencyRoutes } from "./project-currency";
import { registerFreePlayConfigRoutes } from "./free-play-config";
import { registerFreePlayActivityRoutes } from "./free-play-activity";
import { registerFreePlayInsightsRoutes } from "./free-play-insights";

export function registerAdminCurrencyRoutes(app: Express) {
  registerAdminProjectCurrencyRoutes(app);
  registerFreePlayConfigRoutes(app);
  registerFreePlayActivityRoutes(app);
  registerFreePlayInsightsRoutes(app);
}
