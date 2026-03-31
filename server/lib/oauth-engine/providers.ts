/**
 * OAuth Provider Registry — Register and manage OAuth providers with PKCE support
 */
import crypto from "crypto";
import { generateChallenge } from "pkce-challenge";
import type { OAuthProviderConfig, ProfileNormalizer } from "./types";

const PKCE_MIN_VERIFIER_LENGTH = 43;
const PKCE_MAX_VERIFIER_LENGTH = 128;

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

function isValidPkceVerifier(verifier: string): boolean {
  if (!verifier) return false;
  if (verifier.length < PKCE_MIN_VERIFIER_LENGTH || verifier.length > PKCE_MAX_VERIFIER_LENGTH) {
    return false;
  }

  for (let i = 0; i < verifier.length; i += 1) {
    const ch = verifier[i];
    const code = verifier.charCodeAt(i);
    const isAlphaNum =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);

    if (isAlphaNum || ch === "-" || ch === "." || ch === "_" || ch === "~") {
      continue;
    }

    return false;
  }

  return true;
}

// ==================== PKCE ====================
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url");
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  if (!isValidPkceVerifier(verifier)) {
    throw new Error("Invalid PKCE verifier");
  }

  return generateChallenge(verifier, "S256");
}
