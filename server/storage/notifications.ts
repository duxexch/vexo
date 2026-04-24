import {
  notifications, announcements, announcementViews,
  type Notification, type InsertNotification,
  type Announcement, type InsertAnnouncement,
  type AnnouncementStatus,
  webPushSubscriptions,
  devicePushTokens,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";

export type DevicePushTokenKind = "voip" | "apns" | "fcm";
export type DevicePushTokenPlatform = "ios" | "android";

export interface RegisterDevicePushTokenInput {
  userId: string;
  platform: DevicePushTokenPlatform;
  kind: DevicePushTokenKind;
  token: string;
  bundleId?: string | null;
  appVersion?: string | null;
}

export interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

function parseExpirationTime(expirationTime?: number | null): Date | null {
  if (!expirationTime || !Number.isFinite(expirationTime)) {
    return null;
  }

  const parsed = new Date(expirationTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ==================== NOTIFICATIONS ====================

export async function createNotification(notification: InsertNotification): Promise<Notification> {
  const [created] = await db.insert(notifications).values(notification).returning();
  return created;
}

export async function getUserNotifications(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
  return db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result[0]?.count || 0;
}

export async function markNotificationAsRead(id: string, userId: string): Promise<boolean> {
  const result = await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return (result.rowCount || 0) > 0;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

export async function deleteNotification(id: string, userId: string): Promise<boolean> {
  const result = await db.delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function clearAllNotifications(userId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.userId, userId));
}

export async function upsertWebPushSubscription(
  userId: string,
  subscription: WebPushSubscriptionPayload,
  userAgent?: string | null,
): Promise<void> {
  const now = new Date();
  const expirationTime = parseExpirationTime(subscription.expirationTime);

  await db.insert(webPushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dhKey: subscription.keys.p256dh,
    authKey: subscription.keys.auth,
    expirationTime,
    userAgent: userAgent ?? null,
    isActive: true,
    lastUsedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: webPushSubscriptions.endpoint,
    set: {
      userId,
      p256dhKey: subscription.keys.p256dh,
      authKey: subscription.keys.auth,
      expirationTime,
      userAgent: userAgent ?? null,
      isActive: true,
      lastUsedAt: now,
      updatedAt: now,
    },
  });
}

export async function getActiveWebPushSubscriptions(userId: string): Promise<Array<{
  endpoint: string;
  p256dhKey: string;
  authKey: string;
}>> {
  return db.select({
    endpoint: webPushSubscriptions.endpoint,
    p256dhKey: webPushSubscriptions.p256dhKey,
    authKey: webPushSubscriptions.authKey,
  })
    .from(webPushSubscriptions)
    .where(and(
      eq(webPushSubscriptions.userId, userId),
      eq(webPushSubscriptions.isActive, true),
      sql`(${webPushSubscriptions.expirationTime} IS NULL OR ${webPushSubscriptions.expirationTime} > now())`,
    ));
}

export async function deactivateWebPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const result = await db.update(webPushSubscriptions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(webPushSubscriptions.userId, userId),
      eq(webPushSubscriptions.endpoint, endpoint),
      eq(webPushSubscriptions.isActive, true),
    ));

  return (result.rowCount || 0) > 0;
}

export async function deactivateWebPushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.update(webPushSubscriptions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(webPushSubscriptions.endpoint, endpoint));
}

export async function touchWebPushSubscription(endpoint: string): Promise<void> {
  await db.update(webPushSubscriptions)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(webPushSubscriptions.endpoint, endpoint));
}

// ==================== DEVICE PUSH TOKENS (APNs / FCM for VoIP + alerts) ====================

export async function registerDevicePushToken(input: RegisterDevicePushTokenInput): Promise<void> {
  const now = new Date();
  await db.insert(devicePushTokens).values({
    userId: input.userId,
    platform: input.platform,
    kind: input.kind,
    token: input.token,
    bundleId: input.bundleId ?? null,
    appVersion: input.appVersion ?? null,
    isActive: true,
    lastUsedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    // The unique index is (token, kind) — same physical token may map to
    // different users over the lifetime of the device, so we always
    // re-bind to the current user on registration.
    target: [devicePushTokens.token, devicePushTokens.kind],
    set: {
      userId: input.userId,
      platform: input.platform,
      bundleId: input.bundleId ?? null,
      appVersion: input.appVersion ?? null,
      isActive: true,
      lastUsedAt: now,
      updatedAt: now,
    },
  });
}

export async function getActiveDevicePushTokens(userId: string): Promise<Array<{
  platform: "ios" | "android";
  kind: "voip" | "apns" | "fcm";
  token: string;
}>> {
  const rows = await db.select({
    platform: devicePushTokens.platform,
    kind: devicePushTokens.kind,
    token: devicePushTokens.token,
  })
    .from(devicePushTokens)
    .where(and(
      eq(devicePushTokens.userId, userId),
      eq(devicePushTokens.isActive, true),
    ));
  // Narrow the column-string types to the documented unions for callers.
  return rows.map((row) => ({
    platform: row.platform as "ios" | "android",
    kind: row.kind as "voip" | "apns" | "fcm",
    token: row.token,
  }));
}

