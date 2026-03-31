import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { users, chatSettings } from "@shared/schema";

export function registerChatConversationRoutes(app: Express): void {

  // Get chat settings (check if chat is enabled)
  app.get("/api/chat/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await db.select().from(chatSettings);
      const settingsMap: Record<string, string> = {};
      settings.forEach(s => {
        settingsMap[s.key] = s.value || "";
      });
      res.json(settingsMap);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get list of conversations (optimized - single query with JOIN, no N+1)
  app.get("/api/chat/conversations", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // Single query: conversations + user info + unread counts (eliminates N+1)
      const result = await db.execute(sql`
        WITH ranked AS (
          SELECT
            CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END AS other_user_id,
            id, sender_id, receiver_id, content, message_type, is_read, created_at,
            ROW_NUMBER() OVER (
              PARTITION BY CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END
              ORDER BY created_at DESC
            ) AS rn
          FROM chat_messages
          WHERE (sender_id = ${userId} OR receiver_id = ${userId})
            AND deleted_at IS NULL
        ),
        convos AS (
          SELECT other_user_id, id, sender_id, receiver_id, content, message_type, is_read, created_at
          FROM ranked WHERE rn = 1
        ),
        unread_counts AS (
          SELECT sender_id AS other_user_id, COUNT(*) AS unread_count
          FROM chat_messages
          WHERE receiver_id = ${userId} AND is_read = false AND deleted_at IS NULL
          GROUP BY sender_id
        )
        SELECT
          c.*,
          COALESCE(u.unread_count, 0)::int AS unread_count,
          usr.id AS user_id,
          usr.username,
          usr.first_name,
          usr.last_name,
          usr.profile_picture AS avatar_url,
          usr.account_id
        FROM convos c
        LEFT JOIN unread_counts u ON c.other_user_id = u.other_user_id
        LEFT JOIN users usr ON c.other_user_id = usr.id
        WHERE usr.id IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 100
      `);
      
      const conversations = (result.rows as Record<string, unknown>[]).map(row => ({
        otherUserId: row.other_user_id,
        lastMessage: {
          id: row.id,
          senderId: row.sender_id,
          receiverId: row.receiver_id,
          content: row.content,
          messageType: row.message_type,
          isRead: row.is_read,
          createdAt: row.created_at,
        },
        unreadCount: row.unread_count,
        otherUser: {
          id: row.user_id,
          username: row.username,
          firstName: row.first_name,
          lastName: row.last_name,
          avatarUrl: row.avatar_url,
          accountId: row.account_id,
        },
      }));
      
      res.json(conversations);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
