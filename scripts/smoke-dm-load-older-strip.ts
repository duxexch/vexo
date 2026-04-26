#!/usr/bin/env tsx
/**
 * Task #112 — DM "Loading older messages…" strip regression smoke
 * entry point.
 *
 * Background
 * ----------
 * Tasks #27 and #77 work together to keep the DM thread visually
 * stable while older history pages stream in:
 *
 *   - Task #27 / #78 introduced `useScrollAnchorOnPrepend` so the
 *     first visible message stays pinned when an older page lands.
 *     That y-pinning invariant is locked by
 *     `tests/dm-scroll-anchor-prepend.test.tsx` (entry point:
 *     `scripts/smoke-dm-scroll-anchor.ts`).
 *
 *   - Task #77 introduced the "Loading older messages…" strip with
 *     a layout-neutral `sticky top-0 -mb-9 h-9` trick so the
 *     loading indicator is visible without displacing messages and
 *     silently breaking the y-pinning.
 *
 * Task #112 calls for an automated test that locks the second
 * guarantee — strip appears during the request, disappears
 * afterward, in BOTH English and Arabic locales — alongside the
 * y-pinning. The y-pinning is already covered. The strip
 * visibility + locale + layout-neutrality are NOT, until now.
 *
 * The actual assertions live in `tests/dm-load-older-strip.test.tsx`.
 * That file:
 *   1) Loads the real `client/src/locales/en.ts` and `ar.ts`
 *      modules and asserts both define a non-empty
 *      `chat.loadingOlderMessages` key.
 *   2) Mounts a faithful copy of the production strip JSX in jsdom,
 *      drives the full `false -> true -> false` loading lifecycle
 *      against each locale, and asserts visibility (opacity-100/
 *      opacity-0), accessibility (`aria-hidden`, `role=status`,
 *      `aria-live=polite`), and the EXACT localized copy.
 *   3) Re-reads `client/src/pages/chat.tsx` and pins the production
 *      strip's shape (testid, visibility gate on `loadingMore`, the
 *      `t('chat.loadingOlderMessages')` lookup, and the
 *      `sticky top-0 -mb-9 h-9` layout-neutrality trick that
 *      protects the y-pinning invariant from regressing in
 *      production).
 *
 * This wrapper exists so the smoke is reachable as
 * `npm run quality:smoke:dm-load-older-strip` (and from CI gates by
 * file name), in line with the rest of the smoke suite. It just
 * shells out to the vitest runner against the canonical test file.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const TEST_FILE = path.join("tests", "dm-load-older-strip.test.tsx");

const result = spawnSync(
  "npx",
  ["vitest", "run", TEST_FILE, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);

if (result.error) {
  console.error(
    "[smoke:dm-load-older-strip] failed to launch vitest:",
    result.error,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
