import type { Express } from "express";
import { registerPaymentMethodRoutes } from "./payment-methods";
import { registerProjectCurrencyRoutes } from "./project-currency-routes";
import { registerAgentRoutes } from "./agents";
import { registerAffiliateAndPromoRoutes } from "./affiliates-promos";
import { registerComplaintRoutes } from "./complaints";
import { registerFinancialAndAuthRoutes } from "./financial-auth";

export function registerPaymentRoutes(app: Express): void {
  registerPaymentMethodRoutes(app);
  registerProjectCurrencyRoutes(app);
  registerAgentRoutes(app);
  registerAffiliateAndPromoRoutes(app);
  registerComplaintRoutes(app);
  registerFinancialAndAuthRoutes(app);
}
