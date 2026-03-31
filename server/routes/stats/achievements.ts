import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { sendNotification } from "../../websocket";

export function registerAchievementsRoutes(app: Express): void {

  app.get("/api/achievements", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const achievements = await storage.getAchievements(category);
      res.json(achievements);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/me/achievements", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const userAchievements = await storage.getUserAchievements(userId);
      const allAchievements = await storage.getAchievements();
      
      const achievementsWithProgress = allAchievements.map(achievement => {
        const userProgress = userAchievements.find(ua => ua.achievementId === achievement.id);
        return {
          ...achievement,
          progress: userProgress?.progress || 0,
          unlocked: !!userProgress?.unlockedAt,
          unlockedAt: userProgress?.unlockedAt,
          rewardClaimed: userProgress?.rewardClaimed || false,
        };
      });
      
      res.json(achievementsWithProgress);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/achievements/:id/claim", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const achievementId = req.params.id;
      const userId = req.user!.id;
      
      const result = await storage.claimAchievementReward(userId, achievementId);
      if (!result.success) return res.status(400).json({ error: result.error });

      if (result.amount) {
        await sendNotification(userId, {
          type: 'success', priority: 'normal',
          title: 'Achievement Reward Claimed! 🏆', titleAr: 'تم المطالبة بمكافأة الإنجاز! 🏆',
          message: `You claimed $${result.amount} from your achievement reward!`,
          messageAr: `حصلت على $${result.amount} من مكافأة الإنجاز!`,
          link: '/wallet', metadata: JSON.stringify({ achievementId, amount: result.amount }),
        }).catch(() => {});
      }
      
      res.json({ success: true, amount: result.amount });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/achievements", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Whitelist allowed fields for achievement creation
      const { name, nameAr, description, descriptionAr, category, icon, criteria, rewardType, rewardAmount, isActive } = req.body;
      const safeData: Record<string, any> = {};
      if (name) safeData.name = String(name).replace(/<[^>]*>/g, '').slice(0, 100);
      if (nameAr) safeData.nameAr = String(nameAr).replace(/<[^>]*>/g, '').slice(0, 100);
      if (description) safeData.description = String(description).replace(/<[^>]*>/g, '').slice(0, 500);
      if (descriptionAr) safeData.descriptionAr = String(descriptionAr).replace(/<[^>]*>/g, '').slice(0, 500);
      if (category) safeData.category = String(category).slice(0, 50);
      if (icon) safeData.icon = String(icon).slice(0, 50);
      if (criteria) safeData.criteria = criteria;
      if (rewardType) safeData.rewardType = String(rewardType).slice(0, 30);
      if (rewardAmount !== undefined) safeData.rewardAmount = rewardAmount;
      if (isActive !== undefined) safeData.isActive = Boolean(isActive);
      const achievement = await storage.createAchievement(safeData as any);
      res.status(201).json(achievement);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
