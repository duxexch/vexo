import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { p2pTraderProfiles, users } from "@shared/schema";
import { sanitizePlainText } from "./input-security";

const P2P_USERNAME_MIN_LENGTH = 4;
const P2P_USERNAME_MAX_LENGTH = 24;
const P2P_USERNAME_PATTERN = /^[a-z0-9_]+$/;

function isAsciiAlphaNumericCode(code: number): boolean {
    return (code >= 48 && code <= 57)
        || (code >= 65 && code <= 90)
        || (code >= 97 && code <= 122);
}

function normalizeAsciiCodeToLower(code: number): number {
    if (code >= 65 && code <= 90) {
        return code + 32;
    }

    return code;
}

function isP2PUsernameCharCode(code: number): boolean {
    return isAsciiAlphaNumericCode(code) || code === 95;
}

function compactAlphaNumericLower(rawValue: string): string {
    const input = String(rawValue || "");
    let output = "";

    for (let index = 0; index < input.length; index += 1) {
        const normalizedCode = normalizeAsciiCodeToLower(input.charCodeAt(index));
        if (isAsciiAlphaNumericCode(normalizedCode)) {
            output += String.fromCharCode(normalizedCode);
        }
    }

    return output;
}

function normalizeP2PUsernameCore(rawValue: string): string {
    const input = String(rawValue || "");
    let normalized = "";
    let previousWasUnderscore = false;

    for (let index = 0; index < input.length; index += 1) {
        const normalizedCode = normalizeAsciiCodeToLower(input.charCodeAt(index));

        if (isP2PUsernameCharCode(normalizedCode)) {
            if (normalizedCode === 95) {
                if (normalized.length === 0 || previousWasUnderscore) {
                    continue;
                }

                normalized += "_";
                previousWasUnderscore = true;
                continue;
            }

            normalized += String.fromCharCode(normalizedCode);
            previousWasUnderscore = false;
            continue;
        }

        if (normalized.length > 0 && !previousWasUnderscore) {
            normalized += "_";
            previousWasUnderscore = true;
        }
    }

    if (normalized.endsWith("_")) {
        normalized = normalized.slice(0, -1);
    }

    return normalized;
}

function ensureP2PUsernameLength(value: string): string {
    if (value.length > P2P_USERNAME_MAX_LENGTH) {
        return value.slice(0, P2P_USERNAME_MAX_LENGTH);
    }

    if (value.length >= P2P_USERNAME_MIN_LENGTH) {
        return value;
    }

    return value.padEnd(P2P_USERNAME_MIN_LENGTH, "0");
}

function buildDefaultP2PUsernameBase(userId: string, fallback?: string): string {
    const compactUserId = compactAlphaNumericLower(userId);
    const compactFallback = compactAlphaNumericLower(fallback || "");
    const suffix = compactUserId.slice(-8) || compactFallback.slice(0, 8) || "user";
    const base = normalizeP2PUsernameCore(`trader_${suffix}`);
    return ensureP2PUsernameLength(base || "trader_user");
}

function isUniqueConstraintViolation(error: unknown): boolean {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === "23505") {
        return true;
    }

    const message = String((error as { message?: string })?.message || error || "").toLowerCase();
    return message.includes("duplicate key") || message.includes("p2p_username");
}

export function normalizeP2PUsernameInput(rawValue: string): string {
    const sanitized = sanitizePlainText(String(rawValue || ""), { maxLength: 80 });
    const normalized = normalizeP2PUsernameCore(sanitized);
    return ensureP2PUsernameLength(normalized);
}

export function isValidP2PUsername(username: string): boolean {
    return username.length >= P2P_USERNAME_MIN_LENGTH
        && username.length <= P2P_USERNAME_MAX_LENGTH
        && P2P_USERNAME_PATTERN.test(username);
}

async function selectP2PProfile(userId: string) {
    const [profile] = await db
        .select({
            id: p2pTraderProfiles.id,
            userId: p2pTraderProfiles.userId,
            p2pUsername: p2pTraderProfiles.p2pUsername,
            p2pUsernameChangeCount: p2pTraderProfiles.p2pUsernameChangeCount,
        })
        .from(p2pTraderProfiles)
        .where(eq(p2pTraderProfiles.userId, userId))
        .limit(1);

    return profile;
}

export async function isP2PUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
    const normalized = normalizeP2PUsernameInput(username);

    if (!isValidP2PUsername(normalized)) {
        return true;
    }

    const whereClause = excludeUserId
        ? and(
            eq(p2pTraderProfiles.p2pUsername, normalized),
            ne(p2pTraderProfiles.userId, excludeUserId),
        )
        : eq(p2pTraderProfiles.p2pUsername, normalized);

    const [existing] = await db
        .select({ id: p2pTraderProfiles.id })
        .from(p2pTraderProfiles)
        .where(whereClause)
        .limit(1);

    return Boolean(existing);
}

export async function findAvailableP2PUsername(baseCandidate: string, excludeUserId?: string): Promise<string> {
    const normalizedBase = normalizeP2PUsernameInput(baseCandidate);

    for (let attempt = 0; attempt < 500; attempt += 1) {
        const suffix = attempt === 0 ? "" : `_${attempt + 1}`;
        const trimmedBase = suffix.length > 0
            ? normalizedBase.slice(0, Math.max(P2P_USERNAME_MIN_LENGTH, P2P_USERNAME_MAX_LENGTH - suffix.length))
            : normalizedBase;
        const candidate = `${trimmedBase}${suffix}`;

        if (!isValidP2PUsername(candidate)) {
            continue;
        }

        const taken = await isP2PUsernameTaken(candidate, excludeUserId);
        if (!taken) {
            return candidate;
        }
    }

    throw new Error("Unable to allocate a unique P2P username. Please try again.");
}

