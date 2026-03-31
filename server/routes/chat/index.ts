import type { Express } from "express";
import { registerChatConversationRoutes } from "./chat-conversations";
import { registerChatMessagingRoutes } from "./chat-messaging";
import { registerBlockingRoutes } from "./blocking";
import { registerChatTranslationRoutes } from "./chat-translation";

export function registerChatRoutes(app: Express): void {
  registerChatConversationRoutes(app);
  registerChatMessagingRoutes(app);
  registerBlockingRoutes(app);
  registerChatTranslationRoutes(app);
}
