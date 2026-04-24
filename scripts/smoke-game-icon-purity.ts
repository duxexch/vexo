/**
 * smoke-game-icon-purity.ts
 *
 * Guardrail for Task #40 (single source of truth for game visuals).
 *
 * The admin Visual Identity panel is the only place where a game's icon /
 * color / gradient / thumbnail should be defined. Every UI surface must
 * read those values via `buildGameConfig` + `<GameConfigIcon />`.
 *
 * To prevent a future PR from re-introducing a hardcoded game-keyed Lucide
 * icon (which would silently shadow admin uploads), this smoke scans the
 * client codebase for direct imports of icons whose ONLY semantic use here
 * is to represent a specific game (`Bone` → Domino, `Dice5` → Backgammon,
 * `Spade` → Tarneeb / Cards). Importing them anywhere outside the central
 * config is treated as a regression.
 *
 * The smoke also fails if it finds the catalog's old hardcoded GAME_CATALOG
 * pattern (`icon: <LucideName>` next to `gradient:` and `accentColor:`),
 * which was the specific anti-pattern removed in Task #40.
 *
 * Run with: `npm run quality:smoke:game-icon-purity`
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const SCAN_ROOTS = [
  path.join(REPO_ROOT, "client/src/pages"),
  path.join(REPO_ROOT, "client/src/components"),
];

/**
 * Strictly game-keyed Lucide icons. These have no general-purpose use in
 * this app — every appearance maps to a specific game type.
 *   Bone   → Domino
 *   Dice5  → Backgammon
 *   Spade  → Tarneeb / generic cards
 *
 * Allowed only inside the central game config module.
 */
const GAME_KEYED_ICONS = ["Bone", "Dice5", "Spade"] as const;

/** Files that legitimately own / declare these icons. */
const ALLOWLIST_FILES = new Set<string>([
  path.join(REPO_ROOT, "client/src/lib/game-config.ts"),
  path.join(REPO_ROOT, "client/src/components/GameConfigIcon.tsx"),
  // Admin Visual Identity icon picker — must render every selectable icon
  // including the game-keyed ones so admins can choose them as defaults.
  path.join(REPO_ROOT, "client/src/components/admin/games/GameVisualPicker.tsx"),
]);

/**
 * Multiplayer game keys whose visuals are 100% owned by `multiplayerGameConfig`
 * (which itself layers admin DB on top of `FALLBACK_GAME_CONFIG`). Any UI file
 * that declares `key: "<one of these>"` paired with a hardcoded `icon:` is
 * shadowing the admin Visual Identity panel and is the exact regression Task #40
 * removed from `games-catalog.tsx`.
 *
 * Browser-only mini-games (snake / puzzle / memory) are intentionally excluded
 * — they are not in the multiplayer DB and are allowed to declare inline
 * visuals as fallback metadata.
 */
const MULTIPLAYER_GAME_KEYS = [
  "chess",
  "backgammon",
  "domino",
  "tarneeb",
  "baloot",
  "languageduel",
] as const;

let failed = 0;
let passed = 0;

function pass(label: string) {
  console.log(`[smoke:game-icon-purity] PASS ${label}`);
  passed += 1;
}

function fail(label: string, detail: string) {
  console.error(`[smoke:game-icon-purity] FAIL ${label}\n        ${detail}`);
  failed += 1;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && (full.endsWith(".tsx") || full.endsWith(".ts"))) {
      yield full;
    }
  }
}

/**
 * Detect a top-level lucide-react import that names any of the strictly
 * game-keyed icons. Comments / string literals are not parsed precisely,
 * but the regex is deliberately scoped to the import statement form so
 * mentions in JSDoc or strings don't trigger false positives.
 */
function findGameKeyedLucideImports(source: string): string[] {
  const violations: string[] = [];
  const importRegex =
    /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    const named = match[1]
      .split(",")
      .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    for (const icon of GAME_KEYED_ICONS) {
      if (named.includes(icon)) {
        violations.push(icon);
      }
    }
  }
  return violations;
}

/**
 * Detects the legacy GAME_CATALOG shape: a literal entry that pins a
 * multiplayer game key (`key: "chess"`) to a hardcoded `icon:` Identifier.
 * Task #40 removed this; the only legitimate place to declare visuals
 * for a multiplayer game is `FALLBACK_GAME_CONFIG` in lib/game-config.ts.
 *
 * Returns the offending key + ~80-char snippet for the failure message.
 */
function findHardcodedMultiplayerVisual(
  source: string,
): { key: string; snippet: string } | null {
  for (const key of MULTIPLAYER_GAME_KEYS) {
    // Negative lookahead `(?!key\s*:)` keeps the match inside the same
    // object-literal entry (won't tunnel across the next `{ key: ... }`).
    // We flag if the entry hardcodes ANY of the visual fields the admin
    // Visual Identity panel owns (icon / gradient / color / accentColor /
    // thumbnail / iconUrl) — catching the regression even if a future
    // PR uses a non-game-keyed icon like Crown for chess.
    const re = new RegExp(
      `key\\s*:\\s*['"\`]${key}['"\`]((?:(?!key\\s*:).){0,400}?)(icon|gradient|accentColor|color|thumbnailUrl|iconUrl)\\s*:\\s*['"\`A-Z]`,
      "s",
    );
    const match = re.exec(source);
    if (match) {
      const snippet = match[0].replace(/\s+/g, " ").slice(0, 160);
      return { key, snippet };
    }
  }
  return null;
}

