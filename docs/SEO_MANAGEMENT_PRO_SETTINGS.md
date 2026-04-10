# VEX SEO Management - Pro Settings Blueprint (2026-04-10)

## 1) Scope and intent

This file is a deep SEO configuration blueprint for this repository and deployment model.
It is designed to be aggressive in growth and visibility while staying compliant (no deceptive or black-hat manipulation).

## 2) Reality check from codebase analysis

### 2.1 Strong foundations already present

- Global metadata and JSON-LD baseline exists in client/index.html.
- Canonical updates on route change exist in client/src/App.tsx.
- Crawl controls exist in client/public/robots.txt.
- Multiple sitemap files exist: client/public/sitemap.xml, client/public/sitemap-core.xml, client/public/sitemap-index.xml.
- Server-side HTML meta injection exists for selected public routes in server/static.ts.
- Security and cache headers are in place in server/index.ts and server/static.ts.

### 2.2 Critical gaps to close

- Admin SEO UI appears disconnected from backend APIs:
  - client/src/pages/admin/admin-seo.tsx calls /api/admin/seo-settings
  - no matching backend route was found under server/**
- Meta/canonical source of truth is split:
  - static defaults in client/index.html
  - route-level injection in server/static.ts (SEO_PAGES)
  - client runtime canonical mutation in client/src/App.tsx
- Sitemap consistency drift:
  - different files have different route sets and lastmod dates
  - some potentially auth-gated routes are currently listed as crawl targets
- Indexability mismatch risk for SPA auth flows:
  - if a route is not truly public for anonymous users, indexing it can create thin/duplicate login-result pages
- Admin SEO page state hydration bug:
  - settings sync is using useState callback instead of useEffect in client/src/pages/admin/admin-seo.tsx

## 3) Core strategy (aggressive + compliant)

### 3.1 Growth model

- Use high-signal public landing pages as ranking drivers.
- Keep private/user routes non-indexable and disallowed.
- Expand semantic topic clusters via guides with internal linking.
- Enforce one canonical per indexable URL and one sitemap source of truth.

### 3.2 Non-negotiable constraints

- No cloaking.
- No fake review/rating manipulation.
- No doorway pages.
- No auto-generated spam pages.
- No deceptive redirects.

## 4) Pro settings pack (apply as policy)

## A) Indexation policy

Use these rules as the canonical indexing policy:

- Indexable public routes only:
  - /
  - /games
  - /challenges
  - /p2p
  - /tournaments
  - /leaderboard
  - /terms
  - /privacy
  - /install-app
  - /guides/index.html
  - /guides/*.html
- Noindex/private (must not be in sitemap):
  - /admin/*
  - /api/*
  - /auth/*
  - /wallet
  - /transactions
  - /settings
  - /profile
  - /player/*
  - /chat
  - /support
  - /challenge/*/play
  - /challenge/*/watch
  - /game/*

## B) Canonical policy

- Canonical must always be absolute <https://vixo.click/>... URL.
- Canonical for public page must match exactly one sitemap URL.
- Private/auth-gated surfaces must not expose indexable canonical variants.
- Remove canonical conflicts between server-injected and client-mutated values.

## C) Sitemap policy

- Single source of truth:
  - Maintain sitemap-core.xml as authoritative file.
  - Generate sitemap.xml from sitemap-core.xml or remove duplication.
- Keep sitemap-index.xml minimal and exact.
- lastmod must be updated whenever route content changes.
- Never include non-indexable/auth-required routes.

## D) Robots policy

- Keep current private route disallows.
- Keep llms.txt and guides allow rules for AI retrieval.
- Remove unnecessary legacy directives when not needed by modern crawlers.

## E) Structured data policy

- Keep Organization + WebSite + WebApplication schemas.
- Add page-specific schema for guide pages:
  - Article
  - BreadcrumbList
  - FAQPage (where applicable)
- Do not publish unverifiable AggregateRating values.

## F) Internal linking policy

- Every guide page must link to:
  - /guides/index.html
  - at least one game landing route
  - at least one transactional intent page (/p2p or /install-app)
- Use consistent anchor language in Arabic and English.

## G) Performance SEO policy

- Keep LCP image optimized and discoverable.
- Keep critical JS chunk size budget enforced.
- Keep immutable caching for hashed assets.
- Ensure API/auth routes remain no-store.

## H) International SEO policy

- Keep hreflang pairs for ar/en on indexable pages.
- Keep x-default on core landing pages.
- Avoid hreflang entries for noindex/private pages.

## 5) Execution priorities (high impact first)

### P0 (Immediate)

- Wire real backend for /api/admin/seo-settings or hide the admin SEO page until backend exists.
- Fix hydration bug in admin SEO page (useEffect for seoData sync).
- Reconcile sitemap files into one authoritative route list.
- Remove auth-gated pages from sitemap.

### P1 (Next)

- Expand server/static.ts SEO_PAGES to fully match indexable public routes.
- Add route-level title/description matrix for all indexable guide pages.
- Add breadcrumb schema on guide pages.

### P2 (Scale)

- Automate sitemap generation during build/deploy.
- Add SEO regression checks in CI:
  - canonical validity
  - sitemap URL health
  - robots disallow coverage for private endpoints
- Add route-level search intent mapping and quarterly refresh schedule.

## 6) Recommended operational settings (copyable)

```yaml
seo:
  canonicalBase: "https://vixo.click"
  defaultLocale: "ar"
  locales: ["ar", "en"]
  xDefault: "https://vixo.click/"

indexing:
  allowPublicOnly: true
  disallowPrivatePatterns:
    - "/admin"
    - "/api/"
    - "/auth/"
    - "/wallet"
    - "/transactions"
    - "/settings"
    - "/profile"
    - "/player/"
    - "/chat"
    - "/support"
    - "/challenge/*/play"
    - "/challenge/*/watch"
    - "/game/*/"

sitemap:
  authoritative: "sitemap-core.xml"
  indexFile: "sitemap-index.xml"
  includeImages: true
  autoLastmod: true
  changefreqDefaults:
    homepage: "daily"
    games: "daily"
    guides: "weekly"
    legal: "monthly"

structuredData:
  webApplication: true
  website: true
  organization: true
  articleForGuides: true
  breadcrumbForGuides: true
  faqWhenApplicable: true
  aggregateRating: "publish_only_if_verifiable"

crawlBudget:
  blockThinPages: true
  normalizeCanonical: true
  avoidDuplicateSitemaps: true

monitoring:
  weeklyChecks:
    - "sitemap URL HTTP 200"
    - "canonical self-match"
    - "robots private-route blocks"
    - "index coverage trend"
```

## 7) Validation checklist (release gate)

- All sitemap URLs return 200 and are indexable.
- No sitemap URL redirects to login for anonymous users.
- Canonical on each indexable page matches final URL.
- robots.txt disallows all private/auth/admin surfaces.
- JSON-LD passes rich results validation for key pages.
- Public pages have unique title and description pairs.

## 8) File-level mapping for implementation

- client/index.html
- client/src/App.tsx
- client/public/robots.txt
- client/public/sitemap.xml
- client/public/sitemap-core.xml
- client/public/sitemap-index.xml
- server/static.ts
- client/src/pages/admin/admin-seo.tsx
- server/admin-routes/index.ts (and new SEO route module)

## 9) Final note

If you want a phase-2 implementation pass, next step is to turn this policy into code changes:

- backend admin SEO settings route
- sitemap unification automation script
- canonical/indexability guard checks in CI
