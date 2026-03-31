import type { Express } from "express";
import { registerPasswordResetRoutes } from "./reset";
import { registerIdentifierRoutes } from "./identifier";

export function registerPasswordRoutes(app: Express) {
  registerPasswordResetRoutes(app);
  registerIdentifierRoutes(app);
}
