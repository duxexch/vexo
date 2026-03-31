import type { Express } from "express";
import { registerPreferencesRoutes } from "./preferences";
import { registerIdVerificationRoutes } from "./id-verification";
import { registerMediaRoutes } from "./media";

export function registerProfileRoutes(app: Express): void {
  registerPreferencesRoutes(app);
  registerIdVerificationRoutes(app);
  registerMediaRoutes(app);
}
