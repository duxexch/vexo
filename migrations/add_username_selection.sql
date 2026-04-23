-- Add username_selected_at column to track when user explicitly chose their username.
-- NULL means user has not yet selected a permanent username (e.g. one-click registration placeholder).
-- Existing users are backfilled with NOW() so they are not blocked.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username_selected_at timestamp;

UPDATE users
SET username_selected_at = NOW()
WHERE username_selected_at IS NULL
  AND username IS NOT NULL
  AND username NOT LIKE 'player_%';

-- For one-click users with placeholder usernames, leave username_selected_at NULL
-- so they will be prompted to choose a real username on next login.

CREATE INDEX IF NOT EXISTS idx_users_username_selected_at
  ON users (username_selected_at)
  WHERE username_selected_at IS NULL;
