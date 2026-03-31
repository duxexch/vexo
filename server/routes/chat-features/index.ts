import type { Express } from "express";
import type { AuthMiddleware } from "./helpers";
import { registerE2EERoutes } from "./e2ee";
import { registerMediaRoutes } from "./media";
import { registerAutoDeleteRoutes } from "./auto-delete";
import { registerPinLockRoutes } from "./pin-lock";

export { isPinUnlocked } from "./pin-lock";

export function registerChatFeatureRoutes(app: Express, authMiddleware: AuthMiddleware): void {
  registerE2EERoutes(app, authMiddleware);
  registerMediaRoutes(app, authMiddleware);
  registerAutoDeleteRoutes(app, authMiddleware);
  registerPinLockRoutes(app, authMiddleware);
}
