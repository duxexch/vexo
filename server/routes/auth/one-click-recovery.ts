import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../../storage";
import { authRateLimiter, strictRateLimiter } from "../middleware";
import { isSafeEmailAddress, isSafePhoneNumber } from "../../lib/input-security";
import {
    createIdentifierOtpChallengeToken,
    issueIdentifierOtp,
    verifyIdentifierOtpChallengeToken,
    verifyIdentifierOtpCode,
    type IdentifierOtpMethod,
} from "./identifier-otp";
import {
    checkAccountLockout,
    consumeInvalidLoginDelay,
    getErrorMessage,
    handleFailedLogin,
    handleSuccessfulLogin,
    hasVerifiedRecoveryChannel,
} from "./helpers";

function normalizeRecoveryChannel(value: unknown): IdentifierOtpMethod | null {
    if (value === "email" || value === "phone") {
        return value;
    }
    return null;
}

function normalizeRecoveryTarget(channel: IdentifierOtpMethod, target: unknown): string | null {
    if (typeof target !== "string") {
        return null;
    }

    const trimmed = target.trim();
    if (!trimmed) {
        return null;
    }

    if (channel === "email") {
        const normalizedEmail = trimmed.toLowerCase();
        if (!isSafeEmailAddress(normalizedEmail)) {
            return null;
        }
        return normalizedEmail;
    }

    if (!isSafePhoneNumber(trimmed)) {
        return null;
    }

    return trimmed;
}

export function registerOneClickRecoveryRoutes(app: Express) {
    app.post("/api/auth/account/recovery/bootstrap", authRateLimiter, strictRateLimiter, async (req: Request, res: Response) => {
        try {
            const { accountId, password, channel, target } = req.body || {};

            if (
                typeof accountId !== "string"
                || typeof password !== "string"
                || accountId.trim().length < 8
                || password.length < 1
            ) {
                return res.status(400).json({ error: "Account credentials are required" });
            }

            const normalizedChannel = normalizeRecoveryChannel(channel);
            if (!normalizedChannel) {
                return res.status(400).json({ error: "Recovery channel must be email or phone" });
            }

            const normalizedTarget = normalizeRecoveryTarget(normalizedChannel, target);
            if (!normalizedTarget) {
                return res.status(400).json({ error: "Invalid recovery target" });
            }

            const user = await storage.getUserByAccountId(accountId.trim());
            if (!user) {
                await consumeInvalidLoginDelay(password);
                return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
            }

            if (await checkAccountLockout(user, res)) return;

            const passwordValid = await bcrypt.compare(password, user.password);
            if (!passwordValid) {
                return handleFailedLogin(user, res, req);
            }

            if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
                return res.status(403).json({ error: "Account is not active" });
            }

            if (user.registrationType !== "account") {
                return res.status(400).json({ error: "Recovery bootstrap is only available for one-click accounts" });
            }

            if (normalizedChannel === "email") {
                const existingOwner = await storage.getUserByEmail(normalizedTarget);
                if (existingOwner && existingOwner.id !== user.id) {
                    return res.status(400).json({ error: "Recovery target is already in use" });
                }
            } else {
                const existingOwner = await storage.getUserByPhone(normalizedTarget);
                if (existingOwner && existingOwner.id !== user.id) {
                    return res.status(400).json({ error: "Recovery target is already in use" });
                }
            }

            const updatePatch = normalizedChannel === "email"
                ? { email: normalizedTarget, emailVerified: false }
                : { phone: normalizedTarget, phoneVerified: false };

            await storage.updateUser(user.id, updatePatch);
            await handleSuccessfulLogin(user);

            const refreshedUser = await storage.getUser(user.id);
            if (!refreshedUser || refreshedUser.status !== "active" || Boolean(refreshedUser.accountDeletedAt)) {
                return res.status(400).json({ error: "Unable to continue recovery bootstrap" });
            }

            const otpResult = await issueIdentifierOtp({
                user: refreshedUser,
                method: normalizedChannel,
                flow: "login",
            });

            if (!otpResult.sent) {
                return res.status(503).json({ error: "Unable to send verification code" });
            }

            const challengeToken = createIdentifierOtpChallengeToken({
                userId: refreshedUser.id,
                methods: [normalizedChannel],
                preferredMethod: normalizedChannel,
                flow: "login",
            });

            await storage.createAuditLog({
                userId: refreshedUser.id,
                action: "settings_change",
                entityType: "user",
                entityId: refreshedUser.id,
                details: `Recovery bootstrap started via ${normalizedChannel}`,
                ipAddress: req.ip,
            });

            return res.json({
                requiresIdentifierOtp: true,
                challengeToken,
                availableMethods: [normalizedChannel],
                maskedTarget: otpResult.maskedTarget,
                expiresIn: otpResult.expiresInSeconds,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/auth/account/recovery/bootstrap/verify", strictRateLimiter, async (req: Request, res: Response) => {
        try {
            const { challengeToken, code } = req.body || {};
            if (typeof challengeToken !== "string" || challengeToken.length === 0) {
                return res.status(400).json({ error: "Challenge token is required" });
            }
            if (typeof code !== "string" || code.trim().length < 4 || code.trim().length > 10) {
                return res.status(400).json({ error: "Verification code is required" });
            }

            const challenge = verifyIdentifierOtpChallengeToken(challengeToken);
            if (!challenge) {
                return res.status(400).json({ error: "Invalid or expired challenge token" });
            }

            const user = await storage.getUser(challenge.uid);
            if (!user || user.status !== "active" || Boolean(user.accountDeletedAt)) {
                return res.status(400).json({ error: "Invalid or expired challenge token" });
            }

            if (user.registrationType !== "account") {
                return res.status(400).json({ error: "Invalid recovery bootstrap request" });
            }

            const verification = await verifyIdentifierOtpCode({
                userId: user.id,
                methods: challenge.methods,
                code,
            });

            if (!verification.valid || !verification.matchedMethod) {
                return res.status(400).json({ error: "Invalid verification code" });
            }

            const patch = verification.matchedMethod === "email"
                ? { emailVerified: true }
                : { phoneVerified: true };

            await storage.updateUser(user.id, patch);

            const reloadedUser = await storage.getUser(user.id);
            if (!reloadedUser || !hasVerifiedRecoveryChannel(reloadedUser)) {
                return res.status(400).json({ error: "Recovery verification did not complete" });
            }

            await storage.createAuditLog({
                userId: user.id,
                action: "otp_verified",
                entityType: "user",
                entityId: user.id,
                details: `Recovery bootstrap verified via ${verification.matchedMethod}`,
                ipAddress: req.ip,
            });

            return res.json({
                success: true,
                verifiedMethod: verification.matchedMethod,
                message: "Recovery channel verified successfully",
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
