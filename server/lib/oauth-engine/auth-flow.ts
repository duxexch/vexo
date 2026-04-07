/**
 * OAuth Auth Flow — State management, authorization URL, token exchange, user profile
 */
import crypto from "crypto";
import { db } from "../../db";
import { oauthStates } from "@shared/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "../crypto-utils";
import { getProvider, generateCodeVerifier, generateCodeChallenge } from "./providers";
import type { OAuthTokenResponse, NormalizedProfile } from "./types";

// ==================== State Management ====================
export async function createOAuthState(platformName: string, redirectUrl?: string): Promise<{
  state: string;
  codeVerifier?: string;
}> {
  const state = crypto.randomBytes(32).toString("hex");
  const provider = getProvider(platformName);
  let codeVerifier: string | undefined;

  if (provider?.config.supportsPKCE) {
    codeVerifier = generateCodeVerifier();
  }

  await db.insert(oauthStates).values({
    state,
    platformName,
    redirectUrl: redirectUrl || null,
    codeVerifier: codeVerifier ? encryptSecret(codeVerifier) : null,
    // Use DB clock to avoid timezone drift between app/runtime and DB.
    expiresAt: sql`NOW() + INTERVAL '10 minutes'` as unknown as Date,
  });

  return { state, codeVerifier };
}

export async function verifyAndConsumeState(state: string): Promise<{
  platformName: string;
  redirectUrl?: string;
  codeVerifier?: string;
} | null> {
  // Atomically consume only non-expired state using DB time.
  const [record] = await db
    .delete(oauthStates)
    .where(and(
      eq(oauthStates.state, state),
      sql`${oauthStates.expiresAt} > NOW()`,
    ))
    .returning();

  if (!record) {
    // Best-effort cleanup for any stale duplicate rows matching same state.
    await db.delete(oauthStates).where(eq(oauthStates.state, state));
    return null;
  }

  return {
    platformName: record.platformName,
    redirectUrl: record.redirectUrl || undefined,
    codeVerifier: record.codeVerifier ? decryptSecret(record.codeVerifier) as string : undefined,
  };
}

// Cleanup old expired states periodically
export async function cleanupExpiredStates() {
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, sql`NOW()` as unknown as Date));
}

// ==================== Authorization URL ====================
export async function buildAuthorizationUrl(
  platformName: string,
  clientId: string,
  callbackUrl: string,
  state: string,
  codeVerifier?: string,
  extraParams?: Record<string, string>,
): Promise<string> {
  const provider = getProvider(platformName);
  if (!provider) throw new Error(`Unknown OAuth provider: ${platformName}`);

  const { config } = provider;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    ...extraParams,
  });

  if (config.supportsPKCE && codeVerifier) {
    params.set("code_challenge", await generateCodeChallenge(codeVerifier));
    params.set("code_challenge_method", "S256");
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

// ==================== Token Exchange ====================
export async function exchangeCodeForTokens(
  platformName: string,
  code: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string,
  codeVerifier?: string,
): Promise<OAuthTokenResponse> {
  const provider = getProvider(platformName);
  if (!provider) throw new Error(`Unknown OAuth provider: ${platformName}`);

  const { config } = provider;

  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  };

  if (config.credentialsInBody !== false) {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

  if (config.supportsPKCE && codeVerifier) {
    body.code_verifier = codeVerifier;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    ...config.tokenHeaders,
  };

  if (config.credentialsInBody === false) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

// ==================== User Profile Fetch ====================
export async function fetchUserProfile(
  platformName: string,
  accessToken: string,
): Promise<NormalizedProfile> {
  const provider = getProvider(platformName);
  if (!provider) throw new Error(`Unknown OAuth provider: ${platformName}`);

  const { config, normalizer } = provider;

  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`User info fetch failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return normalizer(data);
}
