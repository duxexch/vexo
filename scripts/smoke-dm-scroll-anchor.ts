#!/usr/bin/env tsx
/**
 * Task #78 — DM scroll-jump regression smoke entry point.
 *
 * The actual assertions live in
 * `tests/dm-scroll-anchor-prepend.test.tsx` — a real React Testing
 * Library component test that mounts the production
 * `useScrollAnchorOnPrepend` hook in jsdom, patches layout via
 * `Object.defineProperty`, and asserts the anchor message's
 * viewport-Y delta stays under 4 px across every prepend scenario
 * (single page, concurrent bottom-arriving message, three
 * consecutive deep-history seeks, empty/dedup'd response, and the
 * scrollTop=0 edge case). It also includes a call-site lock that
 * guards against silent regressions in chat.tsx (e.g. someone
 * re-inlining the old snapshot-delta formula or dropping the
 * `data-message-id` attributes).
 *
 * This wrapper exists so the task's stated artifact path
 * (`scripts/smoke-dm-scroll-anchor.ts`, registered as
 * `quality:smoke:dm-scroll-anchor` in package.json) keeps working
 * for CI gates and humans running smokes by file name. It simply
 * shells out to the vitest runner against the canonical test file.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const TEST_FILE = path.join("tests", "dm-scroll-anchor-prepend.test.tsx");

const result = spawnSync(
  "npx",
  ["vitest", "run", TEST_FILE, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);

if (result.error) {
  console.error("[smoke:dm-scroll-anchor] failed to launch vitest:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
