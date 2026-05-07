# CIS-style Security & Production Hardening — Task Checklist (Act Mode)

## 0) Inventory & Baseline Evidence (CIS readiness)
- [x] Confirm existing WS hardening primitives: maxPayload, origin allowlist, WS upgrade rate-limit, heartbeat
- [x] Confirm Zod-based WS message validation exists (server/game-websocket/validation.ts)
- [x] Confirm make_move path has ordering/idempotency/authority + replay shadow hooks (server/game-websocket/moves.ts)
- [x] Confirm Prometheus metrics exist + event lag is observed in WS handler
- [x] Inventory RTC signaling implementation (control plane vs game plane) + existing rate limiting/validation endpoints
- [x] Inventory presence updates implementation + verify debounce and add rate-limit quotas (per-user/per-room)
- [x] Inventory immutable logging/audit persistence implementation behind appendGameEvent/finalizeGameEvent (audit-grade write path)
- [ ] evidence export path / retention & access controls documentation
// Replay shadow:
// - Per-move: `runReplayShadowValidation()` in `server/game-websocket/moves.ts`
//   validates preState+move, compares committed vs replayed state (hash) and logs drift
//   via `server/lib/game-replay-shadow.ts` / `trackReplayShadowCheck()`.
// - Session-level: on game over, `runSessionReplayValidation()` runs over the
//   persisted move sequence and persists pass/fail evidence as a `session_replay_verification`
//   audit event via `appendGameEvent()` in `moves.ts`.

## 1) WebSocket Message Hardening (CIS Application Security)
- [x] Apply schema validation for WS messages (already implemented)
- [x] Enforce payload size limits + structured rejection for all message types (not only make_move) — evidence: `server/game-websocket/index.ts`
- [x] Ensure correlationId is server-controlled:
  - [x] Reject/log if client tries to inject correlationId (if any paths still trust it) — evidence: `server/game-websocket/index.ts` (`CORRELATION_ID_INJECTION`)
// CorrelationId coverage for make_move is strong, but broadcasts emitted outside `make_move` paths (e.g. chat/gift fan-out via `broadcastToRoomFiltered`, and timer-driven `broadcastToRoom`) may miss `room.operationCorrelationId` unless explicitly stamped.
// `send()`/`sendError()` to the calling ws do get correlationId via `ws.correlationId`.
- [x] Ensure correlationId is present in **every** accepted/rejected/ignored message emitted from WS layer (including broadcasts outside `make_move`)
  - [x] Verify chat/send_gift (and timer-driven room broadcasts) receive `room.operationCorrelationId` even when their schemas omit `sessionId`
// `sendError()` emits `{ type: 'error', payload: { status, errorKey, code, reason, sessionId?, correlationId?, ... } }`
- [x] Standardize WS error payload format:
  - [x] status: accepted/rejected/ignored
  - [x] errorKey + code + reason
  - [x] always include sessionId (where applicable) + correlationId

## 2) Rate Limiting, Backpressure, and Flood Control (CIS Availability/Abuse)
- [x] Global WS message rate limiting exists in WS handler
- [x] make_move is protected by moveRateLimiter (per-user)
- [x] Add per-sessionId quotas for make_move:
  - [x] moves/sec per sessionId + per userId
  - [x] reject with retryAfterMs and logged reason
// RTC signaling has per-event rate limits + authz validation. Presence/viewer
// fan-out has debounce but per-user/per-room quota is not clearly enforced.
- [x] Add presence/RTC quotas (separate from game WS):
  - [x] presence updates rate limits (debounced viewer_list refresh)
  - [x] scheduleViewerListUpdate() is now called (viewer_list updates debounced)
  - [x] RTC signaling (invite/answer/sdp/ice/end) rate limits + payload validation
- [ ] Add “in-flight” backpressure for moves/state_sync so slow clients don’t amplify load:
  - [x] max concurrent processing per session (reject concurrent make_move per session)
  - [ ] drop/coalesce non-critical broadcasts

## 3) Session Integrity: Ordering + Idempotency + Authority (CIS Integrity)
- [x] Move ordering enforcement + turn mismatch rejection exists (db transaction + expectedTurn)
- [x] IdempotencyKey strict mode exists + duplicate move retry/sync logic exists
- [x] Add explicit out-of-order detection logging:
  - [x] if expectedTurn mismatch: log orderingIndex + dbTurn + received expectedTurn
- [ ] Ensure duplicate/out-of-order rejections do not leak state:
- [x] avoid returning sensitive preState in error responses
- [x] Add “session isolation invariants” tests:
  - [x] user cannot make_move in a session they aren’t a participant of

