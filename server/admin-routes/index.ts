import type { Express } from "express";
import { registerAdminLoginRoutes } from "./admin-login";
import { registerAdminPasswordRoutes } from "./admin-password";
import { registerAdminDashboardRoutes } from "./admin-dashboard";
import { registerAdminUsersRoutes } from "./admin-users";
import { registerAdminSettingsRoutes } from "./admin-settings";
import { registerAdminSupportRoutes } from "./admin-support";
import { registerAdminP2pRoutes } from "./admin-p2p";
import { registerAdminContentRoutes } from "./admin-content";
import { registerAdminGamesRoutes } from "./admin-games";
import { registerAdminAlertsRoutes } from "./admin-alerts";
import { registerAdminCurrencyRoutes } from "./admin-currency";
import { registerAdminTournamentsRoutes } from "./admin-tournaments";
import { registerAdminChallengesRoutes } from "./admin-challenges";
import { registerAdminChatMediaRoutes } from "./chat-media";
import { registerAdminChatAutoDeleteRoutes } from "./chat-auto-delete";
import { registerAdminChatPinRoutes } from "./chat-pin";
import { registerAdminAiAgentRoutes } from "./admin-ai-agent";
import { registerAdminPaymentSecurityRoutes } from "./admin-payment-security";

/**
 * Register all admin routes.
 * Phase 5 modularization: 5,349-line monolith → 13 focused route modules.
 * Phase 45: admin-chat-features.ts → chat-media.ts, chat-auto-delete.ts, chat-pin.ts
 * Phase 49: admin-auth.ts → admin-login.ts, admin-password.ts
 */
export function registerAdminRoutes(app: Express) {
  registerAdminLoginRoutes(app);
  registerAdminPasswordRoutes(app);
  registerAdminDashboardRoutes(app);
  registerAdminUsersRoutes(app);
  registerAdminSettingsRoutes(app);
  registerAdminSupportRoutes(app);
  registerAdminP2pRoutes(app);
  registerAdminContentRoutes(app);
  registerAdminGamesRoutes(app);
  registerAdminAlertsRoutes(app);
  registerAdminCurrencyRoutes(app);
  registerAdminTournamentsRoutes(app);
  registerAdminChallengesRoutes(app);
  registerAdminChatMediaRoutes(app);
  registerAdminChatAutoDeleteRoutes(app);
  registerAdminChatPinRoutes(app);
  registerAdminAiAgentRoutes(app);
  registerAdminPaymentSecurityRoutes(app);
}
