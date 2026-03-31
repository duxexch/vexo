import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { emitSystemAlert } from "../../lib/admin-alerts";

export function registerIdVerificationRoutes(app: Express): void {

  app.post("/api/user/id-verification", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { frontImage, backImage } = req.body;
      if (!frontImage || !backImage) {
        return res.status(400).json({ error: "Both front and back ID images are required" });
      }
      
      const imagePattern = /^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp|tiff|heic|heif|avif);base64,/i;
      if (typeof frontImage !== 'string' || !frontImage.match(imagePattern)) {
        return res.status(400).json({ error: "Front ID image is not a valid image format" });
      }
      if (typeof backImage !== 'string' || !backImage.match(imagePattern)) {
        return res.status(400).json({ error: "Back ID image is not a valid image format" });
      }
      
      if (frontImage.length > 14 * 1024 * 1024 || backImage.length > 14 * 1024 * 1024) {
        return res.status(400).json({ error: "Each image must be less than 10MB" });
      }
      
      await db.update(users).set({
        idFrontImage: frontImage, idBackImage: backImage,
        idVerificationStatus: 'pending', idVerificationRejectionReason: null, updatedAt: new Date(),
      }).where(eq(users.id, req.user!.id));
      
      const adminUsers = await db.select().from(users).where(eq(users.role, 'admin'));
      for (const admin of adminUsers) {
        await sendNotification(admin.id, {
          type: 'id_verification', title: 'New ID Verification Request', titleAr: 'طلب توثيق هوية جديد',
          message: `User ${req.user!.username} has submitted ID verification documents`,
          messageAr: `قام المستخدم ${req.user!.username} بتقديم وثائق التحقق من الهوية`,
          metadata: JSON.stringify({ userId: req.user!.id }), link: '/notifications',
        });
      }
      
      emitSystemAlert({
        title: 'New ID Verification Request', titleAr: 'طلب توثيق هوية جديد',
        message: `User ${req.user!.username} submitted ID verification documents for review`,
        messageAr: `قام المستخدم ${req.user!.username} بتقديم وثائق التحقق من الهوية للمراجعة`,
        severity: 'warning', deepLink: '/admin/id-verification', entityType: 'user', entityId: req.user!.id,
      }).catch(() => {});

      res.json({ success: true, message: "ID verification submitted successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/user/id-verification", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [user] = await db.select({
        idVerificationStatus: users.idVerificationStatus, idFrontImage: users.idFrontImage,
        idBackImage: users.idBackImage, idVerificationRejectionReason: users.idVerificationRejectionReason,
        idVerifiedAt: users.idVerifiedAt,
      }).from(users).where(eq(users.id, req.user!.id));
      res.json(user);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/id-verifications", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const pendingVerifications = await db.select({
        id: users.id, username: users.username, nickname: users.nickname,
        email: users.email, phone: users.phone, idFrontImage: users.idFrontImage,
        idBackImage: users.idBackImage, idVerificationStatus: users.idVerificationStatus, createdAt: users.createdAt,
      }).from(users).where(sql`${users.idVerificationStatus} IS NOT NULL`);
      res.json(pendingVerifications);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/id-verifications/:userId/review", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { action, reason } = req.body;
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }
      
      const updateData: Record<string, unknown> = {
        idVerificationStatus: action === 'approve' ? 'approved' : 'rejected', updatedAt: new Date(),
      };
      
      if (action === 'approve') {
        updateData.idVerifiedAt = new Date();
        updateData.idVerificationRejectionReason = null;
      } else {
        updateData.idVerificationRejectionReason = reason || 'Verification rejected';
      }
      
      await db.update(users).set(updateData).where(eq(users.id, userId));
      
      await sendNotification(userId, {
        type: 'id_verification',
        title: action === 'approve' ? 'ID Verified' : 'ID Verification Rejected',
        titleAr: action === 'approve' ? 'تم التحقق من الهوية' : 'تم رفض التحقق من الهوية',
        message: action === 'approve' ? 'Your ID has been verified successfully'
          : `Your ID verification was rejected: ${reason || 'Please try again with clearer images'}`,
        messageAr: action === 'approve' ? 'تم التحقق من هويتك بنجاح'
          : `تم رفض التحقق من هويتك: ${reason || 'يرجى المحاولة مرة أخرى بصور أوضح'}`,
        link: '/profile',
      });
      
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
