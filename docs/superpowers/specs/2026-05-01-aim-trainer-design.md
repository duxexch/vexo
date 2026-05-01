# Aim Trainer Professional Upgrade (Solo + 1v1)

## Summary
Build a server-authoritative Aim Trainer game that matches the professional challenge flow used by Chess/Domino, supports Solo and real-time 1v1, integrates with the existing challenge system, and uses admin-controlled financial rules aligned to the game model.

## Goals
- Deliver a professional, non-childish Aim Trainer experience consistent with Chess/Domino challenge flow.
- Support two modes using the same engine and UI shell:
  - Solo (timed run)
  - 1v1 real-time (shared target sequence)
- Use challenge terminology everywhere (no betting/"wager" language).
- Provide admin-controlled settings for duration, difficulty, and financial rules.
- Maintain mobile-first UX and cross-surface compatibility.

## Non-Goals
- Full server-side physics or complex anti-cheat beyond reasonable heuristics in V1.
- Reworking all other arcade games in this iteration.

## User Experience
- Uses the same challenge flow as Chess/Domino: create/join/watch, live status, end-of-match summary.
- Consistent HUD layout, responsive controls, and spectator-friendly panels.
- Touch-friendly interactions and safe-area handling for mobile and APK/AAB builds.

## Game Modes
### Solo
- Single player vs time.
- Same engine and UI shell as 1v1; no opponent state.

### 1v1 Real-Time
- Both players receive the same target sequence and synchronized start.
- Server verifies all hits/misses and computes final result.
- Spectators see both players' stats in real time.

## Core Rules
- Default round length: 30 seconds (admin configurable).
- Scoring: each hit = +1; misses reduce accuracy.
- Accuracy:
  - accuracy = hits / (hits + misses)
- Winner (1v1): highest hits, then higher accuracy, then faster last hit timestamp.

## Architecture
### Server
- Add a new game engine: aim_trainer.
- Engine responsible for:
  - match lifecycle (waiting -> countdown -> active -> finished)
  - target sequence generation
  - validation of clicks
  - scoring + winner resolution
- State is authoritative; clients are renderers.

### Client
- New React game UI that mirrors Chess/Domino structure and uses the existing game WebSocket hook.
- Shared layout shell with header, status, and end-of-game summary.
- No hardcoded UI text; use i18n keys and update all locale resources.

## Server State Model (High Level)
- phase: waiting | countdown | active | finished
- roundDurationMs
- remainingMs
- targetSequence: array of targets { id, x, y, radius, spawnAt, expireAt }
- currentTargetId
- players:
  - hits, misses, accuracy, lastHitAt
- lastEventAt

## Target Generation
- Server generates sequence per match.
- 1v1: same sequence for both players.
- Difficulty ramp by shrinking target size or reducing time-to-expire over time.

## Validation and Anti-Cheat (V1)
- Reject clicks not matching active target id.
- Reject clicks outside radius.
- Rate limit clicks per second.
- Reject scores that exceed a plausible ceiling.

## Challenge + Spectator Flow
- Reuse existing challenge session flow in WebSocket game system.
- Spectators get live stats for both players and can view round timeline.
- End summary shows hits, accuracy, and winner resolution.

## Financial Rules
- All text uses "challenge" naming.
- Solo:
  - Can be free or low entry cost based on admin setting.
  - Optional reward based on performance within cap.
- 1v1:
  - Both players pay the same entry cost.
  - Payout and fee logic controlled by admin settings.

## Admin Settings (Aim Trainer)
- Enabled/disabled
- Round duration
- Target radius range
- Difficulty ramp (speed/size)
- Solo entry cost
- 1v1 entry cost
- Fee percentage
- Max payout
- Rewards on/off

## Data and Persistence
- Persist match results in the existing challenge system.
- Optional transitional write to arcade sessions for legacy dashboards.

## Telemetry and Logging
- Log match start/end with basic stats for anomaly detection.
- Track invalid click rejections and rate-limit triggers.

## Testing
- Unit tests for target generation and validation.
- Integration tests for match lifecycle and winner resolution.
- Manual QA: desktop, mobile web, and Android WebView.

## Rollout Plan
- Behind a feature flag for Aim Trainer.
- Gradual enablement via admin settings.

## Risks
- Overly strict validation could reject legitimate fast players; thresholds must be tuned.
- Sync drift across clients; server timestamps must be authoritative.
