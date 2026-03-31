-- Migration: Add registration_type column and backfill existing users
-- This enforces that login credentials only work on the tab they were registered from

-- Step 1: Add the column (nullable for backward compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_type TEXT;

-- Step 2: Backfill existing users based on their data patterns
-- One-click users: username = accountId, no phone, no email
UPDATE users SET registration_type = 'account'
WHERE registration_type IS NULL
  AND account_id IS NOT NULL
  AND username = account_id
  AND phone IS NULL
  AND email IS NULL;

-- Also catch one-click users where username = 'player_' + accountId (new pattern)
UPDATE users SET registration_type = 'account'
WHERE registration_type IS NULL
  AND account_id IS NOT NULL
  AND username LIKE 'player_%'
  AND phone IS NULL
  AND email IS NULL;

-- Phone-registered users: have phone, different username from accountId
UPDATE users SET registration_type = 'phone'
WHERE registration_type IS NULL
  AND phone IS NOT NULL
  AND (username != account_id OR account_id IS NULL);

-- Email-registered users: have email, different username from accountId
UPDATE users SET registration_type = 'email'
WHERE registration_type IS NULL
  AND email IS NOT NULL
  AND phone IS NULL
  AND (username != account_id OR account_id IS NULL);

-- Remaining users with just username (standard register)
UPDATE users SET registration_type = 'username'
WHERE registration_type IS NULL
  AND phone IS NULL
  AND email IS NULL
  AND (username != account_id OR account_id IS NULL);

-- Step 3: Fix one-click users who have username = accountId (the old bug)
-- Change their username to 'player_' + accountId to prevent email tab login
UPDATE users SET username = 'player_' || account_id
WHERE registration_type = 'account'
  AND username = account_id
  AND account_id IS NOT NULL;

-- Step 4: Any remaining null registrationType gets 'account' as default
UPDATE users SET registration_type = 'account'
WHERE registration_type IS NULL;

-- Verify migration
SELECT registration_type, COUNT(*) as count FROM users GROUP BY registration_type ORDER BY count DESC;
