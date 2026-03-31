import type { Express } from "express";
import { registerSocialListRoutes } from "./lists";
import { registerSocialActionRoutes } from "./actions";
import { registerSocialSearchRoutes } from "./search";

export function registerSocialRoutes(app: Express): void {
  registerSocialListRoutes(app);
  registerSocialActionRoutes(app);
  registerSocialSearchRoutes(app);
}
