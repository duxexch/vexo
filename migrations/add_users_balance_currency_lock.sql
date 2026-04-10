ALTER TABLE users
  ADD COLUMN IF NOT EXISTS balance_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS balance_currency_locked_at timestamp;

UPDATE users
SET balance_currency = 'USD'
WHERE balance_currency IS NULL;
