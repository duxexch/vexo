CREATE TABLE IF NOT EXISTS game_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  idempotency_key text NOT NULL,
  session_id varchar REFERENCES live_game_sessions(id),
  challenge_id varchar REFERENCES challenges(id),
  challenge_session_id varchar REFERENCES challenge_game_sessions(id),
  source text NOT NULL,
  event_type text NOT NULL,
  actor_id varchar NOT NULL REFERENCES users(id),
  actor_type text NOT NULL DEFAULT 'player',
  move_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'recorded',
  error_code text,
  created_at timestamp NOT NULL DEFAULT now(),
  applied_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_events_idempotency_key
  ON game_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_game_events_event_id
  ON game_events(event_id);

CREATE INDEX IF NOT EXISTS idx_game_events_session_created
  ON game_events(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_game_events_challenge_created
  ON game_events(challenge_id, created_at);

DO $$
BEGIN
  CREATE TYPE game_state_mode AS ENUM ('LEGACY', 'CANONICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE challenge_game_sessions
  ADD COLUMN IF NOT EXISTS state_mode game_state_mode NOT NULL DEFAULT 'LEGACY';

ALTER TABLE live_game_sessions
  ADD COLUMN IF NOT EXISTS state_mode game_state_mode NOT NULL DEFAULT 'LEGACY';
