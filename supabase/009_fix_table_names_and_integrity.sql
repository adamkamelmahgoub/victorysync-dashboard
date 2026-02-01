-- Fix table name inconsistency and add DB integrity
-- This migration resolves the org_users vs org_members table name issue
-- and adds proper RLS policies and foreign key constraints

-- Step 1: Rename org_users to org_members if it exists (from old migrations)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'org_users') THEN
    -- Rename table
    ALTER TABLE public.org_users RENAME TO org_members;
    -- Rename indexes if they exist
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'org_users_org_id_user_id_idx') THEN
      ALTER INDEX public.org_users_org_id_user_id_idx RENAME TO org_members_org_id_user_id_idx;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'org_users_user_id_idx') THEN
      ALTER INDEX public.org_users_user_id_idx RENAME TO org_members_user_id_idx;
    END IF;
    RAISE NOTICE 'Renamed org_users to org_members';
  END IF;
END $$;

-- Step 2: Ensure org_members table exists with correct structure
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin', 'org_owner', 'owner', 'admin', 'member')),
  mightycall_extension text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.org_members(org_id, user_id);

-- Step 4: Enable RLS on org_members
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop old policies if they exist
DROP POLICY IF EXISTS "org_members_admin_all" ON public.org_members;
DROP POLICY IF EXISTS "org_members_org_read" ON public.org_members;
DROP POLICY IF EXISTS "org_users_admin_all" ON public.org_users;
DROP POLICY IF EXISTS "org_users_user_read" ON public.org_users;

-- Step 6: Create new RLS policies for org_members
CREATE POLICY "org_members_admin_all"
ON public.org_members
FOR ALL
USING (public.is_platform_admin());

CREATE POLICY "org_members_member_read"
ON public.org_members
FOR SELECT
USING (public.is_org_member(org_id));

-- Step 7: Ensure organizations table has RLS enabled
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Step 8: Drop old organizations policies if they exist
DROP POLICY IF EXISTS "organizations_member_read" ON public.organizations;
DROP POLICY IF EXISTS "organizations_admin_update" ON public.organizations;

-- Step 9: Create organizations RLS policies
CREATE POLICY "organizations_member_read"
ON public.organizations
FOR SELECT
USING (public.is_org_member(id));

CREATE POLICY "organizations_admin_all"
ON public.organizations
FOR ALL
USING (public.is_platform_admin());

-- Step 10: Update RLS functions to use org_members instead of org_users
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = $1 AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = $1 AND user_id = auth.uid() AND role IN ('org_owner', 'org_admin', 'admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Add foreign key constraints to ensure data integrity
-- Ensure all org_members have valid organizations
DELETE FROM public.org_members
WHERE org_id NOT IN (SELECT id FROM public.organizations);

-- Add FK constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'org_members_org_id_fkey'
  ) THEN
    ALTER TABLE public.org_members
    ADD CONSTRAINT org_members_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 12: Clean up any orphaned data
-- Remove org_members entries where user doesn't exist in auth.users
DELETE FROM public.org_members
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Step 13: Add helpful comments
COMMENT ON TABLE public.org_members IS 'Organization membership records with roles';
COMMENT ON COLUMN public.org_members.role IS 'Role: agent, org_manager, org_admin, org_owner, owner, admin, member';

-- Migration complete
SELECT 'Migration completed: Fixed table names, added RLS policies, and ensured data integrity' as status;