import { WebSocket } from "ws";
import { db } from "../db";
import { notifications, userPreferences } from "@shared/schema";
import type { AuthenticatedSocket } from "./shared";
import { clients, adminClients, challengeGameRooms } from "./shared";
import { publish } from "../lib/redis";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  deactivateWebPushSubscriptionByEndpoint,
  getActiveWebPushSubscriptions,
  touchWebPushSubscription,
} from "../storage/notifications";
import { isWebPushEnabled, sendWebPushNotification } from "../lib/web-push";

// ==================== MESSAGE BATCHING SYSTEM ====================
// Aggregates small messages into batched sends (flush every 50ms)
interface BatchEntry {
  socket: WebSocket;
  messages: string[];
}
const pendingBatches = new Map<WebSocket, string[]>();
let batchTimer: NodeJS.Timeout | null = null;
const BATCH_FLUSH_MS = 50;

function scheduleBatchFlush() {
  if (batchTimer) return;
  batchTimer = setTimeout(flushBatches, BATCH_FLUSH_MS);
}

function flushBatches() {
  batchTimer = null;
  for (const [socket, messages] of pendingBatches) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (messages.length === 1) {
      socket.send(messages[0]);
    } else {
      // Send as batch array
      socket.send(JSON.stringify({ type: 'batch', messages: messages.map(m => JSON.parse(m)) }));
    }
  }
  pendingBatches.clear();
}

/** Queue a message for batched sending (reduces syscall overhead) */
function queueBatchSend(socket: WebSocket, message: string) {
  if (socket.readyState !== WebSocket.OPEN) return;
  let batch = pendingBatches.get(socket);
  if (!batch) {
    batch = [];
    pendingBatches.set(socket, batch);
  }
  batch.push(message);
  scheduleBatchFlush();
}

/** Immediately send (for latency-critical messages) */
function immediateSend(socket: WebSocket, message: string) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(message);
  }
}

/**
 * Exported notification/broadcast functions used throughout the app.
 * These functions send real-time messages to connected WebSocket clients.
 */

export async function sendNotification(userId: string, notification: {
  type: "announcement" | "transaction" | "security" | "promotion" | "system" | "p2p" | "id_verification" | "success" | "warning";
  priority?: "low" | "normal" | "high" | "urgent";
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  link?: string;
  metadata?: string;
}) {
  // ==================== NOTIFICATION PREFERENCES CHECK ====================
  // Only check preferences for non-critical types that users can opt out of
  const preferenceMap: Record<string, string> = {
    announcement: 'notifyAnnouncements',
    transaction: 'notifyTransactions',
    promotion: 'notifyPromotions',
    p2p: 'notifyP2P',
  };
  const prefKey = preferenceMap[notification.type];
  if (prefKey) {
    try {
      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
      if (prefs && (prefs as Record<string, unknown>)[prefKey] === false) {
        return null; // User opted out of this notification type
      }
    } catch {
      // If preference check fails, send notification anyway
    }
  }

  // Sanitize link field — only allow safe relative paths or https URLs
  let safeLink = notification.link;
  if (safeLink) {
    safeLink = safeLink.trim();
    const lowerLink = safeLink.toLowerCase().replace(/[\s\t\r\n]/g, '');
    // Block dangerous protocols
    if (lowerLink.startsWith('javascript:') ||
      lowerLink.startsWith('data:') ||
      lowerLink.startsWith('vbscript:') ||
      lowerLink.startsWith('blob:') ||
      lowerLink.startsWith('ftp:') ||
      lowerLink.startsWith('file:') ||
      lowerLink.startsWith('ws:') ||
      lowerLink.startsWith('wss:')) {
      safeLink = undefined; // Strip dangerous links
    }
    // Block external URLs — only allow relative paths or same-origin https
    else if (safeLink.startsWith('//') || safeLink.startsWith('\\\\')) {
      safeLink = undefined; // Strip protocol-relative URLs
    }
    // Only allow paths starting with /
    else if (!safeLink.startsWith('/') && !safeLink.startsWith('https://')) {
      safeLink = undefined;
    }
  }

  // Enforce max lengths to prevent storage DoS
  const title = notification.title?.substring(0, 500) || '';
  const titleAr = notification.titleAr?.substring(0, 500);
  const message = notification.message?.substring(0, 2000) || '';
  const messageAr = notification.messageAr?.substring(0, 2000);
  const metadata = notification.metadata?.substring(0, 5000);

  const [created] = await db.insert(notifications).values({
    userId,
    type: notification.type,
    priority: notification.priority || "normal",
    title,
    titleAr,
    message,
    messageAr,
    link: safeLink,
    metadata,
  }).returning();

  const userSockets = clients.get(userId);
  const hasOnlineSocket = Boolean(userSockets && Array.from(userSockets).some((socket) => socket.readyState === WebSocket.OPEN));
  if (userSockets) {
    const message = JSON.stringify({ type: "new_notification", data: created });
    userSockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });
  }

  if (!hasOnlineSocket) {
    sendWebPushToUser(userId, created).catch((error) => {
      logger.error("[WS Notification] Failed web push delivery", {
        userId,
        notificationId: created.id,
        error,
      });
    });
  }

  return created;
}

