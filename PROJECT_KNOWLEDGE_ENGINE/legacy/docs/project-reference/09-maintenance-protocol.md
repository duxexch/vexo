# 09 - Maintenance Protocol

Purpose: keep this reference folder accurate as the code evolves.

## Mandatory update flow after each technical task

1. Implement code change.
2. Validate (`tsc`, startup, target behavior).
3. Update `10-change-log.md` with:
   - date
   - changed files
   - behavior impact
   - risk notes
4. If architecture ownership changed, update related map file(s).
5. If runbook/ops behavior changed, update `08-devops-and-environments.md`.

## Which file to update for each change type

| Change type | Update files |
|---|---|
| New API route/module | `02-backend-api-map.md` or `03-admin-api-map.md` |
| Auth/session/security behavior | `07-auth-and-security.md` |
| DB tables/domain ownership | `04-database-domain-map.md` |
| Realtime/game engine behavior | `05-realtime-and-game-engines.md` |
| Frontend route/provider/hook changes | `06-frontend-map.md` |
| Runtime/deploy/env changes | `08-devops-and-environments.md` |
| Startup/bootstrap/scheduler changes | `01-runtime-flow.md` |

## Task kickoff protocol (for future fixes)

When a new bug or feature request arrives:

1. classify domain first
2. open corresponding map file
3. locate owning backend/frontend/storage modules
4. patch minimal surface area
5. run validation
6. append change-log entry

## Regression prevention rules

1. Prefer module-local fixes over cross-cutting edits.
2. Preserve existing APIs unless explicitly changing contract.
3. Confirm auth and role checks for every protected route change.
4. For data changes, verify migration/backfill and FK impact.
5. For realtime changes, verify both persistence and broadcast paths.

## Knowledge base quality checklist

A map file is considered up to date when:

1. ownership files still exist
2. startup/runtime references still valid
3. domain list still matches current route/storage modules
4. latest major change is reflected in `10-change-log.md`
