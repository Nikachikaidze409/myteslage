CREATE POLICY "Admins can read route api claims"
  ON public.route_api_claims FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.route_api_claims TO authenticated;