import { WebSocket } from "ws";
import { db } from "../../db";
import { chatMessages } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";

/**
 * Handle deleting a message (for everyone or for self only).
 */
export async function handleDeleteMessage(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { messageId, forEveryone } = data;
  if (!messageId) return;

  // Get the message
  const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
  if (!msg) return;

  // Security: only sender or receiver can delete
  if (msg.senderId !== ws.userId && msg.receiverId !== ws.userId) return;

  if (forEveryone && msg.senderId === ws.userId) {
    // Delete for everyone - soft delete
    await db.update(chatMessages)
      .set({ deletedAt: new Date(), messageType: "deleted", content: "" })
      .where(eq(chatMessages.id, messageId));

    // Notify both parties
    const outgoing = JSON.stringify({ type: "message_deleted", data: { messageId, forEveryone: true } });
    const otherUserId = msg.senderId === ws.userId ? msg.receiverId : msg.senderId;
    const otherSockets = clients.get(otherUserId);
    if (otherSockets) {
      otherSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) socket.send(outgoing);
      });
    }
    ws.send(outgoing);
  } else {
    // Delete for me only - add userId to deletedForUsers array
    await db.execute(sql`
      UPDATE chat_messages 
      SET deleted_for_users = array_append(COALESCE(deleted_for_users, ARRAY[]::text[]), ${ws.userId})
      WHERE id = ${messageId}
    `);
    ws.send(JSON.stringify({ type: "message_deleted", data: { messageId, forEveryone: false } }));
  }
}

/**
 * Handle editing a message (sender only, text messages only).
 */
export async function handleEditMessage(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { messageId, newContent } = data;
  if (!messageId || !newContent || typeof newContent !== 'string') return;

  const sanitized = String(newContent).replace(/<[^>]*>/g, '').slice(0, 2000).trim();
  if (!sanitized) return;

  // Only sender can edit their own text messages
  const [msg] = await db.select().from(chatMessages).where(
    and(eq(chatMessages.id, messageId), eq(chatMessages.senderId, ws.userId))
  );
  if (!msg || msg.messageType !== "text") return;

  await db.update(chatMessages)
    .set({ content: sanitized, isEdited: true, editedAt: new Date() })
    .where(eq(chatMessages.id, messageId));

  const editData = { messageId, newContent: sanitized, editedAt: new Date().toISOString() };
  const outgoing = JSON.stringify({ type: "message_edited", data: editData });

  // Notify receiver
  const otherUserId = msg.receiverId;
  const otherSockets = clients.get(otherUserId);
  if (otherSockets) {
    otherSockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) socket.send(outgoing);
    });
  }
  ws.send(outgoing);
}

/**
 * Handle toggling emoji reactions on a message.
 */
export async function handleReactToMessage(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { messageId, emoji } = data;
  if (!messageId || !emoji || typeof emoji !== 'string') return;

  // Validate emoji (max 10 chars)
  const safeEmoji = emoji.slice(0, 10);

  // Get current message
  const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
  if (!msg) return;

  // Security: only sender or receiver can react
  if (msg.senderId !== ws.userId && msg.receiverId !== ws.userId) return;

  // Toggle reaction
  const reactions: Record<string, string[]> = msg.reactions || {};
  if (!reactions[safeEmoji]) {
    reactions[safeEmoji] = [ws.userId];
  } else if (reactions[safeEmoji].includes(ws.userId)) {
    reactions[safeEmoji] = reactions[safeEmoji].filter((id: string) => id !== ws.userId);
    if (reactions[safeEmoji].length === 0) delete reactions[safeEmoji];
  } else {
    reactions[safeEmoji].push(ws.userId);
  }

  await db.update(chatMessages)
    .set({ reactions })
    .where(eq(chatMessages.id, messageId));

  const reactionData = { messageId, reactions, userId: ws.userId, emoji: safeEmoji };
  const outgoing = JSON.stringify({ type: "message_reaction", data: reactionData });

  // Notify both parties
  const otherUserId = msg.senderId === ws.userId ? msg.receiverId : msg.senderId;
  const otherSockets = clients.get(otherUserId);
  if (otherSockets) {
    otherSockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) socket.send(outgoing);
    });
  }
  ws.send(outgoing);
}
