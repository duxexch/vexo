import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { AccountRecoveryPurpose, User } from "@shared/schema";
import { storage } from "../../storage";
import { sendEmail, sendSms } from "../../lib/messaging";
import { isSafeEmailAddress, isSafePhoneNumber } from "../../lib/input-security";
import { passwordResetRateLimiter, strictRateLimiter } from "../middleware";
import {
    getErrorMessage,
    IS_DEV_MODE,
    sendSecurityNotification,
    validatePasswordStrength,
} from "./helpers";

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    const parsed = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

const ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES = readIntEnv("ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES", 20, 5, 120);
const ACCOUNT_RECOVERY_CODE_EXPIRY_MS = ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES * 60 * 1000;
const ACCOUNT_RESTORE_WINDOW_DAYS = readIntEnv("ACCOUNT_RESTORE_WINDOW_DAYS", 30, 1, 365);
const ACCOUNT_RESTORE_WINDOW_MS = ACCOUNT_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

type RecoveryAction = "reactivate" | "restore";

function toRecoveryPurpose(action: RecoveryAction): AccountRecoveryPurpose {
    return action === "restore" ? "restore_deleted" : "reactivate";
}

function generateRecoveryCode(): string {
    return crypto.randomBytes(6).toString("hex").toUpperCase();
}

async function findUserByIdentifier(identifier: string): Promise<User | undefined> {
    const clean = identifier.trim();
    if (!clean) return undefined;

    const byAccount = await storage.getUserByAccountId(clean);
    if (byAccount) return byAccount;

    if (isSafeEmailAddress(clean)) {
        const byEmail = await storage.getUserByEmail(clean);
        if (byEmail) return byEmail;
    }

    if (isSafePhoneNumber(clean)) {
        const byPhone = await storage.getUserByPhone(clean);
        if (byPhone) return byPhone;
    }

    const byUsername = await storage.getUserByUsername(clean);
    return byUsername;
}

function canRequestRecovery(user: User, purpose: AccountRecoveryPurpose): boolean {
    if (user.status === "banned" || user.status === "suspended") {
        return false;
    }

    if (purpose === "reactivate") {
        return user.status === "inactive" && !user.accountDeletedAt;
    }

    if (!user.accountDeletedAt) {
        return false;
    }

    const deletedAtMs = new Date(user.accountDeletedAt).getTime();
    return Date.now() - deletedAtMs <= ACCOUNT_RESTORE_WINDOW_MS;
}

async function deliverRecoveryCode(user: User, code: string, action: RecoveryAction): Promise<void> {
    const subject = action === "restore"
        ? "VEX - Account Restore Verification"
        : "VEX - Account Reactivation Verification";
    const text = action === "restore"
        ? `Your VEX account restore code is: ${code}. It expires in ${ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES} minutes.`
        : `Your VEX account reactivation code is: ${code}. It expires in ${ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES} minutes.`;

    if (user.email && isSafeEmailAddress(user.email)) {
        await sendEmail({
            to: user.email,
            subject,
            text,
        }).catch(() => { });
        return;
    }

    if (user.phone && isSafePhoneNumber(user.phone)) {
        await sendSms({
            to: user.phone,
            message: text,
        }).catch(() => { });
    }
}

function getGenericRecoveryResponse() {
    return {
        success: true,
        message: "If the account is eligible, verification instructions have been sent.",
    };
}

function hasRecoverableChannel(user: User): boolean {
    return Boolean(
        (user.email && isSafeEmailAddress(user.email))
        || (user.phone && isSafePhoneNumber(user.phone)),
    );
}

