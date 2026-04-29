#!/usr/bin/env node
// Idempotent injector: upserts marketing translation keys into client/src/locales/<lang>.ts
// Strategy: wraps the new keys with markers so re-runs replace them in place.
//
// Usage:  node scripts/inject-marketing-i18n.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRANSLATIONS } from "./marketing-i18n-data.mjs";
import { EXTRA_TRANSLATIONS } from "./marketing-i18n-extra.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "..", "client", "src", "locales");

const ALL = { ...TRANSLATIONS, ...EXTRA_TRANSLATIONS };

const START = "  // ─── BEGIN marketing-pages (auto-generated) ───";
const END = "  // ─── END marketing-pages ───";

function escape(v) {
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

function buildBlock(map) {
  const lines = [START];
  for (const [k, v] of Object.entries(map)) {
    lines.push(`  '${k}': '${escape(v)}',`);
  }
  lines.push(END);
  return lines.join("\n");
}

function escapeRegExp(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

async function processFile(filePath, map) {
  const orig = await fs.readFile(filePath, "utf8");

  // Strip ALL previous blocks (idempotent + repairs duplicates).
  // Match optional leading newline, START line, anything until END line, trailing newline.
  const blockRe = new RegExp(
    `\\n?${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`,
    "g",
  );
  const stripped = orig.replace(blockRe, "\n");

  const block = buildBlock(map);

  // Inject before the closing `};` of the const declaration.
  // Match `};` followed by export default <name>;
  const closeRe = /\n};\s*\n\s*export default\s+(\w+);/;
  const match = stripped.match(closeRe);
  if (!match) {
    console.warn(`⚠️  ${path.basename(filePath)} — could not find close marker; skipped`);
    return false;
  }

  const insertion = `\n${block}\n};\n\nexport default ${match[1]};`;
  const next = stripped.replace(closeRe, insertion);
  if (next === stripped) return false;
  await fs.writeFile(filePath, next, "utf8");
  return true;
}

async function main() {
  const files = (await fs.readdir(LOCALES_DIR)).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts",
  );
  let touched = 0;
  let skipped = 0;
  for (const file of files) {
    const lang = file.replace(/\.ts$/, "");
    // Always start from EN baseline so every locale has the full key set,
    // then overlay any hand-translated language overrides on top.
    // This guarantees no key is ever missing — partial languages still
    // get EN values for keys they don't translate themselves.
    const map = lang === "en" ? ALL.en : { ...ALL.en, ...(ALL[lang] || {}) };
    const ok = await processFile(path.join(LOCALES_DIR, file), map);
    if (ok) touched++;
    else skipped++;
  }
  console.log(`✅ marketing-i18n injected — ${touched} files updated, ${skipped} skipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
