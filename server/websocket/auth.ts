import { WebSocket } from "ws";
import { db } from "../db";
import { notifications, adminAlerts, userRelationships } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import type { AuthenticatedSocket } from "./shared";
import { clients, adminClients } from "./shared";
import { trackUserOnline } from "../lib/redis";
import {
  AuthVerificationError,
  verifyAdminAccessToken,
  verifyUserAccessToken,
} from "../lib/auth-verification";

/**
 * Presence is visible only to mutual follows (friend-like relationship).
 */
export async function getPresenceAudienceUserIds(userId: string): Promise<string[]> {
  const outgoing = await db.select({ targetUserId: userRelationships.targetUserId })
    .from(userRelationships)
    .where(and(
      eq(userRelationships.userId, userId),
      eq(userRelationships.type, "follow"),
      eq(userRelationships.status, "active"),
    ));

  if (outgoing.length === 0) {
    return [];
  }

  const outgoingSet = new Set(outgoing.map((row) => row.targetUserId));
  const incoming = await db.select({ userId: userRelationships.userId })
    .from(userRelationships)
    .where(and(
      eq(userRelationships.targetUserId, userId),
      eq(userRelationships.type, "follow"),
      eq(userRelationships.status, "active"),
    ));

  return incoming
    .map((row) => row.userId)
    .filter((candidateId) => outgoingSet.has(candidateId));
}

/**
 * Handle auth, admin_auth, mark_read, mark_all_read message types.
 */
export async function handleAuth(ws: AuthenticatedSocket, data: any): Promise<void> {
  // User authentication
  if (data.type === "auth" || data.type === "authenticate") {
    try {
      if (!data.token || typeof data.token !== "string") {
        ws.send(JSON.stringify({ type: "auth_error", error: "Missing token" }));
        return;
      }

      const verified = await verifyUserAccessToken(data.token, {
        userAgent: ws.userAgent,
        requireActiveSession: true,
        updateSessionActivity: true,
      });

      ws.userId = verified.id;
      ws.username = verified.username;
      ws.role = verified.role;
      ws.tokenFingerprint = verified.tokenFingerprint;

      if (!clients.has(verified.id)) {
        clients.set(verified.id, new Set());
      }
      clients.get(verified.id)!.add(ws);

      ws.send(JSON.stringify({ type: "auth_success", userId: verified.id }));

      // Track online status in Redis (replaces O(N) broadcast to ALL clients)
      trackUserOnline(verified.id).catch(() => { });

      const audienceUserIds = await getPresenceAudienceUserIds(verified.id);
      const visibleOnlineUserIds = audienceUserIds.filter((id) => clients.has(id));
      ws.send(JSON.stringify({ type: "online_users_list", data: { userIds: visibleOnlineUserIds } }));

      // Send user_online only to mutual-follow audience.
      const onlineNotification = JSON.stringify({ type: "user_online", data: { userId: verified.id } });
      for (const uid of audienceUserIds) {
        const sockets = clients.get(uid);
        if (!sockets) continue;
        for (const s of sockets) {
          if (s.readyState === WebSocket.OPEN) {
            s.send(onlineNotification);
            break; // one per user is enough
          }
        }
      }

      const unreadNotifications = await db.select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, verified.id),
          eq(notifications.isRead, false)
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(20);

      ws.send(JSON.stringify({
        type: "unread_notifications",
        data: unreadNotifications
      }));
    } catch (error) {
      const errorMessage = error instanceof AuthVerificationError ? error.message : "Invalid token";
      ws.send(JSON.stringify({ type: "auth_error", error: errorMessage }));
    }
  }

  // Admin authentication for real-time admin alerts
  if (data.type === "admin_auth") {
    try {
      if (!data.token || typeof data.token !== "string") {
        ws.send(JSON.stringify({ type: "admin_auth_error", error: "Missing token" }));
        return;
      }

      const verifiedAdmin = await verifyAdminAccessToken(data.token, {
        userAgent: ws.userAgent,
        requireActiveSession: true,
        updateSessionActivity: true,
      });
      ws.userId = verifiedAdmin.id;
      ws.role = verifiedAdmin.role;
      ws.username = verifiedAdmin.username;
      adminClients.add(ws);

      // Add cleanup on socket close
      ws.on('close', () => {
        adminClients.delete(ws);
      });

      ws.send(JSON.stringify({ type: "admin_auth_success", userId: verifiedAdmin.id }));

      // Send current unread alert count
      const [result] = await db.select({ count: sql<number>`count(*)` })
        .from(adminAlerts)
        .where(eq(adminAlerts.isRead, false));
      ws.send(JSON.stringify({ type: "admin_alert_count", count: Number(result?.count || 0) }));
    } catch (error) {
      const errorMessage = error instanceof AuthVerificationError ? error.message : "Invalid token";
      ws.send(JSON.stringify({ type: "admin_auth_error", error: errorMessage }));
    }
  }

  // Mark single notification as read
  if (data.type === "mark_read" && ws.userId) {
    await db.update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(
        eq(notifications.id, data.notificationId),
        eq(notifications.userId, ws.userId)
      ));
  }

  // Mark all notifications as read
  if (data.type === "mark_all_read" && ws.userId) {
    await db.update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(
        eq(notifications.userId, ws.userId),
        eq(notifications.isRead, false)
      ));
  }
}
