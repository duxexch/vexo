/**
 * OAuth Provider Registry — Register and manage OAuth providers with PKCE support
 */
import crypto from "crypto";
import type { OAuthProviderConfig, ProfileNormalizer } from "./types";

// ==================== Provider Registry ====================
const providers = new Map<string, {
  config: OAuthProviderConfig;
  normalizer: ProfileNormalizer;
}>();

export function registerProvider(config: OAuthProviderConfig, normalizer: ProfileNormalizer) {
  providers.set(config.name, { config, normalizer });
}

export function getProvider(name: string) {
  return providers.get(name);
}

export function getRegisteredProviders(): string[] {
  return Array.from(providers.keys());
}

// ==================== PKCE ====================
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
