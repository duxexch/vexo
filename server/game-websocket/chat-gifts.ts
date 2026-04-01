import { storage } from '../storage';
import { db } from '../db';
import { gameplaySettings, users } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { chatRateLimiter, giftRateLimiter } from '../lib/rate-limiter';
import { filterMessage } from '../lib/word-filter';
import { getCachedUserBlockLists } from '../lib/redis';
import type { AuthenticatedWebSocket } from './types';
import { rooms } from './types';
import { send, sendError, broadcastToRoom, broadcastToRoomFiltered } from './utils';

export async function handleChat(ws: AuthenticatedWebSocket, payload: { message: string }) {
  if (!ws.sessionId) {
    sendError(ws, 'Not in a game');
    return;
  }

  if (!ws.userId) {
    sendError(ws, 'Not authenticated');
    return;
  }

  const rateLimitResult = chatRateLimiter.check(ws.userId);
  if (!rateLimitResult.allowed) {
    send(ws, {
      type: 'chat_error',
      payload: { code: 'rate_limit', retryAfterMs: rateLimitResult.retryAfterMs }
    });
    return;
  }

  // SECURITY: Enforce max message length before processing
  const rawMessage = typeof payload.message === 'string' ? payload.message.slice(0, 500) : '';
  if (!rawMessage.trim()) return;

  const filterResult = filterMessage(rawMessage);
  const messageToSend = filterResult.filteredMessage;

  const room = rooms.get(ws.sessionId);
  if (!room) return;

  // Use cached block/mute lists instead of DB query every time (was 1 DB query per message)
  const { blockedUsers } = await getCachedUserBlockLists(ws.userId, async (id) => {
    const user = await storage.getUser(id);
    return user ? { blockedUsers: user.blockedUsers || [], mutedUsers: user.mutedUsers || [] } : null;
  });

  // Async DB write — non-blocking (fire and forget for chat messages)
  storage.addGameChatMessage({
    sessionId: ws.sessionId,
    userId: ws.userId,
    message: messageToSend,
    messageType: 'text',
    isFromSpectator: ws.isSpectator || false
  }).catch(error => {
    console.error('Error saving chat message:', error);
  });

  broadcastToRoomFiltered(room, {
    type: 'chat_message',
    payload: {
      userId: ws.userId,
      username: ws.username,
      message: messageToSend,
      isSpectator: ws.isSpectator,
      timestamp: Date.now(),
      wasFiltered: !filterResult.isClean
    }
  }, ws.userId, blockedUsers);
}

