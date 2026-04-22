# Real-Time State Canonicalization ADR

## ADR Metadata
- ADR ID: ADR-RT-STATE-001
- Date: 2026-04-22
- Status: Proposed
- Owner: Backend Platform
- Decision Type: Architecture and Data Consistency

## Decision Statement
Adopt a single authoritative state source per game session, with all gameplay mutations routed through one ordered command pipeline. Treat all other session stores as projections only.

Design invariant:
There must be exactly one truth source per session, and everything else is a projection.

## Context
The current architecture contains dual session representations for challenge gameplay:
- challenge_game_sessions
- live_game_sessions

This creates a divergence risk under concurrent conditions such as:
- player move and reconnect overlap
- timeout auto-move and player move overlap
- scheduler-based mutations racing with websocket-based mutations

The system already has strong foundations:
- engine-level rule validation and deterministic apply
- database transactions with row locks
- websocket rate limiting and suspicious attempt tracking

The main risk is not engine correctness. The main risk is cross-store state drift and mutation ordering under load.

## Scope
In scope:
- Session state authority for challenge and live gameplay
- Move ordering and stale-move rejection
- Idempotency enforcement for move-like commands
- Timeout and system action unification through the same move pipeline
- Reconciliation and drift detection guardrails

Out of scope:
- Frontend UI redesign
- Game rule changes in engines
- Currency and payout policy changes

## Canonical Source Decision
Canonical table:
- live_game_sessions

Projection table:
- challenge_game_sessions becomes a read projection for compatibility and gradual migration.

Rationale:
- Existing move history already references live sessions via game_moves.
- Existing live websocket move flow already performs strong transactional updates.
- This minimizes net-new domain concepts while removing dual-write ambiguity.

## Architectural Decisions

### D1. Single Mutation Pipeline
All state-changing actions must flow through one command processor:
- player move
- timeout auto action
- disconnect/abandon auto action
- bot move

No direct state mutation is allowed outside this processor.

### D2. Monotonic Session Revision
Each canonical session has a monotonic revision number.
- Every accepted command increments revision by exactly 1.
- Any command with stale expectedRevision is rejected.

### D3. Idempotency Keys
Each command carries eventId and actor metadata.
- Duplicate eventId for same session is ignored or rejected deterministically.
- Replays are safe and side-effect free.

### D4. Timeout as First-Class Command Event
Timeout does not mutate state directly.
It emits a command event with the same envelope as player moves, then passes through the same validation, ordering, and apply pipeline.

### D5. Projection-Only Secondary State
challenge_game_sessions is written only by projection sync from canonical state.
No endpoint or scheduler is allowed to mutate projection as a source of truth.

### D6. Reconciliation Guard
A continuous guard compares canonical state and projection snapshots.
Any mismatch triggers automated repair flow and telemetry.

## Data Model Changes

### Canonical Session Enhancements
Apply to live_game_sessions:
- revision BIGINT NOT NULL DEFAULT 0
- last_event_id VARCHAR(128) NULL
- last_event_at TIMESTAMP NULL

### Event Log Table
Create game_session_events:
- id UUID PK
- session_id VARCHAR NOT NULL
- event_id VARCHAR(128) NOT NULL
- actor_id VARCHAR(128) NOT NULL
- actor_type VARCHAR(32) NOT NULL
- cause VARCHAR(64) NOT NULL
- expected_revision BIGINT NOT NULL
- accepted_revision BIGINT NULL
- event_type VARCHAR(64) NOT NULL
- payload JSONB NOT NULL
- status VARCHAR(32) NOT NULL
- error_code VARCHAR(64) NULL
- created_at TIMESTAMP NOT NULL DEFAULT NOW()
- applied_at TIMESTAMP NULL

Indexes and constraints:
- UNIQUE(session_id, event_id)
- INDEX(session_id, created_at)
- INDEX(session_id, accepted_revision)

### Projection Metadata
Apply to challenge_game_sessions:
- source_session_id VARCHAR NULL
- projected_revision BIGINT NOT NULL DEFAULT 0
- projection_updated_at TIMESTAMP NULL

## Command Envelope Contract
Required fields for all move-like commands:
- eventId
- sessionId
- actorId
- actorType (player, system, bot)
- cause (player_move, timeout, disconnect_auto, bot_auto)
- expectedRevision
- commandType
- commandPayload
- occurredAt

## Migration Plan

### Phase 0: Safety Instrumentation
Goal: Visibility before behavior changes.

Steps:
1. Add drift metrics and logs comparing canonical and projection revisions.
2. Add eventId plumbing in websocket and scheduler inputs.
3. Add feature flags for each migration phase.

Done criteria:
- Drift rate baseline is measurable.
- Event IDs appear in move logs for all command sources.

### Phase 1: Canonical Write Ownership
Goal: Remove dual-write ambiguity.

Steps:
1. Add revision fields to live_game_sessions.
2. Route challenge move handler writes to canonical table only.
3. Write challenge_game_sessions only through projection sync.
4. Add lint and runtime guards to block direct projection writes.

Done criteria:
- 100 percent of session mutations occur in canonical path.
- Projection updates are traceable to canonical revision.

### Phase 2: Ordering Gate and Stale Rejection
Goal: Enforce strict ordering under concurrency.

Steps:
1. Require expectedRevision on all move commands.
2. Update canonical state atomically with WHERE revision = expectedRevision.
3. Return deterministic stale response for mismatched revisions.

