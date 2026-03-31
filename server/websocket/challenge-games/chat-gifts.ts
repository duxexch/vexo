import { WebSocket } from "ws";
import { db } from "../../db";
import { users, challengeGameSessions, challengeChatMessages, challenges } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { chatRateLimiter } from "../../lib/rate-limiter";
import { filterMessage } from "../../lib/word-filter";
import { storage } from "../../storage";
import { sanitizePlainText } from "../../lib/input-security";
import type { AuthenticatedSocket } from "../shared";
import { challengeGameRooms } from "../shared";

/** Handle challenge_chat message — only game participants (players), NOT spectators */
export async function handleChallengeChat(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, message, isQuickMessage, quickMessageKey } = data;

  // SECURITY: Rate limit challenge chat
  const rateLimitResult = chatRateLimiter.check(ws.userId!);
  if (!rateLimitResult.allowed) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Too many messages, slow down" }));
    return;
  }

  // SECURITY: Sanitize and limit message length
  const safeMessage = sanitizePlainText(message, { maxLength: 500 });
  if (!safeMessage.trim()) return;

  const room = challengeGameRooms.get(challengeId);

  if (!room) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Room not found" }));
    return;
  }

  // SECURITY: Only players can chat, spectators cannot
  if (!room.players.has(ws.userId!)) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Only players can chat" }));
    return;
  }

  // Get session
  const [session] = await db.select().from(challengeGameSessions)
    .where(eq(challengeGameSessions.challengeId, challengeId))
    .limit(1);

  if (!session) return;

  // Filter message content
  const chatFilterResult = filterMessage(safeMessage);

  // Get sender info
  const [sender] = await db.select({
    id: users.id,
    username: users.username,
    avatarUrl: users.profilePicture,
  }).from(users).where(eq(users.id, ws.userId!));

  // Save message
  const [savedMessage] = await db.insert(challengeChatMessages).values({
    sessionId: session.id,
    senderId: ws.userId!,
    message: chatFilterResult.filteredMessage,
    isQuickMessage: isQuickMessage || false,
    quickMessageKey: quickMessageKey ? String(quickMessageKey).slice(0, 50) : undefined,
    isSpectator: false,
  }).returning();

  const messageWithSender = {
    ...savedMessage,
    senderName: sender.username,
    senderAvatar: sender.avatarUrl,
  };

  // Broadcast to players only (not spectators)
  room.players.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "chat_message",
        message: messageWithSender
      }));
    }
  });
}

/** Handle gift_to_player message — gift sent notification to players */
export async function handleGiftToPlayer(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, recipientId, giftId } = data;
  const room = challengeGameRooms.get(challengeId);

  if (!room) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Room not found" }));
    return;
  }

  if (!room.players.has(ws.userId!) && !room.spectators.has(ws.userId!)) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "You are not part of this game room" }));
    return;
  }

  // SECURITY: Validate inputs
  if (!giftId || !recipientId || typeof giftId !== 'string' || typeof recipientId !== 'string') {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Invalid gift data" }));
    return;
  }

  // SECURITY: Cannot gift yourself
  if (recipientId === ws.userId) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Cannot gift yourself" }));
    return;
  }

  const [challenge] = await db.select({
    player1Id: challenges.player1Id,
    player2Id: challenges.player2Id,
    player3Id: challenges.player3Id,
    player4Id: challenges.player4Id,
  }).from(challenges).where(eq(challenges.id, challengeId)).limit(1);

  if (!challenge) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Challenge not found" }));
    return;
  }

  const participantIds = [
    challenge.player1Id,
    challenge.player2Id,
    challenge.player3Id,
    challenge.player4Id,
  ].filter(Boolean) as string[];

  if (!participantIds.includes(recipientId)) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Recipient must be a challenge participant" }));
    return;
  }

  // SECURITY: Validate gift exists in database and get server-side price/name
  const giftItem = await storage.getGiftItem(giftId);
  if (!giftItem) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Gift not found" }));
    return;
  }

  const giftPrice = parseFloat(giftItem.price);
  if (giftPrice <= 0) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Invalid gift price" }));
    return;
  }

  // SECURITY: Atomic balance deduction — prevent double-spend
  const txResult = await db.transaction(async (tx) => {
    const [sender] = await tx.select().from(users)
      .where(eq(users.id, ws.userId!)).for('update');

    if (!sender || parseFloat(sender.balance) < giftPrice) {
      return { success: false, error: 'Insufficient balance' };
    }

    await tx.update(users).set({
      balance: sql`(CAST(${users.balance} AS DECIMAL) - ${giftPrice})::TEXT`,
      updatedAt: new Date(),
    }).where(eq(users.id, ws.userId!));

    return { success: true, senderUsername: sender.username };
  });

  if (!txResult.success) {
    ws.send(JSON.stringify({ type: "challenge_error", error: txResult.error }));
    return;
  }

  // Broadcast gift animation using server-validated data only
  [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "gift_received",
        gift: {
          id: giftItem.id,
          senderId: ws.userId,
          senderName: txResult.senderUsername,
          recipientId,
          giftName: giftItem.name,
          amount: giftPrice,
        }
      }));
    }
  });
}
