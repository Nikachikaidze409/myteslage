ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS renewal_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_renewal_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_lock_until timestamptz;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_renewal_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_renewal_status_check
  CHECK (renewal_status IN ('idle','pending','past_due','failed','canceled'));

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_order_id text,
  ADD COLUMN IF NOT EXISTS billing_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_no integer NOT NULL DEFAULT 0;

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_kind_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_kind_check CHECK (kind IN ('initial','renewal'));

-- One live renewal charge per membership per billing period.
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_one_live_renewal_per_period
  ON public.payment_orders (subscription_id, billing_period_end)
  WHERE kind = 'renewal' AND status IN ('pending','completed');

CREATE INDEX IF NOT EXISTS subscriptions_due_renewals_idx
  ON public.subscriptions (next_billing_at)
  WHERE auto_renew = true;