import type { Express } from "express";
// Phase 53: free-rewards.ts → reward-status.ts + reward-claims.ts
import { registerRewardStatusRoutes } from "./reward-status";
import { registerRewardClaimRoutes } from "./reward-claims";
// Phase 51: shop.ts → gift-purchase.ts + gift-challenge.ts
import { registerGiftPurchaseRoutes } from "./gift-purchase";
import { registerGiftChallengeRoutes } from "./gift-challenge";

export function registerGiftsRoutes(app: Express): void {
  registerRewardStatusRoutes(app);
  registerRewardClaimRoutes(app);
  registerGiftPurchaseRoutes(app);
  registerGiftChallengeRoutes(app);
}
