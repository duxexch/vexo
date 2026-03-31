import type { Express } from "express";
import { registerFollowsRoutes } from "./follows";
import { registerListingRoutes } from "./listing";
import { registerCreateRoute } from "./create";
import { registerJoinRoute } from "./join";
import { registerWithdrawRoutes } from "./withdraw";
import { registerDetailsRoutes } from "./details";
import { registerGiftsRoutes } from "./gifts";
import { registerSessionsPointsRoutes } from "./sessions-points";

export function registerChallengesRoutes(app: Express): void {
  registerFollowsRoutes(app);
  registerListingRoutes(app);
  registerCreateRoute(app);
  registerJoinRoute(app);
  registerWithdrawRoutes(app);
  registerDetailsRoutes(app);
  registerGiftsRoutes(app);
  registerSessionsPointsRoutes(app);
}