## 4) Audit-grade Logging Contract (CIS Logging & Audit)
- [x] Define canonical immutable log schema (finalize in code comments + docs)
- [ ] Ensure every event type produces an audit record:
  - [x] move accepted
  - [x] move rejected (with reason + errorKey)
  - [ ] join/spectate
  - [ ] reconnect attempts
  - [x] rtc signaling messages
  - [ ] close session/forfeit/timeout
- [ ] Ensure correlationId coverage:
  - [x] correlationId is present in move audit records and in move accepted/rejected client payloads
- [ ] Ensure audit immutability/retention evidence exists:
  - [x] append-only store choice verified (DB table / external log)
  - [ ] retention + access controls documented

## 5) Snapshots & Replay Verification (CIS Incident Response & Forensics)
- [x] Implement periodic snapshot persistence (missing per current status):
  - [x] snapshot cadence (e.g., every N moves or every T seconds) — env-driven in `server/lib/game-session-snapshots.ts`
  - [x] snapshot metadata: sessionId, turnNumber/orderingIndex, timestamp, correlationId — stored via ordering_index, created_at, correlation_id in `server/storage/live-games/sessions.ts`
  - [x] persistence schema + storage implementation — `upsertGameSessionSnapshot()` / `getLatestGameSessionSnapshot()` in `server/storage/live-games/sessions.ts`
- [x] Implement replayable match baseline:
  - [x] initial state derived from stored per-move `previousState`
  - [x] move sequence persisted with orderingIndex (`move_number`)
- [x] Add replay verification pipeline:
  - [x] run replay verification on session close (game over)
  - [x] record verification result (pass/fail + drift reason) as `game_events` (`session_replay_verification`)
- [x] Add crash recovery test:
  - [x] simulate server crash and confirm state restoration via snapshots

## 6) Anti-cheat Security Controls (CIS Abuse/Malicious Activity)
- [x] Move-level server validation exists (engine.validateMove + applyMove)
- [x] Implement Level 1 anomaly detection rules (rule-based):
  - [x] moves/sec unusually high per user/session
  - [ ] repeated duplicates spike (idempotency abuse)
  - [x] timing anomalies (turn execution too fast/regular)
  - [ ] impossible sequence patterns (engine-internal invariants)
- [x] Log and metric every anomaly:
  - [x] increment counters
  - [x] create audit entries for anomalies/reject reasons
- [ ] Add thresholds configuration + safe defaults + per-game override support

## 7) Operational Playbooks & Runbooks (CIS Operational Readiness)
- [x] Create playbooks docs with:
  - [ ] Session stuck: detection signals, mitigation, recovery steps, owners
  - [ ] Disconnect storm: detection, throttling actions, capacity guidance
  - [ ] RTC outage: degrade mode, reconnect voice-only flow, comms
  - [ ] WS lag spike: shedding strategy, backpressure tuning, rollback plan
- [ ] Wire alerts → playbooks:
  - [ ] alert names + dashboard links included
- [ ] Add “evidence collection checklist” for incident response:
  - [ ] correlationId range, sessionId, last snapshots, move ranges, rtc logs

## 8) Testing & Verification (CIS Evidence)
- [ ] Unit tests:
  - [ ] validateGameMessage edge cases (schema rejects)
  - [ ] idempotency strict/relaxed behavior
  - [x] turn mismatch/out-of-order behavior
  - [x] sessionMoveRateLimiter/sessionUserMoveRateLimiter quota behavior
  - [x] Level-1 anomaly detector rule tests
  - [x] snapshot serialization integrity
- [ ] Integration tests:
  - [ ] concurrent move submissions and duplicate handling
  - [ ] reconnect flow does not break session authority
  - [ ] audit log presence for accepted/rejected events
- [ ] Load tests (targeted):
  - [ ] moves/sec flood to verify rate limits & backpressure work
  - [ ] presence flood to verify debounce + quotas
- [x] Run verification:
- [x] tsc --noEmit
- [x] vitest (React Query “No QueryClient set” fixed via global test harness)
  - [ ] server smoke tests: WS move flow + reconnect + RTC signaling + presence

## 9) Final Deliverables
- [ ] CIS-style Security Report (Control → Implementation → Evidence)
- [ ] Evidence pack:
  - [ ] code references/paths
  - [ ] metrics/alerts evidence
  - [ ] sample structured audit log records (redacted)
  - [ ] snapshot/replay verification results
- [ ] Confirm “operational readiness” checklist is satisfied
