SELECT cron.unschedule('bog-process-renewals')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bog-process-renewals');

SELECT cron.schedule(
  'bog-process-renewals',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tmap.ge/api/public/payments/bog/process-renewals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT token FROM public.cron_tokens WHERE name = 'bog_renewals')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);