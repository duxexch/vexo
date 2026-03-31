import type { Express } from "express";
import { registerContentCrudRoutes } from "./crud";
import { registerChatManagementRoutes } from "./chat-management";

export function registerAdminContentRoutes(app: Express) {
  registerContentCrudRoutes(app);
  registerChatManagementRoutes(app);
}
