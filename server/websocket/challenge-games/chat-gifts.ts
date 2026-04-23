import { WebSocket } from "ws";
import { db } from "../../db";
import { users, challengeGameSessions, challengeChatMessages, challenges, transactions, gameplaySettings, projectCurrencyWallets, projectCurrencyLedger } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { chatRateLimiter } from "../../lib/rate-limiter";
import { filterMessage } from "../../lib/word-filter";
import { storage } from "../../storage";
import { sanitizePlainText } from "../../lib/input-security";
import type { AuthenticatedSocket } from "../shared";
import { challengeGameRooms } from "../shared";
import { requireChallengeParticipant, requireChallengePlayer } from "./guards";
import { getCachedUserBlockLists } from "../../lib/redis";
import { getSocketIO } from "../../socketio";
import { SOCKETIO_NS_CHAT, type ChatBroadcast } from "@shared/socketio-events";
import { logger } from "../../lib/logger";

/** Handle challenge_chat message from players and broadcast it to both players and spectators */
export async function handleChallengeChat(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, message, isQuickMessage, quickMessageKey } = data;
  const guard = requireChallengeParticipant(ws, challengeId, { allowSpectator: true });
  if (!guard.ok) {
    return;
  }

  // SECURITY: Rate limit challenge chat
  const rateLimitResult = chatRateLimiter.check(ws.userId!);
  if (!rateLimitResult.allowed) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Too many messages, slow down" }));
    return;
  }

  // SECURITY: Sanitize and limit message length
  const safeMessage = sanitizePlainText(message, { maxLength: 500 });
  if (!safeMessage.trim()) return;

  const { room } = guard;

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
    isSpectator: guard.role === "spectator",
  }).returning();

  // One shared numeric timestamp for both transports so client-side dedup
  // (which keys on `sig:<senderId>:<text>:<timestamp>`) collapses the legacy
  // WS broadcast and the Socket.IO mirror into a single rendered message.
  const ts = savedMessage.createdAt
    ? new Date(savedMessage.createdAt).getTime()
    : Date.now();

  const messageWithSender = {
    ...savedMessage,
    senderName: sender.username,
    senderAvatar: sender.avatarUrl,
    // `timestamp` is the dedup-friendly numeric form of `createdAt`. We keep
    // both so older clients that look at `createdAt` continue to render
    // correctly while the new merge path keys off `timestamp`.
    timestamp: ts,
  };

  const outgoing = JSON.stringify({
    type: "chat_message",
    message: messageWithSender
  });

  // Resolve the sender's block list once. Players & spectators in this room
  // who the sender has blocked, OR who have blocked/muted the sender, must
  // not receive the message — same semantics as broadcastToRoomFiltered.
  const senderId = ws.userId!;
  const { blockedUsers: senderBlocked } = await getCachedUserBlockLists(
    senderId,
    async (id) => {
      const u = await storage.getUser(id);
      return u
        ? { blockedUsers: u.blockedUsers || [], mutedUsers: u.mutedUsers || [] }
        : null;
    },
  );

  // Collect (recipientId, socket) pairs from both player + spectator maps,
  // skipping the sender and anyone the sender has blocked. Then resolve each
  // recipient's own block/mute lists and skip recipients that have
  // blocked/muted the sender. This mirrors the legacy filter behavior and
  // applies the same gate to BOTH the legacy WS broadcast and the new
  // Socket.IO mirror, so users on either transport see identical visibility.
  const allEntries: Array<[string, WebSocket]> = [];
  for (const [uid, sock] of room.players) {
    if (uid !== senderId && !senderBlocked.includes(uid)) allEntries.push([uid, sock]);
  }
  for (const [uid, sock] of room.spectators) {
    if (uid !== senderId && !senderBlocked.includes(uid)) allEntries.push([uid, sock]);
  }

  const recipientChecks = await Promise.all(
    allEntries.map(async ([rid]) => {
      const c = await getCachedUserBlockLists(rid, async (id) => {
        const u = await storage.getUser(id);
        return u
          ? { blockedUsers: u.blockedUsers || [], mutedUsers: u.mutedUsers || [] }
          : null;
      });
      return { rid, blockedUsers: c.blockedUsers, mutedUsers: c.mutedUsers };
    }),
  );
  const blockedRecipients = new Set(
    recipientChecks
      .filter(
        (c) => c.blockedUsers?.includes(senderId) || c.mutedUsers?.includes(senderId),
      )
      .map((c) => c.rid),
  );

  // Sender always gets an echo so their own message appears immediately —
  // the sender obviously hasn't blocked themselves.
  const senderSocket = room.players.get(senderId) || room.spectators.get(senderId);
  if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
    senderSocket.send(outgoing);
  }

  for (const [rid, sock] of allEntries) {
    if (blockedRecipients.has(rid)) continue;
    if (sock.readyState === WebSocket.OPEN) sock.send(outgoing);
  }

  // Mirror onto the new Socket.IO `/chat` namespace for instant delivery.
  // Best-effort: failures are logged but never break the legacy broadcast.
  // The /chat namespace already authorizes only challenge participants, so
  // non-participants cannot subscribe regardless of this code path.
  try {
    const io = getSocketIO();
    if (io && challengeId) {
      const broadcast: ChatBroadcast = {
        roomId: `challenge:${challengeId}`,
        fromUserId: senderId,
        fromUsername: sender.username || senderId,
        text: messageWithSender.message,
        ts,
      };
      const ns = io.of(SOCKETIO_NS_CHAT);
      const sockets = await ns.in(broadcast.roomId).fetchSockets();
      for (const s of sockets) {
        const recipientId = (s.data as { userId?: string } | undefined)?.userId;
        if (!recipientId) continue;
        if (recipientId === senderId) continue;
        if (senderBlocked.includes(recipientId)) continue;
        if (blockedRecipients.has(recipientId)) continue;
        s.emit("chat:message", broadcast);
      }
    }
  } catch (err) {
    logger.warn?.(`[challenge-chat] socket.io mirror failed: ${(err as Error).message}`);
  }
}

