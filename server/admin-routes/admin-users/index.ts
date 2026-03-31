import type { Express } from "express";
import { registerUserCrudRoutes } from "./crud";
import { registerUserModerationRoutes } from "./moderation";
import { registerUserFinancialRoutes } from "./financial";
import { registerComplaintsRoutes } from "./complaints";

export function registerAdminUsersRoutes(app: Express) {
  registerUserCrudRoutes(app);
  registerUserModerationRoutes(app);
  registerUserFinancialRoutes(app);
  registerComplaintsRoutes(app);
}
