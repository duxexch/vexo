import type { Express } from "express";
import { registerOAuthFlowRoutes } from "./oauth-flow";
import { registerOAuthAccountRoutes } from "./account-management";

export function registerOAuthRoutes(app: Express) {
  registerOAuthFlowRoutes(app);
  registerOAuthAccountRoutes(app);
}
