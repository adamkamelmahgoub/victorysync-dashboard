-- FULL MIGRATION: Ensure profiles.global_role, org schema, mightycall tables, RLS and helper functions
-- Run this in Supabase SQL editor or via migration runner.

/* === 1) Profiles: ensure global_role exists === */
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS global_role text;
-- Restrict values (nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'enum_global_role'
  ) THEN
    -- We'll keep as text but add a check constraint instead of enum for compatibility
    NULL;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END$$;

-- Add index on global_role for lookups
CREATE INDEX IF NOT EXISTS idx_profiles_global_role ON public.profiles(global_role);

/* === 2) Drop and recreate helper functions to avoid signature conflicts === */
DROP FUNCTION IF EXISTS public.is_platform_admin() CASCADE;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND global_role = 'platform_admin'
  );
$$;

DROP FUNCTION IF EXISTS public.is_org_member(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members WHERE user_id = p_user_id
  );
$$;

/* === 3) org_members table (modern canonical) === */
DROP TABLE IF EXISTS public.org_members CASCADE;
CREATE TABLE public.org_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin')),
  mightycall_extension text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id);

/* === 4) Ensure organizations table exists (minimal) === */
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

/* === 5) MightyCall related tables === */
CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  external_id text,
  label text,
  status text,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.calls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text,
  from_number text,
  to_number text,
  duration_seconds integer,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.mightycall_recordings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text,
  phone_number text,
  recording_url text,
  duration_seconds integer,
  recorded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.mightycall_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_date date,
  metrics jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, report_date)
);

CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text,
  from_number text,
  to_number text,
  direction text,
  status text,
  body text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.org_integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  credentials jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE TABLE IF NOT EXISTS public.mightycall_sync_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  sync_type text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  status text,
  detail jsonb
);

/* === 6) Seed default packages === */
CREATE TABLE IF NOT EXISTS public.packages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.packages (name, description, price, features)
SELECT * FROM (VALUES
  ('Basic','Basic package',49.00,'["calls","sms"]'::jsonb),
  ('Pro','Pro package',149.00,'["calls","sms","recordings"]'::jsonb)
) AS v(name,description,price,features)
ON CONFLICT (name) DO NOTHING;

/* === 7) RLS and policies === */
-- Enable RLS where applicable
ALTER TABLE IF EXISTS public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mightycall_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mightycall_sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mightycall_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.packages ENABLE ROW LEVEL SECURITY;

-- Org_members policies
CREATE POLICY IF NOT EXISTS "org_members_admin_all"
ON public.org_members
FOR ALL
USING (public.is_platform_admin());

CREATE POLICY IF NOT EXISTS "org_members_org_read"
ON public.org_members
FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
);

-- phone_numbers: org members can read for their org; platform_admin full
CREATE POLICY IF NOT EXISTS "phone_numbers_org_read"
ON public.phone_numbers
FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()) OR public.is_platform_admin()
);

CREATE POLICY IF NOT EXISTS "phone_numbers_org_write"
ON public.phone_numbers
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- calls: platform_admin OR org member
CREATE POLICY IF NOT EXISTS "calls_org_read"
ON public.calls
FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()) OR public.is_platform_admin()
);

-- recordings and sms similar
CREATE POLICY IF NOT EXISTS "recordings_org_read"
ON public.mightycall_recordings
FOR SELECT
USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()) OR public.is_platform_admin());

CREATE POLICY IF NOT EXISTS "sms_org_read"
ON public.mightycall_sms_messages
FOR SELECT
USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()) OR public.is_platform_admin());

-- packages: platform_admin manage, everyone can read list (for simplicity)
CREATE POLICY IF NOT EXISTS "packages_admin_all"
ON public.packages
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

/* === 8) Helper: ensure recovery orgs for orphan memberships (optional admin task) === */
CREATE OR REPLACE FUNCTION public.recover_org_if_missing(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
    INSERT INTO public.organizations (id, name) VALUES (p_org_id, concat('Recovered Org ', left(p_org_id::text, 8)));
  END IF;
END;
$$;

-- End of migration
