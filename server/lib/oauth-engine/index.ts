/**
 * OAuth Engine — Generic OAuth 2.0 / OIDC engine for social login
 * Supports PKCE, state verification, token exchange, and profile normalization
 */

// Types
export type {
  OAuthProviderConfig,
  OAuthTokenResponse,
  NormalizedProfile,
  ProfileNormalizer,
} from "./types";

// Provider Registry
export {
  registerProvider,
  getProvider,
  getRegisteredProviders,
} from "./providers";

// Auth Flow
export {
  createOAuthState,
  verifyAndConsumeState,
  cleanupExpiredStates,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserProfile,
} from "./auth-flow";

// Account Linking
export {
  findOrCreateUser,
  getUserSocialAccounts,
  unlinkSocialAccount,
} from "./account-linking";
