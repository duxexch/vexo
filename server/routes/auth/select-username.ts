import { Express, Response } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db } from "../../db";
import { users } from "@shared/schema";
import { storage } from "../../storage";
import { authMiddleware, type AuthRequest, sensitiveRateLimiter } from "../middleware";
import { toSafeUser } from "../../lib/safe-user";
import { getErrorMessage } from "./helpers";

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 30;

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "support", "vex", "vexo",
  "moderator", "mod", "staff", "official", "help", "api",
]);

export function registerSelectUsernameRoute(app: Express) {
  app.post(
    "/api/auth/select-username",
    sensitiveRateLimiter,
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: "Authentication required" });
        }

        // Idempotency: if user already selected a username, refuse silently with 409.
        // Username changes after the initial selection must go through a separate
        // (rate-limited / paid) flow.
        if (req.user.usernameSelected === true) {
          return res.status(409).json({
            error: "Username already selected. Use the username change flow.",
            errorCode: "USERNAME_ALREADY_SELECTED",
          });
        }

        const rawUsername = typeof req.body?.username === "string" ? req.body.username.trim() : "";

        if (rawUsername.length < USERNAME_MIN || rawUsername.length > USERNAME_MAX) {
          return res.status(400).json({
            error: `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`,
            errorCode: "USERNAME_LENGTH",
          });
        }
        if (!USERNAME_REGEX.test(rawUsername)) {
          return res.status(400).json({
            error: "Username can only contain letters, numbers, and underscores.",
            errorCode: "USERNAME_FORMAT",
          });
        }
        if (RESERVED_USERNAMES.has(rawUsername.toLowerCase())) {
          return res.status(400).json({
            error: "This username is reserved.",
            errorCode: "USERNAME_RESERVED",
          });
        }

        // Uniqueness — exclude the current user (whose row holds the temp placeholder).
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, rawUsername), ne(users.id, req.user.id)))
          .limit(1);

        if (existing) {
          return res.status(409).json({
            error: "This username is already taken.",
            errorCode: "USERNAME_TAKEN",
          });
        }

        const [updated] = await db
          .update(users)
          .set({
            username: rawUsername,
            usernameSelectedAt: new Date(),
          })
          .where(eq(users.id, req.user.id))
          .returning();

        if (!updated) {
          return res.status(500).json({ error: "Failed to update username." });
        }

        await storage.createAuditLog({
          userId: req.user.id,
          action: "user_update",
          entityType: "user",
          entityId: req.user.id,
          details: `Username selected: ${rawUsername}`,
          ipAddress: req.ip,
        }).catch(() => { });

        return res.json({ user: toSafeUser(updated) });
      } catch (error: unknown) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );
}
