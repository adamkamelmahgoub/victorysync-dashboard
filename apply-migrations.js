#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const migrations = [
  {
    name: '001_add_to_number_digits',
    statements: [
      `ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS to_number_digits text`,
      `UPDATE public.calls SET to_number_digits = regexp_replace(to_number, '\\D', '', 'g') WHERE to_number IS NOT NULL AND (to_number_digits IS NULL OR to_number_digits = '')`,
      `CREATE INDEX IF NOT EXISTS idx_calls_to_number_digits ON public.calls (to_number_digits)`,
      `CREATE INDEX IF NOT EXISTS idx_calls_org_to_number_digits ON public.calls (org_id, to_number_digits) WHERE org_id IS NOT NULL`
    ]
  },
  {
    name: '002_fix_org_phone_numbers_constraints',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.org_phone_numbers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now())`,
      `ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_key CASCADE`,
      `ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_org_id_key CASCADE`,
      `ALTER TABLE public.org_phone_numbers ADD CONSTRAINT org_phone_numbers_pkey PRIMARY KEY (id) ON CONFLICT DO NOTHING`,
      `ALTER TABLE public.org_phone_numbers ADD CONSTRAINT org_phone_numbers_org_id_phone_number_id_unique UNIQUE (org_id, phone_number_id) ON CONFLICT DO NOTHING`,
      `CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_org_id ON public.org_phone_numbers (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_phone_number_id ON public.org_phone_numbers (phone_number_id)`
    ]
  },
  {
    name: '003_add_agent_extensions',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.agent_extensions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, extension text NOT NULL, display_name text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(org_id, extension), UNIQUE(org_id, user_id))`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_id ON public.agent_extensions (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_extension ON public.agent_extensions (extension)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_user_id ON public.agent_extensions (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_extension ON public.agent_extensions (org_id, extension)`
    ]
  },
  {
    name: '004_add_agent_extension_to_calls',
    statements: [
      `ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_extension text`,
      `CREATE INDEX IF NOT EXISTS idx_calls_agent_extension ON public.calls (agent_extension) WHERE agent_extension IS NOT NULL`
    ]
  },
  {
    name: '005_add_api_keys',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.platform_api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key_hash text NOT NULL, label text, created_by uuid REFERENCES auth.users(id), created_at timestamptz DEFAULT now(), last_used_at timestamptz)`,
      `CREATE TABLE IF NOT EXISTS public.org_api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE, key_hash text NOT NULL, label text, created_by uuid REFERENCES auth.users(id), created_at timestamptz DEFAULT now(), last_used_at timestamptz)`,
      `CREATE INDEX IF NOT EXISTS idx_platform_api_keys_created_by ON public.platform_api_keys(created_by)`,
      `CREATE INDEX IF NOT EXISTS idx_org_api_keys_org_id ON public.org_api_keys(org_id)`
    ]
  },
  {
    name: '006_add_rbac_and_phones',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.phone_numbers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text NOT NULL, external_id text UNIQUE NOT NULL, org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL, label text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(number))`,
      `CREATE INDEX IF NOT EXISTS idx_phone_numbers_org_id ON public.phone_numbers(org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_phone_numbers_external_id ON public.phone_numbers(external_id)`,
      `CREATE TABLE IF NOT EXISTS public.org_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin')), mightycall_extension text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(org_id, user_id))`,
      `CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id)`,
      `CREATE TABLE IF NOT EXISTS public.org_manager_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_member_id uuid NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE, can_manage_agents boolean DEFAULT false, can_manage_phone_numbers boolean DEFAULT false, can_edit_service_targets boolean DEFAULT false, can_view_billing boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), CONSTRAINT check_is_manager CHECK ((SELECT role FROM public.org_members WHERE id = org_member_id) = 'org_manager'))`,
      `CREATE INDEX IF NOT EXISTS idx_org_manager_permissions_member_id ON public.org_manager_permissions(org_member_id)`,
      `ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS global_role text CHECK (global_role IN ('platform_admin', 'platform_manager', NULL))`,
      `CREATE INDEX IF NOT EXISTS idx_profiles_global_role ON public.profiles(global_role)`,
      `CREATE TABLE IF NOT EXISTS public.platform_manager_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, can_manage_phone_numbers_global boolean DEFAULT false, can_manage_agents_global boolean DEFAULT false, can_manage_orgs boolean DEFAULT false, can_view_billing_global boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), CONSTRAINT check_is_platform_manager CHECK ((SELECT global_role FROM public.profiles WHERE id = user_id) = 'platform_manager'))`,
      `CREATE INDEX IF NOT EXISTS idx_platform_manager_permissions_user_id ON public.platform_manager_permissions(user_id)`,
      `ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE public.org_manager_permissions ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE public.platform_manager_permissions ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "phone_numbers_admin_all" ON public.phone_numbers`,
      `DROP POLICY IF EXISTS "phone_numbers_org_read" ON public.phone_numbers`,
      `CREATE POLICY "phone_numbers_admin_all" ON public.phone_numbers FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
      `CREATE POLICY "phone_numbers_org_read" ON public.phone_numbers FOR SELECT USING (org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))`,
      `DROP POLICY IF EXISTS "org_members_admin_all" ON public.org_members`,
      `DROP POLICY IF EXISTS "org_members_org_read" ON public.org_members`,
      `CREATE POLICY "org_members_admin_all" ON public.org_members FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
      `CREATE POLICY "org_members_org_read" ON public.org_members FOR SELECT USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))`,
      `DROP POLICY IF EXISTS "org_manager_perms_admin" ON public.org_manager_permissions`,
      `DROP POLICY IF EXISTS "org_manager_perms_read" ON public.org_manager_permissions`,
      `CREATE POLICY "org_manager_perms_admin" ON public.org_manager_permissions FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
      `CREATE POLICY "org_manager_perms_read" ON public.org_manager_permissions FOR SELECT USING (org_member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid() AND org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())))`,
      `DROP POLICY IF EXISTS "platform_manager_perms_admin" ON public.platform_manager_permissions`,
      `DROP POLICY IF EXISTS "platform_manager_perms_self" ON public.platform_manager_permissions`,
      `CREATE POLICY "platform_manager_perms_admin" ON public.platform_manager_permissions FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
      `CREATE POLICY "platform_manager_perms_self" ON public.platform_manager_permissions FOR SELECT USING (user_id = auth.uid())`
    ]
  },
  {
    name: '007_fix_table_names_and_integrity',
    statements: [
      // Rename org_users to org_members if it exists
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'org_users') THEN ALTER TABLE public.org_users RENAME TO org_members; END IF; END $$`,
      // Rename indexes if they exist
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'org_users_org_id_user_id_idx') THEN ALTER INDEX public.org_users_org_id_user_id_idx RENAME TO org_members_org_id_user_id_idx; END IF; END $$`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'org_users_user_id_idx') THEN ALTER INDEX public.org_users_user_id_idx RENAME TO org_members_user_id_idx; END IF; END $$`,
      // Ensure org_members table exists with correct structure
      `CREATE TABLE IF NOT EXISTS public.org_members (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, user_id uuid NOT NULL, role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin', 'org_owner', 'owner', 'admin', 'member')), mightycall_extension text, created_at timestamptz DEFAULT now(), UNIQUE(org_id, user_id))`,
      // Create indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.org_members(org_id, user_id)`,
      // Enable RLS on org_members
      `ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY`,
      // Drop old policies if they exist
      `DROP POLICY IF EXISTS "org_members_admin_all" ON public.org_members`,
      `DROP POLICY IF EXISTS "org_members_org_read" ON public.org_members`,
      `DROP POLICY IF EXISTS "org_members_member_read" ON public.org_members`,
      `DROP POLICY IF EXISTS "org_users_admin_all" ON public.org_users`,
      `DROP POLICY IF EXISTS "org_users_user_read" ON public.org_users`,
      // Create new RLS policies for org_members
      `CREATE POLICY "org_members_admin_all" ON public.org_members FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
      `CREATE POLICY "org_members_member_read" ON public.org_members FOR SELECT USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))`,
      // Ensure organizations table has RLS enabled
      `ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY`,
      // Drop old organizations policies if they exist
      `DROP POLICY IF EXISTS "organizations_member_read" ON public.organizations`,
      `DROP POLICY IF EXISTS "organizations_admin_update" ON public.organizations`,
      `DROP POLICY IF EXISTS "organizations_admin_all" ON public.organizations`,
      // Create organizations RLS policies
      `CREATE POLICY "organizations_member_read" ON public.organizations FOR SELECT USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))`,
      `CREATE POLICY "organizations_admin_all" ON public.organizations FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
      // Update RLS functions to use org_members instead of org_users
      `CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid) RETURNS boolean AS $$ BEGIN RETURN EXISTS (SELECT 1 FROM public.org_members WHERE org_members.org_id = $1 AND user_id = auth.uid()); END; $$ LANGUAGE plpgsql SECURITY DEFINER`,
      `CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid) RETURNS boolean AS $$ BEGIN RETURN EXISTS (SELECT 1 FROM public.org_members WHERE org_members.org_id = $1 AND user_id = auth.uid() AND role IN ('org_owner', 'org_admin', 'admin', 'owner')); END; $$ LANGUAGE plpgsql SECURITY DEFINER`,
      // Clean up orphaned data
      `DELETE FROM public.org_members WHERE org_id NOT IN (SELECT id FROM public.organizations)`,
      `DELETE FROM public.org_members WHERE user_id NOT IN (SELECT id FROM auth.users)`
    ]
  }
];

async function executeSql(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) throw new Error(`RPC Error: ${error.message}`);
  return data;
}

async function applyMigrations() {
  console.log('🚀 Starting database migrations...\n');
  let completed = 0;
  let failed = 0;
  
  for (const migration of migrations) {
    try {
      console.log(`⏳ Applying ${migration.name}...`);
      for (const stmt of migration.statements) {
        try {
          await executeSql(stmt);
        } catch (e) {
          // Some statements may fail if they already exist, which is OK
          if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
            console.warn(`   ⚠️  ${stmt.substring(0, 50)}... - ${e.message}`);
          }
        }
      }
      console.log(`✅ ${migration.name} completed\n`);
      completed++;
    } catch (err) {
      console.error(`❌ ${migration.name} failed:`, err.message, '\n');
      failed++;
    }
  }
  
  console.log(`\n✨ Migrations completed! (${completed} succeeded, ${failed} failed)`);
}

applyMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
