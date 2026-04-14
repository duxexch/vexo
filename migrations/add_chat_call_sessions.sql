-- Private chat call sessions with per-minute billing audit trail
CREATE TABLE IF NOT EXISTS chat_call_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id varchar NOT NULL REFERENCES users(id),
  receiver_id varchar NOT NULL REFERENCES users(id),
  call_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  started_at timestamp NOT NULL DEFAULT now(),
  connected_at timestamp,
  ended_at timestamp,
  ended_by varchar REFERENCES users(id),
  duration_seconds integer,
  billed_minutes integer NOT NULL DEFAULT 0,
  rate_per_minute decimal(15, 2) NOT NULL DEFAULT 0.00,
  total_charged decimal(15, 2) NOT NULL DEFAULT 0.00,
  charged_from_wallet_id varchar,
  ledger_entry_id varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_chat_call_type CHECK (call_type IN ('voice', 'video')),
  CONSTRAINT chk_chat_call_status CHECK (status IN ('active', 'ended', 'cancelled')),
  CONSTRAINT chk_chat_call_billed_minutes_non_negative CHECK (billed_minutes >= 0),
  CONSTRAINT chk_chat_call_total_charged_non_negative CHECK (total_charged >= 0),
  CONSTRAINT chat_call_sessions_wallet_fk FOREIGN KEY (charged_from_wallet_id) REFERENCES project_currency_wallets(id),
  CONSTRAINT chat_call_sessions_ledger_fk FOREIGN KEY (ledger_entry_id) REFERENCES project_currency_ledger(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_caller ON chat_call_sessions(caller_id);
CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_receiver ON chat_call_sessions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_status ON chat_call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_started_at ON chat_call_sessions(started_at);