export async function ensureP2PUsername(userId: string, fallbackUsername?: string): Promise<string> {
    const profile = await selectP2PProfile(userId);
    if (profile?.p2pUsername && isValidP2PUsername(profile.p2pUsername)) {
        return profile.p2pUsername;
    }

    const [user] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const baseCandidate = buildDefaultP2PUsernameBase(userId, fallbackUsername || user?.username);

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const nextSeed = attempt === 0 ? baseCandidate : `${baseCandidate}_${attempt + 1}`;
        const available = await findAvailableP2PUsername(nextSeed, userId);

        try {
            if (profile) {
                await db
                    .update(p2pTraderProfiles)
                    .set({ p2pUsername: available, updatedAt: new Date() })
                    .where(eq(p2pTraderProfiles.userId, userId));
            } else {
                await db
                    .insert(p2pTraderProfiles)
                    .values({ userId, p2pUsername: available });
            }

            return available;
        } catch (error: unknown) {
            if (isUniqueConstraintViolation(error)) {
                continue;
            }

            throw error;
        }
    }

    throw new Error("Unable to initialize P2P username. Please try again.");
}

export async function getP2PUsernameMap(userIds: string[]): Promise<Map<string, string>> {
    const uniqueUserIds = Array.from(new Set((userIds || []).filter((userId) => typeof userId === "string" && userId.length > 0)));
    if (uniqueUserIds.length === 0) {
        return new Map();
    }

    const rows = await db
        .select({
            userId: p2pTraderProfiles.userId,
            p2pUsername: p2pTraderProfiles.p2pUsername,
        })
        .from(p2pTraderProfiles)
        .where(inArray(p2pTraderProfiles.userId, uniqueUserIds));

    const usernameMap = new Map<string, string>();
    for (const row of rows) {
        if (row.p2pUsername && isValidP2PUsername(row.p2pUsername)) {
            usernameMap.set(row.userId, row.p2pUsername);
        }
    }

    const missingUserIds = uniqueUserIds.filter((userId) => !usernameMap.has(userId));
    if (missingUserIds.length === 0) {
        return usernameMap;
    }

    const missingUsers = await db
        .select({
            id: users.id,
            username: users.username,
        })
        .from(users)
        .where(inArray(users.id, missingUserIds));

    const fallbackByUserId = new Map(missingUsers.map((entry) => [entry.id, entry.username]));

    for (const userId of missingUserIds) {
        const generated = await ensureP2PUsername(userId, fallbackByUserId.get(userId));
        usernameMap.set(userId, generated);
    }

    return usernameMap;
}

export async function updateP2PUsernameOnce(userId: string, rawRequestedUsername: string): Promise<{
    p2pUsername: string;
    p2pUsernameChangeCount: number;
    canChangeP2PUsername: boolean;
}> {
    const sanitizedInput = sanitizePlainText(String(rawRequestedUsername || ""), { maxLength: 80 }).trim();
    if (!sanitizedInput) {
        throw new Error("P2P username is required.");
    }

    const normalizedRequested = normalizeP2PUsernameInput(sanitizedInput);
    if (!isValidP2PUsername(normalizedRequested)) {
        throw new Error("P2P username must be 4-24 chars and use only letters, numbers, and underscore.");
    }

    const currentUsername = await ensureP2PUsername(userId);
    const profile = await selectP2PProfile(userId);
    const currentChangeCount = profile?.p2pUsernameChangeCount || 0;

    if (normalizedRequested === currentUsername) {
        return {
            p2pUsername: currentUsername,
            p2pUsernameChangeCount: currentChangeCount,
            canChangeP2PUsername: currentChangeCount < 1,
        };
    }

    if (currentChangeCount >= 1) {
        throw new Error("P2P username can only be changed once.");
    }

    const taken = await isP2PUsernameTaken(normalizedRequested, userId);
    if (taken) {
        throw new Error("This P2P username is already taken.");
    }

    const nextChangeCount = currentChangeCount + 1;

    await db
        .update(p2pTraderProfiles)
        .set({
            p2pUsername: normalizedRequested,
            p2pUsernameChangeCount: nextChangeCount,
            updatedAt: new Date(),
        })
        .where(eq(p2pTraderProfiles.userId, userId));

    return {
        p2pUsername: normalizedRequested,
        p2pUsernameChangeCount: nextChangeCount,
        canChangeP2PUsername: nextChangeCount < 1,
    };
}

export async function getP2PUsernameSettings(userId: string): Promise<{
    p2pUsername: string;
    p2pUsernameChangeCount: number;
    canChangeP2PUsername: boolean;
}> {
    const p2pUsername = await ensureP2PUsername(userId);
    const profile = await selectP2PProfile(userId);
    const p2pUsernameChangeCount = profile?.p2pUsernameChangeCount || 0;

    return {
        p2pUsername,
        p2pUsernameChangeCount,
        canChangeP2PUsername: p2pUsernameChangeCount < 1,
    };
}
