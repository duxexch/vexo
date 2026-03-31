import { WebSocket } from "ws";
import { db } from "../db";
import { notifications, adminAlerts } from "@shared/schema";
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

      // Send online users list via Redis sorted set (efficient — no iteration)
      const onlineUserIds = Array.from(clients.keys());
      ws.send(JSON.stringify({ type: "online_users_list", data: { userIds: onlineUserIds } }));

      // Send user_online only to users who are friends/contacts (not ALL users)
      // For now, broadcast to a limited set (max 200) to prevent O(N²)
      const onlineNotification = JSON.stringify({ type: "user_online", data: { userId: verified.id } });
      let broadcastCount = 0;
      const MAX_ONLINE_BROADCASTS = 200;
      for (const [uid, sockets] of clients) {
        if (uid === verified.id) continue;
        if (broadcastCount >= MAX_ONLINE_BROADCASTS) break;
        for (const s of sockets) {
          if (s.readyState === WebSocket.OPEN) {
            s.send(onlineNotification);
            break; // one per user is enough
          }
        }
        broadcastCount++;
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

      const verifiedAdmin = await verifyAdminAccessToken(data.token);
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
