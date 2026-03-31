import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "../../storage";
import { authRateLimiter } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { toSafeUser } from "../../lib/safe-user";
import {
  getErrorMessage,
  getSessionFingerprint,
  setAuthCookie,
  createSession,
  checkAccountLockout,
  handleFailedLogin,
  handleSuccessfulLogin,
  generate2FAChallenge,
} from "./helpers";

export function registerAlternativeLoginRoutes(app: Express) {

  // Login by account ID (one-click generated users)
  app.post("/api/auth/login-by-account", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { accountId, password } = req.body;

      if (!accountId || typeof accountId !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ error: "Account ID and password are required" });
      }

      const user = await storage.getUserByAccountId(accountId);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
      }

      // Check account lockout
      if (await checkAccountLockout(user, res)) return;

      // Enforce: only users who registered via account (one-click) can login here
      if (!user.registrationType) {
        await storage.updateUser(user.id, { registrationType: "account" });
      } else if (user.registrationType !== "account") {
        return res.status(401).json({
          error: "الرجاء استخدام طريقة تسجيل الدخول الصحيحة",
          errorCode: "WRONG_LOGIN_METHOD",
          correctMethod: user.registrationType
        });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return handleFailedLogin(user, res, req);
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      // Check if 2FA is enabled
      if (user.twoFactorEnabled) {
        const challengeToken = generate2FAChallenge(user.id);
        return res.json({ requires2FA: true, challengeToken, message: "Two-factor authentication required" });
      }

      await handleSuccessfulLogin(user);

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) }, JWT_USER_SECRET, { expiresIn: JWT_USER_EXPIRY });

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: "Login by account ID",
        ipAddress: req.ip,
      });

      setAuthCookie(res, token);
      await createSession(user.id, token, req);
      res.json({ user: toSafeUser(user), token });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Login by phone number
  app.post("/api/auth/login-by-phone", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { phone, password } = req.body;

      if (!phone || typeof phone !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ error: "Phone and password are required" });
      }

      // Validate phone number format (digits only with optional + prefix, 7-15 digits)
      const phoneClean = phone.trim();
      if (!/^\+?[0-9]{7,15}$/.test(phoneClean)) {
        return res.status(400).json({ error: "الرجاء إدخال رقم هاتف صحيح" });
      }

      const user = await storage.getUserByPhone(phoneClean);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
      }

      // Check account lockout
      if (await checkAccountLockout(user, res)) return;

      // Enforce: only users who registered via phone can login here
      if (!user.registrationType) {
        await storage.updateUser(user.id, { registrationType: "phone" });
      } else if (user.registrationType !== "phone") {
        return res.status(401).json({
          error: "الرجاء استخدام طريقة تسجيل الدخول الصحيحة",
          errorCode: "WRONG_LOGIN_METHOD",
          correctMethod: user.registrationType
        });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return handleFailedLogin(user, res, req);
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      // Check if 2FA is enabled
      if (user.twoFactorEnabled) {
        const challengeToken = generate2FAChallenge(user.id);
        return res.json({ requires2FA: true, challengeToken, message: "Two-factor authentication required" });
      }

      await handleSuccessfulLogin(user);

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) }, JWT_USER_SECRET, { expiresIn: JWT_USER_EXPIRY });

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: "Login by phone",
        ipAddress: req.ip,
      });

      setAuthCookie(res, token);
      await createSession(user.id, token, req);
      res.json({ user: toSafeUser(user), token });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Login by email
  app.post("/api/auth/login-by-email", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
      }

      // Check account lockout
      if (await checkAccountLockout(user, res)) return;

      // Enforce: only users who registered via email can login here
      if (!user.registrationType) {
        await storage.updateUser(user.id, { registrationType: "email" });
      } else if (user.registrationType !== "email") {
        return res.status(401).json({
          error: "الرجاء استخدام طريقة تسجيل الدخول الصحيحة",
          errorCode: "WRONG_LOGIN_METHOD",
          correctMethod: user.registrationType
        });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return handleFailedLogin(user, res, req);
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      // Check if 2FA is enabled
      if (user.twoFactorEnabled) {
        const challengeToken = generate2FAChallenge(user.id);
        return res.json({ requires2FA: true, challengeToken, message: "Two-factor authentication required" });
      }

      await handleSuccessfulLogin(user);

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) }, JWT_USER_SECRET, { expiresIn: JWT_USER_EXPIRY });

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: "Login by email",
        ipAddress: req.ip,
      });

      setAuthCookie(res, token);
      await createSession(user.id, token, req);
      res.json({ user: toSafeUser(user), token });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
