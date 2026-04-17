import type { Express, Response } from "express";
import { chatSettings, chatMessages, challengeChatMessages } from "@shared/schema";
import { db } from "../../db";
import { eq, sql, gte, count } from "drizzle-orm";
import { getBannedWordsList, addCustomBannedWord, removeBannedWord } from "../../lib/word-filter";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { invalidateChatEnabledCache } from "../../lib/redis";
import { removeLegacyChatEnabledAliasRow } from "../../lib/chat-settings";

const CHAT_SETTING_ALIAS: Record<string, string> = {
  isEnabled: "chat_enabled",
};

type ChatSettingRule =
  | { type: "boolean" }
  | { type: "int"; min: number; max: number };

const CHAT_SETTING_RULES: Record<string, ChatSettingRule> = {
  chat_enabled: { type: "boolean" },
  max_message_length: { type: "int", min: 1, max: 10000 },
  chat_rate_limit: { type: "int", min: 1, max: 100 },
};

function normalizeChatSettingKey(key: string): string | null {
  const canonical = CHAT_SETTING_ALIAS[key] || key;
  return canonical in CHAT_SETTING_RULES ? canonical : null;
}

function normalizeChatSettingValue(key: string, value: unknown): string | null {
  const rule = CHAT_SETTING_RULES[key];
  if (!rule) return null;

  if (rule.type === "boolean") {
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return "true";
      if (normalized === "false" || normalized === "0") return "false";
    }
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < rule.min || parsed > rule.max) {
    return null;
  }
  return String(parsed);
}

export function registerChatManagementRoutes(app: Express) {

  // ==================== CHAT SETTINGS ====================

  app.get("/api/admin/chat-settings", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const settings = await db
        .select({
          id: chatSettings.id,
          key: chatSettings.key,
          value: chatSettings.value,
          updatedBy: chatSettings.updatedBy,
          updatedAt: chatSettings.updatedAt,
        })
        .from(chatSettings)
        .orderBy(chatSettings.key);

      const normalizedSettings = settings.map((setting) => ({
        id: setting.id,
        key: String(setting.key),
        value: setting.value,
        updatedBy: setting.updatedBy,
        updatedAt: setting.updatedAt,
      }));

      const canonicalSetting = normalizedSettings.find((setting) => setting.key === "chat_enabled");
      const legacySetting = normalizedSettings.find((setting) => setting.key === "isEnabled");
      const responseSettings = normalizedSettings.filter((setting) => setting.key !== "isEnabled");

      if (!canonicalSetting && legacySetting) {
        responseSettings.push({
          ...legacySetting,
          key: "chat_enabled",
        });
      }

      res.json(responseSettings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/chat-settings/:key", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { key: rawKey } = req.params;
      const { value } = req.body;
      const key = normalizeChatSettingKey(rawKey);

      if (!key) {
        return res.status(400).json({ error: "Unsupported chat setting key" });
      }

      const normalizedValue = normalizeChatSettingValue(key, value);
      if (normalizedValue === null) {
        return res.status(400).json({ error: "Invalid setting value" });
      }

      const [existing] = await db.select().from(chatSettings).where(eq(chatSettings.key, key));

      if (!existing) {
        const [created] = await db.insert(chatSettings).values({
          key,
          value: normalizedValue,
          updatedBy: req.admin!.id
        }).returning();

        await logAdminAction(req.admin!.id, "settings_change", "chat_setting", created.id, {
          newValue: normalizedValue
        }, req);

        if (key === "chat_enabled") {
          await removeLegacyChatEnabledAliasRow();
          invalidateChatEnabledCache();
        }

        return res.json(created);
      }

      const [updated] = await db.update(chatSettings)
        .set({ value: normalizedValue, updatedBy: req.admin!.id, updatedAt: new Date() })
        .where(eq(chatSettings.key, key))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "chat_setting", updated.id, {
        previousValue: existing.value || "",
        newValue: normalizedValue
      }, req);

      if (key === "chat_enabled") {
        await removeLegacyChatEnabledAliasRow();
        invalidateChatEnabledCache();
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== ADMIN CHAT MANAGEMENT ====================

  // Chat statistics (privacy-respecting: only counts, no message content)
  app.get("/api/admin/chat/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [totalPrivate] = await db.select({ count: count() }).from(chatMessages);
      const [totalGame] = await db.select({ count: count() }).from(challengeChatMessages);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [todayPrivate] = await db.select({ count: count() }).from(chatMessages)
        .where(gte(chatMessages.createdAt, today));
      const [todayGame] = await db.select({ count: count() }).from(challengeChatMessages)
        .where(gte(challengeChatMessages.createdAt, today));

      const yesterday = new Date(Date.now() - 86400000);
      const activeChatters = await db.execute(sql`
        SELECT COUNT(DISTINCT sender_id) as count FROM chat_messages 
        WHERE created_at >= ${yesterday}
      `);

      res.json({
        totalPrivateMessages: totalPrivate.count,
        totalGameMessages: totalGame.count,
        todayPrivateMessages: todayPrivate.count,
        todayGameMessages: todayGame.count,
        activeChattersLast24h: Number((activeChatters.rows[0] as Record<string, unknown>)?.count || 0),
        bannedWordsCount: getBannedWordsList().length,
        privacyNote: "Private messages are end-to-end encrypted. Admin cannot read message content.",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // PRIVACY: Admin CANNOT read private messages
  app.get("/api/admin/chat/messages", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    return res.status(403).json({
      error: "Access denied - Private messages are end-to-end encrypted",
      message: "لا يمكن للمسؤول قراءة الرسائل الخاصة. الرسائل مشفرة تشفيرًا تامًا.",
      privacyPolicy: "E2EE"
    });
  });

  // PRIVACY: Admin CANNOT delete individual private messages
  app.delete("/api/admin/chat/messages/:messageId", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    return res.status(403).json({
      error: "Access denied - Private messages are end-to-end encrypted",
      message: "لا يمكن للمسؤول حذف الرسائل الخاصة. الرسائل مشفرة تشفيرًا تامًا.",
    });
  });

  // PRIVACY: Admin CANNOT delete all user private messages
  app.delete("/api/admin/chat/user/:userId/messages", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    return res.status(403).json({
      error: "Access denied - Private messages are end-to-end encrypted",
      message: "لا يمكن للمسؤول حذف الرسائل الخاصة. الرسائل مشفرة تشفيرًا تامًا.",
    });
  });

  // Get banned words list
  app.get("/api/admin/chat/banned-words", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json({ words: getBannedWordsList() });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Add banned word
  app.post("/api/admin/chat/banned-words", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { word } = req.body;
      if (!word || typeof word !== 'string' || word.trim().length === 0) {
        return res.status(400).json({ error: "Word is required" });
      }
      addCustomBannedWord(word.trim());

      await logAdminAction(req.admin!.id, "create", "banned_word", word.trim(), { metadata: word.trim() }, req);

      res.json({ success: true, words: getBannedWordsList() });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Remove banned word
  app.delete("/api/admin/chat/banned-words/:word", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { word } = req.params;
      removeBannedWord(word);

      await logAdminAction(req.admin!.id, "delete", "banned_word", word, { previousValue: word }, req);

      res.json({ success: true, words: getBannedWordsList() });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
