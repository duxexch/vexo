import type { Express } from "express";
import { registerOfferRoutes } from "./offers";
import { registerTradeRoutes } from "./trades";
// Phase 57: trade-actions.ts → trade-payment.ts + trade-lifecycle.ts
import { registerTradePaymentRoutes } from "./trade-payment";
import { registerTradeLifecycleRoutes } from "./trade-lifecycle";
import { registerRateMessageRoutes } from "./rate-messages";
import { registerP2PEnterpriseStateRoutes } from "./enterprise-state";

export function registerP2PTradingRoutes(app: Express) {
  registerOfferRoutes(app);
  registerTradeRoutes(app);
  registerTradePaymentRoutes(app);
  registerTradeLifecycleRoutes(app);
  registerRateMessageRoutes(app);
  registerP2PEnterpriseStateRoutes(app);
}
