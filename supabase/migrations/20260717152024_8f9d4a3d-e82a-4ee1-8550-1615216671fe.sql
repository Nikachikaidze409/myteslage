
-- access_codes: explicit deny-all for anon/authenticated; service_role bypasses RLS.
REVOKE ALL ON public.access_codes FROM anon, authenticated;
GRANT ALL ON public.access_codes TO service_role;

DROP POLICY IF EXISTS "No client access to access_codes" ON public.access_codes;
CREATE POLICY "No client access to access_codes"
  ON public.access_codes
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- profiles: add INSERT policy scoped to the authenticated user's own id.
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
