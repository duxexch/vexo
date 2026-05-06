-- CIS snapshots for Game WS forensics / crash recovery / replay baselines
-- Creates a minimal append+unique snapshot table keyed by (session_id, ordering_index)

CREATE TABLE IF NOT EXISTS game_session_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id varchar NOT NULL REFERENCES live_game_sessions(id) ON DELETE CASCADE,
  ordering_index integer NOT NULL,
  state jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  correlation_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_session_snapshots_unique
  ON game_session_snapshots(session_id, ordering_index);

CREATE INDEX IF NOT EXISTS idx_game_session_snapshots_session_created
  ON game_session_snapshots(session_id, created_at);