async function scan() {
  for (const root of SCAN_ROOTS) {
    for await (const file of walk(root)) {
      if (ALLOWLIST_FILES.has(file)) continue;
      const source = await fs.readFile(file, "utf8");

      const violations = findGameKeyedLucideImports(source);
      const rel = path.relative(REPO_ROOT, file);
      if (violations.length > 0) {
        fail(
          `${rel}: imports game-keyed Lucide icon(s) ${violations.join(", ")}`,
          `Game icons must come from buildGameConfig + <GameConfigIcon />, not direct imports. ` +
            `If you genuinely need ${violations.join("/")} for a non-game purpose, add the file to ALLOWLIST_FILES in scripts/smoke-game-icon-purity.ts with a justification.`,
        );
        continue;
      }

      const mpHit = findHardcodedMultiplayerVisual(source);
      if (mpHit) {
        fail(
          `${rel}: hardcodes a visual for multiplayer game "${mpHit.key}"`,
          `Multiplayer game visuals must come from buildGameConfig + <GameConfigIcon />. ` +
            `Found near: ${mpHit.snippet} … Move the icon/gradient/color into FALLBACK_GAME_CONFIG (or set them via the Visual Identity admin panel) and read them through buildGameConfig.`,
        );
        continue;
      }

      // Direct bracket-access on a game config map silently skips the
      // central FALLBACK_GAME_CONFIG layer when the API doesn't return that
      // key (e.g. a game toggled inactive in admin) — exactly the catalog
      // crash the validator caught. Force every per-key lookup to go
      // through `resolveGameConfigEntry()` so the fallback layer is honored.
      // We allow access to the `.chess` literal (used as the last-resort
      // default after `resolveGameConfigEntry` returns undefined) but block
      // anything indexing with `[`.
      const directLookupRe =
        /\b(?:gameConfig|GAME_CONFIG|multiplayerGameConfig)\s*\[/g;
      const lookupMatch = directLookupRe.exec(source);
      if (lookupMatch) {
        const idx = lookupMatch.index;
        const lineStart = source.lastIndexOf("\n", idx) + 1;
        const lineEnd = source.indexOf("\n", idx);
        const lineNo = source.slice(0, idx).split("\n").length;
        const snippet = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim().slice(0, 160);
        fail(
          `${rel}:${lineNo}: direct bracket-access lookup on a game config map`,
          `Use resolveGameConfigEntry(<config>, <key>) so the central FALLBACK_GAME_CONFIG fallback is honored when the API returns a partial set. Found: ${snippet}`,
        );
        continue;
      }
    }
  }

  pass(`scanned ${SCAN_ROOTS.length} roots; no game-keyed Lucide imports outside central config`);
  pass(`scanned ${SCAN_ROOTS.length} roots; no direct bracket-access lookups on game config maps`);
  pass(`no legacy GAME_CATALOG-style hardcoded icon+gradient+accentColor blocks found`);

  // ─── Acceptance-critical surface coverage ─────────────────────────────
  // Modal/dialog and list surfaces that render a game's identity (icon /
  // name / accent) MUST source it via <GameConfigIcon /> so admin Visual
  // Identity changes propagate. If any of these files stops importing
  // GameConfigIcon, it has almost certainly regressed back to a hardcoded
  // icon — fail loudly.
  const REQUIRED_GAMECONFIGICON_FILES = [
    "client/src/pages/multiplayer.tsx",
    "client/src/pages/challenges.tsx",
    "client/src/pages/game-lobby.tsx",
    "client/src/pages/game-history.tsx",
    "client/src/pages/challenge-game.tsx",
    "client/src/pages/challenge-watch.tsx",
    "client/src/pages/player-profile.tsx",
    "client/src/pages/games-catalog.tsx",
    "client/src/components/games/GameStartCinematic.tsx",
  ];
  for (const rel of REQUIRED_GAMECONFIGICON_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    let source: string;
    try {
      source = await fs.readFile(abs, "utf8");
    } catch {
      // File renamed / removed — surface it so the allowlist stays honest.
      fail(
        `${rel}: required acceptance-critical surface is missing`,
        `Either restore the file or remove it from REQUIRED_GAMECONFIGICON_FILES in this smoke.`,
      );
      continue;
    }
    if (!/from\s+["']@\/components\/GameConfigIcon["']/.test(source)) {
      fail(
        `${rel}: acceptance-critical surface does not import GameConfigIcon`,
        `Game-identity rendering on this surface must go through <GameConfigIcon /> so admin Visual Identity uploads propagate. Use buildGameConfig + resolveGameConfigEntry to obtain the entry.`,
      );
    }
  }
  pass(`scanned ${REQUIRED_GAMECONFIGICON_FILES.length} acceptance-critical surfaces; all import GameConfigIcon`);
}

async function main() {
  try {
    await scan();
  } catch (err) {
    console.error("[smoke:game-icon-purity] FATAL", err);
    process.exitCode = 1;
    return;
  }

  if (failed > 0) {
    console.error(
      `[smoke:game-icon-purity] FAILED — ${failed} violation(s), ${passed} check(s) passed`,
    );
    process.exitCode = 1;
  } else {
    console.log(`[smoke:game-icon-purity] OK — all ${passed} check(s) passed`);
  }
}

void main();
