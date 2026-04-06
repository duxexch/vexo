import { Express, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "../../storage";
import { db } from "../../db";
import { otpVerifications, loginMethodConfigs } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendEmail, sendSms, buildOtpEmailHtml, buildOtpSmsMessage } from "../../lib/messaging";
import { authMiddleware, AuthRequest, otpRateLimiter, strictRateLimiter } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage, IS_DEV_MODE } from "./helpers";

const OTP_RESEND_COOLDOWN_SECONDS = 5 * 60;

export function registerOtpRoutes(app: Express) {
  // Send OTP for verification
  app.post("/api/auth/otp/send", authMiddleware, otpRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { contactType, contactValue } = req.body;
      const userId = req.user!.id;

      if (!contactType || !contactValue) {
        return res.status(400).json({ error: "Contact type and value are required" });
      }

      if (!["email", "phone"].includes(contactType)) {
        return res.status(400).json({ error: "Invalid contact type" });
      }

      const [latestOtp] = await db.select({ createdAt: otpVerifications.createdAt })
        .from(otpVerifications)
        .where(and(
          eq(otpVerifications.userId, userId),
          eq(otpVerifications.contactType, contactType)
        ))
        .orderBy(desc(otpVerifications.createdAt))
        .limit(1);

      if (latestOtp?.createdAt) {
        const createdAtMs = latestOtp.createdAt instanceof Date
          ? latestOtp.createdAt.getTime()
          : new Date(String(latestOtp.createdAt)).getTime();
        const nextAllowedAtMs = createdAtMs + OTP_RESEND_COOLDOWN_SECONDS * 1000;
        const remainingSeconds = Math.ceil((nextAllowedAtMs - Date.now()) / 1000);

        if (remainingSeconds > 0) {
          return res.status(429).json({
            error: `Please wait ${remainingSeconds} seconds before requesting a new code.`,
            retryAfter: remainingSeconds,
          });
        }
      }

      // Read admin OTP configuration from loginMethodConfigs
      let otpLength = 6;
      let otpExpiryMinutes = 10;
      try {
        const [config] = await db.select().from(loginMethodConfigs)
          .where(eq(loginMethodConfigs.method, contactType)).limit(1);
        if (config) {
          otpLength = Math.max(4, Math.min(8, config.otpLength || 6));
          otpExpiryMinutes = Math.max(1, Math.min(30, config.otpExpiryMinutes || 10));
        }
      } catch { /* use defaults if config table not available */ }

      // Generate OTP based on admin-configured length
      const otpMin = Math.pow(10, otpLength - 1);
      const otpMax = Math.pow(10, otpLength) - 1;
      const otpCode = crypto.randomInt(otpMin, otpMax + 1).toString();
      const codeHash = await bcrypt.hash(otpCode, 12);
      const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

      // Delete any existing OTP for this user and contact type
      await db.delete(otpVerifications)
        .where(and(
          eq(otpVerifications.userId, userId),
          eq(otpVerifications.contactType, contactType)
        ));

      // Create new OTP
      await db.insert(otpVerifications).values({
        userId,
        contactType,
        contactValue,
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
      });

      // Log OTP only in explicit dev mode
      if (IS_DEV_MODE) {
        console.log(`[OTP] Code for ${contactType} ${contactValue}: ${otpCode}`);
      }

      // Deliver OTP via email or SMS
      if (contactType === "email") {
        sendEmail({
          to: contactValue,
          subject: "VEX - رمز التحقق",
          text: `رمز التحقق الخاص بك: ${otpCode}\nصالح لمدة ${otpExpiryMinutes} دقيقة`,
          html: buildOtpEmailHtml(otpCode, otpExpiryMinutes),
        }).catch(err => console.error("OTP email delivery error:", err));
      } else if (contactType === "phone") {
        sendSms({
          to: contactValue,
          message: buildOtpSmsMessage(otpCode, otpExpiryMinutes),
        }).catch(err => console.error("OTP SMS delivery error:", err));
      }

      // Mask the contact value for response
      let maskedValue = contactValue;
      if (contactType === "email") {
        const [name, domain] = contactValue.split("@");
        maskedValue = name.substring(0, 2) + "***@" + domain;
      } else if (contactType === "phone") {
        maskedValue = contactValue.substring(0, 3) + "****" + contactValue.substring(contactValue.length - 3);
      }

      res.json({
        success: true,
        message: `OTP sent to ${maskedValue}`,
        expiresIn: otpExpiryMinutes * 60,
        resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
        // Only in explicit dev mode for testing
        ...(IS_DEV_MODE && { devOtp: otpCode })
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Verify OTP
  app.post("/api/auth/otp/verify", authMiddleware, strictRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { contactType, code } = req.body;
      const userId = req.user!.id;

      if (!contactType || !code) {
        return res.status(400).json({ error: "Contact type and code are required" });
      }

      // Get latest OTP for this user and contact type
      const [otpRecord] = await db.select()
        .from(otpVerifications)
        .where(and(
          eq(otpVerifications.userId, userId),
          eq(otpVerifications.contactType, contactType)
        ))
        .orderBy(desc(otpVerifications.createdAt))
        .limit(1);

      if (!otpRecord) {
        return res.status(400).json({ error: "No OTP request found. Please request a new one." });
      }

      // Check if expired
      if (new Date() > otpRecord.expiresAt) {
        return res.status(400).json({ error: "OTP has expired. Please request a new one." });
      }

      // Check if already consumed
      if (otpRecord.consumedAt) {
        return res.status(400).json({ error: "OTP has already been used." });
      }

      // Check max attempts
      if (otpRecord.attempts >= otpRecord.maxAttempts) {
        return res.status(400).json({ error: "Too many failed attempts. Please request a new OTP." });
      }

      // Verify OTP
      const isValid = await bcrypt.compare(code, otpRecord.codeHash);

      if (!isValid) {
        // Increment attempts
        await db.update(otpVerifications)
          .set({ attempts: otpRecord.attempts + 1 })
          .where(eq(otpVerifications.id, otpRecord.id));

        return res.status(400).json({
          error: "Invalid OTP code.",
          attemptsRemaining: otpRecord.maxAttempts - otpRecord.attempts - 1
        });
      }

      // Mark OTP as consumed
      await db.update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(otpVerifications.id, otpRecord.id));

      // Update user verification status
      if (contactType === "email") {
        await storage.updateUser(userId, {
          emailVerified: true,
          email: otpRecord.contactValue
        });
      } else if (contactType === "phone") {
        await storage.updateUser(userId, {
          phoneVerified: true,
          phone: otpRecord.contactValue
        });
      }

      await storage.createAuditLog({
        userId,
        action: "settings_change",
        entityType: "user",
        entityId: userId,
        details: `${contactType} verified: ${otpRecord.contactValue}`,
      });

      // Notify user about email/phone verification
      const isEmail = contactType === "email";
      await sendNotification(userId, {
        type: 'security',
        priority: 'normal',
        title: isEmail ? 'Email Verified ✅' : 'Phone Verified ✅',
        titleAr: isEmail ? 'تم تأكيد البريد الإلكتروني ✅' : 'تم تأكيد رقم الهاتف ✅',
        message: isEmail ? `Your email ${otpRecord.contactValue} has been verified.` : `Your phone ${otpRecord.contactValue} has been verified.`,
        messageAr: isEmail ? `تم التحقق من بريدك الإلكتروني ${otpRecord.contactValue}.` : `تم التحقق من رقم هاتفك ${otpRecord.contactValue}.`,
        link: '/settings',
      }).catch(() => { });

      res.json({
        success: true,
        message: contactType === "email" ? "Email verified successfully" : "Phone verified successfully"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
