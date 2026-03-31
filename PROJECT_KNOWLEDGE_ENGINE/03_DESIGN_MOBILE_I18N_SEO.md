# 03 - Design, Mobile, i18n, SEO Baseline

This document defines UX/design and crawl requirements that must be preserved in every change.

## 1. Mobile-First Rules (Mandatory)

- Design and behavior must be validated on phone-width first.
- No fixed heights that overflow small screens.
- Touch targets must be at least 44px for primary actions.
- Navigation and critical actions must stay reachable with one-hand usage.
- Avoid hover-only interactions for critical functions.

## 2. Current Frontend Reality

- App shell supports responsive sidebar + mobile bottom navigation (`client/src/App.tsx`).
- Service worker and update UX are active (`client/src/main.tsx`, `client/public/sw.js`).
- PWA manifest is rich and production-facing (`client/public/manifest.json`).

## 3. Known Design/UX Debt from Existing Audits

From prior audits (`PROJECT_KNOWLEDGE_ENGINE/legacy/root-docs/UI_UX_AUDIT_REPORT.md`, `PROJECT_KNOWLEDGE_ENGINE/legacy/root-docs/UI_UX_COMPONENT_AUDIT.md`, `PROJECT_KNOWLEDGE_ENGINE/legacy/root-docs/UI_UX_IMPROVEMENT_PLAN.md`):

- RTL spacing debt still exists in multiple files (`ml-`/`mr-` usage).
- Some pages/components still have hardcoded strings (missing i18n keys).
- Several game boards/components have fixed-size layouts that can hurt small phones.
- Accessibility coverage is still uneven (ARIA roles/labels and keyboard support).
- Hardcoded colors exist beyond theme tokens in multiple components.

Treat these as active quality backlog, not closed issues.

## 4. i18n and RTL Rules

- i18n core: `client/src/lib/i18n.tsx`.
- Locale sources: `client/src/locales/*`.
- App supports a broad language list including RTL languages.

Non-negotiable implementation rules:

- No new hardcoded UI text in components/pages.
- Use translation keys and fallback handling through i18n utilities.
- Use logical spacing classes (`ms-`, `me-`) for directional layouts.
- Validate both LTR and RTL rendering after UI changes.

## 5. SEO and Crawl Rules

Key files:

- `client/public/robots.txt`
- `client/public/sitemap.xml`
- canonical update behavior in `client/src/App.tsx`

Rules:

- Keep public routes indexable.
- Keep private routes (`/admin`, `/api`, auth/wallet/private profile routes) crawler-restricted.
- Update sitemap when adding/removing indexable routes.
- Preserve canonical behavior to reduce duplicate-content risk.

## 6. PWA and Indexing Compatibility

- Keep `manifest.json` valid and icon entries complete.
- Keep `sw.js` update flow stable (update banner + skip waiting message path).
- Keep offline fallback behavior for navigation requests.

## 7. UI Change Checklist

Before closing any UI task:

- Verify mobile widths (small phone, mid phone, tablet).
- Verify RTL layout and translated labels.
- Verify keyboard and screen-reader basics for interactive controls.
- Verify no overflow for game boards and chat widgets.
- Verify no regression in public crawlable pages.
