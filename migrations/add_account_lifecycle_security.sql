-- Migration: Add account lifecycle safeguards (disable/delete/restore)

-- 1) Extend users table with lifecycle metadata
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_disabled_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_deletion_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_restored_at TIMESTAMP;

-- 2) Account recovery tokens for reactivation/restore flows
CREATE TABLE IF NOT EXISTS account_recovery_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('reactivate', 'restore_deleted')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_recovery_tokens_user_id ON account_recovery_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_account_recovery_tokens_purpose ON account_recovery_tokens(purpose);
CREATE INDEX IF NOT EXISTS idx_account_recovery_tokens_token_hash ON account_recovery_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_account_recovery_tokens_expires_at ON account_recovery_tokens(expires_at);
