import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "./middleware";
import { getErrorMessage } from "./helpers";
import { storage } from "../storage";

export function registerP2PProfileRoutes(app: Express): void {

  // ==================== P2P TRADER PROFILES (STUBS) ====================
  // These endpoints return hardcoded/mock data — need real DB implementation

  app.get("/api/p2p/profile/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.userId === 'me' ? req.user!.id : req.params.userId;
      const user = await storage.getUser(userId);
      
      if (!user) return res.status(404).json({ error: "User not found" });

      const profile = {
        id: userId,
        username: user.username,
        displayName: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username,
        bio: "",
        region: "Egypt",
        verificationLevel: user.phoneVerified ? "phone" : "email",
        isOnline: true,
        lastSeenAt: new Date().toISOString(),
        memberSince: user.createdAt,
        metrics: {
          totalTrades: 156, completedTrades: 152, cancelledTrades: 4, completionRate: 97.44,
          totalBuyTrades: 78, totalSellTrades: 78, totalVolumeUsdt: "45680.00",
          totalDisputes: 2, disputesWon: 1, disputesLost: 1, disputeRate: 1.28,
          avgReleaseTimeSeconds: 180, avgPaymentTimeSeconds: 300, avgResponseTimeSeconds: 45,
          positiveRatings: 148, negativeRatings: 4, overallRating: 4.85,
          trades30d: 28, completion30d: 100, volume30d: "8500.00",
          firstTradeAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          lastTradeAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        badges: [
          { slug: "verified", name: "Verified", nameAr: "موثق", icon: "shield-check", color: "#00c853", earnedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() },
          { slug: "trusted_seller", name: "Trusted Seller", nameAr: "بائع موثوق", icon: "badge-check", color: "#2196f3", earnedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() },
          { slug: "fast_responder", name: "Fast Responder", nameAr: "رد سريع", icon: "zap", color: "#ff9800", earnedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
          { slug: "high_volume", name: "High Volume", nameAr: "حجم تداول عالي", icon: "trending-up", color: "#9c27b0", earnedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() },
        ],
        paymentMethods: [
          { id: "pm-1", type: "bank_transfer", name: "Bank Misr", holderName: user.firstName || "Account Holder", isVerified: true },
          // SECURITY: Mask phone number — never expose full phone in API responses
          { id: "pm-2", type: "e_wallet", name: "Vodafone Cash", holderName: user.phone ? user.phone.slice(0, 3) + '****' + user.phone.slice(-3) : "01*****xxx", isVerified: true },
          { id: "pm-3", type: "e_wallet", name: "InstaPay", holderName: user.firstName || "Account Holder", isVerified: false },
        ],
        recentTrades: [
          { id: "rt-1", type: "sell", amount: "500", currency: "USDT", fiatAmount: "15500", counterparty: "Buyer123", status: "completed", completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
          { id: "rt-2", type: "buy", amount: "200", currency: "USDT", fiatAmount: "6200", counterparty: "Seller456", status: "completed", completedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
          { id: "rt-3", type: "sell", amount: "1000", currency: "USDT", fiatAmount: "31000", counterparty: "Buyer789", status: "completed", completedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() },
        ],
      };

      res.json(profile);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/p2p/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { displayName, bio, region } = req.body;
      res.json({ success: true, displayName, bio, region });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      res.json({
        autoReplyEnabled: false, autoReplyMessage: "",
        notifyOnTrade: true, notifyOnDispute: true, notifyOnMessage: true,
        preferredCurrencies: ["EGP", "USD"],
        tradeLimits: { minBuy: "50", maxBuy: "10000", minSell: "50", maxSell: "10000" },
        autoConfirmEnabled: false, autoConfirmDelayMinutes: 15,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/p2p/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = req.body;
      res.json({ success: true, ...settings });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/badges", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      res.json([
        { slug: "verified", name: "Verified", nameAr: "موثق", description: "Complete phone and email verification", descriptionAr: "أكمل التحقق من الهاتف والبريد", icon: "shield-check", color: "#00c853", criteria: { requiresVerification: "phone" } },
        { slug: "trusted_seller", name: "Trusted Seller", nameAr: "بائع موثوق", description: "98% completion rate with 200+ trades", descriptionAr: "نسبة إتمام 98٪ مع أكثر من 200 صفقة", icon: "badge-check", color: "#2196f3", criteria: { minTrades: 200, minCompletionRate: 98 } },
        { slug: "trusted_buyer", name: "Trusted Buyer", nameAr: "مشتري موثوق", description: "98% completion rate with 200+ buy trades", descriptionAr: "نسبة إتمام 98٪ مع أكثر من 200 عملية شراء", icon: "user-check", color: "#2196f3", criteria: { minTrades: 200, minCompletionRate: 98 } },
        { slug: "fast_responder", name: "Fast Responder", nameAr: "رد سريع", description: "Average response time under 1 minute", descriptionAr: "متوسط وقت الرد أقل من دقيقة", icon: "zap", color: "#ff9800", criteria: { maxResponseTime: 60 } },
        { slug: "high_volume", name: "High Volume", nameAr: "حجم تداول عالي", description: "Total trading volume over $100,000", descriptionAr: "إجمالي حجم التداول أكثر من 100,000 دولار", icon: "trending-up", color: "#9c27b0", criteria: { minVolume: 100000 } },
        { slug: "new_star", name: "Rising Star", nameAr: "نجم صاعد", description: "50+ trades in 30 days with 100% completion", descriptionAr: "أكثر من 50 صفقة في 30 يوم بنسبة إتمام 100٪", icon: "star", color: "#ffc107", criteria: { trades30d: 50, completion30d: 100 } },
        { slug: "dispute_free", name: "Dispute Free", nameAr: "بدون نزاعات", description: "No disputes in last 100 trades", descriptionAr: "لا نزاعات في آخر 100 صفقة", icon: "shield", color: "#4caf50", criteria: { maxDisputeRate: 0 } },
        { slug: "premium_trader", name: "Premium Trader", nameAr: "تاجر مميز", description: "KYC verified with excellent track record", descriptionAr: "موثق بالهوية مع سجل ممتاز", icon: "crown", color: "#e91e63", criteria: { requiresVerification: "kyc_full", minTrades: 500 } },
        { slug: "top_rated", name: "Top Rated", nameAr: "الأعلى تقييماً", description: "4.9+ rating with 100+ reviews", descriptionAr: "تقييم 4.9+ مع أكثر من 100 مراجعة", icon: "award", color: "#ff5722", criteria: { minRating: 4.9, minRatings: 100 } },
      ]);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/payment-methods", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      res.json([
        { id: "pm-1", type: "bank_transfer", name: "Bank Misr", accountNumber: "****1234", holderName: "User Name", isVerified: true, isActive: true },
        { id: "pm-2", type: "e_wallet", name: "Vodafone Cash", accountNumber: "01xxxxxxxx", holderName: "User Name", isVerified: true, isActive: true },
      ]);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/payment-methods", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { type, name, accountNumber, bankName, holderName, details } = req.body;
      const newMethod = {
        id: `pm-${Date.now()}`, type, name, accountNumber, bankName, holderName, details,
        isVerified: false, isActive: true, createdAt: new Date().toISOString(),
      };
      res.status(201).json(newMethod);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/p2p/payment-methods/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
