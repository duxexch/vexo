import { Express } from "express";
import { registerOneClickRoutes } from "./register-oneclick";
import { registerUsernameRegistrationRoutes } from "./register-username";
import { registerUsernameLoginRoute } from "./login-username";
import { registerAlternativeLoginRoutes } from "./login-methods";
import { registerSessionRoutes } from "./session";
import { registerTwoFactorSetupRoutes } from "./two-factor-setup";
import { registerTwoFactorAuthRoutes } from "./two-factor-auth";
import { registerPasswordRoutes } from "./password";
import { registerOtpRoutes } from "./otp";

export function registerAuthRoutes(app: Express) {
  registerOneClickRoutes(app);
  registerUsernameRegistrationRoutes(app);
  registerUsernameLoginRoute(app);
  registerAlternativeLoginRoutes(app);
  registerSessionRoutes(app);
  registerTwoFactorSetupRoutes(app);
  registerTwoFactorAuthRoutes(app);
  registerPasswordRoutes(app);
  registerOtpRoutes(app);
}