/** Handle gift_to_player message — gift sent notification to players */
export async function handleGiftToPlayer(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, recipientId, giftId, idempotencyKey } = data;
  const guard = requireChallengeParticipant(ws, challengeId, { allowSpectator: true });
  if (!guard.ok) {
    return;
  }
  const { room } = guard;

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

  const [currencyModeSetting] = await db.select({ value: gameplaySettings.value })
    .from(gameplaySettings)
    .where(eq(gameplaySettings.key, 'play_gift_currency_mode'))
    .limit(1);

  // SECURITY: Validate gift exists in database and get server-side price/name
  const giftItem = await storage.getGiftFromCatalog(giftId);
  if (!giftItem || !giftItem.isActive) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Gift not found" }));
    return;
  }

  const giftPrice = parseFloat(giftItem.price);
  if (giftPrice <= 0) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Invalid gift price" }));
    return;
  }

  const enforceProjectOnly = !currencyModeSetting || currencyModeSetting.value !== 'mixed';
  const recipientEarnings = Math.min(giftPrice, Math.max(0, (giftItem.coinValue || 1) * 0.01));
  const platformFee = Math.max(0, giftPrice - recipientEarnings);
  const normalizedIdempotencyKey = typeof idempotencyKey === "string"
    ? idempotencyKey.trim().slice(0, 128)
    : "";
  const idempotencyReferenceId = normalizedIdempotencyKey
    ? `challenge_live_gift_idem:${challengeId}:${ws.userId}:${normalizedIdempotencyKey}`
    : undefined;

  if (enforceProjectOnly) {
    const projectTxResult = await db.transaction(async (tx) => {
      if (idempotencyReferenceId) {
        const [existingLedger] = await tx.select({ id: projectCurrencyLedger.id })
          .from(projectCurrencyLedger)
          .where(and(
            eq(projectCurrencyLedger.referenceId, idempotencyReferenceId),
            eq(projectCurrencyLedger.userId, ws.userId!),
          ))
          .for('update')
          .limit(1);

        if (existingLedger) {
          return { success: false as const, error: 'Gift already processed' };
        }
      }

      await tx.execute(sql`
        INSERT INTO project_currency_wallets (user_id)
        VALUES (${ws.userId!})
        ON CONFLICT (user_id) DO NOTHING
      `);

      await tx.execute(sql`
        INSERT INTO project_currency_wallets (user_id)
        VALUES (${recipientId})
        ON CONFLICT (user_id) DO NOTHING
      `);

      const [senderWallet] = await tx.select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, ws.userId!))
        .for('update');

      const [recipientWallet] = await tx.select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, recipientId))
        .for('update');

      if (!senderWallet || !recipientWallet) {
        return { success: false as const, error: 'Project currency wallet not found' };
      }

      let senderEarned = parseFloat(senderWallet.earnedBalance || '0');
      let senderPurchased = parseFloat(senderWallet.purchasedBalance || '0');
      const senderTotalBefore = senderEarned + senderPurchased;

      if (senderTotalBefore < giftPrice) {
        return {
          success: false as const,
          error: 'Insufficient project currency balance',
          code: 'project_currency_required' as const,
          projectBalance: senderTotalBefore,
          shortfallProjectAmount: Math.max(0, giftPrice - senderTotalBefore),
        };
      }

      let remaining = giftPrice;
      if (senderEarned >= remaining) {
        senderEarned -= remaining;
        remaining = 0;
      } else {
        remaining -= senderEarned;
        senderEarned = 0;
        senderPurchased -= remaining;
      }

      const senderTotalAfter = (senderEarned + senderPurchased).toFixed(2);

      await tx.update(projectCurrencyWallets)
        .set({
          earnedBalance: senderEarned.toFixed(2),
          purchasedBalance: senderPurchased.toFixed(2),
          totalBalance: senderTotalAfter,
          totalSpent: (parseFloat(senderWallet.totalSpent || '0') + giftPrice).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(projectCurrencyWallets.id, senderWallet.id));

      const recipientBalanceBefore = parseFloat(recipientWallet.totalBalance || '0');
      const recipientEarnedBefore = parseFloat(recipientWallet.earnedBalance || '0');
      const recipientTotalAfter = (recipientBalanceBefore + recipientEarnings).toFixed(2);

      await tx.update(projectCurrencyWallets)
        .set({
          earnedBalance: (recipientEarnedBefore + recipientEarnings).toFixed(2),
          totalBalance: recipientTotalAfter,
          totalEarned: (parseFloat(recipientWallet.totalEarned || '0') + recipientEarnings).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(projectCurrencyWallets.id, recipientWallet.id));

      const { challengeGifts } = await import("@shared/schema");
      const [giftRecord] = await tx.insert(challengeGifts).values({
        challengeId,
        senderId: ws.userId!,
        recipientId,
        giftId,
        quantity: 1,
        message: null,
      }).returning();

      const projectGiftReferenceId = idempotencyReferenceId || `challenge_live_gift_project:${giftRecord.id}`;

      await tx.insert(projectCurrencyLedger).values({
        userId: ws.userId!,
        walletId: senderWallet.id,
        type: 'admin_adjustment',
        amount: (-giftPrice).toFixed(2),
        balanceBefore: senderTotalBefore.toFixed(2),
        balanceAfter: senderTotalAfter,
        referenceId: projectGiftReferenceId,
        referenceType: 'gift_send',
        description: `Sent direct gift ${giftItem.name} to ${recipientId} in challenge ${challengeId}`,
      });

      await tx.insert(projectCurrencyLedger).values({
        userId: recipientId,
        walletId: recipientWallet.id,
        type: 'bonus',
        amount: recipientEarnings.toFixed(2),
        balanceBefore: recipientBalanceBefore.toFixed(2),
        balanceAfter: recipientTotalAfter,
        referenceId: projectGiftReferenceId,
        referenceType: 'gift_reward',
        description: `Received direct gift ${giftItem.name} from ${ws.userId} in challenge ${challengeId}`,
      });

      const [senderUser] = await tx.select({ username: users.username })
        .from(users)
        .where(eq(users.id, ws.userId!))
        .limit(1);

      return {
        success: true as const,
        senderUsername: senderUser?.username || 'Supporter',
      };
    });

    if (!projectTxResult.success) {
      if ((projectTxResult as { code?: string }).code === 'project_currency_required') {
        const payload = projectTxResult as {
          error: string;
          projectBalance?: number;
          shortfallProjectAmount?: number;
        };

        ws.send(JSON.stringify({
          type: "challenge_error",
          code: "project_currency_required",
          error: payload.error || "Direct real-money gifts are disabled. Purchase gifts with project currency first.",
          requiredProjectAmount: giftPrice,
          giftPrice,
          projectBalance: payload.projectBalance ?? 0,
          shortfallProjectAmount: payload.shortfallProjectAmount ?? giftPrice,
          giftId: giftItem.id,
        }));
      } else {
        ws.send(JSON.stringify({ type: "challenge_error", error: projectTxResult.error }));
      }
      return;
    }

    [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "gift_received",
          gift: {
            id: giftItem.id,
            senderId: ws.userId,
            senderName: projectTxResult.senderUsername,
            recipientId,
            giftName: giftItem.name,
            amount: giftPrice,
          }
        }));
      }
    });
    return;
  }

  // SECURITY: Atomic balance deduction + credit + fee records — prevent double-spend
  const txResult = await db.transaction(async (tx) => {
    if (idempotencyReferenceId) {
      const [existing] = await tx.select({ id: transactions.id })
        .from(transactions)
        .where(and(
          eq(transactions.referenceId, idempotencyReferenceId),
          eq(transactions.userId, ws.userId!),
          eq(transactions.type, "gift_sent"),
          eq(transactions.status, "completed"),
        ))
        .for('update')
        .limit(1);

      if (existing) {
        return { success: false, error: 'Gift already processed' };
      }
    }

    const [sender] = await tx.select().from(users)
      .where(eq(users.id, ws.userId!)).for('update');

    const [recipient] = await tx.select().from(users)
      .where(eq(users.id, recipientId)).for('update');

    if (!sender || !recipient || parseFloat(sender.balance) < giftPrice) {
      return { success: false, error: 'Insufficient balance' };
    }

    const senderBalanceBefore = parseFloat(sender.balance);
    const senderBalanceAfter = (senderBalanceBefore - giftPrice).toFixed(2);
    const recipientBalanceBefore = parseFloat(recipient.balance);
    const recipientBalanceAfter = (recipientBalanceBefore + recipientEarnings).toFixed(2);

    await tx.update(users).set({
      balance: senderBalanceAfter,
      updatedAt: new Date(),
    }).where(eq(users.id, ws.userId!));

    await tx.update(users).set({
      balance: recipientBalanceAfter,
      updatedAt: new Date(),
    }).where(eq(users.id, recipientId));

    const { challengeGifts } = await import("@shared/schema");
    const [giftRecord] = await tx.insert(challengeGifts).values({
      challengeId,
      senderId: ws.userId!,
      recipientId,
      giftId,
      quantity: 1,
      message: null,
    }).returning();

    const giftReferenceId = `challenge_live_gift:${giftRecord.id}`;

    await tx.insert(transactions).values({
      userId: ws.userId!,
      type: "gift_sent",
      amount: giftPrice.toFixed(2),
      status: "completed",
      balanceBefore: senderBalanceBefore.toFixed(2),
      balanceAfter: senderBalanceAfter,
      description: `Direct gift ${giftItem.name} to ${recipientId} in challenge ${challengeId}`,
      referenceId: idempotencyReferenceId || giftReferenceId,
      processedAt: new Date(),
    });

    await tx.insert(transactions).values({
      userId: recipientId,
      type: "gift_received",
      amount: recipientEarnings.toFixed(2),
      status: "completed",
      balanceBefore: recipientBalanceBefore.toFixed(2),
      balanceAfter: recipientBalanceAfter,
      description: `Received direct gift ${giftItem.name} from ${ws.userId} in challenge ${challengeId}`,
      referenceId: giftReferenceId,
      processedAt: new Date(),
    });

    if (platformFee > 0) {
      await tx.insert(transactions).values({
        userId: ws.userId!,
        type: "platform_fee",
        amount: platformFee.toFixed(2),
        status: "completed",
        balanceBefore: senderBalanceBefore.toFixed(2),
        balanceAfter: senderBalanceAfter,
        description: `Platform fee for direct gift ${giftItem.name}`,
        referenceId: giftReferenceId,
        processedAt: new Date(),
      });
    }

    return { success: true, senderUsername: sender.username, giftReferenceId };
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
