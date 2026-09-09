ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS base_amount numeric,
  ADD COLUMN IF NOT EXISTS credit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount numeric,
  ADD COLUMN IF NOT EXISTS upgrade_from_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_reason text;

UPDATE public.payment_orders
  SET base_amount = COALESCE(base_amount, amount),
      final_amount = COALESCE(final_amount, amount),
      pricing_reason = COALESCE(pricing_reason, 'standard');

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_one_pending_per_plan
  ON public.payment_orders (user_id, provider, plan)
  WHERE status = 'pending';