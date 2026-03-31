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

export function registerUsernameLoginRoute(app: Express) {
  app.post("/api/auth/login", authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS" });
      }

      // Check account lockout
      if (await checkAccountLockout(user, res)) return;

      // Enforce: only users who registered via username can use generic login
      if (!user.registrationType) {
        await storage.updateUser(user.id, { registrationType: "username" });
      } else if (user.registrationType !== "username") {
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

      // Check if 2FA is enabled — require second factor
      if (user.twoFactorEnabled) {
        const challengeToken = generate2FAChallenge(user.id);
        return res.json({
          requires2FA: true,
          challengeToken,
          message: "Two-factor authentication required"
        });
      }

      await handleSuccessfulLogin(user);

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) }, JWT_USER_SECRET, { expiresIn: JWT_USER_EXPIRY });

      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: "User logged in",
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
