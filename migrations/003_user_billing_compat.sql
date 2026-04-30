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

ALTER TABLE user_billing
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_usage_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  ADD COLUMN IF NOT EXISTS ai_usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE user_billing
SET plan = 'trial'
WHERE plan IS NULL OR plan NOT IN ('trial', 'basic', 'pro');

UPDATE user_billing
SET subscription_status = 'trialing'
WHERE subscription_status IS NULL;

UPDATE user_billing
SET trial_started_at = now()
WHERE trial_started_at IS NULL;

UPDATE user_billing
SET trial_ends_at = trial_started_at + INTERVAL '7 days'
WHERE trial_ends_at IS NULL;

UPDATE user_billing
SET ai_usage_date = ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
WHERE ai_usage_date IS NULL;

UPDATE user_billing
SET ai_usage_count = 0
WHERE ai_usage_count IS NULL OR ai_usage_count < 0;

ALTER TABLE user_billing
  ALTER COLUMN plan SET DEFAULT 'trial',
  ALTER COLUMN subscription_status SET DEFAULT 'trialing',
  ALTER COLUMN trial_started_at SET DEFAULT now(),
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + INTERVAL '7 days'),
  ALTER COLUMN ai_usage_date SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  ALTER COLUMN ai_usage_count SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN plan SET NOT NULL,
  ALTER COLUMN subscription_status SET NOT NULL,
  ALTER COLUMN trial_started_at SET NOT NULL,
  ALTER COLUMN trial_ends_at SET NOT NULL,
  ALTER COLUMN ai_usage_date SET NOT NULL,
  ALTER COLUMN ai_usage_count SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_billing_plan_check'
      AND conrelid = 'user_billing'::regclass
  ) THEN
    ALTER TABLE user_billing
      ADD CONSTRAINT user_billing_plan_check
      CHECK (plan IN ('trial', 'basic', 'pro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_billing_ai_usage_count_check'
      AND conrelid = 'user_billing'::regclass
  ) THEN
    ALTER TABLE user_billing
      ADD CONSTRAINT user_billing_ai_usage_count_check
      CHECK (ai_usage_count >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_billing_stripe_customer_idx
  ON user_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_billing_stripe_subscription_idx
  ON user_billing (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

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

DO $$
DECLARE
  user_id_expr TEXT;
  plan_expr TEXT;
  status_expr TEXT;
  stripe_customer_expr TEXT;
  stripe_subscription_expr TEXT;
  current_period_end_expr TEXT;
  created_expr TEXT;
BEGIN
  IF to_regclass('public.user_subscriptions') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'clerk_user_id'
  ) THEN
    user_id_expr := 'clerk_user_id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'user_id'
  ) THEN
    user_id_expr := 'user_id';
  ELSE
    RETURN;
  END IF;

  plan_expr := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'plan'
    ) THEN 'CASE WHEN plan::text IN (''trial'', ''basic'', ''pro'') THEN plan::text ELSE ''trial'' END'
    ELSE '''trial'''
  END;

  status_expr := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'subscription_status'
    ) THEN 'COALESCE(subscription_status::text, ''trialing'')'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'status'
    ) THEN 'COALESCE(status::text, ''trialing'')'
    ELSE '''trialing'''
  END;

  stripe_customer_expr := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'stripe_customer_id'
    ) THEN 'stripe_customer_id'
    ELSE 'NULL'
  END;

  stripe_subscription_expr := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'stripe_subscription_id'
    ) THEN 'stripe_subscription_id'
    ELSE 'NULL'
  END;

  current_period_end_expr := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'current_period_end'
    ) THEN 'current_period_end'
    ELSE 'NULL'
  END;

  created_expr := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'created_at'
    ) THEN 'COALESCE(created_at, now())'
    ELSE 'now()'
  END;

  EXECUTE format(
    'INSERT INTO user_billing (
      clerk_user_id,
      stripe_customer_id,
      stripe_subscription_id,
      plan,
      subscription_status,
      trial_started_at,
      trial_ends_at,
      current_period_end,
      ai_usage_date,
      ai_usage_count
    )
    SELECT
      %1$s::text,
      %2$s,
      %3$s,
      %4$s,
      %5$s,
      %6$s,
      %6$s + INTERVAL ''7 days'',
      %7$s,
      ((now() AT TIME ZONE ''America/Sao_Paulo'')::date),
      0
    FROM user_subscriptions
    WHERE %1$s IS NOT NULL
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, user_billing.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, user_billing.stripe_subscription_id),
      plan = COALESCE(EXCLUDED.plan, user_billing.plan),
      subscription_status = COALESCE(EXCLUDED.subscription_status, user_billing.subscription_status),
      current_period_end = COALESCE(EXCLUDED.current_period_end, user_billing.current_period_end)',
    user_id_expr,
    stripe_customer_expr,
    stripe_subscription_expr,
    plan_expr,
    status_expr,
    created_expr,
    current_period_end_expr
  );
END;
$$;
