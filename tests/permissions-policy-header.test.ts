/**
 * Regression test for Task #143 — the Permissions-Policy header used to
 * carry `camera=()`, which silently disabled the camera even on
 * trusted same-origin Capacitor builds, breaking video calls entirely.
 *
 * This test pins the header value the production server sends in two
 * places: `server/index.ts` and `deploy/nginx.conf`. Both files MUST
 * grant `self` access to every web API the codebase actually invokes
 * (mic, camera, fullscreen, clipboard-write). If anyone tightens one
 * file without the other, this test fails and the deploy is blocked.
 *
 * We assert against the source files rather than booting the full
 * Express stack so the test stays hermetic and fast — the regression
 * we care about is "the string in the source matches the contract",
 * which file-content assertions cover precisely.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const SERVER_SRC = readFileSync(
  path.join(REPO_ROOT, "server/index.ts"),
  "utf8",
);
const NGINX_CONF = readFileSync(
  path.join(REPO_ROOT, "deploy/nginx.conf"),
  "utf8",
);

const REQUIRED_SELF_DIRECTIVES = [
  "microphone=(self)",
  "camera=(self)",
  "fullscreen=(self)",
  "clipboard-write=(self)",
];

const FORBIDDEN_BLOCKS = [
  // The pre-Task-#143 settings — these silently broke the camera even
  // when the OS-level permission was granted. Catching them here means
  // a future copy-paste regression fails CI before it ever ships.
  //
  // We match the directive INSIDE quotes so the regression scanner
  // doesn't trip over the very comment that documents the bug.
  '"camera=()"',
  "'camera=()'",
];

function stripQuotedDirectiveFromNginx(source: string): string {
  // Nginx uses bare strings without surrounding quotes inside the
  // header value, so we normalise to the same shape the server file
  // uses before scanning for the forbidden directives.
  return source.replace(/camera=\(\)/g, '"camera=()"');
}

describe("Permissions-Policy header — server + nginx contract", () => {
  it("server/index.ts grants self-origin access to every web API the app uses", () => {
    for (const directive of REQUIRED_SELF_DIRECTIVES) {
      expect(SERVER_SRC).toContain(directive);
    }
  });

  it("server/index.ts no longer ships any of the breaking directives", () => {
    for (const directive of FORBIDDEN_BLOCKS) {
      expect(SERVER_SRC).not.toContain(directive);
    }
  });

  it("deploy/nginx.conf mirrors the server-side directives", () => {
    for (const directive of REQUIRED_SELF_DIRECTIVES) {
      expect(NGINX_CONF).toContain(directive);
    }
  });

  it("deploy/nginx.conf no longer ships any of the breaking directives", () => {
    const normalised = stripQuotedDirectiveFromNginx(NGINX_CONF);
    for (const directive of FORBIDDEN_BLOCKS) {
      expect(normalised).not.toContain(directive);
    }
  });
});
