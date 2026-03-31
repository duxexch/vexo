import type { Express } from "express";
import { registerFeatureFlagsRoutes } from "./feature-flags";
import { registerThemesRoutes } from "./themes";
import { registerAppSettingsRoutes } from "./app-settings";
import { registerLoginGameplayRoutes } from "./login-gameplay";

export function registerAdminSettingsRoutes(app: Express) {
  registerFeatureFlagsRoutes(app);
  registerThemesRoutes(app);
  registerAppSettingsRoutes(app);
  registerLoginGameplayRoutes(app);
}
