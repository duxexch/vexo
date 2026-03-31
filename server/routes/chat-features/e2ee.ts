import type { Express, Response } from "express";
import { db } from "../../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import crypto from "crypto";
import type { AuthRequest } from "../middleware";
import { getErrorMessage, type AuthMiddleware } from "./helpers";

/** E2EE key management routes — generate, retrieve own keys, get other user's public key */
export function registerE2EERoutes(app: Express, authMiddleware: AuthMiddleware): void {

  // Generate E2EE key pair for user
  app.post("/api/chat/e2ee/generate-keys", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { passwordHash } = req.body;

      if (!passwordHash || typeof passwordHash !== 'string') {
        return res.status(400).json({ error: "Password hash required for key encryption" });
      }

      // Generate X25519 key pair
      const keyPair = nacl.box.keyPair();
      const publicKey = naclUtil.encodeBase64(keyPair.publicKey);
      const privateKeyRaw = naclUtil.encodeBase64(keyPair.secretKey);

      // Encrypt private key with user's password hash using AES-256-GCM
      const encKey = crypto.createHash('sha256').update(passwordHash).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
      let encrypted = cipher.update(privateKeyRaw, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      const authTag = cipher.getAuthTag();
      
      const encryptedPrivateKey = JSON.stringify({
        iv: iv.toString('base64'),
        data: encrypted,
        tag: authTag.toString('base64'),
      });

      await db.update(users).set({
        e2eePublicKey: publicKey,
        e2eeEncryptedPrivateKey: encryptedPrivateKey,
        e2eeKeyCreatedAt: new Date(),
      }).where(eq(users.id, userId));

      res.json({ 
        publicKey, 
        encryptedPrivateKey,
        message: "E2EE keys generated successfully. Store your encrypted private key securely." 
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get user's own E2EE keys (encrypted private key)
  app.get("/api/chat/e2ee/my-keys", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const [user] = await db.select({
        publicKey: users.e2eePublicKey,
        encryptedPrivateKey: users.e2eeEncryptedPrivateKey,
        keyCreatedAt: users.e2eeKeyCreatedAt,
      }).from(users).where(eq(users.id, userId));

      if (!user?.publicKey) {
        return res.json({ hasKeys: false });
      }

      res.json({
        hasKeys: true,
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        keyCreatedAt: user.keyCreatedAt,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get another user's public key (for encryption)
  app.get("/api/users/:userId/public-key", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const [user] = await db.select({
        publicKey: users.e2eePublicKey,
      }).from(users).where(eq(users.id, userId));

      if (!user?.publicKey) {
        return res.json({ hasKey: false, publicKey: null });
      }

      res.json({ hasKey: true, publicKey: user.publicKey });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
