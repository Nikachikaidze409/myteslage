CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_order_id text UNIQUE,
  external_order_id text UNIQUE,
  plan text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment orders"
  ON public.payment_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER payment_orders_touch
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.tsl_touch_updated_at();

CREATE INDEX payment_orders_user_idx ON public.payment_orders (user_id, created_at DESC);

-- Subscriptions: make provider-neutral, keep all Paddle data intact.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider_parent_order_id text,
  ADD COLUMN IF NOT EXISTS last_payment_order_id text;

ALTER TABLE public.subscriptions
  ALTER COLUMN paddle_subscription_id DROP NOT NULL,
  ALTER COLUMN paddle_customer_id DROP NOT NULL;

UPDATE public.subscriptions
  SET provider = 'paddle',
      provider_subscription_id = COALESCE(provider_subscription_id, paddle_subscription_id)
  WHERE provider_subscription_id IS NULL OR provider IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_sub_idx
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;