export async function handleSendGift(ws: AuthenticatedWebSocket, payload: { recipientId: string; giftItemId: string; quantity: number; message?: string }) {
  if (!ws.userId || !ws.sessionId) {
    sendError(ws, 'Not authenticated or not in a game');
    return;
  }

  // SECURITY: Validate gift quantity — prevent negative/zero/float/huge values
  if (!payload.quantity || !Number.isInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 100) {
    sendError(ws, 'Invalid gift quantity (must be 1-100)');
    return;
  }

  const rateLimitResult = giftRateLimiter.check(ws.userId);
  if (!rateLimitResult.allowed) {
    send(ws, {
      type: 'gift_error',
      payload: { code: 'rate_limit', retryAfterMs: rateLimitResult.retryAfterMs }
    });
    return;
  }

  const recipient = await storage.getUser(payload.recipientId);
  if (recipient?.blockedUsers?.includes(ws.userId)) {
    sendError(ws, 'Cannot send gift to this user');
    return;
  }

  const room = rooms.get(ws.sessionId);
  if (!room) return;

  const session = await storage.getLiveGameSession(ws.sessionId);
  if (!session) {
    sendError(ws, 'Game session not found');
    return;
  }

  const participantIds = [
    session.player1Id,
    session.player2Id,
    session.player3Id,
    session.player4Id,
  ].filter(Boolean) as string[];

  const isSenderPlayer = participantIds.includes(ws.userId);
  const isSenderSpectator = Boolean(ws.spectatorId && room.spectators.has(ws.spectatorId))
    || Array.from(room.spectators.values()).some((socket) => socket.userId === ws.userId);

  if (!isSenderPlayer && !isSenderSpectator) {
    sendError(ws, 'You are not part of this game room');
    return;
  }

  if (!participantIds.includes(payload.recipientId)) {
    sendError(ws, 'Recipient must be an active player in this match');
    return;
  }

  try {
    const [currencyModeSetting] = await db.select({ value: gameplaySettings.value })
      .from(gameplaySettings)
      .where(eq(gameplaySettings.key, 'play_gift_currency_mode'))
      .limit(1);
    const enforceProjectOnly = !currencyModeSetting || currencyModeSetting.value !== 'mixed';
    if (enforceProjectOnly) {
      sendError(ws, 'Direct real-money gifts are disabled. Purchase gifts with project currency first.');
      return;
    }

    const giftItem = await storage.getGiftItem(payload.giftItemId);
    if (!giftItem) {
      sendError(ws, 'Gift not found');
      return;
    }

    const totalPrice = parseFloat(giftItem.price) * payload.quantity;
    const recipientEarnings = totalPrice * (parseFloat(giftItem.creatorShare) / 100);
    const platformFee = totalPrice - recipientEarnings;
    const normalizedIdempotencyKey = typeof (payload as { idempotencyKey?: unknown }).idempotencyKey === 'string'
      ? (payload as { idempotencyKey?: string }).idempotencyKey!.trim().slice(0, 128)
      : '';
    const idempotencyReference = normalizedIdempotencyKey
      ? `live_game_gift_idem:${ws.sessionId}:${ws.userId}:${normalizedIdempotencyKey}`
      : undefined;

    // FIX: Single atomic transaction — deduct totalPrice from sender, credit recipientEarnings to recipient
    // Platform fee stays deducted (sender pays totalPrice, recipient gets recipientEarnings)
    const giftResult = await db.transaction(async (tx) => {
      if (idempotencyReference) {
        const { transactions } = await import('@shared/schema');
        const [existing] = await tx.select({ id: transactions.id }).from(transactions)
          .where(and(
            eq(transactions.referenceId, idempotencyReference),
            eq(transactions.userId, ws.userId!),
            eq(transactions.type, 'gift_sent'),
            eq(transactions.status, 'completed')
          ))
          .for('update')
          .limit(1);

        if (existing) {
          return { success: false, error: 'Gift already processed' };
        }
      }

      // Lock both users in consistent order to prevent deadlocks
      const [id1, id2] = [ws.userId!, payload.recipientId].sort();
      const [user1] = await tx.select().from(users).where(eq(users.id, id1)).for('update');
      const [user2] = await tx.select().from(users).where(eq(users.id, id2)).for('update');

      const sender = id1 === ws.userId ? user1 : user2;
      const recipient = id1 === ws.userId ? user2 : user1;

      if (!sender || !recipient) {
        return { success: false, error: 'User not found' };
      }

      const senderBalance = parseFloat(sender.balance);
      if (senderBalance < totalPrice) {
        return { success: false, error: 'Insufficient balance' };
      }

      const senderNewBalance = (senderBalance - totalPrice).toFixed(2);
      const recipientNewBalance = (parseFloat(recipient.balance) + recipientEarnings).toFixed(2);

      await tx.update(users).set({ balance: senderNewBalance, updatedAt: new Date() }).where(eq(users.id, ws.userId!));
      await tx.update(users).set({ balance: recipientNewBalance, updatedAt: new Date() }).where(eq(users.id, payload.recipientId));

      // Audit trail
      const { transactions } = await import('@shared/schema');
      const transferReference = idempotencyReference || `live_game_gift:${ws.sessionId}:${ws.userId}:${payload.recipientId}:${Date.now()}`;

      await tx.insert(transactions).values({
        userId: ws.userId!,
        type: 'gift_sent',
        amount: totalPrice.toFixed(2),
        balanceBefore: senderBalance.toFixed(2),
        balanceAfter: senderNewBalance,
        status: 'completed',
        description: `Gift: ${giftItem.name} x${payload.quantity} to ${payload.recipientId}`,
        referenceId: transferReference,
        processedAt: new Date()
      });
      await tx.insert(transactions).values({
        userId: payload.recipientId,
        type: 'gift_received',
        amount: recipientEarnings.toFixed(2),
        balanceBefore: parseFloat(recipient.balance).toFixed(2),
        balanceAfter: recipientNewBalance,
        status: 'completed',
        description: `Gift: ${giftItem.name} x${payload.quantity} from ${ws.userId}`,
        referenceId: transferReference,
        processedAt: new Date()
      });

      if (platformFee > 0) {
        await tx.insert(transactions).values({
          userId: ws.userId!,
          type: 'platform_fee',
          amount: platformFee.toFixed(2),
          balanceBefore: senderBalance.toFixed(2),
          balanceAfter: senderNewBalance,
          status: 'completed',
          description: `Platform fee: ${giftItem.name} x${payload.quantity}`,
          referenceId: transferReference,
          processedAt: new Date()
        });
      }

      return { success: true, senderNewBalance, transferReference };
    });

    if (!giftResult.success) {
      sendError(ws, giftResult.error || 'Failed to send gift');
      return;
    }

    await storage.addSpectatorGift({
      sessionId: ws.sessionId,
      senderId: ws.userId,
      recipientId: payload.recipientId,
      giftItemId: payload.giftItemId,
      quantity: payload.quantity,
      totalPrice: totalPrice.toString(),
      recipientEarnings: recipientEarnings.toString(),
      message: payload.message
    });

    broadcastToRoom(room, {
      type: 'gift_received',
      payload: {
        senderId: ws.userId,
        senderUsername: ws.username,
        recipientId: payload.recipientId,
        giftItem: giftItem,
        quantity: payload.quantity,
        message: payload.message
      }
    });

    send(ws, {
      type: 'gift_sent',
      payload: { success: true, newBalance: parseFloat(giftResult.senderNewBalance!) }
    });

  } catch (error) {
    console.error('[WS] Error sending gift:', error);
    sendError(ws, 'Failed to send gift');
  }
}