export async function deactivateDevicePushToken(token: string, kind: string): Promise<boolean> {
  const result = await db.update(devicePushTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(devicePushTokens.token, token),
      eq(devicePushTokens.kind, kind),
      eq(devicePushTokens.isActive, true),
    ));
  return (result.rowCount || 0) > 0;
}

export async function deactivateDevicePushTokensForUser(userId: string): Promise<void> {
  await db.update(devicePushTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(devicePushTokens.userId, userId),
      eq(devicePushTokens.isActive, true),
    ));
}

export async function touchDevicePushToken(token: string, kind: string): Promise<void> {
  await db.update(devicePushTokens)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(devicePushTokens.token, token),
      eq(devicePushTokens.kind, kind),
    ));
}

/**
 * Get unread notification counts grouped by section.
 * Uses efficient SQL with CASE WHEN grouping instead of loading all rows.
 */
export async function getUnreadSectionCounts(userId: string): Promise<Record<string, number>> {
  const result = await db.execute(sql`
    SELECT
      CASE
        WHEN ${notifications.link} LIKE '/wallet%' THEN 'wallet'
        WHEN ${notifications.link} LIKE '/transactions%' THEN 'transactions'
        WHEN ${notifications.link} LIKE '/p2p%' THEN 'p2p'
        WHEN ${notifications.link} LIKE '/challenges%' OR ${notifications.link} LIKE '/challenge/%' THEN 'challenges'
        WHEN ${notifications.link} LIKE '/multiplayer%' OR ${notifications.link} LIKE '/game%' THEN 'multiplayer'
        WHEN ${notifications.link} LIKE '/chat%' THEN 'chat'
        WHEN ${notifications.link} LIKE '/friends%' THEN 'friends'
        WHEN ${notifications.link} LIKE '/support%' THEN 'support'
        WHEN ${notifications.link} LIKE '/complaints%' THEN 'complaints'
        WHEN ${notifications.link} LIKE '/leaderboard%' THEN 'leaderboard'
        WHEN ${notifications.link} LIKE '/tournaments%' THEN 'tournaments'
        WHEN ${notifications.link} LIKE '/free%' THEN 'free'
        WHEN ${notifications.link} LIKE '/daily-rewards%' THEN 'daily-rewards'
        WHEN ${notifications.link} LIKE '/referral%' THEN 'referral'
        WHEN ${notifications.link} LIKE '/settings%' THEN 'settings'
        WHEN ${notifications.link} LIKE '/profile%' THEN 'profile'
        WHEN ${notifications.link} LIKE '/lobby%' THEN 'lobby'
        WHEN ${notifications.link} LIKE '/notifications%' THEN 'notifications'
        WHEN ${notifications.link} = '/' THEN 'dashboard'
        WHEN ${notifications.type} = 'transaction' THEN 'transactions'
        WHEN ${notifications.type} = 'p2p' THEN 'p2p'
        WHEN ${notifications.type} = 'security' THEN 'settings'
        WHEN ${notifications.type} = 'announcement' THEN 'dashboard'
        WHEN ${notifications.type} = 'promotion' THEN 'free'
        ELSE 'notifications'
      END AS section,
      COUNT(*)::int AS count
    FROM ${notifications}
    WHERE ${notifications.userId} = ${userId}
      AND ${notifications.isRead} = false
    GROUP BY section
  `);

  const counts: Record<string, number> = {};
  for (const row of result.rows as Array<{ section: string; count: number }>) {
    if (row.section && row.count > 0) {
      counts[row.section] = row.count;
    }
  }
  return counts;
}

/**
 * Mark all unread notifications for a specific section as read.
 * Uses a single efficient query with OR conditions.
 */
export async function markSectionNotificationsAsRead(userId: string, section: string): Promise<number> {
  const matchers = getSectionMatchers(section);
  if (!matchers) return 0;

  // Build SQL conditions for this section
  const conditions: ReturnType<typeof sql>[] = [];

  if (matchers.linkPrefixes?.length) {
    for (const prefix of matchers.linkPrefixes) {
      // Special case: dashboard '/' should match exact '/' not all links
      if (prefix === '/') {
        conditions.push(sql`${notifications.link} = '/'`);
      } else {
        conditions.push(sql`${notifications.link} LIKE ${prefix + '%'}`);
      }
    }
  }

  if (matchers.types?.length) {
    for (const type of matchers.types) {
      conditions.push(sql`${notifications.type} = ${type}`);
    }
  }

  if (conditions.length === 0) return 0;

  // Combine all conditions with OR in a single query
  const orCondition = conditions.length === 1
    ? conditions[0]
    : sql.join(conditions, sql` OR `);

  const result = await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false),
      orCondition
    ));

  return result.rowCount || 0;
}

