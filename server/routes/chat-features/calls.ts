import type { Express, Response } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { WebSocket } from "ws";
import { chatCallSessions, projectCurrencyLedger, projectCurrencyWallets, users } from "@shared/schema";
import { db } from "../../db";
import { storage } from "../../storage";
import { clients } from "../../websocket/shared";
import { sendNotification } from "../../websocket/notifications";
import type { AuthRequest } from "../middleware";
import { checkRateLimit, getConfigDecimal, getErrorMessage, type AuthMiddleware } from "./helpers";

type ChatCallType = "voice" | "video";

const CHAT_CALL_CONFIG_KEYS: Record<ChatCallType, string> = {
  voice: "chat_voice_call_price_per_minute",
  video: "chat_video_call_price_per_minute",
};

const CHAT_ACTION_PRICE_CONFIG_KEYS = {
  voiceMessage: "chat_voice_message_price",
  messageDelete: "chat_delete_message_price",
} as const;
const CALL_RING_TIMEOUT_SECONDS = 45;

function normalizeCallType(raw: unknown): ChatCallType | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "voice" || value === "video") {
    return value;
  }
  return null;
}

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

function buildCallDeepLink(otherUserId: string, sessionId?: string): string {
  const userParam = encodeURIComponent(otherUserId);
  const sessionParam = sessionId ? `&callSession=${encodeURIComponent(sessionId)}` : "";
  return `/chat?user=${userParam}${sessionParam}`;
}

function notifyUsers(userIds: string[], payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload);

  userIds.forEach((userId) => {
    const sockets = clients.get(userId);
    if (!sockets || sockets.size === 0) {
      return;
    }

    sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialized);
      }
    });
  });
}

