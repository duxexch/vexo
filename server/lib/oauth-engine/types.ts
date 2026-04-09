/**
 * OAuth Engine Types — Interfaces for OAuth 2.0 / OIDC
 */

export interface OAuthProviderConfig {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  /** Whether this provider supports PKCE */
  supportsPKCE?: boolean;
  /** Custom headers for token exchange */
  tokenHeaders?: Record<string, string>;
  /** Whether to send credentials in body (true) or Basic Auth header (false) */
  credentialsInBody?: boolean;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface NormalizedProfile {
  id: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  avatar?: string;
  raw: Record<string, unknown>;
}

export type ProfileNormalizer = (data: Record<string, unknown>) => NormalizedProfile;
