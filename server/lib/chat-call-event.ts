import { WebSocket } from "ws";
import { db } from "../db";
import { chatMessages, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { clients } from "../websocket/shared";
import { getRedisClient } from "./redis";

/**
 * Synthetic chat message inserted into the DM thread when a call ends
 * without ever connecting (missed / declined / timed out). Mirrors how
 * WhatsApp / Telegram leave a "Missed call" entry in the conversation
 * so users notice the call without having to dig through the OS call log.
 *
 * Encodes the structured payload as JSON in `content` so existing
 * conversation-list previews (which read `content`) still get something
 * they can render, and the chat renderer can parse out `callType` to
 * draw the right icon + label and wire up the tap-to-recall action.
 */
export type ChatCallOutcome = "missed" | "declined";

export interface ChatCallEventContent {
  v: 1;
  kind: "call_missed";
  callType: "voice" | "video";
  outcome: ChatCallOutcome;
  sessionId: string;
}

export const CALL_MISSED_MESSAGE_TYPE = "call_missed";

const CALL_EVENT_DEDUPE_TTL_SECONDS = 6 * 60 * 60; // 6h is plenty for retries.

/** Build the JSON-encoded `content` payload used for missed-call entries. */
export function buildCallEventContent(input: {
  callType: "voice" | "video";
  outcome: ChatCallOutcome;
  sessionId: string;
}): string {
  const payload: ChatCallEventContent = {
    v: 1,
    kind: "call_missed",
    callType: input.callType === "video" ? "video" : "voice",
    outcome: input.outcome,
    sessionId: input.sessionId,
  };
  return JSON.stringify(payload);
}

/**
 * Insert a single "missed call" chat row that both participants will see
 * in their DM thread, then push it over WebSocket so it shows up in
 * real-time without forcing a refresh.
 *
 * Idempotent per `sessionId` via Redis: the same call can race through
 * multiple termination paths (REST end + stale cleanup + socket rtc:end)
 * but only the first wins.
 */
export async function insertMissedCallChatMessage(input: {
  callerId: string;
  receiverId: string;
  callType: "voice" | "video";
  outcome: ChatCallOutcome;
  sessionId: string;
}): Promise<void> {
  const callerId = String(input.callerId || "").trim();
  const receiverId = String(input.receiverId || "").trim();
  if (!callerId || !receiverId || callerId === receiverId) {
    return;
  }

  const dedupeKey = `chat:call:missed:${input.sessionId}`;
  try {
    const acquired = await getRedisClient()
      .set(dedupeKey, "1", "EX", CALL_EVENT_DEDUPE_TTL_SECONDS, "NX")
      .catch(() => null);
    if (acquired !== "OK") {
      return;
    }
  } catch {
    // Redis unavailable — fall through and accept the (small) duplicate risk
    // rather than silently swallow missed-call records.
  }

  const content = buildCallEventContent({
    callType: input.callType,
    outcome: input.outcome,
    sessionId: input.sessionId,
  });

  let inserted: typeof chatMessages.$inferSelect | null = null;
  try {
    const [row] = await db
      .insert(chatMessages)
      .values({
        senderId: callerId,
        receiverId,
        content,
        messageType: CALL_MISSED_MESSAGE_TYPE,
        isRead: false,
      })
      .returning();
    inserted = row || null;
  } catch {
    // If the insert fails we don't want to take down the call-end flow.
    return;
  }

  if (!inserted) {
    return;
  }

  const [sender] = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.profilePicture,
    })
    .from(users)
    .where(eq(users.id, callerId))
    .limit(1);

  const messageWithSender = { ...inserted, sender: sender || undefined };
  const payload = JSON.stringify({ type: "new_chat_message", data: messageWithSender });

  for (const userId of [callerId, receiverId]) {
    const sockets = clients.get(userId);
    if (!sockets) continue;
    sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(payload);
        } catch {
          // Skip send errors; the row is already persisted for next fetch.
        }
      }
    });
  }
}