async function cancelStaleUnconnectedCallSessions(participantUserIds: string[]): Promise<void> {
  const normalizedUserIds = Array.from(
    new Set(
      participantUserIds
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (normalizedUserIds.length === 0) {
    return;
  }

  const participantClauses = normalizedUserIds.flatMap((participantId) => [
    eq(chatCallSessions.callerId, participantId),
    eq(chatCallSessions.receiverId, participantId),
  ]);

  if (participantClauses.length === 0) {
    return;
  }

  await db
    .update(chatCallSessions)
    .set({
      status: "cancelled",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatCallSessions.status, "active"),
        sql`${chatCallSessions.connectedAt} IS NULL`,
        sql`${chatCallSessions.startedAt} < NOW() - INTERVAL '${sql.raw(String(CALL_RING_TIMEOUT_SECONDS))} seconds'`,
        or(...participantClauses),
      ),
    );
}

export function registerCallRoutes(app: Express, authMiddleware: AuthMiddleware): void {
  app.get("/api/chat/calls/pricing", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      await cancelStaleUnconnectedCallSessions([userId]);

      const [voiceRate, videoRate, voiceMessagePrice, messageDeletePrice] = await Promise.all([
        getConfigDecimal(CHAT_CALL_CONFIG_KEYS.voice, 15),
        getConfigDecimal(CHAT_CALL_CONFIG_KEYS.video, 25),
        getConfigDecimal(CHAT_ACTION_PRICE_CONFIG_KEYS.voiceMessage, 0),
        getConfigDecimal(CHAT_ACTION_PRICE_CONFIG_KEYS.messageDelete, 0),
      ]);

      const [currencySettings, wallet] = await Promise.all([
        storage.getProjectCurrencySettings(),
        storage.getOrCreateProjectCurrencyWallet(userId),
      ]);

      const walletBalance = parseFloat(wallet.totalBalance || "0");

      const [activeSession] = await db
        .select({
          id: chatCallSessions.id,
          callType: chatCallSessions.callType,
          callerId: chatCallSessions.callerId,
          receiverId: chatCallSessions.receiverId,
          startedAt: chatCallSessions.startedAt,
          connectedAt: chatCallSessions.connectedAt,
          ratePerMinute: chatCallSessions.ratePerMinute,
        })
        .from(chatCallSessions)
        .where(
          and(
            eq(chatCallSessions.status, "active"),
            or(
              eq(chatCallSessions.callerId, userId),
              eq(chatCallSessions.receiverId, userId),
            ),
          ),
        )
        .orderBy(desc(chatCallSessions.startedAt))
        .limit(1);

      res.json({
        voicePricePerMinute: voiceRate,
        videoPricePerMinute: videoRate,
        voiceMessagePrice,
        messageDeletePrice,
        userBalance: walletBalance,
        canStartVoiceCall: voiceRate <= 0 || walletBalance >= voiceRate,
        canStartVideoCall: videoRate <= 0 || walletBalance >= videoRate,
        canSendVoiceMessage: voiceMessagePrice <= 0 || walletBalance >= voiceMessagePrice,
        canDeleteMessage: messageDeletePrice <= 0 || walletBalance >= messageDeletePrice,
        currencySymbol: currencySettings?.currencySymbol || "VEX",
        currencyName: currencySettings?.currencyName || "VEX Coin",
        activeSession: activeSession
          ? {
            ...activeSession,
            ratePerMinute: parseFloat(activeSession.ratePerMinute || "0"),
            hasConnected: !!activeSession.connectedAt,
          }
          : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/chat/calls/start", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const callerId = req.user!.id;
      const receiverId = String(req.body?.receiverId || "").trim();
      const callType = normalizeCallType(req.body?.callType);

      if (!receiverId || !callType) {
        return res.status(400).json({ error: "receiverId and valid callType are required" });
      }

      if (!checkRateLimit(`chat_call_start:${callerId}`, 20, 60_000)) {
        return res.status(429).json({ error: "Too many call attempts" });
      }

      if (callerId === receiverId) {
        return res.status(400).json({ error: "Cannot start call with yourself" });
      }

      const participants = await db
        .select({ id: users.id, username: users.username, blockedUsers: users.blockedUsers })
        .from(users)
        .where(or(eq(users.id, callerId), eq(users.id, receiverId)));

      const caller = participants.find((entry) => entry.id === callerId);
      const receiver = participants.find((entry) => entry.id === receiverId);

      if (!caller || !receiver) {
        return res.status(404).json({ error: "User not found" });
      }

      const callerBlockedUsers = caller.blockedUsers || [];
      const receiverBlockedUsers = receiver.blockedUsers || [];
      if (callerBlockedUsers.includes(receiverId) || receiverBlockedUsers.includes(callerId)) {
        return res.status(403).json({ error: "Cannot start call while one side is blocked" });
      }

      await cancelStaleUnconnectedCallSessions([callerId, receiverId]);

      const [existingActiveSession] = await db
        .select({ id: chatCallSessions.id })
        .from(chatCallSessions)
        .where(
          and(
            eq(chatCallSessions.status, "active"),
            or(
              eq(chatCallSessions.callerId, callerId),
              eq(chatCallSessions.receiverId, callerId),
              eq(chatCallSessions.callerId, receiverId),
              eq(chatCallSessions.receiverId, receiverId),
            ),
          ),
        )
        .limit(1);

      if (existingActiveSession) {
        return res.status(409).json({ error: "An active call session already exists", sessionId: existingActiveSession.id });
      }

      const ratePerMinute = await getConfigDecimal(CHAT_CALL_CONFIG_KEYS[callType], callType === "voice" ? 15 : 25);
      const wallet = await storage.getOrCreateProjectCurrencyWallet(callerId);
      const walletBalance = parseFloat(wallet.totalBalance || "0");
      if (ratePerMinute > 0 && walletBalance < ratePerMinute) {
        return res.status(400).json({ error: "Insufficient project currency balance for first minute" });
      }

      const [createdSession] = await db
        .insert(chatCallSessions)
        .values({
          callerId,
          receiverId,
          callType,
          status: "active",
          ratePerMinute: toMoney(ratePerMinute).toFixed(2),
        })
        .returning({
          id: chatCallSessions.id,
          callType: chatCallSessions.callType,
          callerId: chatCallSessions.callerId,
          receiverId: chatCallSessions.receiverId,
          startedAt: chatCallSessions.startedAt,
          connectedAt: chatCallSessions.connectedAt,
          ratePerMinute: chatCallSessions.ratePerMinute,
        });

      notifyUsers([receiverId], {
        type: "private_call_invite",
        sessionId: createdSession.id,
        callerId,
        callerUsername: caller.username,
        receiverId,
        callType,
        ratePerMinute: parseFloat(createdSession.ratePerMinute || "0"),
      });

      const callTypeLabelEn = callType === "video" ? "video call" : "voice call";
      const callTypeLabelAr = callType === "video" ? "مكالمة فيديو" : "مكالمة صوتية";
      void sendNotification(receiverId, {
        type: "system",
        priority: "urgent",
        title: `Incoming ${callTypeLabelEn} from ${caller.username}`,
        titleAr: `${caller.username} يدعوك إلى ${callTypeLabelAr}`,
        message: "Tap to open chat and answer quickly.",
        messageAr: "اضغط لفتح الدردشة والرد بسرعة.",
        link: buildCallDeepLink(callerId, createdSession.id),
        metadata: JSON.stringify({
          event: "private_call_invite",
          sessionId: createdSession.id,
          callerId,
          receiverId,
          callType,
          ratePerMinute: parseFloat(createdSession.ratePerMinute || "0"),
        }),
      }).catch(() => {
        // Notification failure should not block call session creation.
      });

      res.json({
        success: true,
        session: {
          ...createdSession,
          ratePerMinute: parseFloat(createdSession.ratePerMinute || "0"),
          hasConnected: !!createdSession.connectedAt,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/chat/calls/end", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const actorUserId = req.user!.id;
      const sessionId = String(req.body?.sessionId || "").trim();

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      if (!checkRateLimit(`chat_call_end:${actorUserId}`, 30, 60_000)) {
        return res.status(429).json({ error: "Too many call end attempts" });
      }

      const currencySettings = await storage.getProjectCurrencySettings();

      const resultPayload = await db.transaction(async (tx) => {
        const [activeSession] = await tx
          .select()
          .from(chatCallSessions)
          .where(and(eq(chatCallSessions.id, sessionId), eq(chatCallSessions.status, "active")))
          .for("update");

        if (!activeSession) {
          throw new Error("Call session not found or already closed");
        }

        if (activeSession.callerId !== actorUserId && activeSession.receiverId !== actorUserId) {
          throw new Error("Not authorized to end this call session");
        }

        const payerId = activeSession.callerId;
        const billableStartedAt = activeSession.connectedAt || activeSession.startedAt;
        const startedAt = billableStartedAt instanceof Date
          ? billableStartedAt
          : new Date(billableStartedAt);
        const now = new Date();
        const durationSeconds = activeSession.connectedAt
          ? Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / 1000))
          : 0;
        const requestedMinutes = activeSession.connectedAt
          ? Math.max(1, Math.ceil(durationSeconds / 60))
          : 0;

        const ratePerMinute = parseFloat(activeSession.ratePerMinute || "0");

        await tx.execute(sql`
          INSERT INTO project_currency_wallets (user_id)
          VALUES (${payerId})
          ON CONFLICT (user_id) DO NOTHING
        `);

        const [wallet] = await tx
          .select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, payerId))
          .for("update");

        if (!wallet) {
          throw new Error("Project currency wallet not found");
        }

        const totalBalance = parseFloat(wallet.totalBalance || "0");
        let billedMinutes = requestedMinutes;
        let chargedAmount = toMoney(requestedMinutes * ratePerMinute);

        if (ratePerMinute > 0 && chargedAmount > totalBalance) {
          billedMinutes = Math.max(0, Math.floor(totalBalance / ratePerMinute));
          chargedAmount = toMoney(billedMinutes * ratePerMinute);
        }

        let payerNewBalance = totalBalance;
        let ledgerId: string | null = null;

        if (chargedAmount > 0) {
          let earnedBalance = parseFloat(wallet.earnedBalance || "0");
          let purchasedBalance = parseFloat(wallet.purchasedBalance || "0");
          let remaining = chargedAmount;

          if (earnedBalance >= remaining) {
            earnedBalance = toMoney(earnedBalance - remaining);
            remaining = 0;
          } else {
            remaining = toMoney(remaining - earnedBalance);
            earnedBalance = 0;
            purchasedBalance = toMoney(Math.max(0, purchasedBalance - remaining));
          }

          payerNewBalance = toMoney(earnedBalance + purchasedBalance);

          await tx
            .update(projectCurrencyWallets)
            .set({
              earnedBalance: earnedBalance.toFixed(2),
              purchasedBalance: purchasedBalance.toFixed(2),
              totalBalance: payerNewBalance.toFixed(2),
              totalSpent: toMoney(parseFloat(wallet.totalSpent || "0") + chargedAmount).toFixed(2),
              updatedAt: now,
            })
            .where(eq(projectCurrencyWallets.id, wallet.id));

          const [ledgerEntry] = await tx
            .insert(projectCurrencyLedger)
            .values({
              userId: payerId,
              walletId: wallet.id,
              type: "admin_adjustment",
              amount: (-chargedAmount).toFixed(2),
              balanceBefore: toMoney(totalBalance).toFixed(2),
              balanceAfter: payerNewBalance.toFixed(2),
              referenceId: `chat_call_session:${activeSession.id}`,
              referenceType: `chat_${activeSession.callType}_call_minute_charge`,
              description: `Private ${activeSession.callType} call charged for ${billedMinutes} minute(s)`,
            })
            .returning({ id: projectCurrencyLedger.id });

          ledgerId = ledgerEntry?.id || null;
        }

        const [updated] = await tx
          .update(chatCallSessions)
          .set({
            status: activeSession.connectedAt ? "ended" : "cancelled",
            endedAt: now,
            endedBy: actorUserId,
            durationSeconds,
            billedMinutes,
            totalCharged: chargedAmount.toFixed(2),
            chargedFromWalletId: wallet.id,
            ledgerEntryId: ledgerId,
            updatedAt: now,
          })
          .where(and(eq(chatCallSessions.id, activeSession.id), eq(chatCallSessions.status, "active")))
          .returning({ id: chatCallSessions.id });

        if (!updated) {
          throw new Error("Call session already finalized");
        }

        return {
          sessionId: activeSession.id,
          callerId: activeSession.callerId,
          receiverId: activeSession.receiverId,
          callType: activeSession.callType,
          status: activeSession.connectedAt ? "ended" : "cancelled",
          durationSeconds,
          requestedMinutes,
          billedMinutes,
          chargedAmount,
          payerNewBalance,
          payerId,
        };
      });

      res.json({
        success: true,
        status: resultPayload.status,
        sessionId: resultPayload.sessionId,
        durationSeconds: resultPayload.durationSeconds,
        requestedMinutes: resultPayload.requestedMinutes,
        billedMinutes: resultPayload.billedMinutes,
        chargedAmount: resultPayload.chargedAmount,
        payerNewBalance: resultPayload.payerNewBalance,
        payerId: resultPayload.payerId,
        currencySymbol: currencySettings?.currencySymbol || "VEX",
        currencyName: currencySettings?.currencyName || "VEX Coin",
      });

      notifyUsers([resultPayload.callerId, resultPayload.receiverId], {
        type: "private_call_ended",
        sessionId: resultPayload.sessionId,
        status: resultPayload.status,
        callType: resultPayload.callType,
        endedBy: actorUserId,
        billedMinutes: resultPayload.billedMinutes,
        chargedAmount: resultPayload.chargedAmount,
      });

      const peerUserId = resultPayload.callerId === actorUserId
        ? resultPayload.receiverId
        : resultPayload.callerId;

      const isMissedCall = resultPayload.status === "cancelled";
      const endedLabelEn = resultPayload.callType === "video" ? "Video call" : "Voice call";
      const endedLabelAr = resultPayload.callType === "video" ? "مكالمة الفيديو" : "المكالمة الصوتية";

      void sendNotification(peerUserId, {
        type: "system",
        priority: isMissedCall ? "high" : "normal",
        title: isMissedCall ? `${endedLabelEn} was missed` : `${endedLabelEn} ended`,
        titleAr: isMissedCall ? `تم تفويت ${endedLabelAr}` : `انتهت ${endedLabelAr}`,
        message: isMissedCall
          ? "Tap to reopen chat and call again."
          : `Call duration: ${resultPayload.durationSeconds} seconds.`,
        messageAr: isMissedCall
          ? "اضغط لفتح الدردشة وإعادة الاتصال."
          : `مدة المكالمة: ${resultPayload.durationSeconds} ثانية.`,
        link: buildCallDeepLink(actorUserId, resultPayload.sessionId),
        metadata: JSON.stringify({
          event: isMissedCall ? "private_call_missed" : "private_call_ended",
          sessionId: resultPayload.sessionId,
          endedBy: actorUserId,
          callType: resultPayload.callType,
          durationSeconds: resultPayload.durationSeconds,
          billedMinutes: resultPayload.billedMinutes,
          chargedAmount: resultPayload.chargedAmount,
        }),
      }).catch(() => {
        // Notification failure should not block call session finalization.
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message.includes("not found") || message.includes("already") || message.includes("authorized")) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });
}