Done criteria:
- No out-of-order accepted moves.
- Stale move rejection metrics are visible and stable.

### Phase 3: Idempotency Enforcement
Goal: Make retries and reconnect resends safe.

Steps:
1. Persist command event records in game_session_events.
2. Enforce UNIQUE(session_id, event_id).
3. Return replay-safe response for duplicate event IDs.

Done criteria:
- Duplicate move effects are zero.
- Reconnect replay paths are deterministic.

### Phase 4: Timeout and System Event Unification
Goal: Eliminate bypass mutations.

Steps:
1. Replace direct timeout state writes with timeout command events.
2. Process timeout events through the same command processor.
3. Ensure timeout events include identical envelope metadata.

Done criteria:
- Timeout actions obey the same ordering and idempotency rules as player actions.

### Phase 5: Reconciliation and Repair
Goal: Detect and heal silent drift.

Steps:
1. Add reconciliation worker that compares canonical state hash to projection hash.
2. Trigger soft repair for mismatches.
3. Trigger hard freeze plus alert on repeated mismatch threshold.

Done criteria:
- Drift incidents are auto-detected and repaired.
- Repeat mismatch rate trends toward zero.

### Phase 6: Scale Optimization
Goal: Reduce scheduler bottlenecks.

Steps:
1. Move from global polling loops to per-session lightweight timers where possible.
2. Shard watchdog processing by game type or session shard key.
3. Preserve single command processor semantics.

Done criteria:
- Lower scheduler CPU utilization at high concurrency.
- No regression in timeout accuracy.

## Feature Flags
- GAME_CANONICAL_STATE_ENABLED
- GAME_ORDERING_GATE_ENABLED
- GAME_IDEMPOTENCY_ENABLED
- GAME_MOVE_IDEMPOTENCY_STRICT
- GAME_EVENT_LOG_ENABLED
- GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL
- GAME_REPLAY_SHADOW_ENABLED
- GAME_REPLAY_SESSION_SHADOW_ENABLED
- GAME_REPLAY_SESSION_SHADOW_EVERY_N_TURNS
- GAME_REPLAY_READ_SHADOW_ENABLED
- GAME_TIMEOUT_EVENT_PIPELINE_ENABLED
- GAME_PROJECTION_RECONCILIATION_ENABLED

Phase 0 runtime defaults:
1. GAME_EVENT_LOG_ENABLED=true keeps append-only event logging active.
2. GAME_MOVE_IDEMPOTENCY_STRICT=true rejects duplicate move requests that reuse a provided idempotency key.
3. GAME_EVENT_APPEND_FAIL_CLOSED_CANONICAL=true rejects CANONICAL-session moves when event append fails.
4. GAME_REPLAY_SHADOW_ENABLED=true runs replay-shadow parity checks for CANONICAL sessions.
5. GAME_REPLAY_SESSION_SHADOW_ENABLED=false by default; enable to replay full canonical challenge timelines.
6. GAME_REPLAY_SESSION_SHADOW_EVERY_N_TURNS=5 throttles full-session replay frequency.
7. GAME_REPLAY_READ_SHADOW_ENABLED=false keeps engine-committed state as the read source.
8. Setting GAME_REPLAY_READ_SHADOW_ENABLED=true makes replayed timeline state the primary read source for challenge broadcasts, with automatic fallback to committed engine state if replay drifts or fails.
9. When GAME_REPLAY_READ_SHADOW_ENABLED=true, full-session replay runs continuously (every canonical turn) instead of every N turns.
10. Setting any of these flags to false gives an immediate rollback lever during dual-write incidents.

## Rollback Strategy
- Keep projection readers backward-compatible during rollout.
- If severe regression occurs:
  1. Disable ordering gate flag.
  2. Disable timeout event pipeline flag.
  3. Continue canonical writes and projection sync while investigating.
- Do not re-enable direct projection writes except emergency hotfix with explicit incident approval.

## Operational Metrics
Track at minimum:
- command_accept_rate
- stale_reject_rate
- duplicate_event_rate
- timeout_event_success_rate
- canonical_projection_revision_gap
- reconciliation_repairs_count
- payout_after_move_consistency_failures

## Test Strategy

### Concurrency Tests
- simultaneous player moves same revision
- player move vs timeout same revision
- reconnect resend same eventId

### Correctness Tests
- deterministic final state with event replay
- projection parity from canonical replay
- stale command rejection behavior

### Chaos Tests
- injected DB retry failures during apply
- scheduler delay and websocket burst overlap
- partial projection writer failures

## Risks and Mitigations
- Risk: Latency increase due to stricter pipeline.
  - Mitigation: Keep payload slim, add targeted indexes, optimize transaction scope.

- Risk: Migration complexity across two websocket domains.
  - Mitigation: Phase flags and domain-by-domain cutover.

- Risk: Hidden callers mutating projection directly.
  - Mitigation: Static search gate plus runtime guard and audit logs.

## Acceptance Criteria for ADR Completion
1. Exactly one write-authoritative state source is enforced for all session mutations.
2. All command sources share the same envelope and ordering gate.
3. Idempotency guarantees prevent duplicate state transitions.
4. Reconciliation detects and repairs drift automatically.
5. Production metrics confirm lower inconsistency and retry anomalies.

## Implementation Notes for Existing Code Paths
Primary migration targets include:
- websocket challenge move handler
- websocket live move handler
- timeout schedulers and disconnect timers
- payout trigger boundaries after terminal game status

Cutover should prioritize move pipeline unification before scheduler sharding.
