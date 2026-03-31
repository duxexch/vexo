import type { Express } from "express";
import { registerOfferRoutes } from "./offers";
import { registerTradeRoutes } from "./trades";
// Phase 57: trade-actions.ts → trade-payment.ts + trade-lifecycle.ts
import { registerTradePaymentRoutes } from "./trade-payment";
import { registerTradeLifecycleRoutes } from "./trade-lifecycle";
import { registerRateMessageRoutes } from "./rate-messages";

export function registerP2PTradingRoutes(app: Express) {
  registerOfferRoutes(app);
  registerTradeRoutes(app);
  registerTradePaymentRoutes(app);
  registerTradeLifecycleRoutes(app);
  registerRateMessageRoutes(app);
}
