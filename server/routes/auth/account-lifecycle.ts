import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { AccountRecoveryPurpose, User } from "@shared/schema";
import { storage } from "../../storage";
import { sendEmail, sendSms } from "../../lib/messaging";
import { isSafeEmailAddress, isSafePhoneNumber } from "../../lib/input-security";
import {
    accountRecoveryConfirmRateLimiter,
    passwordResetIdentifierRateLimiter,
    passwordResetRateLimiter,
} from "../middleware";
import {
    getErrorMessage,
    IS_DEV_MODE,
    sendSecurityNotification,
    validatePasswordStrength,
} from "./helpers";
import {
    clearResetBruteForceFailures,
    getResetBruteForceBlockState,
    registerResetBruteForceFailure,
} from "./reset-security";

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
const RECOVERY_RESPONSE_MIN_DELAY_MS = 250;
const RECOVERY_RESPONSE_JITTER_MS = 150;

type RecoveryDeliveryChannel = "email" | "phone";

type RecoveryDeliverySelection = {
    channel: RecoveryDeliveryChannel;
    target: string;
};

type RecoveryAction = "reactivate" | "restore";

function toRecoveryPurpose(action: RecoveryAction): AccountRecoveryPurpose {
    return action === "restore" ? "restore_deleted" : "reactivate";
}

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
    return value.trim();
}

function hashRecoveryToken(code: string, channel?: RecoveryDeliveryChannel): string {
    const normalized = code.trim();
    const scopedCode = channel ? `${channel}:${normalized}` : normalized;
    return crypto.createHash("sha256").update(scopedCode).digest("hex");
}

async function applyRecoveryNondisclosureDelay(startedAt: number): Promise<void> {
    const targetDelay = RECOVERY_RESPONSE_MIN_DELAY_MS + crypto.randomInt(0, RECOVERY_RESPONSE_JITTER_MS + 1);
    const elapsed = Date.now() - startedAt;
    if (elapsed >= targetDelay) {
        return;
    }

    await new Promise((resolve) => setTimeout(resolve, targetDelay - elapsed));
}

function generateRecoveryCode(): string {
    return crypto.randomBytes(6).toString("hex").toUpperCase();
}

