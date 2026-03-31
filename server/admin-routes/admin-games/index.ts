import type { Express } from "express";
import { registerSinglePlayerRoutes } from "./single-player";
import { registerMultiplayerRoutes } from "./multiplayer";
import { registerSocialPlatformsRoutes } from "./social-platforms";
import { registerAdminExternalGamesRoutes } from "./external-games";

export function registerAdminGamesRoutes(app: Express) {
  registerSinglePlayerRoutes(app);
  registerMultiplayerRoutes(app);
  registerSocialPlatformsRoutes(app);
  registerAdminExternalGamesRoutes(app);
}
