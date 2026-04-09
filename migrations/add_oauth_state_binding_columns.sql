ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS session_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS client_binding_hash TEXT;