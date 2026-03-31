# 06 - Change Protocol and Log

This file is mandatory to update after every implemented task.

## 1. Update Protocol (After Every Change)

1. Implement code change.
2. Run required validation (at minimum type check and targeted behavior check).
3. Update affected knowledge files in this folder.
4. Append a log entry below.
5. Include risks, rollback note, and verification result.

## 2. Which Knowledge File to Update

- Architecture/runtime ownership changed:
  - update `01_KNOWLEDGE_TREE.md`, `02_TECHNICAL_ARCHITECTURE.md`

- UI/mobile/i18n/SEO behavior changed:
  - update `03_DESIGN_MOBILE_I18N_SEO.md`

- Auth/financial/db behavior changed:
  - update `04_SECURITY_FINANCE_DATABASE.md`

- Startup/deploy/docker behavior changed:
  - update `05_DOCKER_DEPLOYMENT_RUNBOOK.md`

## 3. Log Entry Template

Use this exact structure:

- Date:
- Task:
- Changed files:
- Behavior impact:
- Security/financial impact:
- Validation run:
- Risks/notes:

## 4. Log Entries

- Date: 2026-03-30
- Task: Create centralized project knowledge engine and consolidate legacy docs
- Changed files:
  - `PROJECT_KNOWLEDGE_ENGINE/*`
  - `PROJECT_KNOWLEDGE_ENGINE/legacy/*`
  - docker runtime files aligned for local production on port 3001
- Behavior impact:
  - Introduced central reference folder as primary knowledge source
  - Moved historical docs into one consolidated legacy location
  - Standardized local production Docker port target to 3001
- Security/financial impact:
  - Documentation-level consolidation only plus runtime port alignment
  - No direct business-logic financial modifications
- Validation run:
  - TypeScript check to be executed after edits
- Risks/notes:
  - Any future move/rename of docs should update this file and folder index

- Date: 2026-03-30
- Task: Align root README with centralized knowledge engine paths and port 3001 policy
- Changed files:
  - `README.md`
  - `PROJECT_KNOWLEDGE_ENGINE/06_CHANGE_PROTOCOL_AND_LOG.md`
- Behavior impact:
  - Replaced stale references to old docs paths with centralized `PROJECT_KNOWLEDGE_ENGINE` paths
  - Updated root documentation examples/checks from port 5000 to port 3001
  - Updated moved mobile build guide reference to legacy location under the knowledge engine
- Security/financial impact:
  - Documentation-only changes; no runtime security or financial logic changes
- Validation run:
  - `npx tsc --noEmit` (pass)
  - `npx tsx server/index.ts` boot check with local env (pass)
  - `curl http://localhost:3001/` equivalent HTTP check (status 200)
- Risks/notes:
  - Additional non-canonical legacy files may still mention historical paths/ports and can be normalized in a separate optional pass

- Date: 2026-03-30
- Task: Normalize active stale references for port policy and consolidated audit paths
- Changed files:
  - `.replit`
  - `.memory`
  - `PROJECT_KNOWLEDGE_ENGINE/03_DESIGN_MOBILE_I18N_SEO.md`
  - `PROJECT_KNOWLEDGE_ENGINE/06_CHANGE_PROTOCOL_AND_LOG.md`
- Behavior impact:
  - Updated active workspace run-port settings from 5000 to 3001 in `.replit`
  - Updated active operational notes in `.memory` to align with port 3001
  - Repointed audit references in `03_DESIGN_MOBILE_I18N_SEO.md` to consolidated legacy root-docs paths
- Security/financial impact:
  - Documentation/config consistency only; no auth, security, trading, or financial logic changed
- Validation run:
  - Targeted stale-reference verification on edited files (pass)
  - Full TypeScript/runtime checks to be run immediately after this update
- Risks/notes:
  - Historical mentions in canonical change history remain intentionally preserved where they describe completed migration work