async function sendWebPushToUser(
  userId: string,
  notification: typeof notifications.$inferSelect,
): Promise<void> {
  if (!isWebPushEnabled()) {
    return;
  }

  const subscriptions = await getActiveWebPushSubscriptions(userId);
  if (!subscriptions.length) {
    return;
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.message,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    tag: `notification-${notification.id}`,
    data: {
      url: notification.link || "/notifications",
      notificationId: notification.id,
      type: notification.type,
      createdAt: notification.createdAt,
    },
  });

  await Promise.all(subscriptions.map(async (subscription) => {
    const result = await sendWebPushNotification(subscription, payload);
    if (result.sent) {
      await touchWebPushSubscription(subscription.endpoint);
      return;
    }

    if (result.deactivate) {
      await deactivateWebPushSubscriptionByEndpoint(subscription.endpoint);
    }
  }));
}

export async function broadcastNotification(notification: {
  type: "announcement" | "transaction" | "security" | "promotion" | "system" | "p2p" | "id_verification" | "success" | "warning";
  priority?: "low" | "normal" | "high" | "urgent";
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  link?: string;
  metadata?: string;
}, userIds: string[]) {
  const results = [];
  for (const userId of userIds) {
    const result = await sendNotification(userId, notification);
    results.push(result);
  }
  return results;
}

export function broadcastSystemEvent(event: {
  type: 'config_updated' | 'game_config_changed' | 'maintenance' | 'system_message' | 'p2p_settings_changed';
  data?: Record<string, unknown>;
}) {
  const message = JSON.stringify({ type: 'system_event', event });
  // Publish to Redis for cross-process delivery
  publish('system:broadcast', { type: 'system_event', event }).catch(() => { });
  // Also deliver to local clients via batching
  for (const [, sockets] of clients) {
    for (const socket of sockets) {
      queueBatchSend(socket, message);
    }
  }
}

export function broadcastAdminAlert(alert: {
  id: string;
  type: string;
  severity: string;
  title: string;
  titleAr?: string | null;
  message: string;
  messageAr?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  deepLink?: string | null;
  createdAt: Date | string;
}) {
  const message = JSON.stringify({ type: 'admin_alert', data: alert });
  adminClients.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  });
}

function getChallengeAudience(challenge: Record<string, unknown>): string[] {
  const ids = [
    challenge.player1Id,
    challenge.player2Id,
    challenge.player3Id,
    challenge.player4Id,
    challenge.friendAccountId,
  ];

  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
}

function isPrivateChallengeUpdate(challenge: Record<string, unknown>): boolean {
  const visibility = String(challenge.visibility || '').toLowerCase();
  const opponentType = String(challenge.opponentType || '').toLowerCase();
  return visibility === 'private' || opponentType === 'friend';
}

/** Broadcast challenge updates to all connected clients for real-time list updates */
export function broadcastChallengeUpdate(eventType: 'created' | 'joined' | 'started' | 'ended' | 'cancelled', challenge: Record<string, unknown>) {
  const payload = {
    type: 'challenge_update',
    eventType,
    data: challenge
  };
  const message = JSON.stringify(payload);

  if (isPrivateChallengeUpdate(challenge)) {
    const audience = getChallengeAudience(challenge);
    for (const userId of audience) {
      const sockets = clients.get(userId);
      if (!sockets) continue;
      for (const socket of sockets) {
        queueBatchSend(socket, message);
      }
    }
    return;
  }

  // Publish to Redis for cross-process delivery
  publish('system:challenges', payload).catch(() => { });
  // Deliver to local clients via batching
  for (const [, sockets] of clients) {
    for (const socket of sockets) {
      queueBatchSend(socket, message);
    }
  }
}

/** Broadcast to specific user for targeted notifications (e.g., game start) */
export function broadcastToUser(userId: string, message: Record<string, unknown> | string) {
  const userSockets = clients.get(userId);
  if (userSockets) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    userSockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    });
  }
}

/** Get count of unique online users connected via WebSocket */
export function getOnlineUsersCount(): number {
  let count = 0;
  clients.forEach((sockets, _userId) => {
    for (const s of sockets) {
      if (s.readyState === WebSocket.OPEN) {
        count++;
        break; // count each user once
      }
    }
  });
  return count;
}

/** Get count of active game rooms */
export function getActiveGameRoomsCount(): number {
  return challengeGameRooms.size;
}
