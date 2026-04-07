CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  expiration_time timestamp,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_push_subscriptions_endpoint_unique
  ON web_push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id
  ON web_push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_active
  ON web_push_subscriptions (is_active);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_active
  ON web_push_subscriptions (user_id, is_active);
