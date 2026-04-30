CREATE TABLE IF NOT EXISTS user_billing (
  clerk_user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial', 'basic', 'pro')),
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  trial_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  current_period_end TIMESTAMPTZ,
  ai_usage_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  ai_usage_count INTEGER NOT NULL DEFAULT 0 CHECK (ai_usage_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_billing_stripe_customer_idx
  ON user_billing (stripe_customer_id);

CREATE INDEX IF NOT EXISTS user_billing_stripe_subscription_idx
  ON user_billing (stripe_subscription_id);

CREATE OR REPLACE FUNCTION set_user_billing_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_billing_updated_at_trigger ON user_billing;

CREATE TRIGGER user_billing_updated_at_trigger
BEFORE UPDATE ON user_billing
FOR EACH ROW
EXECUTE FUNCTION set_user_billing_updated_at();
