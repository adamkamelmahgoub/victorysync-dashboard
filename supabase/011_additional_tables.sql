-- Additional tables for full VictorySync functionality
-- Run this after MASTER_MIGRATION.sql

-- ==========================================
-- INTEGRATION SYNC JOBS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_type text NOT NULL CHECK (integration_type IN ('mightycall_numbers', 'mightycall_reports', 'mightycall_recordings')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  records_processed int DEFAULT 0,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for integration_sync_jobs
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_org_id ON public.integration_sync_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_status ON public.integration_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_type ON public.integration_sync_jobs(integration_type);

-- RLS for integration_sync_jobs
ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_sync_jobs_admin_all" ON public.integration_sync_jobs;
DROP POLICY IF EXISTS "integration_sync_jobs_org_read" ON public.integration_sync_jobs;

CREATE POLICY "integration_sync_jobs_admin_all"
ON public.integration_sync_jobs
FOR ALL
USING (public.is_platform_admin());

CREATE POLICY "integration_sync_jobs_org_read"
ON public.integration_sync_jobs
FOR SELECT
USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

-- ==========================================
-- SUPPORT TICKETS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category text,
  assigned_to uuid REFERENCES auth.users(id),
  resolution text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_id ON public.support_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON public.support_tickets(assigned_to);

-- RLS for support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_user_own" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_org_admin" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin_all" ON public.support_tickets;

CREATE POLICY "support_tickets_user_own"
ON public.support_tickets
FOR ALL
USING (user_id = auth.uid());

CREATE POLICY "support_tickets_org_admin"
ON public.support_tickets
FOR ALL
USING (
  org_id IN (
    SELECT org_id FROM public.org_members
    WHERE user_id = auth.uid()
    AND role IN ('org_admin', 'org_owner', 'admin', 'owner')
  )
);

CREATE POLICY "support_tickets_admin_all"
ON public.support_tickets
FOR ALL
USING (public.is_platform_admin());

-- ==========================================
-- AUDIT LOGS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON public.audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin_all" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_org_admin" ON public.audit_logs;

CREATE POLICY "audit_logs_admin_all"
ON public.audit_logs
FOR ALL
USING (public.is_platform_admin());

CREATE POLICY "audit_logs_org_admin"
ON public.audit_logs
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.org_members
    WHERE user_id = auth.uid()
    AND role IN ('org_admin', 'org_owner', 'admin', 'owner')
  )
);

-- ==========================================
-- ORG SETTINGS TABLE (if not exists)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.org_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for org_settings
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_settings_member_read" ON public.org_settings;
DROP POLICY IF EXISTS "org_settings_admin_update" ON public.org_settings;

CREATE POLICY "org_settings_member_read"
ON public.org_settings
FOR SELECT
USING (public.is_org_member(org_id));

CREATE POLICY "org_settings_admin_update"
ON public.org_settings
FOR ALL
USING (public.is_org_admin(org_id));

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================

COMMENT ON TABLE public.integration_sync_jobs IS 'Tracks integration sync operations and their status';
COMMENT ON TABLE public.support_tickets IS 'Customer support tickets and their lifecycle';
COMMENT ON TABLE public.audit_logs IS 'Audit trail of important actions in the system';
COMMENT ON TABLE public.org_settings IS 'Organization-specific settings and configuration';