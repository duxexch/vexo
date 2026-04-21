import type { Express, Response } from "express";
import { db } from "../../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { AuthRequest } from "../middleware";
import { getErrorMessage, type AuthMiddleware } from "./helpers";

// PIN unlock token storage
const pinUnlockTokens = new Map<string, { token: string; expiresAt: number }>();

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of pinUnlockTokens) {
    if (entry.expiresAt < now) {
      pinUnlockTokens.delete(userId);
    }
  }
}, 300000);

/** Check if user's chat PIN is currently unlocked */
export function isPinUnlocked(userId: string): boolean {
  const entry = pinUnlockTokens.get(userId);
  return !!entry && entry.expiresAt > Date.now();
}

/** Chat PIN lock routes — set, change, unlock, remove, status */
export function registerPinLockRoutes(app: Express, authMiddleware: AuthMiddleware): void {

  // Set chat PIN
  app.post("/api/chat/pin/set", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { pin } = req.body;

      if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be 4-6 digits" });
      }

      const [user] = await db.select({
        chatPinEnabled: users.chatPinEnabled
      }).from(users).where(eq(users.id, userId));

      if (user?.chatPinEnabled) {
        return res.status(400).json({ error: "PIN already set. Use change endpoint." });
      }

      const pinHash = await bcrypt.hash(pin, 12);

      await db.update(users).set({
        chatPinHash: pinHash,
        chatPinEnabled: true,
        chatPinSetAt: new Date(),
        chatPinFailedAttempts: 0,
      }).where(eq(users.id, userId));

      res.json({ success: true, message: "Chat PIN set successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Change chat PIN
  app.put("/api/chat/pin/change", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const oldPin = typeof req.body?.oldPin === "string"
        ? req.body.oldPin
        : (typeof req.body?.currentPin === "string" ? req.body.currentPin : undefined);
      const newPin = req.body?.newPin;

      if (!oldPin || !newPin || !/^\d{4,6}$/.test(newPin)) {
        return res.status(400).json({ error: "Valid old and new PINs required (4-6 digits)" });
      }

      const [user] = await db.select({
        chatPinHash: users.chatPinHash,
        chatPinEnabled: users.chatPinEnabled,
      }).from(users).where(eq(users.id, userId));

      if (!user?.chatPinEnabled || !user.chatPinHash) {
        return res.status(400).json({ error: "No PIN set" });
      }

      const isValid = await bcrypt.compare(oldPin, user.chatPinHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid current PIN" });
      }

      const newPinHash = await bcrypt.hash(newPin, 12);
      await db.update(users).set({
        chatPinHash: newPinHash,
        chatPinSetAt: new Date(),
      }).where(eq(users.id, userId));

      res.json({ success: true, message: "PIN changed successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Unlock chat with PIN (returns temporary session token)
  app.post("/api/chat/pin/unlock", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { pin } = req.body;

      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: "PIN required" });
      }

      const [user] = await db.select({
        chatPinHash: users.chatPinHash,
        chatPinEnabled: users.chatPinEnabled,
        chatPinFailedAttempts: users.chatPinFailedAttempts,
        chatPinLockedUntil: users.chatPinLockedUntil,
      }).from(users).where(eq(users.id, userId));

      if (!user?.chatPinEnabled || !user.chatPinHash) {
        return res.status(400).json({ error: "No PIN set" });
      }

      if (user.chatPinLockedUntil && user.chatPinLockedUntil > new Date()) {
        const remainingMs = user.chatPinLockedUntil.getTime() - Date.now();
        return res.status(423).json({
          error: "PIN locked due to too many failed attempts",
          lockedUntil: user.chatPinLockedUntil,
          remainingSeconds: Math.ceil(remainingMs / 1000),
        });
      }

      const isValid = await bcrypt.compare(pin, user.chatPinHash);

      if (!isValid) {
        const newAttempts = (user.chatPinFailedAttempts || 0) + 1;
        const updateData: Record<string, unknown> = { chatPinFailedAttempts: newAttempts };

        if (newAttempts >= 5) {
          updateData.chatPinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          updateData.chatPinFailedAttempts = 0;
        }

        await db.update(users).set(updateData).where(eq(users.id, userId));

        return res.status(401).json({
          error: "Invalid PIN",
          remainingAttempts: Math.max(0, 5 - newAttempts),
          attemptsRemaining: Math.max(0, 5 - newAttempts),
        });
      }

      await db.update(users).set({
        chatPinFailedAttempts: 0,
        chatPinLockedUntil: null,
      }).where(eq(users.id, userId));

      const unlockToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 60 * 1000;
      pinUnlockTokens.set(userId, { token: unlockToken, expiresAt });

      res.json({
        success: true,
        token: unlockToken,
        unlockToken,
        expiresIn: 1800,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Remove chat PIN (requires account password)
  app.delete("/api/chat/pin/remove", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: "Account password required for confirmation" });
      }

      const [user] = await db.select({
        password: users.password,
        chatPinEnabled: users.chatPinEnabled,
      }).from(users).where(eq(users.id, userId));

      if (!user?.chatPinEnabled) {
        return res.status(400).json({ error: "No PIN set" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid account password" });
      }

      await db.update(users).set({
        chatPinHash: null,
        chatPinEnabled: false,
        chatPinFailedAttempts: 0,
        chatPinLockedUntil: null,
        chatPinSetAt: null,
      }).where(eq(users.id, userId));

      pinUnlockTokens.delete(userId);

      res.json({ success: true, message: "PIN removed successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Check PIN status
  app.get("/api/chat/pin/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const [user] = await db.select({
        chatPinEnabled: users.chatPinEnabled,
        chatPinLockedUntil: users.chatPinLockedUntil,
        chatPinFailedAttempts: users.chatPinFailedAttempts,
        chatPinSetAt: users.chatPinSetAt,
      }).from(users).where(eq(users.id, userId));

      const unlockEntry = pinUnlockTokens.get(userId);
      const isUnlocked = unlockEntry && unlockEntry.expiresAt > Date.now();

      res.json({
        pinEnabled: user?.chatPinEnabled || false,
        isUnlocked: isUnlocked || false,
        isLocked: user?.chatPinLockedUntil ? user.chatPinLockedUntil > new Date() : false,
        lockedUntil: user?.chatPinLockedUntil,
        failedAttempts: user?.chatPinFailedAttempts || 0,
        pinSetAt: user?.chatPinSetAt,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
