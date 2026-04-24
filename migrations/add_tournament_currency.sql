-- Add `currency` to tournaments so admins can pick USD (cash balance) or
-- "project" (VXC / project currency) when creating a tournament.
-- Mirrors the challenges currency_type pattern (see shared/schema.ts).

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';

-- Backfill any rows that may already exist with a NULL value to the safe
-- default before the NOT NULL constraint takes effect on legacy installs.
UPDATE tournaments
SET currency = 'usd'
WHERE currency IS NULL;
