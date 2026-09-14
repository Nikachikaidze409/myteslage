CREATE TABLE public.route_api_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  purpose TEXT NOT NULL,
  fingerprint_hash TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  google_called BOOLEAN NOT NULL DEFAULT false,
  google_status INTEGER,
  duration_ms INTEGER
);

GRANT SELECT ON public.route_api_events TO authenticated;
GRANT ALL ON public.route_api_events TO service_role;
ALTER TABLE public.route_api_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read route api events"
  ON public.route_api_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX route_api_events_created_at_idx ON public.route_api_events (created_at DESC);
CREATE INDEX route_api_events_user_created_idx ON public.route_api_events (user_id, created_at DESC);
CREATE INDEX route_api_events_google_idx ON public.route_api_events (user_id, google_called, created_at DESC);

CREATE TABLE public.route_api_claims (
  user_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose, fingerprint_hash)
);

GRANT ALL ON public.route_api_claims TO service_role;
ALTER TABLE public.route_api_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.route_guard_claim(
  _user_id UUID,
  _purpose TEXT,
  _fingerprint_hash TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dup_window INTERVAL;
  n_google INTEGER;
  n_purpose INTEGER;
  last_traffic TIMESTAMPTZ;
BEGIN
  IF _purpose NOT IN ('user', 'reroute', 'traffic') THEN
    RETURN jsonb_build_object('decision', 'blocked', 'reason', 'invalid_purpose', 'retryAfterMs', 0);
  END IF;

  SELECT count(*) INTO n_google FROM public.route_api_events
   WHERE user_id = _user_id AND google_called AND created_at > now() - interval '1 hour';
  IF n_google >= 80 THEN
    RETURN jsonb_build_object('decision', 'blocked', 'reason', 'hourly_google_limit', 'retryAfterMs', 300000);
  END IF;

  SELECT count(*) INTO n_purpose FROM public.route_api_events
   WHERE user_id = _user_id AND purpose = _purpose AND google_called
     AND created_at > now() - (CASE _purpose
           WHEN 'user' THEN interval '5 minutes'
           WHEN 'reroute' THEN interval '10 minutes'
           ELSE interval '1 hour' END);

  IF (_purpose = 'user' AND n_purpose >= 12) THEN
    RETURN jsonb_build_object('decision', 'blocked', 'reason', 'user_rate_limit', 'retryAfterMs', 60000);
  ELSIF (_purpose = 'reroute' AND n_purpose >= 20) THEN
    RETURN jsonb_build_object('decision', 'blocked', 'reason', 'reroute_rate_limit', 'retryAfterMs', 60000);
  ELSIF (_purpose = 'traffic' AND n_purpose >= 15) THEN
    RETURN jsonb_build_object('decision', 'blocked', 'reason', 'traffic_rate_limit', 'retryAfterMs', 300000);
  END IF;

  IF _purpose = 'traffic' THEN
    SELECT max(created_at) INTO last_traffic FROM public.route_api_events
     WHERE user_id = _user_id AND purpose = 'traffic' AND google_called
       AND created_at > now() - interval '240 seconds';
    IF last_traffic IS NOT NULL THEN
      RETURN jsonb_build_object(
        'decision', 'blocked', 'reason', 'traffic_min_interval',
        'retryAfterMs', GREATEST(0, 240000 - (EXTRACT(EPOCH FROM (now() - last_traffic)) * 1000)::INTEGER));
    END IF;
  END IF;

  dup_window := CASE _purpose
    WHEN 'user' THEN interval '15 seconds'
    WHEN 'reroute' THEN interval '5 seconds'
    ELSE interval '240 seconds' END;

  INSERT INTO public.route_api_claims (user_id, purpose, fingerprint_hash, claimed_at)
  VALUES (_user_id, _purpose, _fingerprint_hash, now())
  ON CONFLICT (user_id, purpose, fingerprint_hash) DO UPDATE
    SET claimed_at = now()
    WHERE public.route_api_claims.claimed_at < now() - dup_window;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('decision', 'duplicate', 'reason', 'duplicate_fingerprint',
      'retryAfterMs', (EXTRACT(EPOCH FROM dup_window) * 1000)::INTEGER);
  END IF;

  RETURN jsonb_build_object('decision', 'allowed', 'reason', 'ok', 'retryAfterMs', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.route_guard_claim(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_guard_claim(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_route_api_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (DELETE FROM public.route_api_events WHERE created_at < now() - interval '7 days')
  DELETE FROM public.route_api_claims WHERE claimed_at < now() - interval '1 hour';
$$;

REVOKE ALL ON FUNCTION public.cleanup_route_api_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_route_api_events() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-route-api-events');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-route-api-events', '17 * * * *', 'SELECT public.cleanup_route_api_events();');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;