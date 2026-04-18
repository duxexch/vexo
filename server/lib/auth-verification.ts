import type { Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { activeSessions, users } from "@shared/schema";
import {
    JWT_ADMIN_SECRET,
    JWT_USER_SECRET,
    type JwtAdminPayload,
    type JwtUserPayload,
} from "./auth-config";

type JwtUserPayloadCompat = JwtUserPayload & { userId?: string };

export class AuthVerificationError extends Error {
    status: number;
    code?: string;

    constructor(status: number, message: string, code?: string) {
        super(message);
        this.name = "AuthVerificationError";
        this.status = status;
        this.code = code;
    }
}

export function getTokenFingerprint(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex").substring(0, 32);
}

export function getSessionFingerprintFromUserAgent(userAgent?: string): string {
    const normalizedUserAgent = userAgent || "unknown";
    return crypto.createHash("sha256").update(normalizedUserAgent).digest("hex").substring(0, 16);
}

export function getUserTokenFromRequest(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }

    if (req.cookies?.vex_token && typeof req.cookies.vex_token === "string") {
        return req.cookies.vex_token;
    }

    return undefined;
}

export function getAdminTokenFromRequest(req: Request): string | undefined {
    const adminTokenHeader = req.headers["x-admin-token"];
    if (typeof adminTokenHeader === "string" && adminTokenHeader.length > 0) {
        return adminTokenHeader;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }

    return undefined;
}

function shouldEnforceSessionFingerprint(explicit?: boolean): boolean {
    if (typeof explicit === "boolean") {
        return explicit;
    }

    return process.env.ENFORCE_SESSION_FINGERPRINT === "true" || process.env.NODE_ENV === "production";
}

export interface VerifyUserTokenOptions {
    userAgent?: string;
    enforceSessionFingerprint?: boolean;
    requireActiveSession?: boolean;
    updateSessionActivity?: boolean;
}

export interface VerifiedUserToken {
    id: string;
    username: string;
    role: string;
    tokenFingerprint: string;
    payload: JwtUserPayloadCompat;
}

export async function verifyUserAccessToken(
    token: string,
    options: VerifyUserTokenOptions = {},
): Promise<VerifiedUserToken> {
    let decoded: JwtUserPayloadCompat;
    try {
        decoded = jwt.verify(token, JWT_USER_SECRET) as JwtUserPayloadCompat;
    } catch {
        throw new AuthVerificationError(401, "Invalid token", "INVALID_TOKEN");
    }

    const userId = typeof decoded.id === "string" ? decoded.id : decoded.userId;
    if (!userId) {
        throw new AuthVerificationError(401, "Invalid token payload", "INVALID_TOKEN_PAYLOAD");
    }

    const [user] = await db.select({
        status: users.status,
        role: users.role,
        username: users.username,
        accountDeletedAt: users.accountDeletedAt,
        passwordChangedAt: users.passwordChangedAt,
        lockedUntil: users.lockedUntil,
    })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) {
        throw new AuthVerificationError(401, "User not found", "USER_NOT_FOUND");
    }

    if (user.status === "banned") {
        throw new AuthVerificationError(403, "Account is banned", "ACCOUNT_BANNED");
    }

    if (user.status === "suspended") {
        throw new AuthVerificationError(403, "Account is suspended", "ACCOUNT_SUSPENDED");
    }

    if (user.status === "inactive") {
        throw new AuthVerificationError(403, "Account is inactive", "ACCOUNT_INACTIVE");
    }

    if (user.accountDeletedAt) {
        throw new AuthVerificationError(403, "Account is deleted", "ACCOUNT_DELETED");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AuthVerificationError(403, "Account is temporarily locked", "ACCOUNT_LOCKED");
    }

    if (user.passwordChangedAt && decoded.iat) {
        const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (passwordChangedTimestamp > decoded.iat) {
            throw new AuthVerificationError(401, "Password changed. Please login again.", "PASSWORD_CHANGED");
        }
    }

    const enforceSessionFingerprint = shouldEnforceSessionFingerprint(options.enforceSessionFingerprint);
    if (enforceSessionFingerprint && decoded.fp) {
        const currentFingerprint = getSessionFingerprintFromUserAgent(options.userAgent);
        if (decoded.fp !== currentFingerprint) {
            throw new AuthVerificationError(401, "Session invalid. Please login again.", "SESSION_FINGERPRINT_MISMATCH");
        }
    }

    const tokenFingerprint = getTokenFingerprint(token);
    const requireActiveSession = options.requireActiveSession !== false;

    if (requireActiveSession) {
        const [session] = await db.select({
            id: activeSessions.id,
            expiresAt: activeSessions.expiresAt,
        })
            .from(activeSessions)
            .where(and(
                eq(activeSessions.userId, userId),
                eq(activeSessions.tokenFingerprint, tokenFingerprint),
                eq(activeSessions.isActive, true),
            ))
            .limit(1);

        if (!session) {
            throw new AuthVerificationError(401, "Session not active. Please login again.", "SESSION_INACTIVE");
        }

        if (session.expiresAt <= new Date()) {
            db.update(activeSessions)
                .set({ isActive: false })
                .where(eq(activeSessions.id, session.id))
                .execute()
                .catch(() => { });
            throw new AuthVerificationError(401, "Session expired. Please login again.", "SESSION_EXPIRED");
        }

        if (options.updateSessionActivity) {
            db.update(activeSessions)
                .set({ lastActivityAt: new Date() })
                .where(eq(activeSessions.id, session.id))
                .execute()
                .catch(() => { });
        }
    }

    // Always trust the canonical DB username so profile/name updates are reflected immediately
    // across API responses without waiting for token refresh or re-login.
    const username = user.username;

    return {
        id: userId,
        username,
        role: user.role,
        tokenFingerprint,
        payload: decoded,
    };
}

