import { WebSocket } from "ws";
import { db } from "../../db";
import { chatMessages, projectCurrencyLedger, projectCurrencyWallets, systemConfig } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";
import { sanitizePlainText } from "../../lib/input-security";

const CHAT_DELETE_MESSAGE_PRICE_KEY = "chat_delete_message_price";

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

async function getConfigDecimal(key: string, fallback: number): Promise<number> {
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  const parsed = Number.parseFloat(config?.value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function chargeDeleteAction(
  userId: string,
  amount: number,
  messageId: string,
  forEveryone: boolean,
): Promise<{ success: true; chargedAmount: number; newBalance: number } | { success: false; error: string }> {
  if (amount <= 0) {
    const wallet = await db.select().from(projectCurrencyWallets).where(eq(projectCurrencyWallets.userId, userId)).limit(1);
    return { success: true, chargedAmount: 0, newBalance: parseFloat(wallet[0]?.totalBalance || "0") };
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO project_currency_wallets (user_id)
        VALUES (${userId})
        ON CONFLICT (user_id) DO NOTHING
      `);

      const [wallet] = await tx.select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, userId))
        .for('update');

      if (!wallet) {
        throw new Error("Project currency wallet not found");
      }

      let earnedBalance = parseFloat(wallet.earnedBalance || "0");
      let purchasedBalance = parseFloat(wallet.purchasedBalance || "0");
      const totalBalance = earnedBalance + purchasedBalance;
      if (totalBalance < amount) {
        return { success: false as const, error: "Insufficient project currency balance to delete message" };
      }

      let remaining = amount;
      if (earnedBalance >= remaining) {
        earnedBalance = toMoney(earnedBalance - remaining);
        remaining = 0;
      } else {
        remaining = toMoney(remaining - earnedBalance);
        earnedBalance = 0;
        purchasedBalance = toMoney(Math.max(0, purchasedBalance - remaining));
      }

      const balanceBefore = parseFloat(wallet.totalBalance || "0");
      const balanceAfter = toMoney(earnedBalance + purchasedBalance);

      await tx.update(projectCurrencyWallets)
        .set({
          earnedBalance: earnedBalance.toFixed(2),
          purchasedBalance: purchasedBalance.toFixed(2),
          totalBalance: balanceAfter.toFixed(2),
          totalSpent: toMoney(parseFloat(wallet.totalSpent || "0") + amount).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(projectCurrencyWallets.id, wallet.id));

      await tx.insert(projectCurrencyLedger).values({
        userId,
        walletId: wallet.id,
        type: "admin_adjustment",
        amount: (-amount).toFixed(2),
        balanceBefore: toMoney(balanceBefore).toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        referenceId: `chat_message_delete:${messageId}:${forEveryone ? "all" : "self"}`,
        referenceType: "chat_message_delete_charge",
        description: forEveryone ? "Delete message for everyone charge" : "Delete message for self charge",
      });

      return { success: true as const, chargedAmount: amount, newBalance: balanceAfter };
    });

    return result;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

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

  const deletePrice = await getConfigDecimal(CHAT_DELETE_MESSAGE_PRICE_KEY, 0);

  if (forEveryone && msg.senderId === ws.userId) {
    if (msg.deletedAt || msg.messageType === "deleted") {
      ws.send(JSON.stringify({ type: "message_deleted", data: { messageId, forEveryone: true } }));
      return;
    }

    const chargeResult = await chargeDeleteAction(ws.userId, toMoney(deletePrice), messageId, true);
    if (!chargeResult.success) {
      ws.send(JSON.stringify({
        type: "chat_error",
        code: "insufficient_delete_balance",
        error: chargeResult.error,
      }));
      return;
    }

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
    const deletedForUsers = Array.isArray(msg.deletedForUsers) ? msg.deletedForUsers : [];
    if (deletedForUsers.includes(ws.userId)) {
      ws.send(JSON.stringify({ type: "message_deleted", data: { messageId, forEveryone: false } }));
      return;
    }

    const chargeResult = await chargeDeleteAction(ws.userId, toMoney(deletePrice), messageId, false);
    if (!chargeResult.success) {
      ws.send(JSON.stringify({
        type: "chat_error",
        code: "insufficient_delete_balance",
        error: chargeResult.error,
      }));
      return;
    }

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

  const sanitized = sanitizePlainText(newContent, { maxLength: 2000 });
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
