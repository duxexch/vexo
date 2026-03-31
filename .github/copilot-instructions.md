# VEX Platform — Development Rules

## Golden Rule: Test Before Commit

**Every modification MUST pass ALL checks before being approved.**

### Workflow for every change:

1. **Make the change** — Apply the fix/feature
2. **Run TypeScript check** — `npx tsc --noEmit`
3. **Verify server starts** — `npx tsx server/index.ts` (must boot without crashes)
4. **Test affected routes** — `curl -s -o NUL -w "%{http_code}" http://localhost:3001/` (must return 200)
5. **If ALL pass** → Commit and push
6. **If ANY fail** → Fix the error, repeat from step 2

### Commands Reference

```bash
# TypeScript check (0 errors required)
npx tsc --noEmit

# Start server locally (requires env vars)
$env:DATABASE_URL="postgresql://vex_user:VexLocal2026SecurePass!@localhost:5432/vex_db"
$env:DB_SSL="false"
$env:SESSION_SECRET="vex-local-dev-session-secret-key-2026-very-secure"
$env:JWT_SIGNING_KEY="vex-local-dev-jwt-signing-key-2026-for-user-auth-tokens"
$env:ADMIN_JWT_SECRET="vex-local-dev-admin-jwt-secret-2026-different-from-user"
$env:NODE_ENV="development"
$env:PORT="3001"
npx tsx server/index.ts

# Quick route check
curl -s -o NUL -w "%{http_code}" http://localhost:3001/
```

## Project Info

- **Stack**: Express + TypeScript + React 18 + Vite + Tailwind + PostgreSQL + Drizzle ORM + Redis + WebSocket
- **Port**: 3001 (default)
- **DB**: PostgreSQL via Docker (`vex-db` container, port 5432)
- **Module System**: ESM (`"type": "module"`) — **never use `require()`**
- **Git Remote**: `vixotest` → `promnes/vixotest` (GitHub)

## Security Audit History

| Phase | Commit | Fixes |
|-------|--------|-------|
| Phase 1 | `f554b6b` | 12 — auth, financial validation, admin routes |
| Phase 2 | `4f2e9cf` | 17 — mass assignment, XSS, race conditions |
| Phase 3 | `c7b3ac4` | 11 — game state, matchmaking, SSRF, WS |
| Phase 4 | `888bf40` | 17 — double-payout, 2FA, TOTP, body limits |
| Phase 5 | `4808406` | 32 — SEO, PWA, accessibility, security headers |
| **Total** | | **89 fixes** |

## Key Rules

- Never use `require()` — project is ESM
- Always run `npx tsc --noEmit` before committing
- Default port is 3001, not 5000
- `reusePort` is NOT supported on Windows — never add it
- CSP `unsafe-eval` should be minimized
- Push notifications must respect user language (not hardcoded Arabic)
- Manifest icon purpose: separate `"any"` and `"maskable"` entries
- `self.skipWaiting()` must NOT be in SW install event — update banner controls it

## Mobile, I18n, and Production Quality Rules

- Every UI/UX change MUST be mobile-first and responsive (especially phone sizes, touch interaction, and small-width layouts), because this project targets Android packaging (`AAB`/`APK`).
- For any feature that ships to `APK`/`AAB`, interaction MUST be verified on real phone behavior: touch gestures, in-app controls, and native device buttons (especially Android back-button navigation) must work correctly.
- Any new user-facing text MUST go through i18n keys (no hardcoded UI strings in components).
- Every text change MUST be reflected in all project locale resources and generated locale artifacts used by the app.
- Translation review is mandatory on every text change, and localization coverage must remain complete across all product-targeted world languages (never ship partial-locale updates).
- All fixes/features MUST be production-grade implementations (no temporary hacks or patchy workarounds).
- While editing, remove dead code in touched areas (unused imports, unreachable branches, stale state/handlers, obsolete helpers).
- Keep changes clean and maintainable with minimal side effects and consistent architecture.
