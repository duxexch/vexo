/**
 * smoke-game-config-resolution.ts
 *
 * Regression guard for the games-catalog crash that occurred when
 * `/api/multiplayer-games?activeOnly=true` returned a partial subset
 * (e.g. a multiplayer game disabled in admin) — `multiplayerGameConfig[key]`
 * was undefined, which previously caused the catalog to fall through to a
 * non-null assertion on a missing inline fallback and crash.
 *
 * The fix is two-fold:
 *   1. `resolveGameConfigEntry()` opts into the central FALLBACK_GAME_CONFIG
 *      one key at a time, so any multiplayer key the API doesn't return is
 *      still resolvable from the static fallback.
 *   2. `games-catalog.tsx` uses `flatMap` so a key absent from BOTH the API
 *      and the static fallback is silently skipped instead of crashing.
 *
 * This smoke exercises both paths and asserts the contract.
 *
 * Run with: `npm run quality:smoke:game-config-resolution`
 */

import {
  FALLBACK_GAME_CONFIG,
  buildGameConfig,
  resolveGameConfigEntry,
  type MultiplayerGameFromAPI,
} from "../client/src/lib/game-config";

let failed = 0;
let passed = 0;

function assert(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`[smoke:game-config-resolution] PASS ${label}`);
    passed += 1;
  } else {
    console.error(
      `[smoke:game-config-resolution] FAIL ${label}${detail ? "\n        " + detail : ""}`,
    );
    failed += 1;
  }
}

// Strictly typed fixture — only the required fields per the
// MultiplayerGameFromAPI interface. Optional fields are omitted entirely
// (no `as unknown as` casts) so any future widening of the interface
// surfaces here at compile time instead of being silently bypassed.
const fakeApiGame = (key: string): MultiplayerGameFromAPI => ({
  id: `id-${key}`,
  key,
  nameEn: `Name ${key}`,
  nameAr: `اسم ${key}`,
  minStake: "1",
  maxStake: "100",
  houseFee: "0",
  isActive: true,
});

// 1. Empty / missing API → buildGameConfig returns the full fallback set.
{
  const config = buildGameConfig(undefined);
  assert(
    "buildGameConfig(undefined) returns FALLBACK_GAME_CONFIG keys",
    Object.keys(config).sort().join(",") ===
      Object.keys(FALLBACK_GAME_CONFIG).sort().join(","),
    `got [${Object.keys(config).join(", ")}]`,
  );
}

// 2. Partial API (only chess) → list contains ONLY chess (multiplayer-list
//    semantics: we never leak fallback-only keys into list iterations).
{
  const config = buildGameConfig([fakeApiGame("chess")]);
  assert(
    "buildGameConfig(partial) returns ONLY API keys",
    Object.keys(config).join(",") === "chess",
    `got [${Object.keys(config).join(", ")}]`,
  );
  assert(
    "buildGameConfig(partial) does NOT leak fallback-only `snake`",
    !("snake" in config),
  );
  assert(
    "buildGameConfig(partial) does NOT leak fallback-only `backgammon`",
    !("backgammon" in config),
  );
}

// 3. resolveGameConfigEntry: API hit wins, fallback when API misses.
{
  const config = buildGameConfig([fakeApiGame("chess")]);

  const chessEntry = resolveGameConfigEntry(config, "chess");
  assert(
    "resolveGameConfigEntry returns API entry when present",
    chessEntry?.name === "Name chess",
    `got ${chessEntry?.name}`,
  );

  const backgammonEntry = resolveGameConfigEntry(config, "backgammon");
  assert(
    "resolveGameConfigEntry falls back to FALLBACK_GAME_CONFIG when API misses",
    backgammonEntry !== undefined && backgammonEntry === FALLBACK_GAME_CONFIG.backgammon,
  );

  const unknownEntry = resolveGameConfigEntry(config, "totally-made-up-game");
  assert(
    "resolveGameConfigEntry returns undefined for keys absent from BOTH",
    unknownEntry === undefined,
  );

  const noKey = resolveGameConfigEntry(config, undefined);
  assert(
    "resolveGameConfigEntry handles undefined key gracefully",
    noKey === undefined,
  );

  const noConfig = resolveGameConfigEntry(undefined, "chess");
  assert(
    "resolveGameConfigEntry handles undefined config gracefully (still falls back)",
    noConfig === FALLBACK_GAME_CONFIG.chess,
  );
}

// 4. Catalog regression: every multiplayer key in CATALOG_METADATA must
//    resolve via resolveGameConfigEntry even when API is empty — otherwise
//    games-catalog.tsx silently drops the row.
{
  const apiEmpty = buildGameConfig(undefined);
  const catalogMultiplayerKeys = ["chess", "backgammon", "domino", "tarneeb", "baloot"];
  for (const key of catalogMultiplayerKeys) {
    const entry = resolveGameConfigEntry(apiEmpty, key);
    assert(
      `catalog multiplayer key "${key}" resolves from fallback when API is empty`,
      entry !== undefined,
    );
  }
}

if (failed > 0) {
  console.error(
    `[smoke:game-config-resolution] FAILED — ${failed} assertion(s), ${passed} passed`,
  );
  process.exit(1);
} else {
  console.log(
    `[smoke:game-config-resolution] OK — all ${passed} assertion(s) passed`,
  );
}
