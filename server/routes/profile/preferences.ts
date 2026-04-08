import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { z } from "zod";
import { sanitizePlainText } from "../../lib/input-security";
import { db } from "../../db";
import { otpVerifications } from "@shared/schema";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { verifyTOTP } from "../auth/helpers";

const supportedLanguages = [
  "en", "ar", "fr", "es", "de", "tr", "zh", "hi", "pt", "ru",
  "ja", "ko", "it", "nl", "pl", "id", "ms", "th", "vi", "fa",
  "ur", "he", "bn", "sv", "no", "da", "fi", "el", "cs", "ro",
  "hu", "uk", "bg", "hr", "sk", "sl", "sr", "lt", "lv", "et",
] as const;

const preferencesUpdateSchema = z.object({
  language: z.enum(supportedLanguages).optional(),
  currency: z.enum(["USD", "EUR", "GBP", "AED", "SAR"]).optional(),
  countryCode: z.string().max(8).optional().nullable(),
  regionCode: z.string().max(24).optional().nullable(),
  regionName: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  addressLine: z.string().max(255).optional().nullable(),
  notifyAnnouncements: z.boolean().optional(),
  notifyTransactions: z.boolean().optional(),
  notifyPromotions: z.boolean().optional(),
  notifyP2P: z.boolean().optional(),
});

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = sanitizePlainText(value, { maxLength }).trim();
  return normalized.length > 0 ? normalized : null;
}

const profileUpdateSchema = z.object({
  firstName: z.string().max(50).optional().nullable(),
  lastName: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(20).optional().nullable(),
  securityMethod: z.enum(["two_factor", "email", "phone"]).optional(),
  securityCode: z.string().trim().min(4).max(12).optional(),
});

type ProfileSecurityMethod = "two_factor" | "email" | "phone";

type ProfileSecurityUser = {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean | null;
  phoneVerified: boolean | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
};

