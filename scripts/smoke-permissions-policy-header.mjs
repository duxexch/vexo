#!/usr/bin/env node
/**
 * Post-deploy smoke check — pins the live `Permissions-Policy` response
 * header so a future Hostinger / Cloudflare / nginx-include change can't
 * silently strip `camera=(self)` and reintroduce the Task #143 regression
 * (camera blocked inside the WebView even when the OS permission was
 * granted).
 *
 * Companion to the source-level guard at
 * `tests/permissions-policy-header.test.ts`. That test catches code-side
 * regressions; this script catches proxy-layer regressions by hitting the
 * deployed URL after every rollout.
 *
 * Usage (defaults aimed at the production rollout on Hostinger):
 *   node scripts/smoke-permissions-policy-header.mjs
 *   node scripts/smoke-permissions-policy-header.mjs --url=https://vixo.click/
 *   node scripts/smoke-permissions-policy-header.mjs --retry=6 --delay=5
 *
 * Env overrides (used by `prod-auto.sh` when wiring into the deploy):
 *   DEPLOY_VERIFY_URL    — full URL to fetch (overrides the default)
 *   DEPLOY_VERIFY_RETRY  — integer retry count (default 5)
 *   DEPLOY_VERIFY_DELAY  — seconds between retries (default 3)
 *
 * Exit codes:
 *   0   — header present and contains every required `=(self)` directive
 *   1   — header missing, malformed, or contains a forbidden `camera=()` form
 *   2   — network/HTTP failure after all retries
 *
 * Why curl + grep behaviour, but in Node? We already require Node for
 * every other smoke under `scripts/`, so reusing it keeps the deploy
 * dependency surface flat (no curl version differences across hosts).
 * The behaviour is intentionally curl-equivalent: GET, follow redirects,
 * read the response header, grep the value.
 */

import process from "node:process";

const DEFAULT_URL = "https://vixo.click/";

// Mirrors REQUIRED_SELF_DIRECTIVES in tests/permissions-policy-header.test.ts.
// Keep these two lists in sync — the source-level test pins the string in
// the source files, this script pins the same string on the wire.
const REQUIRED_SELF_DIRECTIVES = [
  "microphone=(self)",
  "camera=(self)",
  "fullscreen=(self)",
  "clipboard-write=(self)",
];

// Forbidden forms — these are the exact pre-Task-#143 values that broke
// video calls. Any of them on the wire means the proxy has rewritten the
// header in a way that re-disables the API. We match WITHOUT surrounding
// quotes because a real HTTP header value never carries quotes.
const FORBIDDEN_CAMERA_FORMS = [
  "camera=()",
  "camera=*",
];

// Public surface — exported for the unit test alongside the CLI entry.
export function parseArgs(argv) {
  const args = {
    url: process.env.DEPLOY_VERIFY_URL || DEFAULT_URL,
    retry: Number.parseInt(process.env.DEPLOY_VERIFY_RETRY || "5", 10),
    delay: Number.parseInt(process.env.DEPLOY_VERIFY_DELAY || "3", 10),
  };
  for (const raw of argv) {
    if (raw.startsWith("--url=")) args.url = raw.slice("--url=".length);
    else if (raw.startsWith("--retry=")) args.retry = Number.parseInt(raw.slice("--retry=".length), 10);
    else if (raw.startsWith("--delay=")) args.delay = Number.parseInt(raw.slice("--delay=".length), 10);
  }
  if (!Number.isFinite(args.retry) || args.retry < 1) args.retry = 1;
  if (!Number.isFinite(args.delay) || args.delay < 0) args.delay = 0;
  return args;
}

/**
 * Pure validator — given the raw header value as it would arrive on the
 * wire, returns either { ok: true } or { ok: false, reason } describing
 * exactly which directive is missing or which forbidden form appeared.
 *
 * Splitting this from the network code makes the logic unit-testable
 * without any mocking of fetch.
 */
export function validatePermissionsPolicy(headerValue) {
  if (typeof headerValue !== "string" || headerValue.trim().length === 0) {
    return {
      ok: false,
      reason: "Permissions-Policy header is missing or empty on the response",
    };
  }
  // Normalise whitespace so a future nginx reformat (e.g. extra spaces
  // after the comma) doesn't flake the check. Real HTTP allows OWS
  // around list separators.
  const normalised = headerValue.replace(/\s+/g, " ").trim();

  for (const forbidden of FORBIDDEN_CAMERA_FORMS) {
    if (normalised.includes(forbidden)) {
      return {
        ok: false,
        reason: `Forbidden directive "${forbidden}" appears in the live header — this is the exact pre-Task-#143 regression. Live value was: ${normalised}`,
      };
    }
  }

  const missing = REQUIRED_SELF_DIRECTIVES.filter(
    (directive) => !normalised.includes(directive),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Permissions-Policy header is missing required directive(s): ${missing.join(", ")}. Live value was: ${normalised}`,
    };
  }

  return { ok: true, value: normalised };
}

// Hard cap per attempt so a stalled connection or a slow upstream
// can't drag the deploy on indefinitely. The retry loop wraps this
// and treats AbortError the same as any other transient failure.
const FETCH_TIMEOUT_MS = 12_000;

async function fetchHeaderOnce(url) {
  // GET, not HEAD — some upstreams (and Cloudflare on free plans) strip
  // headers from HEAD responses. A GET costs us a few KB and matches
  // what a real browser would see.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "vixo-deploy-verifier/1 (+permissions-policy)" },
    });
    return {
      status: res.status,
      header: res.headers.get("permissions-policy"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(seconds) {
  if (seconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function fetchHeaderWithRetry(url, retry, delaySeconds) {
  let lastError = null;
  for (let attempt = 1; attempt <= retry; attempt += 1) {
    try {
      const result = await fetchHeaderOnce(url);
      if (result.status >= 200 && result.status < 400) {
        return { ok: true, ...result };
      }
      lastError = new Error(`HTTP ${result.status} from ${url}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < retry) {
      console.log(
        `[permissions-policy-smoke] attempt ${attempt}/${retry} failed (${lastError.message}); retrying in ${delaySeconds}s`,
      );
      await sleep(delaySeconds);
    }
  }
  return { ok: false, error: lastError };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[permissions-policy-smoke] verifying ${args.url} (retry=${args.retry}, delay=${args.delay}s)`,
  );

  const fetched = await fetchHeaderWithRetry(args.url, args.retry, args.delay);
  if (!fetched.ok) {
    console.error(
      `[permissions-policy-smoke] FAIL — could not reach ${args.url}: ${fetched.error?.message ?? "unknown error"}`,
    );
    process.exit(2);
  }

  const verdict = validatePermissionsPolicy(fetched.header);
  if (!verdict.ok) {
    console.error(`[permissions-policy-smoke] FAIL — ${verdict.reason}`);
    console.error(
      "[permissions-policy-smoke] This blocks the rollout. Inspect deploy/nginx.conf, server/index.ts, and any upstream proxy (Cloudflare, Hostinger panel) for a header rewrite.",
    );
    process.exit(1);
  }

  console.log(
    `[permissions-policy-smoke] OK — header pins every required =(self) directive: ${verdict.value}`,
  );
  process.exit(0);
}

// Only run when invoked directly. Importing for tests must not trigger
// a network call or a process.exit.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("smoke-permissions-policy-header.mjs");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[permissions-policy-smoke] FAIL — unexpected error: ${error?.stack ?? error}`);
    process.exit(2);
  });
}
