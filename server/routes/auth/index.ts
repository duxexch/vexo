import { Express } from "express";
import { registerOneClickRoutes } from "./register-oneclick";
import { registerUsernameRegistrationRoutes } from "./register-username";
import { registerSelectUsernameRoute } from "./select-username";
import { registerUsernameLoginRoute } from "./login-username";
import { registerAlternativeLoginRoutes } from "./login-methods";
import { registerSessionRoutes } from "./session";
import { registerTwoFactorSetupRoutes } from "./two-factor-setup";
import { registerTwoFactorAuthRoutes } from "./two-factor-auth";
import { registerPasswordRoutes } from "./password";
import { registerOtpRoutes } from "./otp";
import { registerAccountLifecycleAuthRoutes } from "./account-lifecycle";
import { registerOneClickRecoveryRoutes } from "./one-click-recovery";

export function registerAuthRoutes(app: Express) {
  registerOneClickRoutes(app);
  registerUsernameRegistrationRoutes(app);
  registerSelectUsernameRoute(app);
  registerUsernameLoginRoute(app);
  registerAlternativeLoginRoutes(app);
  registerSessionRoutes(app);
  registerTwoFactorSetupRoutes(app);
  registerTwoFactorAuthRoutes(app);
  registerPasswordRoutes(app);
  registerOneClickRecoveryRoutes(app);
  registerAccountLifecycleAuthRoutes(app);
  registerOtpRoutes(app);
}
