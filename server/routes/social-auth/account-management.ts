/**
 * OAuth Account Management — List linked accounts, unlink, cleanup
 */
import { Express, Response } from "express";
import { storage } from "../../storage";
import { logger } from "../../lib/logger";
import {
  getUserSocialAccounts,
  unlinkSocialAccount,
  cleanupExpiredStates,
} from "../../lib/oauth-engine";
import { sensitiveRateLimiter, AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";

export function registerOAuthAccountRoutes(app: Express) {
  // ==================== Get User's Linked Social Accounts ====================
  app.get("/api/auth/social/accounts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const accounts = await getUserSocialAccounts(req.user!.id);
      res.json(accounts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== Unlink Social Account ====================
  app.delete("/api/auth/social/accounts/:accountId", authMiddleware, sensitiveRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { accountId } = req.params;

      // Make sure user has a password or another linked account before unlinking
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const accounts = await getUserSocialAccounts(user.id);
      const hasPassword = user.password && !user.password.startsWith("$social_");

      if (accounts.length <= 1 && !hasPassword) {
        return res.status(400).json({
          error: "Cannot unlink last social account without a password set",
        });
      }

      const deleted = await unlinkSocialAccount(user.id, accountId);
      if (!deleted) {
        return res.status(404).json({ error: "Account not found" });
      }

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== Cleanup expired OAuth states (runs every 30 min) ====================
  setInterval(() => {
    cleanupExpiredStates().catch((err) => {
      logger.error('Failed to cleanup expired OAuth states', new Error(err.message));
    });
  }, 30 * 60 * 1000);
}
