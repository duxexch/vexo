import { Express, Response } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../../storage";
import { db } from "../../db";
import { activeSessions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware";
import { JWT_USER_SECRET, JWT_USER_EXPIRY } from "../../lib/auth-config";
import { sendNotification } from "../../websocket";
import { toSafeUser } from "../../lib/safe-user";
import {
  getErrorMessage,
  getSessionFingerprint,
  setAuthCookie,
  createSession,
} from "./helpers";

export function registerSessionRoutes(app: Express) {
  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = toSafeUser(user);
      const etag = `"user-${user.id}-${user.updatedAt?.getTime() || Date.now()}"`;
      const lastModified = user.updatedAt?.toUTCString() || new Date().toUTCString();

      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", lastModified);
      res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");

      const clientEtag = req.headers["if-none-match"];
      if (clientEtag === etag) {
        return res.status(304).end();
      }

      res.json(userData);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Logout — clear httpOnly cookie
  app.post("/api/auth/logout", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // Deactivate current session by token fingerprint
      if (req.user?.tokenFingerprint) {
        await db.update(activeSessions)
          .set({ isActive: false })
          .where(and(
            eq(activeSessions.userId, req.user.id),
            eq(activeSessions.tokenFingerprint, req.user.tokenFingerprint),
            eq(activeSessions.isActive, true),
          ));
      }
    } catch (_) { /* non-blocking */ }

    res.clearCookie('vex_token', { path: '/' });
    res.json({ success: true, message: "Logged out successfully" });
  });

  // Token refresh — issue new token if current token is valid
  app.post("/api/auth/refresh-token", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user || user.status !== "active" || Boolean(user.accountDeletedAt)) {
        return res.status(401).json({ error: "Invalid session" });
      }

      // Revoke the current token session before issuing a new one.
      if (req.user?.tokenFingerprint) {
        await db.update(activeSessions)
          .set({ isActive: false })
          .where(and(
            eq(activeSessions.userId, req.user.id),
            eq(activeSessions.tokenFingerprint, req.user.tokenFingerprint),
            eq(activeSessions.isActive, true),
          ));
      }

      const newToken = jwt.sign(
        { id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) },
        JWT_USER_SECRET,
        { expiresIn: JWT_USER_EXPIRY }
      );

      setAuthCookie(res, newToken);
      await createSession(user.id, newToken, req);
      res.json({ token: newToken });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get active sessions for current user
  app.get("/api/auth/sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const sessions = await db.select({
        id: activeSessions.id,
        deviceInfo: activeSessions.deviceInfo,
        ipAddress: activeSessions.ipAddress,
        lastActivityAt: activeSessions.lastActivityAt,
        createdAt: activeSessions.createdAt,
      })
        .from(activeSessions)
        .where(and(
          eq(activeSessions.userId, req.user!.id),
          eq(activeSessions.isActive, true),
        ))
        .orderBy(desc(activeSessions.lastActivityAt));

      res.json(sessions);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Logout a specific session
  app.delete("/api/auth/sessions/:sessionId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(and(
          eq(activeSessions.id, req.params.sessionId),
          eq(activeSessions.userId, req.user!.id),
        ));

      res.json({ success: true, message: "Session terminated" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Logout all other sessions (keep current)
  app.post("/api/auth/sessions/logout-all", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // Invalidate all sessions for this user
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.userId, req.user!.id));

      // Also update passwordChangedAt to invalidate all JWTs
      await storage.updateUser(req.user!.id, { passwordChangedAt: new Date() });

      // Issue a new token for the current session
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const newToken = jwt.sign(
        { id: user.id, role: user.role, username: user.username, fp: getSessionFingerprint(req) },
        JWT_USER_SECRET,
        { expiresIn: JWT_USER_EXPIRY }
      );

      setAuthCookie(res, newToken);
      await createSession(user.id, newToken, req);

      // Notify about all sessions being terminated
      await sendNotification(user.id, {
        type: 'security',
        priority: 'high',
        title: 'All Sessions Terminated',
        titleAr: 'تم إنهاء جميع الجلسات',
        message: 'All your other sessions have been logged out. If you did not do this, change your password immediately.',
        messageAr: 'تم تسجيل الخروج من جميع جلساتك الأخرى. إذا لم تقم بذلك، قم بتغيير كلمة المرور فوراً.',
        link: '/settings',
      }).catch(() => { });

      res.json({ success: true, message: "All other sessions logged out", token: newToken });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
