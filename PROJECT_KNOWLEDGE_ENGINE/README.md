# Project Knowledge Engine

Purpose: this folder is the single source of truth for technical understanding, design constraints, security guardrails, and operational runbooks for VEX.

Read order:

1. `00_PRIORITIES.md`
2. `01_KNOWLEDGE_TREE.md`
3. `02_TECHNICAL_ARCHITECTURE.md`
4. `03_DESIGN_MOBILE_I18N_SEO.md`
5. `04_SECURITY_FINANCE_DATABASE.md`
6. `05_DOCKER_DEPLOYMENT_RUNBOOK.md`
7. `06_CHANGE_PROTOCOL_AND_LOG.md`
8. `07_LEGACY_INDEX.md`

Rules:

- Any new code change must be reflected in `06_CHANGE_PROTOCOL_AND_LOG.md`.
- If architecture ownership changes, update `01_KNOWLEDGE_TREE.md` and `02_TECHNICAL_ARCHITECTURE.md`.
- If UX/mobile/SEO behavior changes, update `03_DESIGN_MOBILE_I18N_SEO.md`.
- If auth/financial/DB safety behavior changes, update `04_SECURITY_FINANCE_DATABASE.md`.
- If run/start/deploy behavior changes, update `05_DOCKER_DEPLOYMENT_RUNBOOK.md`.

Legacy docs:

- Previous documentation was consolidated under `legacy/` inside this folder so project knowledge is centralized.
