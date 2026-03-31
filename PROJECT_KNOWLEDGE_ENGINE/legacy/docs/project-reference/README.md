# VEX Project Reference Knowledge Base

Purpose: This folder is the persistent technical reference for the whole project so future fixes and enhancements are faster, safer, and more consistent.

## How to use this folder

1. Start with `00-system-overview.md` and `01-runtime-flow.md`.
2. Open the domain file related to your task (backend, frontend, database, realtime, auth, ops).
3. Execute the change.
4. Update `10-change-log.md` with what changed and why.
5. If architecture changed, update the relevant map file before closing the task.

## Document index

- `00-system-overview.md`: Big picture architecture and repository map.
- `01-runtime-flow.md`: Boot lifecycle, request flow, and scheduler flow.
- `02-backend-api-map.md`: Public API module map.
- `03-admin-api-map.md`: Admin API module map.
- `04-database-domain-map.md`: Database domains and schema ownership.
- `05-realtime-and-game-engines.md`: WebSocket and game engine runtime model.
- `06-frontend-map.md`: Frontend routing, providers, and state/data flow.
- `07-auth-and-security.md`: Authentication, authorization, session, and rate-limit model.
- `08-devops-and-environments.md`: Deployment and environment operations.
- `09-maintenance-protocol.md`: Rules for keeping this knowledge base current.
- `10-change-log.md`: Chronological technical change history.
- `11-module-index.md`: High-signal module and folder index.

## Scope

This reference intentionally focuses on:

- Architecture and ownership maps.
- Execution and data flow.
- Operational behavior and safety checks.
- Change history that matters for debugging and regression prevention.

It does not duplicate every line of code or every endpoint.

## Security rule

Never copy production secrets into this folder. Keep credentials only in environment files and secret stores.
