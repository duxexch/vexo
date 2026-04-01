# I18N Global Translation Pipeline (No-Break Workflow)

This workflow is designed to scale localization to many languages while minimizing runtime breakage.

## What This Guarantees

This pipeline guarantees structural correctness and integration safety:

- No missing/extra i18n keys relative to English source
- No duplicate translation keys
- Placeholder integrity (`{{var}}` and `{var}` consistency)
- No empty translations in locale maps
- Language manifest consistency across:
  - `client/src/lib/i18n.tsx` language type/list/RTL set
  - `client/src/locales/index.ts` lazy loader map
  - `client/src/locales/*.ts` files

It cannot guarantee perfect semantic quality for every sentence automatically. For that, add human review on sampled critical flows.

## Source of Truth

- Base locale: `client/src/locales/en.ts`
- Language runtime metadata: `client/src/lib/i18n.tsx`
- Lazy loading registry: `client/src/locales/index.ts`

## Commands

Run these commands from project root.

1. Sync locale files to source keys (safe auto-repair)

- `npm run i18n:sync`

This step adds missing keys, removes orphan keys, and repairs placeholder tokens to match `en.ts`.

1. Generate or refresh locale files (optional)

- `node scripts/generate-locales.mjs`
- Optional for rebuilding skeleton locales: `node scripts/regenerate-skeleton-locales.mjs`

1. Validate key drift

- `npm run i18n:audit:strict`

1. Run quality checks (placeholders + manifest + untranslated ratio checks)

- `npm run i18n:quality:strict`

1. Full gate before merge/release

- `npm run quality:gate:i18n-global`

## Recommended Release Process

1. Update `en.ts` first (never edit other locales manually before source keys are final).
2. Run locale sync.
3. Regenerate locale files only if you intentionally want broader machine-translated refresh.
4. Run strict i18n gate.
5. Run typecheck/build.
6. Smoke-check RTL + LTR UI screens.
7. Manually review top user flows in selected languages:

- Arabic (`ar`) for RTL
- Chinese Traditional (`zh-TW`) for script width
- German (`de`) for long strings
- Japanese (`ja`) for compact script

## CI Integration

Use this in CI:

```bash
npm run quality:gate:i18n-global
```

This ensures any localization drift or placeholder break fails before deployment.

## Notes for “All World Languages”

The repository already supports a broad set of languages and can be extended. If adding new languages:

- Add locale file in `client/src/locales/`
- Add loader in `client/src/locales/index.ts`
- Add code + metadata in `client/src/lib/i18n.tsx`
- Re-run `npm run i18n:gate`