function normalizeOptionalEmail(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalPhone(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = sanitizePlainText(value, { maxLength: 20 }).trim();
  return normalized.length > 0 ? normalized : null;
}

async function verifyProfileSecurityCode(
  user: ProfileSecurityUser,
  method: ProfileSecurityMethod,
  rawCode: string,
): Promise<{ valid: true } | { valid: false; error: string }> {
  const code = rawCode.trim();

  if (method === "two_factor") {
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return { valid: false, error: "Two-factor authentication is not enabled on this account." };
    }

    if (!verifyTOTP(user.twoFactorSecret, code)) {
      return { valid: false, error: "Invalid two-factor code." };
    }

    return { valid: true };
  }

  const contactType = method;
  const expectedContact = contactType === "email" ? user.email : user.phone;
  if (!expectedContact) {
    return { valid: false, error: "Selected security method is not available for this account." };
  }

  const [otpRecord] = await db
    .select()
    .from(otpVerifications)
    .where(and(
      eq(otpVerifications.userId, user.id),
      eq(otpVerifications.contactType, contactType),
      eq(otpVerifications.contactValue, expectedContact),
    ))
    .orderBy(desc(otpVerifications.createdAt))
    .limit(1);

  if (!otpRecord) {
    return { valid: false, error: "No security verification request found. Request a new code first." };
  }

  const now = new Date();
  if (now > otpRecord.expiresAt) {
    return { valid: false, error: "Security code has expired. Request a new code." };
  }

  if (otpRecord.consumedAt) {
    return { valid: false, error: "Security code has already been used." };
  }

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    return { valid: false, error: "Too many failed attempts. Request a new security code." };
  }

  const isValidCode = await bcrypt.compare(code, otpRecord.codeHash);
  if (!isValidCode) {
    await db.update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(and(
        eq(otpVerifications.id, otpRecord.id),
        isNull(otpVerifications.consumedAt),
        gt(otpVerifications.expiresAt, now),
        sql`${otpVerifications.attempts} < ${otpVerifications.maxAttempts}`,
      ));

    return { valid: false, error: "Invalid security code." };
  }

  const [consumedOtp] = await db.update(otpVerifications)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(otpVerifications.id, otpRecord.id),
      isNull(otpVerifications.consumedAt),
      gt(otpVerifications.expiresAt, now),
      sql`${otpVerifications.attempts} < ${otpVerifications.maxAttempts}`,
    ))
    .returning({ id: otpVerifications.id });

  if (!consumedOtp) {
    return { valid: false, error: "Security code has expired or was already consumed." };
  }

  return { valid: true };
}

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
      const normalized = {
        ...validated,
        countryCode: (() => {
          const value = normalizeOptionalText(validated.countryCode, 8);
          return typeof value === "string" ? value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase() || null : value;
        })(),
        regionCode: (() => {
          const value = normalizeOptionalText(validated.regionCode, 24);
          return typeof value === "string" ? value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase() || null : value;
        })(),
        regionName: normalizeOptionalText(validated.regionName, 120),
        city: normalizeOptionalText(validated.city, 120),
        addressLine: normalizeOptionalText(validated.addressLine, 255),
      };

      const prefs = await storage.createOrUpdateUserPreferences(req.user!.id, normalized);
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
      const currentUser = await storage.getUser(req.user!.id);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        securityMethod,
        securityCode,
      } = validated;

      const normalizedFirstName = normalizeOptionalText(firstName, 50);
      const normalizedLastName = normalizeOptionalText(lastName, 50);
      const normalizedEmail = normalizeOptionalEmail(email);
      const normalizedPhone = normalizeOptionalPhone(phone);

      const currentEmail = normalizeOptionalEmail(currentUser.email) ?? null;
      const currentPhone = normalizeOptionalPhone(currentUser.phone) ?? null;

      const emailChanged = normalizedEmail !== undefined && normalizedEmail !== currentEmail;
      const phoneChanged = normalizedPhone !== undefined && normalizedPhone !== currentPhone;

      const requiresSecurityVerification =
        (emailChanged && Boolean(currentUser.emailVerified)) ||
        (phoneChanged && Boolean(currentUser.phoneVerified));

      const allowedMethods: ProfileSecurityMethod[] = [];
      if (currentUser.twoFactorEnabled && currentUser.twoFactorSecret) {
        allowedMethods.push("two_factor");
      }
      if (currentUser.emailVerified && currentUser.email) {
        allowedMethods.push("email");
      }
      if (currentUser.phoneVerified && currentUser.phone) {
        allowedMethods.push("phone");
      }

      if (requiresSecurityVerification) {
        if (!securityMethod || !securityCode) {
          return res.status(403).json({
            error: "Security verification is required to update verified contact data.",
            errorCode: "SECURITY_VERIFICATION_REQUIRED",
            allowedMethods,
          });
        }

        if (!allowedMethods.includes(securityMethod)) {
          return res.status(403).json({
            error: "Selected security method is not allowed for this account.",
            errorCode: "SECURITY_VERIFICATION_REQUIRED",
            allowedMethods,
          });
        }

        const verificationResult = await verifyProfileSecurityCode(
          {
            id: currentUser.id,
            email: currentUser.email,
            phone: currentUser.phone,
            emailVerified: currentUser.emailVerified,
            phoneVerified: currentUser.phoneVerified,
            twoFactorEnabled: currentUser.twoFactorEnabled,
            twoFactorSecret: currentUser.twoFactorSecret,
          },
          securityMethod,
          securityCode,
        );

        if (!verificationResult.valid) {
          return res.status(403).json({
            error: verificationResult.error,
            errorCode: "SECURITY_VERIFICATION_FAILED",
            allowedMethods,
          });
        }
      }

      const updatePayload: Record<string, unknown> = {};

      if (normalizedFirstName !== undefined) {
        updatePayload.firstName = normalizedFirstName;
      }
      if (normalizedLastName !== undefined) {
        updatePayload.lastName = normalizedLastName;
      }

      if (normalizedEmail !== undefined) {
        updatePayload.email = normalizedEmail;
        if (emailChanged) {
          updatePayload.emailVerified = false;
        }
      }

      if (normalizedPhone !== undefined) {
        updatePayload.phone = normalizedPhone;
        if (phoneChanged) {
          updatePayload.phoneVerified = false;
        }
      }

      const user = await storage.updateUser(req.user!.id, updatePayload);

      await storage.createAuditLog({
        userId: req.user!.id, action: "user_update", entityType: "user",
        entityId: req.user!.id,
        details: requiresSecurityVerification
          ? `Profile updated with security verification via ${securityMethod}`
          : "Profile updated",
      });

      const { password, ...safeUser } = user!;
      res.json(safeUser);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
        return res.status(409).json({ error: "Email or phone number is already in use." });
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
      const safeNickname = sanitizePlainText(nickname, { maxLength: 30 });
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
      const updateData: Partial<{ stealthMode: boolean; isOnline: boolean; lastActiveAt: Date }> = { lastActiveAt: new Date() };
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
