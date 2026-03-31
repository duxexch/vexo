import type { Express } from "express";
import { registerListingRoutes } from "./listing";
import { registerCreateRoutes } from "./create";
import { registerDetailsRoutes } from "./details";
import { registerMessagesEvidenceRoutes } from "./messages-evidence";
import { registerRespondRoutes } from "./respond";
import { registerResolveRoutes } from "./resolve";

export function registerP2PDisputesRoutes(app: Express) {
  registerListingRoutes(app);
  registerCreateRoutes(app);
  registerDetailsRoutes(app);
  registerMessagesEvidenceRoutes(app);
  registerRespondRoutes(app);
  registerResolveRoutes(app);
}
