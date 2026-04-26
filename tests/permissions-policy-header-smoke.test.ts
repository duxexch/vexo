/**
 * Unit coverage for the post-deploy header pin at
 * `scripts/smoke-permissions-policy-header.mjs`.
 *
 * The companion source-level guard at
 * `tests/permissions-policy-header.test.ts` pins the strings inside
 * `server/index.ts` and `deploy/nginx.conf`. This test pins the
 * VALIDATOR LOGIC the smoke script uses to interpret what comes back
 * over the wire — so we know the script will reject every regression
 * we care about even before it ever runs against the live URL.
 */

import { describe, expect, it } from "vitest";
import {
  parseArgs,
  validatePermissionsPolicy,
} from "../scripts/smoke-permissions-policy-header.mjs";

const GOOD_HEADER =
  "geolocation=(), microphone=(self), camera=(self), display-capture=(self), fullscreen=(self), clipboard-write=(self), payment=(), usb=(), interest-cohort=()";

describe("validatePermissionsPolicy — accepts the contract value", () => {
  it("accepts the exact production header value", () => {
    const verdict = validatePermissionsPolicy(GOOD_HEADER);
    expect(verdict.ok).toBe(true);
  });

  it("tolerates extra whitespace a proxy might add", () => {
    const padded = GOOD_HEADER.replace(/, /g, ",   ").replace(/=/g, " =  ");
    // The whitespace-tolerant validator only normalises run-of-spaces,
    // not the directive shape itself, so we only pad list separators
    // here — directive shape (no internal whitespace) is part of the
    // contract. Spaces around commas only:
    const proxyish = GOOD_HEADER.replace(/, /g, ",   ");
    void padded;
    expect(validatePermissionsPolicy(proxyish).ok).toBe(true);
  });
});

describe("validatePermissionsPolicy — rejects every regression we care about", () => {
  it("rejects a missing header (null)", () => {
    const verdict = validatePermissionsPolicy(null as unknown as string);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/missing or empty/);
  });

  it("rejects an empty string header", () => {
    const verdict = validatePermissionsPolicy("");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/missing or empty/);
  });

  it("rejects the exact pre-Task-#143 form `camera=()`", () => {
    const broken = GOOD_HEADER.replace("camera=(self)", "camera=()");
    const verdict = validatePermissionsPolicy(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/camera=\(\)/);
  });

  it("rejects the wildcard form `camera=*`", () => {
    const broken = GOOD_HEADER.replace("camera=(self)", "camera=*");
    const verdict = validatePermissionsPolicy(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/camera=\*/);
  });

  it.each([
    ["microphone=(self)"],
    ["camera=(self)"],
    ["fullscreen=(self)"],
    ["clipboard-write=(self)"],
  ])("rejects a header missing the required directive %s", (directive) => {
    const broken = GOOD_HEADER.replace(directive, "geolocation=()");
    const verdict = validatePermissionsPolicy(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(directive);
  });
});

describe("parseArgs — resolves URL and retry parameters", () => {
  it("defaults to vixo.click with sensible retry/delay", () => {
    const previousUrl = process.env.DEPLOY_VERIFY_URL;
    const previousRetry = process.env.DEPLOY_VERIFY_RETRY;
    const previousDelay = process.env.DEPLOY_VERIFY_DELAY;
    delete process.env.DEPLOY_VERIFY_URL;
    delete process.env.DEPLOY_VERIFY_RETRY;
    delete process.env.DEPLOY_VERIFY_DELAY;
    try {
      const args = parseArgs([]);
      expect(args.url).toBe("https://vixo.click/");
      expect(args.retry).toBeGreaterThanOrEqual(1);
      expect(args.delay).toBeGreaterThanOrEqual(0);
    } finally {
      if (previousUrl !== undefined) process.env.DEPLOY_VERIFY_URL = previousUrl;
      if (previousRetry !== undefined) process.env.DEPLOY_VERIFY_RETRY = previousRetry;
      if (previousDelay !== undefined) process.env.DEPLOY_VERIFY_DELAY = previousDelay;
    }
  });

  it("CLI flags override env vars", () => {
    process.env.DEPLOY_VERIFY_URL = "https://env.example/";
    process.env.DEPLOY_VERIFY_RETRY = "9";
    process.env.DEPLOY_VERIFY_DELAY = "1";
    try {
      const args = parseArgs([
        "--url=https://cli.example/",
        "--retry=2",
        "--delay=4",
      ]);
      expect(args.url).toBe("https://cli.example/");
      expect(args.retry).toBe(2);
      expect(args.delay).toBe(4);
    } finally {
      delete process.env.DEPLOY_VERIFY_URL;
      delete process.env.DEPLOY_VERIFY_RETRY;
      delete process.env.DEPLOY_VERIFY_DELAY;
    }
  });

  it("clamps malformed retry/delay to safe defaults", () => {
    const args = parseArgs(["--retry=not-a-number", "--delay=-7"]);
    expect(args.retry).toBeGreaterThanOrEqual(1);
    expect(args.delay).toBeGreaterThanOrEqual(0);
  });
});
