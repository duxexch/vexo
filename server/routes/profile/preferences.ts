import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { z } from "zod";

const supportedLanguages = [
  "en", "ar", "fr", "es", "de", "tr", "zh", "hi", "pt", "ru",
  "ja", "ko", "it", "nl", "pl", "id", "ms", "th", "vi", "fa",
  "ur", "he", "bn", "sv", "no", "da", "fi", "el", "cs", "ro",
  "hu", "uk", "bg", "hr", "sk", "sl", "sr", "lt", "lv", "et",
] as const;

const preferencesUpdateSchema = z.object({
  language: z.enum(supportedLanguages).optional(),
  currency: z.enum(["USD", "EUR", "GBP", "AED", "SAR"]).optional(),
  notifyAnnouncements: z.boolean().optional(),
  notifyTransactions: z.boolean().optional(),
  notifyPromotions: z.boolean().optional(),
  notifyP2P: z.boolean().optional(),
});

const profileUpdateSchema = z.object({
  firstName: z.string().max(50).optional().nullable(),
  lastName: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(20).optional().nullable(),
});

const userStatusSchema = z.object({
  stealthMode: z.boolean().optional(),
  isOnline: z.boolean().optional(),
}).refine(data => data.stealthMode !== undefined || data.isOnline !== undefined, {
  message: "At least one field (stealthMode or isOnline) is required"
});

export function registerPreferencesRoutes(app: Express): void {

  app.get("/api/user/preferences", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const prefs = await storage.getUserPreferences(req.user!.id);
      res.json(prefs || { language: "en", currency: "USD" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/user/preferences", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const validated = preferencesUpdateSchema.parse(req.body);
      const prefs = await storage.createOrUpdateUserPreferences(req.user!.id, validated);
      res.json(prefs);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/user/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const validated = profileUpdateSchema.parse(req.body);
      const user = await storage.updateUser(req.user!.id, validated);
      
      await storage.createAuditLog({
        userId: req.user!.id, action: "user_update", entityType: "user",
        entityId: req.user!.id, details: "Profile updated",
      });
      
      const { password, ...safeUser } = user!;
      res.json(safeUser);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/user/check-nickname/:nickname", async (req: any, res: Response) => {
    try {
      const { nickname } = req.params;
      if (!nickname || nickname.length < 3) {
        return res.json({ available: false, error: "Nickname must be at least 3 characters" });
      }
      const existingUser = await storage.getUserByNickname(nickname);
      res.json({ available: !existingUser });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/user/nickname", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { nickname } = req.body;
      if (!nickname || nickname.length < 3) {
        return res.status(400).json({ error: "Nickname must be at least 3 characters" });
      }
      // SECURITY: Max length + HTML sanitization to prevent stored XSS and DB overflow
      if (nickname.length > 30) {
        return res.status(400).json({ error: "Nickname must be at most 30 characters" });
      }
      const safeNickname = String(nickname).replace(/<[^>]*>/g, '').trim();
      if (safeNickname.length < 3) {
        return res.status(400).json({ error: "Nickname contains invalid characters" });
      }
      
      const existingUser = await storage.getUserByNickname(safeNickname);
      if (existingUser && existingUser.id !== req.user!.id) {
        return res.status(400).json({ error: "Nickname already taken" });
      }
      
      const user = await storage.updateUser(req.user!.id, { nickname: safeNickname });
      const { password, ...safeUser } = user!;
      res.json(safeUser);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/user/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = userStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      
      const { stealthMode, isOnline } = parsed.data;
      const updateData: Partial<{stealthMode: boolean; isOnline: boolean; lastActiveAt: Date}> = { lastActiveAt: new Date() };
      if (stealthMode !== undefined) updateData.stealthMode = stealthMode;
      if (isOnline !== undefined) updateData.isOnline = isOnline;
      
      const user = await storage.updateUser(req.user!.id, updateData);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
