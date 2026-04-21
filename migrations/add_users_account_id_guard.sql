-- Migration: Ensure users.account_id exists for one-click auth/login flows
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_id VARCHAR;

-- Maintain expected uniqueness for account login IDs when present.
CREATE UNIQUE INDEX IF NOT EXISTS users_account_id_unique_idx
  ON users (account_id)
  WHERE account_id IS NOT NULL;