async function findUserByIdentifier(identifier: string): Promise<User | undefined> {
    const clean = identifier.trim();
    if (!clean) return undefined;

    const byAccount = await storage.getUserByAccountId(clean);
    if (byAccount) return byAccount;

    const normalizedEmail = normalizeEmail(clean);
    if (isSafeEmailAddress(normalizedEmail)) {
        const byEmail = await storage.getUserByEmail(normalizedEmail);
        if (byEmail) return byEmail;
    }

    const normalizedPhone = normalizePhone(clean);
    if (isSafePhoneNumber(normalizedPhone)) {
        const byPhone = await storage.getUserByPhone(normalizedPhone);
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

async function deliverRecoveryCode(delivery: RecoveryDeliverySelection, code: string, action: RecoveryAction): Promise<boolean> {
    const subject = action === "restore"
        ? "VEX - Account Restore Verification"
        : "VEX - Account Reactivation Verification";
    const text = action === "restore"
        ? `Your VEX account restore code is: ${code}. It expires in ${ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES} minutes.`
        : `Your VEX account reactivation code is: ${code}. It expires in ${ACCOUNT_RECOVERY_CODE_EXPIRY_MINUTES} minutes.`;

    if (delivery.channel === "email") {
        return sendEmail({
            to: delivery.target,
            subject,
            text,
        }).catch(() => false);
    }

    if (delivery.channel === "phone") {
        return sendSms({
            to: delivery.target,
            message: text,
        }).catch(() => false);
    }

    return false;
}

function getGenericRecoveryResponse() {
    return {
        success: true,
        message: "If the account is eligible, verification instructions have been sent.",
    };
}

function resolveRecoveryDeliveryChannel(user: User): RecoveryDeliverySelection | null {
    const email = user.email ? normalizeEmail(user.email) : "";
    const phone = user.phone ? normalizePhone(user.phone) : "";

    if (email && user.emailVerified && isSafeEmailAddress(email)) {
        return {
            channel: "email",
            target: email,
        };
    }

    if (phone && user.phoneVerified && isSafePhoneNumber(phone)) {
        return {
            channel: "phone",
            target: phone,
        };
    }

    return null;
}

export function registerAccountLifecycleAuthRoutes(app: Express) {
    app.post("/api/auth/account/recovery/request", passwordResetRateLimiter, passwordResetIdentifierRateLimiter, async (req: Request, res: Response) => {
        try {
            const { identifier, action } = req.body || {};
            const requestStartedAt = Date.now();

            const sendGenericResponse = async () => {
                await applyRecoveryNondisclosureDelay(requestStartedAt);
                return res.json(getGenericRecoveryResponse());
            };

            if (typeof identifier !== "string" || identifier.trim().length < 3) {
                return res.status(400).json({ error: "Valid identifier is required" });
            }
            if (action !== "reactivate" && action !== "restore") {
                return res.status(400).json({ error: "Invalid action" });
            }

            const purpose = toRecoveryPurpose(action);
            const user = await findUserByIdentifier(identifier);

            if (!user || !canRequestRecovery(user, purpose)) {
                return sendGenericResponse();
            }

            const delivery = resolveRecoveryDeliveryChannel(user);
            if (!delivery) {
                return sendGenericResponse();
            }

            const code = generateRecoveryCode();
            const tokenHash = hashRecoveryToken(code, delivery.channel);
            const expiresAt = new Date(Date.now() + ACCOUNT_RECOVERY_CODE_EXPIRY_MS);

            await storage.invalidateUserAccountRecoveryTokens(user.id, purpose);
            await storage.createAccountRecoveryToken({
                userId: user.id,
                purpose,
                tokenHash,
                expiresAt,
            });

            const delivered = await deliverRecoveryCode(delivery, code, action);
            if (!delivered) {
                await storage.invalidateUserAccountRecoveryTokens(user.id, purpose);
                return sendGenericResponse();
            }

            await storage.createAuditLog({
                userId: user.id,
                action: "password_reset",
                entityType: "user",
                entityId: user.id,
                details: `Account recovery requested (${action})`,
                ipAddress: req.ip,
            });

            if (IS_DEV_MODE) {
                await applyRecoveryNondisclosureDelay(requestStartedAt);
                return res.json({
                    ...getGenericRecoveryResponse(),
                    code,
                    devNote: "Recovery code exposed only in development mode (VEX_DEV_MODE)",
                });
            }

            return sendGenericResponse();
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/auth/account/recovery/confirm", accountRecoveryConfirmRateLimiter, async (req: Request, res: Response) => {
        try {
            const { code, action, newPassword } = req.body || {};

            const bruteForceState = await getResetBruteForceBlockState(req, "account-recovery-confirm");
            if (bruteForceState.blocked) {
                if (bruteForceState.retryAfterSeconds > 0) {
                    res.setHeader("Retry-After", String(bruteForceState.retryAfterSeconds));
                }
                return res.status(429).json({ error: "Too many attempts, please try again later" });
            }

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
            let matchedChannel: RecoveryDeliveryChannel | null = null;
            for (const candidate of candidates) {
                const hashCandidates: Array<{ tokenHash: string; channel: RecoveryDeliveryChannel | null }> = [
                    { tokenHash: hashRecoveryToken(candidate, "email"), channel: "email" },
                    { tokenHash: hashRecoveryToken(candidate, "phone"), channel: "phone" },
                    { tokenHash: hashRecoveryToken(candidate), channel: null },
                ];

                for (const hashCandidate of hashCandidates) {
                    const found = await storage.getAccountRecoveryTokenByHash(hashCandidate.tokenHash);
                    if (found) {
                        recoveryToken = found;
                        matchedChannel = hashCandidate.channel;
                        break;
                    }
                }

                if (recoveryToken) {
                    break;
                }
            }

            if (!recoveryToken || recoveryToken.purpose !== purpose) {
                await registerResetBruteForceFailure(req, "account-recovery-confirm", "invalid_or_expired_recovery_code");
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }
            if (recoveryToken.usedAt || new Date() > recoveryToken.expiresAt) {
                await registerResetBruteForceFailure(req, "account-recovery-confirm", "used_or_expired_recovery_code");
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }

            const user = await storage.getUser(recoveryToken.userId);
            if (!user) {
                await registerResetBruteForceFailure(req, "account-recovery-confirm", "recovery_code_user_not_found");
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }

            if (user.status === "banned" || user.status === "suspended") {
                await registerResetBruteForceFailure(req, "account-recovery-confirm", "recovery_code_user_not_allowed");
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }

            if (purpose === "reactivate") {
                if (user.status !== "inactive" || user.accountDeletedAt) {
                    await registerResetBruteForceFailure(req, "account-recovery-confirm", "reactivate_not_eligible");
                    return res.status(400).json({ error: "Account is not eligible for reactivation" });
                }
            } else {
                if (user.status !== "inactive" || !user.accountDeletedAt) {
                    await registerResetBruteForceFailure(req, "account-recovery-confirm", "restore_not_eligible");
                    return res.status(400).json({ error: "Account is not eligible for restore" });
                }
                const deletedAtMs = new Date(user.accountDeletedAt).getTime();
                if (Date.now() - deletedAtMs > ACCOUNT_RESTORE_WINDOW_MS) {
                    await registerResetBruteForceFailure(req, "account-recovery-confirm", "restore_window_expired");
                    return res.status(400).json({ error: "Restore window has expired. Contact support." });
                }
            }

            const passwordHash = await bcrypt.hash(newPassword, 12);

            const consumedRecoveryToken = await storage.consumeAccountRecoveryToken(recoveryToken.id);
            if (!consumedRecoveryToken) {
                await registerResetBruteForceFailure(req, "account-recovery-confirm", "recovery_code_already_consumed");
                return res.status(400).json({ error: "Invalid or expired verification code" });
            }

            const verifiedChannelPatch = matchedChannel === "email"
                ? { emailVerified: true }
                : matchedChannel === "phone"
                    ? { phoneVerified: true }
                    : {};

            await storage.updateUser(user.id, {
                password: passwordHash,
                passwordChangedAt: new Date(),
                status: "active",
                accountDisabledAt: null,
                ...verifiedChannelPatch,
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

            // Revoke stale sessions immediately after account recovery.
            await storage.revokeAllUserSessions(user.id);
            await storage.revokeAllActiveSessions(user.id);

            await storage.invalidateUserAccountRecoveryTokens(user.id, purpose);
            await storage.invalidateUserResetTokens(user.id);
            await clearResetBruteForceFailures(req, "account-recovery-confirm");

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
