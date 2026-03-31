import type { Express } from "express";
import { registerEmojisRoutes } from "./emojis";
import { registerSectionsRoutes } from "./sections";
import { registerMultiplayerGamesRoutes } from "./multiplayer-games";
import { registerScheduledChangesRoutes } from "./scheduled-changes";
import { registerAdvertisementsRoutes } from "./advertisements";

export function registerGameConfigRoutes(app: Express): void {
  registerEmojisRoutes(app);
  registerSectionsRoutes(app);
  registerMultiplayerGamesRoutes(app);
  registerScheduledChangesRoutes(app);
  registerAdvertisementsRoutes(app);
}
