-- ============================================================
-- Migration 012: Lead list uploads + per-user upload permissions
-- Run this in your Supabase SQL editor (Database > SQL Editor)
-- ============================================================

-- 1. Add can_upload_leads flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_upload_leads BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add lead_list_upload_id FK reference column to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_list_upload_id UUID REFERENCES public.lead_list_uploads(id) ON DELETE SET NULL;

-- 3. Create lead_list_uploads batch tracking table
CREATE TABLE IF NOT EXISTS public.lead_list_uploads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_id   UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  row_count         INTEGER NOT NULL DEFAULT 0,
  inserted_count    INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','complete','partial','failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- Fix FK on leads → lead_list_uploads (add after table creation above)
-- If leads.lead_list_upload_id was added before lead_list_uploads existed, fix it:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'leads'
      AND constraint_name = 'leads_lead_list_upload_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_lead_list_upload_id_fkey
      FOREIGN KEY (lead_list_upload_id)
      REFERENCES public.lead_list_uploads(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_lead_list_uploads_org_id
  ON public.lead_list_uploads(organization_id);

CREATE INDEX IF NOT EXISTS idx_lead_list_uploads_uploaded_by
  ON public.lead_list_uploads(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_lead_list_uploads_created_at
  ON public.lead_list_uploads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_lead_list_upload_id
  ON public.leads(lead_list_upload_id);

-- 5. RLS policies for lead_list_uploads
ALTER TABLE public.lead_list_uploads ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access
CREATE POLICY IF NOT EXISTS "lead_list_uploads_admin_all"
  ON public.lead_list_uploads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND global_role IN ('platform_admin', 'admin', 'super_admin')
    )
  );

-- Org members: read own org's uploads
CREATE POLICY IF NOT EXISTS "lead_list_uploads_org_read"
  ON public.lead_list_uploads
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
  );

-- Users with can_upload_leads: insert into their own org
CREATE POLICY IF NOT EXISTS "lead_list_uploads_uploader_insert"
  ON public.lead_list_uploads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND can_upload_leads = TRUE
      )
      OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND global_role IN ('platform_admin', 'admin', 'super_admin')
      )
    )
  );

-- 6. Enable Realtime on agent_live_status for instant live-status updates
-- (Run in Supabase dashboard → Table Editor → agent_live_status → Enable Realtime)
-- Or via SQL:
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime CASCADE;
  -- recreate it (Supabase manages this, but ensure the table is included)
COMMIT;

-- Safe approach: just add to existing publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_live_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- 7. Ensure Google OAuth users get a profile row automatically via trigger
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, global_role, can_upload_leads, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NULL,
    FALSE,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users (runs whenever a new user signs up, including via Google OAuth)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- After running this migration:
-- 1. In Supabase Dashboard → Authentication → Providers → Google:
--    - Enable Google provider
--    - Add your Google OAuth Client ID and Secret
--    - Set Authorized redirect URI in Google Console to:
--      https://<your-supabase-project>.supabase.co/auth/v1/callback
-- 2. In Supabase Dashboard → Table Editor → agent_live_status:
--    - Enable Realtime replication for instant live status
-- ============================================================
