# 00 - Work Priorities (Read First)

These priorities are non-negotiable and must be checked before any implementation.

## Priority Order

1. Financial and Security Integrity

- Never introduce non-atomic balance or payout logic.
- Keep auth/session/role boundaries strict.
- Keep sensitive actions rate-limited and auditable.

1. Database Safety and Consistency

- Preserve schema constraints and referential integrity.
- Avoid destructive DB changes without backup and rollback path.
- Keep migrations idempotent and production-safe.

1. Mobile-First UX and Responsive Design

- Every UI change must work on phone-first layouts.
- Minimum touch target is 44px.
- No fixed heights that break small screens.

1. RTL + i18n Correctness

- No hardcoded user-facing strings in pages/components.
- Use i18n keys, not inline language checks.
- Avoid `ml-`/`mr-` in directional layouts; use logical spacing (`ms-`/`me-`).

1. SEO and Crawl Compatibility

- Keep indexable public routes healthy (robots + sitemap + canonical behavior).
- Keep private routes and APIs blocked for crawlers.
- Preserve metadata, structured crawl behavior, and valid sitemap updates.

1. Production Run Reliability

- App must run locally and in production reliably.
- Docker production-local run must be available on port 3001.
- Keep startup checks, health checks, and graceful shutdown behavior intact.

## Definition of Done (DoD)

A task is complete only if all are true:

- TypeScript check passes (`npx tsc --noEmit`).
- Server starts without crash on expected environment.
- Affected route/feature behavior is verified.
- Documentation in this folder is updated.
- Change is recorded in `06_CHANGE_PROTOCOL_AND_LOG.md`.

## Red Flags (Stop and Fix)

Stop and fix immediately if any of these appear:

- Balance can be changed without transaction lock.
- Auth bypass path is introduced.
- Mobile layout overflows or critical actions are unreachable on phones.
- Hardcoded text introduced in user-facing UI.
- Docker or startup path no longer works on expected port/profile.