export interface VerifiedAdminToken {
    id: string;
    username: string;
    role: "admin";
    tokenFingerprint: string;
    payload: JwtAdminPayload;
}

export interface VerifyAdminTokenOptions {
    userAgent?: string;
    enforceSessionFingerprint?: boolean;
    requireActiveSession?: boolean;
    updateSessionActivity?: boolean;
}

export async function verifyAdminAccessToken(
    token: string,
    options: VerifyAdminTokenOptions = {},
): Promise<VerifiedAdminToken> {
    let decoded: JwtAdminPayload;
    try {
        decoded = jwt.verify(token, JWT_ADMIN_SECRET) as JwtAdminPayload;
    } catch {
        throw new AuthVerificationError(401, "Invalid admin token", "INVALID_ADMIN_TOKEN");
    }

    if (decoded.role !== "admin") {
        throw new AuthVerificationError(403, "Admin access only", "ADMIN_ONLY");
    }

    const [adminUser] = await db.select({
        status: users.status,
        role: users.role,
        username: users.username,
        accountDeletedAt: users.accountDeletedAt,
        passwordChangedAt: users.passwordChangedAt,
    })
        .from(users)
        .where(eq(users.id, decoded.id))
        .limit(1);

    if (!adminUser || adminUser.role !== "admin") {
        throw new AuthVerificationError(403, "Admin access revoked", "ADMIN_ACCESS_REVOKED");
    }

    if (
        adminUser.status === "banned"
        || adminUser.status === "suspended"
        || adminUser.status === "inactive"
        || Boolean(adminUser.accountDeletedAt)
    ) {
        throw new AuthVerificationError(403, "Admin account is disabled", "ADMIN_DISABLED");
    }

    if (adminUser.passwordChangedAt && decoded.iat) {
        const passwordChangedTimestamp = Math.floor(adminUser.passwordChangedAt.getTime() / 1000);
        if (passwordChangedTimestamp > decoded.iat) {
            throw new AuthVerificationError(401, "Password changed. Please login again.", "PASSWORD_CHANGED");
        }
    }

    const enforceSessionFingerprint = shouldEnforceSessionFingerprint(options.enforceSessionFingerprint);
    if (enforceSessionFingerprint && decoded.fp) {
        const currentFingerprint = getSessionFingerprintFromUserAgent(options.userAgent);
        if (decoded.fp !== currentFingerprint) {
            throw new AuthVerificationError(401, "Admin session invalid. Please login again.", "SESSION_FINGERPRINT_MISMATCH");
        }
    }

    const tokenFingerprint = getTokenFingerprint(token);
    const requireActiveSession = options.requireActiveSession !== false;

    if (requireActiveSession) {
        const [session] = await db.select({
            id: activeSessions.id,
            expiresAt: activeSessions.expiresAt,
        })
            .from(activeSessions)
            .where(and(
                eq(activeSessions.userId, decoded.id),
                eq(activeSessions.tokenFingerprint, tokenFingerprint),
                eq(activeSessions.isActive, true),
            ))
            .limit(1);

        if (!session) {
            throw new AuthVerificationError(401, "Admin session not active. Please login again.", "SESSION_INACTIVE");
        }

        if (session.expiresAt <= new Date()) {
            db.update(activeSessions)
                .set({ isActive: false })
                .where(eq(activeSessions.id, session.id))
                .execute()
                .catch(() => { });
            throw new AuthVerificationError(401, "Admin session expired. Please login again.", "SESSION_EXPIRED");
        }

        if (options.updateSessionActivity) {
            db.update(activeSessions)
                .set({ lastActivityAt: new Date() })
                .where(eq(activeSessions.id, session.id))
                .execute()
                .catch(() => { });
        }
    }

    return {
        id: decoded.id,
        username: adminUser.username,
        role: "admin",
        tokenFingerprint,
        payload: decoded,
    };
}
