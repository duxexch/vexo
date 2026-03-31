import type { Express } from "express";
import { registerChallengeSettingsRoutes } from "./settings";
import { registerChallengeListingRoutes } from "./challenge-listing";
import { registerChallengeCancelRoutes } from "./challenge-cancel";

export function registerAdminChallengesRoutes(app: Express) {
  registerChallengeSettingsRoutes(app);
  registerChallengeListingRoutes(app);
  registerChallengeCancelRoutes(app);
}
