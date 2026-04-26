-- Task #148: dedicated moderation queue for spectator-style user reports.
-- Replaces the old behaviour where the spectator "Report" action silently
-- re-used POST /api/users/:userId/block, so moderators never saw the report.

DO $$ BEGIN
  CREATE TYPE user_report_context AS ENUM ('spectator', 'chat', 'profile', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_report_reason AS ENUM ('spam', 'harassment', 'cheating', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_report_status AS ENUM ('pending', 'reviewed', 'actioned', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_reports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id varchar NOT NULL REFERENCES users(id),
  reported_user_id varchar NOT NULL REFERENCES users(id),
  context user_report_context NOT NULL DEFAULT 'other',
  reason user_report_reason,
  details text,
  status user_report_status NOT NULL DEFAULT 'pending',
  reviewed_by varchar REFERENCES users(id),
  reviewed_at timestamp,
  review_notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_created_at ON user_reports(created_at);

-- Closes the race window the app-level check-then-insert dedupe in
-- POST /api/users/:userId/report can't cover: at most one pending report per
-- (reporter, reported) pair. Past reports in any other status don't block a
-- fresh report, since the previous one has already been triaged.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_reports_unique_pending
  ON user_reports(reporter_id, reported_user_id)
  WHERE status = 'pending';