/** Map a notification to a sidebar section key based on its type and link */
function mapNotificationToSection(type: string, link: string | null): string | null {
  // Link-based mapping (highest priority)
  if (link) {
    if (link.startsWith('/wallet')) return 'wallet';
    if (link.startsWith('/transactions')) return 'transactions';
    if (link.startsWith('/p2p')) return 'p2p';
    if (link.startsWith('/challenges') || link.startsWith('/challenge')) return 'challenges';
    if (link.startsWith('/multiplayer') || link.startsWith('/game')) return 'multiplayer';
    if (link.startsWith('/chat')) return 'chat';
    if (link.startsWith('/friends')) return 'friends';
    if (link.startsWith('/support')) return 'support';
    if (link.startsWith('/complaints')) return 'complaints';
    if (link.startsWith('/leaderboard')) return 'leaderboard';
    if (link.startsWith('/tournaments')) return 'tournaments';
    if (link.startsWith('/free')) return 'free';
    if (link.startsWith('/daily-rewards')) return 'daily-rewards';
    if (link.startsWith('/referral')) return 'referral';
    if (link.startsWith('/settings')) return 'settings';
    if (link.startsWith('/profile')) return 'profile';
    if (link.startsWith('/lobby')) return 'lobby';
    if (link.startsWith('/notifications')) return 'notifications';
    if (link === '/') return 'dashboard';
  }

  // Type-based fallback
  switch (type) {
    case 'transaction': return 'transactions';
    case 'p2p': return 'p2p';
    case 'security': return 'settings';
    case 'announcement': return 'dashboard';
    case 'promotion': return 'free';
    case 'system': return 'notifications';
    case 'id_verification': return 'settings';
    case 'success': return 'notifications';
    case 'warning': return 'notifications';
    default: return 'notifications';
  }
}

/** Get the matchers (types + link prefixes) for a given section */
function getSectionMatchers(section: string): { types?: string[]; linkPrefixes?: string[] } | null {
  const map: Record<string, { types?: string[]; linkPrefixes?: string[] }> = {
    'wallet': { types: ['transaction'], linkPrefixes: ['/wallet'] },
    'transactions': { types: ['transaction'], linkPrefixes: ['/transactions'] },
    'p2p': { types: ['p2p'], linkPrefixes: ['/p2p'] },
    'challenges': { linkPrefixes: ['/challenges', '/challenge'] },
    'multiplayer': { linkPrefixes: ['/multiplayer', '/game'] },
    'chat': { linkPrefixes: ['/chat'] },
    'friends': { linkPrefixes: ['/friends'] },
    'support': { linkPrefixes: ['/support'] },
    'complaints': { linkPrefixes: ['/complaints'] },
    'leaderboard': { linkPrefixes: ['/leaderboard'] },
    'tournaments': { linkPrefixes: ['/tournaments'] },
    'free': { types: ['promotion'], linkPrefixes: ['/free'] },
    'daily-rewards': { linkPrefixes: ['/daily-rewards'] },
    'referral': { linkPrefixes: ['/referral'] },
    'settings': { types: ['security', 'id_verification'], linkPrefixes: ['/settings'] },
    'profile': { linkPrefixes: ['/profile'] },
    'lobby': { linkPrefixes: ['/lobby'] },
    'dashboard': { types: ['announcement'], linkPrefixes: ['/'] },
    'notifications': { types: ['system', 'success', 'warning'], linkPrefixes: ['/notifications'] },
  };
  return map[section] || null;
}

// ==================== ANNOUNCEMENTS ====================

export async function createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
  const [created] = await db.insert(announcements).values(announcement).returning();
  return created;
}

export async function updateAnnouncement(id: string, data: Partial<InsertAnnouncement>): Promise<Announcement | undefined> {
  const [updated] = await db.update(announcements)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(announcements.id, id))
    .returning();
  return updated || undefined;
}

export async function getAnnouncement(id: string): Promise<Announcement | undefined> {
  const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id));
  return announcement || undefined;
}

export async function listAnnouncements(status?: string): Promise<Announcement[]> {
  if (status) {
    return db.select().from(announcements)
      .where(eq(announcements.status, status as AnnouncementStatus))
      .orderBy(desc(announcements.createdAt));
  }
  return db.select().from(announcements).orderBy(desc(announcements.createdAt));
}

export async function getPublishedAnnouncements(target?: string): Promise<Announcement[]> {
  const now = new Date();
  let query = db.select().from(announcements)
    .where(and(
      eq(announcements.status, "published"),
      sql`(${announcements.expiresAt} IS NULL OR ${announcements.expiresAt} > ${now})`
    ))
    .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt));

  return query;
}

export async function markAnnouncementViewed(announcementId: string, userId: string): Promise<void> {
  await db.insert(announcementViews).values({ announcementId, userId }).onConflictDoNothing();
  await db.update(announcements)
    .set({ viewCount: sql`${announcements.viewCount} + 1` })
    .where(eq(announcements.id, announcementId));
}

export async function getViewedAnnouncementIds(userId: string): Promise<string[]> {
  const views = await db.select({ announcementId: announcementViews.announcementId })
    .from(announcementViews)
    .where(eq(announcementViews.userId, userId));
  return views.map(v => v.announcementId);
}
