#!/usr/bin/env tsx
/**
 * Task #79 — DM history pagination boundary smoke entry point.
 *
 * The actual assertions live in
 * `server/storage/__tests__/direct-messages.history.test.ts`. That
 * file mounts the production `getDirectMessageHistory` query
 * against the real project Postgres schema and locks all four
 * pagination boundaries (empty, partial, exactly-`limit` — the
 * Task #28 case — and over-`limit` with sentinel handling), plus
 * the conversation-filter and ASC-order invariants the inbox UI
 * depends on.
 *
 * This wrapper exists so the smoke is reachable as
 * `npm run quality:smoke:dm-history-pagination` and from CI gates
 * by file name, in line with the rest of the smoke suite. It just
 * shells out to the vitest runner against the canonical test file.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const TEST_FILE = path.join(
  "server",
  "storage",
  "__tests__",
  "direct-messages.history.test.ts",
);

const result = spawnSync(
  "npx",
  ["vitest", "run", TEST_FILE, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);

if (result.error) {
  console.error(
    "[smoke:dm-history-pagination] failed to launch vitest:",
    result.error,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
