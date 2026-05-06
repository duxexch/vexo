# CIS Evidence Pack — Game WS Hardening (Implementation Evidence)

This document captures **production security evidence** for the Game WebSocket realtime path, aligned to CIS-style controls.

## 1) Rate limiting & abuse control (CIS Availability / Integrity)
### Implemented
- Per-session/per-user move flood protection:
  - `server/lib/rate-limiter.ts`
    - `sessionMoveRateLimiter` (sessionId)
    - `sessionUserMoveRateLimiter` (sessionId + userId)

- Server-side throttling enforcement in WS message handler:
  - `server/game-websocket/index.ts`
    - case `"make_move"` checks:
      - `moveRateLimiter` (per-user global)
      - `sessionMoveRateLimiter` (per session)
      - `sessionUserMoveRateLimiter` (per session+user)
    - on rejection: returns `code: "rate_limit"` and includes `correlationId`

### Audit-grade evidence
- Throttled rejections emit `game_events` records (append + finalize):
  - `server/game-websocket/index.ts`
    - `appendGameEvent({ eventType: "move_rate_limited", ... })`
    - `finalizeGameEvent(..., "rejected", "rate_limit")`

### Metrics evidence
- Prometheus counter for rate-limit rejects:
  - `server/lib/prometheus-metrics.ts`
    - `wsMoveRateLimitedTotal`
    - `wsMoveRateLimitedTotal.inc({ scope })`

## 2) Level-1 anti-cheat anomaly detection (CIS Abuse/Malicious Activity)
### Implemented (rule-based)
- Rule-based Level-1 detector module:
  - `server/lib/game-level1-anomaly.ts`
    - blocks for:
      - `move_rate_abuse`
      - `timing_regular_fast`
      - `invalid_move_spam` (via INVALID_MOVE path)

- Wired into authoritative move path:
  - `server/game-websocket/moves.ts`
    - runs `evaluateAndRecordSubmission(...)` before DB transaction
    - runs `evaluateAndRecordInvalid(...)` on `"INVALID_MOVE"` catch path
    - blocks => returns:
      - `code: "level1_anomaly"`
      - `retryAfterMs`
      - `correlationId`

### Metrics evidence
- Prometheus counter for Level-1 anomalies:
  - `server/lib/prometheus-metrics.ts`
    - `gameLevel1AnomalyTotal` with labels `{ anomalyType, result }`

### Audit-grade event correlation
- move commit events now include correlation identifiers in logged payload:
  - `server/game-websocket/moves.ts`
    - `appendGameEvent(... payload: { ..., correlationId, attemptId })`

## 3) Unit test evidence
### Rate limiter quotas
- `tests/rate-limiter-session-move.test.ts`
  - passing tests validate:
    - session quota rejection
    - session reset after window
    - session+user quota rejection
    - isolation between different users in same session

### Level-1 anomaly detector
- `tests/game-level1-anomaly.test.ts`
  - passing tests validate:
    - `move_rate_abuse`
    - `invalid_move_spam`
    - `timing_regular_fast`
    - no false positives at low rate

## 4) Verification status (what’s still missing vs CIS checklist)
Implemented in this iteration:
- Per-session/per-user rate limits + metrics + audit rejects
- Level-1 anomaly detection rules + metrics + audit integration
- Unit tests for both components

Not yet fully completed (CIS checklist still open):
- RTC signaling & presence quotas hardening
- Standardized correlationId coverage for *all* WS event types (not only make_move)
- Snapshot persistence + replay verification pipeline
- Operational playbooks (session stuck/disconnect storm/RTC outage/WS lag spike)

## 5) Code references
- `server/game-websocket/index.ts`
- `server/game-websocket/moves.ts`
- `server/lib/rate-limiter.ts`
- `server/lib/prometheus-metrics.ts`
- `server/lib/game-level1-anomaly.ts`
- `tests/rate-limiter-session-move.test.ts`
- `tests/game-level1-anomaly.test.ts`
