import { eq } from "drizzle-orm";
import { chatSettings } from "@shared/schema";
import { db } from "../db";

const CHAT_ENABLED_KEY = "chat_enabled";
const LEGACY_CHAT_ENABLED_KEY = "isEnabled";

type ChatSettingRow = {
    key: string;
    value: string | null;
};

function normalizeBooleanText(value: string | null | undefined, fallback = true): "true" | "false" {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "false" || normalized === "0") {
        return "false";
    }
    if (normalized === "true" || normalized === "1") {
        return "true";
    }
    return fallback ? "true" : "false";
}

function resolveChatEnabledValueFromRows(rows: ChatSettingRow[]): "true" | "false" {
    const canonical = rows.find((row) => row.key === CHAT_ENABLED_KEY);
    if (canonical) {
        return normalizeBooleanText(canonical.value, true);
    }

    const legacy = rows.find((row) => row.key === LEGACY_CHAT_ENABLED_KEY);
    if (legacy) {
        return normalizeBooleanText(legacy.value, true);
    }

    return "true";
}

export async function resolveChatEnabledFlagFromDb(): Promise<boolean> {
    const rows = await db
        .select({ key: chatSettings.key, value: chatSettings.value })
        .from(chatSettings)
        .where(eq(chatSettings.key, CHAT_ENABLED_KEY));

    if (rows.length > 0) {
        return resolveChatEnabledValueFromRows(rows) !== "false";
    }

    const legacyRows = await db
        .select({ key: chatSettings.key, value: chatSettings.value })
        .from(chatSettings)
        .where(eq(chatSettings.key, LEGACY_CHAT_ENABLED_KEY));

    return resolveChatEnabledValueFromRows(legacyRows) !== "false";
}

export async function getNormalizedChatSettingsMap(): Promise<Record<string, string>> {
    const rows = await db
        .select({ key: chatSettings.key, value: chatSettings.value })
        .from(chatSettings);

    const settingsMap: Record<string, string> = {};
    const chatEnabledRows: ChatSettingRow[] = [];

    for (const row of rows) {
        if (row.key === CHAT_ENABLED_KEY || row.key === LEGACY_CHAT_ENABLED_KEY) {
            chatEnabledRows.push(row);
            continue;
        }
        settingsMap[row.key] = row.value || "";
    }

    settingsMap[CHAT_ENABLED_KEY] = resolveChatEnabledValueFromRows(chatEnabledRows);
    return settingsMap;
}

export async function removeLegacyChatEnabledAliasRow(): Promise<void> {
    await db.delete(chatSettings).where(eq(chatSettings.key, LEGACY_CHAT_ENABLED_KEY));
}
