import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "../../storage";
import { authRateLimiter, strictRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { toSafeUser } from "../../lib/safe-user";
import {
    createIdentifierOtpChallengeToken,
    getLoginIdentifierMethods,
    issueIdentifierOtp,
    type IdentifierOtpMethod,
    verifyIdentifierOtpChallengeToken,
    verifyIdentifierOtpCode,
} from "./identifier-otp";
import {
    getErrorMessage,
    getSessionFingerprint,
    setAuthCookie,
    createSession,
    consumeInvalidLoginDelay,
    checkAccountLockout,
    handleFailedLogin,
    handleSuccessfulLogin,
    generate2FAChallenge,
} from "./helpers";

type LoginOtpUser = NonNullable<Awaited<ReturnType<typeof storage.getUserByAccountId>>>;

export function registerAlternativeLoginRoutes(app: Express) {
    const beginIdentifierOtpLogin = async (
        req: Request,
        res: Response,
        user: LoginOtpUser,
        preferredMethod?: IdentifierOtpMethod,
    ): Promise<boolean> => {
        const availableMethods = getLoginIdentifierMethods(user);
        if (availableMethods.length === 0) {
            return false;
        }

        const selectedMethod = preferredMethod && availableMethods.includes(preferredMethod)
            ? preferredMethod
            : availableMethods[0];

        const issuedOtp = await issueIdentifierOtp({
            user,
            method: selectedMethod,
            flow: "login",
        });

        if (!issuedOtp.sent) {
            res.status(503).json({ error: "Unable to send verification code" });
            return true;
        }

        const challengeToken = createIdentifierOtpChallengeToken({
            userId: user.id,
            methods: availableMethods,
            preferredMethod: selectedMethod,
            flow: "login",
        });

        res.json({
            requiresIdentifierOtp: true,
            challengeToken,
            availableMethods,
            maskedTarget: issuedOtp.maskedTarget,
            expiresIn: issuedOtp.expiresInSeconds,
        });

        return true;
    };

    // Login by account ID (one-click generated users)
    app.post("/api/auth/login-by-account", authRateLimiter, async (req: Request, res: Response) => {
        try {
            const { accountId, password } = req.body;

            if (!accountId || typeof accountId !== "string" || !password || typeof password !== "string") {
                return res.status(400).json({ error: "Account ID and password are required" });
            }

            const user = await storage.getUserByAccountId(accountId.trim());
            if (!user) {
                await consumeInvalidLoginDelay(password);
                return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
            }

            if (await checkAccountLockout(user, res)) return;

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                return handleFailedLogin(user, res, req);
            }

            if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
                return res.status(403).json({ error: "Account is not active" });
            }

            const otpFlowHandled = await beginIdentifierOtpLogin(req, res, user);
            if (otpFlowHandled) {
                return;
            }

            // Backward-compatible fallback for one-click accounts that still have
            // no email/phone configured yet.
            if (user.twoFactorEnabled && user.twoFactorSecret) {
                const challengeToken = generate2FAChallenge(user.id);
                return res.json({
                    requires2FA: true,
                    challengeToken,
                    message: "Two-factor authentication required",
                });
            }

            await handleSuccessfulLogin(user);

            const token = jwt.sign(
                { id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) },
                JWT_USER_SECRET,
                { expiresIn: JWT_USER_EXPIRY },
            );

            await storage.createAuditLog({
                userId: user.id,
                action: "login",
                entityType: "user",
                entityId: user.id,
                details: "Login by account (direct fallback)",
                ipAddress: req.ip,
            });

            setAuthCookie(res, token);
            await createSession(user.id, token, req);
            return res.json({ user: toSafeUser(user), token });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    // Login by phone number
    app.post("/api/auth/login-by-phone", authRateLimiter, async (req: Request, res: Response) => {
        try {
            const { phone, password } = req.body;

            if (!phone || typeof phone !== "string" || !password || typeof password !== "string") {
                return res.status(400).json({ error: "Phone and password are required" });
            }

            const phoneClean = phone.trim();
            if (!/^\+?[0-9]{7,15}$/.test(phoneClean)) {
                return res.status(400).json({ error: "الرجاء إدخال رقم هاتف صحيح" });
            }

            const user = await storage.getUserByPhone(phoneClean);
            if (!user) {
                await consumeInvalidLoginDelay(password);
                return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
            }

            if (await checkAccountLockout(user, res)) return;

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                return handleFailedLogin(user, res, req);
            }

            if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
                return res.status(403).json({ error: "Account is not active" });
            }

            const otpFlowHandled = await beginIdentifierOtpLogin(req, res, user, "phone");
            if (otpFlowHandled) {
                return;
            }

            return res.status(400).json({
                error: "No phone verification channel configured for this account",
                errorCode: "LOGIN_IDENTIFIER_UNAVAILABLE",
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    // Login by email
    app.post("/api/auth/login-by-email", authRateLimiter, async (req: Request, res: Response) => {
        try {
            const { email, password } = req.body;

            if (!email || typeof email !== "string" || !password || typeof password !== "string") {
                return res.status(400).json({ error: "Email and password are required" });
            }

            const emailClean = email.trim().toLowerCase();
            const user = await storage.getUserByEmail(emailClean);
            if (!user) {
                await consumeInvalidLoginDelay(password);
                return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
            }

            if (await checkAccountLockout(user, res)) return;

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                return handleFailedLogin(user, res, req);
            }

            if (user.status !== "active" || Boolean(user.accountDeletedAt)) {
                return res.status(403).json({ error: "Account is not active" });
            }

            const otpFlowHandled = await beginIdentifierOtpLogin(req, res, user, "email");
            if (otpFlowHandled) {
                return;
            }

            return res.status(400).json({
                error: "No email verification channel configured for this account",
                errorCode: "LOGIN_IDENTIFIER_UNAVAILABLE",
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    // Resend identifier OTP using an allowed verified method only.
    app.post("/api/auth/login-otp/resend", strictRateLimiter, async (req: Request, res: Response) => {
        try {
            const { challengeToken, method } = req.body;
            if (!challengeToken || typeof challengeToken !== "string") {
                return res.status(400).json({ error: "Challenge token is required" });
            }

            const challenge = verifyIdentifierOtpChallengeToken(challengeToken);
            if (!challenge) {
                return res.status(400).json({ error: "Invalid or expired challenge token" });
            }

            const user = await storage.getUser(challenge.uid);
            if (!user || user.status !== "active" || Boolean(user.accountDeletedAt)) {
                return res.status(400).json({ error: "Invalid or expired challenge token" });
            }

            const requestedMethod = method === "email" || method === "phone"
                ? method
                : challenge.preferred;

            if (!challenge.methods.includes(requestedMethod)) {
                // Generic response by design: do not reveal method availability.
                return res.json({ success: true, message: "If the selected method is allowed, a verification code has been sent." });
            }

            const issuedOtp = await issueIdentifierOtp({
                user,
                method: requestedMethod,
                flow: challenge.flow,
            });

            return res.json({
                success: true,
                message: "Verification code sent",
                maskedTarget: issuedOtp.sent ? issuedOtp.maskedTarget : "",
                expiresIn: issuedOtp.sent ? issuedOtp.expiresInSeconds : 0,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    // Verify identifier OTP and complete login.
    app.post("/api/auth/login-otp/verify", strictRateLimiter, async (req: Request, res: Response) => {
        try {
            const { challengeToken, code } = req.body;
            if (!challengeToken || typeof challengeToken !== "string") {
                return res.status(400).json({ error: "Challenge token is required" });
            }
            if (!code || typeof code !== "string" || code.trim().length < 4 || code.trim().length > 10) {
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

            const otpVerification = await verifyIdentifierOtpCode({
                userId: user.id,
                methods: challenge.methods,
                code,
            });

            if (!otpVerification.valid) {
                return res.status(400).json({ error: "Invalid verification code" });
            }

            if (otpVerification.matchedMethod) {
                if (otpVerification.matchedMethod === "email" && !user.emailVerified) {
                    await storage.updateUser(user.id, { emailVerified: true });
                }
                if (otpVerification.matchedMethod === "phone" && !user.phoneVerified) {
                    await storage.updateUser(user.id, { phoneVerified: true });
                }
            }

            const refreshedUser = await storage.getUser(user.id);
            if (!refreshedUser || refreshedUser.status !== "active" || Boolean(refreshedUser.accountDeletedAt)) {
                return res.status(403).json({ error: "Account is not active" });
            }

            if (refreshedUser.twoFactorEnabled && refreshedUser.twoFactorSecret) {
                const twoFactorChallengeToken = generate2FAChallenge(refreshedUser.id);
                return res.json({
                    requires2FA: true,
                    challengeToken: twoFactorChallengeToken,
                    message: "Two-factor authentication required",
                });
            }

            await handleSuccessfulLogin(refreshedUser);

            const token = jwt.sign(
                {
                    id: refreshedUser.id,
                    role: refreshedUser.role,
                    username: refreshedUser.username,
                    fp: getSessionFingerprint(req),
                },
                JWT_USER_SECRET,
                { expiresIn: JWT_USER_EXPIRY },
            );

            await storage.createAuditLog({
                userId: refreshedUser.id,
                action: "login",
                entityType: "user",
                entityId: refreshedUser.id,
                details: challenge.flow === "signup" ? "Login after signup OTP verification" : "Login after identifier OTP verification",
                ipAddress: req.ip,
            });

            setAuthCookie(res, token);
            await createSession(refreshedUser.id, token, req);

            return res.json({
                user: toSafeUser(refreshedUser),
                token,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
