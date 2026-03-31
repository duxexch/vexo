import type { Express, Request, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

export function registerMediaRoutes(app: Express): void {

  // ==================== PROFILE PICTURE ROUTES ====================

  app.post("/api/user/profile-picture", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { profilePicture } = req.body;
      if (!profilePicture) return res.status(400).json({ error: "Profile picture is required" });
      
      if (typeof profilePicture !== 'string' || !profilePicture.match(/^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp|tiff|heic|heif|avif|ico|x-icon);base64,/i)) {
        return res.status(400).json({ error: "Invalid image format. Please upload a valid image file." });
      }
      if (profilePicture.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "Image too large. Maximum size is 5MB." });
      }
      
      await db.update(users).set({ profilePicture, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
      const [updatedUser] = await db.select().from(users).where(eq(users.id, req.user!.id));
      res.json({ success: true, user: updatedUser });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/user/cover-photo", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coverPhoto } = req.body;
      if (!coverPhoto) return res.status(400).json({ error: "Cover photo is required" });
      
      if (typeof coverPhoto !== 'string' || !coverPhoto.match(/^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp|tiff|heic|heif|avif|ico|x-icon);base64,/i)) {
        return res.status(400).json({ error: "Invalid image format. Please upload a valid image file." });
      }
      if (coverPhoto.length > 15 * 1024 * 1024) {
        return res.status(400).json({ error: "Image too large. Maximum size is 10MB." });
      }
      
      await db.update(users).set({ coverPhoto, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
      const [updatedUser] = await db.select().from(users).where(eq(users.id, req.user!.id));
      res.json({ success: true, user: updatedUser });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== P2P STATS ====================

  // SECURITY: Require authentication to view P2P stats — prevent unauthenticated scraping
  app.get("/api/user/:userId/p2p-stats", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const [user] = await db.select({
        p2pRating: users.p2pRating, p2pTotalTrades: users.p2pTotalTrades,
        p2pSuccessfulTrades: users.p2pSuccessfulTrades, idVerificationStatus: users.idVerificationStatus,
        nickname: users.nickname, profilePicture: users.profilePicture, createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId));
      
      if (!user) return res.status(404).json({ error: "User not found" });
      
      const successRate = user.p2pTotalTrades > 0 
        ? ((user.p2pSuccessfulTrades || 0) / user.p2pTotalTrades * 100).toFixed(1) : "100.0";
      
      res.json({ ...user, successRate, isVerified: user.idVerificationStatus === 'approved' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== SOCIAL PLATFORMS (PUBLIC) ====================

  app.get("/api/social-platforms", async (_req: Request, res: Response) => {
    try {
      const platforms = await storage.getEnabledSocialPlatforms();
      const publicPlatforms = platforms.map(p => ({
        id: p.id, name: p.name, displayName: p.displayName, displayNameAr: p.displayNameAr,
        icon: p.icon, type: p.type, otpEnabled: p.otpEnabled,
      }));
      res.json(publicPlatforms);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
