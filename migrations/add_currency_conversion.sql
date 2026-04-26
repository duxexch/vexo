-- Task #104: Multi-currency wallet conversion ----------------------------------
-- Adds the 'currency_conversion' value to the transaction_type enum so the
-- audit-trail rows produced by POST /api/wallet/convert have a dedicated type
-- (and admin transaction filters can pick them out without scanning the
-- description column).
--
-- Adds users.currency_conversion_disabled as a per-user kill switch. The
-- global toggle lives in app_settings under the key
-- 'wallet_conversion.enabled' (default "true"); the optional spread/fee lives
-- under 'wallet_conversion.fee_pct' (default "0").
--
-- All operations are guarded so this migration is safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'transaction_type' AND e.enumlabel = 'currency_conversion'
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'currency_conversion';
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS currency_conversion_disabled boolean NOT NULL DEFAULT false;
