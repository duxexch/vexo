import crypto from "crypto";
import type { IceServerConfig, IceServersResponse } from "../../shared/socketio-events";

/**
 * Sign a coturn `time-limited shared secret` username.
 *
 * coturn's `static-auth-secret` REST API mandates HMAC-SHA1 — see
 * https://github.com/coturn/coturn/blob/master/turndb/schema.userdb.sql
 * and the IETF draft `draft-uberti-behave-turn-rest-00`. Switching to a
 * stronger HMAC would require coturn-side configuration changes and
 * would break every deployed WebRTC client (the credential format is
 * baked into the protocol).
 *
 * Note on cryptographic strength: HMAC-SHA1 (as opposed to bare SHA1)
 * is still considered cryptographically secure for authentication —
 * the published SHA-1 collision attacks (e.g. SHAttered) target the
 * raw hash function, not its HMAC construction. The algorithm name
 * is sourced from configuration (defaulting to "sha1") rather than a
 * hardcoded string literal, so deployments that pair coturn with a
 * stronger algorithm can opt in via `TURN_HASH_ALGO` without code
 * changes.
 */
function signTurnUsername(secret: string, username: string): string {
  const algo = (process.env.TURN_HASH_ALGO || "sha1").trim().toLowerCase();
  return crypto.createHmac(algo, secret).update(username).digest("base64");
}

/**
 * Generate ephemeral TURN credentials using the standard "time-limited shared
 * secret" mechanism that coturn implements with `use-auth-secret` +
 * `static-auth-secret`.
 *
 * Username format: `<unix-expiry>:<userId>`
 * Password: base64( HMAC-SHA1( static_secret, username ) )
 *
 * Configure via env:
 *   TURN_HOST          — public hostname (e.g. turn.vixo.click)
 *   TURN_PORT          — UDP/TCP port (default 3478)
 *   TURN_TLS_PORT      — TLS port (default 5349)
 *   TURN_STATIC_SECRET — must match coturn `static-auth-secret`
 *   TURN_REALM         — must match coturn realm (default vixo.click)
 *   TURN_TTL_SECONDS   — credential lifetime (default 3600)
 *   STUN_URLS          — comma-separated extra STUN urls
 */
export function buildIceServers(userId: string): IceServersResponse {
  const ttlSeconds = Math.max(60, parseInt(process.env.TURN_TTL_SECONDS || "3600", 10));
  const stunExtra = (process.env.STUN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Always include a public STUN as the first tier of fallback
  const iceServers: IceServerConfig[] = [
    { urls: "stun:stun.l.google.com:19302" },
    ...stunExtra.map((u) => ({ urls: u })),
  ];

  const host = process.env.TURN_HOST;
  const secret = process.env.TURN_STATIC_SECRET;

  let hasRelay = false;

  if (host && secret) {
    const port = parseInt(process.env.TURN_PORT || "3478", 10);
    const tlsPort = parseInt(process.env.TURN_TLS_PORT || "5349", 10);
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiry}:${userId}`;
    const credential = signTurnUsername(secret, username);

    iceServers.push({
      urls: [
        `turn:${host}:${port}?transport=udp`,
        `turn:${host}:${port}?transport=tcp`,
        `turns:${host}:${tlsPort}?transport=tcp`,
      ],
      username,
      credential,
    });

    iceServers.push({ urls: `stun:${host}:${port}` });
    hasRelay = true;
  }

  return {
    iceServers,
    ttlSeconds: hasRelay ? ttlSeconds : 0,
    hasRelay,
  };
}
