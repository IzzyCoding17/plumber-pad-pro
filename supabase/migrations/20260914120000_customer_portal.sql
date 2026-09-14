CREATE TABLE public.customer_profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.customer_profiles TO authenticated;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers manage their own profile" ON public.customer_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS requester_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jobs_requester_id_idx ON public.jobs(requester_id);
CREATE POLICY "Customers can read their own jobs" ON public.jobs
  FOR SELECT TO authenticated USING (auth.uid() = requester_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

CREATE POLICY "Customers can read payments for their jobs" ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = payments.job_id AND jobs.requester_id = auth.uid()));
CREATE POLICY "Customers can read messages for their jobs" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = messages.job_id AND jobs.requester_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz TEXT;
  v_slug TEXT;
  v_base TEXT;
  v_i INT := 0;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'account_type', 'worker') = 'customer' THEN
    INSERT INTO public.customer_profiles (id, full_name, phone, address)
    VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Customer'), NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'address');
    RETURN NEW;
  END IF;
  v_biz := COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Plumbing Co');
  v_base := trim(both '-' from lower(regexp_replace(v_biz, '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_base = '' THEN v_base := 'plumber'; END IF;
  v_slug := v_base;
  WHILE EXISTS(SELECT 1 FROM public.profiles WHERE slug = v_slug) LOOP
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i::text;
  END LOOP;
  INSERT INTO public.profiles (id, business_name, slug, phone)
  VALUES (NEW.id, v_biz, v_slug, NEW.raw_user_meta_data->>'phone');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.get_marketplace_plumbers()
RETURNS TABLE(id uuid, business_name text, slug text, phone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.business_name, p.slug, p.phone FROM public.profiles p ORDER BY p.business_name;
$$;

CREATE OR REPLACE FUNCTION public.submit_customer_request(
  p_plumber_id UUID, p_requester_id UUID, p_name TEXT, p_phone TEXT,
  p_address TEXT, p_description TEXT, p_urgency public.urgency
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer UUID; v_job UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_requester_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customer_profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'Customer account required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_plumber_id) THEN RAISE EXCEPTION 'Plumber not found'; END IF;
  INSERT INTO public.customers (plumber_id, name, phone, address)
  VALUES (p_plumber_id, p_name, p_phone, p_address)
  ON CONFLICT (plumber_id, phone) DO UPDATE SET name = EXCLUDED.name, address = COALESCE(EXCLUDED.address, public.customers.address), updated_at = now()
  RETURNING id INTO v_customer;
  UPDATE public.customers SET verification_status = (SELECT verification_status FROM public.customer_profiles WHERE id = auth.uid()) WHERE id = v_customer;
  INSERT INTO public.jobs (plumber_id, customer_id, requester_id, description, urgency)
  VALUES (p_plumber_id, v_customer, p_requester_id, p_description, p_urgency) RETURNING id INTO v_job;
  RETURN v_job;
END; $$;

CREATE OR REPLACE FUNCTION public.get_customer_dashboard()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.customer_profiles WHERE id = v_user) THEN
    RAISE EXCEPTION 'Customer account required';
  END IF;
  RETURN jsonb_build_object(
    'profile', (SELECT to_jsonb(c) FROM public.customer_profiles c WHERE c.id = v_user),
    'jobs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', j.id, 'description', j.description, 'status', j.status,
      'urgency', j.urgency, 'scheduled_at', j.scheduled_at,
      'final_price_cents', j.final_price_cents, 'suggested_price_cents', j.suggested_price_cents,
      'created_at', j.created_at, 'plumber_id', j.plumber_id,
      'business_name', p.business_name, 'plumber_verified', p.verification_status
    ) ORDER BY j.created_at DESC) FROM public.jobs j JOIN public.profiles p ON p.id = j.plumber_id WHERE j.requester_id = v_user), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(pay) ORDER BY pay.created_at DESC) FROM public.payments pay JOIN public.jobs j ON j.id = pay.job_id WHERE j.requester_id = v_user), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'job_id', m.job_id, 'body', m.body, 'direction', m.direction, 'created_at', m.created_at,
      'business_name', p.business_name
    ) ORDER BY m.created_at ASC) FROM public.messages m JOIN public.jobs j ON j.id = m.job_id JOIN public.profiles p ON p.id = j.plumber_id WHERE j.requester_id = v_user), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.send_customer_message(p_job_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_message UUID; v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id AND requester_id = auth.uid();
  IF v_job.id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  INSERT INTO public.messages (plumber_id, customer_id, job_id, direction, body)
  VALUES (v_job.plumber_id, v_job.customer_id, v_job.id, 'inbound', p_body)
  RETURNING id INTO v_message;
  RETURN v_message;
END; $$;

REVOKE ALL ON FUNCTION public.get_marketplace_plumbers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_customer_request(UUID, UUID, TEXT, TEXT, TEXT, TEXT, public.urgency) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_plumbers() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_customer_request(UUID, UUID, TEXT, TEXT, TEXT, TEXT, public.urgency) TO authenticated;
REVOKE ALL ON FUNCTION public.get_customer_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_customer_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_customer_message(UUID, TEXT) TO authenticated;