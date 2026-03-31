import { Express, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "../../storage";
import { db } from "../../db";
import { twoFactorBackupCodes } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import {
  getErrorMessage,
  verifyTOTP,
} from "./helpers";

export function registerTwoFactorSetupRoutes(app: Express) {

  // Generate TOTP secret for setup (returns secret + QR URI)
  app.post("/api/auth/2fa/setup", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      if (user.twoFactorEnabled) {
        return res.status(400).json({ error: "2FA is already enabled" });
      }
      
      // Generate a 20-byte base32 secret
      const secretBytes = crypto.randomBytes(20);
      const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let secret = '';
      for (let i = 0; i < secretBytes.length; i++) {
        secret += base32Chars[secretBytes[i] % 32];
      }
      
      // Store secret (not yet verified) 
      await storage.updateUser(user.id, { twoFactorSecret: secret });
      
      // Generate otpauth:// URI for QR code scanning  
      const issuer = 'VEX';
      const label = encodeURIComponent(user.username);
      const otpauthUri = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
      
      res.json({ 
        secret,
        otpauthUri,
        message: "Scan the QR code with your authenticator app, then verify with a code"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Verify TOTP code and enable 2FA — generates backup codes
  app.post("/api/auth/2fa/verify-setup", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: "Verification code is required" });
      }
      
      const user = await storage.getUser(req.user!.id);
      if (!user || !user.twoFactorSecret) {
        return res.status(400).json({ error: "2FA setup not started" });
      }
      if (user.twoFactorEnabled) {
        return res.status(400).json({ error: "2FA is already enabled" });
      }
      
      // Verify TOTP code
      if (!verifyTOTP(user.twoFactorSecret, code)) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      // Generate 10 backup codes
      const backupCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rawCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        backupCodes.push(rawCode);
        // SECURITY: Use bcrypt instead of SHA-256 for backup code hashing
        const codeHash = await bcrypt.hash(rawCode, 12);
        await db.insert(twoFactorBackupCodes).values({
          userId: user.id,
          codeHash,
        });
      }
      
      // Enable 2FA
      await storage.updateUser(user.id, { 
        twoFactorEnabled: true, 
        twoFactorVerifiedAt: new Date(),
      });

      // Notify user about 2FA being enabled
      await sendNotification(user.id, {
        type: 'security',
        priority: 'high',
        title: '2FA Enabled 🔒',
        titleAr: 'تم تفعيل المصادقة الثنائية 🔒',
        message: 'Two-factor authentication has been enabled on your account. Keep your backup codes safe.',
        messageAr: 'تم تفعيل المصادقة الثنائية على حسابك. احتفظ برموز النسخ الاحتياطية في مكان آمن.',
        link: '/settings',
      }).catch(() => {});
      
      res.json({ 
        success: true,
        backupCodes,
        message: "2FA enabled. Save your backup codes in a safe place."
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
