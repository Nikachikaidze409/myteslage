CREATE TABLE public.pair_sessions (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '12 hours'
);
CREATE INDEX pair_sessions_user_id_idx ON public.pair_sessions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pair_sessions TO authenticated;
GRANT ALL ON public.pair_sessions TO service_role;
ALTER TABLE public.pair_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own pairing sessions" ON public.pair_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);