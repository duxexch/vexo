import type { Express } from "express";
import { registerSupportTicketRoutes } from "./support-ticket";
import { registerSupportMessageRoutes } from "./support-messages";

export function registerSupportChatRoutes(app: Express): void {
  registerSupportTicketRoutes(app);
  registerSupportMessageRoutes(app);
}
