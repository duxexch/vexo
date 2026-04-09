import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "../../../storage";
import type { InsertUser } from "@shared/schema";
import {
  authRateLimiter,
  sensitiveRateLimiter,
  registrationRateLimiter,
  identifierAutoRegistrationLimiter,
} from "../../middleware";
import { emitSystemAlert } from "../../../lib/admin-alerts";
import { JWT_USER_EXPIRY, JWT_USER_SECRET } from "../../../lib/auth-config";
import { toSafeUser } from "../../../lib/safe-user";
import {
  createSession,
  getErrorMessage,
  getSessionFingerprint,
  setAuthCookie,
  validatePasswordStrength,
} from "../helpers";
import { isSafeEmailAddress, isSafePhoneNumber } from "../../../lib/input-security";
import {
  createIdentifierOtpChallengeToken,
  getSignupIdentifierMethods,
  issueIdentifierOtp,
  type IdentifierOtpMethod,
} from "../identifier-otp";

export function registerIdentifierRoutes(app: Express) {
  // Check if identifier (email/phone/accountId) exists
  app.post("/api/auth/check-identifier", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { identifier, type } = req.body;

      if (!identifier || !type || typeof identifier !== "string" || typeof type !== "string") {
        return res.status(400).json({ error: "Identifier and type are required" });
      }

      if (!["email", "phone", "account"].includes(type)) {
        return res.status(400).json({ error: "Invalid type" });
      }

      const clean = identifier.trim();
      if (!clean) {
        return res.status(400).json({ error: "Identifier and type are required" });
      }

      if (type === "phone" && !isSafePhoneNumber(clean)) {
        return res.status(400).json({ error: "الرجاء إدخال رقم هاتف صحيح" });
      }

      // SECURITY: Always return consistent response to prevent account enumeration
      // Add artificial delay to prevent timing-based enumeration
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      res.json({
        success: true,
        message: "Identifier accepted",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Smart credential finder - searches ALL columns to find where a user is registered
  app.post("/api/auth/find-credential", sensitiveRateLimiter, async (req: Request, res: Response) => {
    try {
      const { identifier } = req.body;

      if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 3) {
        return res.status(400).json({ error: "Identifier is required" });
      }

      // SECURITY: Endpoint intentionally avoids disclosing whether the identifier exists
      // or which credential method is registered.
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      res.json({
        found: false,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create account from login attempt (auto-registration)
  app.post("/api/auth/create-from-identifier", registrationRateLimiter, identifierAutoRegistrationLimiter, async (req: Request, res: Response) => {
    try {
      const { identifier, type, password } = req.body;

      if (!identifier || !type || !password || typeof identifier !== "string" || typeof type !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Identifier, type, and password are required" });
      }

      const normalizedType = type.trim().toLowerCase();
      if (![
        "email",
        "phone",
        "account",
      ].includes(normalizedType)) {
        return res.status(400).json({ error: "Invalid identifier type" });
      }

      const normalizedIdentifier = identifier.trim();
      if (!normalizedIdentifier) {
        return res.status(400).json({ error: "Identifier, type, and password are required" });
      }

      const normalizedEmail = normalizedIdentifier.toLowerCase();
      const normalizedPhone = normalizedIdentifier;
      const normalizedAccountId = normalizedIdentifier;

      // Validate format based on type
      if (normalizedType === "phone" && !isSafePhoneNumber(normalizedPhone)) {
        return res.status(400).json({ error: "الرجاء إدخال رقم هاتف صحيح" });
      }
      if (normalizedType === "email" && !isSafeEmailAddress(normalizedEmail)) {
        return res.status(400).json({ error: "الرجاء إدخال بريد إلكتروني صحيح" });
      }
      if (normalizedType === "account" && !/^[0-9]{8,12}$/.test(normalizedAccountId)) {
        return res.status(400).json({ error: "الرجاء إدخال رقم حساب صحيح" });
      }

      const pwValidation = validatePasswordStrength(password);
      if (!pwValidation.valid) {
        return res.status(400).json({ error: pwValidation.error });
      }

      // Check if already exists
      let existingUser = null;
      if (normalizedType === "email") {
        existingUser = await storage.getUserByEmail(normalizedEmail);
      } else if (normalizedType === "phone") {
        existingUser = await storage.getUserByPhone(normalizedPhone);
      } else if (normalizedType === "account") {
        existingUser = await storage.getUserByAccountId(normalizedAccountId);
      }

      if (existingUser) {
        return res.status(400).json({ error: "Registration failed. Please try again or use a different method." });
      }

      // Generate unique username and account ID
      const accountId = normalizedType === "account"
        ? normalizedAccountId
        : await storage.generateUniqueAccountId();

      const usernameBase = normalizedType === "email"
        ? normalizedEmail.split("@")[0]
        : normalizedType === "account"
          ? `player_${normalizedAccountId}`
          : "user";

      const username = `${usernameBase.replace(/[^a-zA-Z0-9_]/g, "").substring(0, 20) || "user"}_${crypto.randomBytes(3).toString('hex')}`;

      const hashedPassword = await bcrypt.hash(password, 12);

      const userData: Record<string, unknown> = {
        username,
        password: hashedPassword,
        accountId,
        role: "player",
        status: "active",
        emailVerified: false,
        phoneVerified: false,
        registrationType: normalizedType,
      };

      if (normalizedType === "email") {
        userData.email = normalizedEmail;
      } else if (normalizedType === "phone") {
        userData.phone = normalizedPhone;
      }

      const user = await storage.createUser(userData as InsertUser);

      await storage.createAuditLog({
        userId: user.id,
        action: "settings_change",
        entityType: "user",
        entityId: user.id,
        details: `Auto-registered from login attempt (${normalizedType})`,
        ipAddress: req.ip,
      });

      // Notify admin about new user registration
      emitSystemAlert({
        title: 'New User Registered',
        titleAr: 'مستخدم جديد مسجل',
        message: `New auto-registration (${normalizedType}): ${user.username} (ID: ${user.id}) from IP ${req.ip || 'unknown'}`,
        messageAr: `تسجيل تلقائي جديد (${normalizedType}): ${user.username} (رقم: ${user.id})`,
        severity: 'info',
        deepLink: '/admin/users',
        entityType: 'user',
        entityId: String(user.id),
      }).catch(() => { });

      if (normalizedType === "account") {
        const token = jwt.sign(
          {
            id: user.id,
            role: user.role,
            username: user.username,
            fp: getSessionFingerprint(req),
          },
          JWT_USER_SECRET,
          { expiresIn: JWT_USER_EXPIRY },
        );

        setAuthCookie(res, token);
        await createSession(user.id, token, req);

        await storage.createAuditLog({
          userId: user.id,
          action: "login",
          entityType: "user",
          entityId: user.id,
          details: "Login after account auto-registration",
          ipAddress: req.ip,
        });

        return res.json({
          user: toSafeUser(user),
          token,
          message: "Account created successfully.",
        });
      }

      const signupMethods = getSignupIdentifierMethods(user);
      if (signupMethods.length === 0) {
        return res.status(400).json({ error: "Registration failed. No valid verification method is configured." });
      }

      const preferredMethod: IdentifierOtpMethod = normalizedType === "email" ? "email" : "phone";
      const selectedMethod = signupMethods.includes(preferredMethod)
        ? preferredMethod
        : signupMethods[0];

      const issuedOtp = await issueIdentifierOtp({
        user,
        method: selectedMethod,
        flow: "signup",
      });

      if (!issuedOtp.sent) {
        return res.status(503).json({ error: "Unable to send verification code" });
      }

      const challengeToken = createIdentifierOtpChallengeToken({
        userId: user.id,
        methods: signupMethods,
        preferredMethod: selectedMethod,
        flow: "signup",
      });

      res.json({
        requiresIdentifierOtp: true,
        challengeToken,
        availableMethods: signupMethods,
        maskedTarget: issuedOtp.maskedTarget,
        expiresIn: issuedOtp.expiresInSeconds,
        message: "Account created successfully. Please verify to continue.",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