export function registerAccountLifecycleAuthRoutes(app: Express) {
    app.post("/api/auth/account/recovery/request", passwordResetRateLimiter, async (req: Request, res: Response) => {
        try {
            const { identifier, action } = req.body || {};

            if (typeof identifier !== "string" || identifier.trim().length < 3) {
                return res.status(400).json({ error: "Valid identifier is required" });
            }
            if (action !== "reactivate" && action !== "restore") {
                return res.status(400).json({ error: "Invalid action" });
            }

            const purpose = toRecoveryPurpose(action);
            const generic = getGenericRecoveryResponse();
            const user = await findUserByIdentifier(identifier);

            if (!user || !canRequestRecovery(user, purpose)) {
                return res.json(generic);
            }

            if (!hasRecoverableChannel(user)) {
                return res.json(generic);
            }

            const code = generateRecoveryCode();
            const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
            const expiresAt = new Date(Date.now() + ACCOUNT_RECOVERY_CODE_EXPIRY_MS);

            await storage.invalidateUserAccountRecoveryTokens(user.id, purpose);
            await storage.createAccountRecoveryToken({
                userId: user.id,
                purpose,
                tokenHash,
                expiresAt,
            });

            await deliverRecoveryCode(user, code, action);

            await storage.createAuditLog({
                userId: user.id,
                action: "password_reset",
                entityType: "user",
                entityId: user.id,
                details: `Account recovery requested (${action})`,
                ipAddress: req.ip,
            });

            if (IS_DEV_MODE) {
                return res.json({
                    ...generic,
                    code,
                    devNote: "Recovery code exposed only in development mode (VEX_DEV_MODE)",
                });
            }

            return res.json(generic);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/auth/account/recovery/confirm", strictRateLimiter, async (req: Request, res: Response) => {
        try {
            const { code, action, newPassword } = req.body || {};

            if (typeof code !== "string" || code.trim().length < 6) {
                return res.status(400).json({ error: "Verification code is required" });
            }
            if (action !== "reactivate" && action !== "restore") {
                return res.status(400).json({ error: "Invalid action" });
            }
            if (typeof newPassword !== "string") {
                return res.status(400).json({ error: "New password is required" });
            }

            const passwordValidation = validatePasswordStrength(newPassword);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const purpose = toRecoveryPurpose(action);
            const normalizedCode = code.trim();
            const candidates = Array.from(new Set([normalizedCode, normalizedCode.toUpperCase()]));

            let recoveryToken = undefined;
            for (const candidate of candidates) {
                const tokenHash = crypto.createHash("sha256").update(candidate).digest("hex");
                const found = await storage.getAccountRecoveryTokenByHash(tokenHash);
                if (found) {
                    recoveryToken = found;
                    break;
                }
            }

            if (!recoveryToken || recoveryToken.purpose !== purpose) {
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }
            if (recoveryToken.usedAt) {
                return res.status(400).json({ error: "Verification code has already been used" });
            }
            if (new Date() > recoveryToken.expiresAt) {
                return res.status(400).json({ error: "Verification code has expired" });
            }

            const user = await storage.getUser(recoveryToken.userId);
            if (!user) {
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }

            if (user.status === "banned" || user.status === "suspended") {
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }

            if (purpose === "reactivate") {
                if (user.status !== "inactive" || user.accountDeletedAt) {
                    return res.status(400).json({ error: "Account is not eligible for reactivation" });
                }
            } else {
                if (user.status !== "inactive" || !user.accountDeletedAt) {
                    return res.status(400).json({ error: "Account is not eligible for restore" });
                }
                const deletedAtMs = new Date(user.accountDeletedAt).getTime();
                if (Date.now() - deletedAtMs > ACCOUNT_RESTORE_WINDOW_MS) {
                    return res.status(400).json({ error: "Restore window has expired. Contact support." });
                }
            }

            const passwordHash = await bcrypt.hash(newPassword, 12);
            await storage.updateUser(user.id, {
                password: passwordHash,
                passwordChangedAt: new Date(),
                status: "active",
                accountDisabledAt: null,
                ...(purpose === "restore_deleted"
                    ? {
                        accountDeletedAt: null,
                        accountDeletionReason: null,
                        accountRestoredAt: new Date(),
                    }
                    : {}),
                failedLoginAttempts: 0,
                lockedUntil: null,
            });

            await storage.markAccountRecoveryTokenAsUsed(recoveryToken.id);
            await storage.invalidateUserAccountRecoveryTokens(user.id, purpose);
            await storage.invalidateUserResetTokens(user.id);

            await storage.createAuditLog({
                userId: user.id,
                action: "password_changed",
                entityType: "user",
                entityId: user.id,
                details: purpose === "restore_deleted" ? "Account restored via recovery code" : "Account reactivated via recovery code",
                ipAddress: req.ip,
            });

            sendSecurityNotification(
                user.id,
                purpose === "restore_deleted" ? "Account Restored" : "Account Reactivated",
                purpose === "restore_deleted" ? "تمت استعادة الحساب" : "تمت إعادة تفعيل الحساب",
                purpose === "restore_deleted"
                    ? "Your account has been restored successfully."
                    : "Your account has been reactivated successfully.",
                purpose === "restore_deleted"
                    ? "تمت استعادة حسابك بنجاح."
                    : "تمت إعادة تفعيل حسابك بنجاح.",
            );

            return res.json({
                success: true,
                message: purpose === "restore_deleted"
                    ? "Account restored successfully. You can now sign in."
                    : "Account reactivated successfully. You can now sign in.",
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
