CREATE TABLE IF NOT EXISTS public.cron_tokens (
  name text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_tokens TO service_role;

ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to cron tokens"
  ON public.cron_tokens AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

INSERT INTO public.cron_tokens (name) VALUES ('bog_renewals')
  ON CONFLICT (name) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('bog-process-renewals')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bog-process-renewals');

SELECT cron.schedule(
  'bog-process-renewals',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://teslanavi.online/api/public/payments/bog/process-renewals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT token FROM public.cron_tokens WHERE name = 'bog_renewals')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);