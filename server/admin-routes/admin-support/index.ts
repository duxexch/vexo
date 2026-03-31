import type { Express } from "express";
import { registerContactsRoutes } from "./contacts";
import { registerChatTicketsRoutes } from "./chat-tickets";
import { registerAutoRepliesRoutes } from "./auto-replies";
import { registerMediaSettingsRoutes } from "./media-settings";

export function registerAdminSupportRoutes(app: Express) {
  registerContactsRoutes(app);
  registerChatTicketsRoutes(app);
  registerAutoRepliesRoutes(app);
  registerMediaSettingsRoutes(app);
}
