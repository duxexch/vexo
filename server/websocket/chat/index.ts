import type { AuthenticatedSocket } from "../shared";
import { handleChatMessage, handleTyping } from "./messaging";
import { handleGetChatHistory, handleMessageRead, handleMarkChatRead, handleSearchMessages } from "./history";
import { handleDeleteMessage, handleEditMessage, handleReactToMessage } from "./actions";

/**
 * Handle all chat-related message types:
 * chat_message, typing, get_chat_history, message_read, mark_chat_read,
 * delete_message, edit_message, react_to_message, search_messages
 */
export async function handleChat(ws: AuthenticatedSocket, data: any): Promise<void> {
  switch (data.type) {
    case "chat_message":
      return handleChatMessage(ws, data);
    case "typing":
      return handleTyping(ws, data);
    case "get_chat_history":
      return handleGetChatHistory(ws, data);
    case "message_read":
      return handleMessageRead(ws, data);
    case "mark_chat_read":
      return handleMarkChatRead(ws, data);
    case "delete_message":
      return handleDeleteMessage(ws, data);
    case "edit_message":
      return handleEditMessage(ws, data);
    case "react_to_message":
      return handleReactToMessage(ws, data);
    case "search_messages":
      return handleSearchMessages(ws, data);
  }
}
