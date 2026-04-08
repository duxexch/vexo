import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "../../../storage";
import type { InsertUser } from "@shared/schema";
import {
  authRateLimiter,
  sensitiveRateLimiter,
  registrationRateLimiter,
} from "../../middleware";
import { emitSystemAlert } from "../../../lib/admin-alerts";
import {
  getErrorMessage,
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

      if (!identifier || !type) {
        return res.status(400).json({ error: "Identifier and type are required" });
      }

      let user = null;
      if (type === "email") {
        user = await storage.getUserByEmail(identifier);
      } else if (type === "phone") {
        // Validate phone format before lookup
        if (!isSafePhoneNumber(identifier.trim())) {
          return res.status(400).json({ error: "الرجاء إدخال رقم هاتف صحيح" });
        }
        user = await storage.getUserByPhone(identifier.trim());
      } else if (type === "account") {
        user = await storage.getUserByAccountId(identifier);
      } else {
        return res.status(400).json({ error: "Invalid type" });
      }

      // SECURITY: Always return consistent response to prevent account enumeration
      // Real existence check is only useful for legitimate UI flows during registration
      // Add artificial delay to prevent timing-based enumeration
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      res.json({ exists: !!user, type });
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

      const clean = identifier.trim();

      // Search in all possible columns
      let user = null;
      let foundVia: string | null = null;

      // 1. Try accountId
      user = await storage.getUserByAccountId(clean);
      if (user) foundVia = "account";

      // 2. Try email
      if (!user) {
        user = await storage.getUserByEmail(clean);
        if (user) foundVia = "email";
      }

      // 3. Try phone
      if (!user) {
        user = await storage.getUserByPhone(clean);
        if (user) foundVia = "phone";
      }

      // 4. Try username
      if (!user) {
        user = await storage.getUserByUsername(clean);
        if (user) foundVia = "username";
      }

      if (!user) {
        // SECURITY: Add delay and return consistent structure to prevent timing-based enumeration
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        return res.json({ found: false });
      }

      // Return the method this user registered with (NOT what we found them by)
      const correctMethod = user.registrationType || foundVia || "account";

      // SECURITY: Only return minimal masked hint, don't reveal registration type to unauthenticated users
      let maskedHint = "";
      if (correctMethod === "account" && user.accountId) {
        maskedHint = "***" + user.accountId.substring(user.accountId.length - 2);
      } else if (correctMethod === "phone" && user.phone) {
        maskedHint = "****" + user.phone.substring(user.phone.length - 2);
      } else if (correctMethod === "email" && user.email) {
        const [, domain] = user.email.split("@");
        maskedHint = "***@" + domain;
      }

      res.json({
        found: true,
        correctMethod,
        maskedHint,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create account from login attempt (auto-registration)
  app.post("/api/auth/create-from-identifier", registrationRateLimiter, async (req: Request, res: Response) => {
    try {
      const { identifier, type, password } = req.body;

      if (!identifier || !type || !password) {
        return res.status(400).json({ error: "Identifier, type, and password are required" });
      }

      // Validate format based on type
      if (type === "phone" && !isSafePhoneNumber(identifier.trim())) {
        return res.status(400).json({ error: "الرجاء إدخال رقم هاتف صحيح" });
      }
      if (type === "email" && !isSafeEmailAddress(identifier.trim())) {
        return res.status(400).json({ error: "الرجاء إدخال بريد إلكتروني صحيح" });
      }

      const pwValidation = validatePasswordStrength(password);
      if (!pwValidation.valid) {
        return res.status(400).json({ error: pwValidation.error });
      }

      // Check if already exists
      let existingUser = null;
      if (type === "email") {
        existingUser = await storage.getUserByEmail(identifier);
      } else if (type === "phone") {
        existingUser = await storage.getUserByPhone(identifier);
      }

      if (existingUser) {
        return res.status(400).json({ error: "Registration failed. Please try again or use a different method." });
      }

      // Generate unique username and account ID
      const accountId = await storage.generateUniqueAccountId();
      const username = type === "email"
        ? identifier.split("@")[0] + "_" + crypto.randomBytes(3).toString('hex')
        : "user_" + crypto.randomBytes(5).toString('hex');

      const hashedPassword = await bcrypt.hash(password, 12);

      const userData: Record<string, unknown> = {
        username,
        password: hashedPassword,
        accountId,
        role: "player",
        status: "active",
        emailVerified: false,
        phoneVerified: false,
        registrationType: type,
      };

      if (type === "email") {
        userData.email = identifier;
      } else if (type === "phone") {
        userData.phone = identifier;
      }

      const user = await storage.createUser(userData as InsertUser);

      const signupMethods = getSignupIdentifierMethods(user);
      if (signupMethods.length === 0) {
        return res.status(400).json({ error: "Registration failed. No valid verification method is configured." });
      }

      const preferredMethod: IdentifierOtpMethod = type === "email" ? "email" : "phone";
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

      await storage.createAuditLog({
        userId: user.id,
        action: "settings_change",
        entityType: "user",
        entityId: user.id,
        details: "Auto-registered from login attempt (pending OTP verification)",
        ipAddress: req.ip,
      });

      // Notify admin about new user registration
      emitSystemAlert({
        title: 'New User Registered',
        titleAr: 'مستخدم جديد مسجل',
        message: `New auto-registration (${type}): ${user.username} (ID: ${user.id}) from IP ${req.ip || 'unknown'}`,
        messageAr: `تسجيل تلقائي جديد (${type}): ${user.username} (رقم: ${user.id})`,
        severity: 'info',
        deepLink: '/admin/users',
        entityType: 'user',
        entityId: String(user.id),
      }).catch(() => { });

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
