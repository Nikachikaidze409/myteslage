-- Profiles table (1 per auth user) with device binding
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  active_device_id text,
  active_device_label text,
  active_device_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Access codes for membership signup
CREATE TABLE public.access_codes (
  code text PRIMARY KEY,
  note text,
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.access_codes TO authenticated;
GRANT ALL ON public.access_codes TO service_role;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: only service_role (admin server fns) touches this.

-- updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.tsl_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tsl_touch_updated_at();

-- Auto-create profile row on new auth user
CREATE OR REPLACE FUNCTION public.tsl_handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.tsl_handle_new_user();

-- Realtime for profiles so kicked devices sign out live
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Seed a starter access code so the owner can test signup
INSERT INTO public.access_codes (code, note) VALUES
  ('TESLA-GE-2026', 'starter code'),
  ('FOUNDER-01', 'founder')
ON CONFLICT (code) DO NOTHING;